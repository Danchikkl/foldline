from __future__ import annotations
import hashlib, hmac, os, time
from urllib.parse import urlparse

MAX_BYTES = int(os.getenv("MAX_DOCUMENT_BYTES", str(25 * 1024 * 1024)))
MAX_ZIP_BYTES = int(os.getenv("MAX_RESULT_ZIP_BYTES", str(50 * 1024 * 1024)))
MAX_UNZIPPED_BYTES = int(os.getenv("MAX_RESULT_UNZIPPED_BYTES", str(100 * 1024 * 1024)))

def require_https_host(url: str, *, r2: bool = False, callback: bool = False) -> None:
    p = urlparse(url)
    if p.scheme != "https" or not p.hostname or p.username or p.password:
        raise ValueError("URL must be HTTPS without embedded credentials")
    if r2 and not p.hostname.endswith(".r2.cloudflarestorage.com"):
        raise ValueError("file_url must point to Cloudflare R2")
    if callback:
        expected = urlparse(os.environ["CALLBACK_ORIGIN"])
        if p.scheme != expected.scheme or p.netloc != expected.netloc:
            raise ValueError("callback_url origin is not allowed")

def callback_headers(body: bytes) -> dict[str, str]:
    ts = str(int(time.time()))
    sig = hmac.new(os.environ["OCR_CALLBACK_SECRET"].encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    return {"content-type": "application/json", "x-foldline-timestamp": ts, "x-foldline-signature": sig}

def secure_token_equal(received: str, expected: str) -> bool:
    return hmac.compare_digest(received.encode(), expected.encode())
