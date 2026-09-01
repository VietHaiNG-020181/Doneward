import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("outline review imports blank deadlines as TBD", async () => {
  const source = await readFile(new URL("../app/import-tasks/page.tsx", import.meta.url), "utf8");
  assert.match(source, /deadline: item\.deadline \|\| "TBD"/);
  assert.doesNotMatch(source, /without a deadline skipped/);
});

test("manual tasks support a TBD deadline", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /name="deadlineTbd"/);
  assert.match(source, /deadlineTimestamp/);
});

test("TBD deadlines are accepted by cloud synchronization", async () => {
  const source = await readFile(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8");
  assert.match(source, /const DEADLINE = \/\^\(\?:TBD\|/);
});
