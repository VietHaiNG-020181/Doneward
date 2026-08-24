import assert from "node:assert/strict";
import test from "node:test";
import { extractDeadline, formatFileSize, inferCourseDetails, isPdf, MAX_OUTLINE_BYTES, parseOutlinePages, targetMinutesFor } from "../lib/outline-import.ts";

test("infers a course code and readable name from an outline filename", () => {
  assert.deepEqual(inferCourseDetails("CMPUT_301-Software_Engineering-Fall-2026-outline.pdf"), {
    courseCode: "CMPUT 301",
    courseName: "Software Engineering",
  });
});

test("validates PDF files without accepting unrelated uploads", () => {
  assert.equal(isPdf({ name: "outline.pdf", type: "" }), true);
  assert.equal(isPdf({ name: "notes.txt", type: "text/plain" }), false);
  assert.equal(MAX_OUTLINE_BYTES, 20 * 1024 * 1024);
});

test("sets useful initial focus targets for imported assessment types", () => {
  assert.equal(targetMinutesFor("assignment"), 120);
  assert.equal(targetMinutesFor("quiz"), 30);
  assert.equal(targetMinutesFor("test"), 90);
  assert.equal(targetMinutesFor("other"), 60);
  assert.equal(formatFileSize(1024 * 1024), "1.0 MB");
});

test("extracts explicit dates without inventing missing years or times", () => {
  assert.equal(extractDeadline("Due September 25, 2026 at 11:59 pm"), "2026-09-25T23:59");
  assert.equal(extractDeadline("Due October 4", "Fall 2026"), "2026-10-04");
  assert.equal(extractDeadline("Due October 4"), "");
  assert.equal(extractDeadline("Date TBA", "Fall 2026"), "");
});

test("builds review candidates with source evidence and uncertainty", () => {
  const result = parseOutlinePages([{
    pageNumber: 1,
    lowText: false,
    text: "CPSC 111 - Introduction to Computing\nFall 2026\nAssignment 1 | 10% | September 25, 2026 at 11:59 pm\nMidterm Exam | 25% | October 20, 2026\nFinal Exam | 40% | TBA\nLate assignment policy",
  }], "CPSC-111-outline.pdf");
  assert.equal(result.courseCode, "CPSC 111");
  assert.equal(result.semester, "Fall 2026");
  assert.equal(result.assessments.length, 3);
  assert.equal(result.assessments[0].deadline, "2026-09-25T23:59");
  assert.equal(result.assessments[0].sourcePage, "1");
  assert.match(result.assessments[0].sourceEvidence, /10%/);
  assert.equal(result.assessments[2].confidence, "needs-date-review");
});
