import io
import os
import unittest
import zipfile

os.environ.setdefault("CALLBACK_ORIGIN", "https://app.example.com")
os.environ.setdefault("OCR_CALLBACK_SECRET", "x" * 32)

from security import require_https_host, secure_token_equal
from app import safe_markdown_from_zip, verify_magic


class SecurityTests(unittest.TestCase):
    def test_r2_ssrf_guard(self):
        require_https_host("https://bucket.abc.r2.cloudflarestorage.com/file.pdf?sig=x", r2=True)
        with self.assertRaises(ValueError):
            require_https_host("http://127.0.0.1/admin", r2=True)
        with self.assertRaises(ValueError):
            require_https_host("https://evil.example/file", r2=True)
        with self.assertRaises(ValueError):
            require_https_host("https://user:pass@bucket.abc.r2.cloudflarestorage.com/file", r2=True)

    def test_callback_origin(self):
        require_https_host("https://app.example.com/api/ocr/callback", callback=True)
        with self.assertRaises(ValueError):
            require_https_host("https://evil.example/callback", callback=True)

    def test_token_compare(self):
        self.assertTrue(secure_token_equal("abc", "abc"))
        self.assertFalse(secure_token_equal("abc", "abd"))

    def test_magic_byte_validation(self):
        verify_magic(b"%PDF-1.7\n...", "application/pdf")
        verify_magic(b"\x89PNG\r\n\x1a\nrest", "image/png")
        with self.assertRaises(ValueError):
            verify_magic(b"<html>not a pdf</html>", "application/pdf")

    def test_zip_path_traversal_rejected(self):
        blob = io.BytesIO()
        with zipfile.ZipFile(blob, "w") as zf:
            zf.writestr("../escape.md", "unsafe")
        with self.assertRaises(ValueError):
            safe_markdown_from_zip(blob.getvalue())

    def test_zip_markdown_extract(self):
        blob = io.BytesIO()
        with zipfile.ZipFile(blob, "w") as zf:
            zf.writestr("result/document.md", "# Invoice\nTotal 100")
        self.assertIn("Total 100", safe_markdown_from_zip(blob.getvalue()))


if __name__ == "__main__":
    unittest.main()
