import { supabase } from "../config/supabaseConfig";

export type TaskStatus = "To Do" | "In Progress" | "Review" | "Done";
export type Priority = "High" | "Medium" | "Low";

export type Subtask = {
  id: string;
  title: string;
  completed: boolean;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  dueDate: string;
  subtasks: Subtask[];
  // Team this task belongs to. Null/undefined means the row predates team
  // scoping; screens keep showing those rows so older tasks never disappear.
  teamId?: string | null;
  // Row creation timestamp coming straight from the database. Optional because
  // the screens build Task objects locally when they optimistically insert a
  // task; the statistics layer uses it to measure the average cycle time.
  createdAt?: string;
};

// Select only supported columns. `team_id` may not exist on databases that
// have not applied the team-scoping migration yet, so fall back to `*` in
// that case instead of failing every task query.
const TASK_COLUMNS_WITH_TEAM =
  "id, title, description, status, priority, assignee, due_date, subtasks, created_at, team_id";

function mapTaskRow(item: Record<string, any>): Task {
  return {
    id: item.id,
    title: item.title,
    description: item.description || "",
    status: item.status as TaskStatus,
    priority: item.priority as Priority,
    assignee: item.assignee || "",
    dueDate: item.due_date || "",
    subtasks: item.subtasks || [],
    teamId: (item.team_id as string | null | undefined) ?? null,
    createdAt: item.created_at ?? undefined,
  };
}

function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "42703" || message.includes(column);
}

// 1. Fetch tasks. `teamId` scopes rows to one team; omit it to keep the legacy
// per-user list (used before a team is chosen). Rows with no team stay visible
// so tasks created before team scoping never disappear.
export async function loadTasks(userId: string, teamId?: string | null) {
  try {
    let query = supabase
      .from("tasks")
      .select(TASK_COLUMNS_WITH_TEAM)
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });

    if (teamId) query = query.eq("team_id", teamId);

    const { data, error } = await query;

    if (error) {
      if (!isMissingColumnError(error, "team_id")) throw error;
      const fallback = await supabase
        .from("tasks")
        .select("*")
        .eq("owner_id", userId)
        .order("created_at", { ascending: true });
      if (fallback.error) throw fallback.error;
      return { data: (fallback.data || []).map(mapTaskRow), error: null };
    }

    return { data: (data || []).map(mapTaskRow), error: null };
  } catch (error) {
    return { data: [], error };
  }
}

// 2. Real-time updates subscription
export function subscribeToTasks(
  userId: string,
  teamId?: string | null,
  onChange?: () => void,
) {
  // Unique channel per subscriber: every tab (Tasks, Calendar, Stats, Home…)
  // subscribes with the same `owner_id` filter so each tab refreshes on DB
  // changes. `crypto.randomUUID()` keeps each subscription alive.
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const channelName = `tasks-db-changes-${userId}-${uuid}`;

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tasks",
        filter: `owner_id=eq.${userId}`,
      },
      () => onChange?.(),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Convenience wrapper for the "team-scoped" path used by Calendar/Stats/Home.
// It delegates to `loadTasks` with a team id, so older databases (that don't yet
// have `team_id`) keep behaving like the legacy per-user list.
export async function loadTasksByTeam(
  userId: string,
  teamId: string | null,
): Promise<{ data: Task[]; error: Error | null }> {
  const result = await loadTasks(userId, teamId ?? undefined);
  return {
    data: result.data,
    error:
      result.error === null
        ? null
        : result.error instanceof Error
          ? result.error
          : new Error(String(result.error)),
  };
}

// 3. Create a task
export async function createTask(userId: string, taskData: Omit<Task, "id">) {
  const payload: Record<string, any> = {
    owner_id: userId,
    title: taskData.title,
    description: taskData.description,
    status: taskData.status,
    priority: taskData.priority,
    assignee: taskData.assignee,
    due_date: taskData.dueDate,
    subtasks: taskData.subtasks,
  };

  // Only send team_id when the column exists; older databases reject unknown
  // columns, so retry without it in that case.
  if (taskData.teamId) payload.team_id = taskData.teamId;

  const { data, error } = await supabase.from("tasks").insert([payload]).select();

  if (error) {
    if (taskData.teamId && isMissingColumnError(error, "team_id")) {
      const { team_id: _omitted, ...legacyPayload } = payload;
      const retry = await supabase.from("tasks").insert([legacyPayload]).select();
      if (retry.error) throw retry.error;
      return retry.data;
    }
    throw error;
  }
  return data;
}

// 4. Update a task
export async function updateTask(taskId: string, updates: Partial<Task>) {
  const payload: Record<string, any> = {};

  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.description !== undefined)
    payload.description = updates.description;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.priority !== undefined) payload.priority = updates.priority;
  if (updates.assignee !== undefined) payload.assignee = updates.assignee;
  if (updates.dueDate !== undefined) payload.due_date = updates.dueDate;
  if (updates.subtasks !== undefined) payload.subtasks = updates.subtasks;

  const { data, error } = await supabase
    .from("tasks")
    .update(payload)
    .eq("id", taskId)
    .select();

  if (error) throw error;
  return data;
}

// 5. Delete a task
export async function removeTask(taskId: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}
