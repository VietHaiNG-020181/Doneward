"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { ASSESSMENT_CATEGORIES, createAssessment, createCourseDraft, formatFileSize, isPdf, MAX_OUTLINE_BYTES, targetMinutesFor, type GptOutlineExtraction } from "@/lib/outline-import";
import { loadOutlineDrafts, loadTasks, saveOutlineDrafts, saveTasks, type DraftAssessment, type DraftCourse, type Task } from "@/lib/doneward-store";

type Notice = { tone: "success" | "error" | "info"; text: string } | null;
type LegacyAssessment = Partial<DraftAssessment> & { title?: string; assessmentType?: DraftAssessment["category"] };
type LegacyCourse = Partial<DraftCourse> & { courseCode?: string; assessments?: LegacyAssessment[] };

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
    parseStatus: value.parseStatus === "extracted" || value.parseStatus === "manual" ? value.parseStatus : "failed",
    assessments: (value.assessments ?? []).map((item) => ({
      id: item.id ?? crypto.randomUUID(),
      taskName: item.taskName ?? item.title ?? "",
      category: item.category ?? item.assessmentType ?? "other",
      deadline: item.deadline ?? "",
    })),
  };
}

function extractionToDraft(draft: DraftCourse, extraction: GptOutlineExtraction): DraftCourse {
  return {
    ...draft,
    courseName: extraction.courseName,
    assessments: extraction.tasks.map((task) => ({ id: crypto.randomUUID(), taskName: task.taskName, category: task.category, deadline: task.deadline ?? "" })),
    parseStatus: "extracted",
  };
}

export default function ImportTasksPage() {
  const [drafts, setDrafts] = useState<DraftCourse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [progress, setProgress] = useState<Record<string, string>>({});

  useEffect(() => {
    loadOutlineDrafts().then((saved) => {
      const next = (saved ?? []).map((draft) => restoreDraft(draft as LegacyCourse)).filter((draft): draft is DraftCourse => Boolean(draft));
      setDrafts(next);
      setSelectedId(next[0]?.id ?? null);
    }).finally(() => setReady(true));
  }, []);

  useEffect(() => { if (ready) saveOutlineDrafts(drafts).catch(() => undefined); }, [drafts, ready]);

  const selected = useMemo(() => drafts.find((draft) => draft.id === selectedId) ?? null, [drafts, selectedId]);

  async function addFiles(files: File[]) {
    const valid = files.filter((file) => isPdf(file) && file.size <= MAX_OUTLINE_BYTES);
    const rejected = files.length - valid.length;
    const unique = valid.filter((file) => !drafts.some((draft) => draft.fileName === file.name && draft.fileSize === file.size));
    if (!unique.length) {
      setNotice({ tone: "error", text: rejected ? "Choose PDF files smaller than 20 MB." : "Those outlines are already in your review list." });
      return;
    }

    const added = unique.map(createCourseDraft);
    setDrafts((current) => [...current, ...added]);
    setSelectedId(added[0].id);
    setNotice({ tone: "info", text: `GPT is reading ${added.length} outline${added.length === 1 ? "" : "s"}. Nothing enters your plan until you confirm it.` });
    let extractedCount = 0;
    let failedCount = 0;

    for (let index = 0; index < added.length; index++) {
      const draft = added[index];
      const file = unique[index];
      setProgress((state) => ({ ...state, [draft.id]: "Reading the complete PDF with GPT…" }));
      try {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch("/api/extract-outline", { method: "POST", body: form });
        const payload = await response.json() as GptOutlineExtraction | { error?: string };
        if (!response.ok || !("tasks" in payload)) throw new Error("error" in payload ? payload.error : "GPT extraction failed.");
        extractedCount += payload.tasks.length;
        setDrafts((current) => current.map((item) => item.id === draft.id ? extractionToDraft(item, payload) : item));
      } catch (error) {
        failedCount++;
        const message = error instanceof Error ? error.message : "GPT could not read this outline.";
        setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, assessments: item.assessments.length ? item.assessments : [createAssessment()], parseStatus: "failed" } : item));
        setNotice({ tone: "error", text: message });
      } finally {
        setProgress((state) => { const next = { ...state }; delete next[draft.id]; return next; });
      }
    }

    if (!failedCount) setNotice({ tone: "success", text: `${extractedCount} task${extractedCount === 1 ? "" : "s"} found by GPT. Review the four fields, then confirm the course.` });
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    void addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void addFiles(Array.from(event.dataTransfer.files));
  }

  function updateCourse(patch: Partial<DraftCourse>) {
    if (!selected) return;
    setDrafts((current) => current.map((draft) => draft.id === selected.id ? { ...draft, ...patch } : draft));
  }

  function updateAssessment(id: string, patch: Partial<DraftAssessment>) {
    if (!selected) return;
    updateCourse({ assessments: selected.assessments.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }

  function removeAssessment(id: string) {
    if (selected) updateCourse({ assessments: selected.assessments.filter((item) => item.id !== id) });
  }

  function removeCourse() {
    if (!selected) return;
    const remaining = drafts.filter((draft) => draft.id !== selected.id);
    setDrafts(remaining);
    setSelectedId(remaining[0]?.id ?? null);
    setNotice({ tone: "info", text: "Draft removed." });
  }

  function downloadJson() {
    if (!selected) return;
    const json: GptOutlineExtraction = {
      courseName: selected.courseName,
      tasks: selected.assessments.map((item) => ({ taskName: item.taskName, category: item.category, deadline: item.deadline || null })),
    };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
    link.download = `${selected.fileName.replace(/\.pdf$/i, "") || "course-outline"}-tasks.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function confirmCourse() {
    if (!selected) return;
    if (!selected.courseName.trim()) {
      setNotice({ tone: "error", text: "Add the course name before confirming." });
      return;
    }
    const scheduled = selected.assessments.filter((item) => item.taskName.trim() && item.deadline);
    if (!scheduled.length) {
      setNotice({ tone: "error", text: "Add at least one task with a name and deadline." });
      return;
    }
    const saved = await loadTasks() ?? [];
    const existingSources = new Set(saved.map((task) => task.sourceUid).filter(Boolean));
    const now = Date.now();
    const imported: Task[] = scheduled.filter((item) => !existingSources.has(`${selected.id}:${item.id}`)).map((item, index) => ({
      id: crypto.randomUUID(), title: item.taskName.trim(), notes: `Imported from ${selected.fileName}`,
      deadline: item.deadline, targetMinutes: targetMinutesFor(item.category), focusedSeconds: 0,
      importance: "Unprioritized", reminderMinutes: 60, nextReminderAt: now + 60 * 60000,
      completed: false, createdAt: now + index, source: "outline", sourceUid: `${selected.id}:${item.id}`,
      course: selected.courseName.trim(), assessmentType: item.category, originalDeadline: item.deadline,
    }));
    await saveTasks([...saved, ...imported]);
    const unscheduled = selected.assessments.filter((item) => item.taskName.trim() && !item.deadline);
    const remaining = drafts.filter((draft) => draft.id !== selected.id);
    setDrafts(remaining);
    setSelectedId(remaining[0]?.id ?? null);
    setNotice({ tone: "success", text: `${imported.length} task${imported.length === 1 ? "" : "s"} added to your plan${unscheduled.length ? `. ${unscheduled.length} without a deadline ${unscheduled.length === 1 ? "was" : "were"} skipped` : ""}.` });
  }

  return (
    <main className="import-app">
      <aside className="import-sidebar">
        <a className="brand" href="/"><span className="brand-mark">D</span><span>Doneward</span></a>
        <nav aria-label="Main navigation"><a className="nav-item" href="/"><span>◈</span> Today</a><a className="nav-item" href="/"><span>○</span> All tasks</a><a className="nav-item active" href="/import-tasks"><span>↳</span> Import tasks</a></nav>
        <div className="import-note"><span>◇</span><p><strong>Review before import</strong>Your PDF is sent securely to OpenAI for extraction. Drafts stay in this browser until you confirm them.</p></div>
      </aside>

      <section className="import-workspace">
        <header className="import-header"><div><p className="eyebrow">COURSE OUTLINES</p><h1>Import tasks</h1><p>Upload PDF outlines. GPT reads the full document and returns only the course, task, category, and deadline.</p></div><label className="primary-button import-picker">+ Add outlines<input type="file" accept="application/pdf,.pdf" multiple onChange={onFiles} /></label></header>
        {notice && <div className={`import-notice ${notice.tone}`} role="status"><span>{notice.tone === "success" ? "✓" : notice.tone === "error" ? "!" : "i"}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}
        <section className="import-intro"><div><strong>{drafts.length}</strong><span>outlines to review</span></div><p><strong>GPT extraction:</strong> the entire PDF—including tables and scanned page images—is checked for missing tasks. Unknown deadlines stay blank instead of being guessed.</p></section>

        {!ready ? <div className="import-empty">Loading saved drafts…</div> : !selected ? (
          <label className="outline-drop" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}><input type="file" accept="application/pdf,.pdf" multiple onChange={onFiles} /><span>↑</span><h2>Drop course outlines here</h2><p>Choose one or more PDFs, up to 20 MB each.</p><strong>Browse PDF files</strong></label>
        ) : (
          <div className="import-layout">
            <aside className="draft-list" aria-label="Outlines awaiting review"><div className="draft-list-head"><span>REVIEW QUEUE</span><b>{drafts.length}</b></div>{drafts.map((draft) => <button key={draft.id} className={draft.id === selected.id ? "active" : ""} onClick={() => setSelectedId(draft.id)}><span>PDF</span><div><strong>{courseLabel(draft)}</strong><small>{progress[draft.id] ?? (draft.parseStatus === "extracted" ? `${draft.assessments.length} tasks found` : draft.parseStatus === "failed" ? "Needs manual review" : draft.fileName)}</small></div></button>)}<label className="add-more">+ Add another outline<input type="file" accept="application/pdf,.pdf" multiple onChange={onFiles} /></label></aside>
            <section className="review-panel">
              <div className="review-panel-head"><div><p className="eyebrow">REVIEW DRAFT</p><h2>{courseLabel(selected)}</h2><span>{selected.fileName} · {formatFileSize(selected.fileSize)}</span></div><div className="review-actions"><button className="secondary-button" onClick={downloadJson}>Download JSON</button><button className="delete-button" onClick={removeCourse}>Remove draft</button></div></div>
              <div className="course-fields course-fields-simple"><label>Course name<input value={selected.courseName} onChange={(event) => updateCourse({ courseName: event.target.value })} placeholder="e.g. Software Engineering" /></label></div>
              {selected.parseStatus === "extracting" && <div className="extraction-state reading"><span className="extract-spinner" /> <div><strong>GPT is reading this outline</strong><p>{progress[selected.id] ?? "Preparing the PDF…"}</p></div></div>}
              {selected.parseStatus === "failed" && <div className="extraction-state warning"><span>!</span><div><strong>GPT extraction is unavailable</strong><p>Your draft is still here. Complete the fields manually, or retry after the secure OpenAI API key is connected.</p></div></div>}
              {selected.parseStatus === "extracted" && <div className="extraction-state success"><span>✓</span><div><strong>{selected.assessments.length} task{selected.assessments.length === 1 ? "" : "s"} found</strong><p>Review the four requested fields below, then import the confirmed deadlines.</p></div></div>}
              <div className="assessment-heading"><div><h3>Course tasks</h3><p>Unknown deadlines are left blank for you to review.</p></div><button className="secondary-button" onClick={() => updateCourse({ assessments: [...selected.assessments, createAssessment()] })}>+ Add task</button></div>
              <div className="assessment-list">{selected.assessments.length === 0 ? <div className="assessment-empty">No course tasks were returned. Add a missing task manually or try the PDF again.</div> : selected.assessments.map((item, index) => <article className="assessment-row assessment-row-simple" key={item.id}><div className="assessment-number">{index + 1}</div><label className="assessment-title">Task name<input value={item.taskName} onChange={(event) => updateAssessment(item.id, { taskName: event.target.value })} placeholder="e.g. Assignment 1" /></label><label>Category<select value={item.category} onChange={(event) => updateAssessment(item.id, { category: event.target.value as DraftAssessment["category"] })}>{ASSESSMENT_CATEGORIES.map((category) => <option value={category} key={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}</select></label><label>Deadline<input value={item.deadline} onChange={(event) => updateAssessment(item.id, { deadline: event.target.value })} placeholder="YYYY-MM-DD or date + time" /></label><button className="remove-assessment" onClick={() => removeAssessment(item.id)} aria-label={`Remove task ${index + 1}`}>×</button></article>)}</div>
              <footer className="review-footer"><p>Confirmed tasks start as <strong>Unprioritized</strong> so the nearest deadline can guide your plan.</p><div><a className="secondary-button" href="/">Cancel</a><button className="primary-button" onClick={confirmCourse}>Import tasks</button></div></footer>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
