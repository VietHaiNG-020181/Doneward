import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("outline review provides a native date and time picker", async () => {
  const source = await readFile(new URL("../app/import-tasks/page.tsx", import.meta.url), "utf8");
  assert.match(source, /type="datetime-local"/);
  assert.match(source, /step="60"/);
});
