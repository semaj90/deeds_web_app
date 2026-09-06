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
import hashlib
import json
import re
import tempfile
import time
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import miniforge_nlp_sidecar as legacy
import atlas_external_docs as external_docs
from atlas_structural_provenance import (
    find_occurrence_positions,
    normalize_langextract_extraction,
    normalize_treesitter_chunker_chunk,
    occurrence_to_absolute_position,
)
from atlas_treesitter_span_compat import resolve_chunk_byte_span


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


class WebEvidenceRequestV1(BaseModel):
    """Bounded, read-only external evidence request for agentic repair context."""

    url: str = Field(..., min_length=8, max_length=4_096)
    provider: Literal["BEAUTIFULSOUP_HTTP", "FIRECRAWL_V2"] = "BEAUTIFULSOUP_HTTP"
    maximum_chars: int = Field(default=3_000, ge=500, le=20_000)
    overlap_chars: int = Field(default=300, ge=0, le=2_000)
    maximum_chunks: int = Field(default=10, ge=1, le=40)


class WebEvidenceResponseV1(BaseModel):
    schema: Literal["atlas.external-web-evidence.v1"]
    fetcher: str
    source_id: str
    source_revision: str
    title: str
    document_checksum: str
    chunks: list[dict[str, Any]]
    truncated: bool
    canonical_authority: Literal[False] = False
    writes_performed: Literal[False] = False


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

    legacy._grounded_extraction_error = None
    if not legacy.LANGEXTRACT_AVAILABLE or legacy.langextract is None:
        legacy._grounded_extraction_error = "LANGEXTRACT_UNAVAILABLE"
        return []
    try:
        # The v2 facade is the active container entrypoint. Reuse the proven
        # provider shim so schema/no-thinking/cache controls reach llama.cpp.
        legacy._ensure_grounded_provider_controls()
        extract_fn = getattr(legacy.langextract, "extract", None)
        if extract_fn is None:
            legacy._grounded_extraction_error = "LANGEXTRACT_EXTRACT_FUNCTION_UNAVAILABLE"
            return []
        data_module = getattr(legacy.langextract, "data", None)
        example_data = getattr(data_module, "ExampleData", None)
        extraction_type = getattr(data_module, "Extraction", None)
        examples = None
        if example_data is not None and extraction_type is not None:
            examples = [
                example_data(
                    text="This module uses PostgreSQL for persistence.",
                    extractions=[
                        extraction_type(
                            extraction_class="CONCEPT",
                            extraction_text="PostgreSQL",
                            attributes={"concept_id": "DATABASE"},
                        )
                    ],
                )
            ]
        selected_model = model_id or os.getenv("LANGEXTRACT_MODEL", "miniforge-nlp-sidecar")
        extraction_max_tokens = int(os.getenv("LANGEXTRACT_MAX_TOKENS", "256"))
        extraction_reasoning_budget = int(os.getenv("LANGEXTRACT_REASONING_BUDGET", "0"))
        factory = getattr(legacy.langextract, "factory", None)
        model_config_type = getattr(factory, "ModelConfig", None)
        extract_kwargs: dict[str, Any] = {
            "text_or_documents": text,
            "prompt_description": "Extract grounded evidence for Parent Atlas. Return exact source-backed spans only.",
            "examples": examples,
            "extraction_passes": 1,
            "max_workers": 1,
            "max_char_buffer": 2000,
            "temperature": 0.0,
        }
        if model_config_type is not None:
            from langextract.providers.schemas.openai import OpenAISchema  # type: ignore

            extract_kwargs["config"] = model_config_type(
                model_id=selected_model,
                provider="openai",
                provider_kwargs={
                    "api_key": os.getenv("LANGEXTRACT_API_KEY", "local"),
                    "base_url": os.getenv("LANGEXTRACT_BASE_URL", "http://host.docker.internal:8090/v1"),
                    # NOTE: OpenAILanguageModel._build_chat_completions_params() reads
                    # config['max_output_tokens'], not 'max_tokens' -- confirmed by reading
                    # langextract's provider source directly (2026-09-04 DOC-10 investigation).
                    # The old 'max_tokens' key was silently dropped on every call; the request
                    # went out with no token limit at all rather than the intended cap.
                    "max_output_tokens": extraction_max_tokens,
                    "reasoning_format": "none",
                    "reasoning_budget": extraction_reasoning_budget,
                    "chat_template_kwargs": {"enable_thinking": False},
                    "seed": 1729,
                    "top_p": 1.0,
                    "reasoning_effort": "none",
                    "cache_prompt": False,
                    "openai_schema": OpenAISchema(
                        legacy._grounded_output_schema(),
                        schema_name="atlas_grounded_extraction_v1",
                        strict=True,
                        from_output_schema=True,
                    ),
                },
            )
        else:
            extract_kwargs["model_id"] = selected_model
            extract_kwargs["model_url"] = os.getenv("LANGEXTRACT_BASE_URL", "http://host.docker.internal:8090/v1")
        # 2026-09-04 DOC-10/DOC-12 finding: LangExtract flattens prompt_description + examples
        # into one literal "Q:/A:" text block, which ornith-1.5-9b fails to extract from
        # reliably (verified live, both schemas). Hand the structured examples/description to
        # legacy's build_params() patch so it rebuilds a real multi-turn request instead.
        try:
            legacy._set_grounded_extraction_context(extract_kwargs["prompt_description"], examples)
            result = getattr(extract_fn, "extract", extract_fn)(**extract_kwargs)
        finally:
            legacy._clear_grounded_extraction_context()
    except Exception as error:
        # Preserve a redacted diagnostic in the response metadata. The old
        # behavior returned an empty list, making provider/runtime failures
        # indistinguishable from a valid zero-extraction result.
        legacy._grounded_extraction_error = f"{type(error).__name__}: {str(error)[:240]}"
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


# DOC-10/DOC-12 (parent-atlas-versioned-doc-intelligence): design.md's DocumentationFactV1 --
# genuinely semantic material only (capability, constraint, deprecation, supported-architecture
# claims, performance recommendations, incompatibility, migration advice), never structure a
# deterministic parser already extracts exactly (headings, code fences, function signatures --
# those are atlas_external_docs.py's DOC-04/DOC-05 job, not this one's). A sibling of
# _native_grounded_extractions() above, mirroring its exact pattern (OpenAISchema strict JSON
# schema, host.docker.internal base_url, few-shot examples, legacy._ensure_grounded_provider_controls()
# reuse for the Ornith no-thinking/no-cache_prompt provider patch) -- deliberately NOT a second
# process/module, so that process-global patch is never silently missed.
_DOCUMENTATION_FACT_PROMPT = (
    "Extract only genuinely semantic documentation claims explicitly present in the supplied "
    "source text for Parent Atlas: capability, constraint, deprecation, supported-architecture "
    "claims, performance recommendations, incompatibility, or migration advice. Do not extract "
    "structure a deterministic parser already handles exactly (headings, code fences, function "
    "signatures, tables). For each claim, return extraction_class DOCUMENTATION_FACT with "
    "extraction_text copied verbatim as one contiguous substring that is the exact evidence span, "
    "For ordinary claims use extraction_class DOCUMENTATION_FACT with attributes subject, predicate, "
    "object, statement and confidence. For versioned API guidance use extraction_class API_RULE with "
    "attributes apiSymbol, versionRange, condition, recommendation, parameterName, expectedValue and "
    "confidence. Never infer a claim not explicitly stated in the text. If no "
    "exact source span supports a claim, return an empty extractions array."
)


def _documentation_fact_output_schema() -> dict[str, Any]:
    item_schema = legacy.langextract.schema.extraction_item_schema(  # type: ignore[union-attr]
        "DOCUMENTATION_FACT",
        attributes={
            "subject": {"type": "string"},
            "predicate": {"type": "string"},
            "object": {"type": "string"},
            "statement": {"type": "string"},
            "confidence": {"type": "number"},
        },
        additional_properties=False,
    )
    return legacy.langextract.schema.extractions_schema(item_schema, additional_properties=False)  # type: ignore[union-attr]


def _documentation_output_schema() -> dict[str, Any]:
    """One LangExtract envelope containing fact and API-rule item shapes."""

    fact = legacy.langextract.schema.extraction_item_schema(
        "DOCUMENTATION_FACT",
        attributes={
            "subject": {"type": "string"},
            "predicate": {"type": "string"},
            "object": {"type": "string"},
            "statement": {"type": "string"},
            "confidence": {"type": "number"},
        },
        additional_properties=False,
    )
    rule = legacy.langextract.schema.extraction_item_schema(
        "API_RULE",
        attributes={
            "apiSymbol": {"type": "string"},
            "versionRange": {"type": "string"},
            "condition": {"type": "string"},
            "recommendation": {"type": "string"},
            "parameterName": {"type": ["string", "null"]},
            "expectedValue": {"type": ["string", "null"]},
            "confidence": {"type": "number"},
        },
        additional_properties=False,
    )
    return legacy.langextract.schema.extractions_schema(fact, rule, additional_properties=False)  # type: ignore[union-attr]


def _native_documentation_facts(text: str, model_id: Optional[str] = None) -> list[dict[str, Any]]:
    """Same provider/grounding machinery as _native_grounded_extractions(), a different
    prompt/schema/output shape, and -- unlike that function -- an explicit exact-match span
    check: design.md requires exact alignment before a fuzzy fallback would even be considered,
    and DocumentationFactV1's evidenceText is meant to be verbatim-quotable, unlike CONCEPT's
    looser grounding tolerance."""

    legacy._grounded_extraction_error = None
    if not legacy.LANGEXTRACT_AVAILABLE or legacy.langextract is None:
        legacy._grounded_extraction_error = "LANGEXTRACT_UNAVAILABLE"
        return []
    try:
        legacy._ensure_grounded_provider_controls()
        extract_fn = getattr(legacy.langextract, "extract", None)
        if extract_fn is None:
            legacy._grounded_extraction_error = "LANGEXTRACT_EXTRACT_FUNCTION_UNAVAILABLE"
            return []
        data_module = getattr(legacy.langextract, "data", None)
        example_data = getattr(data_module, "ExampleData", None)
        extraction_type = getattr(data_module, "Extraction", None)
        examples = None
        if example_data is not None and extraction_type is not None:
            examples = [
                example_data(
                    text="CUDA Tile IR requires sm_86 or later architecture.",
                    extractions=[
                        extraction_type(
                            extraction_class="DOCUMENTATION_FACT",
                            extraction_text="CUDA Tile IR requires sm_86 or later architecture.",
                            attributes={
                            "subject": "CUDA Tile IR",
                            "predicate": "requires",
                            "object": "sm_86 or later architecture",
                            "statement": "CUDA Tile IR requires sm_86 or later architecture.",
                            "confidence": 0.95,
                            },
                        )
                    ],
                ),
                example_data(
                    text="In version 2.0, use Graph.from_cudf_edgelist with renumber=true.",
                    extractions=[
                        extraction_type(
                            extraction_class="API_RULE",
                            extraction_text="In version 2.0, use Graph.from_cudf_edgelist with renumber=true.",
                            attributes={
                                "apiSymbol": "Graph.from_cudf_edgelist",
                                "versionRange": "2.0",
                                "condition": "version 2.0",
                                "recommendation": "use Graph.from_cudf_edgelist with renumber=true",
                                "parameterName": "renumber",
                                "expectedValue": "true",
                                "confidence": 0.95,
                            },
                        )
                    ],
                ),
            ]
        selected_model = model_id or os.getenv("LANGEXTRACT_MODEL", "miniforge-nlp-sidecar")
        extraction_max_tokens = int(os.getenv("LANGEXTRACT_MAX_TOKENS", "256"))
        extraction_reasoning_budget = int(os.getenv("LANGEXTRACT_REASONING_BUDGET", "0"))
        factory = getattr(legacy.langextract, "factory", None)
        model_config_type = getattr(factory, "ModelConfig", None)
        extract_kwargs: dict[str, Any] = {
            "text_or_documents": text,
            "prompt_description": _DOCUMENTATION_FACT_PROMPT,
            "examples": examples,
            # ModelConfig alone leaves LangExtract in its example-derived
            # schema path. The explicit envelope is required for the live
            # OpenAI-compatible llama-server provider.
            "output_schema": _documentation_output_schema(),
            "extraction_passes": 1,
            "max_workers": 1,
            "max_char_buffer": 2000,
            "temperature": 0.0,
        }
        if model_config_type is not None:
            from langextract.providers.schemas.openai import OpenAISchema  # type: ignore

            extract_kwargs["config"] = model_config_type(
                model_id=selected_model,
                provider="openai",
                provider_kwargs={
                    "api_key": os.getenv("LANGEXTRACT_API_KEY", "local"),
                    "base_url": os.getenv("LANGEXTRACT_BASE_URL", "http://host.docker.internal:8090/v1"),
                    # NOTE: OpenAILanguageModel._build_chat_completions_params() reads
                    # config['max_output_tokens'], not 'max_tokens' -- confirmed by reading
                    # langextract's provider source directly (2026-09-04 DOC-10 investigation).
                    # The old 'max_tokens' key was silently dropped on every call; the request
                    # went out with no token limit at all rather than the intended cap.
                    "max_output_tokens": extraction_max_tokens,
                    "reasoning_format": "none",
                    "reasoning_budget": extraction_reasoning_budget,
                    "chat_template_kwargs": {"enable_thinking": False},
                    "seed": 1729,
                    "top_p": 1.0,
                    "reasoning_effort": "none",
                    "cache_prompt": False,
                },
            )
        else:
            extract_kwargs["model_id"] = selected_model
            extract_kwargs["model_url"] = os.getenv("LANGEXTRACT_BASE_URL", "http://host.docker.internal:8090/v1")
        # See the matching comment in _native_grounded_extractions() above: same multi-turn fix.
        try:
            legacy._set_grounded_extraction_context(extract_kwargs["prompt_description"], examples)
            result = getattr(extract_fn, "extract", extract_fn)(**extract_kwargs)
        finally:
            legacy._clear_grounded_extraction_context()
    except Exception as error:
        legacy._grounded_extraction_error = f"{type(error).__name__}: {str(error)[:240]}"
        return []

    extracted: list[dict[str, Any]] = []
    for item in (getattr(result, "extractions", None) or [])[:50]:
        normalized = normalize_langextract_extraction(item)
        interval = normalized.get("char_interval")
        extraction_text = normalized.get("extraction_text")
        if not extraction_text or interval is None:
            continue
        start_pos = int(interval["start_pos"])
        end_pos = int(interval["end_pos"])
        if start_pos < 0 or end_pos <= start_pos or end_pos > len(text):
            continue
        # Explicit exact-match check (see docstring) -- normalize_langextract_extraction()
        # alone doesn't enforce this for every alignment_status; DocumentationFactV1 requires it.
        if text[start_pos:end_pos] != str(extraction_text):
            continue
        attributes = normalized.get("attributes") or {}
        extraction_class = str(normalized.get("extraction_class") or "DOCUMENTATION_FACT").upper()
        subject = str(attributes.get("subject") or "").strip()
        predicate = str(attributes.get("predicate") or "").strip()
        obj = str(attributes.get("object") or "").strip()
        api_symbol = str(attributes.get("apiSymbol") or attributes.get("api_symbol") or "").strip()
        if extraction_class == "API_RULE" and not api_symbol:
            continue
        if extraction_class != "API_RULE" and (not subject or not predicate or not obj):
            continue
        try:
            confidence = float(attributes.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))
        extracted.append({
            "extraction_class": extraction_class,
            "subject": subject,
            "predicate": predicate,
            "object": obj,
            "statement": str(attributes.get("statement") or "").strip(),
            "evidence_text": str(extraction_text),
            "start_char": start_pos,
            "end_char": end_pos,
            "start_byte": len(text[:start_pos].encode("utf-8")),
            "end_byte": len(text[:end_pos].encode("utf-8")),
            "confidence": confidence,
            "api_symbol": api_symbol,
            "version_range": str(attributes.get("versionRange") or attributes.get("version_range") or "").strip(),
            "condition": str(attributes.get("condition") or "").strip(),
            "recommendation": str(attributes.get("recommendation") or "").strip(),
            "parameter_name": attributes.get("parameterName", attributes.get("parameter_name")),
            "expected_value": attributes.get("expectedValue", attributes.get("expected_value")),
        })
    return extracted


class DocumentationFactRequestV1(BaseModel):
    """Input to /extract/documentation-facts. sourceUrl/sourceRevision/productVersion bind
    the caller's DocCoordinateV1 identity through -- this route never invents identity."""

    text: str = Field(..., min_length=1, max_length=200_000)
    source_url: str = Field(..., alias="sourceUrl", min_length=1)
    source_revision: str = Field(..., alias="sourceRevision", min_length=1)
    product_version: str = Field(default="", alias="productVersion")
    model_id: Optional[str] = None

    model_config = {"populate_by_name": True}


class DocumentationFactV1(BaseModel):
    """design.md's DocumentationFactV1 -- source-grounded, never canonical on its own."""

    schema_: str = Field(default="atlas.documentation-fact.v1", alias="schema")
    subject: str
    predicate: str
    object: str
    statement: str
    evidence_text: str = Field(alias="evidenceText")
    source_url: str = Field(alias="sourceUrl")
    source_revision: str = Field(alias="sourceRevision")
    start_char: int = Field(alias="startChar")
    end_char: int = Field(alias="endChar")
    start_byte: int = Field(alias="startByte", ge=0)
    end_byte: int = Field(alias="endByte", ge=1)
    alignment_status: Literal["MATCH_EXACT", "MATCH_FUZZY", "MATCH_LESSER"] = Field(
        default="MATCH_EXACT", alias="alignmentStatus"
    )
    product_version: str = Field(alias="productVersion")
    confidence: float = Field(ge=0.0, le=1.0)
    extraction_method: str = Field(default="LANGEXTRACT_ORNITH", alias="extractionMethod")
    canonical_authority: bool = Field(default=False, alias="canonicalAuthority")

    model_config = {"populate_by_name": True}


class ApiRuleV1(BaseModel):
    """Source-grounded documentation-to-code guidance; never canonical by itself."""

    schema_: str = Field(default="atlas.api-rule.v1", alias="schema")
    api_symbol: str = Field(alias="apiSymbol")
    version_range: str = Field(alias="versionRange")
    condition: str
    recommendation: str
    parameter_name: Optional[str] = Field(default=None, alias="parameterName")
    expected_value: Optional[str] = Field(default=None, alias="expectedValue")
    evidence_span: dict[str, Any] = Field(alias="evidenceSpan")
    confidence: float = Field(ge=0.0, le=1.0)
    canonical_authority: bool = Field(default=False, alias="canonicalAuthority")

    model_config = {"populate_by_name": True}


class DocumentationFactResponseV1(BaseModel):
    facts: list[DocumentationFactV1]
    api_rules: list[ApiRuleV1] = Field(default_factory=list, alias="apiRules")
    model_id: Optional[str] = Field(default=None, alias="modelId")
    provider: str = "openai-compatible"
    producer_revision: str = Field(default="", alias="producerRevision")
    input_hash: str = Field(default="", alias="inputHash")
    output_hash: str = Field(default="", alias="outputHash")
    generation_controls: dict[str, Any] = Field(default_factory=dict, alias="generationControls")
    alignment_summary: dict[str, int] = Field(default_factory=dict, alias="alignmentSummary")
    canonical_authority: bool = Field(default=False, alias="canonicalAuthority")
    error: Optional[str] = None

    model_config = {"populate_by_name": True}


def _utf8_span(source: str, start_char: int, end_char: int) -> tuple[int, int] | None:
    """Return an exact UTF-8 byte span for a Python character interval."""

    if start_char < 0 or end_char <= start_char or end_char > len(source):
        return None
    start_byte = len(source[:start_char].encode("utf-8"))
    end_byte = len(source[:end_char].encode("utf-8"))
    source_bytes = source.encode("utf-8")
    if source_bytes[start_byte:end_byte].decode("utf-8") != source[start_char:end_char]:
        return None
    return start_byte, end_byte


def _source_revision_is_consistent(source: str, source_revision: str) -> bool:
    """Verify revisions when they use the repository's explicit SHA-256 form.

    Other revision authorities are preserved, but cannot be recomputed by this
    sidecar because it has no registry lookup; they remain caller-owned.
    """

    if source_revision.startswith("sha256:"):
        return source_revision == f"sha256:{hashlib.sha256(source.encode('utf-8')).hexdigest()}"
    return bool(source_revision.strip())


def _line_span_to_utf8_byte_offsets(source: str, start_line: int, end_line: int) -> tuple[int, int]:
    """Convert the legacy character-based line fallback into UTF-8 offsets."""

    char_start, char_end = legacy._line_span_to_offsets(source, start_line, end_line)
    return (
        len(source[:char_start].encode("utf-8")),
        len(source[:char_end].encode("utf-8")),
    )


def _structural_symbol_name(value: Any) -> str | None:
    """Keep declaration identifiers while excluding module/string labels."""

    if value is None:
        return None
    name = str(value).strip()
    if not name or name == "<anonymous>":
        return None
    if len(name) >= 2 and name[0] in {"'", '"', "`"} and name[-1] == name[0]:
        return None
    if name[0] in {"{", "["}:
        return None
    return name


# treesitter-chunker's own `kind` field for a `variable_declarator`/similar
# declarator node is a generic "fragment" label -- it does not inspect the
# initializer, so `const handleError = (...) => {...}` and
# `const handleError = 5` both report the same raw kind. This mirrors the
# semantic check the challenger AST provider (node-tree-sitter-challenger)
# already performs by inspecting the declarator's value node, without
# requiring a second full tree-sitter parse: it inspects the declarator's own
# already-known byte span text for a function-valued initializer.
_FUNCTION_INITIALIZER_RE = re.compile(
    r"=\s*(?:export\s+)?(?:async\s+)?(?:function\b|\([^()]*\)\s*(?::[^={]+)?\s*=>|[A-Za-z_$][\w$]*\s*=>)"
)
_DECLARATOR_NODE_TYPES = frozenset({"variable_declarator", "lexical_declaration", "variable_declaration"})


def _declarator_kind_override(node_type: str, span_text: str) -> str | None:
    """Return 'function_declarator' when a declarator's initializer is a
    function/arrow-function, so `_structural_kind()`'s substring match on
    'function' classifies it correctly. Returns None (no override) for
    anything that isn't a declarator node or doesn't match the pattern --
    never downgrades an already-specific node_type."""

    if node_type not in _DECLARATOR_NODE_TYPES:
        return None
    if _FUNCTION_INITIALIZER_RE.search(span_text):
        return "function_declarator"
    return None


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


def _raw_chunk_content_bytes(raw: Any) -> bytes | None:
    value = raw.get("content") if isinstance(raw, dict) else getattr(raw, "content", None)
    if value is None:
        value = raw.get("text") if isinstance(raw, dict) else getattr(raw, "text", None)
    if value is None:
        metadata = raw.get("metadata") if isinstance(raw, dict) else getattr(raw, "metadata", None)
        if isinstance(metadata, dict):
            value = metadata.get("content", metadata.get("text"))
    if isinstance(value, bytes):
        return value
    if isinstance(value, str):
        return value.encode("utf-8")
    return None


def _span_line_range(source_bytes: bytes, start: int, end: int) -> tuple[int, int]:
    start_line = source_bytes[:start].count(b"\n") + 1
    body = source_bytes[start:end].rstrip(b"\r\n")
    return start_line, start_line + body.count(b"\n")


def _span_matches_original(
    source_bytes: bytes,
    start: int,
    end: int,
    *,
    content_bytes: bytes | None,
    reported_start_line: int | None,
    reported_end_line: int | None,
    allow_lf_normalized_content: bool = False,
) -> bool:
    if start < 0 or end < start or end > len(source_bytes):
        return False
    if content_bytes is not None:
        source_slice = source_bytes[start:end]
        if allow_lf_normalized_content:
            source_slice = source_slice.replace(b"\r\n", b"\n")
        if source_slice != content_bytes:
            return False
    if reported_start_line is not None or reported_end_line is not None:
        actual_start_line, actual_end_line = _span_line_range(source_bytes, start, end)
        if reported_start_line is not None and actual_start_line != reported_start_line:
            return False
        if reported_end_line is not None and actual_end_line != reported_end_line:
            return False
    return True


def _lf_boundary_to_original_map(source_bytes: bytes) -> list[int]:
    """Map LF-normalized byte boundaries back to exact original boundaries."""

    mapping = [0]
    original_index = 0
    while original_index < len(source_bytes):
        if source_bytes[original_index:original_index + 2] == b"\r\n":
            original_index += 2
        else:
            original_index += 1
        mapping.append(original_index)
    return mapping


def _resolve_original_chunk_span(
    source: str,
    start: int,
    end: int,
    *,
    content_bytes: bytes | None,
    reported_start_line: int | None,
    reported_end_line: int | None,
) -> tuple[int, int, str | None] | None:
    """Validate a native span, or conditionally repair LF offsets onto CRLF bytes.

    ``start``/``end`` may already be original-byte coordinates produced by an
    upstream LF-relative remap (see ``resolve_chunk_byte_span``), in which case
    the byte slice only matches ``content_bytes`` after CRLF->LF normalization.
    ``allow_lf_normalized_content=True`` here is a strict superset of an exact
    match (a slice with no CRLF normalizes to itself), so this never accepts a
    span an exact-match check would have rejected -- it only additionally
    accepts an already-remapped span, avoiding a second, incorrect LF-relative
    reinterpretation of coordinates that are no longer LF-relative.
    """

    source_bytes = source.encode("utf-8")
    if _span_matches_original(
        source_bytes,
        start,
        end,
        content_bytes=content_bytes,
        reported_start_line=reported_start_line,
        reported_end_line=reported_end_line,
        allow_lf_normalized_content=True,
    ):
        return start, end, None

    if b"\r\n" not in source_bytes:
        return None

    normalized_bytes = source_bytes.replace(b"\r\n", b"\n")
    if start < 0 or end < start or end > len(normalized_bytes):
        return None

    boundary_map = _lf_boundary_to_original_map(source_bytes)
    if end >= len(boundary_map):
        return None
    remapped_start = boundary_map[start]
    remapped_end = boundary_map[end]
    if (remapped_start, remapped_end) == (start, end):
        return None
    if not _span_matches_original(
        source_bytes,
        remapped_start,
        remapped_end,
        content_bytes=content_bytes,
        reported_start_line=reported_start_line,
        reported_end_line=reported_end_line,
        allow_lf_normalized_content=True,
    ):
        return None
    return remapped_start, remapped_end, "CONSILIENCY_LF_OFFSET_REMAP"


def _diagnostics_have_errors(diagnostics: list[str]) -> bool:
    return any(not item.startswith("CONSILIENCY_LF_OFFSET_REMAP:") for item in diagnostics)


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
            start, end = _line_span_to_utf8_byte_offsets(req.source, int(start_line), int(end_line))
        else:
            span = resolve_chunk_byte_span(req.source, raw, int(start), int(end))
            if span.mode == "INVALID":
                diagnostics.append(
                    "ChunkingError: explicit treesitter-chunker byte span does not match original UTF-8 bytes or LF-compatibility mapping"
                )
                continue
            if span.mode == "LF_COMPAT_REMAPPED":
                diagnostics.append(
                    "CONSILIENCY_LF_BYTE_SPAN_REMAPPED: explicit chunk span was LF-relative and was mapped back to original UTF-8 bytes"
                )
            start, end = span.start_byte, span.end_byte
            resolved_span = _resolve_original_chunk_span(
                req.source,
                int(start),
                int(end),
                content_bytes=_raw_chunk_content_bytes(raw),
                reported_start_line=int(start_line) if start_line is not None else None,
                reported_end_line=int(end_line) if end_line is not None else None,
            )
            if resolved_span is None:
                identity = normalized.get("upstream_chunk_id") or normalized.get("upstream_node_id") or normalized.get("name") or "unknown"
                diagnostics.append(
                    f"ChunkingError: CONSILIENCY_BYTE_SPAN_INVALID:{identity}: explicit byte span does not reproduce original request bytes"
                )
                continue
            start, end, repair = resolved_span
            if repair is not None:
                identity = normalized.get("upstream_chunk_id") or normalized.get("upstream_node_id") or normalized.get("name") or "unknown"
                diagnostics.append(f"{repair}:{identity}:{int(normalized.get('byte_start'))}-{int(normalized.get('byte_end'))}->{start}-{end}")

        start = max(0, int(start))
        end = max(start, int(end))
        start_row, start_column = legacy._offset_line_column(req.source, start)
        end_row, end_column = legacy._offset_line_column(req.source, end)
        node_type = str(normalized.get("node_type") or "fragment")
        span_text = req.source.encode("utf-8")[start:end].decode("utf-8", errors="ignore")
        kind_node_type = _declarator_kind_override(node_type, span_text) or node_type

        evidence_chunks.append(
            AstEvidenceChunkV2(
                upstream_chunk_id=normalized.get("upstream_chunk_id"),
                upstream_node_id=normalized.get("upstream_node_id"),
                upstream_file_id=normalized.get("upstream_file_id"),
                upstream_symbol_id=normalized.get("upstream_symbol_id"),
                node_type=node_type,
                kind=legacy._structural_kind(kind_node_type),
                name=_structural_symbol_name(normalized.get("name")),
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
        occurrence_map: dict[str, list[tuple[int, int]]] | None = None,
    ) -> None:
        candidate = (source_key, target_key, edge_type, chunk.start_line)
        if candidate in seen_edges:
            return
        seen_edges.add(candidate)
        # CSGR-3 (2026-08-29): additive only — evidence_start_line/column below remain the
        # chunk's own boundary, unchanged, exactly as before. occurrence_positions is a NEW
        # optional field carrying every real per-occurrence position found by re-parsing this
        # chunk, converted to file-absolute. None when not computed or the name genuinely wasn't
        # found by the re-parse (a real possibility — e.g. a call inside a nested chunk that
        # this chunk's own text doesn't include); never raises.
        occurrence_positions: list[list[int]] | None = None
        if occurrence_map is not None:
            raw_positions = occurrence_map.get(target_key)
            if raw_positions:
                occurrence_positions = [
                    list(occurrence_to_absolute_position(chunk.start_line, chunk.start_column, row, column))
                    for row, column in raw_positions
                ]
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
                occurrence_positions=occurrence_positions,
            )
        )

    source_utf8_bytes = req.source.encode("utf-8")
    for index, chunk in enumerate(evidence_chunks):
        structural_key = chunk.upstream_symbol_id or chunk.upstream_node_id or chunk.upstream_chunk_id
        if structural_key and chunk.kind not in {"import", "export"} and chunk.name:
            add_edge(file_key, structural_key, "DEFINES", chunk, resolved=True, resolution="native_chunk")
        source_key = structural_key or file_key
        chunk_deps = dependencies_by_chunk[index] if index < len(dependencies_by_chunk) else []
        # One re-parse per chunk (not per edge) — batches every name this chunk needs into a
        # single find_occurrence_positions() call. Never raises: an unsupported language or parse
        # failure yields an empty map, and every add_edge() call below degrades to
        # occurrence_positions=None exactly as it did before this change.
        chunk_names = [*chunk.imports, *chunk.exports, *chunk.calls, *chunk_deps]
        occurrence_map: dict[str, list[tuple[int, int]]] = {}
        if chunk_names:
            try:
                chunk_text = source_utf8_bytes[chunk.start_byte:chunk.end_byte].decode("utf-8", errors="ignore")
                occurrence_map = find_occurrence_positions(chunk_text, language, chunk_names)
            except Exception:
                occurrence_map = {}
        for value in chunk.imports:
            add_edge(file_key, value, "IMPORTS", chunk, resolved=False, resolution="syntax_only", occurrence_map=occurrence_map)
        for value in chunk.exports:
            add_edge(file_key, value, "EXPORTS", chunk, resolved=False, resolution="syntax_only", occurrence_map=occurrence_map)
        for value in chunk.calls:
            add_edge(source_key, value, "CALLS", chunk, resolved=False, resolution="unresolved_target", occurrence_map=occurrence_map)
        for value in chunk_deps:
            add_edge(source_key, value, "REFERENCES", chunk, resolved=False, resolution="unresolved_target", occurrence_map=occurrence_map)

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
        syntax_status="RECOVERED_WITH_ERRORS" if _diagnostics_have_errors(diagnostics) else "CLEAN",
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


@app.post("/extract/documentation-facts", response_model=DocumentationFactResponseV1)
def extract_documentation_facts(req: DocumentationFactRequestV1) -> DocumentationFactResponseV1:
    if not _source_revision_is_consistent(req.text, req.source_revision):
        raise HTTPException(status_code=422, detail="SOURCE_REVISION_MISMATCH")
    raw = _native_documentation_facts(req.text, model_id=req.model_id)
    facts: list[DocumentationFactV1] = []
    api_rules: list[ApiRuleV1] = []
    alignment_summary: dict[str, int] = {}
    for item in raw:
        byte_span = _utf8_span(req.text, item["start_char"], item["end_char"])
        if byte_span is None or byte_span != (item["start_byte"], item["end_byte"]):
            continue
        # Count only items that actually end up in facts/api_rules below -- counting here,
        # before the API_RULE required-field check, over-counted alignmentSummary.MATCH_EXACT
        # for items that get silently dropped by that check (found by code review 2026-09-04).
        if item.get("extraction_class") == "API_RULE":
            if not item.get("version_range") or not item.get("condition") or not item.get("recommendation"):
                continue
            alignment_summary["MATCH_EXACT"] = alignment_summary.get("MATCH_EXACT", 0) + 1
            api_rules.append(ApiRuleV1(
                apiSymbol=item["api_symbol"],
                versionRange=item["version_range"],
                condition=item["condition"],
                recommendation=item["recommendation"],
                parameterName=item.get("parameter_name") or None,
                expectedValue=item.get("expected_value") or None,
                evidenceSpan={
                    "sourceRevision": req.source_revision,
                    "startChar": item["start_char"],
                    "endChar": item["end_char"],
                    "startByte": item["start_byte"],
                    "endByte": item["end_byte"],
                    "alignmentStatus": "MATCH_EXACT",
                },
                confidence=item["confidence"],
            ))
            continue
        alignment_summary["MATCH_EXACT"] = alignment_summary.get("MATCH_EXACT", 0) + 1
        facts.append(DocumentationFactV1(
            subject=item["subject"],
            predicate=item["predicate"],
            object=item["object"],
            statement=item["statement"],
            evidenceText=item["evidence_text"],
            sourceUrl=req.source_url,
            sourceRevision=req.source_revision,
            startChar=item["start_char"],
            endChar=item["end_char"],
            startByte=item["start_byte"],
            endByte=item["end_byte"],
            productVersion=req.product_version,
            confidence=item["confidence"],
        ))
    selected_model = req.model_id or os.getenv("LANGEXTRACT_MODEL", "miniforge-nlp-sidecar")
    normalized_output = {"facts": [fact.model_dump(by_alias=True) for fact in facts], "apiRules": [rule.model_dump(by_alias=True) for rule in api_rules]}
    return DocumentationFactResponseV1(
        facts=facts,
        apiRules=api_rules,
        modelId=selected_model,
        producerRevision=legacy._provider_revision(),
        inputHash=hashlib.sha256(req.text.encode("utf-8")).hexdigest(),
        outputHash=hashlib.sha256(json.dumps(normalized_output, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest(),
        generationControls={
            "temperature": 0.0,
            "top_p": 1.0,
            "seed": 1729,
            "enable_thinking": False,
            "cache_prompt": False,
        },
        alignmentSummary=alignment_summary,
        canonicalAuthority=False,
        error=legacy._grounded_extraction_error,
    )


@app.post("/extract/file")
def extract_file() -> dict[str, Any]:
    return legacy.extract_file()


@app.post("/extract/web")
def extract_web(req: dict[str, Any]) -> dict[str, Any]:
    return legacy.extract_web(req)


@app.post("/evidence/web", response_model=WebEvidenceResponseV1)
def web_evidence(req: WebEvidenceRequestV1) -> WebEvidenceResponseV1:
    """Fetch and type external documentation for bounded agent context.

    BeautifulSoup is the default local provider. Firecrawl is opt-in and only
    available when FIRECRAWL_API_KEY is explicitly configured. Neither provider
    writes to Atlas stores or creates canonical identity.
    """
    from urllib.parse import urlparse

    parsed = urlparse(req.url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(400, "WEB_EVIDENCE_URL_INVALID")

    try:
        if req.provider == "FIRECRAWL_V2":
            api_key = os.getenv("FIRECRAWL_API_KEY", "").strip()
            if not api_key:
                raise HTTPException(503, "FIRECRAWL_NOT_CONFIGURED")
            fetched = external_docs.fetch_firecrawl_v2(req.url, api_key=api_key)
        else:
            fetched = external_docs.fetch_beautifulsoup(req.url)

        source_id = external_docs._sha(fetched.resolved_url)[:32]
        source_revision = f"sha256:{fetched.normalized_checksum}"
        chunks = external_docs.chunk_document(
            source_id=source_id,
            source_revision=source_revision,
            source_url=fetched.resolved_url,
            title=fetched.title,
            text=fetched.markdown,
            maximum_chars=req.maximum_chars,
            overlap_chars=req.overlap_chars,
        )
        bounded = chunks[: req.maximum_chunks]
        return WebEvidenceResponseV1(
            schema="atlas.external-web-evidence.v1",
            fetcher=fetched.fetcher,
            source_id=source_id,
            source_revision=source_revision,
            title=fetched.title,
            document_checksum=fetched.normalized_checksum,
            chunks=[chunk.to_dict() for chunk in bounded],
            truncated=len(chunks) > len(bounded),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"WEB_EVIDENCE_FETCH_FAILED:{type(exc).__name__}") from exc


def main() -> None:
    import uvicorn

    host = os.getenv("MINIFORGE_SIDECAR_HOST", "127.0.0.1")
    port = int(os.getenv("MINIFORGE_SIDECAR_PORT", "8095"))
    uvicorn.run(app, host=host, port=port, log_level=os.getenv("UVICORN_LOG_LEVEL", "info"))


if __name__ == "__main__":
    main()
