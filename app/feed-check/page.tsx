"use client";

import { useMemo, useState } from "react";
import { analyzeFeed, buildPrivacySafeReport, compareFeeds, parseBrightspaceCalendar, type CalendarEvent } from "@/lib/brightspace-feed";

type Snapshot = { name: string; events: CalendarEvent[] };

export default function FeedCheckPage() {
  const [current, setCurrent] = useState<Snapshot | null>(null);
  const [previous, setPrevious] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const analysis = useMemo(() => current ? analyzeFeed(current.events) : null, [current]);
  const comparison = useMemo(() => current ? compareFeeds(previous?.events ?? null, current.events) : null, [current, previous]);
  const report = analysis && comparison ? buildPrivacySafeReport(analysis, comparison) : null;

  async function readSnapshot(file: File | undefined, setter: (snapshot: Snapshot | null) => void) {
    if (!file) { setter(null); return; }
    try {
      const text = await file.text();
      if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("This does not look like an iCalendar (.ics) file.");
      const events = parseBrightspaceCalendar(text);
      setter({ name: file.name, events }); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The calendar file could not be read."); setter(null); }
  }
  function downloadReport() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "doneward-brightspace-feasibility-report.json"; anchor.click(); URL.revokeObjectURL(url);
  }
  const recommendation = report?.recommendation;
  return <main className="spike-shell">
    <header className="spike-topbar"><a className="brand" href="/"><span className="brand-mark">D</span><span>Doneward</span></a><a className="back-link" href="/">← Back to planner</a></header>
    <section className="spike-hero"><div><span className="label dark">MILESTONE 0 · FEASIBILITY SPIKE</span><h1>Can Brightspace power a reliable planner?</h1><p>Check the calendar feed before we build synchronization around it. Your files are analyzed only inside this browser and are never uploaded or saved.</p></div><div className="privacy-seal"><span>◈</span><strong>Private by design</strong><small>No feed URL, titles, descriptions, or UIDs leave this device.</small></div></section>
    <section className="spike-grid">
      <div className="upload-panel"><div className="step-number">1</div><h2>Add a current snapshot</h2><p>Download your Brightspace calendar as an <strong>.ics</strong> file, then choose it here.</p><label className="file-drop"><input type="file" accept=".ics,text/calendar" onChange={(event) => readSnapshot(event.target.files?.[0], setCurrent)} /><span>{current ? "✓" : "+"}</span><strong>{current?.name ?? "Choose current .ics file"}</strong><small>{current ? `${current.events.length} calendar events detected` : "Processed locally in this browser"}</small></label></div>
      <div className="upload-panel optional"><div className="step-number">2</div><h2>Compare an earlier snapshot</h2><p>Optional, but required to confirm stable IDs, deadline changes, and missing-item behavior.</p><label className="file-drop"><input type="file" accept=".ics,text/calendar" onChange={(event) => readSnapshot(event.target.files?.[0], setPrevious)} /><span>{previous ? "✓" : "+"}</span><strong>{previous?.name ?? "Choose earlier .ics file"}</strong><small>{previous ? `${previous.events.length} earlier events detected` : "Use a feed saved on a different day"}</small></label></div>
    </section>
    {error && <p className="feed-error" role="alert">{error}</p>}
    {!analysis || !comparison ? <section className="spike-empty"><span>◎</span><h2>Your feasibility report will appear here</h2><p>It checks stable event IDs, duplicate risk, deadline parsing, course signals, supported assessment types, and changes between snapshots.</p></section> : <>
      <section className="report-head"><div><span className="label dark">RESULTS</span><h2>Feed readiness report</h2><p>Based on {analysis.eventCount} events in {current?.name}</p></div><button className="primary-button" onClick={downloadReport}>Download scrubbed report</button></section>
      <section className="metric-grid"><Metric label="Stable UID coverage" value={`${analysis.uidCoverage}%`} state={analysis.uidCoverage >= 95 && !analysis.duplicateUidCount ? "pass" : "fail"} detail={`${analysis.duplicateUidCount} duplicate UID${analysis.duplicateUidCount === 1 ? "" : "s"}`} /><Metric label="Parseable deadlines" value={`${analysis.parseableDeadlineCoverage}%`} state={analysis.parseableDeadlineCoverage >= 95 ? "pass" : "fail"} detail={`${analysis.deadlineCoverage}% of events have a deadline`} /><Metric label="Course signals" value={`${analysis.courseSignalCoverage}%`} state={analysis.courseSignalCoverage >= 70 ? "pass" : "warn"} detail="Metadata or recognizable course context" /><Metric label="Safely classified" value={`${analysis.classifiedCount}`} state={analysis.classifiedCount >= analysis.unknownCount ? "pass" : "warn"} detail={`${analysis.unknownCount} events remain unknown`} /></section>
      <section className="report-columns"><div className="report-card"><h3>Assessment mix</h3><ReportRow label="Assignments" value={analysis.typeCounts.assignment} /><ReportRow label="Quizzes" value={analysis.typeCounts.quiz} /><ReportRow label="Tests & exams" value={analysis.typeCounts.test} /><ReportRow label="Unclassified" value={analysis.typeCounts.unknown} /></div><div className="report-card"><h3>Snapshot stability</h3>{comparison.available ? <><ReportRow label="Matched by UID" value={comparison.matchedByUid} /><ReportRow label="New items" value={comparison.newItems} /><ReportRow label="Missing items" value={comparison.missingItems} /><ReportRow label="Deadline changes" value={comparison.deadlineChanges} /></> : <div className="comparison-needed"><strong>Second snapshot needed</strong><p>One snapshot proves the format. Two snapshots tell us whether synchronization can be safe and idempotent.</p></div>}</div></section>
      <section className={`recommendation ${recommendation?.status}`}><div className="recommendation-mark">{recommendation?.status === "go" ? "✓" : recommendation?.status === "no-go" ? "!" : "?"}</div><div><span className="label dark">CURRENT RECOMMENDATION</span><h2>{recommendation?.status === "go" ? "Ready to proceed" : recommendation?.status === "no-go" ? "Do not build sync yet" : "More evidence needed"}</h2>{recommendation?.blockers.map((item) => <p key={item}><strong>Blocker:</strong> {item}</p>)}{recommendation?.cautions.map((item) => <p key={item}>{item}</p>)}</div></section>
    </>}
    <section className="safe-sharing"><h2>What is safe to share?</h2><div><p><strong>Share:</strong> the downloaded Doneward feasibility report. It contains aggregate counts and field names only.</p><p><strong>Do not share:</strong> your private feed URL, raw .ics file, calendar UIDs, assignment titles, or descriptions.</p></div></section>
  </main>;
}
function Metric({ label, value, state, detail }: { label: string; value: string; state: "pass" | "warn" | "fail"; detail: string }) { return <article className={`metric ${state}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function ReportRow({ label, value }: { label: string; value: number }) { return <div className="report-row"><span>{label}</span><strong>{value}</strong></div>; }
