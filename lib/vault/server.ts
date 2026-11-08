import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export const vaultHeaderSchema = z.object({
  version: z.literal(1),
  kdf: z.literal("PBKDF2-SHA256"),
  iterations: z.number().int().min(310_000).max(5_000_000),
  salt: z.string().min(16).max(64),
  wrapped_key: z.string().min(40).max(128),
  wrap_iv: z.string().min(12).max(32),
  check_ct: z.string().min(16).max(128),
  check_iv: z.string().min(12).max(32),
}).strict();

export const vaultRecordSchema = z.object({
  id: z.string().uuid(),
  iv: z.string().min(12).max(32).regex(/^[A-Za-z0-9+/=]+$/),
  ciphertext: z.string().min(16).max(400_000).regex(/^[A-Za-z0-9+/=]+$/),
}).strict();

/** The user's workspace (first membership), checked with the service role. */
export async function userOrganizationId(admin: SupabaseClient, user: Pick<User, "id">) {
  const { data } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.organization_id as string | undefined) ?? null;
}
