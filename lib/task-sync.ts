import {
  loadDeletedTasks,
  normalizeTask,
  saveDeletedTasks,
  type DeletedTask,
  type Task,
} from "@/lib/doneward-store";

export type TaskSyncStatus = "cloud" | "local";
export type TaskSyncResult = { tasks: Task[]; deleted: DeletedTask[]; status: TaskSyncStatus };

type SyncResponse = {
  tasks?: unknown;
  deleted?: unknown;
  error?: string;
};

function validDeletion(value: unknown): value is DeletedTask {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<DeletedTask>;
  return typeof item.id === "string" && Number.isSafeInteger(item.deletedAt) && Number(item.deletedAt) > 0;
}

function validTask(value: unknown): value is Task {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const task = value as Partial<Task>;
  return typeof task.id === "string" && typeof task.title === "string" && typeof task.deadline === "string" && Number.isSafeInteger(task.updatedAt);
}

export async function synchronizeTasks(localTasks: Task[]): Promise<TaskSyncResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const deleted = await loadDeletedTasks();
    const response = await fetch("/api/tasks", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: localTasks.map(normalizeTask), deleted }),
      signal: controller.signal,
    });
    if (response.status === 401) return { tasks: localTasks, deleted, status: "local" };
    const result = await response.json() as SyncResponse;
    if (!response.ok) throw new Error(result.error || "Cloud synchronization failed.");
    if (!Array.isArray(result.tasks) || !result.tasks.every(validTask) || !Array.isArray(result.deleted) || !result.deleted.every(validDeletion)) {
      throw new Error("Cloud synchronization returned an invalid response.");
    }
    const tasks = result.tasks.map(normalizeTask);
    const latestLocalDeleted = await loadDeletedTasks();
    const deletionMap = new Map<string, number>();
    for (const item of [...result.deleted, ...latestLocalDeleted]) {
      deletionMap.set(item.id, Math.max(item.deletedAt, deletionMap.get(item.id) ?? 0));
    }
    const mergedDeleted = [...deletionMap].map(([id, deletedAt]) => ({ id, deletedAt }));
    await saveDeletedTasks(mergedDeleted);
    return { tasks, deleted: mergedDeleted, status: "cloud" };
  } finally {
    window.clearTimeout(timeout);
  }
}
