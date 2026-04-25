"""
Phase46 Adapter - Doc ingest + LangExtract microservice.

This FastAPI app accepts uploads/crawls/OCR requests, runs LangExtract with
gemma3-legal:latest to build structured records, chunks/embeds the text, and
caches everything for the phase46-indexer + Neo4j workflow.
"""

from __future__ import annotations

import hashlib
import json
import os
import textwrap
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import langextract as lx
import redis
import requests
from bs4 import BeautifulSoup
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

try:  # optional parsers
  from pypdf import PdfReader
except Exception:  # pragma: no cover
  PdfReader = None  # type: ignore[assignment]

try:  # optional docx parsing
  import docx  # type: ignore
except Exception:  # pragma: no cover
  docx = None  # type: ignore

try:
  import pytesseract
  from PIL import Image
except Exception:  # pragma: no cover
  pytesseract = None  # type: ignore
  Image = None  # type: ignore

try:
  from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover
  SentenceTransformer = None  # type: ignore

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CACHE_DIR = Path(os.getenv("PHASE46_CACHE_DIR", "cache/phase46_adapter"))
MANIFEST_PATH = CACHE_DIR / "manifest.json"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CHUNK_CHARS = int(os.getenv("PHASE46_CHUNK_CHARS", "1200"))
CHUNK_OVERLAP = int(os.getenv("PHASE46_CHUNK_OVERLAP", "160"))
EMBED_MODEL = os.getenv(
  "PHASE46_SENTENCE_MODEL",
  "sentence-transformers/all-MiniLM-L6-v2",
)

LANGEXTRACT_MODEL = os.getenv("PHASE46_LX_MODEL", "gemma3-legal:latest")

SAFE_HOSTS = {
  "developer.mozilla.org",
  "www.typescriptlang.org",
  "svelte.dev",
  "kit.svelte.dev",
}

# Default prompt mirrors the user spec.
LANGEXTRACT_PROMPT = textwrap.dedent(
  """
  Extract relevant error-code context, file path, type system rule, and suggested fix.
  Provide each extraction with its exact char offsets in the input.
  Use JSON output adhering to schema:
  {
    "error_code": string,
    "file_path": string,
    "rule": string,
    "suggested_fix": string
  }
  """,
)

LANGEXTRACT_EXAMPLES = [
  lx.data.ExampleData(
    text="TS2322: Type 'number' is not assignable to type 'string' in file src/lib/button.ts",
    extractions=[
      lx.data.Extraction(
        extraction_class="error_code",
        extraction_text="TS2322",
        attributes={"offset_start": 0, "offset_end": 6},
      ),
      lx.data.Extraction(
        extraction_class="file_path",
        extraction_text="src/lib/button.ts",
        attributes={"offset_start": 52, "offset_end": 69},
      ),
      lx.data.Extraction(
        extraction_class="rule",
        extraction_text="Type 'number' is not assignable to type 'string'",
        attributes={"offset_start": 7, "offset_end": 51},
      ),
      lx.data.Extraction(
        extraction_class="suggested_fix",
        extraction_text="Ensure variable is declared as string or convert the number to string",
        attributes={},
      ),
    ],
  )
]

# ---------------------------------------------------------------------------
# FastAPI + models
# ---------------------------------------------------------------------------

app = FastAPI(title="Phase46 Adapter", version="0.1.0")
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


class CrawlRequest(BaseModel):
  url: str = Field(..., description="HTTP/HTTPS URL to fetch.")
  label: Optional[str] = Field(None, description="Optional human title override.")


class ExtractRequest(BaseModel):
  text: str = Field(..., min_length=1, description="Raw text to process.")
  title: Optional[str] = Field(None, description="Optional title for persistence.")
  source: Optional[str] = Field(None, description="Logical source label.")
  persist: bool = Field(
    False,
    description="When true, also chunk/embed/cache the payload like /upload.",
  )


class QueryResponse(BaseModel):
  doc_id: str
  title: str
  score: float
  snippet: str
  source: str


class IngestResponse(BaseModel):
  doc_id: str
  title: str
  lang: str
  chunk_count: int
  embeddings: int
  extractions: List[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------

def load_manifest() -> Dict[str, Any]:
  if not MANIFEST_PATH.exists():
    return {}
  try:
    return json.loads(MANIFEST_PATH.read_text("utf-8"))
  except json.JSONDecodeError:
    return {}


def save_manifest(data: Dict[str, Any]) -> None:
  MANIFEST_PATH.write_text(json.dumps(data, indent=2), "utf-8")


def timestamp() -> str:
  return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# ---------------------------------------------------------------------------
# LangExtract + embeddings
# ---------------------------------------------------------------------------

_sentence_model: Optional[SentenceTransformer] = None


def get_sentence_model() -> Optional[SentenceTransformer]:
  global _sentence_model
  if SentenceTransformer is None:
    return None
  if _sentence_model is None:
    _sentence_model = SentenceTransformer(EMBED_MODEL)
  return _sentence_model


def run_langextract(text: str) -> List[Dict[str, Any]]:
  """Invoke LangExtract with gemma3-legal configured via env."""
  if not text.strip():
    return []
  try:
    result = lx.extract(
      text_or_documents=text,
      prompt_description=LANGEXTRACT_PROMPT,
      examples=LANGEXTRACT_EXAMPLES,
      model_id=LANGEXTRACT_MODEL,
    )
    raw_items = getattr(result, "extractions", []) or []

    def _normalize(value: Any) -> Any:
      if isinstance(value, (str, int, float, bool)) or value is None:
        return value
      if isinstance(value, dict):
        return {key: _normalize(val) for key, val in value.items()}
      if isinstance(value, (list, tuple, set)):
        return [_normalize(val) for val in value]

      model_dump = getattr(value, "model_dump", None)
      if callable(model_dump):
        return _normalize(model_dump())

      data = getattr(value, "__dict__", None)
      if isinstance(data, dict):
        return _normalize({key: val for key, val in data.items() if not key.startswith("_")})

      return str(value)

    return [_normalize(item) for item in raw_items]
  except Exception as exc:  # pragma: no cover - remote failures
    return [
      {
        "extraction_class": "error",
        "extraction_text": "LangExtract failed",
        "attributes": {"message": str(exc)},
      }
    ]


def chunk_text(text: str) -> List[Dict[str, Any]]:
  normalized = " ".join(text.split())
  if not normalized:
    return []
  chunks: List[Dict[str, Any]] = []
  start = 0
  index = 0
  while start < len(normalized):
    end = min(len(normalized), start + CHUNK_CHARS)
    chunks.append(
      {
        "index": index,
        "text": normalized[start:end],
        "tokens_estimate": max(1, len(normalized[start:end].split())),
      },
    )
    index += 1
    if end == len(normalized):
      break
    start = end - CHUNK_OVERLAP
    if start < 0:
      start = 0
  return chunks


def store_embeddings(doc_id: str, chunks: List[Dict[str, Any]]) -> int:
  model = get_sentence_model()
  if model is None:
    return 0

  try:
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
  except Exception:  # pragma: no cover
    return 0

  payloads = [chunk["text"] for chunk in chunks]
  vectors = model.encode(payloads, show_progress_bar=False)

  stored = 0
  for chunk, vector in zip(chunks, vectors):
    redis_key = f"embedding:doc:{doc_id}:chunk:{chunk['index']}"
    redis_client.set(
      redis_key,
      json.dumps(
        {
          "model": EMBED_MODEL,
          "vector": vector if isinstance(vector, list) else getattr(vector, "tolist", lambda: list(vector))(),
        }
      ),
    )
    chunk["embedding_key"] = redis_key
    stored += 1
  return stored


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def detect_lang(text: str) -> str:
  snippet = text[:2048].strip()
  if not snippet:
    return "unknown"
  try:
    import langdetect  # local import to keep optional

    return langdetect.detect(snippet)
  except Exception:  # pragma: no cover
    return "unknown"


def read_docx_bytes(payload: bytes) -> str:
  if docx is None:  # pragma: no cover
    raise RuntimeError("python-docx not available.")
  document = docx.Document(BytesIO(payload))  # type: ignore[arg-type]
  return "\n".join(paragraph.text for paragraph in document.paragraphs)


def read_pdf_bytes(payload: bytes) -> str:
  if PdfReader is None:  # pragma: no cover
    raise RuntimeError("pypdf not available.")
  reader = PdfReader(BytesIO(payload))
  text_chunks = []
  for page in reader.pages:
    text_chunks.append(page.extract_text() or "")
  return "\n".join(text_chunks)


def read_html_bytes(payload: bytes) -> str:
  soup = BeautifulSoup(payload, "html.parser")
  for tag in soup(["script", "style", "noscript"]):
    tag.decompose()
  return soup.get_text("\n", strip=True)


def ocr_bytes(payload: bytes) -> str:
  if pytesseract is None or Image is None:  # pragma: no cover
    raise RuntimeError("pytesseract/Pillow not installed.")
  image = Image.open(BytesIO(payload))
  return pytesseract.image_to_string(image)


def load_text_from_upload(filename: str, payload: bytes) -> str:
  lower = filename.lower()
  if lower.endswith(".docx"):
    return read_docx_bytes(payload)
  if lower.endswith(".pdf"):
    return read_pdf_bytes(payload)
  if lower.endswith(".html") or lower.endswith(".htm"):
    return read_html_bytes(payload)
  try:
    return payload.decode("utf-8")
  except UnicodeDecodeError:
    return payload.decode("latin-1", errors="ignore")


# ---------------------------------------------------------------------------
# Core ingest pipeline
# ---------------------------------------------------------------------------

def persist_cache(doc_id: str, payload: Dict[str, Any]) -> None:
  CACHE_DIR.mkdir(parents=True, exist_ok=True)
  cache_path = CACHE_DIR / f"{doc_id}.json"
  cache_path.write_text(json.dumps(payload, indent=2), "utf-8")

  manifest = load_manifest()
  manifest[doc_id] = {
    "title": payload.get("title"),
    "lang": payload.get("lang"),
    "source": payload.get("source"),
    "fetched_at": payload.get("fetched_at"),
    "cache_path": str(cache_path),
    "checksum": payload.get("checksum"),
    "chunk_count": len(payload.get("chunks") or []),
  }
  save_manifest(manifest)


def ingest_text(
  *,
  text: str,
  title: Optional[str],
  source: Optional[str],
) -> IngestResponse:
  normalized = text.strip()
  if not normalized:
    raise HTTPException(status_code=400, detail="Empty document.")

  doc_id = uuid.uuid4().hex
  lang = detect_lang(normalized)
  chunks = chunk_text(normalized)
  embeddings = store_embeddings(doc_id, chunks) if chunks else 0
  extractions = run_langextract(normalized)
  checksum = hashlib.sha256(normalized.encode("utf-8")).hexdigest()

  payload = {
    "doc_id": doc_id,
    "title": title or source or doc_id,
    "source": source or "upload",
    "lang": lang,
    "fetched_at": timestamp(),
    "checksum": checksum,
    "chunks": chunks,
    "extractions": extractions,
    "metadata": {
      "adapter": "phase46",
      "comment": "tensorRT-llm handoff coming later once getOllamaEndpoint() wiring moves to PyTorch/TensorRT runner.",
    },
  }

  persist_cache(doc_id, payload)

  return IngestResponse(
    doc_id=doc_id,
    title=payload["title"],
    lang=lang,
    chunk_count=len(chunks),
    embeddings=embeddings,
    extractions=extractions,
  )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> Dict[str, str]:
  return {"status": "ok", "model": LANGEXTRACT_MODEL}


@app.post("/upload", response_model=IngestResponse)
async def upload_endpoint(
  file: UploadFile = File(...),
  title: Optional[str] = Form(None),
  source: Optional[str] = Form(None),
) -> IngestResponse:
  payload = await file.read()
  text = load_text_from_upload(file.filename or "upload.txt", payload)
  return ingest_text(text=text, title=title or file.filename, source=source or "upload")


@app.post("/extract")
async def extract_endpoint(request: ExtractRequest):
  """Allow LangExtract-only requests, optionally persisting the content."""
  if request.persist:
    return ingest_text(text=request.text, title=request.title, source=request.source or "extract")
  return {"extractions": run_langextract(request.text)}


@app.post("/crawl", response_model=IngestResponse)
async def crawl_endpoint(request: CrawlRequest) -> IngestResponse:
  parsed = urlparse(request.url)
  if parsed.scheme not in {"http", "https"}:
    raise HTTPException(status_code=400, detail="Only http/https URLs supported.")
  if parsed.hostname not in SAFE_HOSTS:
    raise HTTPException(status_code=403, detail="Host not whitelisted for crawl.")

  response = requests.get(request.url, timeout=30)
  if response.status_code >= 400:
    raise HTTPException(status_code=response.status_code, detail="Failed to fetch document.")

  text = read_html_bytes(response.content)
  return ingest_text(text=text, title=request.label or request.url, source=request.url)


@app.post("/ocr", response_model=IngestResponse)
async def ocr_endpoint(
  file: UploadFile = File(...),
  title: Optional[str] = Form(None),
  source: Optional[str] = Form(None),
) -> IngestResponse:
  payload = await file.read()
  if pytesseract is None:
    raise HTTPException(status_code=501, detail="pytesseract unavailable in this build.")
  text = ocr_bytes(payload)
  return ingest_text(text=text, title=title or file.filename, source=source or "ocr")


@app.get("/query", response_model=List[QueryResponse])
async def query_endpoint(substr: str) -> List[QueryResponse]:
  substr_lower = substr.lower()
  manifest = load_manifest()
  matches: List[QueryResponse] = []

  for doc_id, info in manifest.items():
    cache_path = info.get("cache_path")
    if not cache_path or not os.path.exists(cache_path):
      continue
    data = json.loads(Path(cache_path).read_text("utf-8"))
    body = "\n".join(chunk["text"] for chunk in data.get("chunks", []))
    idx = body.lower().find(substr_lower)
    if idx == -1:
      continue
    snippet = body[max(0, idx - 120) : idx + len(substr) + 120]
    matches.append(
      QueryResponse(
        doc_id=doc_id,
        title=data.get("title") or doc_id,
        score=1.0,
        snippet=snippet,
        source=data.get("source") or "unknown",
      ),
    )
    if len(matches) >= 25:
      break

  return matches


@app.exception_handler(Exception)
async def handle_errors(request, exc):  # type: ignore[override]
  detail = getattr(exc, "detail", str(exc))
  return JSONResponse(status_code=getattr(exc, "status_code", 500), content={"detail": detail})
