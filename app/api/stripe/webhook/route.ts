// Payments are intentionally disabled during the current preorder/pilot stage.
// Retiring the webhook prevents stale billing events from mutating plan state.
export async function POST() {
  return Response.json(
    { error: "Stripe billing is not active." },
    { status: 410, headers: { "cache-control": "no-store" } },
  );
}
