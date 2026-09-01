import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("simple import rows shrink inside the review panel", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.review-panel,\.assessment-list,\.assessment-row,\.assessment-row>\*\{min-width:0\}/);
  assert.match(styles, /@media\(max-width:1100px\)\{\.assessment-row\.assessment-row-simple\{grid-template-columns:25px minmax\(0,1fr\)/);
  assert.match(styles, /@media\(max-width:760px\)\{\.assessment-row\.assessment-row-simple\{grid-template-columns:25px minmax\(0,1fr\) 24px\}\}/);
});
