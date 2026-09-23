-- 1. Create the teams table
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- 2. Create the team_members table (Fixes missing relation error)
create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member',
  joined_at  timestamptz not null default now(),
  unique(team_id, user_id)
);

-- The app writes a membership/invitation status (e.g. 'active').
-- ALTER ... IF NOT EXISTS keeps this idempotent for existing databases.
alter table public.team_members
  add column if not exists status text not null default 'active';

-- 3. Create Indexes
create index if not exists teams_owner_id_idx on public.teams (owner_id);
create index if not exists team_members_team_id_idx on public.team_members (team_id);
create index if not exists team_members_user_id_idx on public.team_members (user_id);

-- 4. Enable RLS
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- 4.5 Helper functions to break the mutual teams <-> team_members policy cycle.
-- A policy that directly sub-queries the other table triggers PostgreSQL's
-- "infinite recursion detected in policy" error. These SECURITY DEFINER helpers
-- run as the table owner (bypassing RLS) and are called from policies instead,
-- so membership/ownership checks never recurse.
create or replace function public.is_team_member(team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_members
    where team_id = $1 and user_id = auth.uid()
  );
$$;

create or replace function public.is_team_owner(team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.teams
    where id = $1 and owner_id = auth.uid()
  );
$$;

revoke execute on function public.is_team_member(uuid) from public;
grant execute on function public.is_team_member(uuid) to authenticated;
revoke execute on function public.is_team_owner(uuid) from public;
grant execute on function public.is_team_owner(uuid) to authenticated;

-- 5. Policies for TEAMS
drop policy if exists "Team owners can create teams" on public.teams;
create policy "Team owners can create teams" on public.teams
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Members can view teams they own or belong to" on public.teams;
create policy "Members can view teams they own or belong to" on public.teams
  for select to authenticated
  using (
    owner_id = auth.uid() or
    public.is_team_member(id)
  );

-- Allow team owners to clean up (e.g. deleting a team whose member insert failed).
drop policy if exists "Team owners can delete teams" on public.teams;
create policy "Team owners can delete teams" on public.teams
  for delete to authenticated
  using (owner_id = auth.uid());

-- 6. Policies for TEAM_MEMBERS
drop policy if exists "Members can view team members" on public.team_members;
create policy "Members can view team members" on public.team_members
  for select to authenticated
  using (
    user_id = auth.uid() or
    public.is_team_owner(team_id)
  );

-- Allow a user to add themselves to a team. This covers both creating a team
-- (the owner inserts their own "Owner" membership) and joining via invite code
-- (the invite code is the bearer credential that gates access).
drop policy if exists "Members can join teams" on public.team_members;
create policy "Members can join teams" on public.team_members
  for insert to authenticated
  with check (user_id = auth.uid());

-- 7. Member directory -------------------------------------------------------
-- The Team tab lists every group the user belongs to and, inside each group,
-- all of its members. That needs two things:
--   a) every member of a team (not just the owner) may read that team's
--      membership rows, and
--   b) display names / avatars for those rows, which live in auth.users and are
--      therefore not reachable from the client.
-- Re-running this file is safe: the policy is dropped/recreated and the
-- function is replaced.

drop policy if exists "Members can view team members" on public.team_members;
create policy "Members can view team members" on public.team_members
  for select to authenticated
  using (
    user_id = auth.uid() or
    public.is_team_member(team_id)
  );

-- Resolves the members of a team together with their profile details. The
-- function runs as its owner (SECURITY DEFINER) so it can join auth.users, and
-- it returns nothing unless the caller is a member of the requested team.
create or replace function public.team_member_directory(p_team_id uuid)
returns table (
  user_id      uuid,
  role         text,
  status       text,
  display_name text,
  email        text,
  avatar_url   text,
  joined_at    timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    tm.user_id,
    tm.role,
    tm.status,
    coalesce(
      nullif(u.raw_user_meta_data ->> 'displayName', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(split_part(u.email, '@', 1), ''),
      'Team member'
    ) as display_name,
    u.email,
    nullif(u.raw_user_meta_data ->> 'avatar_url', '') as avatar_url,
    tm.joined_at
  from public.team_members tm
  join auth.users u on u.id = tm.user_id
  where tm.team_id = p_team_id
    and public.is_team_member(p_team_id)
  order by
    case when tm.role = 'Owner' then 0 else 1 end,
    tm.joined_at asc;
$$;

-- 8. Team-scoped tasks --------------------------------------------------------
-- Choosing a team filters every task surface (Home, Tasks, Calendar, Stats,
-- notifications) to that team's rows. Existing rows keep team_id NULL and stay
-- visible everywhere so nothing disappears after this migration.
alter table public.tasks
  add column if not exists team_id uuid references public.teams(id) on delete cascade;

create index if not exists tasks_team_id_idx on public.tasks (team_id);
create index if not exists tasks_owner_team_idx on public.tasks (owner_id, team_id);

revoke execute on function public.team_member_directory(uuid) from public;
grant execute on function public.team_member_directory(uuid) to authenticated;
