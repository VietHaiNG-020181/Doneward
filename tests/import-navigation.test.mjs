import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("task return links use browser navigation and cancelling clears the draft", async () => {
  const source = await readFile(new URL("../app/import-tasks/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from ["']next\/link["']/);
  assert.match(source, /<a className="nav-item" href="\/">/);
  assert.match(source, /<button className="secondary-button" type="button" onClick=\{removeCourse\}>Cancel<\/button>/);
  assert.match(source, /saveOutlineDrafts\(remaining\)/);
  assert.doesNotMatch(source, /href="\/">Cancel<\/a>/);
});
