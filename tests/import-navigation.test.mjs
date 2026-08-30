import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("task return links use browser navigation", async () => {
  const source = await readFile(new URL("../app/import-tasks/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from ["']next\/link["']/);
  assert.match(source, /<a className="nav-item" href="\/">/);
  assert.match(source, /<a className="secondary-button" href="\/">Cancel<\/a>/);
});
