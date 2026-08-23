import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url); workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}
test("server-renders Doneward", async () => {
  const response = await render(); assert.equal(response.status, 200); const html = await response.text(); assert.match(html, /Doneward/); assert.match(html, /Focus on what matters next/); assert.doesNotMatch(html, /codex-preview/);
});
test("server-renders the Brightspace feed checker", async () => {
  const response = await render("/feed-check"); assert.equal(response.status, 200); const html = await response.text(); assert.match(html, /Brightspace/); assert.match(html, /never uploaded or saved/);
});
