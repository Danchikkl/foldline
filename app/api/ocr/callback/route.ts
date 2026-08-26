// Legacy external OCR callback retired.
// Foldline now performs document conversion and reliability-gated analysis
// inside the authenticated upload/retry pipeline. Keeping the old callback
// writable could let stale parser logic overwrite current analysis results.
export async function POST() {
  return Response.json(
    { error: "This OCR callback is retired." },
    { status: 410, headers: { "cache-control": "no-store" } },
  );
}
