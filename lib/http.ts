export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const requestOrigin = new URL(request.url).origin;
    const browserOrigin = new URL(origin).origin;

    if (browserOrigin !== requestOrigin) {
      throw new Error("origin mismatch");
    }
  } catch {
    throw Response.json({ error: "Forbidden" }, { status: 403 });
  }
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
