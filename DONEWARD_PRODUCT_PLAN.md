# Doneward Product Plan

Status: Ready for MVP development planning  
Owner and initial user: Project owner  
Last updated: August 22, 2026

## 1. Product summary

Doneward is a private academic planning and focus application for a University of Calgary student. It automatically discovers upcoming assignments, quizzes, and tests from Brightspace, places new items into a review inbox, and helps the user turn accepted work into a prioritized daily plan.

The product addresses four related problems:

1. Schoolwork is easily forgotten when several courses are active.
2. Due dates may be entered incorrectly or changed by instructors.
3. A deadline alone does not help the user decide what to work on today.
4. Starting a task does not guarantee that enough focused time is spent on it.

The core product loop is:

> Sync Brightspace → review new work → assign priority and estimated time → build Today queue → focus with a timer → finish, extend, or move to Backlog

## 2. Product goals

### MVP goals

- Automatically populate an inbox from the user's Brightspace calendar feed.
- Detect due-date changes and notify the user immediately.
- Let the user review imported schoolwork before adding it to the active plan.
- Let the user manually assign High, Medium, or Low priority.
- Let the user estimate the focused work time required for each work task.
- Make it easy to select a balanced set of tasks for Today.
- Provide a task-specific countdown timer with clear end-of-session choices.
- Move unfinished or unstarted Today tasks into Backlog at the end of the day.
- Synchronize the plan across signed-in devices.
- Deliver push and email reminders.

### Long-term goal

Replace or supplement calendar-feed synchronization with an official Brightspace OAuth/API integration approved by the University of Calgary. The API integration should provide more reliable assessment types and assignment metadata while preserving the same inbox and planning workflow.

### Non-goals for the MVP

- AI-generated priorities or schedules
- Automatic priority assignment
- Grade tracking or grade predictions
- Course-content downloads
- Automatic submission of schoolwork
- Reading announcements or discussion posts
- Team or shared planning
- Linking manual review tasks to imported tests
- Native desktop or mobile applications
- Official Brightspace API integration

## 3. Target user

The MVP is designed for one user: the project owner, a University of Calgary student using Brightspace with a school Microsoft account and Microsoft Authenticator MFA.

The architecture should not prevent broader use later, but MVP decisions should optimize for this user's workflow rather than for a general marketplace.

## 4. Confirmed product decisions

| Area | Decision |
|---|---|
| Platform | Responsive web application/PWA |
| Planner sign-in | Microsoft sign-in using the user's school account |
| Storage | Cloud database with cross-device synchronization |
| Brightspace MVP connection | Private Brightspace calendar-feed URL entered during onboarding |
| Automatic sync | Server-side synchronization every 30 or 60 minutes, selected by the user |
| Manual sync | A visible Sync now button |
| Imported types | Assignments, quizzes, and tests only |
| Import destination | Separate New from Brightspace inbox |
| Editable planning fields | Priority, notes, and estimated work time |
| Priority | Manual High, Medium, or Low |
| Ordering | Priority group first, then nearest deadline within each group |
| Daily planning | User selects tasks from the full prioritized list and adds them to Today |
| Today display | Ordered list showing priority and deadline; no calendar time-blocking |
| Work timer | One countdown using the task's estimated time |
| Timer expiry | Sound plus Finished, Keep working, and Finish later choices |
| Additional work | Keep working asks for an additional duration |
| Unfinished work | Finish later moves the task to Backlog with a highlighted deadline |
| End of day | Every unfinished or unstarted Today task moves to Backlog |
| Tests/quizzes | Deadline-only items by default; preparation is a separate manual task |
| Completion history | Completed section shows title and original deadline only |
| Reminder schedule | One week, three days, and one day before the deadline |
| Urgent changes | New work due within three days and deadlines moved closer trigger immediate alerts |
| Daily summary | Push/email summary at a user-selected time |
| Notification channels | Push and email |
| Backup | Manual data export and import |

## 5. MVP user journeys

### 5.1 First-time onboarding

1. User signs in with their University of Calgary Microsoft account.
2. App explains what the Brightspace calendar feed is and how it will be used.
3. User pastes their private Brightspace calendar-feed URL.
4. App validates the feed without displaying or logging the secret URL.
5. User selects a synchronization interval: 30 minutes or 60 minutes.
6. User chooses a daily summary time and time zone.
7. User enables push notifications and confirms the email used for reminders.
8. Initial synchronization runs.
9. Discovered assignments, quizzes, and tests enter the review inbox.

### 5.2 Reviewing imported work

1. User receives a notification that new schoolwork was found.
2. User opens New from Brightspace.
3. Each item shows title, course, detected type, and Brightspace deadline.
4. User sets priority.
5. For assignments, the user sets estimated work time; this is optional for quizzes and tests.
6. User may add personal notes.
7. User accepts the item into the active plan.

Items that cannot be confidently classified as assignments, quizzes, or tests are excluded from the MVP import flow. More advanced review and ignore rules are deferred.

### 5.3 Creating a manual task

1. User selects Add task.
2. User enters title, optional course, deadline, priority, notes, and estimated time.
3. User saves the task.
4. The task appears in the active list under its selected priority.

Manual tasks do not need to link to imported Brightspace items in the MVP.

### 5.4 Planning Today

1. User opens All tasks.
2. Tasks appear in High, Medium, and Low groups.
3. Each group is ordered by nearest deadline.
4. User selects any combination, such as two High, one Medium, and one Low task.
5. Selected tasks appear in Today in the same priority/deadline ordering.
6. The app does not assign start times or automatically choose the daily list.

### 5.5 Completing focused work

1. User starts an assignment or manual task from Today.
2. Countdown begins from the estimated remaining work time.
3. User can pause and resume.
4. Timer progress synchronizes across devices.
5. At zero, the app plays a sound and shows:
   - Finished
   - Keep working
   - Finish later
6. Finished marks the task complete.
7. Keep working asks the user to add more time, then starts the extension.
8. Finish later moves the task to Backlog and highlights its deadline.

Only one focus timer may be active for the user at a time.

### 5.6 End-of-day rollover

1. At the end of the user's local day, the server checks Today.
2. Any task not completed moves to Backlog, regardless of whether it was started.
3. The task keeps its original deadline, priority, notes, estimated time, and accumulated focus time.
4. The next daily summary identifies Backlog items separately.

### 5.7 Deadline change

1. Synchronization finds the same Brightspace item with a different deadline.
2. App updates the synchronized deadline automatically.
3. User-entered priority, notes, estimated time, Today status, and focus progress remain unchanged.
4. App records the previous and new deadlines.
5. User receives an immediate push and email notification showing both values.
6. If the new deadline crosses a reminder threshold, the appropriate reminder is sent without sending duplicate alerts.

### 5.8 Missing feed item

1. An imported item disappears from the calendar feed.
2. App does not delete it.
3. Item moves to Needs review with an explanation that it may have been cancelled, hidden, or temporarily omitted.
4. User decides whether to retain or remove it.

## 6. Information architecture and screens

### Primary navigation

1. Today
2. All tasks
3. New from Brightspace
4. Backlog
5. Completed
6. Settings

### Today

- Daily summary and approaching deadlines
- Selected Today queue
- Priority and deadline on every item
- Start/resume focus action
- Backlog warning when applicable

### All tasks

- High, Medium, and Low sections
- Nearest deadline first inside each section
- Add to Today action
- Course and assessment type filters
- Manual task creation

### New from Brightspace

- Count of unreviewed imported items
- Title, course, type, and deadline
- Priority selector
- Notes
- Estimated time for work tasks
- Accept into plan action

### Backlog

- Deadline visually emphasized
- Overdue state clearly differentiated
- Resume focus, return to Today, edit planning fields, and complete actions

### Completed

- Title
- Original deadline
- No detailed analytics required for MVP

### Settings

- Microsoft account information
- Brightspace feed connection status
- Masked feed URL and Replace feed action
- 30/60-minute sync interval
- Last successful sync and Sync now
- Daily summary time and time zone
- Push and email preferences
- Export data and Import data
- Sign out and delete account/data

## 7. Task and synchronization rules

### Priority ordering

1. High tasks appear before Medium tasks.
2. Medium tasks appear before Low tasks.
3. Inside a priority group, the earliest deadline appears first.
4. Overdue tasks appear before non-overdue tasks within the same priority group.
5. The app never changes priority automatically in the MVP.

### Brightspace identity and deduplication

Each imported item needs a stable source identity. Prefer the calendar event UID supplied by Brightspace. A fallback fingerprint may combine normalized course, title, and source identifier, but should not use the deadline because deadlines can change.

Synchronization must be idempotent: processing the same feed repeatedly cannot create duplicate tasks.

### Source-of-truth rules

Brightspace controls:

- Source title
- Course when present in the feed
- Assessment type when reliably present
- Official deadline
- Source event identity

The user controls:

- Priority
- Notes
- Estimated work time
- Today membership
- Backlog status
- Completion status
- Focus progress

### Reminder rules

- Default deadline reminders: seven days, three days, and one day before.
- If a new item is already inside one of those windows, notify immediately and schedule only future applicable reminders.
- If a deadline moves closer, notify immediately and recalculate future reminders.
- If a deadline moves later, notify immediately and recalculate reminders.
- Do not send the same reminder threshold more than once for the same deadline version.
- Daily summary time is selected by the user.
- Push and email notifications should contain enough information to act without exposing the private calendar-feed URL.

## 8. Timer behavior

### Timer states

- Not started
- Running
- Paused
- Expired awaiting decision
- Extended
- Finished
- Deferred to Backlog

### Required behavior

- Timer is associated with one task.
- One active timer per user.
- Server stores authoritative start time, accumulated time, and state.
- Client derives the displayed countdown from timestamps rather than sending a write every second.
- Closing the browser does not lose progress.
- Another signed-in device displays the same timer state.
- Expiry triggers sound when an active client is open and push/email handling according to notification settings.
- Additional time is recorded separately from the initial estimate so total planned time can be reconstructed later, even if analytics are not shown in the MVP.

## 9. Suggested data model

### User

- id
- Microsoft account subject identifier
- email
- display name
- time zone
- daily summary time
- sync interval
- created/updated timestamps

### Brightspace connection

- user id
- encrypted calendar-feed URL
- connection status
- last attempted sync
- last successful sync
- last error category

### Course

- id
- user id
- source course identifier/name
- display name
- optional color

Course colors are optional for MVP and may be added without changing task behavior.

### Task

- id
- user id
- source: Brightspace or manual
- source event UID when imported
- title
- course id/name
- type: assignment, quiz, test, or manual
- official deadline
- previous deadline when recently changed
- priority: high, medium, or low
- notes
- estimated seconds
- accumulated focus seconds
- state: inbox, active, today, backlog, completed, or needs review
- original deadline for completion history
- created/updated/completed timestamps

### Deadline version

- task id
- previous deadline
- new deadline
- detected timestamp
- source sync id

### Focus session

- id
- task id
- user id
- planned seconds
- started/paused/ended timestamps
- accumulated seconds
- outcome: finished, extended, or deferred

### Notification delivery

- user id
- task id when applicable
- notification type and deadline version
- channel: push or email
- scheduled/sent/failed timestamps
- deduplication key

## 10. Recommended technical architecture

### Client

- Responsive React/TypeScript PWA
- Accessible desktop and mobile layouts
- Service worker for installation, caching, and push notifications
- Local cache for fast loading and limited offline access

### Authentication

- Microsoft OpenID Connect/OAuth sign-in
- Restrict the MVP to the intended University of Calgary account if desired
- Secure server session using HTTP-only cookies
- Microsoft sign-in is planner authentication only; it does not grant Brightspace API access

### Backend

- TypeScript API/server functions
- Relational database for users, tasks, deadlines, sessions, and notification state
- Background job scheduler for 30/60-minute feed sync, reminders, daily summaries, and end-of-day rollover
- Queue/retry system for email and push delivery

### External services

- Microsoft identity platform for planner sign-in
- Brightspace calendar feed for MVP discovery
- Transactional email provider
- Web Push for browser notifications

### Security requirements

- Never collect or store the user's University password or MFA codes.
- Treat the calendar-feed URL as a secret credential.
- Encrypt the feed URL at rest using a server-managed encryption key.
- Mask it in the UI and never place it in logs, analytics, error messages, or notification content.
- Enforce per-user authorization on every task and settings operation.
- Use CSRF protection and secure cookie settings.
- Provide account/data deletion.
- Keep an audit trail for deadline changes and connection failures.
- Exported backups should exclude the raw feed URL by default.

## 11. MVP acceptance criteria

The MVP is complete when all of the following are true:

1. User can sign in with the selected Microsoft school account.
2. User can securely add and validate a Brightspace calendar-feed URL.
3. Scheduled sync runs every 30 or 60 minutes even when the app is closed.
4. Sync now produces a visible success or actionable error state.
5. Repeated sync does not create duplicate tasks.
6. New supported schoolwork appears in the inbox and triggers notification.
7. User can set priority, notes, and estimated time and accept an item.
8. User can create manual tasks.
9. Active tasks are grouped High/Medium/Low and sorted by deadline.
10. User can select tasks for Today.
11. Timer can start, pause, resume, survive browser closure, and synchronize across devices.
12. Timer expiry plays a sound and presents the three agreed actions.
13. Keep working accepts an additional duration.
14. Finish later moves the task to Backlog with a highlighted deadline.
15. End-of-day rollover moves incomplete Today tasks to Backlog.
16. Deadline changes preserve user planning data and send immediate push/email alerts.
17. Missing source items move to Needs review rather than being deleted.
18. Seven-day, three-day, one-day, urgent, and daily-summary notifications are deduplicated.
19. Completed section shows title and original deadline.
20. User can export and import their planner data.
21. User can sign out and delete the planner account and stored data.

## 12. Development milestones

### Milestone 0: Feasibility spike

- Obtain a real UCalgary Brightspace calendar-feed sample from the owner.
- Verify its authentication behavior, refresh behavior, CORS irrelevance on server, UID stability, course metadata, assessment labels, cancellations, and deadline updates.
- Confirm Microsoft tenant sign-in configuration for the selected school account.
- Decide which imported events can be classified safely as assignment, quiz, or test.
- Produce a short go/no-go report before building the sync system.

Exit condition: the feed can be fetched securely and produces stable enough records for the MVP, or the plan is revised before implementation.

### Milestone 1: Product foundation

- Microsoft sign-in
- User settings and time zone
- Cloud database and authorization boundaries
- Responsive application shell
- Manual task creation
- High/Medium/Low grouping and deadline ordering

### Milestone 2: Brightspace inbox

- Secure feed onboarding
- Server-side feed parser
- Stable deduplication
- Sync now
- Scheduled 30/60-minute sync
- New from Brightspace inbox
- Deadline version tracking
- Needs review behavior

### Milestone 3: Daily planning and task lifecycle

- Add/remove tasks from Today
- Backlog
- End-of-day rollover
- Completed section
- Cross-device real-time or near-real-time synchronization

### Milestone 4: Focus timer

- Start, pause, resume, and synchronized countdown
- Browser-close recovery
- Sound and expiry prompt
- Finish, additional time, and defer outcomes
- One-active-timer enforcement

### Milestone 5: Notifications

- Push subscription and delivery
- Email delivery
- Seven-day, three-day, and one-day reminders
- Urgent new-task and deadline-change alerts
- Configurable daily summary
- Delivery deduplication and retry handling

### Milestone 6: Reliability and launch

- Export/import backup
- Feed replacement and connection-error recovery
- Accessibility and responsive QA
- Security review
- Automated tests for sync, deadline changes, ordering, timer state, rollover, and notifications
- Monitoring and private production deployment

## 13. Test strategy

### Unit tests

- Priority/deadline ordering
- Calendar normalization and type filtering
- Stable deduplication
- Deadline-change detection
- Reminder threshold calculations
- End-of-day rollover
- Timer state transitions

### Integration tests

- Microsoft sign-in callback and account restrictions
- Encrypted feed storage and server fetch
- Repeat sync and changed/deleted feed events
- Cross-device timer state
- Push/email deduplication
- Export/import round trip

### End-to-end scenarios

- New assignment appears, is accepted, planned, focused, and completed.
- Instructor moves a deadline closer and the correct notification is sent.
- Today task is not started and moves to Backlog at day end.
- Timer expires and each of the three outcomes behaves correctly.
- Feed temporarily drops an item without deleting user planning data.

## 14. Key risks and mitigations

### Calendar feed completeness

Risk: instructors may not publish every assessment in the calendar, and type metadata may be inconsistent.

Mitigation: feasibility spike, visible last-sync status, manual task creation, clear messaging that calendar sync is an aid rather than the authoritative submission system, and long-term official API integration.

### Private feed exposure

Risk: anyone with the feed URL may be able to read calendar data.

Mitigation: encrypt at rest, never log or export by default, mask in UI, allow immediate replacement/removal, and restrict all access by user identity.

### Missed notifications

Risk: browser push can be disabled or unavailable.

Mitigation: send email as a second channel, show notification health in Settings, and display in-app alerts and sync status.

### Incorrect automatic classification

Risk: calendar event titles may not reliably identify assignments, quizzes, and tests.

Mitigation: import only high-confidence supported items in the MVP and retain manual task creation. Revisit Needs review classification after evaluating a real feed.

### School approval for full API integration

Risk: an official Brightspace app requires institutional registration and privacy/security review.

Mitigation: treat the calendar feed as the MVP integration and begin the university approval process as a separate future workstream.

## 15. Deferred decisions

These do not block MVP feasibility work but must be decided before their related milestone:

- Exact Microsoft identity configuration and whether access is restricted to one account
- Cloud platform, database, job scheduler, email provider, and push service
- Course colors
- Exact additional-time choices after timer expiry
- Exact end-of-day rollover time if different from midnight
- Offline editing and conflict-resolution depth
- Import behavior for uncertain calendar-event types
- Ignore/Not schoolwork controls
- Data retention period for completed tasks and notification logs
- Whether exports are encrypted

## 16. Future roadmap

### Phase 2

- Begin University of Calgary request for an approved Brightspace OAuth application.
- Replace calendar keyword/type inference with official assessment data.
- Detect submission/completion state when permitted.
- Improve course mapping and cancellation handling.

### Phase 3

- Native desktop wrapper with stronger background behavior.
- Native mobile application and richer push actions.
- Optional automatic priority recommendations based on deadline and estimated effort.
- Calendar time-blocking and availability-aware scheduling.
- Focus analytics and estimation feedback.

## 17. First development action

Do not begin the full product build with UI implementation. Begin with Milestone 0 using a real, privacy-scrubbed Brightspace calendar-feed sample. The feed's completeness and stability are the largest unknowns in the MVP, and validating them first prevents building the product around an unreliable source.

