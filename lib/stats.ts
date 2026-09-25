/**
 * Shared statistics layer - the single source of truth for every aggregate the
 * app displays.
 *
 * The Home counters, the Statistics tab, the Calendar load, the task health
 * badges and the notification feed all read their numbers from here, so one
 * task always produces the same "overdue" / "due soon" / "success rate" value
 * no matter which screen you are looking at.
 *
 * Everything in this module is a pure function: hand it the rows already loaded
 * by `lib/tasks` (and the members coming from `lib/teams`) and get plain objects
 * back. No React, no Supabase, no side effects - screens stay free to decide how
 * they render the result.
 */
import type { Priority, Task, TaskStatus } from "./tasks";

export const TASK_STATUSES: TaskStatus[] = [
  "To Do",
  "In Progress",
  "Review",
  "Done",
];

export const TASK_PRIORITIES: Priority[] = ["High", "Medium", "Low"];

export const STATUS_COLORS: Record<TaskStatus, string> = {
  "To Do": "#A5ADBA",
  "In Progress": "#4C51BF",
  Review: "#D97706",
  Done: "#319795",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  High: "#ED8936",
  Medium: "#ECC94B",
  Low: "#48BB78",
};

export const UNASSIGNED = "Unassigned";

/** A task counts as "due soon" from this many days before its due date. */
export const DUE_SOON_DAYS = 2;
/** Width of the "due this week" window used by the deadline buckets. */
export const DUE_THIS_WEEK_DAYS = 7;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export type TrendPoint = { date: string; value: number };
export type ChartSlice = { name: string; value: number; color: string };
export type TaskHealth = { label: string; color: string; background: string };

export type DeadlineBuckets = {
  overdue: Task[];
  today: Task[];
  thisWeek: Task[];
  later: Task[];
  noDueDate: Task[];
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

// Due dates are stored as "YYYY-MM-DD"; normalize defensively (ISO timestamps,
// locale strings, legacy "M/D/YYYY") to "YYYY-MM-DD" so every screen matches the
// same day. Returns "" when there is nothing usable to parse.
export function normalizeDueDate(value: string | undefined | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local midnight of the given moment — the day granularity the stats compare on. */
export function startOfDay(date: Date = new Date()): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Local midnight of a task's due date, or null when the date is unusable. */
export function dueDayStart(task: Pick<Task, "dueDate">): number | null {
  const key = normalizeDueDate(task.dueDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  // Built from parts so the result is local midnight of the stored calendar day.
  const time = new Date(year, month - 1, day).setHours(0, 0, 0, 0);
  return Number.isNaN(time) ? null : time;
}

/** Timestamp of the last moment of a task's due date, or null when unusable. */
export function dueDateTime(task: Pick<Task, "dueDate">): number | null {
  const key = normalizeDueDate(task.dueDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const time = new Date(`${key}T23:59:59`).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Whole calendar days between today and the due date: `0` means due today and a
 * negative value means overdue. The comparison happens at day granularity, so a
 * task due yesterday is already overdue while one due today is not. (The inline
 * implementation this replaced compared against the *end* of the due day, which
 * kept a task due yesterday looking "healthy" for another whole day.)
 */
export function daysUntilDue(
  task: Pick<Task, "dueDate">,
  now: Date = new Date(),
): number | null {
  const due = dueDayStart(task);
  if (due === null) return null;
  // Rounding absorbs DST days (23h / 25h) so the result stays a whole day count.
  return Math.round((due - startOfDay(now).getTime()) / MS_PER_DAY);
}

export function isTaskDone(task: Pick<Task, "status">): boolean {
  return task.status === "Done";
}

/** Open task whose due date has already passed. */
export function isTaskOverdue(task: Task, now: Date = new Date()): boolean {
  if (isTaskDone(task)) return false;
  const days = daysUntilDue(task, now);
  return days !== null && days < 0;
}

/** Open task due within `withinDays` days (today included). */
export function isTaskDueSoon(
  task: Task,
  withinDays: number = DUE_SOON_DAYS,
  now: Date = new Date(),
): boolean {
  if (isTaskDone(task)) return false;
  const days = daysUntilDue(task, now);
  return days !== null && days >= 0 && days <= withinDays;
}

/**
 * Health badge shared by the Tasks board, the Stats tab and notifications, so a
 * task flagged "Due soon" in one place is flagged the same way everywhere.
 */
export function getTaskHealth(task: Task, now: Date = new Date()): TaskHealth {
  if (isTaskDone(task)) {
    return { label: "Healthy", color: "#16A34A", background: "#ECFDF3" };
  }

  if (!task.dueDate) {
    return { label: "No deadline", color: "#64748B", background: "#F1F5F9" };
  }

  const days = daysUntilDue(task, now);

  if (days !== null && days < 0) {
    return { label: "Overdue", color: "#E11D48", background: "#FFF1F2" };
  }

  if (days !== null && days <= DUE_SOON_DAYS) {
    return { label: "Due soon", color: "#D97706", background: "#FFFBEB" };
  }

  return { label: "Healthy", color: "#16A34A", background: "#ECFDF3" };
}

/** Monday-based start of the week containing `date`. */
export function startOfWeek(date: Date = new Date()): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() - ((day + 6) % 7));
  return start;
}

/** "Sep 8" - short axis label used by the trend chart. */
export function formatShortDate(date: Date): string {
  return date.toLocaleString("default", { month: "short", day: "numeric" });
}

/** "Sep 8, 2026" - long label used by the deadline list. */
export function formatLongDate(value: string | undefined | null): string {
  const key = normalizeDueDate(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return value?.trim() || "No date";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("default", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "25/09/2026" - day/month/year label used by the app's date displays. */
export function formatDisplayDate(value: string | undefined | null): string {
  const key = normalizeDueDate(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return value?.trim() || "";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

/** Today as "YYYY-MM-DD" (the storage format used by `tasks.due_date`). */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Task aggregates
// ---------------------------------------------------------------------------

export function getCompletedTasks(tasks: Task[]): Task[] {
  return tasks.filter(isTaskDone);
}

export function getOpenTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => !isTaskDone(task));
}

export function getOverdueTasks(tasks: Task[], now: Date = new Date()): Task[] {
  return tasks.filter((task) => isTaskOverdue(task, now));
}

export function getDueSoonTasks(
  tasks: Task[],
  withinDays: number = DUE_SOON_DAYS,
  now: Date = new Date(),
): Task[] {
  return tasks.filter((task) => isTaskDueSoon(task, withinDays, now));
}

/** Open tasks that have a due date, soonest first (optionally limited). */
export function getUpcomingTasks(tasks: Task[], limit?: number): Task[] {
  const upcoming = tasks
    .filter(
      (task) => !isTaskDone(task) && normalizeDueDate(task.dueDate) !== "",
    )
    .sort((left, right) =>
      normalizeDueDate(left.dueDate).localeCompare(
        normalizeDueDate(right.dueDate),
      ),
    );

  return typeof limit === "number" ? upcoming.slice(0, limit) : upcoming;
}

export function getStatusCounts(tasks: Task[]): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = {
    "To Do": 0,
    "In Progress": 0,
    Review: 0,
    Done: 0,
  };

  tasks.forEach((task) => {
    if (task.status in counts) counts[task.status] += 1;
  });

  return counts;
}

export function getPriorityCounts(tasks: Task[]): Record<Priority, number> {
  const counts: Record<Priority, number> = { High: 0, Medium: 0, Low: 0 };

  tasks.forEach((task) => {
    if (task.priority in counts) counts[task.priority] += 1;
  });

  return counts;
}

/** Subtask roll-up used by the Stats tab ("x of y subtasks done"). */
export function getSubtaskTotals(tasks: Task[]): {
  completed: number;
  total: number;
  rate: number;
} {
  let completed = 0;
  let total = 0;

  tasks.forEach((task) => {
    (task.subtasks ?? []).forEach((subtask) => {
      total += 1;
      if (subtask.completed) completed += 1;
    });
  });

  return {
    completed,
    total,
    rate: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/** Success rate (0-100). Empty task lists report 0 instead of NaN. */
export function getCompletionRate(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  return Math.round((getCompletedTasks(tasks).length / tasks.length) * 100);
}

/**
 * Average number of days between a task being created and its due date, using
 * completed tasks only. `tasks` has no completion timestamp, so the due date is
 * the closest available proxy. Returns null when nothing can be measured.
 */
export function getAverageCycleDays(tasks: Task[]): number | null {
  const durations = getCompletedTasks(tasks)
    .map((task) => {
      const due = dueDayStart(task);
      const created = task.createdAt ? new Date(task.createdAt).getTime() : NaN;
      if (due === null || Number.isNaN(created)) return null;
      return Math.max(0, (due - created) / MS_PER_DAY);
    })
    .filter((value): value is number => value !== null);

  if (durations.length === 0) return null;

  const average =
    durations.reduce((sum, value) => sum + value, 0) / durations.length;
  return Math.round(average * 10) / 10;
}

// ---------------------------------------------------------------------------
// Chart & bucket builders (hand the result straight to the chart components)
// ---------------------------------------------------------------------------

export function buildStatusDistribution(tasks: Task[]): ChartSlice[] {
  const counts = getStatusCounts(tasks);
  return TASK_STATUSES.map((status) => ({
    name: status === "Done" ? "Completed" : status,
    value: counts[status],
    color: STATUS_COLORS[status],
  }));
}

export function buildPriorityBreakdown(tasks: Task[]): ChartSlice[] {
  const counts = getPriorityCounts(tasks);
  return TASK_PRIORITIES.map((priority) => ({
    name: priority,
    value: counts[priority],
    color: PRIORITY_COLORS[priority],
  }));
}

/**
 * Completed tasks per week for the last `weeks` weeks, bucketed by due date
 * (the only date the tasks table carries). Labels are real calendar dates, so
 * the trend line always describes the current period.
 */
export function buildWeeklyTrend(
  tasks: Task[],
  weeks = 6,
  now: Date = new Date(),
): TrendPoint[] {
  const firstWeek = startOfWeek(now);
  const buckets = Array.from({ length: weeks }, (_, index) => {
    const start = new Date(firstWeek);
    start.setDate(start.getDate() - (weeks - 1 - index) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start: start.getTime(), end: end.getTime(), value: 0, date: formatShortDate(start) };
  });

  getCompletedTasks(tasks).forEach((task) => {
    const due = dueDateTime(task);
    if (due === null) return;
    const bucket = buckets.find(
      (candidate) => due >= candidate.start && due < candidate.end,
    );
    if (bucket) bucket.value += 1;
  });

  return buckets.map(({ date, value }) => ({ date, value }));
}

/**
 * Splits the open workload by deadline so the Stats tab, Calendar and
 * notifications all agree on what is overdue / due today / due this week.
 */
export function buildDeadlineBuckets(
  tasks: Task[],
  now: Date = new Date(),
): DeadlineBuckets {
  const buckets: DeadlineBuckets = {
    overdue: [],
    today: [],
    thisWeek: [],
    later: [],
    noDueDate: [],
  };

  getOpenTasks(tasks).forEach((task) => {
    const days = daysUntilDue(task, now);

    if (days === null) {
      buckets.noDueDate.push(task);
    } else if (days < 0) {
      buckets.overdue.push(task);
    } else if (days === 0) {
      buckets.today.push(task);
    } else if (days <= DUE_THIS_WEEK_DAYS) {
      buckets.thisWeek.push(task);
    } else {
      buckets.later.push(task);
    }
  });

  return buckets;
}

/** Tasks due in the current calendar week (Mon-Sun), any status. */
export function getTasksDueThisWeek(
  tasks: Task[],
  now: Date = new Date(),
): Task[] {
  const firstDay = startOfWeek(now).getTime();
  const lastDay = firstDay + DUE_THIS_WEEK_DAYS * MS_PER_DAY;

  return tasks.filter((task) => {
    const due = dueDateTime(task);
    return due !== null && due >= firstDay && due <= lastDay;
  });
}

// ---------------------------------------------------------------------------
// People & workspace aggregates
//
// These connect the Team tab (groups + members) to the numbers every other
// screen shows. The shapes below are structural, so `UserTeam[]` from
// `lib/teams` and `TeamMemberProfile[]` can be passed in as-is.
// ---------------------------------------------------------------------------

export type GroupLike = {
  id: string;
  name: string;
  role: string;
  createdAt?: string;
};

export type DirectoryMember = {
  userId: string;
  displayName: string;
  email?: string | null;
  role?: string;
};

export type Person = {
  id: string;
  name: string;
  email?: string | null;
  role: string;
  /** How many of the user's groups this person belongs to. */
  groupCount: number;
};

export type MemberStat = Person & {
  total: number;
  done: number;
  overdue: number;
  /** Share of this member's tasks that are done (0-100). */
  rate: number;
};

export type GroupStat = {
  id: string;
  name: string;
  role: string;
  memberCount: number;
  isActive: boolean;
  createdAt: string | null;
};

export type WorkspaceOverview = {
  groups: number;
  members: number;
  tasks: number;
  tasksDone: number;
  open: number;
  overdue: number;
  dueThisWeek: number;
  completionRate: number;
  subtasks: { completed: number; total: number; rate: number };
};

/**
 * Flattens the per-group member lists into one directory. People who belong to
 * several groups are counted once and keep the strongest role they hold.
 */
export function getUniqueMembers(
  membersByTeamId: Record<string, DirectoryMember[]>,
): Person[] {
  const people = new Map<string, Person>();

  Object.values(membersByTeamId).forEach((members) => {
    (members ?? []).forEach((member) => {
      const existing = people.get(member.userId);

      if (!existing) {
        people.set(member.userId, {
          id: member.userId,
          name: member.displayName || "Team member",
          email: member.email ?? null,
          role: member.role || "Member",
          groupCount: 1,
        });
        return;
      }

      existing.groupCount += 1;
      if (existing.role !== "Owner" && member.role === "Owner") {
        existing.role = "Owner";
      }
    });
  });

  return Array.from(people.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

/** One row per group the user belongs to, with its real member count. */
export function buildGroupStats(
  groups: GroupLike[],
  membersByTeamId: Record<string, DirectoryMember[]>,
  activeTeamId?: string | null,
): GroupStat[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    role: group.role || "Member",
    memberCount: (membersByTeamId[group.id] ?? []).length,
    isActive: group.id === activeTeamId,
    createdAt: group.createdAt ?? null,
  }));
}

export type CurrentUserLike = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

function assigneeKeys(person: {
  name?: string | null;
  email?: string | null;
}): string[] {
  const keys: string[] = [];
  const name = person.name?.trim().toLowerCase();
  if (name) keys.push(name);

  const email = person.email?.trim().toLowerCase();
  if (email) {
    keys.push(email);
    const prefix = email.split("@")[0];
    if (prefix) keys.push(prefix);
  }

  return keys;
}

/**
 * Per-person workload for the member list on the Stats tab.
 *
 * Tasks are attributed through the free-text `assignee` field, which the Tasks
 * screen fills with either a display name or an email, so both are matched
 * case-insensitively. An assignee that matches nobody in the directory still
 * gets a row so no work is hidden, and the signed-in user is always present.
 */
export function buildMemberStats(
  tasks: Task[],
  members: Person[] = [],
  currentUser?: CurrentUserLike | null,
  now: Date = new Date(),
): MemberStat[] {
  const stats = new Map<string, MemberStat>();
  const lookup = new Map<string, Person>();

  const register = (person: Person): MemberStat => {
    const existing = stats.get(person.id);
    if (existing) return existing;

    const created: MemberStat = {
      ...person,
      total: 0,
      done: 0,
      overdue: 0,
      rate: 0,
    };
    stats.set(person.id, created);
    return created;
  };

  members.forEach((person) => {
    register(person);
    assigneeKeys(person).forEach((key) => {
      if (!lookup.has(key)) lookup.set(key, person);
    });
  });

  const selfName =
    currentUser?.name?.trim() ||
    currentUser?.email?.split("@")[0]?.trim() ||
    "You";
  const selfId = currentUser?.id || `self:${currentUser?.email ?? selfName}`;

  if ((currentUser?.name || currentUser?.email) && !stats.has(selfId)) {
    const self: Person = {
      id: selfId,
      name: selfName,
      email: currentUser?.email ?? null,
      role: currentUser?.role || "Member",
      groupCount: 0,
    };
    register(self);
    assigneeKeys(self).forEach((key) => {
      if (!lookup.has(key)) lookup.set(key, self);
    });
  }

  tasks.forEach((task) => {
    const assignee = task.assignee?.trim();
    if (!assignee || assignee === UNASSIGNED) return;

    const key = assignee.toLowerCase();
    let owner = lookup.get(key);

    if (!owner) {
      owner = {
        id: `assignee:${key}`,
        name: assignee,
        email: null,
        role: "Member",
        groupCount: 0,
      };
      lookup.set(key, owner);
    }

    const stat = register(owner);
    stat.total += 1;
    if (isTaskDone(task)) stat.done += 1;
    else if (isTaskOverdue(task, now)) stat.overdue += 1;
  });

  return Array.from(stats.values())
    .map((stat) => ({
      ...stat,
      rate:
        stat.total > 0 ? Math.round((stat.done / stat.total) * 100) : 0,
    }))
    .sort(
      (left, right) =>
        right.rate - left.rate ||
        right.total - left.total ||
        left.name.localeCompare(right.name),
    );
}

/**
 * Every headline number the app shows, computed once from the same sources the
 * individual screens use (tasks + the groups/members of the Team tab).
 */
export function buildWorkspaceOverview(
  tasks: Task[],
  groups: GroupStat[],
  members: Person[],
  now: Date = new Date(),
): WorkspaceOverview {
  return {
    groups: groups.length,
    members: members.length,
    tasks: tasks.length,
    tasksDone: getCompletedTasks(tasks).length,
    open: getOpenTasks(tasks).length,
    overdue: getOverdueTasks(tasks, now).length,
    dueThisWeek: getTasksDueThisWeek(tasks, now).length,
    completionRate: getCompletionRate(tasks),
    subtasks: getSubtaskTotals(tasks),
  };
}