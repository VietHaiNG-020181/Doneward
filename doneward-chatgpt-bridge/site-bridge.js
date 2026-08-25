/* global chrome */

const APP_SOURCE = "doneward-app";
const BRIDGE_SOURCE = "doneward-chatgpt-bridge";
const JOB_PREFIX = "doneward-job:";

function sendToPage(type, payload = {}) {
  window.postMessage({ source: BRIDGE_SOURCE, type, ...payload }, window.location.origin);
}

async function announceState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: "SITE_READY" });
    sendToPage("DONEWARD_BRIDGE_PONG", { activeStatus: state?.activeStatus || "" });
    if (state?.completed) {
      sendToPage("DONEWARD_CHATGPT_RESULT", state.completed);
      await chrome.runtime.sendMessage({ type: "RESULT_DELIVERED", jobId: state.completed.jobId });
    }
    if (state?.error) {
      sendToPage("DONEWARD_CHATGPT_ERROR", state.error);
      await chrome.runtime.sendMessage({ type: "RESULT_DELIVERED", jobId: state.error.jobId });
    }
  } catch {
    sendToPage("DONEWARD_BRIDGE_PONG");
  }
}

window.addEventListener("message", async (event) => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== APP_SOURCE) return;
  if (event.data.type === "DONEWARD_BRIDGE_PING") {
    await announceState();
    return;
  }
  if (event.data.type !== "DONEWARD_CHATGPT_START") return;

  const { jobId, fileName, fileSize, fileType, fileBase64, prompt } = event.data;
  if (
    typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId) ||
    typeof fileName !== "string" || !fileName.toLowerCase().endsWith(".pdf") || fileName.length > 255 ||
    typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 20 * 1024 * 1024 ||
    typeof fileType !== "string" || (fileType !== "application/pdf" && fileType !== "") ||
    typeof fileBase64 !== "string" || typeof prompt !== "string"
  ) {
    sendToPage("DONEWARD_CHATGPT_ERROR", { jobId, message: "The extension received an invalid import request." });
    return;
  }
  if (fileBase64.length > 28 * 1024 * 1024 || prompt.length > 12000) {
    sendToPage("DONEWARD_CHATGPT_ERROR", { jobId, message: "This PDF is too large for the personal bridge." });
    return;
  }

  try {
    await chrome.storage.local.set({
      [`${JOB_PREFIX}${jobId}`]: {
        jobId, fileName, fileSize, fileType, fileBase64, prompt,
        createdAt: Date.now(), status: "queued", statusMessage: "Opening a private ChatGPT tab…"
      }
    });
    const response = await chrome.runtime.sendMessage({ type: "START_IMPORT", jobId });
    if (!response?.ok) throw new Error(response?.message || "The extension could not start ChatGPT.");
    sendToPage("DONEWARD_CHATGPT_PROGRESS", { jobId, message: "Opening a private ChatGPT tab…" });
  } catch (error) {
    sendToPage("DONEWARD_CHATGPT_ERROR", { jobId, message: error instanceof Error ? error.message : "The extension could not start the import." });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "IMPORT_PROGRESS") sendToPage("DONEWARD_CHATGPT_PROGRESS", message.payload);
  if (message?.type === "IMPORT_RESULT") sendToPage("DONEWARD_CHATGPT_RESULT", message.payload);
  if (message?.type === "IMPORT_ERROR") sendToPage("DONEWARD_CHATGPT_ERROR", message.payload);
});

void announceState();
