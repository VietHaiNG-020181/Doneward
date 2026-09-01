import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("outline review provides a date picker and imports blank deadlines as TBD", async () => {
  const source = await readFile(new URL("../app/import-tasks/page.tsx", import.meta.url), "utf8");
  assert.match(source, /type="datetime-local"/);
  assert.match(source, /deadline: item\.deadline \|\| "TBD"/);
  assert.doesNotMatch(source, /without a deadline skipped/);
});

test("manual tasks can choose or create a group", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /<label>Group<select name="course"/);
  assert.match(source, /\+ New group/);
  assert.match(source, /name="newCourse"/);
});

test("TBD deadlines are accepted by cloud synchronization", async () => {
  const source = await readFile(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8");
  assert.match(source, /const DEADLINE = \/\^\(\?:TBD\|/);
});

test("import review rows remain inside the review panel at narrow desktop widths", async () => {
  const source = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /\.assessment-row\.assessment-row-simple\{grid-template-columns:25px minmax\(0,1fr\)/);
  assert.match(source, /\.assessment-row>\*\{min-width:0\}/);
});
