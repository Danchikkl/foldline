# Foldline — Document Workflow MVP

A production-minded MVP for **Document → Structured Data → Proofline Review → CSV**.

## Product idea
Foldline is deliberately not positioned as “another OCR API”. The differentiator in this MVP is **Proofline**:
- evidence attached to extracted values;
- deterministic integrity checks (`subtotal + VAT ≈ total`, line-item reconciliation, BIN/IIN format);
- **Review by Exception**, so users see suspicious fields first;
- an append-only-ish server-written audit event for edits/approval.

MonkeyOCRv2 is an external parsing engine. The web app does not claim the model as proprietary technology.

## Stack
- Next.js 16 / React 19
- Cloudflare Workers via OpenNext
- Supabase Auth + Postgres + RLS
- Cloudflare R2 private object storage
- Stripe-hosted Checkout + Billing Portal
- Separate FastAPI OCR gateway → official MonkeyOCRv2 FastAPI `/parse`

## Setup
1. Create Supabase project and run `supabase/migrations/001_init.sql`.
2. Enable email confirmation in Supabase Auth. Set your Site URL and callback URL (`/auth/callback`).
3. Create a **private** R2 bucket. Configure CORS to allow only your app origin and `PUT, GET, HEAD` with `Content-Type`.
4. Create an R2 API token scoped only to that bucket.
5. Create a Stripe product/recurring monthly price and copy its `price_...` id.
6. Register `https://YOUR_APP/api/stripe/webhook` and subscribe at minimum to `checkout.session.completed` and `customer.subscription.*`.
7. Deploy MonkeyOCRv2 using its official parsing service, then deploy `services/ocr-gateway` next to it. Keep the MonkeyOCR FastAPI private/network-restricted where possible.
8. Copy `.env.example` to `.env.local` and fill values.
9. Install and run: `npm install && npm run dev`. Commit the generated `package-lock.json` before production.
10. For local Workers preview, copy `.dev.vars.example` to `.dev.vars`. Production secrets should be configured as Cloudflare secrets/bindings, not committed files.
11. Production preview: `npm run preview`; deploy: `npm run deploy`.

## R2 CORS example
```json
[
  {
    "AllowedOrigins": ["https://YOUR_APP_DOMAIN"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## MonkeyOCRv2 runtime
The official repository currently documents Python 3.11 and a vLLM parsing service. Start the official service first, for example (paths depend on your GPU host):
```bash
cd parsing
python serve.py -m ../model_weight/MonkeyOCRv2-B-Parsing -p 8888
python fastapi/main.py -s http://127.0.0.1:8888 -p 8000
```
Then point `MONKEYOCR_API_URL=http://127.0.0.1:8000` at it.

## Security defaults included
See `SECURITY.md`. Important: app-level controls do **not** replace Cloudflare WAF/rate-limit rules, provider patching, backups, secrets rotation or a real security review before handling sensitive production documents.

## Before taking money
- Replace draft privacy/terms pages with jurisdiction-specific legal docs.
- Verify Stripe account/entity eligibility and who is legally permitted to operate the payment account.
- Add invoice receipts/tax configuration appropriate to your operating entity.
- Run dependency audit/SCA after `npm install` and pin a lockfile.

## Launch-readiness additions

The public site now includes a branded 404, above-the-fold CTA, internal navigation, signup/payment thank-you flow, breadcrumbs, FAQ, mobile sticky CTA, `robots.txt`, `sitemap.xml`, unique metadata, generated Open Graph imagery, SoftwareApplication schema microdata, an optional GA4 integration, public Security page, transparent case-study policy and improved MVP privacy/terms notices.

See `LAUNCH_CHECKLIST.md` for the exact mapping of the 20-point launch checklist. Foldline intentionally does **not** fabricate reviews, case-study results, a physical address/map, performance promises, or team photos.
