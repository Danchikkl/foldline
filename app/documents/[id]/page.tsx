import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { DocumentReview } from "@/components/document-review";

export const metadata: Metadata = { robots: { index: false, follow: false } };


export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, supabase } = await requireUser();
  const { data } = await supabase.from("documents").select("id,original_filename,content_type,status,extracted_data,validation_data,error_message,updated_at").eq("id",id).maybeSingle();
  if (!data) notFound();
  return <DashboardShell email={user.email || "account"}><DocumentReview document={data as any}/></DashboardShell>;
}
