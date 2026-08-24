"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { ASSESSMENT_CATEGORIES, createAssessment, formatFileSize, parseOutlineJson, targetMinutesFor, type GptOutlineExtraction } from "@/lib/outline-import";
import { loadOutlineDrafts, loadTasks, saveOutlineDrafts, saveTasks, type DraftAssessment, type DraftCourse, type Task } from "@/lib/doneward-store";

type Notice = { tone: "success" | "error" | "info"; text: string } | null;
type LegacyAssessment = Partial<DraftAssessment> & { title?: string; assessmentType?: DraftAssessment["category"] };
type LegacyCourse = Partial<DraftCourse> & { courseCode?: string; assessments?: LegacyAssessment[] };

const MAX_JSON_BYTES = 1024 * 1024;
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
      id: item.id ?? crypto.randomUUID(),
      taskName: item.taskName ?? item.title ?? "",
      category: item.category ?? item.assessmentType ?? "other",
      deadline: item.deadline ?? "",
    })),
  };
}

function extractionToDraft(extraction: GptOutlineExtraction, fileName: string, fileSize: number): DraftCourse {
  return {
    id: crypto.randomUUID(),
    fileName,
    fileSize,
    courseName: extraction.courseName,
    uploadedAt: Date.now(),
    parseStatus: "extracted",
    assessments: extraction.tasks.map((task) => ({ id: crypto.randomUUID(), taskName: task.taskName, category: task.category, deadline: task.deadline ?? "" })),
  };
}

function draftFingerprint(draft: Pick<DraftCourse, "courseName" | "assessments">) {
  return JSON.stringify([draft.courseName.toLowerCase(), draft.assessments.map((item) => [item.taskName.toLowerCase(), item.deadline])]);
}

export default function ImportTasksPage() {
  const [drafts, setDrafts] = useState<DraftCourse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [jsonText, setJsonText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadOutlineDrafts().then((saved) => {
      const next = (saved ?? []).map((draft) => restoreDraft(draft as LegacyCourse)).filter((draft): draft is DraftCourse => Boolean(draft));
      setDrafts(next);
      setSelectedId(next[0]?.id ?? null);
    }).finally(() => setReady(true));
  }, []);

  useEffect(() => { if (ready) saveOutlineDrafts(drafts).catch(() => undefined); }, [drafts, ready]);
  const selected = useMemo(() => drafts.find((draft) => draft.id === selectedId) ?? null, [drafts, selectedId]);

  function addExtraction(extraction: GptOutlineExtraction, fileName: string, fileSize: number) {
    if (!extraction.courseName || !extraction.tasks.length) {
      setNotice({ tone: "error", text: "The JSON needs a course name and at least one task." });
      return false;
    }
    const draft = extractionToDraft(extraction, fileName, fileSize);
    if (drafts.some((item) => draftFingerprint(item) === draftFingerprint(draft))) {
      setNotice({ tone: "error", text: "That task list is already in your review queue." });
      return false;
    }
    setDrafts((current) => [...current, draft]);
    setSelectedId(draft.id);
    setNotice({ tone: "success", text: `${draft.assessments.length} task${draft.assessments.length === 1 ? "" : "s"} loaded. Review the four fields, then import them.` });
    return true;
  }

  async function addJsonFiles(files: File[]) {
    if (!files.length) return;
    let added = 0;
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".json") || file.size > MAX_JSON_BYTES) {
        setNotice({ tone: "error", text: "Choose a JSON file smaller than 1 MB." });
        continue;
      }
      const extraction = parseOutlineJson(await file.text());
      if (!extraction) {
        setNotice({ tone: "error", text: `${file.name} does not match the required four-field format.` });
        continue;
      }
      if (addExtraction(extraction, file.name, file.size)) added++;
    }
    if (added > 1) setNotice({ tone: "success", text: `${added} course task lists are ready for review.` });
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    void addJsonFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void addJsonFiles(Array.from(event.dataTransfer.files));
  }

  function importPastedJson() {
    const extraction = parseOutlineJson(jsonText);
    if (!extraction) {
      setNotice({ tone: "error", text: "That text is not valid Doneward JSON. Copy the complete JSON response from ChatGPT and try again." });
      return;
    }
    if (addExtraction(extraction, "Pasted ChatGPT tasks.json", new TextEncoder().encode(jsonText).length)) setJsonText("");
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(CHATGPT_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice({ tone: "info", text: "Select and copy the prompt shown below, then paste it into ChatGPT." });
    }
  }

  function updateCourse(patch: Partial<DraftCourse>) {
    if (!selected) return;
    setDrafts((current) => current.map((draft) => draft.id === selected.id ? { ...draft, ...patch } : draft));
  }

  function updateAssessment(id: string, patch: Partial<DraftAssessment>) {
    if (selected) updateCourse({ assessments: selected.assessments.map((item) => item.id === id ? { ...item, ...patch } : item) });
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
    const json: GptOutlineExtraction = { courseName: selected.courseName, tasks: selected.assessments.map((item) => ({ taskName: item.taskName, category: item.category, deadline: item.deadline || null })) };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
    link.download = `${selected.courseName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "course"}-tasks.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function confirmCourse() {
    if (!selected) return;
    if (!selected.courseName.trim()) {
      setNotice({ tone: "error", text: "Add the course name before importing." });
      return;
    }
    const scheduled = selected.assessments.filter((item) => item.taskName.trim() && item.deadline);
    if (!scheduled.length) {
      setNotice({ tone: "error", text: "Add at least one task with a name and deadline." });
      return;
    }
    const saved = await loadTasks() ?? [];
    const taskKey = (course: string, title: string, deadline: string) => `${course.trim().toLowerCase()}|${title.trim().toLowerCase()}|${deadline}`;
    const existing = new Set(saved.map((task) => taskKey(task.course ?? "", task.title, task.deadline)));
    const now = Date.now();
    const imported: Task[] = scheduled.filter((item) => !existing.has(taskKey(selected.courseName, item.taskName, item.deadline))).map((item, index) => ({
      id: crypto.randomUUID(), title: item.taskName.trim(), notes: "Imported from ChatGPT-reviewed course outline",
      deadline: item.deadline, targetMinutes: targetMinutesFor(item.category), focusedSeconds: 0,
      importance: "Unprioritized", reminderMinutes: 60, nextReminderAt: now + 60 * 60000,
      completed: false, createdAt: now + index, source: "outline", sourceUid: `json:${taskKey(selected.courseName, item.taskName, item.deadline)}`,
      course: selected.courseName.trim(), assessmentType: item.category, originalDeadline: item.deadline,
    }));
    await saveTasks([...saved, ...imported]);
    const skippedWithoutDeadline = selected.assessments.filter((item) => item.taskName.trim() && !item.deadline).length;
    const duplicates = scheduled.length - imported.length;
    const remaining = drafts.filter((draft) => draft.id !== selected.id);
    setDrafts(remaining);
    setSelectedId(remaining[0]?.id ?? null);
    const details = [skippedWithoutDeadline ? `${skippedWithoutDeadline} without a deadline skipped` : "", duplicates ? `${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped` : ""].filter(Boolean).join("; ");
    setNotice({ tone: "success", text: `${imported.length} task${imported.length === 1 ? "" : "s"} added to your plan${details ? `. ${details}` : ""}.` });
  }

  return (
    <main className="import-app">
      <aside className="import-sidebar">
        <a className="brand" href="/"><span className="brand-mark">D</span><span>Doneward</span></a>
        <nav aria-label="Main navigation"><a className="nav-item" href="/"><span>◈</span> Today</a><a className="nav-item" href="/"><span>○</span> All tasks</a><a className="nav-item active" href="/import-tasks"><span>↳</span> Import tasks</a></nav>
        <div className="import-note"><span>◇</span><p><strong>No API billing</strong>Your PDF stays in ChatGPT. Doneward only receives the four-field JSON you choose to import.</p></div>
      </aside>

      <section className="import-workspace">
        <header className="import-header"><div><p className="eyebrow">CHATGPT WORKFLOW</p><h1>Import tasks</h1><p>Let ChatGPT read your course outline, then bring the clean task list into Doneward as JSON—no developer API credits required.</p></div><label className="primary-button import-picker">+ Upload JSON<input type="file" accept="application/json,.json" multiple onChange={onFiles} /></label></header>
        {notice && <div className={`import-notice ${notice.tone}`} role="status"><span>{notice.tone === "success" ? "✓" : notice.tone === "error" ? "!" : "i"}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}

        <section className="json-workflow" aria-labelledby="workflow-title">
          <div className="workflow-heading"><div><p className="eyebrow">HOW IT WORKS</p><h2 id="workflow-title">PDF in ChatGPT. JSON in Doneward.</h2></div><span className="no-cost-badge">No API credits</span></div>
          <div className="workflow-steps">
            <div><b>1</b><strong>Open ChatGPT</strong><span>Start a new chat and attach one course-outline PDF.</span></div>
            <div><b>2</b><strong>Send the prompt</strong><span>Use the exact extraction prompt so the response matches Doneward.</span></div>
            <div><b>3</b><strong>Import the JSON</strong><span>Paste the response below or upload the downloaded JSON file.</span></div>
          </div>
          <div className="prompt-box"><div><strong>Course-outline extraction prompt</strong><button className="secondary-button" onClick={copyPrompt}>{copied ? "✓ Copied" : "Copy prompt"}</button></div><pre>{CHATGPT_PROMPT}</pre><a className="text-button" href="https://chatgpt.com/" target="_blank" rel="noreferrer">Open ChatGPT ↗</a></div>
        </section>

        <section className="json-entry">
          <div className="json-paste"><label htmlFor="task-json">Paste ChatGPT JSON</label><textarea id="task-json" value={jsonText} onChange={(event) => setJsonText(event.target.value)} placeholder={'{\n  "courseName": "...",\n  "tasks": [...]\n}'} rows={8} spellCheck={false} /><button className="primary-button" onClick={importPastedJson} disabled={!jsonText.trim()}>Load task list</button></div>
          <label className="json-drop" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}><input type="file" accept="application/json,.json" multiple onChange={onFiles} /><span>↑</span><strong>Drop a JSON file here</strong><small>or browse files · up to 1 MB</small></label>
        </section>

        <section className="import-intro"><div><strong>{drafts.length}</strong><span>courses to review</span></div><p><strong>Nothing is automatic:</strong> check the course name, task name, category, and deadline before adding anything to your plan.</p></section>

        {!ready ? <div className="import-empty">Loading saved drafts…</div> : selected && (
          <div className="import-layout">
            <aside className="draft-list" aria-label="Courses awaiting review"><div className="draft-list-head"><span>REVIEW QUEUE</span><b>{drafts.length}</b></div>{drafts.map((draft) => <button key={draft.id} className={draft.id === selected.id ? "active" : ""} onClick={() => setSelectedId(draft.id)}><span>JSON</span><div><strong>{courseLabel(draft)}</strong><small>{draft.assessments.length} tasks · {draft.fileName}</small></div></button>)}<label className="add-more">+ Add another JSON<input type="file" accept="application/json,.json" multiple onChange={onFiles} /></label></aside>
            <section className="review-panel">
              <div className="review-panel-head"><div><p className="eyebrow">REVIEW DRAFT</p><h2>{courseLabel(selected)}</h2><span>{selected.fileName} · {formatFileSize(selected.fileSize)}</span></div><div className="review-actions"><button className="secondary-button" onClick={downloadJson}>Download corrected JSON</button><button className="delete-button" onClick={removeCourse}>Remove draft</button></div></div>
              <div className="course-fields course-fields-simple"><label>Course name<input value={selected.courseName} onChange={(event) => updateCourse({ courseName: event.target.value })} placeholder="e.g. Software Engineering" /></label></div>
              <div className="extraction-state success"><span>✓</span><div><strong>{selected.assessments.length} task{selected.assessments.length === 1 ? "" : "s"} loaded from JSON</strong><p>Review the four requested fields below, then import the confirmed deadlines.</p></div></div>
              <div className="assessment-heading"><div><h3>Course tasks</h3><p>Unknown deadlines stay blank until you fill them in.</p></div><button className="secondary-button" onClick={() => updateCourse({ assessments: [...selected.assessments, createAssessment()] })}>+ Add task</button></div>
              <div className="assessment-list">{selected.assessments.length === 0 ? <div className="assessment-empty">No tasks are in this JSON. Add one manually or correct the ChatGPT response.</div> : selected.assessments.map((item, index) => <article className="assessment-row assessment-row-simple" key={item.id}><div className="assessment-number">{index + 1}</div><label className="assessment-title">Task name<input value={item.taskName} onChange={(event) => updateAssessment(item.id, { taskName: event.target.value })} placeholder="e.g. Assignment 1" /></label><label>Category<select value={item.category} onChange={(event) => updateAssessment(item.id, { category: event.target.value as DraftAssessment["category"] })}>{ASSESSMENT_CATEGORIES.map((category) => <option value={category} key={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}</select></label><label>Deadline<input value={item.deadline} onChange={(event) => updateAssessment(item.id, { deadline: event.target.value })} placeholder="YYYY-MM-DD or date + time" /></label><button className="remove-assessment" onClick={() => removeAssessment(item.id)} aria-label={`Remove task ${index + 1}`}>×</button></article>)}</div>
              <footer className="review-footer"><p>Imported tasks start as <strong>Unprioritized</strong>, and Doneward orders them by urgency and nearest deadline.</p><div><a className="secondary-button" href="/">Cancel</a><button className="primary-button" onClick={confirmCourse}>Import tasks</button></div></footer>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
