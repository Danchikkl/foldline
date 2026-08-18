# Foldline MVP verification report

Date: 2026-08-09

## Checks completed in the build environment

- TypeScript/TSX syntax transpilation across project source: PASS.
- Local `@/…` import target resolution scan: PASS.
- ASCII control-character scan: PASS.
- Python `py_compile` for OCR gateway/security/tests: PASS.
- OCR gateway security tests (6): PASS.
  - R2 SSRF allowlist/rejection
  - embedded URL credential rejection
  - callback origin restriction
  - constant-time token comparison behavior
  - PDF/PNG magic-byte validation
  - ZIP path traversal rejection and safe markdown extraction
- Invoice extraction smoke test: PASS.
- Deterministic invoice reconciliation smoke test: PASS.
- CSV spreadsheet-formula injection defense smoke test: PASS.
- Obvious unsafe rendering/eval primitive scan (`dangerouslySetInnerHTML`, `eval`, `new Function`, `document.write`): PASS/no matches.
- Secret-file scan: no `.env`, private key, or PEM material found in repository.

## Security hardening included

- Read-only authenticated access to document/job/audit/subscription data; mutations are server-side with explicit ownership checks.
- Supabase RLS plus explicit Postgres grants (defense in depth).
- Private R2 storage and short-lived presigned URLs.
- Upload size/MIME checks plus downstream magic-byte verification.
- OCR gateway SSRF guard, bounded downloads, ZIP-bomb/path-traversal controls.
- Exact-origin CSRF checks for browser mutations.
- HMAC/timestamp verification for OCR callbacks.
- Stripe raw-body webhook signature verification + event-id idempotency.
- Per-request nonce-based CSP for scripts; clickjacking and MIME-sniffing headers.
- CSV formula-injection escaping.
- OCR retry cap to reduce GPU abuse.
- Dependency versions pinned for application/runtime packages; Dependabot + CI included.

## Verification not completed here

A real `npm install`, `npm run typecheck`, and `npm run build` could not be executed in this sandbox because the configured internal npm registry did not contain required packages, and direct npm registry access timed out. The repository includes CI that performs those checks in a normal GitHub runner. Do not call the project production-verified until that CI passes and a Cloudflare preview deployment is exercised end-to-end.

A security review is never a guarantee of absence of vulnerabilities. Before processing sensitive customer documents, also configure provider-side WAF/rate limits, backups, secret rotation, R2 retention, and production monitoring.

## Launch-readiness patch checks

Additional checks after the website-launch patch:

- `services/ocr-gateway/test_security.py`: 6/6 pass.
- Global TypeScript parser found no TSX parse-class errors in the source tree. Full type resolution still requires project dependencies to be installed.
- No `dangerouslySetInnerHTML`, `eval()`, `new Function()`, or `document.write()` patterns found in app/components/lib/services.
- No `<img>` element without an `alt` attribute found in app/components.
- Google Analytics is opt-in and remains disabled when `NEXT_PUBLIC_GA_ID` is unset.
- Private product routes carry `noindex`; robots rules disallow API/workspace paths.
