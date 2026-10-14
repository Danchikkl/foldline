# Foldline — Invoice exception control MVP

Foldline is an early B2B accounts-payable product. The current reliable product scope is intentionally narrow:

**Incoming invoice → extraction → reliability gate → duplicate/completeness/arithmetic checks → exception review → export**

Revised-invoice follow-up and broader PO/receipt matching remain validation targets, not finished product claims.

## Core rule

**Extraction uncertainty is not business risk.**

Foldline must never turn a weak parse into a scary percentage. The review engine therefore separates:

1. **Extraction quality** — did we read the invoice reliably enough?
2. **Business checks** — do values that were actually read disagree?
3. **Human confirmation** — can a person correct/confirm uncertain fields against the original?

Possible document states are:
- `reliable` → verified checks may produce Low / Needs attention / High;
- `needs_review` → risk is not calculated;
- `unsupported` → no invoice claim is made;
- processing failure → explicit retry state.

## What the current invoice exception engine checks

When the required extraction is reliable enough:
- supplier identity and invoice number presence;
- BIN/IIN format when a Kazakhstan BIN/IIN is actually present;
- `subtotal + VAT ≈ total` when all required values are available;
- line-item `quantity × unit price ≈ amount`;
- line-item sum against subtotal/total;
- exact duplicate invoice references together with the same supplier identity;
- strong near-reference duplicate candidates when supplier identity matches, the normalized reference differs only slightly, the total matches, and known dates do not conflict.

A missing PO is informational by default. Client-specific required fields and revised-invoice follow-up are being validated before they become configurable workflow rules.

## Parsing strategy

Cloudflare document conversion can return different Markdown/text layouts for the same kind of PDF. Foldline therefore does not trust one fragile regex path:

- `lib/invoice.ts` — legacy/table-oriented extraction strategy;
- `lib/invoice-v2.ts` — semantic/flattened-text extraction strategy;
- `lib/invoice-engine.ts` — reconciles candidate fields and structural signals;
- `lib/invoice-reliability.ts` — conservative production gate that decides whether a business-risk claim is allowed.

The engine rejects obvious PDF metadata, checks line-item arithmetic, uses internal consistency to resolve benign parser disagreement, and withholds risk when disagreement cannot be resolved safely.

## Regression fixtures

`lib/invoice-reliability-fixtures.ts` contains deterministic cases for:
- clean valid invoice → reliable / low;
- arithmetic mismatch → verified high-severity exception;
- unrelated document → unsupported / no risk;
- PDF-metadata/flattened extraction noise → never medium/high risk from extraction noise alone.

The founder-only `/admin` page renders these self-tests so regressions are visible before a pilot.

## Stack

- Next.js 16 / React 19 / TypeScript
- Cloudflare Workers via OpenNext
- Cloudflare Workers AI `AI.toMarkdown()` for managed document conversion
- Supabase Auth + Postgres + RLS
- Supabase private Storage with signed upload/download URLs
- server-side reliability/validation engine

Stripe billing and the old external OCR/R2 callback path are intentionally retired during the pilot/preorder stage.

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill the active Supabase/public values.
3. Link the Supabase project and apply migrations:
   ```bash
   npx supabase db push
   ```
4. Run locally:
   ```bash
   npm run dev
   ```
5. Before pushing changes:
   ```bash
   npm run typecheck
   npm run build
   ```

For Cloudflare, the `AI` binding is configured in `wrangler.jsonc`. Production secrets belong in Cloudflare/Supabase configuration, never in committed files.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests:
- TypeScript typecheck;
- Next.js build;
- production dependency audit at high severity;
- legacy gateway security tests while that directory remains in the repository.

A green CI build is required before treating a code change as deployable.

## Security defaults

See `SECURITY.md`. Current important controls include:
- private Supabase Storage;
- short-lived signed file URLs;
- authenticated/RLS-scoped document access;
- server-only service-role access;
- same-origin checks on state-changing routes;
- strict upload type/size checks;
- founder-only admin route keyed to one Supabase Auth UUID;
- public diagnostics minimized; OCR/debug diagnostics restricted to founder admin;
- old writable OCR callback and live billing endpoints retired.

These controls reduce risk but are not a substitute for an independent security/legal review before handling sensitive production documents at scale.

## Pilot rule

Do not market a workflow as reliable merely because a parser returned values. Before sending a build to pilot users:
- CI must be green;
- reliability fixtures must pass;
- a clean invoice must not produce a false business exception;
- a known mismatch must be caught;
- an unsupported/non-invoice document must receive no invented invoice risk;
- uncertain extraction must stop at `Needs review` until a person confirms it.


## Current product thesis

Foldline is no longer positioned as an arithmetic checker. Arithmetic remains one exception type. The MVP is being validated as an **invoice exception control** layer: catch duplicate, incomplete, uncertain, or internally inconsistent invoices early so AP teams spend time on the invoices that actually need action.
