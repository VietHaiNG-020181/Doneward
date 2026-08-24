"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { createAssessment, createCourseDraft, extractPdfPages, formatFileSize, isPdf, MAX_OUTLINE_BYTES, parseOutlinePages, targetMinutesFor } from "@/lib/outline-import";
import { loadOutlineDrafts, loadTasks, saveOutlineDrafts, saveTasks, type DraftAssessment, type DraftCourse, type Task } from "@/lib/doneward-store";

type Notice = { tone: "success" | "error" | "info"; text: string } | null;

function courseLabel(course: DraftCourse) {
  return [course.courseCode, course.courseName].filter(Boolean).join(" · ") || "Untitled course";
}

function normalizeConfidence(value: string): DraftAssessment["confidence"] {
  if (["ready-to-confirm", "needs-date-review", "needs-type-review", "possible-duplicate", "could-not-extract"].includes(value)) return value as DraftAssessment["confidence"];
  return value === "high" ? "ready-to-confirm" : "needs-date-review";
}

export default function ImportTasksPage() {
  const [drafts, setDrafts] = useState<DraftCourse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [progress, setProgress] = useState<Record<string, string>>({});

  useEffect(() => {
    loadOutlineDrafts().then((saved) => {
      const next = (saved ?? []).map((draft) => ({ ...draft, parseStatus: draft.parseStatus ?? "manual" as const, lowTextPages: draft.lowTextPages ?? [], assessments: draft.assessments.map((item) => ({ ...item, sourceEvidence: item.sourceEvidence ?? "", confidence: normalizeConfidence(item.confidence) })) }));
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
    setNotice({ tone: "info", text: `Reading ${added.length} outline${added.length === 1 ? "" : "s"} locally. Nothing will enter your plan until you confirm it.` });
    let extractedCount = 0; let scannedCount = 0;
    for (let index = 0; index < added.length; index++) {
      const draft = added[index]; const file = unique[index];
      try {
        const pages = await extractPdfPages(file, (current, total) => setProgress((state) => ({ ...state, [draft.id]: `Reading page ${current} of ${total}` })));
        const result = parseOutlinePages(pages, file.name);
        const lowTextPages = pages.filter((page) => page.lowText).map((page) => page.pageNumber);
        const needsOcr = lowTextPages.length === pages.length && pages.length > 0;
        extractedCount += result.assessments.length;
        if (needsOcr) scannedCount++;
        setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, ...result, pageCount: pages.length, lowTextPages, parseStatus: needsOcr ? "needs-ocr" : "extracted" } : item));
      } catch {
        setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, assessments: [createAssessment()], parseStatus: "failed" } : item));
      } finally {
        setProgress((state) => { const next = { ...state }; delete next[draft.id]; return next; });
      }
    }
    setNotice(scannedCount ? { tone: "info", text: `${extractedCount} assessment candidate${extractedCount === 1 ? "" : "s"} found. ${scannedCount} outline${scannedCount === 1 ? " looks" : "s look"} scanned and need OCR or manual review.` } : { tone: "success", text: `${extractedCount} assessment candidate${extractedCount === 1 ? "" : "s"} extracted. Review every field against its source evidence before confirming.` });
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
    if (!selected) return;
    updateCourse({ assessments: selected.assessments.filter((item) => item.id !== id) });
  }

  function removeCourse() {
    if (!selected) return;
    const remaining = drafts.filter((draft) => draft.id !== selected.id);
    setDrafts(remaining);
    setSelectedId(remaining[0]?.id ?? null);
    setNotice({ tone: "info", text: "Draft removed." });
  }

  async function confirmCourse() {
    if (!selected) return;
    if (!selected.courseCode.trim() && !selected.courseName.trim()) {
      setNotice({ tone: "error", text: "Add a course code or course name before confirming." });
      return;
    }
    const scheduled = selected.assessments.filter((item) => item.title.trim() && item.deadline);
    if (!scheduled.length) {
      setNotice({ tone: "error", text: "Add at least one assessment with a title and deadline." });
      return;
    }
    const saved = await loadTasks() ?? [];
    const existingSources = new Set(saved.map((task) => task.sourceUid).filter(Boolean));
    const now = Date.now();
    const imported: Task[] = scheduled.filter((item) => !existingSources.has(`${selected.id}:${item.id}`)).map((item, index) => ({
      id: crypto.randomUUID(), title: item.title.trim(),
      notes: [item.weight && `Weight: ${item.weight}`, item.sourcePage && `Outline page: ${item.sourcePage}`, `Imported from ${selected.fileName}`].filter(Boolean).join(" · "),
      deadline: item.deadline, targetMinutes: targetMinutesFor(item.assessmentType), focusedSeconds: 0,
      importance: "Unprioritized", reminderMinutes: 60, nextReminderAt: now + 60 * 60000,
      completed: false, createdAt: now + index, source: "outline", sourceUid: `${selected.id}:${item.id}`,
      course: courseLabel(selected), assessmentType: item.assessmentType, originalDeadline: item.deadline,
    }));
    await saveTasks([...saved, ...imported]);
    const unscheduled = selected.assessments.filter((item) => item.title.trim() && !item.deadline);
    const remaining = drafts.filter((draft) => draft.id !== selected.id);
    setDrafts(remaining);
    setSelectedId(remaining[0]?.id ?? null);
    setNotice({ tone: "success", text: `${imported.length} task${imported.length === 1 ? "" : "s"} added to your plan${unscheduled.length ? `. ${unscheduled.length} item${unscheduled.length === 1 ? " was" : "s were"} skipped because no deadline was set` : ""}.` });
  }

  return (
    <main className="import-app">
      <aside className="import-sidebar">
        <a className="brand" href="/"><span className="brand-mark">D</span><span>Doneward</span></a>
        <nav aria-label="Main navigation"><a className="nav-item" href="/"><span>◈</span> Today</a><a className="nav-item" href="/"><span>○</span> All tasks</a><a className="nav-item active" href="/import-tasks"><span>↳</span> Import tasks</a></nav>
        <div className="import-note"><span>◇</span><p><strong>Private by default</strong>Drafts stay in this browser. Nothing enters your plan until you confirm it.</p></div>
      </aside>

      <section className="import-workspace">
        <header className="import-header"><div><p className="eyebrow">COURSE OUTLINES</p><h1>Import tasks</h1><p>Upload one or more PDF outlines, review each assessment, then add the confirmed deadlines to your plan.</p></div><label className="primary-button import-picker">+ Add outlines<input type="file" accept="application/pdf,.pdf" multiple onChange={onFiles} /></label></header>
        {notice && <div className={`import-notice ${notice.tone}`} role="status"><span>{notice.tone === "success" ? "✓" : notice.tone === "error" ? "!" : "i"}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}
        <section className="import-intro"><div><strong>{drafts.length}</strong><span>outlines to review</span></div><p><strong>Local extraction:</strong> embedded PDF text is read on this device. Dates are never invented, source evidence stays attached, and low-text scanned pages are flagged for OCR review.</p></section>

        {!ready ? <div className="import-empty">Loading saved drafts…</div> : !selected ? (
          <label className="outline-drop" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}><input type="file" accept="application/pdf,.pdf" multiple onChange={onFiles} /><span>↑</span><h2>Drop course outlines here</h2><p>Choose one or more PDFs, up to 20 MB each.</p><strong>Browse PDF files</strong></label>
        ) : (
          <div className="import-layout">
            <aside className="draft-list" aria-label="Outlines awaiting review"><div className="draft-list-head"><span>REVIEW QUEUE</span><b>{drafts.length}</b></div>{drafts.map((draft) => <button key={draft.id} className={draft.id === selected.id ? "active" : ""} onClick={() => setSelectedId(draft.id)}><span>PDF</span><div><strong>{courseLabel(draft)}</strong><small>{progress[draft.id] ?? (draft.parseStatus === "extracted" ? `${draft.assessments.length} candidates found` : draft.parseStatus === "needs-ocr" ? "Scanned PDF · needs OCR" : draft.parseStatus === "failed" ? "Could not extract" : draft.fileName)}</small></div></button>)}<label className="add-more">+ Add another outline<input type="file" accept="application/pdf,.pdf" multiple onChange={onFiles} /></label></aside>
            <section className="review-panel">
              <div className="review-panel-head"><div><p className="eyebrow">REVIEW DRAFT</p><h2>{courseLabel(selected)}</h2><span>{selected.fileName} · {formatFileSize(selected.fileSize)}{selected.pageCount ? ` · ${selected.pageCount} pages` : ""}</span></div><button className="delete-button" onClick={removeCourse}>Remove draft</button></div>
              <div className="course-fields"><label>Course code<input value={selected.courseCode} onChange={(event) => updateCourse({ courseCode: event.target.value })} placeholder="e.g. CMPUT 301" /></label><label>Course name<input value={selected.courseName} onChange={(event) => updateCourse({ courseName: event.target.value })} placeholder="e.g. Software Engineering" /></label><label>Semester<input value={selected.semester} onChange={(event) => updateCourse({ semester: event.target.value })} placeholder="e.g. Fall 2026" /></label></div>
              {selected.parseStatus === "extracting" && <div className="extraction-state reading"><span className="extract-spinner" /> <div><strong>Reading this outline</strong><p>{progress[selected.id] ?? "Preparing the PDF…"}</p></div></div>}
              {selected.parseStatus === "needs-ocr" && <div className="extraction-state warning"><span>!</span><div><strong>This PDF looks scanned</strong><p>No usable embedded text was found. Its pages are flagged for OCR; add assessment details manually for now.</p></div></div>}
              {selected.parseStatus === "failed" && <div className="extraction-state warning"><span>!</span><div><strong>Automatic extraction could not finish</strong><p>The draft is still safe. Add the assessment details manually or try another PDF export.</p></div></div>}
              {selected.parseStatus === "extracted" && <div className="extraction-state success"><span>✓</span><div><strong>{selected.assessments.length} candidate{selected.assessments.length === 1 ? "" : "s"} found</strong><p>{selected.lowTextPages?.length ? `Pages ${selected.lowTextPages.join(", ")} had little embedded text and may need extra review.` : "Every candidate includes page-level source evidence."}</p></div></div>}
              <div className="assessment-heading"><div><h3>Graded assessments</h3><p>Use the exact deadline shown in the outline. You can leave a date blank while reviewing.</p></div><button className="secondary-button" onClick={() => updateCourse({ assessments: [...selected.assessments, createAssessment()] })}>+ Add assessment</button></div>
              <div className="assessment-list">{selected.assessments.length === 0 ? <div className="assessment-empty">No graded assessment candidates were found. Add any missing item manually and verify it against the outline.</div> : selected.assessments.map((item, index) => <article className="assessment-row" key={item.id}><div className="assessment-number">{index + 1}</div><label className="assessment-title">Task title<input value={item.title} onChange={(event) => updateAssessment(item.id, { title: event.target.value })} placeholder="e.g. Assignment 1" /></label><label>Type<select value={item.assessmentType} onChange={(event) => updateAssessment(item.id, { assessmentType: event.target.value as DraftAssessment["assessmentType"] })}><option value="assignment">Assignment</option><option value="quiz">Quiz</option><option value="test">Test / exam</option><option value="other">Other</option></select></label><label>Deadline<input value={item.deadline} onChange={(event) => updateAssessment(item.id, { deadline: event.target.value })} placeholder="YYYY-MM-DD or date + time" /></label><label>Weight<input value={item.weight} onChange={(event) => updateAssessment(item.id, { weight: event.target.value })} placeholder="e.g. 15%" /></label><label>Source page<input inputMode="numeric" value={item.sourcePage} onChange={(event) => updateAssessment(item.id, { sourcePage: event.target.value })} placeholder="e.g. 4" /></label><label>Confidence<select value={item.confidence} onChange={(event) => updateAssessment(item.id, { confidence: event.target.value as DraftAssessment["confidence"] })}><option value="ready-to-confirm">Ready to confirm</option><option value="needs-date-review">Needs date review</option><option value="needs-type-review">Needs type review</option><option value="possible-duplicate">Possible duplicate</option><option value="could-not-extract">Could not extract</option></select></label><button className="remove-assessment" onClick={() => removeAssessment(item.id)} aria-label={`Remove assessment ${index + 1}`}>×</button>{item.sourceEvidence && <p className="source-evidence"><strong>Page {item.sourcePage} evidence</strong>{item.sourceEvidence}</p>}</article>)}</div>
              <footer className="review-footer"><p>Confirmed tasks start as <strong>Unprioritized</strong> so you can decide what matters after the semester plan is assembled.</p><div><a className="secondary-button" href="/">Cancel</a><button className="primary-button" onClick={confirmCourse}>Confirm course</button></div></footer>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
