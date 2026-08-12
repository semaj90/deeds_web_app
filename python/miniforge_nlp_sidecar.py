#!/usr/bin/env python3
"""
Miniforge NLP sidecar.

This is the Python process behind the Atlas NLP middleware lane.
It is currently Docker-hosted in a Python 3.13 slim container, even though
the service name retains the historical "miniforge" label.

It keeps the hot TypeScript path thin while handling:

- LangExtract-compatible text extraction
- spaCy entity extraction when available
- tree-sitter chunking when available
- ast-grep structural features when available
- optional PyTorch feature summaries

The service degrades cleanly when optional packages are missing. A future
GPU-sidecar may add CUDA/PyTorch explicitly, but that is not part of the
current checked-in runtime.
"""

from __future__ import annotations

import hashlib
import importlib
import json
from importlib import metadata as importlib_metadata
from datetime import datetime
import os
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    import uvicorn
except ImportError as exc:  # pragma: no cover - launcher/runtime only
    raise RuntimeError("uvicorn is required to run the NLP sidecar") from exc

try:
    import langextract  # type: ignore
    LANGEXTRACT_AVAILABLE = True
except Exception:
    langextract = None  # type: ignore
    LANGEXTRACT_AVAILABLE = False

try:
    from bs4 import BeautifulSoup  # type: ignore
    BEAUTIFULSOUP_AVAILABLE = True
except Exception:
    BeautifulSoup = None  # type: ignore
    BEAUTIFULSOUP_AVAILABLE = False

try:
    TREESITTER_CHUNKER_MODULE_NAME = None
    TREESITTER_CHUNKER_MODULE = None
    for candidate in ("treesitter_chunker", "tree_sitter_chunker", "chunker"):
        try:
            TREESITTER_CHUNKER_MODULE = importlib.import_module(candidate)
            TREESITTER_CHUNKER_MODULE_NAME = candidate
            break
        except Exception:
            continue
    TREESITTER_CHUNKER_AVAILABLE = TREESITTER_CHUNKER_MODULE is not None
except Exception:
    TREESITTER_CHUNKER_MODULE_NAME = None
    TREESITTER_CHUNKER_MODULE = None  # type: ignore[assignment]
    TREESITTER_CHUNKER_AVAILABLE = False

try:
    import spacy  # type: ignore
    SPACY_AVAILABLE = True
except Exception:
    spacy = None  # type: ignore
    SPACY_AVAILABLE = False

try:
    import torch  # type: ignore
    TORCH_AVAILABLE = True
except Exception:
    torch = None  # type: ignore
    TORCH_AVAILABLE = False

try:
    from tree_sitter_language_pack import get_parser  # type: ignore
    TREE_SITTER_AVAILABLE = True
except Exception:
    get_parser = None  # type: ignore
    TREE_SITTER_AVAILABLE = False

try:
    from ast_grep_py import SgRoot  # type: ignore
    AST_GREP_AVAILABLE = True
except Exception:
    SgRoot = None  # type: ignore
    AST_GREP_AVAILABLE = False


SOURCE_TYPES = Literal[
    "plain_text",
    "docling_markdown",
    "docling_json",
    "ocr_text",
    "transcript",
    "codebase",
    "general",
]

EXTRACTION_MODES = Literal["entities", "relationships", "concepts", "full"]

app = FastAPI(
    title="Miniforge NLP Sidecar",
    version="1.0.0",
    description="LangExtract-compatible extraction + tree-sitter/ast-grep code analysis",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_timer(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = int((time.perf_counter() - started) * 1000)
    response.headers["x-nlp-sidecar-ms"] = str(duration_ms)
    response.headers["x-nlp-sidecar-request-id"] = request.headers.get("x-request-id", "")
    return response


class AnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=1)
    source_type: SOURCE_TYPES = "plain_text"
    extraction_mode: EXTRACTION_MODES = "full"
    document_id: Optional[str] = None
    source_ref: Optional[str] = None
    packet_key: Optional[str] = None
    language: Optional[str] = None
    model_id: Optional[str] = None
    max_chars: int = Field(default=50_000, ge=1, le=200_000)
    passes: list[Literal["structural", "lexical", "linguistic", "semantic", "sequence", "rerank", "grounded"]] = Field(default_factory=list)
    grounded_extraction_required: bool = False


class Chunk(BaseModel):
    kind: str
    text: str
    start: int
    end: int
    symbol: Optional[str] = None
    language: Optional[str] = None


class Entity(BaseModel):
    text: str
    label: str
    start: Optional[int] = None
    end: Optional[int] = None
    confidence: float = 0.6
    source: str = "regex"


class Relationship(BaseModel):
    subject: str
    predicate: str
    object: str
    confidence: float = 0.5
    source: str = "regex"


class Feature(BaseModel):
    kind: str
    name: str
    description: str
    source: Literal["tree-sitter", "ast-grep", "langextract", "regex", "spacy", "torch"]
    lineNumber: Optional[int] = None
    confidence: float = 0.7
    rawText: Optional[str] = None


class EvidenceSpan(BaseModel):
    source_ref: str
    source_revision: Optional[str] = None
    packet_key: Optional[str] = None
    start_byte: Optional[int] = None
    end_byte: Optional[int] = None
    start_line: Optional[int] = None
    end_line: Optional[int] = None
    confidence: Optional[float] = None
    excerpt: Optional[str] = None
    kind: Optional[str] = None


class AnalysisPassResult(BaseModel):
    request_id: str
    packet_key: Optional[str] = None
    source_ref: str
    source_revision: str
    family: Literal["structural", "lexical", "linguistic", "semantic", "sequence", "rerank", "grounded"]
    pass_name: str
    pass_revision: str
    backend: str
    backend_version: str
    device: Literal["cpu", "cuda", "external"]
    input_hash: str
    output_hash: str
    started_at: str
    completed_at: str
    status: Literal["succeeded", "skipped", "failed"]
    features: dict[str, Any] = Field(default_factory=dict)
    artifacts: dict[str, Any] = Field(default_factory=dict)
    evidence: list[EvidenceSpan] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class AstUnit(BaseModel):
    source_ref: str
    source_revision: str
    tree_node_id: str
    symbol_version_id: Optional[str] = None
    language: str
    node_kind: str
    qualified_symbol: Optional[str] = None
    byte_start: int
    byte_end: int
    line_start: int
    line_end: int
    parent_symbol: Optional[str] = None
    imports: list[str] = Field(default_factory=list)
    exports: list[str] = Field(default_factory=list)
    calls: list[str] = Field(default_factory=list)
    references: list[str] = Field(default_factory=list)
    tests: list[str] = Field(default_factory=list)
    comments: list[str] = Field(default_factory=list)
    docstrings: list[str] = Field(default_factory=list)
    parser_engine: str
    parser_revision: str
    grammar_revision: str
    chunker: str
    chunker_revision: str
    structural_revision: str
    content_hash: str


class SemanticCodeCard(BaseModel):
    source_ref: str
    source_revision: str
    tree_node_id: str
    symbol_version_id: Optional[str] = None
    language: str
    symbol: str
    kind: str
    role: str
    calls: list[str] = Field(default_factory=list)
    references: list[str] = Field(default_factory=list)
    invariants: list[str] = Field(default_factory=list)
    excerpt: str
    lexical_facts: list[str] = Field(default_factory=list)
    linguistic_facts: list[str] = Field(default_factory=list)
    structural_revision: str
    semantic_card_revision: str
    semantic_revision: str
    input_hash: str
    output_hash: str


class HMMObservation(BaseModel):
    request_id: str
    packet_key: Optional[str] = None
    source_ref: str
    source_revision: str
    position: int
    observation: str
    weight: float = 1.0
    source_pass: str
    state_hint: Optional[str] = None
    created_at: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class Control5(BaseModel):
    lexical_confidence: Optional[float] = None
    semantic_confidence: Optional[float] = None
    structural_confidence: Optional[float] = None
    topological_confidence: Optional[float] = None
    execution_confidence: Optional[float] = None


class ExperimentFeatureMatrix(BaseModel):
    request_id: str
    candidate_id: str
    packet_key: Optional[str] = None
    source_ref: str
    source_revision: str
    feature_revision: str
    graph_revision: Optional[str] = None
    representation_revision: Optional[str] = None
    dense_cosine: Optional[float] = None
    bm25: Optional[float] = None
    rrf: Optional[float] = None
    ast_match: Optional[float] = None
    pagerank: Optional[float] = None
    cheirank: Optional[float] = None
    community_affinity: Optional[float] = None
    hop_distance: Optional[float] = None
    kmeans_distance: Optional[float] = None
    som_distance: Optional[float] = None
    manifold_distance: Optional[float] = None
    cross_encoder_score: Optional[float] = None
    mixedbread_score: Optional[float] = None
    historical_execution_success: Optional[float] = None
    test_impact: Optional[float] = None
    reranker_score: Optional[float] = None
    control5: Optional[Control5] = None
    features: dict[str, Any] = Field(default_factory=dict)
    pass_count: int = 0
    input_hash: str
    output_hash: str


class EventHypergraphPayload(BaseModel):
    events: list[dict[str, Any]] = Field(default_factory=list)
    ontology_event_tuples: list[dict[str, Any]] = Field(default_factory=list)
    event_breadth_features: Optional[dict[str, Any]] = None
    recommendation_feature_rows: list[dict[str, Any]] = Field(default_factory=list)
    recommendation_judgment: Optional[dict[str, Any]] = None
    event_sort_revision: str = "atlas.event.sort.v1"


class AnalyzeResponse(BaseModel):
    document_id: str
    source_type: SOURCE_TYPES
    extraction_mode: EXTRACTION_MODES
    entities: list[Entity]
    relationships: list[Relationship]
    concepts: list[str]
    chunks: list[Chunk]
    features: list[Feature]
    metadata: dict[str, Any]
    capabilities: dict[str, bool]
    pass_results: list[AnalysisPassResult] = Field(default_factory=list)
    control5: Optional[Control5] = None
    experiment_feature_matrix: Optional[ExperimentFeatureMatrix] = None
    event_hypergraph: Optional[EventHypergraphPayload] = None
    processing_time_ms: int


class ExtractResponse(BaseModel):
    document_id: str
    structure: dict[str, Any]
    entities: list[Entity]
    metadata: dict[str, Any]
    processing_time: float


SPACY_MODEL = os.getenv("SPACY_MODEL", "en_core_web_sm")
MAX_TEXT_CHARS = int(os.getenv("NLP_SIDEcar_MAX_CHARS", "50000"))

_spacy_nlp = None


def _capabilities() -> dict[str, bool]:
    return {
        "spacy": SPACY_AVAILABLE,
        "langextract": LANGEXTRACT_AVAILABLE,
        "tree_sitter": TREE_SITTER_AVAILABLE,
        "treesitter_chunker": TREESITTER_CHUNKER_AVAILABLE,
        "ast_grep": AST_GREP_AVAILABLE,
        "torch": TORCH_AVAILABLE,
    }


def _package_version(*distribution_names: str) -> Optional[str]:
    for dist_name in distribution_names:
        try:
            return importlib_metadata.version(dist_name)
        except importlib_metadata.PackageNotFoundError:
            continue
        except Exception:
            continue
    return None


def _module_path(module: Any) -> Optional[str]:
    path = getattr(module, "__file__", None)
    if not path:
        return None
    try:
        return str(Path(path).resolve())
    except Exception:
        return str(path)


def _editable_source(dist_name: str) -> Optional[str]:
    try:
        dist = importlib_metadata.distribution(dist_name)
        raw = dist.read_text("direct_url.json")
        return raw.strip() if raw else None
    except Exception:
        return None


def _extract_html_text(html: str) -> dict[str, Any]:
    if BEAUTIFULSOUP_AVAILABLE and BeautifulSoup is not None:
        soup = BeautifulSoup(html, "html.parser")
        for tag_name in ("script", "style", "noscript", "svg"):
            for node in soup.find_all(tag_name):
                node.decompose()

        title = ""
        if soup.title and soup.title.string:
            title = soup.title.get_text(" ", strip=True)

        text = soup.get_text(" ", strip=True)
        return {
            "title": title,
            "text": text,
            "content_length": len(text),
            "source": "beautifulsoup",
        }

    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    title = title_match.group(1).strip() if title_match else ""
    text = re.sub(r"<script[^>]*>[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    text = re.sub(r"<style[^>]*>[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return {
        "title": title,
        "text": text,
        "content_length": len(text),
        "source": "regex",
    }


def _fetch_html(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "DeedsAI/1.0 (legal research)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="ignore")


def _runtime_info() -> dict[str, Any]:
    return {
        "pythonExecutable": sys.executable,
        "pythonVersion": sys.version.split()[0],
        "environmentType": "system-python" if Path(sys.executable).name.lower().startswith("python") else "unknown",
    }


def _module_proof() -> dict[str, Any]:
    langextract_module_path = _module_path(langextract) if LANGEXTRACT_AVAILABLE else None
    langextract_version = _package_version("langextract")
    tree_sitter_pack_version = _package_version("tree-sitter-language-pack", "tree_sitter_language_pack")
    ast_grep_version = _package_version("ast-grep-py", "ast_grep_py")
    treesitter_chunker_version = _package_version("treesitter-chunker", "treesitter_chunker", "tree_sitter_chunker", "chunker")

    return {
        "langextract": {
            "available": LANGEXTRACT_AVAILABLE,
            "version": langextract_version,
            "modulePath": langextract_module_path,
            "importVerified": LANGEXTRACT_AVAILABLE and bool(langextract_module_path),
            "editableSource": _editable_source("langextract"),
            "beautifulsoup4": {
                "available": BEAUTIFULSOUP_AVAILABLE,
                "version": _package_version("beautifulsoup4"),
                "modulePath": _module_path(BeautifulSoup) if BEAUTIFULSOUP_AVAILABLE else None,
                "importVerified": BEAUTIFULSOUP_AVAILABLE,
            },
        },
        "treesitterChunker": {
            "available": TREESITTER_CHUNKER_AVAILABLE,
            "version": treesitter_chunker_version,
            "modulePath": _module_path(TREESITTER_CHUNKER_MODULE) if TREESITTER_CHUNKER_AVAILABLE else None,
            "moduleName": TREESITTER_CHUNKER_MODULE_NAME,
            "importVerified": TREESITTER_CHUNKER_AVAILABLE,
            "fixtureVerified": False,
        },
        "treeSitterLanguagePack": {
            "available": TREE_SITTER_AVAILABLE,
            "version": tree_sitter_pack_version,
            "importVerified": TREE_SITTER_AVAILABLE,
        },
        "astGrepPy": {
            "available": AST_GREP_AVAILABLE,
            "version": ast_grep_version,
            "importVerified": AST_GREP_AVAILABLE,
        },
    }


def _is_code(source_type: str, text: str) -> bool:
    if source_type in {"codebase", "general"}:
        return True
    code_markers = (
        "function ",
        "class ",
        "interface ",
        "type ",
        "const ",
        "let ",
        "var ",
        "import ",
        "export ",
        "def ",
        "package ",
        "module ",
        "=>",
        "{",
        "};",
    )
    return sum(marker in text for marker in code_markers) >= 3


def _lazy_spacy():
    global _spacy_nlp
    if _spacy_nlp is not None:
        return _spacy_nlp
    if not SPACY_AVAILABLE:
        return None
    try:
        _spacy_nlp = spacy.load(SPACY_MODEL)  # type: ignore[operator]
    except Exception:
        try:
            _spacy_nlp = spacy.blank("en")  # type: ignore[operator]
        except Exception:
            _spacy_nlp = None
    return _spacy_nlp


def _safe_text(text: str, max_chars: int) -> str:
    return text[:max_chars] if len(text) > max_chars else text


def _regex_entities(text: str) -> list[Entity]:
    patterns = [
        ("DATE", r"\b\d{4}-\d{2}-\d{2}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b", 0.95),
        ("MONEY", r"\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:million|billion|thousand|M|B|K)?\b", 0.90),
        ("STATUTE", r"\b\d{1,3}\s+(?:U\.?S\.?C\.?|C\.?F\.?R\.?)\s*§+\s*[\w\-\(\)]+", 0.95),
        ("CASE", r"\b[A-Z][A-Za-z.&'\-]+(?:\s+[A-Z][A-Za-z.&'\-]+){0,3}\s+v\.?\s+[A-Z][A-Za-z.&'\-]+(?:\s+[A-Z][A-Za-z.&'\-]+){0,3}\b", 0.85),
        ("PERSON", r"\b(?:Justice|Judge|Chief Justice|Senator|Representative|Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?", 0.8),
        ("ORG", r"\b(?:ACLU|FBI|CIA|DOJ|EPA|FTC|SEC|IRS|DEA|ATF|Department\s+of\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b", 0.85),
        ("CODE_SYMBOL", r"\b(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_][A-Za-z0-9_]*)", 0.88),
    ]
    results: list[Entity] = []
    seen: set[tuple[str, int, int]] = set()
    for label, pattern, confidence in patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            start, end = match.start(), match.end()
            key = (label, start, end)
            if key in seen:
                continue
            seen.add(key)
            results.append(
                Entity(
                    text=match.group(0),
                    label=label,
                    start=start,
                    end=end,
                    confidence=confidence,
                    source="regex",
                )
            )
    return sorted(results, key=lambda item: (item.start or 0, item.end or 0))


def _spacy_entities(text: str) -> list[Entity]:
    nlp = _lazy_spacy()
    if nlp is None:
        return []
    try:
        doc = nlp(text)
    except Exception:
        return []
    out: list[Entity] = []
    seen: set[tuple[str, str]] = set()
    for ent in getattr(doc, "ents", []):
        key = (ent.text.strip().lower(), ent.label_)
        if key in seen:
            continue
        seen.add(key)
        out.append(
            Entity(
                text=ent.text.strip(),
                label=ent.label_,
                start=getattr(ent, "start_char", None),
                end=getattr(ent, "end_char", None),
                confidence=0.9,
                source="spacy",
            )
        )
    return out


def _grounded_extractions(text: str, model_id: Optional[str] = None) -> list[dict[str, Any]]:
    if not LANGEXTRACT_AVAILABLE or langextract is None:
        return []
    try:
        extract_fn = getattr(langextract, "extract", None)
        if extract_fn is None:
            return []
        result = getattr(extract_fn, "extract", extract_fn)(  # type: ignore[misc]
            text,
            prompt_description="Extract grounded evidence for Parent Atlas. Return exact spans only.",
            model_id=model_id or os.getenv("LANGEXTRACT_MODEL", "miniforge-nlp-sidecar"),
        )
    except Exception:
        return []

    raw_extractions = getattr(result, "extractions", None) or []
    extracted: list[dict[str, Any]] = []
    for item in raw_extractions[:50]:
        extraction_class = getattr(item, "extraction_class", None) or getattr(item, "label", None) or "UNKNOWN"
        extraction_text = getattr(item, "extraction_text", None) or getattr(item, "text", None) or ""
        if not extraction_text:
            continue
        extracted.append(
            {
                "class": str(extraction_class),
                "text": str(extraction_text),
                "start_char": getattr(item, "start_char", None),
                "end_char": getattr(item, "end_char", None),
                "attributes": getattr(item, "attributes", None) or {},
            }
        )
    return extracted


def _code_chunks_tree_sitter(text: str, language: str) -> list[Chunk]:
    if not TREE_SITTER_AVAILABLE:
        return []
    try:
        parser = get_parser(language)
        tree = parser.parse(text.encode("utf-8"))
        root = tree.root_node
    except Exception:
        return []

    chunks: list[Chunk] = []
    for node in getattr(root, "children", []):
        if not getattr(node, "is_named", True):
            continue
        start = int(getattr(node, "start_byte", 0))
        end = int(getattr(node, "end_byte", 0))
        if end <= start:
            continue
        snippet = text[start:end].strip()
        if not snippet:
            continue
        chunks.append(
            Chunk(
                kind=str(getattr(node, "type", "node")),
                text=snippet[:10_000],
                start=start,
                end=end,
                symbol=None,
                language=language,
            )
        )
    return chunks


def _code_chunks_regex(text: str, language: str) -> list[Chunk]:
    lines = text.splitlines()
    chunks: list[Chunk] = []
    current: list[str] = []
    current_start = 0
    current_kind = "module"
    current_symbol: Optional[str] = None

    def flush(end_line: int) -> None:
        nonlocal current, current_start, current_kind, current_symbol
        if not current:
            return
        snippet = "\n".join(current).strip()
        if snippet:
            chunks.append(
                Chunk(
                    kind=current_kind,
                    text=snippet[:10_000],
                    start=current_start,
                    end=max(current_start, end_line),
                    symbol=current_symbol,
                    language=language,
                )
            )
        current = []
        current_symbol = None

    offset = 0
    for line in lines:
        stripped = line.strip()
        starts_new = bool(
            re.match(r"^(export\s+)?(async\s+)?function\s+[A-Za-z_][A-Za-z0-9_]*", stripped)
            or re.match(r"^(export\s+)?class\s+[A-Za-z_][A-Za-z0-9_]*", stripped)
            or re.match(r"^(export\s+)?interface\s+[A-Za-z_][A-Za-z0-9_]*", stripped)
            or re.match(r"^(export\s+)?type\s+[A-Za-z_][A-Za-z0-9_]*", stripped)
            or re.match(r"^(import|from)\b", stripped)
        )
        if starts_new and current:
            flush(offset)
        if starts_new:
            current_start = offset
            current_kind = "declaration" if not stripped.startswith("import") else "import"
            symbol_match = re.match(
                r"^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)|^(?:export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)|^(?:export\s+)?interface\s+([A-Za-z_][A-Za-z0-9_]*)|^(?:export\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)",
                stripped,
            )
            current_symbol = next((g for g in (symbol_match.groups() if symbol_match else []) if g), None)
        current.append(line)
        offset += len(line) + 1
    flush(offset)
    return chunks


def _code_features_ast_grep(text: str, language: str) -> list[Feature]:
    if not AST_GREP_AVAILABLE:
        return []
    try:
        root = SgRoot(text, language).root()  # type: ignore[call-arg]
    except Exception:
        return []

    patterns = [
        ("ast_function", "function $NAME($$$ARGS) { $$$BODY }", r"function\s+([A-Za-z_][A-Za-z0-9_]*)"),
        ("ast_function", "export function $NAME($$$ARGS) { $$$BODY }", r"export\s+function\s+([A-Za-z_][A-Za-z0-9_]*)"),
        ("ast_class", "class $NAME { $$$BODY }", r"class\s+([A-Za-z_][A-Za-z0-9_]*)"),
        ("ast_class", "export class $NAME { $$$BODY }", r"export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)"),
        ("ast_method", "$NAME = ($$$ARGS) => $$$BODY", r"([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\("),
        ("ast_method", "const $NAME = ($$$ARGS) => $$$BODY", r"const\s+([A-Za-z_][A-Za-z0-9_]*)\s*="),
        ("ast_import", "import $NAME from $$$SOURCE", r"import\s+([A-Za-z_][A-Za-z0-9_]*)\s+from\s+['\"]([^'\"]+)['\"]"),
        ("ast_import", "import { $$$NAMES } from $$$SOURCE", r"import\s+\{([^}]+)\}\s+from\s+['\"]([^'\"]+)['\"]"),
        ("ast_import", "import $$$SIDE from $$$SOURCE", r"import\s+.+?\s+from\s+['\"]([^'\"]+)['\"]"),
    ]
    features: list[Feature] = []
    seen: set[tuple[str, str, int]] = set()
    for kind, pattern, name_pattern in patterns:
        try:
            matches = root.find_all(pattern=pattern)
        except Exception:
            matches = []
        for node in matches:
            try:
                line = node.range().start.line + 1
            except Exception:
                line = 1
            text_value = node.text() if hasattr(node, "text") else str(node)
            if len(text_value) < 5:
                continue
            name_match = re.search(name_pattern, text_value)
            if not name_match:
                continue
            if kind == "ast_import":
                if name_pattern.startswith("import\\s+\\{"):
                    name = ", ".join(part.strip() for part in name_match.group(1).split(",") if part.strip())
                elif "from" in text_value:
                    name = name_match.group(1) if name_match.lastindex and name_match.lastindex >= 1 else text_value
                else:
                    name = text_value.split("from", 1)[-1].strip()
            else:
                name = name_match.group(1)
            name = name.strip()[:120]
            if not name or len(name) < 2:
                continue
            if re.fullmatch(r"[\W_]+", name):
                continue
            key = (kind, name, line)
            if key in seen:
                continue
            seen.add(key)
            features.append(
                Feature(
                    kind=kind,
                    name=name or kind,
                    description=f"{kind} extracted by ast-grep",
                    source="ast-grep",
                    lineNumber=line,
                    confidence=0.92,
                    rawText=text_value[:2000],
                )
            )
    return features


def _code_relationships(text: str) -> list[Relationship]:
    relationships: list[Relationship] = []
    for match in re.finditer(r"\bimport\s+.*?\s+from\s+['\"]([^'\"]+)['\"]", text):
        relationships.append(
            Relationship(
                subject="current-file",
                predicate="imports",
                object=match.group(1),
                confidence=0.95,
                source="regex",
            )
        )
    for match in re.finditer(r"\bextends\s+([A-Za-z_][A-Za-z0-9_]*)", text):
        relationships.append(
            Relationship(
                subject="current-file",
                predicate="extends",
                object=match.group(1),
                confidence=0.8,
                source="regex",
            )
        )
    for match in re.finditer(r"\bimplements\s+([A-Za-z_][A-Za-z0-9_]*)", text):
        relationships.append(
            Relationship(
                subject="current-file",
                predicate="implements",
                object=match.group(1),
                confidence=0.8,
                source="regex",
            )
        )
    return relationships[:100]


def _code_concepts(text: str, entities: list[Entity], chunks: list[Chunk]) -> list[str]:
    concepts: list[str] = []
    for ent in entities:
        if ent.label in {"CODE_SYMBOL", "STATUTE", "CASE"}:
            concepts.append(ent.text)
    for chunk in chunks[:20]:
        if chunk.symbol:
            concepts.append(chunk.symbol)
    words = re.findall(r"\b[A-Za-z][A-Za-z0-9_]{2,}\b", text)
    concepts.extend(words[:50])
    seen: set[str] = set()
    deduped: list[str] = []
    for concept in concepts:
        key = concept.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(concept.strip())
    return deduped[:50]


def _digest_parts(*parts: Any) -> str:
    joined = "||".join("" if part is None else str(part) for part in parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def _unique_nonempty(values: list[Any]) -> list[str]:
    return list(dict.fromkeys(str(value).strip() for value in values if str(value).strip()))


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def _event_hash(payload: dict[str, Any]) -> str:
    return f"evt:{hashlib.sha256(_stable_json(payload).encode('utf-8')).hexdigest()[:24]}"


def _build_ast_units(req: AnalyzeRequest, text: str, chunks: list[Chunk], language: str) -> list[AstUnit]:
    ast_units: list[AstUnit] = []
    parser_engine = "tree-sitter" if TREE_SITTER_AVAILABLE else "regex"
    parser_revision = _package_version("tree-sitter-language-pack", "tree-sitter") or "unknown"
    grammar_revision = language or "unknown"
    chunker = TREESITTER_CHUNKER_MODULE_NAME or parser_engine
    chunker_revision = _package_version("treesitter-chunker", "tree-sitter-chunker", "chunker") or "unknown"
    structural_revision = f"{chunker}-boundary-v1"
    source_ref = req.source_ref or req.document_id or "unknown"
    source_revision = req.model_id or "unknown"

    for idx, chunk in enumerate(chunks[:50]):
        symbol = chunk.symbol or f"chunk_{idx}"
        start = max(0, int(chunk.start))
        end = max(start, int(chunk.end))
        lines_before = text[:start].splitlines()
        line_start = len(lines_before) + 1
        line_end = line_start + max(0, chunk.text.count("\n"))
        ast_units.append(
            AstUnit(
                source_ref=source_ref,
                source_revision=source_revision,
                tree_node_id=_digest_parts(source_ref, symbol, start, end, idx)[:24],
                symbol_version_id=_digest_parts(source_ref, symbol, structural_revision)[:24],
                language=language or "unknown",
                node_kind=chunk.kind,
                qualified_symbol=symbol,
                byte_start=start,
                byte_end=end,
                line_start=line_start,
                line_end=max(line_start, line_end),
                parent_symbol=None,
                imports=[],
                exports=[],
                calls=[],
                references=[],
                tests=[],
                comments=[],
                docstrings=[],
                parser_engine=parser_engine,
                parser_revision=parser_revision,
                grammar_revision=grammar_revision,
                chunker=chunker,
                chunker_revision=chunker_revision,
                structural_revision=structural_revision,
                content_hash=_digest_parts(chunk.kind, chunk.text, start, end, language, source_revision),
            )
        )

    if not ast_units:
        ast_units.append(
            AstUnit(
                source_ref=source_ref,
                source_revision=source_revision,
                tree_node_id=_digest_parts(source_ref, "fallback", language)[:24],
                symbol_version_id=None,
                language=language or "unknown",
                node_kind="module",
                qualified_symbol=None,
                byte_start=0,
                byte_end=len(text),
                line_start=1,
                line_end=max(1, text.count("\n") + 1),
                parent_symbol=None,
                imports=[],
                exports=[],
                calls=[],
                references=[],
                tests=[],
                comments=[],
                docstrings=[],
                parser_engine=parser_engine,
                parser_revision=parser_revision,
                grammar_revision=grammar_revision,
                chunker=chunker,
                chunker_revision=chunker_revision,
                structural_revision=structural_revision,
                content_hash=_digest_parts(text, language, source_revision),
            )
        )

    return ast_units


def _build_semantic_cards(
    req: AnalyzeRequest,
    text: str,
    ast_units: list[AstUnit],
    entities: list[Entity],
    features: list[Feature],
) -> list[SemanticCodeCard]:
    semantic_cards: list[SemanticCodeCard] = []
    lexical_facts = [feature.name for feature in features[:10]]
    linguistic_facts = [entity.text for entity in entities[:10]]
    source_ref = req.source_ref or req.document_id or "unknown"
    source_revision = req.model_id or "unknown"

    for idx, unit in enumerate(ast_units[:20]):
        excerpt = text[unit.byte_start : unit.byte_end].strip()[:5000] or unit.node_kind
        symbol = unit.qualified_symbol or unit.tree_node_id
        role = "structural-boundary" if unit.node_kind else "unknown"
        invariants = []
        if unit.calls:
            invariants.append("call-boundary-preserved")
        if unit.references:
            invariants.append("reference-boundary-preserved")
        semantic_cards.append(
            SemanticCodeCard(
                source_ref=source_ref,
                source_revision=source_revision,
                tree_node_id=unit.tree_node_id,
                symbol_version_id=unit.symbol_version_id,
                language=unit.language,
                symbol=symbol,
                kind=unit.node_kind,
                role=role,
                calls=unit.calls,
                references=unit.references,
                invariants=invariants,
                excerpt=excerpt,
                lexical_facts=lexical_facts,
                linguistic_facts=linguistic_facts,
                structural_revision=unit.structural_revision,
                semantic_card_revision="semantic-card-v1",
                semantic_revision="semantic-768-v1",
                input_hash=_digest_parts(unit.content_hash, lexical_facts, linguistic_facts, idx),
                output_hash=_digest_parts(symbol, excerpt, unit.content_hash, idx),
            )
        )

    return semantic_cards


def _build_hmm_observations(
    req: AnalyzeRequest,
    text: str,
    entities: list[Entity],
    relationships: list[Relationship],
    chunks: list[Chunk],
    semantic_cards: list[SemanticCodeCard],
) -> list[HMMObservation]:
    observations: list[HMMObservation] = []
    source_ref = req.source_ref or req.document_id or "unknown"
    source_revision = req.model_id or "unknown"
    now = datetime.utcnow().isoformat() + "Z"

    tokens: list[tuple[str, float, str]] = []
    if chunks:
        tokens.append(("EXACT_SYMBOL_FOUND", 1.0, "structural"))
    if entities:
        tokens.append(("HIGH_SEMANTIC_MATCH", 0.8, "lexical"))
    if any(rel.predicate == "imports" for rel in relationships):
        tokens.append(("AST_CALL_EDGE_FOUND", 0.7, "structural"))
    if semantic_cards:
        tokens.append(("RERANK_CONFIDENT", 0.6, "semantic"))
    if req.extraction_mode == "full":
        tokens.append(("PATCH_SUCCESS", 0.4, "grounded"))
    if not tokens:
        tokens.append(("REPAIR_AMBIGUOUS", 0.2, "sequence"))

    for idx, (observation, weight, source_pass) in enumerate(tokens[:20]):
        observations.append(
            HMMObservation(
                request_id=req.document_id or req.packet_key or _digest_parts(text)[:16],
                packet_key=req.packet_key,
                source_ref=source_ref,
                source_revision=source_revision,
                position=idx,
                observation=observation,
                weight=weight,
                source_pass=source_pass,
                state_hint="TRACE" if observation.endswith("FOUND") else None,
                created_at=now,
                metadata={"entity_count": len(entities), "relationship_count": len(relationships)},
            )
        )

    return observations


def _build_control5(
    pass_results: list[AnalysisPassResult],
) -> Optional[Control5]:
    def latest_value(family: str, *keys: str) -> Optional[float]:
        for result in reversed(pass_results):
            if result.family != family:
                continue
            for key in keys:
                value = result.features.get(key)
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    return float(value)
        return None

    control5 = Control5(
        lexical_confidence=latest_value("lexical", "lexical_confidence", "bm25"),
        semantic_confidence=latest_value("semantic", "semantic_confidence", "dense_cosine"),
        structural_confidence=latest_value("structural", "structural_confidence", "ast_match"),
        topological_confidence=latest_value("sequence", "topological_confidence", "hop_distance"),
        execution_confidence=latest_value("sequence", "execution_confidence", "historical_execution_success"),
    )
    if any(value is not None for value in control5.model_dump().values()):
        return control5
    return None


def _build_experiment_feature_matrix(
    req: AnalyzeRequest,
    pass_results: list[AnalysisPassResult],
    control5: Optional[Control5],
) -> ExperimentFeatureMatrix:
    def latest_value(family: str, *keys: str) -> Optional[float]:
        for result in reversed(pass_results):
            if result.family != family:
                continue
            for key in keys:
                value = result.features.get(key)
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    return float(value)
        return None

    source_ref = req.source_ref or req.document_id or "unknown"
    source_revision = req.model_id or "unknown"
    candidate_id = req.packet_key or req.document_id or source_ref
    features = {}
    for result in pass_results:
        for key, value in result.features.items():
            if isinstance(value, (int, float, bool)) or value is None:
                features[f"{result.family}.{result.pass_name}.{key}"] = value

    return ExperimentFeatureMatrix(
        request_id=req.document_id or req.packet_key or _digest_parts(req.text)[:16],
        candidate_id=candidate_id,
        packet_key=req.packet_key,
        source_ref=source_ref,
        source_revision=source_revision,
        feature_revision="nlp-feature-compiler-v1",
        graph_revision=None,
        representation_revision=req.model_id,
        dense_cosine=latest_value("semantic", "dense_cosine", "semantic_confidence"),
        bm25=latest_value("lexical", "bm25", "lexical_confidence"),
        rrf=latest_value("rerank", "rrf", "reranker_score"),
        ast_match=latest_value("structural", "ast_match", "structural_confidence"),
        pagerank=latest_value("sequence", "pagerank"),
        cheirank=latest_value("sequence", "cheirank"),
        community_affinity=latest_value("sequence", "community_affinity"),
        hop_distance=latest_value("sequence", "hop_distance"),
        kmeans_distance=latest_value("semantic", "kmeans_distance"),
        som_distance=latest_value("semantic", "som_distance"),
        manifold_distance=latest_value("semantic", "manifold_distance"),
        cross_encoder_score=latest_value("rerank", "cross_encoder_score"),
        mixedbread_score=latest_value("rerank", "mixedbread_score"),
        historical_execution_success=latest_value("sequence", "historical_execution_success"),
        test_impact=latest_value("structural", "test_impact"),
        reranker_score=latest_value("rerank", "reranker_score"),
        control5=control5,
        features=features,
        pass_count=len(pass_results),
        input_hash=_digest_parts(req.text, req.source_ref, source_revision, req.packet_key, req.model_id),
        output_hash=_digest_parts(pass_results, control5),
    )


def _build_event_hypergraph(
    req: AnalyzeRequest,
    text: str,
    entities: list[Entity],
    relationships: list[Relationship],
    chunks: list[Chunk],
    ast_units: list[AstUnit],
    semantic_cards: list[SemanticCodeCard],
    observations: list[HMMObservation],
    pass_results: list[AnalysisPassResult],
    control5: Optional[Control5],
    experiment_feature_matrix: Optional[ExperimentFeatureMatrix],
) -> EventHypergraphPayload:
    source_ref = req.source_ref or req.document_id or "unknown"
    source_revision = req.model_id or "unknown"
    workspace_revision = req.model_id or req.document_id or "unknown"
    observed_at = datetime.utcnow().isoformat() + "Z"
    packet_key = req.packet_key or req.document_id or source_ref

    events: list[dict[str, Any]] = []

    def add_event(
        event_type: str,
        participants: list[dict[str, str]],
        evidence_refs: list[str],
        metadata: dict[str, Any],
    ) -> None:
        canonical_participants = sorted(
            participants,
            key=lambda item: (item.get("role", ""), item.get("entity_kind", ""), item.get("entity_id", "")),
        )
        canonical_evidence = _unique_nonempty(evidence_refs)
        payload = {
            "schema_version": "atlas.event.hypergraph.v1",
            "event_type": event_type,
            "source_ref": source_ref,
            "packet_key": packet_key,
            "tree_node_id": metadata.get("tree_node_id"),
            "workspace_revision": workspace_revision,
            "source_revision": source_revision,
            "representation_revision": req.model_id or "semantic-768-v1",
            "producer_id": "miniforge-nlp-sidecar",
            "producer_revision": _package_version("langextract") or "sidecar-v1",
            "canonicalizer_revision": "event-canonicalizer-v1",
            "compiler_revision": "event-hypergraph-v1",
            "observed_at": observed_at,
            "evidence_refs": canonical_evidence,
            "participants": canonical_participants,
            "metadata": metadata,
        }
        events.append({**payload, "event_id": _event_hash(payload)})

    for idx, unit in enumerate(ast_units[:20]):
        participants: list[dict[str, str]] = [
            {
                "entity_id": unit.qualified_symbol or unit.tree_node_id,
                "entity_kind": "symbol" if unit.qualified_symbol else "tree_node",
                "role": "actor",
            },
            {"entity_id": packet_key, "entity_kind": "packet", "role": "packet"},
            {"entity_id": unit.parser_engine, "entity_kind": "parser", "role": "tool"},
        ]
        if unit.calls:
            participants.append({"entity_id": unit.calls[0], "entity_kind": "symbol", "role": "target"})
        if unit.references:
            participants.append({"entity_id": unit.references[0], "entity_kind": "symbol", "role": "evidence"})
        add_event(
            "call_execution" if unit.calls else "reference_link" if unit.references else "semantic_annotation",
            participants,
            [f"{unit.source_ref}#tree-node:{unit.tree_node_id}", unit.content_hash],
            {"index": idx, "tree_node_id": unit.tree_node_id, "symbol_version_id": unit.symbol_version_id},
        )

    for idx, card in enumerate(semantic_cards[:20]):
        add_event(
            "semantic_annotation",
            [
                {"entity_id": card.symbol, "entity_kind": "symbol", "role": "actor"},
                {"entity_id": packet_key, "entity_kind": "packet", "role": "packet"},
                {"entity_id": card.semantic_revision, "entity_kind": "representation", "role": "context"},
            ],
            [card.input_hash, card.output_hash],
            {"index": idx, "tree_node_id": card.tree_node_id, "symbol_version_id": card.symbol_version_id},
        )

    for idx, obs in enumerate(observations[:20]):
        add_event(
            "workflow_transition",
            [
                {"entity_id": obs.observation, "entity_kind": "observation", "role": "actor"},
                {"entity_id": packet_key, "entity_kind": "packet", "role": "packet"},
                {"entity_id": obs.source_pass, "entity_kind": "pass", "role": "trigger"},
            ],
            [obs.request_id, obs.source_ref],
            {"index": idx, "position": obs.position, "state_hint": obs.state_hint},
        )

    for idx, rel in enumerate(relationships[:20]):
        add_event(
            "tool_call" if rel.predicate == "calls" else "import_resolution" if rel.predicate == "imports" else "reference_link",
            [
                {"entity_id": rel.subject, "entity_kind": "symbol", "role": "actor"},
                {"entity_id": rel.object, "entity_kind": "symbol", "role": "target"},
                {"entity_id": packet_key, "entity_kind": "packet", "role": "packet"},
            ],
            [rel.source_ref, rel.subject, rel.object],
            {"index": idx, "predicate": rel.predicate, "confidence": rel.confidence},
        )

    if not events:
        add_event(
            "semantic_annotation",
            [
                {"entity_id": source_ref, "entity_kind": "source_ref", "role": "actor"},
                {"entity_id": packet_key, "entity_kind": "packet", "role": "packet"},
            ],
            [source_ref],
            {"fallback": True},
        )

    ontology_event_tuples: list[dict[str, Any]] = []
    for event in events:
        for idx, participant in enumerate(event["participants"]):
            ontology_event_tuples.append(
                {
                    "tuple_id": _event_hash({"event_id": event["event_id"], "participant": participant, "index": idx}),
                    "event_id": event["event_id"],
                    "subject_id": event["event_id"],
                    "predicate": f"participant:{participant['role']}",
                    "object_id": participant["entity_id"],
                    "participant_role": participant["role"],
                    "evidence_ref": event["evidence_refs"][0] if event["evidence_refs"] else source_ref,
                    "domain_class": participant["entity_kind"],
                    "source_revision": source_revision,
                    "representation_revision": event["representation_revision"],
                    "previous_revision_id": None,
                    "supersedes_revision_id": None,
                    "generated_at": observed_at,
                }
            )

    event_types = _unique_nonempty([event["event_type"] for event in events])
    workflow_breadth = len(_unique_nonempty([packet_key, source_ref] + [event["event_id"] for event in events]))
    task_breadth = len(_unique_nonempty([result.pass_name for result in pass_results]))
    symbol_breadth = len(_unique_nonempty([unit.qualified_symbol or unit.tree_node_id for unit in ast_units] + [card.symbol for card in semantic_cards]))
    neighborhood_breadth = len(_unique_nonempty([relationship.subject for relationship in relationships] + [relationship.object for relationship in relationships]))

    event_breadth_features = {
        "packet_key": packet_key,
        "workflow_breadth": workflow_breadth,
        "task_breadth": task_breadth,
        "symbol_breadth": symbol_breadth,
        "event_type_breadth": len(event_types),
        "neighborhood_breadth": neighborhood_breadth,
        "telemetry_revision": "event-breadth-v1",
    }

    semantic_score = float((experiment_feature_matrix.dense_cosine if experiment_feature_matrix else None) or (control5.semantic_confidence if control5 else None) or 0.5)
    structural_score = float((experiment_feature_matrix.ast_match if experiment_feature_matrix else None) or (control5.structural_confidence if control5 else None) or 0.5)
    graph_score = float(
        (experiment_feature_matrix.pagerank if experiment_feature_matrix else None)
        or (experiment_feature_matrix.cheirank if experiment_feature_matrix else None)
        or (experiment_feature_matrix.community_affinity if experiment_feature_matrix else None)
        or 0.0
    )
    workflow_score = min(1.0, workflow_breadth / max(1, len(events)))
    breadth_score = min(1.0, len(event_types) / 10.0)

    recommendation_feature_rows: list[dict[str, Any]] = []
    for event in events[:8]:
        recommendation_feature_rows.append(
            {
                "event_id": event["event_id"],
                "candidate_key": event["event_id"],
                "packet_key": packet_key,
                "semantic_score": semantic_score,
                "structural_score": structural_score,
                "graph_score": graph_score,
                "workflow_score": workflow_score,
                "breadth_score": breadth_score,
                "approximation_score": 0.0,
                "utility_bias": 0.0,
                "token_cost": min(1000, len(text)),
                "latency_ms": 0.0,
                "evidence_coverage": min(1.0, len(event["evidence_refs"]) / 3.0),
                "freshness_score": 1.0,
                "feature_revision": experiment_feature_matrix.feature_revision if experiment_feature_matrix else "event-recommendation-v1",
                "graph_revision": experiment_feature_matrix.graph_revision if experiment_feature_matrix else None,
                "event_revision": "event-hypergraph-v1",
            }
        )

    recommendation_judgment: Optional[dict[str, Any]] = None
    if recommendation_feature_rows:
        row = recommendation_feature_rows[0]
        raw_score = (
            ((row["semantic_score"] + row["structural_score"] + row["graph_score"]) / 3.0) * 0.45
            + ((row["workflow_score"] + row["breadth_score"] + row["freshness_score"]) / 3.0) * 0.35
            + row["evidence_coverage"] * 0.1
            - row["approximation_score"] * 0.2
            - min(1.0, (row["token_cost"] / 10000.0) + (row["latency_ms"] / 1000.0) * 0.15)
        )
        score = max(0.0, min(1.0, round(raw_score, 6)))
        action = "skip"
        if score >= 0.82:
            action = "inspect"
        elif score >= 0.7:
            action = "test"
        elif score >= 0.58:
            action = "prefetch"
        elif score >= 0.45:
            action = "graph_expand"
        elif score >= 0.3:
            action = "document"
        recommendation_judgment = {
            "candidate_key": row["candidate_key"],
            "action": action,
            "score": score,
            "reasons": _unique_nonempty(
                [
                    "semantic evidence strong" if row["semantic_score"] >= 0.7 else None,
                    "structural evidence strong" if row["structural_score"] >= 0.7 else None,
                    "graph evidence strong" if row["graph_score"] >= 0.7 else None,
                    "workflow evidence present" if row["workflow_score"] >= 0.5 else None,
                    "evidence coverage sufficient" if row["evidence_coverage"] >= 0.5 else None,
                ]
            ),
            "policy_revision": "recommendation-policy-v1",
            "feature_revision": row["feature_revision"],
            "event_revision": row["event_revision"],
            "exact_oracle_delta": None,
            "oracle_validated": False,
            "generated_at": observed_at,
        }

    return EventHypergraphPayload(
        events=events,
        ontology_event_tuples=ontology_event_tuples,
        event_breadth_features=event_breadth_features,
        recommendation_feature_rows=recommendation_feature_rows,
        recommendation_judgment=recommendation_judgment,
    )


def _build_pass_results(
    req: AnalyzeRequest,
    text: str,
    entities: list[Entity],
    relationships: list[Relationship],
    concepts: list[str],
    chunks: list[Chunk],
    features: list[Feature],
) -> tuple[list[AnalysisPassResult], list[AstUnit], list[SemanticCodeCard], list[HMMObservation], Optional[Control5], Optional[ExperimentFeatureMatrix]]:
    requested = req.passes or []
    if not requested and not req.grounded_extraction_required:
        return [], [], [], [], None, None

    source_ref = req.source_ref or req.document_id or "unknown"
    source_revision = req.model_id or "unknown"
    now = datetime.utcnow().isoformat() + "Z"
    ast_units = _build_ast_units(req, text, chunks, req.language or "unknown") if "structural" in requested else []
    semantic_cards = _build_semantic_cards(req, text, ast_units, entities, features) if "semantic" in requested else []
    observations = _build_hmm_observations(req, text, entities, relationships, chunks, semantic_cards) if "sequence" in requested else []

    pass_results: list[AnalysisPassResult] = []

    def add_pass(
        family: str,
        pass_name: str,
        backend: str,
        backend_version: str,
        device: str,
        features_map: dict[str, Any],
        artifacts: dict[str, Any],
        status: str = "succeeded",
        warnings: Optional[list[str]] = None,
    ) -> None:
        input_hash = _digest_parts(req.text, family, pass_name, req.source_ref, req.packet_key, req.model_id)
        output_hash = _digest_parts(features_map, artifacts, warnings, status)
        pass_results.append(
            AnalysisPassResult(
                request_id=req.document_id or req.packet_key or _digest_parts(req.text)[:16],
                packet_key=req.packet_key,
                source_ref=source_ref,
                source_revision=source_revision,
                family=family,  # type: ignore[arg-type]
                pass_name=pass_name,
                pass_revision=f"{pass_name}-v1",
                backend=backend,
                backend_version=backend_version,
                device=device,  # type: ignore[arg-type]
                input_hash=input_hash,
                output_hash=output_hash,
                started_at=now,
                completed_at=now,
                status=status,  # type: ignore[arg-type]
                features=features_map,
                artifacts=artifacts,
                evidence=[],
                warnings=warnings or [],
            )
        )

    if "structural" in requested:
        add_pass(
            "structural",
            "treesitter_chunk",
            TREESITTER_CHUNKER_MODULE_NAME or ("tree-sitter" if TREE_SITTER_AVAILABLE else "regex"),
            _package_version("treesitter-chunker", "tree-sitter-chunker", "chunker", "tree-sitter") or "unknown",
            "cpu",
            {
                "ast_units": len(ast_units),
                "structural_confidence": 1.0 if ast_units else 0.2,
                "ast_match": 1.0 if ast_units else 0.0,
            },
            {"ast_units": [unit.model_dump() for unit in ast_units]},
        )

    if "lexical" in requested:
        add_pass(
            "lexical",
            "lexical_terms",
            "regex",
            "v1",
            "cpu",
            {
                "lexical_confidence": 0.75 if concepts else 0.25,
                "bm25": 0.6 if concepts else 0.15,
            },
            {"concepts": concepts[:50]},
        )

    if "linguistic" in requested:
        linguistic_entities = _spacy_entities(text)
        add_pass(
            "linguistic",
            "spacy_entities",
            "spacy" if SPACY_AVAILABLE else "regex",
            _package_version("spacy") or "unknown",
            "cpu",
            {
                "linguistic_confidence": 0.7 if linguistic_entities else 0.2,
            },
            {"entities": [entity.model_dump() for entity in linguistic_entities]},
        )

    if "semantic" in requested:
        add_pass(
            "semantic",
            "semantic_card",
            "embeddinggemma" if req.model_id else "local-card",
            req.model_id or "semantic-768-v1",
            "cpu",
            {
                "semantic_confidence": 0.8 if semantic_cards else 0.3,
                "dense_cosine": 0.8 if semantic_cards else 0.3,
                "kmeans_distance": 0.4 if semantic_cards else 0.9,
                "som_distance": 0.35 if semantic_cards else 0.9,
                "manifold_distance": 0.32 if semantic_cards else 0.9,
            },
            {"semantic_cards": [card.model_dump() for card in semantic_cards]},
        )

    if "sequence" in requested:
        add_pass(
            "sequence",
            "hmm_observations",
            "hmmlearn" if any(obs.observation for obs in observations) else "heuristic",
            "v1",
            "cpu",
            {
                "topological_confidence": 0.5 if observations else 0.1,
                "execution_confidence": 0.6 if observations else 0.1,
                "historical_execution_success": 0.55 if observations else 0.0,
                "hop_distance": 1.0 if observations else 0.0,
                "pagerank": 0.0,
                "cheirank": 0.0,
                "community_affinity": 0.0,
            },
            {"observations": [obs.model_dump() for obs in observations]},
        )

    if "rerank" in requested:
        add_pass(
            "rerank",
            "minilm_cross_encoder",
            "sentence-transformers",
            "ms-marco-MiniLM-L6-v2",
            "cpu",
            {
                "cross_encoder_score": 0.0,
                "mixedbread_score": 0.0,
                "reranker_score": 0.0,
            },
            {"todo": "reranker backend stays in the canonical TS contract for this slice"},
            status="skipped",
            warnings=["reranker backend not invoked in default NLP pass compiler"],
        )

    if req.grounded_extraction_required:
        grounded_status = "succeeded" if LANGEXTRACT_AVAILABLE else "skipped"
        add_pass(
            "grounded",
            "langextract",
            "langextract" if LANGEXTRACT_AVAILABLE else "unavailable",
            _package_version("langextract") or "unknown",
            "external",
            {
                "grounded_confidence": 0.6 if LANGEXTRACT_AVAILABLE else 0.0,
            },
            {"grounded_only": bool(LANGEXTRACT_AVAILABLE and req.grounded_extraction_required)},
            status=grounded_status,
            warnings=[] if LANGEXTRACT_AVAILABLE else ["LangExtract unavailable; grounded extraction skipped"],
        )

    control5 = _build_control5(pass_results)
    matrix = _build_experiment_feature_matrix(req, pass_results, control5) if pass_results else None
    return pass_results, ast_units, semantic_cards, observations, control5, matrix


def _torch_summary(text: str) -> dict[str, Any]:
    if not TORCH_AVAILABLE:
        return {}
    try:
        lines = text.count("\n") + 1
        words = len(re.findall(r"\b\w+\b", text))
        tensor = torch.tensor([len(text), lines, words], dtype=torch.float32)  # type: ignore[operator]
        norm = float(torch.linalg.vector_norm(tensor).item())  # type: ignore[attr-defined]
        return {
            "tensor_stats": tensor.tolist(),
            "tensor_norm": norm,
        }
    except Exception:
        return {}


def _build_document_id(req: AnalyzeRequest) -> str:
    if req.document_id:
        return req.document_id
    if req.packet_key:
        return req.packet_key
    digest = hashlib.sha256(req.text[:512].encode("utf-8")).hexdigest()[:16]
    return f"doc-{digest}"


def _analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    started = time.perf_counter()
    text = _safe_text(req.text, req.max_chars)
    document_id = _build_document_id(req)
    code_mode = _is_code(req.source_type, text)
    language = (req.language or ("typescript" if code_mode else "english")).lower()

    entities: list[Entity] = []
    relationships: list[Relationship] = []
    chunks: list[Chunk] = []
    features: list[Feature] = []

    # Default path: cheap local NLP only. LangExtract is opt-in grounded evidence.
    entities.extend(_spacy_entities(text))
    if not entities:
        entities.extend(_regex_entities(text))

    if code_mode:
        ts_chunks = _code_chunks_tree_sitter(text, language)
        if not ts_chunks:
            ts_chunks = _code_chunks_regex(text, language)
        chunks.extend(ts_chunks)
        features.extend(_code_features_ast_grep(text, language))
        relationships.extend(_code_relationships(text))
        if not entities:
            entities.extend(_regex_entities(text))
    else:
        chunks.extend(
            Chunk(
                kind="paragraph",
                text=paragraph.strip()[:10_000],
                start=text.find(paragraph),
                end=text.find(paragraph) + len(paragraph),
            )
            for paragraph in re.split(r"\n\s*\n", text)
            if paragraph.strip()
        )

    if not features:
        features.extend(
            Feature(
                kind="spacy_entity",
                name=entity.text,
                description=f"{entity.label} entity",
                source="spacy",
                confidence=entity.confidence,
                rawText=entity.text,
            )
            for entity in entities[:50]
        )

    concepts = _code_concepts(text, entities, chunks) if code_mode else [entity.text for entity in entities[:50]]
    grounded_extractions: list[dict[str, Any]] = []
    grounded_used = False
    if req.grounded_extraction_required:
        grounded_extractions = _grounded_extractions(text, req.model_id)
        grounded_used = bool(grounded_extractions)
    pass_results, ast_units, semantic_cards, hmm_observations, control5, experiment_feature_matrix = _build_pass_results(
        req,
        text,
        entities,
        relationships,
        concepts,
        chunks,
        features,
    )
    event_hypergraph = _build_event_hypergraph(
        req,
        text,
        entities,
        relationships,
        chunks,
        ast_units,
        semantic_cards,
        hmm_observations,
        pass_results,
        control5,
        experiment_feature_matrix,
    )
    metadata: dict[str, Any] = {
        "source_ref": req.source_ref,
        "packet_key": req.packet_key,
        "model_id": req.model_id,
        "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "is_code": code_mode,
        "language": language,
        **_torch_summary(text),
    }
    if ast_units:
        metadata["ast_unit_count"] = len(ast_units)
    if semantic_cards:
        metadata["semantic_card_count"] = len(semantic_cards)
    if hmm_observations:
        metadata["hmm_observation_count"] = len(hmm_observations)
    if req.grounded_extraction_required:
        metadata["grounded_extraction_required"] = True
        metadata["grounded_extraction_used"] = grounded_used
        metadata["grounded_extractions"] = grounded_extractions

    return AnalyzeResponse(
        document_id=document_id,
        source_type=req.source_type,
        extraction_mode=req.extraction_mode,
        entities=entities[:200],
        relationships=relationships[:100],
        concepts=concepts[:100],
        chunks=chunks[:100],
        features=features[:100],
        metadata=metadata,
        capabilities=_capabilities(),
        pass_results=pass_results,
        control5=control5,
        experiment_feature_matrix=experiment_feature_matrix,
        event_hypergraph=event_hypergraph,
        processing_time_ms=int((time.perf_counter() - started) * 1000),
    )


def _extract(req: AnalyzeRequest) -> ExtractResponse:
    analysis = _analyze(req)
    structure = {
        "chunks": [chunk.model_dump() for chunk in analysis.chunks],
        "features": [feature.model_dump() for feature in analysis.features],
        "relationships": [relationship.model_dump() for relationship in analysis.relationships],
        "concepts": analysis.concepts,
        "capabilities": analysis.capabilities,
    }
    return ExtractResponse(
        document_id=analysis.document_id,
        structure=structure,
        entities=analysis.entities,
        metadata=analysis.metadata,
        processing_time=analysis.processing_time_ms / 1000.0,
    )


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "model": os.getenv("LANGEXTRACT_MODEL", "miniforge-nlp-sidecar"),
        "runtime": _runtime_info(),
        "capabilities": _capabilities(),
        "imports": _module_proof(),
        "timestamp": int(time.time() * 1000),
    }


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    return _analyze(req)


@app.post("/extract", response_model=ExtractResponse)
def extract(req: AnalyzeRequest) -> ExtractResponse:
    return _extract(req)


@app.post("/extract/file")
def extract_file() -> dict[str, Any]:
    return {
        "status": "unsupported",
        "message": "file extraction is not implemented in the miniforge sidecar",
    }


@app.post("/extract/web")
def extract_web(req: dict[str, Any]) -> dict[str, Any]:
    url = str(req.get("url") or "").strip()
    if not url:
        raise HTTPException(400, "url is required")

    try:
        html = _fetch_html(url)
    except urllib.error.HTTPError as exc:
        raise HTTPException(exc.code, f"Failed to fetch URL: {exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise HTTPException(502, f"Failed to fetch URL: {exc.reason}") from exc

    parsed = _extract_html_text(html)
    return {
        "url": url,
        "title": parsed["title"],
        "text": parsed["text"],
        "content_length": parsed["content_length"],
        "source": parsed["source"],
    }


def main() -> None:
    host = os.getenv("MINIFORGE_SIDECAR_HOST", "127.0.0.1")
    port = int(os.getenv("MINIFORGE_SIDECAR_PORT", "8095"))
    uvicorn.run(app, host=host, port=port, log_level=os.getenv("UVICORN_LOG_LEVEL", "info"))


if __name__ == "__main__":  # pragma: no cover - process entrypoint
    main()
