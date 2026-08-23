import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFeed, compareFeeds, parseBrightspaceCalendar } from "../lib/brightspace-feed.ts";

const current = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:item-1\r\nSUMMARY:CPSC 217 Assignment 2\r\nDTSTART;TZID=America/Edmonton:20260918T235900\r\nLOCATION:CPSC 217\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:item-2\r\nSUMMARY:Quiz 1\r\nDTSTART:20260912T180000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const previous = current.replace("20260918T235900", "20260920T235900");

test("parses and classifies supported Brightspace-style events", () => {
  const events = parseBrightspaceCalendar(current);
  assert.equal(events.length, 2); assert.equal(events[0].type, "assignment"); assert.equal(events[1].type, "quiz"); assert.equal(events[0].timezone, "America/Edmonton");
  const analysis = analyzeFeed(events); assert.equal(analysis.uidCoverage, 100); assert.equal(analysis.parseableDeadlineCoverage, 100); assert.equal(analysis.duplicateUidCount, 0);
});
test("detects deadline changes using stable UIDs", () => {
  const comparison = compareFeeds(parseBrightspaceCalendar(previous), parseBrightspaceCalendar(current));
  assert.equal(comparison.available, true); assert.equal(comparison.matchedByUid, 2); assert.equal(comparison.deadlineChanges, 1); assert.equal(comparison.newItems, 0); assert.equal(comparison.missingItems, 0);
});
