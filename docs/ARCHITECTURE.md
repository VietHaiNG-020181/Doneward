# Architecture

## Overview

Doneward currently has three cooperating pieces:

1. A vinext/React web application renders the planner and import review interface.
2. IndexedDB stores tasks and unconfirmed course drafts in the local browser profile.
3. An optional Manifest V3 browser extension transfers a selected PDF to a dedicated ChatGPT tab and returns normalized task data to the review interface.

## Data flow

### Planner data

The interface calls `lib/doneward-store.ts`, which reads and writes the `doneward-db` IndexedDB database. Tasks are not sent to an application backend in the current prototype.

### Course-outline import

1. The user selects one PDF, limited to 20 MB.
2. The web app validates the type and size, reads it as base64, and posts a same-origin window message.
3. The Doneward content script validates the message and stores a temporary job in extension-local storage.
4. The background worker creates a non-active `chatgpt.com` tab and binds the job to that tab ID.
5. The ChatGPT content script uploads the PDF, submits a fixed extraction prompt, and parses the response.
6. The background worker accepts progress or results only from the bound ChatGPT tab.
7. The Doneward page normalizes the result against allowlisted assessment categories and date formats.
8. The user reviews and edits the draft before confirming it into planner storage.
9. The extension removes the PDF payload after completion; abandoned jobs expire after 24 hours.

## Trust boundaries

- Window messages are accepted only from the same window and origin and must include the expected source marker.
- Extension messages are checked against the extension ID, sender origin, and expected tab ID.
- ChatGPT output is untrusted. Only the expected object shape, known categories, task names, and strict date formats are retained.
- The extension requests access only to the Doneward production site, localhost development pages, and `chatgpt.com`.
- The application never asks for or reads ChatGPT passwords, session cookies, or API keys.

## Runtime and deployment

The production build uses vinext and a Cloudflare Worker entry point. `.openai/hosting.json` declares the Sites project. D1 scaffolding is present for future server persistence but is not used by the current planner data path.

## Future architecture work

- Add authenticated server persistence and per-user authorization for cross-device sync.
- Define document retention and deletion controls before server-side PDF storage.
- Add rate limits, CSRF protection, and audit logging to future write APIs.
- Add content-security and platform response headers after verifying compatibility with the selected hosting runtime.
- Replace browser UI automation with a stable supported integration when one is available.
