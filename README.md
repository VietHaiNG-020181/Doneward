# Doneward

Doneward is a privacy-minded academic task planner. It helps students turn course-outline deadlines into a reviewed semester plan, choose work for today, and stay focused with task timers.

The current prototype runs as a responsive web app and stores planner data in the browser. Course-outline extraction is performed through an optional personal Chrome/Edge extension that uses the user's already signed-in ChatGPT tab. Review is mandatory before extracted tasks are added.

## Current features

- Today, Upcoming, Backlog, and completed task views
- Manual priority, deadline, course, and focus-duration controls
- Persistent browser storage through IndexedDB
- PDF course-outline import with structured review
- Optional personal ChatGPT bridge for PDF extraction
- Installable PWA shell and offline fallback

## Requirements

- Node.js 22.13 or newer
- npm
- Chrome or Edge for the optional course-outline bridge

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

## Course-outline bridge

The optional extension lives in `doneward-chatgpt-bridge/`. To load it locally:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked** and choose `doneward-chatgpt-bridge/`.
4. Sign in to ChatGPT in the same browser.
5. Return to Doneward and use **Import tasks**.

The extension is restricted to the Doneward production origin, localhost development pages, and `chatgpt.com`. It does not request cookie access or read passwords. During an import, the selected PDF is temporarily stored in extension-local storage, sent to the created ChatGPT tab, and removed from storage after delivery. Stale jobs are deleted after 24 hours.

Because this prototype automates ChatGPT's web interface, interface changes can require an extension update. Always review the returned course name, task names, categories, and deadlines before importing.

## Data and privacy

- Planner tasks and import drafts stay in the browser's IndexedDB in the current prototype.
- PDFs pass directly from the Doneward page to the local extension; the Doneward server does not receive them.
- The extension can interact only with the origins declared in its manifest.
- `.env*`, build output, local Cloudflare state, and dependencies are excluded from Git.

See [SECURITY.md](SECURITY.md) for reporting and operational guidance and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design and trust boundaries.

## Project structure

- `app/` — application routes and interface
- `lib/` — browser persistence and import normalization
- `worker/` — Cloudflare Worker entry point
- `doneward-chatgpt-bridge/` — optional browser extension source
- `tests/` — automated tests
- `DONEWARD_PRODUCT_PLAN.md` — product direction and roadmap

## Deployment

The app is configured for OpenAI Sites/Cloudflare through `.openai/hosting.json` and `vite.config.ts`. Run a clean production build before deploying. Do not commit local environment files or generated deployment state.

## Status

Doneward is an early prototype. Browser-local data is not yet synchronized across devices and should not be treated as a backup.
