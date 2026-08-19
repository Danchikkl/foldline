import { createAdminClient } from "@/lib/supabase/admin";

export const DOCUMENT_BUCKET = "foldline-documents";

export async function createSignedDocumentUpload(path: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data?.token) {
    throw new Error("Could not create signed upload token.");
  }

  return { path, token: data.token };
}

export async function getDocumentInfo(path: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(DOCUMENT_BUCKET)
    .info(path);

  if (error || !data) {
    throw new Error("Stored document was not found.");
  }

  return data;
}

export async function deleteDocumentObject(path: string) {
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(DOCUMENT_BUCKET)
    .remove([path]);

  if (error) throw error;
}

export async function createSignedDocumentDownload(path: string, expiresIn = 300) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error("Could not create signed download URL.");
  }

  return data.signedUrl;
}
