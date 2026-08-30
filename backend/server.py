#!/usr/bin/env python3
"""Local-only Doneward outline extraction service."""

from __future__ import annotations

import json
import hmac
import html
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PdfReadError


HOST = "127.0.0.1"
PORT = int(os.environ.get("DONEWARD_BACKEND_PORT", "4317"))
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:4b-instruct-2507-q4_K_M")
MAX_PDF_BYTES = 20 * 1024 * 1024
MAX_TEXT_CHARS = 120_000
MAX_PDF_PAGES = 200
EXTRACTION_RATE_LIMIT = 8
EXTRACTION_RATE_WINDOW_SECONDS = 10 * 60
DEFAULT_TOKEN_PATH = Path.home() / "Library/Application Support/Doneward/pairing-token"
DEFAULT_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
_ORIGIN_PATTERN = re.compile(r"https?://(?:localhost|127\.0\.0\.1|[a-z0-9.-]+)(?::\d{1,5})?$")
ALLOWED_ORIGINS = frozenset(
    origin.strip().rstrip("/")
    for origin in os.environ.get("DONEWARD_ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS).split(",")
    if _ORIGIN_PATTERN.fullmatch(origin.strip().rstrip("/"))
)
EXTRACTION_SEMAPHORE = threading.BoundedSemaphore(1)
RATE_LOCK = threading.Lock()
EXTRACTION_TIMESTAMPS: deque[float] = deque()
_PAIRING_TOKEN: str | None = None
ALLOWED_CATEGORIES = {
    "assignment", "quiz", "test", "exam", "project", "lab", "paper",
    "presentation", "other",
}

OUTLINE_SCHEMA = {
    "type": "object",
    "properties": {
        "courseName": {"type": "string"},
        "tasks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "taskName": {"type": "string"},
                    "category": {"type": "string", "enum": sorted(ALLOWED_CATEGORIES)},
                    "deadline": {"type": ["string", "null"]},
                },
                "required": ["taskName", "category", "deadline"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["courseName", "tasks"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """You extract graded work from university course outlines.
Use only facts stated in the supplied document text. Never invent a deadline.
Include every actionable graded task the student must submit, complete, present,
or sit for. Exclude policies, office hours, schedule headings, course topics,
and grading categories that are not individual tasks. Convert every complete
written calendar date to YYYY-MM-DD and every complete date with a time to
YYYY-MM-DDTHH:mm using 24-hour time. For example, September 18, 2026 at
11:59 PM becomes 2026-09-18T23:59. Use null only when the document truly omits
a complete deadline. Re-check the full outline for missed tasks before returning
the structured result."""


def extract_pdf_text(payload: bytes) -> str:
    if b"%PDF-" not in payload[:1024]:
        raise ValueError("The uploaded file does not have a valid PDF signature.")
    try:
        reader = PdfReader(BytesIO(payload), strict=False)
    except PdfReadError as exc:
        raise ValueError("The uploaded PDF is damaged or unreadable.") from exc
    if reader.is_encrypted:
        raise ValueError("Password-protected PDFs are not supported.")
    if len(reader.pages) > MAX_PDF_PAGES:
        raise ValueError(f"PDFs are limited to {MAX_PDF_PAGES} pages.")
    parts: list[str] = []
    for index, page in enumerate(reader.pages):
        text = (page.extract_text() or "").strip()
        if text:
            parts.append(f"\n--- PAGE {index + 1} ---\n{text}")
        if sum(len(part) for part in parts) >= MAX_TEXT_CHARS:
            break
    combined = "".join(parts).strip()
    if len(combined) < 80:
        raise ValueError(
            "This PDF has too little selectable text. It may be scanned; OCR support is required."
        )
    return combined[:MAX_TEXT_CHARS]


def pairing_token() -> str:
    global _PAIRING_TOKEN
    if _PAIRING_TOKEN:
        return _PAIRING_TOKEN

    configured = os.environ.get("DONEWARD_PAIRING_TOKEN", "").strip()
    token_path = Path(os.environ.get("DONEWARD_PAIRING_TOKEN_FILE", str(DEFAULT_TOKEN_PATH)))
    if configured:
        token = configured
    elif token_path.exists():
        token = token_path.read_text(encoding="utf-8").strip()
    else:
        token_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        token = secrets.token_urlsafe(32)
        try:
            descriptor = os.open(token_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(token + "\n")
        except FileExistsError:
            token = token_path.read_text(encoding="utf-8").strip()

    if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", token):
        raise RuntimeError("The Doneward pairing token is invalid.")
    _PAIRING_TOKEN = token
    return token


def consume_rate_slot(now: float | None = None) -> bool:
    current = time.monotonic() if now is None else now
    with RATE_LOCK:
        cutoff = current - EXTRACTION_RATE_WINDOW_SECONDS
        while EXTRACTION_TIMESTAMPS and EXTRACTION_TIMESTAMPS[0] <= cutoff:
            EXTRACTION_TIMESTAMPS.popleft()
        if len(EXTRACTION_TIMESTAMPS) >= EXTRACTION_RATE_LIMIT:
            return False
        EXTRACTION_TIMESTAMPS.append(current)
        return True


def call_ollama(text: str) -> dict:
    body = json.dumps({
        "model": OLLAMA_MODEL,
        "stream": False,
        "think": False,
        "format": OUTLINE_SCHEMA,
        "options": {"temperature": 0, "num_ctx": 4096},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "Extract the course and graded tasks from this outline:\n\n" + text},
        ],
    }).encode("utf-8")
    request = urllib.request.Request(
        OLLAMA_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            result = json.loads(response.read())
    except urllib.error.URLError as exc:
        raise RuntimeError("The local Ollama service is unavailable.") from exc

    try:
        extraction = json.loads(result["message"]["content"])
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("The local model returned an unreadable result.") from exc
    return validate_extraction(extraction)


def validate_extraction(value: object) -> dict:
    if not isinstance(value, dict):
        raise ValueError("The local model did not return an extraction object.")
    course_name = str(value.get("courseName", "")).strip()[:200]
    tasks = []
    raw_tasks = value.get("tasks")
    if not isinstance(raw_tasks, list):
        raw_tasks = []
    for raw in raw_tasks[:250]:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("taskName", "")).strip()[:300]
        category = str(raw.get("category", "other")).lower()
        if category not in ALLOWED_CATEGORIES:
            category = "other"
        deadline = raw.get("deadline")
        if deadline is not None:
            deadline = str(deadline).strip()
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?", deadline):
                deadline = None
        if name:
            tasks.append({"taskName": name, "category": category, "deadline": deadline})
    return {"courseName": course_name, "tasks": tasks}


class Handler(BaseHTTPRequestHandler):
    server_version = "DonewardLocal/1.0"

    def log_message(self, format: str, *args: object) -> None:
        print(f"[doneward-backend] {self.address_string()} {format % args}")

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(30)

    def _origin(self) -> str | None:
        origin = self.headers.get("Origin")
        return origin if origin in ALLOWED_ORIGINS else None

    def _authorized(self) -> bool:
        expected = f"Bearer {pairing_token()}"
        return hmac.compare_digest(self.headers.get("Authorization", ""), expected)

    def _security_headers(self, content_security_policy: str = "default-src 'none'") -> None:
        self.send_header("Content-Security-Policy", content_security_policy)
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")

    def _send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        origin = self._origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self._security_headers()
        self.end_headers()
        self.wfile.write(payload)

    def _send_pairing_page(self) -> None:
        token = html.escape(pairing_token())
        payload = f"""<!doctype html><html lang=\"en\"><meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
<title>Pair Doneward</title><main><h1>Pair this browser with Doneward</h1>
<p>Copy this one-device code into the Doneward import screen. Do not share it.</p>
<p><label>Pairing code<br><input value=\"{token}\" readonly size=\"52\" autofocus></label></p>
<p>You can close this tab after pairing.</p></main></html>""".encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self._security_headers("default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:
        if not self._origin():
            self._send_json(403, {"error": "Origin is not allowed."})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self._origin() or "")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-File-Name")
        self.send_header("Access-Control-Max-Age", "600")
        self._security_headers()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/pair":
            self._send_pairing_page()
            return
        if self.path != "/health":
            self._send_json(404, {"error": "Not found."})
            return
        if self.headers.get("Origin") and not self._origin():
            self._send_json(403, {"error": "Origin is not allowed."})
            return
        if not self._authorized():
            self._send_json(401, {"error": "Pair this browser with the Doneward backend."})
            return
        try:
            with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=2) as response:
                tags = json.loads(response.read()).get("models", [])
            ready = any(item.get("name", "").startswith(OLLAMA_MODEL.split(":")[0] + ":") for item in tags)
            self._send_json(200 if ready else 503, {"ready": ready, "model": OLLAMA_MODEL})
        except (urllib.error.URLError, json.JSONDecodeError):
            self._send_json(503, {"ready": False, "error": "Ollama is not running."})

    def do_POST(self) -> None:
        if self.path != "/extract":
            self._send_json(404, {"error": "Not found."})
            return
        if not self._origin():
            self._send_json(403, {"error": "Origin is not allowed."})
            return
        if not self._authorized():
            self._send_json(401, {"error": "Pair this browser with the Doneward backend."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_PDF_BYTES:
            self._send_json(413, {"error": "Choose a PDF smaller than 20 MB."})
            return
        if self.headers.get_content_type() != "application/pdf":
            self._send_json(415, {"error": "Only PDF course outlines are supported."})
            return
        if not consume_rate_slot():
            self._send_json(429, {"error": "Too many extraction attempts. Wait a few minutes and retry."})
            return
        if not EXTRACTION_SEMAPHORE.acquire(blocking=False):
            self._send_json(429, {"error": "Another outline is already being processed."})
            return
        try:
            payload = self.rfile.read(length)
            text = extract_pdf_text(payload)
            extraction = call_ollama(text)
            self._send_json(200, {"extraction": extraction})
        except (ValueError, RuntimeError) as exc:
            self._send_json(422, {"error": str(exc)})
        except Exception:
            self._send_json(500, {"error": "The local extraction failed unexpectedly."})
        finally:
            EXTRACTION_SEMAPHORE.release()


class DonewardServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8


if __name__ == "__main__":
    pairing_token()
    print(f"Doneward local backend listening on http://{HOST}:{PORT}")
    DonewardServer((HOST, PORT), Handler).serve_forever()
