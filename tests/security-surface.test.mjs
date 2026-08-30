import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("the obsolete extension installer is not publicly downloadable", async () => {
  await assert.rejects(access(new URL("../public/doneward-chatgpt-bridge.zip", import.meta.url)));
});

test("the retirement service worker removes old caches and no longer intercepts requests", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(source, /registration\.unregister/);
  assert.match(source, /caches\.delete/);
  assert.doesNotMatch(source, /addEventListener\(["']fetch/);
});

test("the import client uses an authenticated loopback request", async () => {
  const source = await readFile(new URL("../app/import-tasks/page.tsx", import.meta.url), "utf8");
  assert.match(source, /targetAddressSpace:\s*"loopback"/);
  assert.match(source, /Authorization:\s*`Bearer \$\{token\}`/);
});
