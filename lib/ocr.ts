import { env } from "@/lib/env";
import { presignDownload } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";

export async function dispatchOcr(document: { id: string; storage_key: string; original_filename: string; content_type: string }) {
  const fileUrl = await presignDownload(document.storage_key, 900);
  const admin = createAdminClient();
  const response = await fetch(`${env.ocrGatewayUrl()}/v1/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.ocrGatewayToken()}` },
    body: JSON.stringify({
      document_id: document.id,
      file_url: fileUrl,
      file_name: document.original_filename,
      content_type: document.content_type,
      callback_url: `${env.appUrl()}/api/ocr/callback`,
    }),
  });
  if (!response.ok) {
    await admin.from("documents").update({ status: "failed", error_message: "OCR service could not accept the job." }).eq("id", document.id);
    throw new Error(`OCR gateway rejected job: ${response.status}`);
  }
  await admin.from("documents").update({ status: "processing", error_message: null }).eq("id", document.id);
}
