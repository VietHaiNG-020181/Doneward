import type { AssessmentType, DraftAssessment, DraftCourse } from "./doneward-store";

export const MAX_OUTLINE_BYTES = 20 * 1024 * 1024;
export type ExtractedPage = { pageNumber: number; text: string; lowText: boolean };

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
  return { id: crypto.randomUUID(), title: "", assessmentType: "assignment", deadline: "", weight: "", sourcePage: "", confidence: "needs-date-review", sourceEvidence: "" };
}

export function createCourseDraft(file: Pick<File, "name" | "size">): DraftCourse {
  const inferred = inferCourseDetails(file.name);
  return {
    id: crypto.randomUUID(), fileName: file.name, fileSize: file.size, courseCode: inferred.courseCode,
    courseName: inferred.courseName, semester: "", assessments: [], uploadedAt: Date.now(), parseStatus: "extracting", lowTextPages: [],
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

function normalizeLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function categoryFor(text: string): AssessmentType {
  if (/\b(quiz|quizzes)\b/i.test(text)) return "quiz";
  if (/\b(midterm|test|exam|final)\b/i.test(text)) return "test";
  if (/\b(assignment|paper|essay)\b/i.test(text)) return "assignment";
  return "other";
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function pad(value: number) { return String(value).padStart(2, "0"); }

export function extractDeadline(text: string, semester = "") {
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})\s*(am|pm)?)?/i);
  const numeric = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm))?/i);
  const named = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?(?:\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm))?/i);
  let year: number | undefined; let month: number | undefined; let day: number | undefined; let hour: number | undefined; let minute: number | undefined; let meridiem: string | undefined;
  if (iso) { year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]); hour = iso[4] ? Number(iso[4]) : undefined; minute = iso[5] ? Number(iso[5]) : undefined; meridiem = iso[6]; }
  else if (numeric) { month = Number(numeric[1]); day = Number(numeric[2]); year = Number(numeric[3]); hour = numeric[4] ? Number(numeric[4]) : undefined; minute = numeric[5] ? Number(numeric[5]) : 0; meridiem = numeric[6]; }
  else if (named) { month = MONTHS[named[1].toLowerCase().replace(/\.$/, "")]; day = Number(named[2]); year = named[3] ? Number(named[3]) : Number(semester.match(/\b(20\d{2})\b/)?.[1]); hour = named[4] ? Number(named[4]) : undefined; minute = named[5] ? Number(named[5]) : 0; meridiem = named[6]; }
  if (!year || !month || !day || month > 12 || day > 31) return "";
  if (hour === undefined) return `${year}-${pad(month)}-${pad(day)}`;
  if (meridiem?.toLowerCase() === "pm" && hour < 12) hour += 12;
  if (meridiem?.toLowerCase() === "am" && hour === 12) hour = 0;
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute ?? 0)}`;
}

function assessmentTitle(line: string) {
  const match = line.match(/\b((?:assignment|quiz|midterm(?:\s+exam)?|test|exam|final(?:\s+exam)?|project|lab(?:oratory)?|paper|essay|presentation)\s*(?:#?\s*\d+|[A-Z])?(?:\s*[-:]\s*[^|;]{1,55})?)/i);
  if (!match) return "Assessment";
  return normalizeLine(match[1]
    .replace(/\b(?:due|deadline|weight|worth)\b.*$/i, "")
    .replace(/\s+\d+(?:\.\d+)?\s*%.*$/, "")
    .replace(/\s+(?:on\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\s+\d+.*$/i, "")
    .replace(/[|,:;-]+$/, ""));
}

function courseFields(pages: ExtractedPage[], fileName: string) {
  const inferred = inferCourseDetails(fileName);
  const firstText = pages.slice(0, 3).map((page) => page.text).join("\n");
  const codeMatch = firstText.match(/\b([A-Z]{2,5})\s*[- ]?\s*(\d{3}[A-Z]?)\b/);
  const code = codeMatch ? `${codeMatch[1]} ${codeMatch[2]}` : inferred.courseCode;
  const semester = firstText.match(/\b(Fall|Winter|Spring|Summer)\s+(20\d{2})\b/i)?.[0] ?? "";
  const lines = firstText.split(/\n+/).map(normalizeLine).filter(Boolean);
  const codeLine = codeMatch ? lines.findIndex((line) => line.includes(codeMatch[0])) : -1;
  const fromCodeLine = codeLine >= 0 ? normalizeLine(lines[codeLine].replace(codeMatch?.[0] ?? "", "").replace(/^[-:|\s]+|[-:|\s]+$/g, "")) : "";
  const following = codeLine >= 0 ? lines.slice(codeLine + 1, codeLine + 3).find((line) => line.length > 4 && line.length < 90 && !/outline|syllabus|fall|winter|spring|summer|20\d{2}/i.test(line)) : "";
  return { courseCode: code, courseName: fromCodeLine || following || inferred.courseName, semester };
}

export function parseOutlinePages(pages: ExtractedPage[], fileName: string) {
  const course = courseFields(pages, fileName);
  const candidates: DraftAssessment[] = [];
  const seen = new Map<string, number>();
  const keyword = /\b(assignment|quiz|quizzes|midterm|test|exam|final|project|lab(?:oratory)?|paper|essay|presentation)\b/i;
  const nonTask = /\b(policy|policies|late penalty|academic integrity|accommodation|office hours|grading scale)\b/i;
  for (const page of pages) {
    const lines = page.text.split(/\n+/).map(normalizeLine).filter(Boolean);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!keyword.test(line)) continue;
      const evidence = normalizeLine([line, lines[index + 1] ?? ""].join(" ")).slice(0, 260);
      const deadline = extractDeadline(evidence, course.semester);
      const weight = evidence.match(/\b(\d+(?:\.\d+)?)\s*%/)?.[0] ?? "";
      const unresolvedDate = /\b(TBA|TBD|to be announced|date not announced)\b/i.test(evidence);
      if ((!deadline && !weight && !unresolvedDate) || (nonTask.test(evidence) && !deadline && !weight)) continue;
      const title = assessmentTitle(line);
      const assessmentType = categoryFor(title);
      const identity = `${title.toLowerCase().replace(/\W/g, "")}|${deadline}`;
      const duplicateIndex = seen.get(identity);
      const candidate: DraftAssessment = {
        id: crypto.randomUUID(), title, assessmentType, deadline, weight, sourcePage: String(page.pageNumber), sourceEvidence: evidence,
        confidence: deadline ? "ready-to-confirm" : "needs-date-review",
      };
      if (duplicateIndex !== undefined) {
        candidates[duplicateIndex] = { ...candidates[duplicateIndex], confidence: "possible-duplicate" };
        candidate.confidence = "possible-duplicate";
      } else seen.set(identity, candidates.length);
      candidates.push(candidate);
    }
  }
  return { ...course, assessments: candidates };
}

export async function extractPdfPages(file: File, onProgress?: (current: number, total: number) => void): Promise<ExtractedPage[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: ExtractedPage[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
      if (typeof item.str !== "string") continue;
      text += item.str + (item.hasEOL ? "\n" : " ");
    }
    const normalized = text.split("\n").map(normalizeLine).filter(Boolean).join("\n");
    pages.push({ pageNumber, text: normalized, lowText: normalized.replace(/\s/g, "").length < 40 });
    onProgress?.(pageNumber, document.numPages);
  }
  await document.destroy();
  return pages;
}
