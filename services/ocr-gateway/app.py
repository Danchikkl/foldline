from __future__ import annotations
import asyncio, io, json, os, tempfile, zipfile
from pathlib import Path
from urllib.parse import urljoin
import httpx
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from pydantic import BaseModel, HttpUrl
from security import MAX_BYTES, MAX_ZIP_BYTES, MAX_UNZIPPED_BYTES, callback_headers, require_https_host, secure_token_equal

app = FastAPI(title="Foldline OCR Gateway", version="0.1.0", docs_url=None if os.getenv("ENV") == "production" else "/docs")
semaphore = asyncio.Semaphore(int(os.getenv("MAX_CONCURRENT_JOBS", "2")))

class Job(BaseModel):
    document_id: str
    file_url: HttpUrl
    file_name: str
    content_type: str
    callback_url: HttpUrl

@app.get("/health")
async def health(): return {"status": "ok"}

@app.post("/v1/jobs", status_code=202)
async def create_job(job: Job, background: BackgroundTasks, authorization: str | None = Header(default=None)):
    expected = os.environ.get("OCR_GATEWAY_TOKEN", "")
    token = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not expected or not secure_token_equal(token, expected): raise HTTPException(401, "Unauthorized")
    try:
        require_https_host(str(job.file_url), r2=True)
        require_https_host(str(job.callback_url), callback=True)
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc
    if job.content_type not in {"application/pdf","image/png","image/jpeg","image/webp"}: raise HTTPException(400,"Unsupported content type")
    if len(job.file_name) > 180: raise HTTPException(400,"Filename too long")
    background.add_task(run_job, job)
    return {"accepted": True, "document_id": job.document_id}

async def bounded_get(client: httpx.AsyncClient, url: str, limit: int) -> bytes:
    async with client.stream("GET", url, follow_redirects=False) as response:
        response.raise_for_status()
        declared = int(response.headers.get("content-length", "0") or "0")
        if declared > limit: raise ValueError("Remote object exceeds size limit")
        chunks, total = [], 0
        async for chunk in response.aiter_bytes(1024 * 1024):
            total += len(chunk)
            if total > limit: raise ValueError("Remote object exceeds size limit")
            chunks.append(chunk)
        return b"".join(chunks)

def verify_magic(data: bytes, content_type: str) -> None:
    if not data: raise ValueError("Empty document")
    if content_type == "application/pdf" and not data[:1024].lstrip().startswith(b"%PDF-"): raise ValueError("Invalid PDF signature")
    if content_type == "image/png" and not data.startswith(b"\x89PNG\r\n\x1a\n"): raise ValueError("Invalid PNG signature")
    if content_type == "image/jpeg" and not data.startswith(b"\xff\xd8\xff"): raise ValueError("Invalid JPEG signature")
    if content_type == "image/webp" and not (data.startswith(b"RIFF") and data[8:12] == b"WEBP"): raise ValueError("Invalid WebP signature")

def safe_markdown_from_zip(blob: bytes) -> str:
    if len(blob) > MAX_ZIP_BYTES: raise ValueError("Result archive too large")
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        infos = zf.infolist()
        if len(infos) > 500: raise ValueError("Too many files in result archive")
        total = sum(i.file_size for i in infos)
        if total > MAX_UNZIPPED_BYTES: raise ValueError("Expanded result archive too large")
        candidates=[]
        for info in infos:
            p=Path(info.filename)
            if p.is_absolute() or ".." in p.parts: raise ValueError("Unsafe archive path")
            if p.suffix.lower() in {".md",".txt"} and info.file_size <= 5 * 1024 * 1024: candidates.append(info)
        if not candidates: raise ValueError("MonkeyOCR result has no readable markdown/text")
        candidates.sort(key=lambda x:x.file_size, reverse=True)
        return zf.read(candidates[0]).decode("utf-8", errors="replace")[:250_000]

async def notify(client: httpx.AsyncClient, callback_url: str, payload: dict):
    body=json.dumps(payload,separators=(",",":"),ensure_ascii=False).encode("utf-8")
    await client.post(callback_url, content=body, headers=callback_headers(body), timeout=20)

async def run_job(job: Job):
    async with semaphore:
        async with httpx.AsyncClient(timeout=httpx.Timeout(330.0, connect=15.0)) as client:
            try:
                document = await bounded_get(client, str(job.file_url), MAX_BYTES)
                verify_magic(document, job.content_type)
                suffix={"application/pdf":".pdf","image/png":".png","image/jpeg":".jpg","image/webp":".webp"}[job.content_type]
                monkey_base=os.environ["MONKEYOCR_API_URL"].rstrip("/") + "/"
                # Never pass the user-supplied filename as a filesystem path.
                safe_name=f"document{suffix}"
                response=await client.post(urljoin(monkey_base,"parse"),files={"file":(safe_name,document,job.content_type)})
                response.raise_for_status(); result=response.json()
                if not result.get("success") or not result.get("download_url"): raise ValueError("MonkeyOCR parsing did not return an artifact")
                artifact_url=urljoin(monkey_base,result["download_url"])
                if not artifact_url.startswith(monkey_base): raise ValueError("Unexpected MonkeyOCR artifact URL")
                artifact=await bounded_get(client,artifact_url,MAX_ZIP_BYTES)
                raw_text=safe_markdown_from_zip(artifact)
                await notify(client,str(job.callback_url),{"document_id":job.document_id,"status":"completed","raw_text":raw_text})
            except Exception as exc:
                # Keep callback errors generic; stack traces stay in provider logs, not user-facing metadata.
                try: await notify(client,str(job.callback_url),{"document_id":job.document_id,"status":"failed","error":f"OCR pipeline failed: {type(exc).__name__}"})
                except Exception: pass
