import type { AssessmentType, DraftAssessment, DraftCourse } from "./doneward-store";

export const MAX_OUTLINE_BYTES = 20 * 1024 * 1024;
export const ASSESSMENT_CATEGORIES: AssessmentType[] = ["assignment", "quiz", "test", "exam", "project", "lab", "paper", "presentation", "other"];

export type GptOutlineExtraction = {
  courseName: string;
  tasks: Array<{ taskName: string; category: AssessmentType; deadline: string | null }>;
};

export function createAssessment(): DraftAssessment {
  return { id: crypto.randomUUID(), taskName: "", category: "assignment", deadline: "" };
}

export function createCourseDraft(file: Pick<File, "name" | "size">): DraftCourse {
  return {
    id: crypto.randomUUID(), fileName: file.name, fileSize: file.size,
    courseName: "", assessments: [], uploadedAt: Date.now(), parseStatus: "extracting",
  };
}

export function isPdf(file: Pick<File, "name" | "type">) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function targetMinutesFor(type: AssessmentType) {
  if (["assignment", "project", "paper", "presentation"].includes(type)) return 120;
  if (["test", "exam"].includes(type)) return 90;
  return type === "quiz" ? 30 : 60;
}

export function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function normalizeGptExtraction(value: unknown): GptOutlineExtraction | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { courseName?: unknown; tasks?: unknown };
  if (typeof candidate.courseName !== "string" || !Array.isArray(candidate.tasks)) return null;
  const tasks: GptOutlineExtraction["tasks"] = [];
  for (const item of candidate.tasks) {
    if (!item || typeof item !== "object") return null;
    const task = item as { taskName?: unknown; category?: unknown; deadline?: unknown };
    if (typeof task.taskName !== "string" || typeof task.category !== "string" || !ASSESSMENT_CATEGORIES.includes(task.category as AssessmentType)) return null;
    const deadline = task.deadline === null ? null : typeof task.deadline === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(task.deadline) ? task.deadline : null;
    tasks.push({ taskName: task.taskName.trim(), category: task.category as AssessmentType, deadline });
  }
  return { courseName: candidate.courseName.trim(), tasks: tasks.filter((task) => task.taskName) };
}
