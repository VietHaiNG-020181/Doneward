"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ASSESSMENT_CATEGORIES, createAssessment, formatFileSize, normalizeGptExtraction, targetMinutesFor, type GptOutlineExtraction } from "@/lib/outline-import";
import { loadOutlineDrafts, loadTasks, saveOutlineDrafts, saveTasks, type DraftAssessment, type DraftCourse, type Task } from "@/lib/doneward-store";

type Notice = { tone: "success" | "error" | "info"; text: string } | null;
type BridgeState = "checking" | "ready" | "missing";
type ImportState = { phase: "idle" | "sending" | "working" | "error"; text: string };
type LegacyAssessment = Partial<DraftAssessment> & { title?: string; assessmentType?: DraftAssessment["category"] };
type LegacyCourse = Partial<DraftCourse> & { courseCode?: string; assessments?: LegacyAssessment[] };

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const BRIDGE_SOURCE = "doneward-chatgpt-bridge";
const CHATGPT_PROMPT = `Read the attached course-outline PDF carefully, including every table and scanned page. Extract every actionable graded task the student must submit, complete, present, or sit for.

Return ONLY valid JSON in this exact shape:
{
  "courseName": "Official course name",
  "tasks": [
    {
      "taskName": "Exact task name from the outline",
      "category": "assignment",
      "deadline": "2026-09-25T23:59"
    }
  ]
}

Rules:
- Include only courseName, taskName, category, and deadline.
- Never include the instructor name.
- Allowed categories: assignment, quiz, test, exam, project, lab, paper, presentation, other.
- Use YYYY-MM-DD or YYYY-MM-DDTHH:mm for deadlines.
- Use null when a complete deadline is not stated. Never guess.
- Do not turn policies, grading categories, office hours, schedule headings, or course topics into tasks.
- Re-scan the entire PDF once for missed tasks before answering.`;

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

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ImportTasksPage() {
  const [drafts, setDrafts] = useState<DraftCourse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [bridge, setBridge] = useState<BridgeState>("checking");
  const [importState, setImportState] = useState<ImportState>({ phase: "idle", text: "" });
  const activeJob = useRef<string | null>(null);

  useEffect(() => {
    loadOutlineDrafts().then((saved) => {
      const next = (saved ?? []).map((draft) => restoreDraft(draft as LegacyCourse)).filter((draft): draft is DraftCourse => Boolean(draft));
      setDrafts(next); setSelectedId(next[0]?.id ?? null);
    }).finally(() => setReady(true));
  }, []);

  useEffect(() => { if (ready) saveOutlineDrafts(drafts).catch(() => undefined); }, [drafts, ready]);

  useEffect(() => {
    const onBridgeMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== BRIDGE_SOURCE) return;
      if (event.data.type === "DONEWARD_BRIDGE_PONG") {
        setBridge("ready");
        if (event.data.activeStatus) setImportState({ phase: "working", text: String(event.data.activeStatus) });
      }
      if (event.data.type === "DONEWARD_CHATGPT_PROGRESS" && (!activeJob.current || event.data.jobId === activeJob.current)) {
        activeJob.current = event.data.jobId;
        setImportState({ phase: "working", text: String(event.data.message || "ChatGPT is reading the outline…") });
      }
      if (event.data.type === "DONEWARD_CHATGPT_ERROR" && (!activeJob.current || event.data.jobId === activeJob.current)) {
        activeJob.current = null;
        setImportState({ phase: "error", text: String(event.data.message || "The ChatGPT automation could not finish.") });
      }
      if (event.data.type === "DONEWARD_CHATGPT_RESULT" && (!activeJob.current || event.data.jobId === activeJob.current)) {
        activeJob.current = null;
        const extraction = normalizeGptExtraction(event.data.result);
        if (!extraction?.courseName || !extraction.tasks.length) {
          setImportState({ phase: "error", text: "ChatGPT returned an incomplete task list. Retry the PDF once." });
          return;
        }
        const draft = extractionToDraft(extraction, String(event.data.fileName || "course-outline.pdf"), Number(event.data.fileSize || 0));
        setDrafts((current) => [...current, draft]);
        setSelectedId(draft.id);
        setImportState({ phase: "idle", text: "" });
        setNotice({ tone: "success", text: `${draft.assessments.length} task${draft.assessments.length === 1 ? "" : "s"} returned from ChatGPT. Review them before importing.` });
      }
    };
    window.addEventListener("message", onBridgeMessage);
    checkBridge();
    const timeout = window.setTimeout(() => setBridge((value) => value === "checking" ? "missing" : value), 1200);
    return () => { window.removeEventListener("message", onBridgeMessage); window.clearTimeout(timeout); };
  }, []);

  const selected = useMemo(() => drafts.find((draft) => draft.id === selectedId) ?? null, [drafts, selectedId]);
  const busy = importState.phase === "sending" || importState.phase === "working";

  function checkBridge() {
    setBridge("checking");
    window.postMessage({ source: "doneward-app", type: "DONEWARD_BRIDGE_PING" }, window.location.origin);
    window.setTimeout(() => setBridge((value) => value === "checking" ? "missing" : value), 1200);
  }

  async function startAutomation(file: File) {
    if (bridge !== "ready") { setNotice({ tone: "error", text: "Install or enable the Doneward ChatGPT Bridge in Chrome first." }); return; }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setNotice({ tone: "error", text: "Choose a PDF course outline." }); return; }
    if (!file.size || file.size > MAX_PDF_BYTES) { setNotice({ tone: "error", text: "Choose a PDF smaller than 20 MB." }); return; }
    const jobId = crypto.randomUUID();
    activeJob.current = jobId;
    setNotice(null);
    setImportState({ phase: "sending", text: "Passing the PDF to your private browser extension…" });
    try {
      const fileBase64 = await readAsBase64(file);
      window.postMessage({ source: "doneward-app", type: "DONEWARD_CHATGPT_START", jobId, fileName: file.name, fileSize: file.size, fileType: file.type || "application/pdf", fileBase64, prompt: CHATGPT_PROMPT }, window.location.origin);
    } catch {
      activeJob.current = null;
      setImportState({ phase: "error", text: "Doneward could not read this PDF. Choose the file again." });
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
      id: crypto.randomUUID(), title: item.taskName.trim(), notes: "Imported through the personal ChatGPT bridge", deadline: item.deadline,
      targetMinutes: targetMinutesFor(item.category), focusedSeconds: 0, importance: "Unprioritized", reminderMinutes: 60,
      nextReminderAt: now + 60 * 60000, completed: false, createdAt: now + index, source: "outline",
      sourceUid: `bridge:${taskKey(selected.courseName, item.taskName, item.deadline)}`, course: selected.courseName.trim(),
      assessmentType: item.category, originalDeadline: item.deadline,
    }));
    await saveTasks([...saved, ...imported]);
    const skippedWithoutDeadline = selected.assessments.filter((item) => item.taskName.trim() && !item.deadline).length;
    const duplicates = scheduled.length - imported.length;
    const remaining = drafts.filter((draft) => draft.id !== selected.id); setDrafts(remaining); setSelectedId(remaining[0]?.id ?? null);
    const details = [skippedWithoutDeadline ? `${skippedWithoutDeadline} without a deadline skipped` : "", duplicates ? `${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped` : ""].filter(Boolean).join("; ");
    setNotice({ tone: "success", text: `${imported.length} task${imported.length === 1 ? "" : "s"} added to your plan${details ? `. ${details}` : ""}.` });
  }

  return <main className="import-app">
    <aside className="import-sidebar">
      <Link className="brand" href="/"><span className="brand-mark">D</span><span>Doneward</span></Link>
      <nav aria-label="Main navigation"><Link className="nav-item" href="/"><span>◈</span> Today</Link><Link className="nav-item" href="/"><span>○</span> All tasks</Link><Link className="nav-item active" href="/import-tasks"><span>↳</span> Import tasks</Link></nav>
      <div className="import-note"><span>◇</span><p><strong>Personal automation</strong>The extension works only in your browser. Doneward never receives your ChatGPT login or cookies.</p></div>
    </aside>

    <section className="import-workspace">
      <header className="import-header"><div><p className="eyebrow">PERSONAL CHATGPT BRIDGE</p><h1>Import a course outline</h1><p>Upload once in Doneward. Your browser extension opens ChatGPT, applies the extraction rules, and brings the JSON back for review.</p></div>{bridge === "ready" && <span className="bridge-badge"><i /> Extension connected</span>}</header>
      {notice && <div className={`import-notice ${notice.tone}`} role="status"><span>{notice.tone === "success" ? "✓" : notice.tone === "error" ? "!" : "i"}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}

      {bridge !== "ready" ? <section className="bridge-setup">
        <div className="bridge-setup-mark">D↔C</div>
        <div><p className="eyebrow">ONE-TIME SETUP</p><h2>Connect Doneward to ChatGPT</h2><p>This personal Chrome/Edge extension performs the upload and copy-back steps in your own signed-in browser. It does not access your password or session cookies.</p></div>
        <ol><li><b>1</b><span><strong>Download the extension</strong><small>Save and unzip the Doneward ChatGPT Bridge.</small></span></li><li><b>2</b><span><strong>Load it in Chrome or Edge</strong><small>Open Extensions, enable Developer mode, then choose Load unpacked.</small></span></li><li><b>3</b><span><strong>Sign in to ChatGPT</strong><small>Keep your normal ChatGPT account signed in, then return here.</small></span></li></ol>
        <div className="bridge-setup-actions"><a className="primary-button" href="/doneward-chatgpt-bridge.zip" download>Download extension</a><a className="secondary-button" href="https://chatgpt.com/" target="_blank" rel="noreferrer">Open ChatGPT</a><button className="secondary-button" onClick={checkBridge}>{bridge === "checking" ? "Checking…" : "I installed it · Check again"}</button></div>
        <p className="bridge-limit">Prototype note: because this operates the ChatGPT interface, a future ChatGPT redesign may require an extension update.</p>
      </section> : <>
        <label className={`automation-drop ${busy ? "busy" : ""}`} onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
          <input type="file" accept="application/pdf,.pdf" onChange={onFiles} disabled={busy} />
          {busy ? <><span className="automation-spinner" /><h2>{importState.phase === "sending" ? "Preparing your outline" : "ChatGPT is working"}</h2><p>{importState.text}</p><strong>Keep this page open. The ChatGPT tab can stay in the background.</strong></> : <><span>↑</span><h2>Drop your course-outline PDF here</h2><p>One PDF at a time, up to 20 MB.</p><strong>Browse PDF files</strong></>}
        </label>
        {importState.phase === "error" && <div className="automation-error"><span>!</span><div><strong>The automatic import stopped</strong><p>{importState.text}</p></div><button className="secondary-button" onClick={() => setImportState({ phase: "idle", text: "" })}>Try another PDF</button></div>}
        <section className="automation-steps"><div><b>1</b><span><strong>You upload here</strong><small>The PDF is handed directly to your extension.</small></span></div><div><b>2</b><span><strong>ChatGPT extracts</strong><small>A background tab applies Doneward’s fixed rules.</small></span></div><div><b>3</b><span><strong>You review</strong><small>Only the four requested fields return to Doneward.</small></span></div></section>
      </>}

      <section className="import-intro"><div><strong>{drafts.length}</strong><span>courses to review</span></div><p><strong>Review stays mandatory:</strong> check the course name, task name, category, and deadline before adding anything to your plan.</p></section>

      {!ready ? <div className="import-empty">Loading saved drafts…</div> : selected && <div className="import-layout">
        <aside className="draft-list" aria-label="Courses awaiting review"><div className="draft-list-head"><span>REVIEW QUEUE</span><b>{drafts.length}</b></div>{drafts.map((draft) => <button key={draft.id} className={draft.id === selected.id ? "active" : ""} onClick={() => setSelectedId(draft.id)}><span>AI</span><div><strong>{courseLabel(draft)}</strong><small>{draft.assessments.length} tasks · {draft.fileName}</small></div></button>)}</aside>
        <section className="review-panel">
          <div className="review-panel-head"><div><p className="eyebrow">REVIEW DRAFT</p><h2>{courseLabel(selected)}</h2><span>{selected.fileName} · {formatFileSize(selected.fileSize)}</span></div><button className="delete-button" onClick={removeCourse}>Remove draft</button></div>
          <div className="course-fields course-fields-simple"><label>Course name<input value={selected.courseName} onChange={(event) => updateCourse({ courseName: event.target.value })} placeholder="e.g. Software Engineering" /></label></div>
          <div className="extraction-state success"><span>✓</span><div><strong>{selected.assessments.length} task{selected.assessments.length === 1 ? "" : "s"} returned from ChatGPT</strong><p>Review the four requested fields below, then import the confirmed deadlines.</p></div></div>
          <div className="assessment-heading"><div><h3>Course tasks</h3><p>Unknown deadlines stay blank until you fill them in.</p></div><button className="secondary-button" onClick={() => updateCourse({ assessments: [...selected.assessments, createAssessment()] })}>+ Add task</button></div>
          <div className="assessment-list">{selected.assessments.length === 0 ? <div className="assessment-empty">No tasks were returned. Add one manually or retry the outline.</div> : selected.assessments.map((item, index) => <article className="assessment-row assessment-row-simple" key={item.id}><div className="assessment-number">{index + 1}</div><label>Task name<input value={item.taskName} onChange={(event) => updateAssessment(item.id, { taskName: event.target.value })} placeholder="e.g. Assignment 1" /></label><label>Category<select value={item.category} onChange={(event) => updateAssessment(item.id, { category: event.target.value as DraftAssessment["category"] })}>{ASSESSMENT_CATEGORIES.map((category) => <option value={category} key={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}</select></label><label>Deadline<input value={item.deadline} onChange={(event) => updateAssessment(item.id, { deadline: event.target.value })} placeholder="YYYY-MM-DD or date + time" /></label><button className="remove-assessment" onClick={() => removeAssessment(item.id)} aria-label={`Remove task ${index + 1}`}>×</button></article>)}</div>
          <footer className="review-footer"><p>Imported tasks start as <strong>Unprioritized</strong>, and Doneward orders them by urgency and nearest deadline.</p><div><Link className="secondary-button" href="/">Cancel</Link><button className="primary-button" onClick={confirmCourse}>Import tasks</button></div></footer>
        </section>
      </div>}
    </section>
  </main>;
}
