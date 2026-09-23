import { supabase } from "../config/supabaseConfig";

export type Team = {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  createdAt: string;
};

export type TeamRecord = {
  id: string;
  name: string;
  inviteCode: string;
};

// A team the current user belongs to (either as Owner or as a Member),
// including the role the user holds within that team.
export type UserTeam = {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  createdAt: string;
  role: string;
};

// A single member of a team, as returned by the `team_member_directory`
// function (see supabase/schema.sql) which also resolves the profile details
// stored on the auth user.
export type TeamMemberProfile = {
  userId: string;
  role: string;
  status: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  joinedAt: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  created_at: string;
};

type TeamMemberDirectoryRow = {
  user_id: string;
  role: string | null;
  status: string | null;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  joined_at: string | null;
};

// Omit visually ambiguous characters (0/O, 1/I/L) so invite codes are easy
// to read and retype when sharing.
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 6;

function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * INVITE_CODE_ALPHABET.length);
    code += INVITE_CODE_ALPHABET[randomIndex];
  }
  return code;
}

function mapTeamRow(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

// Creates a team owned by `userId` and adds the user as an Owner member.
// The invite code is generated client-side and retried if it collides.
export async function createTeam(
  userId: string,
  name: string,
): Promise<TeamRecord> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Team name is required.");

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("teams")
      .insert({
        name: trimmedName,
        invite_code: generateInviteCode(),
        owner_id: userId,
      })
      .select("id, name, invite_code")
      .single();

    if (error) {
      // Unique violation (23505) on invite_code -> try a fresh code.
      if (error.code === "23505") continue;
      throw error;
    }

    const team = data as unknown as Pick<TeamRow, "id" | "name" | "invite_code">;

    const { error: memberError } = await supabase.from("team_members").insert({
      team_id: team.id,
      user_id: userId,
      role: "Owner",
      status: "active",
    });

    if (memberError) {
      // Avoid leaving an orphaned team behind.
      await supabase.from("teams").delete().eq("id", team.id);
      throw memberError;
    }

    return { id: team.id, name: team.name, inviteCode: team.invite_code };
  }

  throw new Error("Could not generate a unique invite code. Please try again.");
}

// Adds a user to an existing team matched by invite code.
export async function joinTeamByCode(
  userId: string,
  inviteCode: string,
): Promise<TeamRecord> {
  const { data: team, error } = await supabase
    .from("teams")
    .select("id, name, invite_code")
    .eq("invite_code", inviteCode.trim().toUpperCase())
    .maybeSingle();

  if (error) throw error;
  if (!team) {
    throw new Error(
      "No team found with that invite code. Please verify and try again.",
    );
  }

  const { error: memberError } = await supabase.from("team_members").insert({
    team_id: team.id,
    user_id: userId,
    role: "Member",
    status: "active",
  });

  // 23505 means the user is already a member - that's fine.
  if (memberError && memberError.code !== "23505") throw memberError;

  return { id: team.id, name: team.name, inviteCode: team.invite_code };
}

// Lists the teams owned by a user, oldest first.
export async function getOwnedTeams(userId: string): Promise<Team[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, invite_code, owner_id, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (
    (data as unknown as TeamRow[] | null | undefined)?.map(mapTeamRow) ?? []
  );
}

// Lists EVERY team a user belongs to (as Owner or as Member), oldest first.
// Uses the team_members join table so teams the user merely joined via an
// invite code show up too, not just the ones they own.
export async function getUserTeams(userId: string): Promise<UserTeam[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("role, teams(id, name, invite_code, owner_id, created_at)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true });

  if (error) throw error;

  type MembershipRow = {
    role: string;
    teams: TeamRow | null;
  };

  return ((data as unknown as MembershipRow[] | null | undefined) ?? [])
    .filter((row): row is MembershipRow & { teams: TeamRow } => !!row.teams)
    .map((row) => ({
      id: row.teams.id,
      name: row.teams.name,
      inviteCode: row.teams.invite_code,
      ownerId: row.teams.owner_id,
      createdAt: row.teams.created_at,
      role: row.role,
    }));
}

// Lists every member of a single team together with their profile details.
// The list is resolved by the `team_member_directory` SQL function defined in
// supabase/schema.sql: it runs with elevated rights (so it can read the auth
// user metadata) but returns rows only when the caller is a member of the team.
export async function getTeamMembers(
  teamId: string,
): Promise<TeamMemberProfile[]> {
  const { data, error } = await supabase.rpc("team_member_directory", {
    p_team_id: teamId,
  });

  if (error) throw error;

  return (
    (data as unknown as TeamMemberDirectoryRow[] | null | undefined) ?? []
  ).map((row) => ({
    userId: row.user_id,
    role: row.role || "Member",
    status: row.status || "active",
    displayName: row.display_name || "Team member",
    email: row.email,
    avatarUrl: row.avatar_url,
    joinedAt: row.joined_at,
  }));
}

// Deletes a team (memberships are removed via ON DELETE CASCADE).
export async function deleteTeam(teamId: string): Promise<void> {
  const { error } = await supabase.from("teams").delete().eq("id", teamId);
  if (error) throw error;
}