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
test("server-renders the course-outline import review", async () => {
  const response = await render("/import-tasks"); assert.equal(response.status, 200); const html = await response.text(); assert.match(html, /Import tasks/); assert.match(html, /GPT extraction/); assert.match(html, /course outlines/i);
});
test("legacy Brightspace routes redirect to task import", async () => {
  for (const pathname of ["/feed-check", "/brightspace-inbox"]) {
    const response = await render(pathname); assert.ok([307, 308].includes(response.status)); assert.equal(response.headers.get("location"), "/import-tasks");
  }
});
test("the GPT extraction endpoint fails safely when its secret is missing", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url); workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const form = new FormData(); form.set("file", new File(["%PDF-1.7"], "outline.pdf", { type: "application/pdf" }));
  const response = await worker.fetch(new Request("http://localhost/api/extract-outline", { method: "POST", body: form }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 503); assert.match(await response.text(), /secure OpenAI API key/);
});
