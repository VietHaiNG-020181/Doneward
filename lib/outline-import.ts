import type { AssessmentType, DraftAssessment, DraftCourse } from "./doneward-store";

export const MAX_OUTLINE_BYTES = 20 * 1024 * 1024;

export function inferCourseDetails(fileName: string) {
  const base = fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const match = base.match(/\b([A-Za-z]{2,5})\s*(\d{3}[A-Za-z]?)\b/);
  const courseCode = match ? `${match[1].toUpperCase()} ${match[2].toUpperCase()}` : "";
  const courseName = base
    .replace(match?.[0] ?? "", "")
    .replace(/\b(course\s*)?outline\b/gi, "")
    .replace(/\b(syllabus|fall|winter|spring|summer|20\d{2})\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return { courseCode, courseName };
}

export function createAssessment(): DraftAssessment {
  return { id: crypto.randomUUID(), title: "", assessmentType: "assignment", deadline: "", weight: "", sourcePage: "", confidence: "needs-review" };
}

export function createCourseDraft(file: Pick<File, "name" | "size">): DraftCourse {
  const inferred = inferCourseDetails(file.name);
  return {
    id: crypto.randomUUID(), fileName: file.name, fileSize: file.size, courseCode: inferred.courseCode,
    courseName: inferred.courseName, semester: "", assessments: [createAssessment()], uploadedAt: Date.now(),
  };
}

export function isPdf(file: Pick<File, "name" | "type">) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function targetMinutesFor(type: AssessmentType) {
  return type === "assignment" ? 120 : type === "test" ? 90 : type === "quiz" ? 30 : 60;
}

export function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
