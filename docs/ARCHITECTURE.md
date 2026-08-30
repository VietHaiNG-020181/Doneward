# Architecture

## Overview

Doneward currently has three cooperating pieces:

1. A vinext/React web application renders the planner and import review interface.
2. IndexedDB stores tasks and unconfirmed course drafts in the local browser profile.
3. A private localhost backend extracts PDF text and asks a local Ollama model for structured task data.

## Data flow

### Planner data

The interface calls `lib/doneward-store.ts`, which reads and writes the `doneward-db` IndexedDB database. Tasks are not sent to an application backend in the current prototype.

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

The production build uses vinext and a Cloudflare Worker entry point. `.openai/hosting.json` declares the Sites project. D1 scaffolding is present for future server persistence but is not used by the current planner data path.

## Future architecture work

- Add authenticated server persistence and per-user authorization for cross-device sync.
- Define document retention and deletion controls before server-side PDF storage.
- Replace the transitional inline-script CSP allowance with nonces when the hosting runtime supports them end to end.
- Add structured local audit events without document text or task contents.
- Add OCR for scanned image-only PDFs.
