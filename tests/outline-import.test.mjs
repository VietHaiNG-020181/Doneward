import assert from "node:assert/strict";
import test from "node:test";
import { ASSESSMENT_CATEGORIES, formatFileSize, isPdf, MAX_OUTLINE_BYTES, normalizeGptExtraction, targetMinutesFor } from "../lib/outline-import.ts";

test("validates PDF files without accepting unrelated uploads", () => {
  assert.equal(isPdf({ name: "outline.pdf", type: "" }), true);
  assert.equal(isPdf({ name: "notes.txt", type: "text/plain" }), false);
  assert.equal(MAX_OUTLINE_BYTES, 20 * 1024 * 1024);
});

test("sets focus targets for every imported category", () => {
  assert.deepEqual(ASSESSMENT_CATEGORIES, ["assignment", "quiz", "test", "exam", "project", "lab", "paper", "presentation", "other"]);
  assert.equal(targetMinutesFor("project"), 120);
  assert.equal(targetMinutesFor("exam"), 90);
  assert.equal(targetMinutesFor("quiz"), 30);
  assert.equal(targetMinutesFor("lab"), 60);
  assert.equal(formatFileSize(1024 * 1024), "1.0 MB");
});

test("normalizes the strict four-field GPT result", () => {
  assert.deepEqual(normalizeGptExtraction({
    courseName: " Software Engineering ",
    tasks: [
      { taskName: " Assignment 1 ", category: "assignment", deadline: "2026-09-25T23:59" },
      { taskName: "Final exam", category: "exam", deadline: null },
    ],
  }), {
    courseName: "Software Engineering",
    tasks: [
      { taskName: "Assignment 1", category: "assignment", deadline: "2026-09-25T23:59" },
      { taskName: "Final exam", category: "exam", deadline: null },
    ],
  });
});

test("rejects malformed results and never accepts a made-up deadline format", () => {
  assert.equal(normalizeGptExtraction({ courseName: "Course", tasks: [{ taskName: "Quiz", category: "unknown", deadline: null }] }), null);
  assert.deepEqual(normalizeGptExtraction({ courseName: "Course", tasks: [{ taskName: "Quiz", category: "quiz", deadline: "next Tuesday" }] }), {
    courseName: "Course",
    tasks: [{ taskName: "Quiz", category: "quiz", deadline: null }],
  });
});
