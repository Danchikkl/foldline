function forbidden() {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

export function assertSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    throw forbidden();
  }

  // Browsers normally send Origin on mutating requests, but navigation-style
  // form POSTs (such as sign-out) can reach some proxy/runtime combinations
  // without it. Referer is an acceptable fallback only after the same host is
  // verified below; requests with neither header remain forbidden.
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
