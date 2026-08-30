import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url); workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}
test("server-renders Doneward", async () => {
  const response = await render(); assert.equal(response.status, 200); assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/); assert.equal(response.headers.get("x-frame-options"), "DENY"); assert.equal(response.headers.get("x-content-type-options"), "nosniff"); const html = await response.text(); assert.match(html, /Doneward/); assert.match(html, /Focus on what matters next/); assert.doesNotMatch(html, /codex-preview/);
});
test("server-renders the private local import workflow", async () => {
  const response = await render("/import-tasks"); assert.equal(response.status, 200); const html = await response.text(); assert.match(html, /Import a course outline/); assert.match(html, /Checking the private backend/); assert.match(html, /Ollama runs locally/); assert.doesNotMatch(html, /Download extension/);
});
test("legacy Brightspace routes redirect to task import", async () => {
  for (const pathname of ["/feed-check", "/brightspace-inbox"]) {
    const response = await render(pathname); assert.ok([307, 308].includes(response.status)); assert.equal(response.headers.get("location"), "/import-tasks");
  }
});
