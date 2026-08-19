"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Importance = "Low" | "Medium" | "High";
type View = "today" | "all" | "upcoming" | "history";
type Task = {
  id: string;
  title: string;
  notes: string;
  deadline: string;
  targetMinutes: number;
  focusedSeconds: number;
  importance: Importance;
  reminderMinutes: number;
  nextReminderAt: number;
  completed: boolean;
  completedAt?: number;
  createdAt: number;
};

const DB_NAME = "doneward-db";
const STORE = "app-state";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadTasks(): Promise<Task[] | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get("tasks");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveTasks(tasks: Task[]) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(tasks, "tasks");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function localInputDate(date: Date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}

function dateAt(days: number, hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() < Date.now() + 10 * 60000) date.setDate(date.getDate() + 1);
  return localInputDate(date);
}

function starterTasks(): Task[] {
  const now = Date.now();
  return [
    { id: crypto.randomUUID(), title: "Build project landing page", notes: "Finish the hero, feature section, and responsive polish.", deadline: dateAt(0, 16), targetMinutes: 120, focusedSeconds: 35 * 60, importance: "High", reminderMinutes: 30, nextReminderAt: now + 30 * 60000, completed: false, createdAt: now },
    { id: crypto.randomUUID(), title: "Review weekly budget", notes: "Check subscriptions and categorize recent purchases.", deadline: dateAt(0, 19, 30), targetMinutes: 30, focusedSeconds: 0, importance: "Medium", reminderMinutes: 60, nextReminderAt: now + 60 * 60000, completed: false, createdAt: now + 1 },
    { id: crypto.randomUUID(), title: "Prepare client proposal", notes: "Outline, pricing, and delivery timeline.", deadline: dateAt(1, 11), targetMinutes: 180, focusedSeconds: 0, importance: "High", reminderMinutes: 30, nextReminderAt: now + 90 * 60000, completed: false, createdAt: now + 2 },
    { id: crypto.randomUUID(), title: "Plan next week", notes: "Choose the three outcomes that matter most.", deadline: dateAt(4, 17), targetMinutes: 25, focusedSeconds: 25 * 60, importance: "Low", reminderMinutes: 60, nextReminderAt: now + 120 * 60000, completed: true, completedAt: now - 86400000, createdAt: now - 172800000 },
  ];
}

function urgency(task: Task) {
  if (task.completed) return -Infinity;
  const minutesLeft = (new Date(task.deadline).getTime() - Date.now()) / 60000;
  const workLeft = Math.max(0, task.targetMinutes - task.focusedSeconds / 60);
  const importance = { Low: 0, Medium: 18, High: 36 }[task.importance];
  if (minutesLeft <= 0) return 10000 + importance + workLeft;
  const pressure = workLeft / Math.max(minutesLeft, 1);
  const proximity = 2400 / Math.max(minutesLeft, 30);
  return pressure * 500 + proximity + importance;
}

function isToday(value: string | number) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function formatDuration(minutes: number) {
  const rounded = Math.max(0, Math.ceil(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return hours ? `${hours}h${mins ? ` ${mins}m` : ""}` : `${mins}m`;
}

function deadlineLabel(value: string) {
  const date = new Date(value);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (date.getTime() < Date.now()) return `Overdue · ${time}`;
  if (isToday(value)) return `Due ${time}`;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + `, ${time}`;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("today");
  const [editing, setEditing] = useState<Task | null | "new">(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [dayLabel, setDayLabel] = useState("TODAY");
  const [welcome, setWelcome] = useState("Welcome back.");
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    loadTasks().then((saved) => setTasks(saved?.length ? saved : starterTasks())).finally(() => setReady(true));
    if ("Notification" in window) setNotificationPermission(Notification.permission);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const now = new Date();
    setDayLabel(now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toUpperCase());
    setWelcome(now.getHours() < 12 ? "Good morning." : now.getHours() < 18 ? "Good afternoon." : "Good evening.");
  }, []);

  useEffect(() => { if (ready) saveTasks(tasks).catch(() => undefined); }, [tasks, ready]);

  useEffect(() => {
    if (!running || !focusId) return;
    tickRef.current = window.setInterval(() => {
      setTasks((current) => current.map((task) => task.id === focusId ? { ...task, focusedSeconds: task.focusedSeconds + 1 } : task));
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [running, focusId]);

  const notify = useCallback((task: Task) => {
    if (notificationPermission !== "granted") return;
    const remaining = formatDuration(task.targetMinutes - task.focusedSeconds / 60);
    new Notification(`Time to move ${task.title} forward`, { body: `${remaining} of focus left. Start with one small step.`, icon: "/favicon.svg", tag: task.id });
  }, [notificationPermission]);

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      setTasks((current) => current.map((task) => {
        if (task.completed || task.nextReminderAt > now) return task;
        notify(task);
        return { ...task, nextReminderAt: now + task.reminderMinutes * 60000 };
      }));
    };
    check();
    const id = window.setInterval(check, 60000);
    return () => clearInterval(id);
  }, [notify]);

  const activeTasks = useMemo(() => tasks.filter((task) => !task.completed).sort((a, b) => urgency(b) - urgency(a)), [tasks]);
  const completed = tasks.filter((task) => task.completed);
  const nextTask = activeTasks[0];
  const todayTasks = activeTasks.filter((task) => isToday(task.deadline) || new Date(task.deadline).getTime() < Date.now());
  const upcomingTasks = activeTasks.filter((task) => !isToday(task.deadline) && new Date(task.deadline).getTime() >= Date.now());
  const visibleTasks = view === "today" ? todayTasks : view === "upcoming" ? upcomingTasks : view === "history" ? completed : activeTasks;
  const focusTask = tasks.find((task) => task.id === focusId);
  const remainingToday = todayTasks.reduce((sum, task) => sum + Math.max(0, task.targetMinutes - task.focusedSeconds / 60), 0);

  function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const existing = editing !== "new" ? editing : null;
    const reminderMinutes = Number(form.get("reminderMinutes"));
    const task: Task = {
      id: existing?.id ?? crypto.randomUUID(), title: String(form.get("title")).trim(), notes: String(form.get("notes")).trim(),
      deadline: String(form.get("deadline")), targetMinutes: Number(form.get("targetMinutes")), focusedSeconds: existing?.focusedSeconds ?? 0,
      importance: form.get("importance") as Importance, reminderMinutes, nextReminderAt: Date.now() + reminderMinutes * 60000,
      completed: existing?.completed ?? false, completedAt: existing?.completedAt, createdAt: existing?.createdAt ?? Date.now(),
    };
    setTasks((current) => existing ? current.map((item) => item.id === task.id ? task : item) : [...current, task]);
    setEditing(null);
  }

  function toggleComplete(task: Task) {
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, completed: !item.completed, completedAt: !item.completed ? Date.now() : undefined } : item));
    if (focusId === task.id) { setRunning(false); setFocusId(null); }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
  }

  function openFocus(id: string) { setFocusId(id); setRunning(true); }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">D</span><span>Doneward</span></div>
        <nav aria-label="Main navigation">
          <Nav active={view === "today"} onClick={() => setView("today")} symbol="◈" label="Today" count={todayTasks.length} />
          <Nav active={view === "all"} onClick={() => setView("all")} symbol="○" label="All tasks" count={activeTasks.length} />
          <Nav active={view === "upcoming"} onClick={() => setView("upcoming")} symbol="□" label="Upcoming" />
          <Nav active={view === "history"} onClick={() => setView("history")} symbol="◷" label="Focus history" />
        </nav>
        <div className="sidebar-bottom">
          <div className="streak-card"><span className="flame">♦</span><div><strong>{Math.min(7, completed.length + 3)} day streak</strong><small>Keep the momentum going</small></div></div>
          <button className="nav-item" onClick={enableNotifications}><span>{notificationPermission === "granted" ? "✓" : "◎"}</span>{notificationPermission === "granted" ? "Reminders on" : "Enable reminders"}</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">{dayLabel}</p><h1>{welcome}</h1><p>One clear step at a time.</p></div>
          <button className="primary-button" onClick={() => setEditing("new")}>+ Add task</button>
        </header>

        {nextTask ? <section className="next-card">
          <div className="next-copy"><span className="label">DO NEXT</span><h2>{nextTask.title}</h2><p>{deadlineLabel(nextTask.deadline)} <span className="dot">·</span> {formatDuration(nextTask.targetMinutes - nextTask.focusedSeconds / 60)} remaining</p></div>
          <Progress task={nextTask} />
          <button className="focus-button" onClick={() => openFocus(nextTask.id)}><span>▶</span> Start focus</button>
        </section> : <section className="next-card empty-next"><div className="next-copy"><span className="label">ALL CLEAR</span><h2>You&apos;re caught up.</h2><p>Add a task when you&apos;re ready for the next step.</p></div><button className="focus-button" onClick={() => setEditing("new")}>Add a task</button></section>}

        <div className="summary-row">
          <div><strong>{todayTasks.length}</strong><span>tasks today</span></div>
          <div><strong>{formatDuration(remainingToday)}</strong><span>focus remaining</span></div>
          <div><strong>{completed.length}</strong><span>completed</span></div>
        </div>

        <section className="task-section">
          <div className="section-heading"><h2>{view === "today" ? "Today" : view === "all" ? "All tasks" : view === "upcoming" ? "Coming up" : "Completed"}</h2><span>{visibleTasks.length} {visibleTasks.length === 1 ? "task" : "tasks"}</span></div>
          {!ready ? <div className="empty-state">Loading your plan…</div> : visibleTasks.length === 0 ? <div className="empty-state"><strong>Nothing here yet.</strong><span>Your next clear step can start small.</span><button onClick={() => setEditing("new")}>Add a task</button></div> : visibleTasks.map((task, index) => <TaskCard key={task.id} task={task} urgent={index === 0 && !task.completed} onComplete={() => toggleComplete(task)} onFocus={() => openFocus(task.id)} onEdit={() => setEditing(task)} />)}
        </section>
        {view === "today" && upcomingTasks.length > 0 && <section className="task-section upcoming"><div className="section-heading"><h2>Coming up</h2><button className="text-button" onClick={() => setView("upcoming")}>See all</button></div>{upcomingTasks.slice(0, 2).map((task) => <TaskCard key={task.id} task={task} onComplete={() => toggleComplete(task)} onFocus={() => openFocus(task.id)} onEdit={() => setEditing(task)} />)}</section>}
      </section>

      {editing && <TaskModal task={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={saveTask} onDelete={editing === "new" ? undefined : () => { setTasks((current) => current.filter((task) => task.id !== editing.id)); setEditing(null); }} />}
      {focusTask && <FocusModal task={focusTask} running={running} onToggle={() => setRunning((value) => !value)} onDone={() => { setRunning(false); toggleComplete(focusTask); setFocusId(null); }} onClose={() => { setRunning(false); setFocusId(null); }} />}
      {notificationPermission !== "granted" && ready && <div className="reminder-prompt"><span>◎</span><div><strong>Stay gently accountable</strong><small>Turn on reminders for tasks that still need focus.</small></div><button onClick={enableNotifications}>Enable</button><button className="dismiss" onClick={(event) => event.currentTarget.parentElement?.remove()} aria-label="Dismiss">×</button></div>}
    </main>
  );
}

function Nav({ active, onClick, symbol, label, count }: { active: boolean; onClick: () => void; symbol: string; label: string; count?: number }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><span>{symbol}</span>{label}{count !== undefined && <b>{count}</b>}</button>;
}

function Progress({ task }: { task: Task }) {
  const progress = Math.min(100, Math.round(task.focusedSeconds / 60 / task.targetMinutes * 100));
  return <div className="progress-ring" style={{ "--progress": `${progress}%` } as React.CSSProperties} aria-label={`${progress} percent complete`}><span>{progress}%</span></div>;
}

function TaskCard({ task, urgent, onComplete, onFocus, onEdit }: { task: Task; urgent?: boolean; onComplete: () => void; onFocus: () => void; onEdit: () => void }) {
  const remaining = task.targetMinutes - task.focusedSeconds / 60;
  const progress = Math.min(100, Math.round(task.focusedSeconds / 60 / task.targetMinutes * 100));
  const overdue = new Date(task.deadline).getTime() < Date.now() && !task.completed;
  return <article className={`task-card ${urgent ? "urgent" : ""} ${task.completed ? "done" : ""}`}>
    <button className="check" onClick={onComplete} aria-label={`${task.completed ? "Reopen" : "Complete"} ${task.title}`}>{task.completed ? "✓" : ""}</button>
    <div className="task-main" onDoubleClick={onEdit}><h3>{task.title}</h3><p>{task.completed ? `${formatDuration(task.focusedSeconds / 60)} focused` : `${formatDuration(remaining)} remaining of ${formatDuration(task.targetMinutes)}`}</p>{!task.completed && <div className="bar"><span style={{ width: `${progress}%` }} /></div>}</div>
    <div className="task-meta"><span className={`tag ${overdue || urgent ? "coral" : !isToday(task.deadline) ? "blue" : ""}`}>{deadlineLabel(task.deadline)}</span><span>{task.importance}</span></div>
    {!task.completed && <button className="mini-focus" onClick={onFocus} aria-label={`Focus on ${task.title}`}>▶</button>}<button className="more" onClick={onEdit} aria-label={`Edit ${task.title}`}>···</button>
  </article>;
}

function TaskModal({ task, onClose, onSave, onDelete }: { task?: Task; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onDelete?: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title"><div className="modal-head"><div><span className="label dark">{task ? "EDIT TASK" : "NEW TASK"}</span><h2 id="task-modal-title">{task ? "Shape the next step" : "What needs your focus?"}</h2></div><button onClick={onClose} aria-label="Close">×</button></div>
    <form onSubmit={onSave}><label>Task name<input name="title" defaultValue={task?.title} placeholder="e.g. Draft project proposal" required autoFocus /></label><label>Notes<textarea name="notes" defaultValue={task?.notes} placeholder="A useful first step, context, or definition of done" rows={3} /></label><div className="form-grid"><label>Deadline<input type="datetime-local" name="deadline" defaultValue={task?.deadline ?? dateAt(0, 17)} required /></label><label>Focus target<select name="targetMinutes" defaultValue={task?.targetMinutes ?? 60}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option><option value="180">3 hours</option><option value="240">4 hours</option></select></label><label>Importance<select name="importance" defaultValue={task?.importance ?? "Medium"}><option>Low</option><option>Medium</option><option>High</option></select></label><label>Remind me<select name="reminderMinutes" defaultValue={task?.reminderMinutes ?? 30}><option value="10">Every 10 minutes</option><option value="30">Every 30 minutes</option><option value="60">Every hour</option><option value="120">Every 2 hours</option></select></label></div><div className="modal-actions">{onDelete && <button type="button" className="delete-button" onClick={onDelete}>Delete</button>}<span /><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">{task ? "Save changes" : "Add task"}</button></div></form>
  </section></div>;
}

function FocusModal({ task, running, onToggle, onDone, onClose }: { task: Task; running: boolean; onToggle: () => void; onDone: () => void; onClose: () => void }) {
  const remainingSeconds = Math.max(0, task.targetMinutes * 60 - task.focusedSeconds);
  const hours = Math.floor(remainingSeconds / 3600); const minutes = Math.floor((remainingSeconds % 3600) / 60); const seconds = remainingSeconds % 60;
  return <div className="focus-overlay"><button className="focus-close" onClick={onClose} aria-label="Close focus session">×</button><div className="focus-content"><span className="label">FOCUSING ON</span><h2>{task.title}</h2><p>{task.notes || "Stay with this one clear step."}</p><div className={`timer ${running ? "running" : ""}`}><strong>{hours > 0 ? `${String(hours).padStart(2, "0")}:` : ""}{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</strong><span>remaining</span></div><div className="focus-actions"><button className="secondary-light" onClick={onToggle}>{running ? "Pause" : "Resume"}</button><button className="focus-complete" onClick={onDone}>✓ Mark done</button></div><small>Your progress is saved automatically.</small></div></div>;
}
