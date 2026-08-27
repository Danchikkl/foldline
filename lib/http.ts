function forbidden() {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

export function assertNotCrossSite(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw forbidden();
  }
}

export function assertSameOrigin(request: Request) {
  assertNotCrossSite(request);

  // Browsers normally send Origin on mutating requests. For same-origin form
  // navigations, Referer is an acceptable fallback after its host is verified.
  const source = request.headers.get("origin") || request.headers.get("referer");
  if (!source) throw forbidden();

  try {
    const sourceHost = new URL(source).host.toLowerCase();
    const requestUrlHost = new URL(request.url).host.toLowerCase();
    const host = firstForwardedValue(request.headers.get("host")).toLowerCase();
    const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host")).toLowerCase();

    const allowedHosts = new Set([requestUrlHost, host, forwardedHost].filter(Boolean));
    if (!allowedHosts.has(sourceHost)) throw new Error("origin mismatch");
  } catch (error) {
    if (error instanceof Response) throw error;
    throw forbidden();
  }
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
