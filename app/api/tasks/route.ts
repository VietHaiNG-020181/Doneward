import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getD1 } from "@/db";
import { normalizeTask, type AssessmentType, type Importance, type Task } from "@/lib/doneward-store";

export const dynamic = "force-dynamic";

const MAX_SYNC_TASKS = 500;
const MAX_BODY_BYTES = 1_500_000;
const IMPORTANCE = new Set<Importance>(["Unprioritized", "Low", "Medium", "High"]);
const SOURCES = new Set(["manual", "outline", "brightspace"]);
const ASSESSMENT_TYPES = new Set<AssessmentType>([
  "assignment", "quiz", "test", "exam", "project", "lab", "paper", "presentation", "other",
]);
const TASK_ID = /^[A-Za-z0-9_-]{1,100}$/;
const DEADLINE = /^(?:TBD|\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?)$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
let schemaPromise: Promise<unknown> | null = null;

type DeletedTask = { id: string; deletedAt: number };
type TaskRow = {
  id: string;
  title: string;
  notes: string;
  deadline: string;
  target_minutes: number;
  focused_seconds: number;
  importance: Importance;
  reminder_minutes: number;
  next_reminder_at: number;
  completed: number;
  completed_at: number | null;
  created_at: number;
  source: Task["source"] | null;
  source_uid: string | null;
  course: string | null;
  assessment_type: AssessmentType | null;
  original_deadline: string | null;
  planned_date: string | null;
  updated_at: number;
  deleted_at: number | null;
};

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function authenticatedUser() {
  const user = await getChatGPTUser();
  if (!user) return null;
  return user;
}

function boundedString(value: unknown, max: number, allowEmpty = true): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim().slice(0, max);
  return result || (allowEmpty ? "" : null);
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
}

function optionalInteger(value: unknown, min: number, max: number): number | undefined | null {
  if (value === undefined || value === null) return undefined;
  return boundedInteger(value, min, max);
}

function optionalString(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  return boundedString(value, max, false);
}

function sanitizeTask(value: unknown): Task | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = normalizeTask(value as Task) as Task & Record<string, unknown>;
  const id = boundedString(input.id, 100, false);
  const title = boundedString(input.title, 300, false);
  const notes = boundedString(input.notes, 4_000) ?? "";
  const deadline = boundedString(input.deadline, 16, false);
  const targetMinutes = boundedInteger(input.targetMinutes, 0, 10_080);
  const focusedSeconds = boundedInteger(input.focusedSeconds, 0, 31_536_000);
  const reminderMinutes = boundedInteger(input.reminderMinutes, 1, 10_080);
  const nextReminderAt = boundedInteger(input.nextReminderAt, 0, Number.MAX_SAFE_INTEGER);
  const createdAt = boundedInteger(input.createdAt, 1, Number.MAX_SAFE_INTEGER);
  const updatedAt = boundedInteger(input.updatedAt, 1, Number.MAX_SAFE_INTEGER);
  const completedAt = optionalInteger(input.completedAt, 1, Number.MAX_SAFE_INTEGER);
  const plannedDate = optionalString(input.plannedDate, 10);
  const originalDeadline = optionalString(input.originalDeadline, 16);
  const sourceUid = optionalString(input.sourceUid, 500);
  const course = optionalString(input.course, 200);

  if (!id || !TASK_ID.test(id) || !title || !deadline || !DEADLINE.test(deadline)) return null;
  if (targetMinutes === null || focusedSeconds === null || reminderMinutes === null || nextReminderAt === null || createdAt === null || updatedAt === null) return null;
  if (completedAt === null || plannedDate === null || originalDeadline === null || sourceUid === null || course === null) return null;
  if (plannedDate && !DATE_ONLY.test(plannedDate)) return null;
  if (originalDeadline && !DEADLINE.test(originalDeadline)) return null;
  if (typeof input.completed !== "boolean" || !IMPORTANCE.has(input.importance as Importance)) return null;
  if (input.source !== undefined && input.source !== null && !SOURCES.has(String(input.source))) return null;
  if (input.assessmentType !== undefined && input.assessmentType !== null && !ASSESSMENT_TYPES.has(input.assessmentType as AssessmentType)) return null;

  return {
    id,
    title,
    notes,
    deadline,
    targetMinutes,
    focusedSeconds,
    importance: input.importance as Importance,
    reminderMinutes,
    nextReminderAt,
    completed: input.completed,
    completedAt,
    createdAt,
    source: input.source as Task["source"],
    sourceUid,
    course,
    assessmentType: input.assessmentType as AssessmentType | undefined,
    originalDeadline,
    plannedDate,
    updatedAt,
  };
}

function sanitizeDeletion(value: unknown): DeletedTask | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const id = boundedString(input.id, 100, false);
  const deletedAt = boundedInteger(input.deletedAt, 1, Number.MAX_SAFE_INTEGER);
  return id && TASK_ID.test(id) && deletedAt !== null ? { id, deletedAt } : null;
}

async function upsertUser(db: D1Database, user: { userId: string; email: string; displayName: string }, now: number) {
  await db.prepare(`
    INSERT INTO users (id, email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      updated_at = excluded.updated_at
  `).bind(user.userId, user.email.slice(0, 320), user.displayName.slice(0, 200), now, now).run();
}

function ensureTaskStorage(db: D1Database) {
  if (!schemaPromise) {
    schemaPromise = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS tasks (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        title TEXT NOT NULL,
        notes TEXT DEFAULT '' NOT NULL,
        deadline TEXT NOT NULL,
        target_minutes INTEGER NOT NULL,
        focused_seconds INTEGER NOT NULL,
        importance TEXT NOT NULL,
        reminder_minutes INTEGER NOT NULL,
        next_reminder_at INTEGER NOT NULL,
        completed INTEGER DEFAULT 0 NOT NULL,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        source TEXT,
        source_uid TEXT,
        course TEXT,
        assessment_type TEXT,
        original_deadline TEXT,
        planned_date TEXT,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        PRIMARY KEY (user_id, id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_tasks_user_updated ON tasks (user_id, updated_at)"),
    ]).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function taskUpsert(db: D1Database, userId: string, task: Task) {
  return db.prepare(`
    INSERT INTO tasks (
      user_id, id, title, notes, deadline, target_minutes, focused_seconds,
      importance, reminder_minutes, next_reminder_at, completed, completed_at,
      created_at, source, source_uid, course, assessment_type, original_deadline,
      planned_date, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(user_id, id) DO UPDATE SET
      title = excluded.title,
      notes = excluded.notes,
      deadline = excluded.deadline,
      target_minutes = excluded.target_minutes,
      focused_seconds = excluded.focused_seconds,
      importance = excluded.importance,
      reminder_minutes = excluded.reminder_minutes,
      next_reminder_at = excluded.next_reminder_at,
      completed = excluded.completed,
      completed_at = excluded.completed_at,
      source = excluded.source,
      source_uid = excluded.source_uid,
      course = excluded.course,
      assessment_type = excluded.assessment_type,
      original_deadline = excluded.original_deadline,
      planned_date = excluded.planned_date,
      updated_at = excluded.updated_at,
      deleted_at = NULL
    WHERE excluded.updated_at > tasks.updated_at
      AND excluded.updated_at > COALESCE(tasks.deleted_at, 0)
  `).bind(
    userId, task.id, task.title, task.notes, task.deadline, task.targetMinutes,
    task.focusedSeconds, task.importance, task.reminderMinutes, task.nextReminderAt,
    task.completed ? 1 : 0, task.completedAt ?? null, task.createdAt,
    task.source ?? null, task.sourceUid ?? null, task.course ?? null,
    task.assessmentType ?? null, task.originalDeadline ?? null, task.plannedDate ?? null,
    task.updatedAt,
  );
}

function taskDelete(db: D1Database, userId: string, deletion: DeletedTask) {
  return db.prepare(`
    INSERT INTO tasks (
      user_id, id, title, notes, deadline, target_minutes, focused_seconds,
      importance, reminder_minutes, next_reminder_at, completed, created_at,
      updated_at, deleted_at
    ) VALUES (?, ?, '', '', '1970-01-01', 0, 0, 'Unprioritized', 60, 0, 0, ?, ?, ?)
    ON CONFLICT(user_id, id) DO UPDATE SET
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at
    WHERE excluded.deleted_at > tasks.updated_at
      AND excluded.deleted_at > COALESCE(tasks.deleted_at, 0)
  `).bind(userId, deletion.id, deletion.deletedAt, deletion.deletedAt, deletion.deletedAt);
}

async function readState(db: D1Database, userId: string) {
  const result = await db.prepare(`
    SELECT id, title, notes, deadline, target_minutes, focused_seconds,
      importance, reminder_minutes, next_reminder_at, completed, completed_at,
      created_at, source, source_uid, course, assessment_type, original_deadline,
      planned_date, updated_at, deleted_at
    FROM tasks
    WHERE user_id = ?
    ORDER BY updated_at ASC, id ASC
  `).bind(userId).all<TaskRow>();

  const tasks: Task[] = [];
  const deleted: DeletedTask[] = [];
  for (const row of result.results ?? []) {
    if (row.deleted_at) {
      deleted.push({ id: row.id, deletedAt: row.deleted_at });
      continue;
    }
    tasks.push({
      id: row.id,
      title: row.title,
      notes: row.notes,
      deadline: row.deadline,
      targetMinutes: row.target_minutes,
      focusedSeconds: row.focused_seconds,
      importance: row.importance,
      reminderMinutes: row.reminder_minutes,
      nextReminderAt: row.next_reminder_at,
      completed: Boolean(row.completed),
      completedAt: row.completed_at ?? undefined,
      createdAt: row.created_at,
      source: row.source ?? undefined,
      sourceUid: row.source_uid ?? undefined,
      course: row.course,
      assessmentType: row.assessment_type ?? undefined,
      originalDeadline: row.original_deadline ?? undefined,
      plannedDate: row.planned_date ?? undefined,
      updatedAt: row.updated_at,
    });
  }
  return { tasks, deleted, serverTime: Date.now() };
}

export async function GET() {
  const user = await authenticatedUser();
  if (!user) return json({ error: "Sign in to load cloud tasks." }, 401);
  try {
    const db = getD1();
    await ensureTaskStorage(db);
    await upsertUser(db, user, Date.now());
    return json(await readState(db, user.userId));
  } catch {
    return json({ error: "Cloud tasks are temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  const user = await authenticatedUser();
  if (!user) return json({ error: "Sign in to synchronize tasks." }, 401);
  if (request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Cross-site synchronization is not allowed." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Expected a JSON request." }, 415);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "The synchronization request is too large." }, 413);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "The synchronization request is invalid." }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "The synchronization request is invalid." }, 400);
  const input = payload as { tasks?: unknown; deleted?: unknown };
  if (!Array.isArray(input.tasks) || !Array.isArray(input.deleted)) return json({ error: "Tasks and deletions are required." }, 400);
  if (input.tasks.length + input.deleted.length > MAX_SYNC_TASKS) return json({ error: `A maximum of ${MAX_SYNC_TASKS} task changes can be synchronized at once.` }, 413);

  const tasks = input.tasks.map(sanitizeTask);
  const deleted = input.deleted.map(sanitizeDeletion);
  if (tasks.some((task) => !task) || deleted.some((item) => !item)) return json({ error: "One or more task records are invalid." }, 400);

  try {
    const db = getD1();
    await ensureTaskStorage(db);
    await upsertUser(db, user, Date.now());
    const statements = [
      ...(tasks as Task[]).map((task) => taskUpsert(db, user.userId, task)),
      ...(deleted as DeletedTask[]).map((item) => taskDelete(db, user.userId, item)),
    ];
    if (statements.length) await db.batch(statements);
    return json(await readState(db, user.userId));
  } catch {
    return json({ error: "Cloud synchronization failed. Your local copy is unchanged." }, 503);
  }
}
