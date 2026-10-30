"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyX, FileUp, ShieldCheck } from "lucide-react";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/constants";

const MAX_BATCH = 50;

async function uploadOne(file: File): Promise<string> {
  const presign = await fetch("/api/uploads/presign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name.slice(0, 180), contentType: file.type, size: file.size }) });
  const data = await presign.json().catch(() => ({}));
  if (!presign.ok) throw new Error(data.error || "Could not prepare upload.");
  const put = await fetch(data.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
  if (!put.ok) throw new Error("Upload to private storage failed.");
  const complete = await fetch("/api/uploads/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId: data.documentId }) });
  const finished = await complete.json().catch(() => ({}));
  if (!complete.ok) throw new Error(finished.error || "Upload verification failed.");
  return data.documentId as string;
}

export function UploadDropzone() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  async function handle(list?: FileList | null) {
    if (!list || !list.length || busy) return;
    const files = Array.from(list);
    const problems: string[] = [];
    const valid = files.filter((f) => {
      if (!ALLOWED_UPLOAD_TYPES.includes(f.type as never)) { problems.push(`${f.name}: use PDF, PNG, JPEG or WebP.`); return false; }
      if (f.size > MAX_UPLOAD_BYTES) { problems.push(`${f.name}: larger than 25 MB.`); return false; }
      return true;
    }).slice(0, MAX_BATCH);
    if (files.length > MAX_BATCH) problems.push(`Only the first ${MAX_BATCH} files were taken.`);
    setErrors(problems); setNotice("");
    if (!valid.length) return;

    setBusy(true); setTotal(valid.length); setDone(0);
    const ids: string[] = [];
    // Sequential on purpose: upload order = comparison order for duplicate checks.
    for (const file of valid) {
      try { ids.push(await uploadOne(file)); }
      catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed.";
        problems.push(`${file.name}: ${msg}`);
        setErrors([...problems]);
        if (/limit/i.test(msg)) break; // monthly limit reached — no point continuing
      }
      setDone((n) => n + 1);
    }
    setBusy(false);
    if (valid.length === 1 && ids.length === 1) { router.push(`/documents/${ids[0]}`); return; }
    setNotice(`${ids.length} of ${valid.length} invoice${valid.length === 1 ? "" : "s"} uploaded. Results appear below as each one is checked.`);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  const pct = total ? Math.round((done / total) * 100) : 0;
  return <section className={`dropzone ${drag ? "dropzoneActive" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files); }}>
    <input ref={input} type="file" hidden multiple accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => void handle(e.target.files)} />
    <div className="dropIcon"><FileUp size={25} /></div>
    <h3>{busy ? `Uploading ${Math.min(done + 1, total)} of ${total}…` : "Drop a batch of supplier invoices"}</h3>
    <p>{busy ? "Upload → integrity check → read → compare with earlier invoices" : `PDF or images, up to ${MAX_BATCH} at once, 25 MB each. Originals stay private.`}</p>
    {busy ? <div className="progressTrack"><span style={{ width: `${Math.max(pct, 6)}%` }} /></div> : <button className="button buttonDark" onClick={() => input.current?.click()}>Choose invoices</button>}
    {notice && <div className="inlineNotice" role="status">{notice}</div>}
    {errors.length > 0 && <div className="formError" role="alert">{errors.slice(0, 4).map((e) => <div key={e}>{e}</div>)}{errors.length > 4 && <div>+{errors.length - 4} more</div>}</div>}
    <div className="dropMeta"><span><ShieldCheck size={14} /> Private storage</span><span><CopyX size={14} /> Duplicate & exception checks</span></div>
  </section>;
}
