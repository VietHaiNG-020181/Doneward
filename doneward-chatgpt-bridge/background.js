/* global chrome */

const JOB_PREFIX = "doneward-job:";
const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const DONEWARD_ORIGIN = "https://doneward-focus.hyperwarev.chatgpt.site";

function senderOrigin(sender) {
  try { return sender?.tab?.url ? new URL(sender.tab.url).origin : null; }
  catch { return null; }
}

function isDonewardSender(sender) {
  if (sender?.id !== chrome.runtime.id || !sender?.tab?.url) return false;
  try {
    const url = new URL(sender.tab.url);
    return url.origin === DONEWARD_ORIGIN || (url.protocol === "http:" && url.hostname === "localhost");
  } catch { return false; }
}

function isChatGPTSender(sender) {
  return sender?.id === chrome.runtime.id && senderOrigin(sender) === "https://chatgpt.com";
}

async function allJobs() {
  const values = await chrome.storage.local.get(null);
  const now = Date.now();
  const jobs = Object.entries(values).filter(([key]) => key.startsWith(JOB_PREFIX)).map(([key, value]) => ({ key, ...value }));
  const staleKeys = jobs.filter((job) => now - (job.updatedAt || job.createdAt || 0) > JOB_TTL_MS).map((job) => job.key);
  if (staleKeys.length) await chrome.storage.local.remove(staleKeys);
  return jobs.filter((job) => !staleKeys.includes(job.key));
}

async function getJob(jobId) {
  const key = `${JOB_PREFIX}${jobId}`;
  return (await chrome.storage.local.get(key))[key];
}

async function patchJob(jobId, patch) {
  const key = `${JOB_PREFIX}${jobId}`;
  const current = await getJob(jobId);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: Date.now() };
  await chrome.storage.local.set({ [key]: next });
  return next;
}

async function notifySite(job, type, payload) {
  if (!job?.originTabId) return;
  try { await chrome.tabs.sendMessage(job.originTabId, { type, payload }); } catch { /* The app can retrieve the stored result after reopening. */ }
}

async function startImport(jobId, originTabId) {
  const active = (await allJobs()).find((job) => ["opening", "working"].includes(job.status));
  if (active && active.jobId !== jobId) return { ok: false, message: "Another course outline is already being processed." };
  let job = await patchJob(jobId, { originTabId, status: "opening", statusMessage: "Opening a private ChatGPT tab…" });
  if (!job) return { ok: false, message: "The saved PDF could not be found." };
  const tab = await chrome.tabs.create({ url: "https://chatgpt.com/", active: false });
  job = await patchJob(jobId, { chatgptTabId: tab.id });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "START_IMPORT") {
      if (!isDonewardSender(sender)) { sendResponse({ ok: false }); return; }
      sendResponse(await startImport(message.jobId, sender.tab?.id));
      return;
    }
    if (message?.type === "CHATGPT_READY") {
      if (!isChatGPTSender(sender)) { sendResponse({ ok: false }); return; }
      const job = (await allJobs()).find((item) => item.chatgptTabId === sender.tab?.id && ["opening", "working"].includes(item.status));
      if (!job) { sendResponse({ ok: false }); return; }
      await patchJob(job.jobId, { status: "working", statusMessage: "Uploading the PDF to ChatGPT…" });
      sendResponse({ ok: true, jobId: job.jobId, storageKey: job.key });
      return;
    }
    if (message?.type === "CHATGPT_PROGRESS") {
      if (!isChatGPTSender(sender)) { sendResponse({ ok: false }); return; }
      const current = await getJob(message.jobId);
      if (!current || current.chatgptTabId !== sender.tab?.id) { sendResponse({ ok: false }); return; }
      const job = await patchJob(message.jobId, { status: "working", statusMessage: message.message });
      await notifySite(job, "IMPORT_PROGRESS", { jobId: message.jobId, message: message.message });
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "CHATGPT_RESULT") {
      if (!isChatGPTSender(sender)) { sendResponse({ ok: false }); return; }
      const current = await getJob(message.jobId);
      if (!current || current.chatgptTabId !== sender.tab?.id) { sendResponse({ ok: false }); return; }
      const compact = { ...current, fileBase64: undefined, prompt: undefined, status: "complete", result: message.result, statusMessage: "Task list ready" };
      await chrome.storage.local.set({ [`${JOB_PREFIX}${message.jobId}`]: compact });
      await notifySite(compact, "IMPORT_RESULT", { jobId: message.jobId, result: message.result, fileName: compact.fileName, fileSize: compact.fileSize });
      if (compact.chatgptTabId) try { await chrome.tabs.remove(compact.chatgptTabId); } catch { /* already closed */ }
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "CHATGPT_ERROR") {
      if (!isChatGPTSender(sender)) { sendResponse({ ok: false }); return; }
      const current = await getJob(message.jobId);
      if (!current || current.chatgptTabId !== sender.tab?.id) { sendResponse({ ok: false }); return; }
      const compact = { ...current, fileBase64: undefined, prompt: undefined, status: "error", errorMessage: message.message, statusMessage: message.message };
      await chrome.storage.local.set({ [`${JOB_PREFIX}${message.jobId}`]: compact });
      await notifySite(compact, "IMPORT_ERROR", { jobId: message.jobId, message: message.message });
      if (/sign in/i.test(message.message) && compact.chatgptTabId) try { await chrome.tabs.update(compact.chatgptTabId, { active: true }); } catch { /* tab closed */ }
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "SITE_READY") {
      if (!isDonewardSender(sender)) { sendResponse({ ok: false }); return; }
      const jobs = (await allJobs()).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
      const complete = jobs.find((job) => job.status === "complete");
      const failed = jobs.find((job) => job.status === "error");
      const active = jobs.find((job) => ["opening", "working"].includes(job.status));
      sendResponse({
        activeStatus: active?.statusMessage || "",
        completed: complete ? { jobId: complete.jobId, result: complete.result, fileName: complete.fileName, fileSize: complete.fileSize } : null,
        error: failed ? { jobId: failed.jobId, message: failed.errorMessage || failed.statusMessage } : null
      });
      return;
    }
    if (message?.type === "RESULT_DELIVERED") {
      if (!isDonewardSender(sender)) { sendResponse({ ok: false }); return; }
      await chrome.storage.local.remove(`${JOB_PREFIX}${message.jobId}`);
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false });
  })().catch((error) => sendResponse({ ok: false, message: error instanceof Error ? error.message : "Bridge error" }));
  return true;
});
