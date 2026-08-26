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

async function readJsonSafely<T extends { error?: string }>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text || `Request failed with status ${response.status}.` } as T;
  }
}

export function ShipmentUploadDropzone({ shipmentId }: { shipmentId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function uploadOne(file: File, index: number, total: number) {
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type as never)) throw new Error(`${file.name}: use PDF, PNG, JPEG or WebP.`);
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name}: maximum file size is 25 MB.`);

    const base = Math.floor((index / total) * 100);
    const span = 100 / total;
    setProgress(Math.max(1, base + Math.floor(span * 0.1)));

    const presign = await fetch("/api/uploads/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, shipmentId }),
    });
    const data = await readJsonSafely<PresignResponse>(presign);
    if (!presign.ok) throw new Error(data.error || `Could not prepare ${file.name}.`);

    setProgress(base + Math.floor(span * 0.35));
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .uploadToSignedUrl(data.uploadPath, data.uploadToken, file, { contentType: file.type });
    if (uploadError) throw new Error(`${file.name}: upload to private storage failed.`);

    setProgress(base + Math.floor(span * 0.72));
    const complete = await fetch("/api/uploads/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documentId: data.documentId }),
    });
    const finished = await readJsonSafely<CompleteResponse>(complete);
    if (!complete.ok) throw new Error(finished.error || `${file.name}: upload verification failed.`);

    setProgress(Math.min(100, base + Math.floor(span)));
  }

  async function handle(files?: FileList | File[]) {
    const list = files ? Array.from(files) : [];
    if (!list.length || busy) return;
    setError("");
    setBusy(true);
    setProgress(1);

    try {
      for (let i = 0; i < list.length; i++) await uploadOne(list[i], i, list.length);
      setProgress(100);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`dropzone ${drag ? "dropzoneActive" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files); }}
    >
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="application/pdf,image/png,image/jpeg,image/webp"
        onChange={(e) => void handle(e.target.files ?? undefined)}
      />
      <div className="dropIcon"><FileUp size={25} /></div>
      <h3>{busy ? "Adding documents to this shipment…" : "Drop shipment documents here"}</h3>
      <p>{busy ? "Secure upload → integrity check → processing queue" : "Invoice, Packing List, PO, CMR and other shipment documents. Select several files at once."}</p>
      {busy ? (
        <div className="progressTrack"><span style={{ width: `${progress}%` }} /></div>
      ) : (
        <button className="button buttonDark" onClick={() => input.current?.click()}>Choose documents</button>
      )}
      {error && <div className="formError" role="alert">{error}</div>}
      <div className="dropMeta"><span><ShieldCheck size={14}/> Private storage</span><span><Sparkles size={14}/> Multiple files per shipment</span></div>
    </section>
  );
}
