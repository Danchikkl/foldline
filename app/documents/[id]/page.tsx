import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractInvoice, validateInvoice } from "@/lib/invoice";
import { DashboardShell } from "@/components/dashboard-shell";
import { DocumentReview } from "@/components/document-review";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, supabase } = await requireUser();
  const { data } = await supabase
    .from("documents")
    .select("id,original_filename,content_type,status,raw_ocr_text,extracted_data,validation_data,error_message,updated_at")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  let document = data;
  if (!document.extracted_data && document.raw_ocr_text && ["ready", "reviewed"].includes(document.status)) {
    const extracted = extractInvoice(document.raw_ocr_text);
    const validation = validateInvoice(extracted);

    document = {
      ...document,
      extracted_data: extracted,
      validation_data: validation,
    };

    try {
      const admin = createAdminClient();
      await admin
        .from("documents")
        .update({ extracted_data: extracted, validation_data: validation })
        .eq("id", id)
        .eq("owner_id", user.id);
    } catch (error) {
      console.warn("Could not persist structured OCR backfill", { documentId: id, error });
    }
  }

  return (
    <DashboardShell email={user.email || "account"}>
      <DocumentReview document={document as any} />
    </DashboardShell>
  );
}
