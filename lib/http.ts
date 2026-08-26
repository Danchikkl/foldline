export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const browserOrigin = new URL(origin);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const host = forwardedHost || request.headers.get("host");

    if (!host) throw new Error("missing host");

    const browserHost = browserOrigin.host.toLowerCase();
    const requestHost = host.toLowerCase();
    if (browserHost !== requestHost) throw new Error("origin mismatch");

    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
      throw new Error("cross-site request");
    }
  } catch {
    throw Response.json({ error: "Forbidden" }, { status: 403 });
  }
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
