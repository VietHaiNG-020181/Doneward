# Architecture

## Overview

Doneward currently has three cooperating pieces:

1. A vinext/React web application renders the planner and import review interface.
2. IndexedDB caches tasks for offline use and stores unconfirmed course drafts in the local browser profile.
3. A private localhost backend extracts PDF text and asks a local Ollama model for structured task data.
4. The hosted app synchronizes confirmed tasks to user-scoped D1 storage through an authenticated same-origin API.

## Data flow

### Planner data

The interface reads and writes the `doneward-db` IndexedDB cache first, so task changes remain usable during a temporary network failure. On the hosted Site, `lib/task-sync.ts` sends normalized tasks and deletion tombstones to `/api/tasks`. The API derives the stable owner ID from platform-authenticated headers, validates every field, and upserts only that user's D1 rows. Local development has no platform identity and therefore remains device-only.

Last-write-wins timestamps resolve changes made on different devices. Deleted task tombstones prevent an older offline copy from silently recreating a deleted task. D1 is the authoritative production copy; IndexedDB is the offline cache.

### Course-outline import

1. The user selects one PDF, limited to 20 MB.
2. The web app sends the PDF body to the backend bound to `127.0.0.1:4317`.
3. The backend validates an exact origin allowlist and a per-device bearer token.
4. It validates the PDF signature, content type, 20 MB size, and 200-page limit, then applies extraction rate and concurrency limits.
5. PDF text is extracted in memory with `pypdf`; the original bytes are not retained.
6. The extracted text is sent to Ollama on `127.0.0.1:11434` with a strict JSON schema.
7. The backend validates course, category, task-name, and deadline fields before returning them.
8. The Doneward page normalizes the result again against allowlisted categories and date formats.
9. The user reviews and edits the draft before confirming it into planner storage.

## Trust boundaries

- The backend accepts browser requests only from exact allowlisted Doneward origins with a constant-time checked pairing token.
- Both the backend and Ollama bind to the loopback interface and are not exposed to the network.
- Local-model output is untrusted. Only the expected object shape, known categories, task names, and strict date formats are retained.
- The application never asks for or reads ChatGPT passwords, session cookies, or API keys.
- Hosted responses set CSP, anti-framing, MIME-sniffing, referrer, browser-permission, and HTTPS transport headers.
- The obsolete extension download and cache-all service worker are no longer publicly served.

## Runtime and deployment

The production build uses vinext and a Cloudflare Worker entry point. `.openai/hosting.json` declares the Sites project and the logical `DB` D1 binding. Drizzle schema and migrations define user and task records; the hosting platform owns the real database resource and applies the packaged migrations.

## Future architecture work

- Add account export and deletion controls for the cloud task copy.
- Define document retention and deletion controls before server-side PDF storage.
- Replace the transitional inline-script CSP allowance with nonces when the hosting runtime supports them end to end.
- Add structured local audit events without document text or task contents.
- Add OCR for scanned image-only PDFs.
