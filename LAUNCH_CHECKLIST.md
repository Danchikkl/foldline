# Foldline launch-readiness checklist

Mapped from the 20-point website checklist supplied during product development.

| # | Item | Foldline decision |
|---|---|---|
| 1 | Custom 404 | Implemented and branded in `app/not-found.tsx`. |
| 2 | CTA above the fold | Implemented in the hero. |
| 3 | Internal links | Header, footer and contextual links connect workflow, Proofline, use cases, security, pricing and FAQ. |
| 4 | Thank-you page | Implemented for signup verification and Stripe checkout success. |
| 5 | Breadcrumbs | Implemented on public secondary pages. |
| 6 | Case studies | Route exists, but intentionally refuses to fabricate customer results before pilots. |
| 7 | 5 FAQs | Six product-specific FAQs implemented. |
| 8 | Response-time promise | No unverified speed promise. Product instead exposes explicit processing states. Add a numeric SLA only after production benchmarks support it. |
| 9 | Sticky mobile CTA | Implemented on mobile landing pages. |
| 10 | robots.txt | Implemented with `app/robots.ts`; private/API routes disallowed. |
| 11 | Unique page titles | Implemented for main public/auth/legal pages; private pages are noindex. |
| 12 | Meta descriptions | Implemented for main indexable pages. |
| 13 | Social sharing | Open Graph/Twitter metadata + generated social image implemented. |
| 14 | Maps + directions | Not applicable: Foldline is a web SaaS with no customer-facing physical location. Adding a fake map would reduce trust. |
| 15 | Real reviews | Component is wired to render only approved real quotes. It stays hidden while there are no verified customer reviews. |
| 16 | Alt text on images | Current document preview image has descriptive alt text; decorative UI uses semantic labels where appropriate. |
| 17 | Local schema | Replaced with relevant `SoftwareApplication` Schema.org microdata. LocalBusiness schema would be incorrect for this product. |
| 18 | Privacy policy page | Implemented as a transparent MVP notice; must receive jurisdiction-specific review before production launch. |
| 19 | Google Analytics | Optional GA4 integration via `NEXT_PUBLIC_GA_ID`; disabled when unset. CSP was extended only for required GA endpoints. |
| 20 | Team photo | Not fabricated. Add only a real team photo with permission, filename optimization and useful alt text. |

## Extra items added

- `sitemap.xml`
- public Security page
- private-route `noindex`
- canonical metadata
- generated Open Graph image
- no fake testimonials or case-study metrics
