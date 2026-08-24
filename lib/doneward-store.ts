export type AssessmentType = "assignment" | "quiz" | "test" | "other";
export type Importance = "Unprioritized" | "Low" | "Medium" | "High";
export type Task = {
  id: string; title: string; notes: string; deadline: string; targetMinutes: number; focusedSeconds: number;
  importance: Importance; reminderMinutes: number; nextReminderAt: number; completed: boolean; completedAt?: number; createdAt: number;
  source?: "manual" | "outline" | "brightspace"; sourceUid?: string; course?: string | null; assessmentType?: AssessmentType; originalDeadline?: string;
};
export type DraftAssessment = {
  id: string; title: string; assessmentType: AssessmentType; deadline: string; weight: string; sourcePage: string;
  confidence: "high" | "medium" | "needs-review";
};
export type DraftCourse = {
  id: string; fileName: string; fileSize: number; courseCode: string; courseName: string; semester: string;
  assessments: DraftAssessment[]; uploadedAt: number;
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
export const loadTasks = () => getValue<Task[]>("tasks");
export const saveTasks = (tasks: Task[]) => putValue("tasks", tasks);
export const loadOutlineDrafts = () => getValue<DraftCourse[]>("outline-drafts");
export const saveOutlineDrafts = (drafts: DraftCourse[]) => putValue("outline-drafts", drafts);
