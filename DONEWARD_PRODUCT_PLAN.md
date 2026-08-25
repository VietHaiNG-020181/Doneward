# Doneward Product Plan

Status: Approved direction; ready for MVP development
Owner and initial user: Project owner  
Last updated: August 24, 2026

## 1. Product summary

Doneward is a private academic planning and focus application for a University of Calgary student. At the start of a semester, the user uploads the PDF course outline for each course. Doneward extracts the course's assignments, quizzes, tests, exams, and other graded assessments into a structured draft. The user verifies the draft before it becomes the semester plan.

During the semester, Doneward helps the user choose work for Today, manually assign priority, receive deadline reminders, complete focused work with a timer, and recover unfinished work through Backlog.

The core product loop is:

> Upload course outlines → review extracted assessments → confirm semester plan → choose Today tasks → focus with a timer → finish, extend, or move to Backlog

## 2. Problem statement

The product addresses four related problems:

1. Schoolwork is easily forgotten when several courses are active.
2. Manually copying an entire semester of deadlines is slow and error-prone.
3. A list of deadlines does not help the user decide what to work on today.
4. Starting a task does not guarantee that enough focused time is spent on it.

The previous idea of continuously classifying Brightspace calendar events is removed from the MVP. Calendar-event formats vary too much between instructors and courses. Course outlines are a more stable, semester-level source and allow the user to verify all extracted information once before relying on it.

## 3. MVP goals

- Accept several course-outline PDF files at the start of a semester.
- Extract each course's code, name, graded assessments, due dates/times, and optional grade weights.
- Organize extracted assessments under their course and assessment category.
- Show the source page and confidence state for every extracted item.
- Require user review and confirmation before creating the semester plan.
- Allow missing, ambiguous, or changed deadlines to be corrected manually.
- Let the user assign High, Medium, or Low priority.
- Let the user add personal notes and estimated focus time.
- Let the user choose a balanced set of tasks for Today.
- Provide a task-specific countdown timer with clear end-of-session choices.
- Move unfinished or unstarted Today tasks into Backlog at the end of the day.
- Synchronize the plan across signed-in devices.
- Deliver push and email deadline reminders and a configurable daily summary.
- Allow manual tasks in addition to outline-derived assessments.

## 4. Non-goals for the MVP

- Connecting to or browsing the user's Brightspace account
- Automatically locating course outlines inside Brightspace
- Brightspace calendar-feed synchronization
- Continuous detection of instructor deadline changes
- Automatic submission detection
- Automatic priority assignment
- AI-generated daily schedules
- Grade tracking or grade predictions
- Course-content or lecture-note processing
- Team or shared planning
- Linking manual review tasks to imported tests
- Native desktop or mobile applications
- Official Brightspace OAuth/API integration

## 5. Target user

The MVP is designed for one user: the project owner, a University of Calgary student. The architecture may support more users later, but product decisions should optimize for this user's semester workflow.

## 6. Confirmed product decisions

| Area | Decision |
|---|---|
| Platform | Responsive web application/PWA |
| Planner sign-in | Microsoft sign-in using the user's school account |
| Storage | Cloud database with cross-device synchronization |
| Semester input | User uploads course-outline PDFs manually |
| Import timing | Once at the beginning of each semester, with re-import available when needed |
| Parsing output | Draft course plan requiring user confirmation |
| Course organization | Each course is its own category |
| Assessment organization | Assignments, Quizzes, Tests/Exams, and Other Assessments |
| Source evidence | Every extracted item links to the outline page where it was found |
| Uncertain extraction | Highlighted for correction; never silently accepted |
| Deadline changes | User edits the deadline manually |
| Editable planning fields | Priority, notes, deadline, and estimated work time |
| Priority | Manual High, Medium, or Low |
| Ordering | Priority group first, then nearest deadline within each group |
| Daily planning | User selects tasks from the full prioritized list and adds them to Today |
| Today display | Ordered list showing course, priority, and deadline; no calendar time-blocking |
| Work timer | One countdown using the task's estimated time |
| Timer expiry | Sound plus Finished, Keep working, and Finish later choices |
| Additional work | Keep working asks for an additional duration |
| Unfinished work | Finish later moves the task to Backlog with a highlighted deadline |
| End of day | Every unfinished or unstarted Today task moves to Backlog |
| Tests/quizzes | Deadline-only by default; preparation is a separate manual task |
| Completion history | Completed section shows title and deadline only |
| Reminder schedule | One week, three days, and one day before the deadline |
| Urgent additions/edits | Items entered or changed inside three days trigger an immediate alert |
| Daily summary | Push/email summary at a user-selected time |
| Notification channels | Push and email |
| Backup | Manual data export and import |

## 7. Core user journeys

### 7.1 First-time onboarding

1. User signs in with their University of Calgary Microsoft account.
2. User selects their time zone and preferred daily-summary time.
3. User enables browser push notifications and confirms the email used for reminders.
4. User creates a semester, such as Fall 2026, and enters its approximate start and end dates.
5. App takes the user to Import course outlines.

### 7.2 Importing course outlines

1. User selects or drags in one or more PDF course outlines.
2. App validates file type and size.
3. App extracts normal PDF text and tables; scanned PDFs use OCR as a fallback.
4. App identifies course information and assessment candidates.
5. App creates one draft course per uploaded outline.
6. App never creates active tasks directly from unreviewed extraction results.

The parser should look for graded assessments, including assignments, quizzes, tests, midterms, exams, projects, labs, papers, presentations, and other named assessment components. Readings, lecture topics, office hours, policies, and ungraded activities should not become tasks.

### 7.3 Reviewing one course

1. User opens a draft course.
2. Header shows detected course code, course name, semester, and outline filename.
3. Extracted items appear in categories:
   - Assignments
   - Quizzes
   - Tests/Exams
   - Other Assessments
4. Each item shows title, deadline, optional weight, source page, and confidence state.
5. Selecting the source evidence opens the relevant PDF page or excerpt.
6. User corrects the title, type, deadline, or weight when necessary.
7. Items with missing dates remain visible as Date not announced.
8. User can remove non-actionable or incorrectly extracted items.
9. User selects Confirm course.
10. Confirmed assessments become the course's semester task list.

### 7.4 Viewing the semester

The main semester view is organized by course:

```text
CPSC 111
  Assignments
    - Assignment 1 — September 25
    - Assignment 2 — October 30
  Quizzes
    - Quiz 1 — September 18
  Tests/Exams
    - Midterm — October 20
    - Final — Date not announced
```

The user can also switch to All tasks, where confirmed tasks are grouped by High, Medium, and Low priority and sorted by deadline.

### 7.5 Planning an extracted task

1. Newly confirmed assessments begin with no priority and no estimate.
2. User selects an assessment.
3. User sets High, Medium, or Low priority.
4. User adds optional notes.
5. For an assignment or manual work task, user sets estimated focus time.
6. For a quiz or test, estimated focus time may stay empty.
7. User may edit the deadline if the instructor later changes it.

### 7.6 Creating a manual task

1. User selects Add task.
2. User chooses a course or Personal/Uncategorized.
3. User enters title, deadline, priority, notes, and estimated time.
4. User saves the task.
5. The task appears in the selected course and in the priority-based All tasks view.

Manual review sessions do not need to link to imported tests in the MVP.

### 7.7 Planning Today

1. User opens All tasks or a course.
2. User sees High, Medium, and Low priority groups.
3. Each priority group is ordered by nearest deadline.
4. User selects any combination, such as two High, one Medium, and one Low task.
5. Selected tasks appear in Today in the same priority/deadline ordering.
6. The app does not assign start times or automatically choose the daily list.

### 7.8 Completing focused work

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

### 7.9 End-of-day rollover

1. At the end of the user's local day, the server checks Today.
2. Any task not completed moves to Backlog, whether or not it was started.
3. The task keeps its course, deadline, priority, notes, estimate, and accumulated focus time.
4. The next daily summary identifies Backlog items separately.

### 7.10 Manually changing a deadline

1. User edits the assessment when an instructor announces a changed deadline.
2. App stores the new deadline and recalculates reminders.
3. Priority, notes, Today status, and focus progress remain unchanged.
4. If the new deadline is inside three days, the app shows an immediate confirmation/alert.

### 7.11 Re-importing a revised outline

Re-import is supported but conservative:

1. User uploads a newer outline for an existing course.
2. App parses it into a comparison draft.
3. Existing confirmed tasks are never overwritten automatically.
4. App shows possible additions, removals, and changed dates side by side.
5. User explicitly accepts each change.

This workflow is useful when an instructor publishes an amended outline, but manual deadline editing remains the normal MVP workflow.

## 8. Information architecture and screens

### Primary navigation

1. Today
2. Semester
3. All tasks
4. Backlog
5. Completed
6. Settings

### Today

- Daily summary and approaching deadlines
- Selected Today queue
- Course, priority, and deadline on every item
- Start/resume focus action
- Backlog warning when applicable

### Semester

- Semester selector
- Course cards with task counts and nearest deadline
- Import outlines action
- Draft import/review status
- Course detail grouped by assessment category

### Outline review

- PDF filename and detected course information
- Extracted assessment categories
- Editable title, type, deadline/time, and weight
- Source page/excerpt for every item
- Confidence and missing-information warnings
- Remove item, save draft, and confirm course actions
- Import errors explained in plain language

### All tasks

- High, Medium, Low, and Unprioritized sections
- Nearest deadline first inside each section
- Course and assessment type filters
- Add to Today action
- Manual task creation

### Backlog

- Deadline visually emphasized
- Overdue state clearly differentiated
- Resume focus, return to Today, edit, and complete actions

### Completed

- Title
- Course
- Deadline
- No detailed analytics required for MVP

### Settings

- Microsoft account information
- Daily summary time and time zone
- Push and email preferences
- PDF retention preference
- Export data and Import data
- Sign out and delete account/data

## 9. Outline parsing specification

### Required extracted course fields

- Course code
- Course name when present
- Semester/term when present
- Outline filename

### Required assessment fields

- Assessment title
- Assessment category
- Due date
- Due time when explicitly stated
- Grade weight when present
- Source page number
- Short source excerpt or table-row evidence
- Extraction confidence/state

### Assessment categories

- Assignment
- Quiz
- Test/Exam
- Other Assessment

The source wording should be retained. For example, Research Paper may be categorized as Assignment or Other Assessment while keeping Research Paper as its title.

### Date handling

- Never invent a date, time, or year.
- Date not announced is a valid result.
- Ambiguous dates require review.
- The semester year may resolve month/day dates only when the outline clearly identifies the semester.
- Week numbers without calendar dates remain unresolved unless a schedule table explicitly maps the week to dates.
- Times default to the user's time zone only after confirmation.
- If no time is stated, store a date-only deadline rather than assuming 11:59 PM.

### Confidence states

- Ready to confirm
- Needs date review
- Needs type review
- Possible duplicate
- Could not extract

### Parsing pipeline

1. Validate PDF MIME type, extension, and size.
2. Extract embedded text and page boundaries.
3. Extract tables when possible.
4. Detect low-text/scanned pages and run OCR only where needed.
5. Send normalized page content to a structured assessment extractor.
6. Require output to match a strict schema.
7. Validate dates, categories, duplicates, and course identity.
8. Attach page evidence to every candidate.
9. Save only a draft until the user confirms it.

The extraction system may use a language model, but model output is never authoritative. The PDF evidence and user confirmation are the source of truth.

## 10. Task rules

### Priority ordering

1. High tasks appear before Medium tasks.
2. Medium tasks appear before Low tasks.
3. Low tasks appear before Unprioritized tasks.
4. Inside a priority group, overdue tasks appear first, followed by the earliest deadline.
5. Date-not-announced items appear after dated items within their priority group.
6. The app never changes priority automatically in the MVP.

### Source-of-truth rules

The confirmed outline import supplies the initial:

- Course
- Assessment title
- Assessment category
- Deadline
- Optional grade weight
- Source evidence

The user controls all values after confirmation, including:

- Corrected title/type/deadline
- Priority
- Notes
- Estimated work time
- Today membership
- Backlog status
- Completion status
- Focus progress

### Reminder rules

- Default deadline reminders: seven days, three days, and one day before.
- If a confirmed or manually edited item is already inside a reminder window, notify immediately and schedule only future applicable reminders.
- Editing a deadline recalculates future reminders.
- Do not send the same reminder threshold more than once for the same task/deadline combination.
- Daily summary time is selected by the user.
- Push and email are both supported.
- Tasks without a confirmed date do not receive deadline reminders and appear in a Missing dates section of the daily summary.

## 11. Timer behavior

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
- Only one timer may be active for a user.
- Server stores authoritative start time, accumulated time, and state.
- Client derives the displayed countdown from timestamps rather than writing every second.
- Closing the browser does not lose progress.
- Another signed-in device displays the same timer state.
- Expiry plays a sound when an active client is open.
- Additional time is stored separately from the initial estimate.

## 12. Suggested data model

### User

- id
- Microsoft account subject identifier
- email
- display name
- time zone
- daily summary time
- notification preferences
- created/updated timestamps

### Semester

- id
- user id
- name
- start date
- end date
- active state

### Course

- id
- semester id
- user id
- course code
- course name
- optional color
- confirmed/draft state

### Outline import

- id
- course id or draft course id
- original filename
- encrypted/private object-storage key
- file hash
- parser version
- processing state
- uploaded/processed/confirmed timestamps
- retention/deletion timestamp

### Extraction candidate

- id
- outline import id
- proposed title
- proposed category
- proposed deadline/time
- proposed weight
- page number
- source excerpt
- confidence state
- user corrections
- accepted/removed state

### Task

- id
- user id
- semester id
- course id or null
- source: outline or manual
- extraction candidate id or null
- title
- type: assignment, quiz, test/exam, other assessment, or manual
- deadline and whether it is date-only
- initial outline deadline
- optional grade weight
- priority: high, medium, low, or unprioritized
- notes
- estimated seconds
- accumulated focus seconds
- state: active, today, backlog, or completed
- created/updated/completed timestamps

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
- notification type
- task deadline used for scheduling
- channel: push or email
- scheduled/sent/failed timestamps
- deduplication key

## 13. Recommended technical architecture

### Client

- Responsive React/TypeScript PWA
- Accessible desktop and mobile layouts
- Multi-file drag-and-drop PDF upload
- PDF page/excerpt viewer for verification
- Service worker for installation, caching, and push notifications
- Local cache for fast loading and limited offline viewing

### Authentication

- Microsoft OpenID Connect/OAuth sign-in
- Restrict the MVP to the intended University of Calgary account if desired
- Secure server session using HTTP-only cookies
- Microsoft sign-in is planner authentication only; it does not grant Brightspace access

### Backend

- TypeScript API/server functions
- Relational database for users, semesters, courses, candidates, tasks, timers, and notification state
- Private object storage for temporary course-outline files
- Asynchronous document-processing jobs
- Background scheduler for reminders, daily summaries, and end-of-day rollover
- Queue/retry system for parsing, email, and push delivery

### Document-processing service

- Embedded PDF text extraction
- Table extraction
- OCR fallback for scanned pages
- Strict structured-output extraction
- Page-level evidence and confidence validation
- Parser versioning so results can be reproduced and improved

### External services

- Microsoft identity platform for planner sign-in
- Transactional email provider
- Web Push for browser notifications
- PDF/OCR and structured extraction provider(s)

## 14. Security and privacy requirements

- Never collect or store the user's University password or MFA codes.
- Course outlines are private user documents and must not be publicly accessible.
- Use short-lived signed URLs for document access.
- Encrypt stored files and database data at rest using platform-managed encryption.
- Do not place document text in logs, analytics, or error messages.
- Enforce per-user authorization for every semester, course, file, task, and timer operation.
- Use CSRF protection and secure cookie settings.
- Delete original PDFs after confirmation by default, unless the user chooses to retain them for source review.
- Store page evidence needed for verification only as long as required by the retention choice.
- Do not use uploaded outlines for model training.
- Provide account/data deletion.
- Exclude original PDFs from normal planner exports unless explicitly selected.

## 15. MVP acceptance criteria

The MVP is complete when all of the following are true:

1. User can sign in with the selected Microsoft school account.
2. User can create and select a semester.
3. User can upload several valid course-outline PDFs in one session.
4. App reports unsupported, corrupt, oversized, or password-protected files clearly.
5. Native-text PDFs are parsed and scanned PDFs use OCR fallback.
6. App creates one draft course per outline and does not create active tasks before confirmation.
7. Parser extracts assessment titles, categories, dates/times, optional weights, and source pages when available.
8. Missing or ambiguous fields are highlighted instead of invented.
9. User can view source evidence and correct, remove, or add assessment items.
10. User can confirm a course and see its complete semester task list.
11. Reprocessing the same file does not create duplicate confirmed tasks.
12. User can create and edit manual tasks.
13. User can manually update any deadline.
14. Active tasks are grouped by priority and sorted by deadline.
15. User can select tasks for Today.
16. Timer can start, pause, resume, survive browser closure, and synchronize across devices.
17. Timer expiry plays a sound and presents Finished, Keep working, and Finish later.
18. Keep working accepts an additional duration.
19. Finish later moves the task to Backlog with a highlighted deadline.
20. End-of-day rollover moves incomplete Today tasks to Backlog.
21. Seven-day, three-day, one-day, urgent, and daily-summary notifications are deduplicated.
22. Completed section shows title, course, and deadline.
23. User can export and import planner data.
24. User can sign out and delete the planner account and stored data.

## 16. Development milestones

### Milestone 0: Outline-parsing feasibility spike

- Collect 5–10 privacy-scrubbed UCalgary course-outline PDFs representing different faculties, layouts, tables, and at least one scanned file if available.
- Define the strict extraction schema.
- Test embedded text extraction, table extraction, and OCR fallback.
- Measure assessment recall, incorrect extractions, date accuracy, and page-evidence accuracy.
- Confirm Microsoft tenant sign-in configuration for the selected school account.
- Decide PDF file-size limit and default retention policy.

Exit condition: on the sample set, all real assessments are either extracted correctly or clearly flagged for review, and no unsupported claim silently becomes a confirmed task.

### Milestone 1: Product foundation

- Microsoft sign-in
- User settings and time zone
- Cloud database and authorization boundaries
- Semester and course models
- Responsive application shell
- Manual task creation
- High/Medium/Low grouping and deadline ordering

### Milestone 2: PDF import pipeline

- Multi-file upload
- Private temporary file storage
- Text/table extraction
- OCR fallback
- Structured assessment extraction
- Validation, confidence states, and page evidence
- Processing progress and error recovery

### Milestone 3: Course review and semester plan

- Draft course screen
- Editable extracted assessments
- PDF evidence viewer
- Missing/ambiguous date handling
- Confirm course workflow
- Course-grouped semester view
- Duplicate prevention
- Conservative revised-outline comparison

### Milestone 4: Daily planning and task lifecycle

- Add/remove tasks from Today
- Backlog
- End-of-day rollover
- Completed section
- Manual deadline editing
- Cross-device synchronization

### Milestone 5: Focus timer

- Start, pause, resume, and synchronized countdown
- Browser-close recovery
- Sound and expiry prompt
- Finish, additional time, and defer outcomes
- One-active-timer enforcement

### Milestone 6: Notifications

- Push subscription and delivery
- Email delivery
- Seven-day, three-day, and one-day reminders
- Urgent alerts for newly confirmed or manually shortened deadlines
- Configurable daily summary
- Missing-date summary
- Delivery deduplication and retry handling

### Milestone 7: Reliability and private launch

- Export/import backup
- Accessibility and responsive QA
- Security and document-retention review
- Automated parser, planning, timer, rollover, and notification tests
- Monitoring and private production deployment

## 17. Test strategy

### Parser evaluation set

Maintain a privacy-scrubbed set of representative outlines with a manually verified answer file. Track:

- Assessment recall
- Incorrect assessment rate
- Exact date/time accuracy
- Category accuracy
- Course-code accuracy
- Source-page accuracy
- Missing/ambiguous field detection

### Unit tests

- Date normalization without invented values
- Category normalization while preserving source wording
- Duplicate detection by file hash and assessment identity
- Priority/deadline ordering
- Reminder threshold calculations
- End-of-day rollover
- Timer state transitions

### Integration tests

- Microsoft sign-in callback and account restrictions
- Authorized upload and private file access
- Text PDF and scanned PDF processing
- Parser failure/retry behavior
- Course confirmation transaction
- Cross-device timer state
- Push/email deduplication
- Export/import round trip

### End-to-end scenarios

- User uploads several outlines and confirms a complete semester plan.
- Outline contains a table with multiple assessment types and dates.
- Outline contains Date TBD and the app does not invent a value.
- Parser proposes an incorrect item and the user removes it before confirmation.
- User manually changes a deadline and reminders are recalculated.
- Today task is not started and moves to Backlog at day end.
- Timer expires and each of the three outcomes behaves correctly.

## 18. Key risks and mitigations

### Outline variation

Risk: UCalgary recommends a course-outline template, but faculties and instructors may use different tables, wording, and layouts.

Mitigation: hybrid text/table/OCR pipeline, strict schema, page evidence, confidence states, representative evaluation set, and mandatory user confirmation.

### Missing or provisional dates

Risk: outlines may contain Date TBD, date ranges, week numbers, or dates later scheduled by the Registrar.

Mitigation: allow date-not-announced tasks, never infer unsupported values, show a Missing dates section, and support fast manual editing.

### Parser hallucination

Risk: a model may convert policies, examples, or late-assignment text into fake assessments.

Mitigation: require source-page evidence, validate against assessment sections/tables, keep all output in draft, and never create active tasks before confirmation.

### Scanned or inaccessible PDFs

Risk: OCR may misread course codes, numbers, or dates.

Mitigation: OCR only as fallback, flag low-confidence fields, show the original page, and make correction quick.

### Private document exposure

Risk: course outlines may contain internal course information.

Mitigation: private object storage, strict authorization, short-lived file URLs, no document logging, configurable retention, and deletion after confirmation by default.

### Missed notifications

Risk: browser push can be disabled or unavailable.

Mitigation: email as a second channel, notification-health status in Settings, and in-app reminders.

## 19. Deferred decisions

These do not block the feasibility spike but must be decided before the related milestone:

- Exact Microsoft identity configuration and whether access is restricted to one account
- Cloud platform, database, job scheduler, email provider, and push service
- PDF parsing/OCR/model providers
- Maximum PDF size and page count
- Original-PDF retention period after confirmation
- Course colors
- Exact additional-time choices after timer expiry
- Exact end-of-day rollover time if different from midnight
- Data retention period for completed tasks and notification logs
- Whether exports are encrypted
- How Other Assessments are subdivided after observing real outlines

## 20. Future roadmap

### Phase 2

- Improved revised-outline comparison
- Optional automatic categorization learned from confirmed outline examples
- Native desktop wrapper with local file import and stronger background behavior
- Native mobile application and richer push actions

### Phase 3

- Optional University-approved Brightspace OAuth/API integration
- Automatic detection of changed deadlines and new assessments
- Submission/completion detection when permitted
- Optional automatic priority recommendations
- Calendar time-blocking and availability-aware scheduling
- Focus analytics and estimation feedback

## 21. First development action

Begin with Milestone 0, not the final interface. Collect a small set of representative, privacy-scrubbed course-outline PDFs and build a disposable parser proof of concept that outputs strict structured data with page evidence.

The first proof-of-concept deliverable should be a JSON result shaped like:

```json
{
  "courseCode": "CPSC 111",
  "courseName": "Introduction to Computing",
  "semester": "Fall 2026",
  "assessments": [
    {
      "title": "Assignment 1",
      "category": "assignment",
      "dueDate": "2026-09-25",
      "dueTime": null,
      "weightPercent": 10,
      "sourcePage": 4,
      "confidence": "ready_to_confirm"
    }
  ]
}
```

Do not proceed to full UI development until the parser spike demonstrates that wrong or missing information is exposed for review rather than silently accepted.
