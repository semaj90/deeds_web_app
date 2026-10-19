from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

import atlas_external_docs
from parent_atlas_ontology.domain_mapping import admit_domain_classification, mapping_revision


FEATURE_NAMES = (
    "span_bytes",
    "line_count",
    "call_count",
    "import_count",
    "export_count",
    "ancestry_depth",
    "has_signature",
)


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _checksum(value: Any) -> str:
    return "sha256:" + hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _read(chunk: Any, key: str, default: Any = None) -> Any:
    if isinstance(chunk, dict):
        return chunk.get(key, default)
    return getattr(chunk, key, default)


class AstChunkKeyValueV1(BaseModel):
    key: str
    value: str | int | float | bool | None


class AstChunkFeatureRowV1(BaseModel):
    rowOrdinal: int = Field(ge=0)
    chunkKey: str
    upstreamChunkId: str | None = None
    evidenceRef: str | None = None
    startByte: int = Field(ge=0)
    endByte: int = Field(gt=0)
    attributes: tuple[AstChunkKeyValueV1, ...]


class AstChunkSequenceLinkV1(BaseModel):
    ordinal: int = Field(ge=0)
    chunkKey: str
    previousChunkKey: str | None = None
    nextChunkKey: str | None = None
    evidenceRef: str | None = None


class AstChunkTensorFeaturesV1(BaseModel):
    schema: Literal["atlas.ast-chunk.tensor-features.v1"] = "atlas.ast-chunk.tensor-features.v1"
    dtype: Literal["float32"] = "float32"
    shape: tuple[int, int]
    featureNames: tuple[str, ...]
    rowChunkKeys: tuple[str, ...]
    values: tuple[tuple[float, ...], ...]
    checksum: str


class AstChunkDomainRoutingProposalV1(BaseModel):
    schema: Literal["atlas.ast-chunk.domain-routing-proposal.v1"] = "atlas.ast-chunk.domain-routing-proposal.v1"
    status: Literal["PROPOSAL_ONLY", "BLOCKED_SOURCE_REF_MISSING", "BLOCKED_SOURCE_REVISION_MISMATCH"]
    domainLabel: str
    ontologyLabelCandidates: tuple[str, ...]
    mappedOntologyClassCandidate: str | None = None
    mappingStatus: str
    mappingRevision: str
    routeKeyCandidate: str | None = None
    routingBlockers: tuple[str, ...]
    confidence: None = None
    evidenceRefs: tuple[str, ...]
    sourceIdentityStatus: Literal["CALLER_ASSERTED", "MISSING_SOURCE_REF"]
    canonicalAuthority: Literal[False] = False
    dispatchAllowed: Literal[False] = False


class AstChunkHelperAnalysisV1(BaseModel):
    schema: Literal["atlas.ast-chunk-helper-analysis.v1"] = "atlas.ast-chunk-helper-analysis.v1"
    sourceRef: str | None = None
    sourceRevision: str
    workspaceRevision: str | None = None
    sourceContentSha256: str
    sourceRevisionStatus: Literal["MATCHES_INPUT_CONTENT", "MISMATCHES_INPUT_CONTENT", "OPAQUE_CALLER_REVISION"]
    classifierRevision: str
    domainRoutingProposal: AstChunkDomainRoutingProposalV1
    routeHints: tuple[AstChunkKeyValueV1, ...]
    chunkRows: tuple[AstChunkFeatureRowV1, ...]
    proceduralSequence: tuple[AstChunkSequenceLinkV1, ...]
    totalValidChunks: int = Field(ge=0)
    includedChunks: int = Field(ge=0)
    invalidSpanCount: int = Field(ge=0)
    truncated: bool
    tensorFeatures: AstChunkTensorFeaturesV1 | None = None
    canonicalAuthority: Literal[False] = False
    writesPerformed: Literal[False] = False
    dispatchAllowed: Literal[False] = False


def build_ast_chunk_helper_analysis_v1(
    *,
    source: str,
    file_path: str,
    language: str,
    source_ref: str | None,
    source_revision: str,
    workspace_revision: str | None,
    chunks: list[Any],
    include_tensor_features: bool = False,
    max_chunks: int = 256,
) -> AstChunkHelperAnalysisV1:
    if not 1 <= max_chunks <= 512:
        raise ValueError("MAX_HELPER_CHUNKS_OUT_OF_RANGE")

    source_bytes = source.encode("utf-8")
    source_digest = hashlib.sha256(source_bytes).hexdigest()
    if source_revision.startswith("sha256:"):
        revision_status = "MATCHES_INPUT_CONTENT" if source_revision == f"sha256:{source_digest}" else "MISMATCHES_INPUT_CONTENT"
    else:
        revision_status = "OPAQUE_CALLER_REVISION"

    ordered = sorted(
        chunks,
        key=lambda chunk: (
            int(_read(chunk, "start_byte", -1)),
            int(_read(chunk, "end_byte", -1)),
            str(_read(chunk, "upstream_node_id") or ""),
        ),
    )
    valid: list[tuple[Any, int, int, str | None]] = []
    seen_spans: set[tuple[int, int]] = set()
    invalid_span_count = 0
    for chunk in ordered:
        start = _read(chunk, "start_byte")
        end = _read(chunk, "end_byte")
        if not isinstance(start, int) or not isinstance(end, int) or start < 0 or end <= start or end > len(source_bytes):
            invalid_span_count += 1
            continue
        try:
            source_bytes[start:end].decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            invalid_span_count += 1
            continue
        span_key = (start, end)
        if span_key in seen_spans:
            invalid_span_count += 1
            continue
        seen_spans.add(span_key)
        upstream_id = _read(chunk, "upstream_chunk_id")
        valid.append((chunk, start, end, str(upstream_id) if upstream_id else None))

    selected = valid[:max_chunks]
    source_reference = source_ref.strip() if source_ref and source_ref.strip() else None
    chunk_rows: list[AstChunkFeatureRowV1] = []
    sequence: list[AstChunkSequenceLinkV1] = []
    numeric_rows: list[tuple[float, ...]] = []
    row_keys: list[str] = []
    evidence_refs: list[str] = []

    for ordinal, (chunk, start, end, upstream_id) in enumerate(selected):
        node_type = str(_read(chunk, "node_type", "unknown"))[:128]
        material = {
            "sourceContentSha256": source_digest,
            "filePath": file_path.replace("\\", "/"),
            "startByte": start,
            "endByte": end,
            "nodeType": node_type,
        }
        chunk_key = "ast-chunk:" + _checksum(material)
        evidence_ref = (
            f"source:{source_reference}@{source_revision}#bytes:{start}-{end}"
            if source_reference
            else None
        )
        if evidence_ref:
            evidence_refs.append(evidence_ref)

        calls = _read(chunk, "calls", []) or []
        imports = _read(chunk, "imports", []) or []
        exports = _read(chunk, "exports", []) or []
        ancestry = _read(chunk, "syntax_ancestry", []) or []
        parent_route = _read(chunk, "parent_route", []) or []
        start_line = int(_read(chunk, "start_line", 0) or 0)
        end_line = int(_read(chunk, "end_line", 0) or 0)
        line_count = max(0, end_line - start_line + 1)
        signature = _read(chunk, "signature_text")
        attributes = (
            AstChunkKeyValueV1(key="nodeType", value=node_type),
            AstChunkKeyValueV1(key="kind", value=str(_read(chunk, "kind", "unknown"))[:128]),
            AstChunkKeyValueV1(key="name", value=(str(_read(chunk, "name"))[:256] if _read(chunk, "name") else None)),
            AstChunkKeyValueV1(key="parentContext", value=(str(_read(chunk, "parent_context"))[:512] if _read(chunk, "parent_context") else None)),
            AstChunkKeyValueV1(key="parentRoute", value="/".join(str(item)[:128] for item in parent_route[:32])),
            AstChunkKeyValueV1(key="callCount", value=len(calls)),
            AstChunkKeyValueV1(key="importCount", value=len(imports)),
            AstChunkKeyValueV1(key="exportCount", value=len(exports)),
            AstChunkKeyValueV1(key="ancestryDepth", value=len(ancestry)),
            AstChunkKeyValueV1(key="hasSignature", value=bool(signature)),
        )
        chunk_rows.append(AstChunkFeatureRowV1(
            rowOrdinal=ordinal,
            chunkKey=chunk_key,
            upstreamChunkId=upstream_id,
            evidenceRef=evidence_ref,
            startByte=start,
            endByte=end,
            attributes=attributes,
        ))
        row_keys.append(chunk_key)
        numeric_rows.append((
            float(end - start),
            float(line_count),
            float(len(calls)),
            float(len(imports)),
            float(len(exports)),
            float(len(ancestry)),
            float(bool(signature)),
        ))

    for ordinal, row in enumerate(chunk_rows):
        sequence.append(AstChunkSequenceLinkV1(
            ordinal=ordinal,
            chunkKey=row.chunkKey,
            previousChunkKey=chunk_rows[ordinal - 1].chunkKey if ordinal > 0 else None,
            nextChunkKey=chunk_rows[ordinal + 1].chunkKey if ordinal + 1 < len(chunk_rows) else None,
            evidenceRef=row.evidenceRef,
        ))

    domain_label = atlas_external_docs.classify_domain(file_path, source)
    ontology_labels = tuple(atlas_external_docs.classify_ontology(source))
    mapping = admit_domain_classification(domain_label, confidence=0.0)
    route_blockers = ["DOMAIN_TAXONOMY_CROSSWALK_UNPROVEN"]
    if not source_reference:
        route_blockers.append("SOURCE_REF_MISSING")
    if revision_status == "MISMATCHES_INPUT_CONTENT":
        route_blockers.append("SOURCE_REVISION_CONTENT_MISMATCH")
    proposal = AstChunkDomainRoutingProposalV1(
        status=(
            "BLOCKED_SOURCE_REF_MISSING" if not source_reference
            else "BLOCKED_SOURCE_REVISION_MISMATCH" if revision_status == "MISMATCHES_INPUT_CONTENT"
            else "PROPOSAL_ONLY"
        ),
        domainLabel=domain_label,
        ontologyLabelCandidates=ontology_labels,
        mappedOntologyClassCandidate=mapping.classId,
        mappingStatus=mapping.status,
        mappingRevision=mapping_revision(),
        routeKeyCandidate=None,
        routingBlockers=tuple(route_blockers),
        evidenceRefs=tuple(evidence_refs),
        sourceIdentityStatus="CALLER_ASSERTED" if source_reference else "MISSING_SOURCE_REF",
    )
    route_hints = (
        AstChunkKeyValueV1(key="candidateDomainLabel", value=domain_label),
        AstChunkKeyValueV1(key="language", value=language.lower()),
        AstChunkKeyValueV1(key="dispatchAllowed", value=False),
    )

    tensor_features = None
    if include_tensor_features:
        tensor_payload = {
            "schema": "atlas.ast-chunk.tensor-features.v1",
            "dtype": "float32",
            "featureNames": FEATURE_NAMES,
            "rowChunkKeys": tuple(row_keys),
            "values": tuple(numeric_rows),
        }
        if any(not math.isfinite(value) for row in numeric_rows for value in row):
            raise ValueError("NONFINITE_AST_TENSOR_FEATURE")
        tensor_features = AstChunkTensorFeaturesV1(
            shape=(len(numeric_rows), len(FEATURE_NAMES)),
            featureNames=FEATURE_NAMES,
            rowChunkKeys=tuple(row_keys),
            values=tuple(numeric_rows),
            checksum=_checksum(tensor_payload),
        )

    return AstChunkHelperAnalysisV1(
        sourceRef=source_reference,
        sourceRevision=source_revision,
        workspaceRevision=workspace_revision,
        sourceContentSha256="sha256:" + source_digest,
        sourceRevisionStatus=revision_status,
        classifierRevision="sha256:" + hashlib.sha256(Path(atlas_external_docs.__file__).read_bytes()).hexdigest(),
        domainRoutingProposal=proposal,
        routeHints=route_hints,
        chunkRows=tuple(chunk_rows),
        proceduralSequence=tuple(sequence),
        totalValidChunks=len(valid),
        includedChunks=len(selected),
        invalidSpanCount=invalid_span_count,
        truncated=len(valid) > len(selected),
        tensorFeatures=tensor_features,
    )


def ast_chunk_tensor_features_to_torch_cpu_v1(features: AstChunkTensorFeaturesV1) -> tuple[Any, tuple[str, ...]]:
    payload = {
        "schema": features.schema,
        "dtype": features.dtype,
        "featureNames": features.featureNames,
        "rowChunkKeys": features.rowChunkKeys,
        "values": features.values,
    }
    if _checksum(payload) != features.checksum:
        raise ValueError("AST_TENSOR_FEATURE_CHECKSUM_MISMATCH")
    if features.shape != (len(features.values), len(features.featureNames)):
        raise ValueError("AST_TENSOR_FEATURE_SHAPE_MISMATCH")
    if len(features.rowChunkKeys) != features.shape[0]:
        raise ValueError("AST_TENSOR_FEATURE_IDENTITY_ALIGNMENT_MISMATCH")
    try:
        import torch
    except ImportError as error:
        raise RuntimeError("PYTORCH_REQUIRED_FOR_AST_TENSOR_CONVERSION") from error
    tensor = torch.tensor(features.values, dtype=torch.float32, device="cpu")
    if tuple(tensor.shape) != features.shape:
        raise ValueError("AST_TENSOR_MATERIALIZATION_SHAPE_MISMATCH")
    return tensor, features.rowChunkKeys
