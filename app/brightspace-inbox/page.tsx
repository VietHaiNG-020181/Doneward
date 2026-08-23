"use client";

import { useEffect, useMemo, useState } from "react";
import { parseBrightspaceCalendar, type AssessmentType } from "@/lib/brightspace-feed";
import { loadIgnoredUids, loadInbox, loadTasks, saveIgnoredUids, saveInbox, saveTasks, type Importance, type InboxItem, type Task } from "@/lib/doneward-store";

type PlanFields = { importance: Importance; targetMinutes: number; notes: string };

function localInputDate(date: Date) { const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return adjusted.toISOString().slice(0, 16); }
function prettyDeadline(value: string) { return new Date(value).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }

export default function BrightspaceInboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [ready, setReady] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | Exclude<AssessmentType, "unknown">>("all");

  useEffect(() => { loadInbox().then((saved) => setItems(saved ?? [])).finally(() => setReady(true)); }, []);
  const visible = useMemo(() => items.filter((item) => (typeFilter === "all" || item.assessmentType === typeFilter) && `${item.title} ${item.course ?? ""}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()), [items, search, typeFilter]);
  const typeCounts = useMemo(() => ({ assignment: items.filter((item) => item.assessmentType === "assignment").length, quiz: items.filter((item) => item.assessmentType === "quiz").length, test: items.filter((item) => item.assessmentType === "test").length }), [items]);

  async function importCalendar(file?: File) {
    if (!file) return;
    const text = await file.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) { setSyncMessage("That file does not look like a Brightspace .ics calendar."); return; }
    const [savedInbox, tasks, ignored] = await Promise.all([loadInbox(), loadTasks(), loadIgnoredUids()]);
    const knownUids = new Set([...(savedInbox ?? []).map((item) => item.sourceUid), ...(tasks ?? []).map((task) => task.sourceUid).filter(Boolean) as string[], ...(ignored ?? [])]);
    const detected = parseBrightspaceCalendar(text).filter((event) => event.uid && event.deadlineIso && event.type !== "unknown");
    const additions: InboxItem[] = detected.filter((event) => !knownUids.has(event.uid as string)).map((event) => ({
      id: crypto.randomUUID(), sourceUid: event.uid as string, title: event.summary, course: event.course,
      assessmentType: event.type as Exclude<AssessmentType, "unknown">, deadline: localInputDate(new Date(event.deadlineIso as string)), importedAt: Date.now(),
    }));
    const merged = [...(savedInbox ?? []), ...additions]; setItems(merged); await saveInbox(merged);
    setSyncMessage(additions.length ? `${additions.length} new item${additions.length === 1 ? "" : "s"} added for review. ${detected.length - additions.length} already reviewed or waiting.` : `No new items. All ${detected.length} supported events were already reviewed or waiting.`);
  }

  async function accept(item: InboxItem, fields: PlanFields) {
    const existing = await loadTasks() ?? [];
    const task: Task = { id: crypto.randomUUID(), title: item.title, notes: fields.notes, deadline: item.deadline, originalDeadline: item.deadline,
      targetMinutes: fields.targetMinutes, focusedSeconds: 0, importance: fields.importance, reminderMinutes: 60, nextReminderAt: Date.now() + 3600000,
      completed: false, createdAt: Date.now(), source: "brightspace", sourceUid: item.sourceUid, course: item.course, assessmentType: item.assessmentType };
    await saveTasks([...existing, task]);
    const remaining = items.filter((candidate) => candidate.id !== item.id); setItems(remaining); await saveInbox(remaining);
    setSyncMessage(`“${item.title}” was added to All tasks.`);
  }
  async function ignore(item: InboxItem) {
    const ignored = await loadIgnoredUids() ?? []; if (!ignored.includes(item.sourceUid)) await saveIgnoredUids([...ignored, item.sourceUid]);
    const remaining = items.filter((candidate) => candidate.id !== item.id); setItems(remaining); await saveInbox(remaining);
  }

  return <main className="inbox-app">
    <aside className="inbox-sidebar"><a className="brand" href="/"><span className="brand-mark">D</span><span>Doneward</span></a><nav><a className="nav-item" href="/"><span>◈</span> Today</a><a className="nav-item" href="/"><span>○</span> All tasks</a><a className="nav-item active" href="/brightspace-inbox"><span>↳</span> New from Brightspace <b>{items.length}</b></a><a className="nav-item" href="/feed-check"><span>↻</span> Feed check</a></nav><div className="inbox-security"><span>◇</span><p><strong>Local review mode</strong>Your calendar is processed on this device. Cloud sync comes after sign-in setup.</p></div></aside>
    <section className="inbox-workspace">
      <header className="inbox-header"><div><span className="eyebrow">BRIGHTSPACE REVIEW</span><h1>New schoolwork</h1><p>Nothing enters your plan until you review it.</p></div><label className="primary-button import-button">Import calendar<input type="file" accept=".ics,text/calendar" onChange={(event) => importCalendar(event.target.files?.[0])} /></label></header>
      {syncMessage && <div className="sync-message" role="status"><span>✓</span>{syncMessage}<button onClick={() => setSyncMessage("")} aria-label="Dismiss">×</button></div>}
      <section className="inbox-summary"><div><strong>{items.length}</strong><span>awaiting review</span></div><div><strong>{typeCounts.assignment}</strong><span>assignments</span></div><div><strong>{typeCounts.quiz}</strong><span>quizzes</span></div><div><strong>{typeCounts.test}</strong><span>tests</span></div></section>
      <div className="inbox-tools"><label className="inbox-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or course" /></label><div className="filter-pills">{(["all", "assignment", "quiz", "test"] as const).map((type) => <button key={type} className={typeFilter === type ? "active" : ""} onClick={() => setTypeFilter(type)}>{type === "all" ? "All" : type === "test" ? "Tests" : `${type[0].toUpperCase()}${type.slice(1)}s`}</button>)}</div></div>
      <section className="inbox-list">
        {!ready ? <div className="inbox-empty">Loading your review inbox…</div> : visible.length ? visible.map((item) => <InboxCard key={item.id} item={item} onAccept={accept} onIgnore={ignore} />) : <div className="inbox-empty"><span>✓</span><h2>{items.length ? "No matching items" : "Your review inbox is clear"}</h2><p>{items.length ? "Try a different search or filter." : "Import your latest Brightspace .ics calendar to discover assignments, quizzes, and tests."}</p>{!items.length && <label className="secondary-button import-button">Choose calendar file<input type="file" accept=".ics,text/calendar" onChange={(event) => importCalendar(event.target.files?.[0])} /></label>}</div>}
      </section>
    </section>
  </main>;
}

function InboxCard({ item, onAccept, onIgnore }: { item: InboxItem; onAccept: (item: InboxItem, fields: PlanFields) => void; onIgnore: (item: InboxItem) => void }) {
  const [importance, setImportance] = useState<Importance>("Medium");
  const [targetMinutes, setTargetMinutes] = useState(item.assessmentType === "assignment" ? 60 : 0);
  const [notes, setNotes] = useState("");
  const overdue = new Date(item.deadline).getTime() < Date.now();
  return <article className="inbox-card"><div className={`type-mark ${item.assessmentType}`}>{item.assessmentType === "assignment" ? "A" : item.assessmentType === "quiz" ? "Q" : "T"}</div><div className="inbox-item-main"><div className="inbox-item-top"><span className={`assessment-chip ${item.assessmentType}`}>{item.assessmentType}</span>{item.course && <span className="course-chip">{item.course}</span>}<span className={`inbox-deadline ${overdue ? "overdue" : ""}`}>{overdue ? "Overdue · " : ""}{prettyDeadline(item.deadline)}</span></div><h2>{item.title}</h2><div className="review-fields"><label>Priority<select value={importance} onChange={(event) => setImportance(event.target.value as Importance)}><option>High</option><option>Medium</option><option>Low</option></select></label><label>Focused work<select value={targetMinutes} onChange={(event) => setTargetMinutes(Number(event.target.value))}><option value="0">Deadline only</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option><option value="180">3 hours</option></select></label><label className="notes-field">Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional context or first step" /></label></div></div><div className="inbox-actions"><button className="accept-button" onClick={() => onAccept(item, { importance, targetMinutes, notes })}>Accept into plan</button><button className="ignore-button" onClick={() => onIgnore(item)}>Not schoolwork</button></div></article>;
}
