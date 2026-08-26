import { z } from "zod";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(160).optional().default(""),
  role: z.string().trim().max(160).optional().default(""),
  message: z.string().trim().min(1).max(2000),
  website: z.string().max(200).optional().default(""),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (response) {
    if (response instanceof Response) return response;
    return jsonError("Forbidden", 403);
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonError("Unsupported content type", 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return jsonError("Please check the form fields.", 400);

  const { name, email, company, role, message, website } = parsed.data;

  // Honeypot. Return success so simple bots do not learn how the trap works.
  if (website) return Response.json({ ok: true });

  const admin = createAdminClient();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: recent } = await admin
    .from("pilot_requests")
    .select("id")
    .ilike("email", email)
    .gte("created_at", tenMinutesAgo)
    .limit(1)
    .maybeSingle();

  // Idempotent-looking success prevents repeated clicks and simple spam loops.
  if (recent) return Response.json({ ok: true });

  const { error } = await admin.from("pilot_requests").insert({
    name,
    email,
    company: company || null,
    role: role || null,
    message,
    source: "contact_page",
  });

  if (error) return jsonError("Could not save your request. Please try again later.", 503);

  return Response.json({ ok: true }, { status: 201 });
}
