import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDeadline, normalizeTask } from "../lib/doneward-store.ts";

test("legacy deadline formats migrate to the cloud format", () => {
  assert.equal(normalizeDeadline("2026-10-02, 04:30"), "2026-10-02T04:30");
  assert.equal(normalizeDeadline("2026-10-02T04:30:00.000Z"), "2026-10-02T04:30");
  assert.equal(normalizeDeadline("date unavailable"), "TBD");
});

test("legacy browser tasks are repaired without discarding their content", () => {
  const task = normalizeTask({
    id: "old task/id",
    title: " Legacy task ",
    notes: "Keep this note",
    deadline: "2026-10-02, 04:30",
    targetMinutes: "60",
    focusedSeconds: undefined,
    importance: "Urgent",
    reminderMinutes: 0,
    nextReminderAt: undefined,
    completed: undefined,
    createdAt: 1_700_000_000_000,
    source: "legacy-import",
    assessmentType: "unknown",
    updatedAt: undefined,
  });

  assert.match(task.id, /^legacy_1700000000000_/);
  assert.equal(task.title, "Legacy task");
  assert.equal(task.notes, "Keep this note");
  assert.equal(task.deadline, "2026-10-02T04:30");
  assert.equal(task.targetMinutes, 60);
  assert.equal(task.focusedSeconds, 0);
  assert.equal(task.importance, "Unprioritized");
  assert.equal(task.reminderMinutes, 1);
  assert.equal(task.completed, false);
  assert.equal(task.source, undefined);
  assert.equal(task.assessmentType, "other");
  assert.equal(task.updatedAt, task.createdAt);
});

test("the cloud endpoint normalizes legacy records before strict validation", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8");
  assert.match(source, /const input = normalizeTask\(value as Task\)/);
});
