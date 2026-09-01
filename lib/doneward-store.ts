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
const TASK_ID = /^[A-Za-z0-9_-]{1,100}$/;
const DEADLINE = /^(?:TBD|\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?)$/;
const IMPORTANCE = new Set<Importance>(["Unprioritized", "Low", "Medium", "High"]);
const SOURCES = new Set<Task["source"]>(["manual", "outline", "brightspace"]);
const ASSESSMENT_TYPES = new Set<AssessmentType>(["assignment", "quiz", "test", "exam", "project", "lab", "paper", "presentation", "other"]);

function integerInRange(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback;
}

function stableTaskId(value: unknown, createdAt: number) {
  const candidate = typeof value === "string" ? value.trim() : String(value ?? "");
  if (TASK_ID.test(candidate)) return candidate;
  let hash = 2166136261;
  for (const character of candidate) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `legacy_${createdAt}_${(hash >>> 0).toString(36)}`.slice(0, 100);
}

export function normalizeDeadline(value: unknown) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate || candidate.toUpperCase() === "TBD") return "TBD";
  if (DEADLINE.test(candidate)) return candidate;
  const legacy = candidate.match(/^(\d{4}-\d{2}-\d{2})(?:[T,\s]+(\d{2}):(\d{2}))?/);
  if (legacy) return legacy[2] ? `${legacy[1]}T${legacy[2]}:${legacy[3]}` : legacy[1];
  const parsed = new Date(candidate);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 16) : "TBD";
}

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
  const input = task as Task & Record<string, unknown>;
  const now = Date.now();
  const createdAt = integerInRange(input.createdAt, now, 1, Number.MAX_SAFE_INTEGER);
  const updatedAt = integerInRange(input.updatedAt, createdAt, 1, Number.MAX_SAFE_INTEGER);
  const reminderMinutes = integerInRange(input.reminderMinutes, 60, 1, 10_080);
  const importance = IMPORTANCE.has(input.importance as Importance) ? input.importance as Importance : "Unprioritized";
  const source = SOURCES.has(input.source as Task["source"]) ? input.source as Task["source"] : undefined;
  const assessmentType = ASSESSMENT_TYPES.has(input.assessmentType as AssessmentType) ? input.assessmentType as AssessmentType : input.assessmentType ? "other" : undefined;
  const originalDeadline = typeof input.originalDeadline === "string" && input.originalDeadline.trim() ? normalizeDeadline(input.originalDeadline) : undefined;
  const plannedDate = typeof input.plannedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.plannedDate) ? input.plannedDate : undefined;
  const completedAt = input.completedAt === undefined || input.completedAt === null ? undefined : integerInRange(input.completedAt, updatedAt, 1, Number.MAX_SAFE_INTEGER);
  return {
    ...task,
    id: stableTaskId(input.id, createdAt),
    title: (typeof input.title === "string" ? input.title.trim() : "").slice(0, 300) || "Untitled task",
    notes: (typeof input.notes === "string" ? input.notes : "").slice(0, 4_000),
    deadline: normalizeDeadline(input.deadline),
    targetMinutes: integerInRange(input.targetMinutes, 0, 0, 10_080),
    focusedSeconds: integerInRange(input.focusedSeconds, 0, 0, 31_536_000),
    importance,
    reminderMinutes,
    nextReminderAt: integerInRange(input.nextReminderAt, now + reminderMinutes * 60_000, 0, Number.MAX_SAFE_INTEGER),
    completed: input.completed === true,
    completedAt,
    createdAt,
    source,
    sourceUid: typeof input.sourceUid === "string" && input.sourceUid.trim() ? input.sourceUid.trim().slice(0, 500) : undefined,
    course: typeof input.course === "string" && input.course.trim() ? input.course.trim().slice(0, 200) : undefined,
    assessmentType,
    originalDeadline,
    plannedDate,
    updatedAt,
  };
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
