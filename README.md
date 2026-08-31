# Doneward

Doneward is a privacy-minded academic task planner. It helps students turn course-outline deadlines into a reviewed semester plan, choose work for today, and stay focused with task timers.

The current prototype runs as a responsive web app and stores planner data in the browser. Course-outline extraction is performed by a private Ollama backend on the same Mac. Review is mandatory before extracted tasks are added.

## Current features

- Today, Upcoming, Backlog, and completed task views
- Manual priority, deadline, course, and focus-duration controls
- Offline browser caching through IndexedDB with authenticated cloud synchronization in production
- PDF course-outline import with structured review
- Private local Ollama extraction for text-based PDFs
- Installable web-app metadata and local browser persistence

## Requirements

- Node.js 22.13 or newer
- npm
- Ollama with `qwen3:4b-instruct-2507-q4_K_M`
- Python 3 with `pypdf`

## Local development

```bash
npm install
npm run dev
```

Open the local address printed by the development server.

## Validation

```bash
npm run lint
npm test
```

`npm test` performs a production build before running the Node test suite.

## Local course-outline extraction

Run the private local services before using **Import tasks**:

```bash
./scripts/start-local-services.sh
```

The backend listens only on `127.0.0.1:4317`, accepts requests only from exact allowlisted Doneward origins, and requires a device-generated pairing token. On first use, open the pairing page from **Import tasks**, copy the one-device code, and save it in Doneward. The backend validates the PDF signature, enforces size, page, rate, and concurrency limits, extracts text in memory, and sends that text to Ollama on `127.0.0.1:11434`. It does not use an API key or retain the uploaded PDF. Scanned image-only PDFs currently require OCR before import.

The installed Mac service allowlists the local app and the private production origin. If the hosted domain changes, update `DONEWARD_ALLOWED_ORIGINS` to the new exact HTTPS origin before using imports there.

Always review the returned course name, task names, categories, and deadlines before importing.

## Data and privacy

- Planner tasks use authenticated, per-user D1 storage on the hosted app, with IndexedDB as an offline cache. Local development remains device-only when no Sites identity is present.
- Import drafts stay in browser IndexedDB. Original PDFs and extracted text are processed locally and are not retained.
- PDFs are processed in memory by the localhost backend and are not retained.
- The backend and Ollama bind only to the loopback interface.
- The pairing token is generated on the Mac with owner-only file permissions and stored by the paired browser in IndexedDB.
- `.env*`, build output, local Cloudflare state, and dependencies are excluded from Git.

See [SECURITY.md](SECURITY.md) for reporting and operational guidance and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design and trust boundaries.

## Project structure

- `app/` — application routes and interface
- `lib/` — browser persistence and import normalization
- `worker/` — Cloudflare Worker entry point
- `backend/` — private localhost PDF and Ollama extraction service
- `scripts/start-local-services.sh` — local service launcher
- `doneward-chatgpt-bridge/` — archived, non-public extension prototype
- `tests/` — automated tests
- `DONEWARD_PRODUCT_PLAN.md` — product direction and roadmap

## Deployment

The app is configured for OpenAI Sites/Cloudflare through `.openai/hosting.json` and `vite.config.ts`. Run a clean production build before deploying. Do not commit local environment files or generated deployment state.

## Status

Doneward is an early prototype. Browser-local data is not yet synchronized across devices and should not be treated as a backup.
