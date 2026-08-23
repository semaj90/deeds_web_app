#!/usr/bin/env python3
"""Parent Atlas 8095 provenance-preserving facade.

This facade intentionally reuses the existing ``miniforge_nlp_sidecar``
analysis implementation while replacing the two boundaries that were still
lossy:

* ``/ast/chunk`` passes through native Consiliency treesitter-chunker
  ``node_id``, ``file_id``, ``symbol_id``, ``chunk_id``, hierarchy and spans.
* grounded LangExtract metadata exposes native ``char_interval`` and
  ``alignment_status``.

Neither boundary creates Atlas canonical identity. GIS remains the only symbol
promotion authority. Keeping this as a facade makes rollback to the legacy
entrypoint a one-line container change while the contracts are being proven.
"""

from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import miniforge_nlp_sidecar as legacy
from atlas_structural_provenance import (
    normalize_langextract_extraction,
    normalize_treesitter_chunker_chunk,
)


class AstEvidenceChunkV2(BaseModel):
    upstream_chunk_id: Optional[str] = None
    upstream_node_id: Optional[str] = None
    upstream_file_id: Optional[str] = None
    upstream_symbol_id: Optional[str] = None
    node_type: str
    kind: str
    name: Optional[str] = None
    parent_route: list[str] = Field(default_factory=list)
    parent_context: Optional[str] = None
    start_byte: int
    end_byte: int
    start_line: int
    start_column: int
    end_line: int
    end_column: int
    calls: list[str] = Field(default_factory=list)
    imports: list[str] = Field(default_factory=list)
    exports: list[str] = Field(default_factory=list)


class AstEvidenceResponseV2(BaseModel):
    schema: Literal["atlas.ast.evidence.v1"]
    engine: str
    engine_version: str
    language: str
    file_path: str
    source_revision: str
    chunks: list[AstEvidenceChunkV2]
    edges: list[legacy.AstEvidenceEdge] = Field(default_factory=list)
    diagnostics: list[str] = Field(default_factory=list)
    error_tag: Optional[Literal["ChunkingError", "UnsupportedLanguageError"]] = None
    syntax_status: Literal["CLEAN", "RECOVERED_WITH_ERRORS"] = "CLEAN"


app = FastAPI(
    title="Parent Atlas NLP Sidecar",
    version="2.0.0",
    description="Provenance-preserving Consiliency + LangExtract facade over the Atlas NLP sidecar",
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
    response.headers["x-atlas-sidecar-contract"] = "provenance-v2"
    return response


def _native_grounded_extractions(text: str, model_id: Optional[str] = None) -> list[dict[str, Any]]:
    """Run LangExtract and retain its actual grounding/alignment metadata."""

    if not legacy.LANGEXTRACT_AVAILABLE or legacy.langextract is None:
        return []
    try:
        extract_fn = getattr(legacy.langextract, "extract", None)
        if extract_fn is None:
            return []
        result = getattr(extract_fn, "extract", extract_fn)(
            text,
            prompt_description="Extract grounded evidence for Parent Atlas. Return exact source-backed spans only.",
            model_id=model_id or os.getenv("LANGEXTRACT_MODEL", "miniforge-nlp-sidecar"),
        )
    except Exception:
        return []

    extracted: list[dict[str, Any]] = []
    for item in (getattr(result, "extractions", None) or [])[:50]:
        normalized = normalize_langextract_extraction(item)
        interval = normalized.get("char_interval")
        if not normalized.get("extraction_text") or interval is None:
            continue
        start_pos = int(interval["start_pos"])
        end_pos = int(interval["end_pos"])
        if start_pos < 0 or end_pos <= start_pos or end_pos > len(text):
            continue
        extracted.append(
            {
                # Compatibility aliases retained while current callers migrate.
                "class": normalized["extraction_class"],
                "text": normalized["extraction_text"],
                "start_char": start_pos,
                "end_char": end_pos,
                # Native LangExtract grounding contract.
                "extraction_class": normalized["extraction_class"],
                "extraction_text": normalized["extraction_text"],
                "char_interval": interval,
                "alignment_status": normalized.get("alignment_status"),
                "grounded": True,
                "attributes": normalized.get("attributes") or {},
            }
        )
    return extracted


# The existing _analyze() resolves this global at call time, so the facade can
# upgrade grounding without duplicating the rest of the NLP feature compiler.
legacy._grounded_extractions = _native_grounded_extractions


def _raw_chunk_file(source: str, language: str, file_path: str) -> tuple[list[Any], bool]:
    """Return raw chunks plus whether logical identity_path was honored.

    The temporary parser input is written as exact UTF-8 bytes. This is
    intentional: Consiliency/Tree-sitter spans are byte coordinates, so text
    mode newline translation (notably CRLF -> LF on Windows) would make the
    returned offsets refer to bytes different from the request source.

    If an older treesitter-chunker API rejects ``identity_path`` we may still
    return structural evidence for search/diagnostics, but the response is
    explicitly degraded so Graphify cannot allow GIS promotion from potentially
    tempfile-affine upstream IDs.
    """

    module = legacy.TREESITTER_CHUNKER_MODULE
    chunk_file = getattr(module, "chunk_file", None) if module is not None else None
    if not callable(chunk_file):
        return [], False

    suffix_map = {
        "tsx": ".tsx",
        "typescriptreact": ".tsx",
        "typescript": ".ts",
        "javascript": ".js",
        "javascriptreact": ".jsx",
        "python": ".py",
        "rust": ".rs",
        "go": ".go",
        "java": ".java",
    }
    suffix = suffix_map.get(language.lower(), Path(file_path).suffix or ".txt")
    temp_path: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(mode="wb", suffix=suffix, delete=False) as handle:
            handle.write(source.encode("utf-8"))
            temp_path = handle.name
        try:
            return (
                list(
                    chunk_file(
                        temp_path,
                        language,
                        extract_metadata=True,
                        include_retrieval_metadata=True,
                        # Logical repository path is required for stable upstream
                        # identities; tempfile path must never be treated as proof.
                        identity_path=file_path,
                    )
                    or []
                ),
                True,
            )
        except TypeError:
            return list(chunk_file(temp_path, language=language) or []), False
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)


def _native_ast_evidence(req: legacy.AstChunkRequest) -> AstEvidenceResponseV2:
    diagnostics: list[str] = []
    language, language_error = legacy._resolve_ast_language(req.language, req.file_path)
    engine_version = legacy._package_version(
        "treesitter-chunker",
        "treesitter_chunker",
        "tree_sitter_chunker",
        "chunker",
    ) or "unknown"

    if language_error:
        return AstEvidenceResponseV2(
            schema="atlas.ast.evidence.v1",
            engine="treesitter-chunker",
            engine_version=engine_version,
            language=language,
            file_path=req.file_path,
            source_revision=req.source_revision,
            chunks=[],
            diagnostics=[language_error],
            error_tag="UnsupportedLanguageError",
            syntax_status="RECOVERED_WITH_ERRORS",
        )

    if not legacy.TREESITTER_CHUNKER_AVAILABLE:
        return AstEvidenceResponseV2(
            schema="atlas.ast.evidence.v1",
            engine="unavailable",
            engine_version="unknown",
            language=language,
            file_path=req.file_path,
            source_revision=req.source_revision,
            chunks=[],
            diagnostics=["treesitter-chunker is unavailable; no replacement evidence was produced"],
            error_tag="ChunkingError",
            syntax_status="RECOVERED_WITH_ERRORS",
        )

    identity_path_preserved = False
    try:
        raw_chunks, identity_path_preserved = _raw_chunk_file(req.source, language, req.file_path)
    except Exception as exc:
        raw_chunks = []
        diagnostics.append(f"ChunkingError: treesitter-chunker extraction failed: {exc}")

    if raw_chunks and not identity_path_preserved:
        diagnostics.append(
            "CONSILIENCY_IDENTITY_PATH_UNPROVEN: chunker API rejected identity_path; upstream IDs may be tempfile-affine and are not promotable"
        )

    diagnostics.extend(legacy._syntax_diagnostics(req.source, language))
    evidence_chunks: list[AstEvidenceChunkV2] = []
    dependencies_by_chunk: list[list[str]] = []

    for raw in raw_chunks:
        normalized = normalize_treesitter_chunker_chunk(raw)
        start = normalized.get("byte_start")
        end = normalized.get("byte_end")
        start_line = normalized.get("start_line")
        end_line = normalized.get("end_line")
        if start is None or end is None:
            if start_line is None or end_line is None:
                diagnostics.append("ChunkingError: chunk missing both byte and line spans")
                continue
            start, end = legacy._line_span_to_offsets(req.source, int(start_line), int(end_line))
        start = max(0, int(start))
        end = max(start, int(end))
        start_row, start_column = legacy._offset_line_column(req.source, start)
        end_row, end_column = legacy._offset_line_column(req.source, end)
        node_type = str(normalized.get("node_type") or "fragment")

        evidence_chunks.append(
            AstEvidenceChunkV2(
                upstream_chunk_id=normalized.get("upstream_chunk_id"),
                upstream_node_id=normalized.get("upstream_node_id"),
                upstream_file_id=normalized.get("upstream_file_id"),
                upstream_symbol_id=normalized.get("upstream_symbol_id"),
                node_type=node_type,
                kind=legacy._structural_kind(node_type),
                name=normalized.get("name"),
                parent_route=list(normalized.get("parent_route") or []),
                parent_context=normalized.get("parent_context"),
                start_byte=start,
                end_byte=end,
                start_line=start_row,
                start_column=start_column,
                end_line=end_row,
                end_column=end_column,
                calls=list(normalized.get("calls") or []),
                imports=list(normalized.get("imports") or []),
                exports=list(normalized.get("exports") or []),
            )
        )
        dependencies_by_chunk.append(list(normalized.get("dependencies") or []))

    if not evidence_chunks:
        diagnostics.append("treesitter-chunker returned no structural chunks")

    edges: list[legacy.AstEvidenceEdge] = []
    seen_edges: set[tuple[str, str, str, int]] = set()
    file_key = next((chunk.upstream_file_id for chunk in evidence_chunks if chunk.upstream_file_id), None)
    if not file_key:
        file_key = f"file:{req.file_path.replace('\\', '/')}"

    def add_edge(
        source_key: str,
        target_key: str,
        edge_type: Literal["DEFINES", "IMPORTS", "EXPORTS", "CALLS", "REFERENCES"],
        chunk: AstEvidenceChunkV2,
        *,
        resolved: bool,
        resolution: str,
    ) -> None:
        candidate = (source_key, target_key, edge_type, chunk.start_line)
        if candidate in seen_edges:
            return
        seen_edges.add(candidate)
        edges.append(
            legacy.AstEvidenceEdge(
                from_evidence_key=source_key,
                to_evidence_key=target_key,
                type=edge_type,
                evidence_start_line=chunk.start_line,
                evidence_start_column=chunk.start_column,
                evidence_end_line=chunk.end_line,
                evidence_end_column=chunk.end_column,
                resolved=resolved,
                resolution=resolution,
            )
        )

    for index, chunk in enumerate(evidence_chunks):
        structural_key = chunk.upstream_symbol_id or chunk.upstream_node_id or chunk.upstream_chunk_id
        if structural_key and chunk.kind not in {"import", "export"} and chunk.name:
            add_edge(file_key, structural_key, "DEFINES", chunk, resolved=True, resolution="native_chunk")
        source_key = structural_key or file_key
        for value in chunk.imports:
            add_edge(file_key, value, "IMPORTS", chunk, resolved=False, resolution="syntax_only")
        for value in chunk.exports:
            add_edge(file_key, value, "EXPORTS", chunk, resolved=False, resolution="syntax_only")
        for value in chunk.calls:
            add_edge(source_key, value, "CALLS", chunk, resolved=False, resolution="unresolved_target")
        for value in dependencies_by_chunk[index] if index < len(dependencies_by_chunk) else []:
            add_edge(source_key, value, "REFERENCES", chunk, resolved=False, resolution="unresolved_target")

    if not edges:
        fallback_edges, edge_diagnostics = legacy._symbol_graph_evidence(req.source, language, req.file_path)
        edges.extend(fallback_edges)
        diagnostics.extend(edge_diagnostics)

    return AstEvidenceResponseV2(
        schema="atlas.ast.evidence.v1",
        engine="treesitter-chunker",
        engine_version=engine_version,
        language=language,
        file_path=req.file_path,
        source_revision=req.source_revision,
        chunks=evidence_chunks,
        edges=edges,
        diagnostics=diagnostics,
        error_tag="ChunkingError" if any(item.startswith("ChunkingError:") for item in diagnostics) else None,
        syntax_status="RECOVERED_WITH_ERRORS" if diagnostics else "CLEAN",
    )


@app.get("/health")
def health() -> dict[str, Any]:
    result = dict(legacy.health())
    result["contract"] = "provenance-v2"
    return result


@app.get("/capabilities")
def capabilities() -> dict[str, Any]:
    result = dict(legacy.capabilities())
    result["structuralProvenance"] = {
        "nativeConsiliencyIds": True,
        "identityPathRequiredForPromotion": True,
        "langextractCharInterval": True,
        "langextractAlignmentStatus": True,
        "canonicalIdentityAuthority": False,
    }
    return result


@app.post("/ast/chunk", response_model=AstEvidenceResponseV2)
def ast_chunk(req: legacy.AstChunkRequest) -> AstEvidenceResponseV2:
    return _native_ast_evidence(req)


@app.post("/analyze", response_model=legacy.AnalyzeResponse)
def analyze(req: legacy.AnalyzeRequest) -> legacy.AnalyzeResponse:
    return legacy._analyze(req)


@app.post("/extract", response_model=legacy.ExtractResponse)
def extract(req: legacy.AnalyzeRequest) -> legacy.ExtractResponse:
    return legacy._extract(req)


@app.post("/extract/file")
def extract_file() -> dict[str, Any]:
    return legacy.extract_file()


@app.post("/extract/web")
def extract_web(req: dict[str, Any]) -> dict[str, Any]:
    return legacy.extract_web(req)


def main() -> None:
    import uvicorn

    host = os.getenv("MINIFORGE_SIDECAR_HOST", "127.0.0.1")
    port = int(os.getenv("MINIFORGE_SIDECAR_PORT", "8095"))
    uvicorn.run(app, host=host, port=port, log_level=os.getenv("UVICORN_LOG_LEVEL", "info"))


if __name__ == "__main__":
    main()
