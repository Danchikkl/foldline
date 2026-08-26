import { jsonError } from "@/lib/http";

export async function POST() {
  return jsonError("Paid checkout is not live yet. Reserve early access from the Preorder page instead.", 410);
}
