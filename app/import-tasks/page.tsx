"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production navigation currently fails through next/link. */

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { ASSESSMENT_CATEGORIES, createAssessment, formatFileSize, normalizeGptExtraction, targetMinutesFor, type GptOutlineExtraction } from "@/lib/outline-import";
import { loadBackendPairingToken, loadOutlineDrafts, loadTasks, saveBackendPairingToken, saveOutlineDrafts, saveTasks, type DraftAssessment, type DraftCourse, type Task } from "@/lib/doneward-store";
import { synchronizeTasks } from "@/lib/task-sync";

type Notice = { tone: "success" | "error" | "info"; text: string } | null;
type BackendState = "checking" | "ready" | "unpaired" | "missing";
type ImportState = { phase: "idle" | "sending" | "working" | "error"; text: string };
type LegacyAssessment = Partial<DraftAssessment> & { title?: string; assessmentType?: DraftAssessment["category"] };
type LegacyCourse = Partial<DraftCourse> & { courseCode?: string; assessments?: LegacyAssessment[] };

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const BACKEND_URL = "http://127.0.0.1:4317";

type LoopbackRequestInit = RequestInit & { targetAddressSpace?: "loopback" };

function backendFetch(path: string, init: RequestInit = {}) {
  const request = new Request(`${BACKEND_URL}${path}`, {
    ...init,
    targetAddressSpace: "loopback",
  } as LoopbackRequestInit);
  return fetch(request);
}

function courseLabel(course: DraftCourse) {
  return course.courseName.trim() || "Untitled course";
}

function restoreDraft(value: LegacyCourse): DraftCourse | null {
  if (!value.id || !value.fileName || typeof value.fileSize !== "number") return null;
  return {
    id: value.id,
    fileName: value.fileName,
    fileSize: value.fileSize,
    courseName: value.courseName?.trim() || value.courseCode?.trim() || "",
    uploadedAt: value.uploadedAt ?? Date.now(),
    parseStatus: value.parseStatus === "extracted" || value.parseStatus === "manual" ? value.parseStatus : "manual",
    assessments: (value.assessments ?? []).map((item) => ({
      id: item.id ?? crypto.randomUUID(), taskName: item.taskName ?? item.title ?? "",
      category: item.category ?? item.assessmentType ?? "other", deadline: item.deadline ?? "",
    })),
  };
}

function extractionToDraft(extraction: GptOutlineExtraction, fileName: string, fileSize: number): DraftCourse {
  return {
    id: crypto.randomUUID(), fileName, fileSize, courseName: extraction.courseName,
    uploadedAt: Date.now(), parseStatus: "extracted",
    assessments: extraction.tasks.map((task) => ({ id: crypto.randomUUID(), taskName: task.taskName, category: task.category, deadline: task.deadline ?? "" })),
  };
}

export default function ImportTasksPage() {
  const [drafts, setDrafts] = useState<DraftCourse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [backend, setBackend] = useState<BackendState>("checking");
  const [pairingCode, setPairingCode] = useState("");
  const [importState, setImportState] = useState<ImportState>({ phase: "idle", text: "" });

  useEffect(() => {
    loadOutlineDrafts().then((saved) => {
      const next = (saved ?? []).map((draft) => restoreDraft(draft as LegacyCourse)).filter((draft): draft is DraftCourse => Boolean(draft));
      setDrafts(next); setSelectedId(next[0]?.id ?? null);
    }).finally(() => setReady(true));
  }, []);

  useEffect(() => { if (ready) saveOutlineDrafts(drafts).catch(() => undefined); }, [drafts, ready]);

  useEffect(() => { void checkBackend(); }, []);

  const selected = useMemo(() => drafts.find((draft) => draft.id === selectedId) ?? null, [drafts, selectedId]);
  const busy = importState.phase === "sending" || importState.phase === "working";

  async function checkBackend(candidateToken?: string) {
    setBackend("checking");
    try {
      const token = candidateToken ?? await loadBackendPairingToken() ?? "";
      const response = await backendFetch("/health", {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (response.ok) {
        if (candidateToken) await saveBackendPairingToken(candidateToken);
        setPairingCode("");
        setBackend("ready");
      } else {
        setBackend(response.status === 401 ? "unpaired" : "missing");
      }
    } catch {
      setBackend("missing");
    }
  }

  async function pairBackend() {
    const token = pairingCode.trim();
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
      setNotice({ tone: "error", text: "Paste the complete pairing code shown by the local backend." });
      return;
    }
    await checkBackend(token);
  }

  async function startAutomation(file: File) {
    if (backend !== "ready") { setNotice({ tone: "error", text: "Start the Doneward local backend on this Mac first." }); return; }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setNotice({ tone: "error", text: "Choose a PDF course outline." }); return; }
    if (!file.size || file.size > MAX_PDF_BYTES) { setNotice({ tone: "error", text: "Choose a PDF smaller than 20 MB." }); return; }
    setNotice(null);
    setImportState({ phase: "sending", text: "Sending the PDF to the private backend on this Mac…" });
    try {
      const token = await loadBackendPairingToken();
      if (!token) { setBackend("unpaired"); throw new Error("Pair this browser with the Doneward backend first."); }
      setImportState({ phase: "working", text: "Extracting the outline with the local model. This can take a few minutes." });
      const response = await backendFetch("/extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent(file.name) },
        body: file,
      });
      const result = await response.json() as { extraction?: unknown; error?: string };
      if (response.status === 401) setBackend("unpaired");
      if (!response.ok) throw new Error(result.error || "The local extraction could not finish.");
      const extraction = normalizeGptExtraction(result.extraction);
      if (!extraction?.courseName || !extraction.tasks.length) throw new Error("The local model returned an incomplete task list. Review the PDF and retry once.");
      const draft = extractionToDraft(extraction, file.name, file.size);
      setDrafts((current) => [...current, draft]);
      setSelectedId(draft.id);
      setImportState({ phase: "idle", text: "" });
      setNotice({ tone: "success", text: `${draft.assessments.length} task${draft.assessments.length === 1 ? "" : "s"} extracted locally. Review them before importing.` });
    } catch (error) {
      setImportState({ phase: "error", text: error instanceof Error ? error.message : "Doneward could not process this PDF." });
    }
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (file) void startAutomation(file); event.target.value = ""; }
  function onDrop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void startAutomation(file); }

  function updateCourse(patch: Partial<DraftCourse>) { if (selected) setDrafts((current) => current.map((draft) => draft.id === selected.id ? { ...draft, ...patch } : draft)); }
  function updateAssessment(id: string, patch: Partial<DraftAssessment>) { if (selected) updateCourse({ assessments: selected.assessments.map((item) => item.id === id ? { ...item, ...patch } : item) }); }
  function removeAssessment(id: string) { if (selected) updateCourse({ assessments: selected.assessments.filter((item) => item.id !== id) }); }
  function removeCourse() { if (!selected) return; const remaining = drafts.filter((draft) => draft.id !== selected.id); setDrafts(remaining); setSelectedId(remaining[0]?.id ?? null); setNotice({ tone: "info", text: "Draft removed." }); }

  async function confirmCourse() {
    if (!selected) return;
    if (!selected.courseName.trim()) { setNotice({ tone: "error", text: "Add the course name before importing." }); return; }
    const scheduled = selected.assessments.filter((item) => item.taskName.trim() && item.deadline);
    if (!scheduled.length) { setNotice({ tone: "error", text: "Add at least one task with a name and deadline." }); return; }
    const saved = await loadTasks() ?? [];
    const taskKey = (course: string, title: string, deadline: string) => `${course.trim().toLowerCase()}|${title.trim().toLowerCase()}|${deadline}`;
    const existing = new Set(saved.map((task) => taskKey(task.course ?? "", task.title, task.deadline)));
    const now = Date.now();
    const imported: Task[] = scheduled.filter((item) => !existing.has(taskKey(selected.courseName, item.taskName, item.deadline))).map((item, index) => ({
      id: crypto.randomUUID(), title: item.taskName.trim(), notes: "Imported through the private local outline extractor", deadline: item.deadline,
      targetMinutes: targetMinutesFor(item.category), focusedSeconds: 0, importance: "Unprioritized", reminderMinutes: 60,
      nextReminderAt: now + 60 * 60000, completed: false, createdAt: now + index, source: "outline",
      sourceUid: `local:${taskKey(selected.courseName, item.taskName, item.deadline)}`, course: selected.courseName.trim(),
      assessmentType: item.category, originalDeadline: item.deadline,
      updatedAt: now + index,
    }));
    const nextTasks = [...saved, ...imported];
    await saveTasks(nextTasks);
    void synchronizeTasks(nextTasks).catch(() => undefined);
    const skippedWithoutDeadline = selected.assessments.filter((item) => item.taskName.trim() && !item.deadline).length;
    const duplicates = scheduled.length - imported.length;
    const remaining = drafts.filter((draft) => draft.id !== selected.id); setDrafts(remaining); setSelectedId(remaining[0]?.id ?? null);
    const details = [skippedWithoutDeadline ? `${skippedWithoutDeadline} without a deadline skipped` : "", duplicates ? `${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped` : ""].filter(Boolean).join("; ");
    setNotice({ tone: "success", text: `${imported.length} task${imported.length === 1 ? "" : "s"} added to your plan${details ? `. ${details}` : ""}.` });
  }

  return <main className="import-app">
    <aside className="import-sidebar">
      <a className="brand" href="/"><span className="brand-mark">D</span><span>Doneward</span></a>
      <nav aria-label="Main navigation"><a className="nav-item" href="/"><span>◈</span> Today</a><a className="nav-item" href="/"><span>○</span> All tasks</a><a className="nav-item active" href="/import-tasks"><span>↳</span> Import tasks</a></nav>
      <div className="import-note"><span>◇</span><p><strong>Private local AI</strong>The outline stays on this Mac and is processed without an API key or browser extension.</p></div>
    </aside>

    <section className="import-workspace">
      <header className="import-header"><div><p className="eyebrow">PRIVATE LOCAL EXTRACTION</p><h1>Import a course outline</h1><p>Upload once in Doneward. The backend on this Mac reads the PDF and returns a private draft for review.</p></div>{backend === "ready" && <span className="bridge-badge"><i /> Local backend ready</span>}</header>
      {notice && <div className={`import-notice ${notice.tone}`} role="status"><span>{notice.tone === "success" ? "✓" : notice.tone === "error" ? "!" : "i"}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}

      {backend !== "ready" ? <section className="bridge-setup">
        <div className="bridge-setup-mark">D↔AI</div>
        <div><p className="eyebrow">LOCAL SERVICE</p><h2>{backend === "checking" ? "Checking the private backend" : backend === "unpaired" ? "Pair this browser" : "The private backend is offline"}</h2><p>{backend === "unpaired" ? "A one-device code prevents other websites from controlling the AI service on this Mac." : "Doneward uses Ollama on this Mac. No PDF, login, or task data is sent to an external AI provider."}</p></div>
        <ol><li><b>1</b><span><strong>Ollama runs locally</strong><small>The model stays on this Mac.</small></span></li><li><b>2</b><span><strong>PDF text is temporary</strong><small>It is processed in memory and not retained.</small></span></li><li><b>3</b><span><strong>You remain in control</strong><small>Every extracted deadline still requires review.</small></span></li></ol>
        {backend === "unpaired" ? <div className="bridge-setup-actions pair-actions"><a className="secondary-button" href={`${BACKEND_URL}/pair`} target="_blank" rel="noreferrer">Open pairing code</a><label><span>Pairing code</span><input type="password" autoComplete="off" value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} placeholder="Paste the code from the local page" /></label><button className="primary-button" onClick={pairBackend}>Pair securely</button></div> : <div className="bridge-setup-actions"><button className="primary-button" onClick={() => void checkBackend()}>{backend === "checking" ? "Checking…" : "Check backend again"}</button></div>}
        <p className="bridge-limit">The local service must be running and paired on this Mac before an outline can be imported.</p>
      </section> : <>
        <label className={`automation-drop ${busy ? "busy" : ""}`} onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
          <input type="file" accept="application/pdf,.pdf" onChange={onFiles} disabled={busy} />
          {busy ? <><span className="automation-spinner" /><h2>{importState.phase === "sending" ? "Preparing your outline" : "Local AI is working"}</h2><p>{importState.text}</p><strong>Keep this page open until the review draft appears.</strong></> : <><span>↑</span><h2>Drop your course-outline PDF here</h2><p>One PDF at a time, up to 20 MB.</p><strong>Browse PDF files</strong></>}
        </label>
        {importState.phase === "error" && <div className="automation-error"><span>!</span><div><strong>The automatic import stopped</strong><p>{importState.text}</p></div><button className="secondary-button" onClick={() => setImportState({ phase: "idle", text: "" })}>Try another PDF</button></div>}
        <section className="automation-steps"><div><b>1</b><span><strong>You upload here</strong><small>The PDF goes only to this Mac.</small></span></div><div><b>2</b><span><strong>Local AI extracts</strong><small>Ollama applies Doneward’s fixed rules.</small></span></div><div><b>3</b><span><strong>You review</strong><small>Only the four requested fields return to Doneward.</small></span></div></section>
      </>}

      <section className="import-intro"><div><strong>{drafts.length}</strong><span>courses to review</span></div><p><strong>Review stays mandatory:</strong> check the course name, task name, category, and deadline before adding anything to your plan.</p></section>

      {!ready ? <div className="import-empty">Loading saved drafts…</div> : selected && <div className="import-layout">
        <aside className="draft-list" aria-label="Courses awaiting review"><div className="draft-list-head"><span>REVIEW QUEUE</span><b>{drafts.length}</b></div>{drafts.map((draft) => <button key={draft.id} className={draft.id === selected.id ? "active" : ""} onClick={() => setSelectedId(draft.id)}><span>AI</span><div><strong>{courseLabel(draft)}</strong><small>{draft.assessments.length} tasks · {draft.fileName}</small></div></button>)}</aside>
        <section className="review-panel">
          <div className="review-panel-head"><div><p className="eyebrow">REVIEW DRAFT</p><h2>{courseLabel(selected)}</h2><span>{selected.fileName} · {formatFileSize(selected.fileSize)}</span></div><button className="delete-button" onClick={removeCourse}>Remove draft</button></div>
          <div className="course-fields course-fields-simple"><label>Course name<input value={selected.courseName} onChange={(event) => updateCourse({ courseName: event.target.value })} placeholder="e.g. Software Engineering" /></label></div>
          <div className="extraction-state success"><span>✓</span><div><strong>{selected.assessments.length} task{selected.assessments.length === 1 ? "" : "s"} extracted locally</strong><p>Review the four requested fields below, then import the confirmed deadlines.</p></div></div>
          <div className="assessment-heading"><div><h3>Course tasks</h3><p>Unknown deadlines stay blank until you fill them in.</p></div><button className="secondary-button" onClick={() => updateCourse({ assessments: [...selected.assessments, createAssessment()] })}>+ Add task</button></div>
          <div className="assessment-list">{selected.assessments.length === 0 ? <div className="assessment-empty">No tasks were returned. Add one manually or retry the outline.</div> : selected.assessments.map((item, index) => <article className="assessment-row assessment-row-simple" key={item.id}><div className="assessment-number">{index + 1}</div><label>Task name<input value={item.taskName} onChange={(event) => updateAssessment(item.id, { taskName: event.target.value })} placeholder="e.g. Assignment 1" /></label><label>Category<select value={item.category} onChange={(event) => updateAssessment(item.id, { category: event.target.value as DraftAssessment["category"] })}>{ASSESSMENT_CATEGORIES.map((category) => <option value={category} key={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}</select></label><label>Deadline<input value={item.deadline} onChange={(event) => updateAssessment(item.id, { deadline: event.target.value })} placeholder="YYYY-MM-DD or date + time" /></label><button className="remove-assessment" onClick={() => removeAssessment(item.id)} aria-label={`Remove task ${index + 1}`}>×</button></article>)}</div>
          <footer className="review-footer"><p>Imported tasks start as <strong>Unprioritized</strong>, and Doneward orders them by urgency and nearest deadline.</p><div><a className="secondary-button" href="/">Cancel</a><button className="primary-button" onClick={confirmCourse}>Import tasks</button></div></footer>
        </section>
      </div>}
    </section>
  </main>;
}
