"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, FlaskConical, ShieldCheck, Sparkles } from "lucide-react";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/browser";
import { SAMPLE_INVOICES, TRIAL_TERMS_VERSION } from "@/lib/trial";

const DOCUMENT_BUCKET = "foldline-documents";

type PresignResponse = {
  documentId: string;
  uploadPath: string;
  uploadToken: string;
  error?: string;
};

type CompleteResponse = { error?: string };

async function readJsonSafely<T extends { error?: string }>(response: Response): Promise<T> {
  const text = await response.text();
  try { return JSON.parse(text) as T; }
  catch { return { error: text || `Request failed with status ${response.status}.` } as T; }
}

export function ShipmentUploadDropzone({ shipmentId, termsAccepted = false }: { shipmentId: string; termsAccepted?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(termsAccepted);
  const [accepting, setAccepting] = useState(false);
  const [label, setLabel] = useState("");

  async function acceptTerms(checked: boolean) {
    if (!checked || accepted || accepting) return;
    setAccepting(true);
    setError("");
    const response = await fetch("/api/terms/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: TRIAL_TERMS_VERSION }),
    });
    const data = await readJsonSafely<{ error?: string }>(response);
    if (response.ok) setAccepted(true);
    else setError(data.error || "Could not record your acceptance.");
    setAccepting(false);
  }

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
    if (!accepted) { setError("Please accept the trial terms first."); return; }
    setError("");
    setBusy(true);
    setProgress(1);

    try {
      // Sequential on purpose: upload order is the order duplicates are compared in.
      for (let i = 0; i < list.length; i++) {
        setLabel(`${i + 1} of ${list.length}`);
        await uploadOne(list[i], i, list.length);
      }
      setProgress(100);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      setLabel("");
      if (input.current) input.current.value = "";
    }
  }

  async function trySamples() {
    if (busy) return;
    if (!accepted) { setError("Please accept the trial terms first."); return; }
    setError("");
    try {
      const files = await Promise.all(SAMPLE_INVOICES.map(async (sample) => {
        const response = await fetch(`/samples/${sample.filename}`);
        if (!response.ok) throw new Error("Could not load the sample invoices.");
        return new File([await response.blob()], sample.filename, { type: "application/pdf" });
      }));
      await handle(files);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the sample invoices.");
    }
  }

  return (
    <section
      className={`dropzone ${drag ? "dropzoneActive" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files); }}
    >
      <input ref={input} type="file" hidden multiple accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => void handle(e.target.files ?? undefined)} />
      <div className="dropIcon"><FileUp size={25}/></div>
      <h3>{busy ? `Checking invoice ${label}…` : "Drop supplier invoices here"}</h3>
      <p>{busy ? "Secure upload → extraction → reliability gate → verified checks" : "PDF, PNG, JPEG or WebP. Upload in the order received: each invoice is compared with the ones before it."}</p>

      {!busy && <div className="trialNotice">
        <b>Trial tip:</b> use redacted or sample invoices. Remove personal names, bank details and anything you&apos;re not allowed to share.
      </div>}

      {!accepted && !busy && <label className="trialAccept">
        <input type="checkbox" disabled={accepting} onChange={(e) => void acceptTerms(e.target.checked)} />
        <span>I&apos;ve read the <Link href="/legal/terms#trial" target="_blank">trial terms</Link> and will upload only redacted, sample or authorised documents.</span>
      </label>}

      {busy
        ? <div className="progressTrack"><span style={{ width: `${progress}%` }}/></div>
        : <div className="dropActions">
            <button className="button buttonDark" disabled={!accepted} onClick={() => input.current?.click()}>Choose invoices</button>
            <button className="button buttonGhost" disabled={!accepted} onClick={() => void trySamples()}><FlaskConical size={15}/> Try with sample invoices</button>
          </div>}
      {error && <div className="formError" role="alert">{error}</div>}
      <div className="dropMeta"><span><ShieldCheck size={14}/> Private storage</span><span><Sparkles size={14}/> Risk withheld when extraction is uncertain</span></div>
    </section>
  );
}
