import assert from "node:assert/strict";
import test from "node:test";
import { formatFileSize, inferCourseDetails, isPdf, MAX_OUTLINE_BYTES, targetMinutesFor } from "../lib/outline-import.ts";

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
