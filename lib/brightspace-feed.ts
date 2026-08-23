export type AssessmentType = "assignment" | "quiz" | "test" | "unknown";

export type CalendarEvent = {
  uid: string | null; summary: string; description: string; categories: string;
  deadlineRaw: string | null; deadlineIso: string | null; timezone: string | null;
  courseSignal: boolean; course: string | null; type: AssessmentType; confidence: "high" | "none"; propertyNames: string[];
};
export type FeedAnalysis = {
  eventCount: number; uidCoverage: number; duplicateUidCount: number; deadlineCoverage: number;
  parseableDeadlineCoverage: number; courseSignalCoverage: number; classifiedCount: number; unknownCount: number;
  typeCounts: Record<AssessmentType, number>; timezoneCounts: Record<string, number>; propertyNames: string[]; events: CalendarEvent[];
};
export type SnapshotComparison = {
  available: boolean; matchedByUid: number; newItems: number; missingItems: number;
  deadlineChanges: number; titleChanges: number; matchRate: number;
};
type CalendarProperty = { name: string; params: Record<string, string>; value: string };

function unfoldCalendar(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").reduce<string[]>((lines, line) => {
    if (/^[ \t]/.test(line) && lines.length) lines[lines.length - 1] += line.slice(1); else lines.push(line);
    return lines;
  }, []);
}
function decodeIcsText(value: string) { return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim(); }
function parseProperty(line: string): CalendarProperty | null {
  const colon = line.indexOf(":"); if (colon < 1) return null;
  const left = line.slice(0, colon).split(";"); const name = left.shift()?.toUpperCase() ?? ""; const params: Record<string, string> = {};
  for (const part of left) { const equals = part.indexOf("="); if (equals > 0) params[part.slice(0, equals).toUpperCase()] = part.slice(equals + 1).replace(/^"|"$/g, ""); }
  return { name, params, value: decodeIcsText(line.slice(colon + 1)) };
}
function parseIcsDate(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/); if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00", zulu] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${zulu ? "Z" : ""}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
export function classifyAssessment(text: string): { type: AssessmentType; confidence: "high" | "none" } {
  const normalized = text.toLowerCase().replace(/[_-]+/g, " ");
  if (/\b(quiz|quizze?s)\b/.test(normalized)) return { type: "quiz", confidence: "high" };
  if (/\b(test|exam|midterm|final exam|final examination)\b/.test(normalized)) return { type: "test", confidence: "high" };
  if (/\b(assignment|essay|project|lab report|report|homework|problem set|case study)\b/.test(normalized)) return { type: "assignment", confidence: "high" };
  return { type: "unknown", confidence: "none" };
}
export function parseBrightspaceCalendar(text: string): CalendarEvent[] {
  const events: CalendarEvent[] = []; let properties: CalendarProperty[] | null = null;
  for (const line of unfoldCalendar(text)) {
    if (line.toUpperCase() === "BEGIN:VEVENT") { properties = []; continue; }
    if (line.toUpperCase() === "END:VEVENT" && properties) {
      const first = (name: string) => properties?.find((property) => property.name === name);
      const summary = first("SUMMARY")?.value ?? "Untitled event"; const description = first("DESCRIPTION")?.value ?? ""; const categories = first("CATEGORIES")?.value ?? "";
      const deadline = first("DTSTART") ?? first("DUE") ?? null; const searchable = `${summary} ${categories} ${description}`; const classification = classifyAssessment(searchable);
      const courseProperty = properties.find((property) => /COURSE|LOCATION/.test(property.name));
      const courseMatch = searchable.match(/\b([A-Z]{2,5})\s*[- ]?(\d{3}[A-Z]?)\b/);
      events.push({ uid: first("UID")?.value || null, summary, description, categories, deadlineRaw: deadline?.value ?? null,
        deadlineIso: parseIcsDate(deadline?.value ?? null), timezone: deadline?.params.TZID ?? (deadline?.value.endsWith("Z") ? "UTC" : null),
        courseSignal: properties.some((property) => /COURSE|ORGANI[ZS]ER|LOCATION/.test(property.name)) || /\b(course|class)\b/i.test(searchable),
        course: courseMatch ? `${courseMatch[1]} ${courseMatch[2]}` : courseProperty?.value || null,
        type: classification.type, confidence: classification.confidence, propertyNames: [...new Set(properties.map((property) => property.name))].sort() });
      properties = null; continue;
    }
    if (properties) { const property = parseProperty(line); if (property) properties.push(property); }
  }
  return events;
}
function percentage(value: number, total: number) { return total ? Math.round((value / total) * 1000) / 10 : 0; }
export function analyzeFeed(events: CalendarEvent[]): FeedAnalysis {
  const uids = events.map((event) => event.uid).filter((uid): uid is string => Boolean(uid)); const uidCounts = new Map<string, number>();
  uids.forEach((uid) => uidCounts.set(uid, (uidCounts.get(uid) ?? 0) + 1));
  const typeCounts: Record<AssessmentType, number> = { assignment: 0, quiz: 0, test: 0, unknown: 0 }; const timezoneCounts: Record<string, number> = {};
  events.forEach((event) => { typeCounts[event.type] += 1; const zone = event.timezone ?? "floating/unspecified"; timezoneCounts[zone] = (timezoneCounts[zone] ?? 0) + 1; });
  const deadlines = events.filter((event) => event.deadlineRaw);
  return { eventCount: events.length, uidCoverage: percentage(uids.length, events.length), duplicateUidCount: [...uidCounts.values()].filter((count) => count > 1).length,
    deadlineCoverage: percentage(deadlines.length, events.length), parseableDeadlineCoverage: percentage(deadlines.filter((event) => event.deadlineIso).length, deadlines.length),
    courseSignalCoverage: percentage(events.filter((event) => event.courseSignal).length, events.length), classifiedCount: events.filter((event) => event.type !== "unknown").length,
    unknownCount: typeCounts.unknown, typeCounts, timezoneCounts, propertyNames: [...new Set(events.flatMap((event) => event.propertyNames))].sort(), events };
}
export function compareFeeds(previous: CalendarEvent[] | null, current: CalendarEvent[]): SnapshotComparison {
  if (!previous) return { available: false, matchedByUid: 0, newItems: 0, missingItems: 0, deadlineChanges: 0, titleChanges: 0, matchRate: 0 };
  const oldByUid = new Map(previous.filter((event) => event.uid).map((event) => [event.uid as string, event])); const currentByUid = new Map(current.filter((event) => event.uid).map((event) => [event.uid as string, event]));
  let matchedByUid = 0, deadlineChanges = 0, titleChanges = 0;
  currentByUid.forEach((event, uid) => { const old = oldByUid.get(uid); if (!old) return; matchedByUid += 1; if (old.deadlineRaw !== event.deadlineRaw) deadlineChanges += 1; if (old.summary !== event.summary) titleChanges += 1; });
  return { available: true, matchedByUid, deadlineChanges, titleChanges, newItems: [...currentByUid.keys()].filter((uid) => !oldByUid.has(uid)).length,
    missingItems: [...oldByUid.keys()].filter((uid) => !currentByUid.has(uid)).length, matchRate: percentage(matchedByUid, Math.min(oldByUid.size, currentByUid.size)) };
}
export function buildPrivacySafeReport(analysis: FeedAnalysis, comparison: SnapshotComparison) {
  const { events: _events, ...safeAnalysis } = analysis;
  return { reportVersion: 1, generatedAt: new Date().toISOString(), privacy: "Titles, descriptions, calendar UIDs, feed URLs, and raw event values are excluded.", analysis: safeAnalysis, comparison, recommendation: recommendationFor(analysis, comparison) };
}
export function recommendationFor(analysis: FeedAnalysis, comparison: SnapshotComparison) {
  const blockers: string[] = [], cautions: string[] = [];
  if (!analysis.eventCount) blockers.push("No VEVENT records were detected."); if (analysis.uidCoverage < 95) blockers.push("Stable UID coverage is below 95%.");
  if (analysis.duplicateUidCount) blockers.push("Duplicate UIDs were detected in one snapshot."); if (analysis.parseableDeadlineCoverage < 95) blockers.push("Fewer than 95% of detected deadlines parsed safely.");
  if (!comparison.available) cautions.push("A second snapshot is required to verify UID stability and deadline-change behavior."); if (analysis.courseSignalCoverage < 70) cautions.push("Course metadata signals appear on fewer than 70% of events.");
  if (analysis.unknownCount > analysis.classifiedCount) cautions.push("Most events cannot be classified confidently from calendar text.");
  return { status: blockers.length ? "no-go" : cautions.length ? "needs-review" : "go", blockers, cautions };
}
