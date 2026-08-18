# Architecture

```text
Browser
  │ Supabase Auth cookie
  ├── Next.js 16 on Cloudflare Workers
  │     ├── Supabase Postgres (RLS)
  │     ├── Stripe hosted Checkout/webhooks
  │     └── R2 presigned URLs
  │
  └── PUT document directly to private R2
             │
             └── signed GET (5–15 min)
                    │
              OCR Gateway (FastAPI)
                    │ private/network restricted
              MonkeyOCRv2 official FastAPI /parse
                    │
              safe markdown extraction
                    │ HMAC callback
                    ▼
              Next.js /api/ocr/callback
                    │
              invoice extractor + Proofline validator
                    ▼
              Supabase document JSON
```

### Why the gateway exists
The official MonkeyOCRv2 API accepts file uploads and returns an artifact URL. The gateway keeps that service off the public product API, adds auth, SSRF/file validation, bounded downloads, ZIP safety and a signed callback contract.

### Upgrade path
Replace FastAPI BackgroundTasks with Cloudflare Queues, Supabase Queues, or a managed job queue when traffic warrants it. Keep the callback contract stable so the UI does not care where OCR runs.
