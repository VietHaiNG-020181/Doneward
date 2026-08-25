/* global chrome */

const CATEGORIES = new Set(["assignment", "quiz", "test", "exam", "project", "lab", "paper", "presentation", "other"]);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(find, timeout = 30000, interval = 300) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = find();
    if (value) return value;
    await sleep(interval);
  }
  throw new Error("Timed out waiting for the ChatGPT interface.");
}

function bytesFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function progress(jobId, message) {
  await chrome.runtime.sendMessage({ type: "CHATGPT_PROGRESS", jobId, message });
}

function findComposer() {
  return document.querySelector("#prompt-textarea") || document.querySelector('[contenteditable="true"][data-lexical-editor="true"]') || document.querySelector('textarea[placeholder*="Message"]');
}

function setComposerText(composer, text) {
  composer.focus();
  if (composer instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(composer, text);
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(composer);
  selection?.removeAllRanges(); selection?.addRange(range);
  document.execCommand("insertText", false, text);
  composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
}

async function findFileInput() {
  let input = document.querySelector('input[type="file"]');
  if (input) return input;
  const attach = [...document.querySelectorAll("button")].find((button) => /attach|upload|add files/i.test(`${button.getAttribute("aria-label") || ""} ${button.getAttribute("data-testid") || ""}`));
  attach?.click();
  input = await waitFor(() => document.querySelector('input[type="file"]'), 12000);
  return input;
}

function parseResult(text, root) {
  const candidates = [...root.querySelectorAll("pre code")].map((node) => node.textContent || "");
  candidates.push(text);
  for (const candidate of candidates) {
    const cleaned = candidate.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      const value = JSON.parse(cleaned.slice(start, end + 1));
      if (typeof value.courseName !== "string" || !Array.isArray(value.tasks)) continue;
      const tasks = value.tasks.filter((task) => task && typeof task.taskName === "string" && CATEGORIES.has(task.category)).map((task) => ({
        taskName: task.taskName.trim(), category: task.category,
        deadline: typeof task.deadline === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(task.deadline) ? task.deadline : null
      })).filter((task) => task.taskName);
      if (value.courseName.trim() && tasks.length) return { courseName: value.courseName.trim(), tasks };
    } catch { /* try the next candidate */ }
  }
  return null;
}

async function runJob(job) {
  const { jobId } = job;
  const composer = await waitFor(findComposer, 25000).catch(() => null);
  if (!composer) throw new Error("Please sign in to ChatGPT in this browser, then return to Doneward and retry.");

  await progress(jobId, "Uploading the PDF to ChatGPT…");
  const input = await findFileInput();
  const file = new File([bytesFromBase64(job.fileBase64)], job.fileName, { type: job.fileType || "application/pdf" });
  const transfer = new DataTransfer(); transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(1800);

  await progress(jobId, "Applying Doneward’s extraction rules…");
  setComposerText(composer, job.prompt);
  const assistantCount = document.querySelectorAll('[data-message-author-role="assistant"]').length;
  const send = await waitFor(() => {
    const button = document.querySelector('button[data-testid="send-button"]') || [...document.querySelectorAll("button")].find((item) => /^send/i.test(item.getAttribute("aria-label") || ""));
    return button && !button.disabled ? button : null;
  }, 20000);
  send.click();
  await progress(jobId, "ChatGPT is reading the complete outline…");

  let stableText = ""; let stableCount = 0; let latest = null;
  const started = Date.now();
  while (Date.now() - started < 5 * 60 * 1000) {
    const assistants = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (assistants.length > assistantCount) {
      latest = assistants[assistants.length - 1];
      const text = latest.innerText || latest.textContent || "";
      stableCount = text === stableText && text.length > 20 ? stableCount + 1 : 0;
      stableText = text;
      const stop = document.querySelector('button[data-testid="stop-button"], button[aria-label*="Stop"]');
      if (stableCount >= 3 && !stop) break;
    }
    await sleep(1000);
  }
  if (!latest) throw new Error("ChatGPT did not return a response before the bridge timed out.");
  const result = parseResult(stableText, latest);
  if (!result) throw new Error("ChatGPT returned a response, but it was not valid Doneward JSON. Retry the outline once.");
  await progress(jobId, "Returning the task list to Doneward…");
  await chrome.runtime.sendMessage({ type: "CHATGPT_RESULT", jobId, result });
}

(async () => {
  const claim = await chrome.runtime.sendMessage({ type: "CHATGPT_READY" });
  if (!claim?.ok) return;
  const job = (await chrome.storage.local.get(claim.storageKey))[claim.storageKey];
  if (!job) return;
  try { await runJob(job); }
  catch (error) { await chrome.runtime.sendMessage({ type: "CHATGPT_ERROR", jobId: job.jobId, message: error instanceof Error ? error.message : "The ChatGPT automation stopped." }); }
})();
