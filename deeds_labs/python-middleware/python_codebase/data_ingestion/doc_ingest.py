from __future__ import annotations

import datetime as dt
import hashlib
import json
import logging
import os
import re
import uuid
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib import robotparser
from urllib.parse import urlparse

import nltk
import redis
import requests
from bs4 import BeautifulSoup
from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from langdetect import DetectorFactory, LangDetectException, detect
from nltk.tokenize import sent_tokenize
from pydantic import BaseModel, Field

# Optional dependencies (guarded imports)
try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover - optional dependency
    PdfReader = None  # type: ignore

try:
    import docx  # python-docx
except ImportError:  # pragma: no cover - optional dependency
    docx = None  # type: ignore

try:
    import pytesseract
except ImportError:  # pragma: no cover - optional dependency
    pytesseract = None  # type: ignore

try:
    from PIL import Image
except ImportError:  # pragma: no cover - optional dependency
    Image = None  # type: ignore

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("doc_ingest")

DetectorFactory.seed = 0  # deterministic language detection

DEFAULT_CHUNK_CHARS = int(os.getenv("DOC_INGEST_CHUNK_CHARS", "1200"))
DEFAULT_SENTENCE_OVERLAP = int(os.getenv("DOC_INGEST_SENTENCE_OVERLAP", "1"))
EMBEDDINGS_ENABLED = os.getenv("DOC_INGEST_DISABLE_EMBEDDINGS", "0") != "1"
EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "embeddinggemma:latest")
EMBEDDING_TIMEOUT = int(os.getenv("DOC_INGEST_EMBEDDING_TIMEOUT", "60"))
EMBEDDING_CHAR_LIMIT = int(os.getenv("DOC_INGEST_EMBEDDING_CHAR_LIMIT", "4096"))

CACHE_DIR = Path(os.getenv("DOC_INGEST_CACHE_DIR", "cache/doc_ingest"))
MANIFEST_PATH = CACHE_DIR / "manifest.json"

DEFAULT_WHITELIST = {
    "www.typescriptlang.org",
    "developer.mozilla.org",
    "svelte.dev",
    "kit.svelte.dev",
}
USER_AGENT = (
    "DocIngest/0.1 (+https://github.com/deeds-web-app/ingest) "
    "SafeCrawler/1.0"
)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Ensure NLTK punkt is present (download quietly if missing)
try:
    nltk.data.find("tokenizers/punkt")
except LookupError:  # pragma: no cover - download only happens once
    logger.info("Downloading NLTK punkt tokenizer (first-run setup).")
    nltk.download("punkt", quiet=True)


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def ensure_cache_dir() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def load_manifest() -> Dict[str, Any]:
    if not MANIFEST_PATH.exists():
        return {}
    try:
        return json.loads(MANIFEST_PATH.read_text("utf-8"))
    except json.JSONDecodeError:
        logger.warning("Manifest is invalid JSON; starting fresh.")
        return {}


def save_manifest(manifest: Dict[str, Any]) -> None:
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), "utf-8")


def compute_checksum(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def timestamp() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def normalize_text(text: str) -> str:
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def detect_language(text: str) -> str:
    snippet = text[:4000].strip()
    if not snippet:
        return "unknown"
    try:
        return detect(snippet)
    except LangDetectException:
        return "unknown"


def directory_has_content(path_str: str, predicate=None) -> bool:
    try:
        directory = Path(path_str)
        if not directory.exists():
            return False
        for entry in directory.iterdir():
            if entry.name.startswith("."):
                continue
            if predicate and not predicate(entry.name):
                continue
            return True
    except Exception as exc:  # pragma: no cover
        logger.debug("directory_has_content(%s) failed: %s", path_str, exc)
    return False


def get_embedding_endpoint() -> str:
    default_ollama = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")
    tensor_url = os.getenv("TENSORRT_API_URL")
    if not tensor_url:
        return default_ollama

    model_dir = os.getenv(
        "TENSORRT_MODEL_DIR", str(Path.cwd() / "docker" / "tensorrt-llm" / "models")
    )
    engine_dir = os.getenv(
        "TENSORRT_ENGINE_DIR", str(Path.cwd() / "docker" / "tensorrt-llm" / "engines")
    )

    has_models = directory_has_content(model_dir)
    has_engines = directory_has_content(engine_dir, lambda name: name.lower().endswith(".plan"))

    if has_models and has_engines:
        return tensor_url.rstrip("/")

    logger.warning(
        "TensorRT assets missing (models=%s, engines=%s). Falling back to Ollama %s",
        has_models,
        has_engines,
        default_ollama,
    )
    return default_ollama


def generate_embedding(text: str) -> List[float]:
    if not EMBEDDINGS_ENABLED:
        raise RuntimeError("Embeddings disabled via DOC_INGEST_DISABLE_EMBEDDINGS=1")

    trimmed = text.strip()
    if not trimmed:
        raise ValueError("Cannot embed empty text chunk.")

    payload = {
        "model": EMBEDDING_MODEL,
        "prompt": trimmed[:EMBEDDING_CHAR_LIMIT],
    }
    endpoint = get_embedding_endpoint()
    try:
        response = requests.post(
            f"{endpoint}/api/embeddings",
            json=payload,
            timeout=EMBEDDING_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"Embedding request failed: {exc}") from exc

    if not response.ok:
        raise RuntimeError(f"Embedding HTTP {response.status_code}: {response.text[:200]}")

    data = response.json()
    if isinstance(data, dict):
        if "embedding" in data:
            embedding = data["embedding"]
        elif "data" in data and data["data"]:
            embedding = data["data"][0].get("embedding")
        else:
            raise RuntimeError("Embedding response missing 'embedding' field.")
    else:
        raise RuntimeError("Unexpected embedding response format.")

    if not isinstance(embedding, Iterable):
        raise RuntimeError("Embedding payload had invalid type.")

    return [float(x) for x in embedding]


def chunk_sentences(
    sentences: List[str],
    chunk_chars: int = DEFAULT_CHUNK_CHARS,
    overlap_sentences: int = DEFAULT_SENTENCE_OVERLAP,
) -> List[Dict[str, Any]]:
    chunks: List[Dict[str, Any]] = []
    if not sentences:
        return chunks

    buffer: List[str] = []
    buffer_len = 0
    start_index = 0

    for idx, sentence in enumerate(sentences):
        sentence = sentence.strip()
        if not sentence:
            continue

        addition = len(sentence) + (1 if buffer else 0)
        if buffer and (buffer_len + addition) > chunk_chars:
            chunk_text = " ".join(buffer)
            chunks.append(
                {
                    "text": chunk_text,
                    "start_sentence": start_index,
                    "end_sentence": start_index + len(buffer) - 1,
                }
            )
            if overlap_sentences > 0:
                buffer = buffer[-overlap_sentences:]
                start_index = idx - len(buffer)
                buffer_len = sum(len(s) for s in buffer) + max(len(buffer) - 1, 0)
            else:
                buffer = []
                buffer_len = 0
                start_index = idx

        if buffer:
            buffer_len += 1  # account for added space
        buffer.append(sentence)
        buffer_len += len(sentence)

    if buffer:
        chunk_text = " ".join(buffer)
        chunks.append(
            {
                "text": chunk_text,
                "start_sentence": start_index,
                "end_sentence": start_index + len(buffer) - 1,
            }
        )

    return chunks


def allowed_to_crawl(url: str, force: bool = False) -> bool:
    if force:
        return True

    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = robotparser.RobotFileParser()
    rp.set_url(robots_url)
    try:
        rp.read()
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.warning("Failed to read robots.txt (%s): %s", robots_url, exc)
        return False
    return rp.can_fetch("*", url)


def fetch_url(url: str) -> requests.Response:
    try:
        response = requests.get(
            url,
            timeout=30,
            headers={"User-Agent": USER_AGENT},
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {exc}") from exc
    return response


def extract_text_from_pdf(data: bytes) -> str:
    if PdfReader is None:
        raise RuntimeError("PDF support requires 'pypdf'. Install it via requirements.")
    reader = PdfReader(BytesIO(data))
    pages = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception as exc:  # pragma: no cover - per-page failures
            logger.warning("PDF page extraction failed: %s", exc)
            text = ""
        pages.append(text)
    return "\n".join(pages)


def extract_text_from_docx(data: bytes) -> str:
    if docx is None:
        raise RuntimeError("DOCX support requires 'python-docx'. Install it via requirements.")
    document = docx.Document(BytesIO(data))
    return "\n".join(paragraph.text for paragraph in document.paragraphs)


def extract_text_from_html(html: str) -> Dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "header", "footer"]):
        tag.decompose()
    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    text = soup.get_text(separator="\n")
    return {"title": title, "text": normalize_text(text)}


def extract_text_from_image(data: bytes) -> str:
    if pytesseract is None or Image is None:
        raise RuntimeError("OCR requires Pillow + pytesseract.")
    image = Image.open(BytesIO(data))
    return pytesseract.image_to_string(image)


def extract_text_from_upload(
    filename: str,
    content_type: Optional[str],
    data: bytes,
    enable_ocr: bool = False,
) -> Dict[str, str]:
    suffix = Path(filename or "").suffix.lower()
    text: Optional[str] = None
    title = Path(filename or "document").stem

    try:
        if content_type in {"application/pdf"} or suffix == ".pdf":
            text = extract_text_from_pdf(data)
        elif content_type in {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
        } or suffix in {".docx", ".doc"}:
            text = extract_text_from_docx(data)
        elif content_type and content_type.startswith("text/"):
            text = data.decode("utf-8", errors="ignore")
        elif suffix in {".htm", ".html"} or (content_type and "html" in content_type):
            html = data.decode("utf-8", errors="ignore")
            result = extract_text_from_html(html)
            return result
        elif content_type and content_type.startswith("image/"):
            if enable_ocr:
                text = extract_text_from_image(data)
            else:
                raise RuntimeError("Image provided but OCR disabled. Re-run with enable_ocr=true.")
        else:
            # Attempt best-effort UTF-8 decode
            text = data.decode("utf-8", errors="ignore")
    except UnicodeDecodeError as exc:
        raise RuntimeError(f"Unable to decode file as UTF-8: {exc}") from exc

    if text is None:
        raise RuntimeError("Unsupported file type for ingestion.")

    return {"title": title, "text": normalize_text(text)}


def build_document_record(
    *,
    doc_id: str,
    source: str,
    title: str,
    text: str,
    lang: str,
    sentences: List[str],
    chunks: List[Dict[str, Any]],
    metadata: Dict[str, Any],
) -> Dict[str, Any]:
    checksum = compute_checksum(text)
    return {
        "doc_id": doc_id,
        "source": source,
        "title": title,
        "lang": lang,
        "checksum": checksum,
        "fetched_at": timestamp(),
        "num_sentences": len(sentences),
        "num_chunks": len(chunks),
        "metadata": metadata,
    }


def connect_redis() -> Optional[redis.Redis]:
    try:
        client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        client.ping()
        logger.info("Connected to Redis (%s)", REDIS_URL)
        return client
    except (redis.ConnectionError, redis.TimeoutError) as exc:
        logger.warning("Redis unavailable (%s). Continuing without cache.", exc)
        return None


redis_client = connect_redis()


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------


class ChunkResponse(BaseModel):
    index: int
    text_preview: str = Field(..., alias="textPreview")
    tokens_estimate: int = Field(..., alias="tokensEstimate")
    redis_key: Optional[str] = Field(None, alias="redisKey")
    embedding_status: str = Field(..., alias="embeddingStatus")


class DocumentResponse(BaseModel):
    doc_id: str = Field(..., alias="docId")
    source: str
    title: str
    lang: str
    checksum: str
    fetched_at: str = Field(..., alias="fetchedAt")
    num_chunks: int = Field(..., alias="numChunks")
    num_sentences: int = Field(..., alias="numSentences")
    cache_path: Optional[str] = Field(None, alias="cachePath")
    embedding_model: Optional[str] = Field(None, alias="embeddingModel")
    chunks: List[ChunkResponse] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class CrawlRequest(BaseModel):
    url: str
    allow: Optional[List[str]] = None
    enable_ocr: bool = Field(False, alias="enableOcr")
    force: bool = False
    consent: bool = False


class TextIngestRequest(BaseModel):
    content: str
    title: Optional[str] = None
    source: Optional[str] = None
    consent: bool = False


# ---------------------------------------------------------------------------
# Core ingestion logic
# ---------------------------------------------------------------------------


def persist_document(record: Dict[str, Any], chunks: List[Dict[str, Any]]) -> str:
    ensure_cache_dir()
    doc_id = record["doc_id"]
    cache_path = CACHE_DIR / f"{doc_id}.json"

    to_store = {
        **record,
        "chunks": chunks,
    }
    cache_path.write_text(json.dumps(to_store, indent=2, ensure_ascii=False), "utf-8")

    manifest = load_manifest()
    manifest[doc_id] = {
        "source": record["source"],
        "title": record["title"],
        "lang": record["lang"],
        "num_chunks": record["num_chunks"],
        "fetched_at": record["fetched_at"],
        "checksum": record["checksum"],
        "cache_path": str(cache_path),
    }
    save_manifest(manifest)

    return str(cache_path)


def push_to_redis(
    record: Dict[str, Any],
    chunks: List[Dict[str, Any]],
) -> List[str]:
    if redis_client is None:
        return []

    redis_keys: List[str] = []
    meta_key = f"doc_ingest:{record['doc_id']}:meta"

    try:
        pipeline = redis_client.pipeline()
        pipeline.set(meta_key, json.dumps(record, ensure_ascii=False))
        redis_keys.append(meta_key)

        for chunk in chunks:
            idx = chunk["index"]
            text_key = f"doc_ingest:{record['doc_id']}:chunk:{idx}"
            value = {
                "doc_id": record["doc_id"],
                "chunk_index": idx,
                "text": chunk["text"],
                "lang": record["lang"],
            }
            pipeline.set(text_key, json.dumps(value, ensure_ascii=False))
            redis_keys.append(text_key)

            embedding = chunk.get("embedding")
            if embedding:
                emb_key = f"embedding:doc:{record['doc_id']}:chunk:{idx}"
                payload = {
                    "doc_id": record["doc_id"],
                    "chunk_index": idx,
                    "vector": embedding,
                    "source": record["source"],
                    "title": record["title"],
                    "lang": record["lang"],
                    "checksum": record["checksum"],
                }
                pipeline.set(emb_key, json.dumps(payload))
                redis_keys.append(emb_key)

        pipeline.execute()
        return redis_keys
    except (redis.RedisError, TypeError) as exc:
        logger.error("Failed to push document to Redis: %s", exc)
        return redis_keys


def ingest(
    *,
    source: str,
    title: str,
    text: str,
    metadata: Dict[str, Any],
) -> DocumentResponse:
    if not metadata.get("consent"):
        raise HTTPException(status_code=400, detail="Explicit user consent required.")

    cleaned_text = normalize_text(text)
    if not cleaned_text:
        raise HTTPException(status_code=400, detail="No textual content extracted.")

    lang = detect_language(cleaned_text)
    if lang != "en":
        logger.info("Detected non-English language '%s' (document will be tagged).", lang)

    sentences = [s for s in sent_tokenize(cleaned_text) if s.strip()]
    if len(sentences) < 2:
        raise HTTPException(status_code=400, detail="Document too short after preprocessing.")

    raw_chunks = chunk_sentences(sentences)
    doc_id = uuid.uuid4().hex
    record = build_document_record(
        doc_id=doc_id,
        source=source,
        title=title,
        text=cleaned_text,
        lang=lang,
        sentences=sentences,
        chunks=raw_chunks,
        metadata=metadata,
    )

    chunk_payloads: List[Dict[str, Any]] = []
    warnings: List[str] = []

    for index, chunk in enumerate(raw_chunks):
        chunk_text = chunk["text"]
        embedding = None
        embedding_status = "skipped"
        if EMBEDDINGS_ENABLED:
            try:
                embedding = generate_embedding(chunk_text)
                embedding_status = "ok"
            except Exception as exc:  # pragma: no cover - depends on env
                warning = f"Chunk {index} embedding failed: {exc}"
                logger.warning(warning)
                warnings.append(warning)
                embedding_status = "failed"

        chunk_payloads.append(
            {
                "index": index,
                "text": chunk_text,
                "embedding": embedding,
                "embedding_status": embedding_status,
                "tokens_estimate": max(1, len(chunk_text.split())),
            }
        )

    cache_path = persist_document(
        record,
        [
            {
                "index": payload["index"],
                "text": payload["text"],
                "tokens_estimate": payload["tokens_estimate"],
                "embedding_status": payload["embedding_status"],
            }
            for payload in chunk_payloads
        ],
    )

    redis_keys = push_to_redis(
        record,
        [
            {
                "index": payload["index"],
                "text": payload["text"],
                "embedding": payload["embedding"],
            }
            for payload in chunk_payloads
        ],
    )

    return DocumentResponse(
        doc_id=record["doc_id"],
        source=record["source"],
        title=record["title"],
        lang=record["lang"],
        checksum=record["checksum"],
        fetched_at=record["fetched_at"],
        num_chunks=record["num_chunks"],
        num_sentences=record["num_sentences"],
        cache_path=cache_path,
        embedding_model=EMBEDDING_MODEL if EMBEDDINGS_ENABLED else None,
        chunks=[
            ChunkResponse(
                index=payload["index"],
                textPreview=payload["text"][:160],
                tokensEstimate=payload["tokens_estimate"],
                redisKey=f"embedding:doc:{record['doc_id']}:chunk:{payload['index']}"
                if EMBEDDINGS_ENABLED
                else None,
                embeddingStatus=payload["embedding_status"],
            )
            for payload in chunk_payloads
        ],
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# FastAPI wiring
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Document Ingestion Service",
    version="0.1.0",
    description="Extract, chunk, and embed documentation for downstream RAG indexing.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def healthcheck() -> Dict[str, Any]:
    status = "ok"
    dependencies: Dict[str, str] = {}
    if redis_client is None:
        dependencies["redis"] = "unavailable"
        status = "degraded"
    else:
        dependencies["redis"] = "ok"
    dependencies["embeddings"] = "enabled" if EMBEDDINGS_ENABLED else "disabled"
    return {"status": status, "dependencies": dependencies}


@app.get("/documents")
def list_documents() -> Dict[str, Any]:
    manifest = load_manifest()
    return {"documents": manifest}


@app.get("/documents/{doc_id}")
def get_document(doc_id: str):
    cache_path = CACHE_DIR / f"{doc_id}.json"
    if not cache_path.exists():
        raise HTTPException(status_code=404, detail="Document not found.")
    try:
        return JSONResponse(json.loads(cache_path.read_text("utf-8")))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to decode cache: {exc}") from exc


@app.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    consent: bool = Form(False),
    enable_ocr: bool = Form(False, alias="enableOcr"),
) -> DocumentResponse:
    data = await file.read()

    def process_upload() -> DocumentResponse:
        try:
            result = extract_text_from_upload(
                filename=file.filename or "document",
                content_type=file.content_type,
                data=data,
                enable_ocr=enable_ocr,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        text = result["text"]
        title = result.get("title") or Path(file.filename or "document").stem
        metadata = {
            "filename": file.filename,
            "content_type": file.content_type,
            "size_bytes": len(data),
            "consent": consent,
            "ingest_mode": "upload",
        }
        return ingest(source="upload", title=title, text=text, metadata=metadata)

    return await run_in_threadpool(process_upload)


@app.post("/crawl", response_model=DocumentResponse)
async def crawl_document(request: CrawlRequest) -> DocumentResponse:
    if not request.consent:
        raise HTTPException(status_code=400, detail="Explicit consent required for crawling.")

    whitelist = set(request.allow) if request.allow else DEFAULT_WHITELIST
    parsed = urlparse(request.url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Only http/https URLs are supported.")
    if parsed.netloc not in whitelist:
        raise HTTPException(
            status_code=403,
            detail=f"Host '{parsed.netloc}' not in whitelist. Provide allow-list override.",
        )
    if not allowed_to_crawl(request.url, force=request.force):
        raise HTTPException(status_code=403, detail="Robots.txt disallows crawling this URL.")

    def process_crawl() -> DocumentResponse:
        response = fetch_url(request.url)
        result = extract_text_from_html(response.text)
        metadata = {
            "source_url": request.url,
            "status_code": response.status_code,
            "content_length": len(response.content),
            "consent": request.consent,
            "ingest_mode": "crawl",
            "headers": dict(response.headers),
        }
        return ingest(
            source=request.url,
            title=result.get("title") or request.url,
            text=result["text"],
            metadata=metadata,
        )

    return await run_in_threadpool(process_crawl)


@app.post("/ingest-text", response_model=DocumentResponse)
async def ingest_text(request: TextIngestRequest) -> DocumentResponse:
    if not request.consent:
        raise HTTPException(status_code=400, detail="Explicit consent required.")

    title = request.title or (request.source or "text")[:80]
    metadata = {
        "source_label": request.source or "manual",
        "consent": request.consent,
        "ingest_mode": "raw-text",
    }

    def process_text() -> DocumentResponse:
        return ingest(
            source=request.source or "raw-text",
            title=title,
            text=request.content,
            metadata=metadata,
        )

    return await run_in_threadpool(process_text)


@app.get("/query")
def simple_query(substr: str) -> Dict[str, Any]:
    """Quick substring query across cached documents (debug aid)."""
    substr_lower = substr.lower()
    matches: List[Dict[str, Any]] = []
    for cache_file in CACHE_DIR.glob("*.json"):
        try:
            payload = json.loads(cache_file.read_text("utf-8"))
        except json.JSONDecodeError:
            continue
        doc_texts = payload.get("chunks", [])
        for chunk in doc_texts:
            text = chunk.get("text") or ""
            if substr_lower in text.lower():
                matches.append(
                    {
                        "doc_id": payload.get("doc_id"),
                        "title": payload.get("title"),
                        "lang": payload.get("lang"),
                        "excerpt": text[:240],
                        "cache_path": str(cache_file),
                    }
                )
                break
    return {"matches": matches}


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("doc_ingest:app", host="0.0.0.0", port=8090, reload=False)
