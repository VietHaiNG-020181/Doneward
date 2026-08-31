# Security policy

## Supported version

Doneward is currently an early prototype. Security fixes are applied to the latest commit on `main`; older snapshots are not supported.

## Reporting a vulnerability

Do not open a public issue containing secrets, private course documents, account information, or exploit details. Report the issue privately to the repository owner through GitHub's private vulnerability reporting feature when it is enabled. Include the affected component, reproduction steps, impact, and any suggested mitigation.

If private reporting is unavailable, contact the repository owner privately before disclosing details. Do not test against accounts, documents, or systems you do not own or have permission to assess.

## Security model

- Hosted planner data is stored in per-user D1 rows behind a same-origin authenticated API; IndexedDB is an offline cache.
- The task API derives ownership only from platform-authenticated request headers, never from a browser-supplied user ID.
- Ollama and the extraction service bind only to loopback and must never be exposed through a public tunnel, router rule, or `0.0.0.0` binding.
- Browser calls to the extraction service require both an exact allowlisted origin and a device-generated pairing token.
- PDF uploads are not retained. The service validates the PDF signature and applies byte, page, request-rate, socket-timeout, and single-extraction limits before local model use.
- Extracted content is treated as untrusted input and normalized against an allowlisted schema before import.
- Users must review extracted tasks before they enter the planner.
- Hosted responses deny framing and MIME sniffing, restrict referrers and browser permissions, and apply a restrictive Content Security Policy.
- The retired ChatGPT extension remains only as archived source and is not part of the public web build.
- Local `.env*` files and generated deployment state are ignored by Git.

## Operator checklist

Before publishing or deploying:

1. Run `npm run lint` and `npm test`.
2. Run a dependency vulnerability audit and review every production finding.
3. Confirm `git status` does not include `.env` files, credentials, private course outlines, database files, or build output.
4. Confirm the backend allowlist contains only localhost and the exact intended hosted origin; never use `*`.
5. Confirm ports `4317` and `11434` are reachable only through loopback.
6. Use repository secret scanning and dependency update alerts where available.
7. Deploy owner-only until application authentication and per-user server authorization are implemented.

## Known limitations

- Browser-local storage is not encrypted and is available to the local browser profile. The hosted D1 copy is the durable production record.
- Cross-device task synchronization is available on the hosted Site, but account export and deletion controls are not yet exposed in the interface.
- Code served by the trusted hosting origin necessarily runs with access to that origin's IndexedDB and pairing token. Hosting-account security and dependency integrity remain part of the trust boundary.
- The CSP currently permits inline framework bootstrap scripts. Moving to per-response nonces is future defense in depth.
- Pairing does not protect against malware already running as the same macOS user.
