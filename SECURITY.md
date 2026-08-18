# Foldline security review (MVP)

## Threat model addressed in code
1. **Tenant isolation + least privilege:** Supabase RLS is enabled on every exposed table. Authenticated clients can read only their own documents and cannot directly mutate document/job/audit/subscription tables; writes go through server routes with explicit ownership checks.
2. **Credential leakage:** R2, Stripe, Supabase service-role and OCR secrets are server-only environment variables. Browser receives only short-lived signed URLs.
3. **Malicious uploads:** allowlisted MIME types, 25 MB limit, R2 HEAD verification, then byte-signature validation again inside the OCR gateway.
4. **SSRF:** OCR gateway refuses non-HTTPS file URLs and only accepts Cloudflare R2 hosts; callbacks are restricted to one configured origin.
5. **ZIP bombs/path traversal:** result archive file count, compressed/uncompressed size and member paths are checked before reading MonkeyOCR output.
6. **CSRF:** browser state-changing app routes require `Origin` to exactly match `NEXT_PUBLIC_APP_URL`; external callbacks use independent HMAC/Stripe signature verification.
7. **Webhook forgery/replay:** Stripe signature verification uses the raw body and 5-minute tolerance; OCR callbacks use HMAC + timestamp. Stripe event IDs are stored for idempotency.
8. **Spreadsheet formula injection:** exported CSV cells beginning with `=`, `+`, `-`, or `@` are escaped.
9. **XSS/clickjacking:** React escaping plus CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, no HTML rendering of OCR output.
10. **Audit integrity:** approval/edit audit records are written using the server service role; authenticated clients receive no insert/update policy on audit tables.

## Must configure outside the repository
- Cloudflare WAF managed rules and per-IP/per-account rate limits for auth, presign, process, billing and webhook routes.
- R2 bucket remains private; bucket token is scoped to one bucket only; enable lifecycle deletion matching your retention policy.
- Supabase: MFA for project admins, leaked-password protection if available, Auth rate limits, DB backups/PITR appropriate to your plan.
- OCR host: firewall/private network between gateway and MonkeyOCR, patched GPU image, no public MonkeyOCR `/docs` in production, disk cleanup for artifacts.
- Stripe: restricted keys where supported, webhook endpoint secret rotation, least-privilege dashboard access.

## Known MVP limitations
- The extractor is heuristic. It is deliberately reviewed by a human and must not be marketed as accounting/tax correctness.
- Evidence is text-snippet provenance, not pixel-level bounding-box provenance yet.
- A durable queue is recommended before significant traffic. FastAPI `BackgroundTasks` is acceptable for a controlled long-running MVP host, not a horizontally autoscaled job system.
- CSP uses a per-request nonce for scripts. Inline styles remain allowed for pragmatic Next/React compatibility; keep user-controlled values out of style strings.
- No malware scanning is included. If customers upload arbitrary office formats later, add sandboxing/AV before parsing; current input is restricted to PDF/images.
- Free-plan quota checks are application-level. Before broad public launch, add Cloudflare rate limiting/Turnstile and/or a transactional DB quota to reduce concurrent-abuse risk.
