import { jsonError } from "@/lib/http";

export async function POST() {
  return jsonError("Billing is not live. Foldline is using preorder reservations during the pilot stage.", 410);
}
