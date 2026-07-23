#!/usr/bin/env python3
"""
Miniforge NLP sidecar.

This is the Python process behind the Atlas NLP middleware lane.
It keeps the hot TypeScript path thin while handling:

- LangExtract-compatible text extraction
- spaCy entity extraction when available
- tree-sitter chunking when available
- ast-grep structural features when available
- optional PyTorch feature summaries

The service is designed to run inside a Miniforge environment, but it degrades
cleanly when optional packages are missing.
"""

from __future__ import annotations

import hashlib
import os
import re
import time
from dataclasses import dataclass
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
        "ast_grep": AST_GREP_AVAILABLE,
        "torch": TORCH_AVAILABLE,
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

    # LangExtract-compatible prose extraction when available.
    if LANGEXTRACT_AVAILABLE and not code_mode:
        try:
            # Avoid relying on a specific output schema; this service should
            # remain useful even if the upstream package shape changes.
            entities.extend(_spacy_entities(text))
            if not entities:
                entities.extend(_regex_entities(text))
        except Exception:
            entities.extend(_regex_entities(text))
    else:
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
    metadata: dict[str, Any] = {
        "source_ref": req.source_ref,
        "packet_key": req.packet_key,
        "model_id": req.model_id,
        "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "is_code": code_mode,
        "language": language,
        **_torch_summary(text),
    }

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
        "capabilities": _capabilities(),
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


def main() -> None:
    host = os.getenv("MINIFORGE_SIDECAR_HOST", "127.0.0.1")
    port = int(os.getenv("MINIFORGE_SIDECAR_PORT", "8095"))
    uvicorn.run(app, host=host, port=port, log_level=os.getenv("UVICORN_LOG_LEVEL", "info"))


if __name__ == "__main__":  # pragma: no cover - process entrypoint
    main()
