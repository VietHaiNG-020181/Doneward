export type AssessmentType = "assignment" | "quiz" | "test" | "exam" | "project" | "lab" | "paper" | "presentation" | "other";
export type Importance = "Unprioritized" | "Low" | "Medium" | "High";
export type Task = {
  id: string; title: string; notes: string; deadline: string; targetMinutes: number; focusedSeconds: number;
  importance: Importance; reminderMinutes: number; nextReminderAt: number; completed: boolean; completedAt?: number; createdAt: number;
  source?: "manual" | "outline" | "brightspace"; sourceUid?: string; course?: string | null; assessmentType?: AssessmentType; originalDeadline?: string;
  plannedDate?: string;
  updatedAt: number;
};
export type DeletedTask = { id: string; deletedAt: number };
export type DraftAssessment = {
  id: string; taskName: string; category: AssessmentType; deadline: string;
};
export type DraftCourse = {
  id: string; fileName: string; fileSize: number; courseName: string;
  assessments: DraftAssessment[]; uploadedAt: number; parseStatus?: "manual" | "extracting" | "extracted" | "failed";
};

const DB_NAME = "doneward-db";
const STORE = "app-state";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function getValue<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => { const request = db.transaction(STORE).objectStore(STORE).get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
async function putValue<T>(key: string, value: T) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => { const transaction = db.transaction(STORE, "readwrite"); transaction.objectStore(STORE).put(value, key); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
}
export function normalizeTask(task: Task): Task {
  return { ...task, deadline: task.deadline || "TBD", updatedAt: task.updatedAt || task.createdAt || Date.now() };
}
export async function loadTasks() {
  const tasks = await getValue<Task[]>("tasks");
  return tasks?.map(normalizeTask);
}
export const saveTasks = (tasks: Task[]) => putValue("tasks", tasks);
export const loadDeletedTasks = async () => await getValue<DeletedTask[]>("deleted-tasks") ?? [];
export const saveDeletedTasks = (tasks: DeletedTask[]) => putValue("deleted-tasks", tasks);
export async function rememberTaskDeletion(id: string, deletedAt = Date.now()) {
  const current = await loadDeletedTasks();
  const existing = current.find((item) => item.id === id);
  if (existing && existing.deletedAt >= deletedAt) return;
  await saveDeletedTasks([...current.filter((item) => item.id !== id), { id, deletedAt }]);
}
export const loadOutlineDrafts = () => getValue<DraftCourse[]>("outline-drafts");
export const saveOutlineDrafts = (drafts: DraftCourse[]) => putValue("outline-drafts", drafts);
export const loadBackendPairingToken = () => getValue<string>("backend-pairing-token");
export const saveBackendPairingToken = (token: string) => putValue("backend-pairing-token", token);
