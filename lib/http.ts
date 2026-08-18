import { env } from "@/lib/env";

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) throw new Response("Forbidden", { status: 403 });
  try {
    const expected = new URL(env.appUrl()).origin;
    if (new URL(origin).origin !== expected) throw new Error("origin mismatch");
  } catch {
    throw new Response("Forbidden", { status: 403 });
  }
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
