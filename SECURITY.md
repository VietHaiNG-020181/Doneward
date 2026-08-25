# Security policy

## Supported version

Doneward is currently an early prototype. Security fixes are applied to the latest commit on `main`; older snapshots are not supported.

## Reporting a vulnerability

Do not open a public issue containing secrets, private course documents, account information, or exploit details. Report the issue privately to the repository owner through GitHub's private vulnerability reporting feature when it is enabled. Include the affected component, reproduction steps, impact, and any suggested mitigation.

If private reporting is unavailable, contact the repository owner privately before disclosing details. Do not test against accounts, documents, or systems you do not own or have permission to assess.

## Security model

- Planner data is stored in the user's browser through IndexedDB.
- The optional browser extension is limited to the declared Doneward and ChatGPT origins.
- Extension background messages are accepted only from the expected Doneward or ChatGPT tab.
- Course-outline PDFs are temporarily stored in extension-local storage, cleared after result delivery, and expired after 24 hours if a job is abandoned.
- Extracted content is treated as untrusted input and normalized against an allowlisted schema before import.
- Users must review extracted tasks before they enter the planner.
- Local `.env*` files and generated deployment state are ignored by Git.

## Operator checklist

Before publishing or deploying:

1. Run `npm run lint` and `npm test`.
2. Run a dependency vulnerability audit and review every production finding.
3. Confirm `git status` does not include `.env` files, credentials, private course outlines, database files, or build output.
4. Inspect changes to extension permissions and host access.
5. Rebuild `public/doneward-chatgpt-bridge.zip` from the reviewed extension source.
6. Use repository secret scanning and dependency update alerts where available.

## Known limitations

- The browser extension automates the ChatGPT web interface and can break when that interface changes.
- Browser-local storage is not an encrypted backup and is available to the local browser profile.
- Localhost access in the development extension manifest is intentionally broad across localhost ports.
- The prototype does not yet provide cross-device synchronization, account deletion, or server-side per-user authorization.
