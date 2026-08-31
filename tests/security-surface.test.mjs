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

test("cloud task storage derives ownership from authenticated headers", async () => {
  const source = await readFile(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8");
  assert.match(source, /getChatGPTUser/);
  assert.match(source, /user\.userId/);
  assert.doesNotMatch(source, /input\.userId|payload\.userId/);
  assert.match(source, /sec-fetch-site/);
  assert.match(source, /MAX_SYNC_TASKS/);
});

test("offline synchronization retains deletion tombstones", async () => {
  const store = await readFile(new URL("../lib/doneward-store.ts", import.meta.url), "utf8");
  const sync = await readFile(new URL("../lib/task-sync.ts", import.meta.url), "utf8");
  assert.match(store, /deleted-tasks/);
  assert.match(store, /rememberTaskDeletion/);
  assert.match(sync, /credentials:\s*"same-origin"/);
  assert.match(sync, /saveDeletedTasks/);
});
