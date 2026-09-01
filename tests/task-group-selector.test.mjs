import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("manual tasks can choose or create a group", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /<label>Group<select name="course"/);
  assert.match(source, /\+ New group/);
  assert.match(source, /name="newCourse"/);
});
