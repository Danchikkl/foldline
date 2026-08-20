"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, ShieldCheck, Sparkles } from "lucide-react";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/browser";

const DOCUMENT_BUCKET = "foldline-documents";

type PresignResponse = {
  documentId: string;
  uploadPath: string;
  uploadToken: string;
  error?: string;
};

type CompleteResponse = {
  error?: string;
};

export function UploadDropzone() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function handle(file?: File) {
    if (!file || busy) return;
    setError("");
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type as never)) return setError("Use PDF, PNG, JPEG or WebP.");
    if (file.size > MAX_UPLOAD_BYTES) return setError("Maximum file size is 25 MB.");
    setBusy(true);
    setProgress(10);

    try {
      const presign = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
      });
      const data = (await presign.json()) as PresignResponse;
      if (!presign.ok) throw new Error(data.error || "Could not prepare upload.");

      setProgress(35);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .uploadToSignedUrl(data.uploadPath, data.uploadToken, file, { contentType: file.type });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      setProgress(72);
      const complete = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: data.documentId }),
      });
      const finished = (await complete.json()) as CompleteResponse;
      if (!complete.ok) throw new Error(finished.error || "Upload verification failed.");

      setProgress(100);
      router.push(`/documents/${data.documentId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setBusy(false);
      setProgress(0);
    }
  }

  return <section className={`dropzone ${drag ? "dropzoneActive" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files[0]); }}>
    <input ref={input} type="file" hidden accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => void handle(e.target.files?.[0])} />
    <div className="dropIcon"><FileUp size={25} /></div>
    <h3>{busy ? "Preparing your document…" : "Drop an invoice here"}</h3>
    <p>{busy ? "Upload → integrity check → processing queue" : "PDF or image, up to 25 MB. Your original stays private."}</p>
    {busy ? <div className="progressTrack"><span style={{ width: `${progress}%` }} /></div> : <button className="button buttonDark" onClick={() => input.current?.click()}>Choose document</button>}
    {error && <div className="formError" role="alert">{error}</div>}
    <div className="dropMeta"><span><ShieldCheck size={14}/> Private Supabase storage</span><span><Sparkles size={14}/> Review by exception</span></div>
  </section>;
}
