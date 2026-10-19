from __future__ import annotations

import hashlib

import pytest

from atlas_ast_chunk_helpers_v1 import (
    AstChunkTensorFeaturesV1,
    ast_chunk_tensor_features_to_torch_cpu_v1,
    build_ast_chunk_helper_analysis_v1,
)
from miniforge_nlp_sidecar_v2 import AstEvidenceChunkV2, ast_chunk
from miniforge_nlp_sidecar import AstChunkRequest


def _chunks(source: str) -> list[AstEvidenceChunkV2]:
    encoded = source.encode("utf-8")
    midpoint = encoded.index(b"\n")
    return [
        AstEvidenceChunkV2(
            upstream_chunk_id="upstream:1",
            upstream_node_id="node:1",
            node_type="function_definition",
            kind="function",
            name="build_index",
            start_byte=0,
            end_byte=midpoint,
            start_line=1,
            start_column=0,
            end_line=1,
            end_column=midpoint,
            calls=["connect"],
            imports=["torch"],
            exports=["build_index"],
            syntax_ancestry=[{"node_type": "module"}],
            signature_text="def build_index():",
        ),
        AstEvidenceChunkV2(
            upstream_chunk_id="upstream:2",
            upstream_node_id="node:2",
            node_type="expression_statement",
            kind="statement",
            start_byte=midpoint + 1,
            end_byte=len(encoded),
            start_line=2,
            start_column=0,
            end_line=2,
            end_column=len(encoded) - midpoint - 1,
        ),
    ]


def test_helper_emits_proposals_ordered_pairs_sequence_and_aligned_tensor_rows():
    source = "def build_index():\n    return connect()"
    revision = "sha256:" + hashlib.sha256(source.encode()).hexdigest()
    analysis = build_ast_chunk_helper_analysis_v1(
        source=source,
        file_path="src/retrieval/index.py",
        language="python",
        source_ref="repo:root/src/retrieval/index.py",
        source_revision=revision,
        workspace_revision="sha256:" + "a" * 64,
        chunks=_chunks(source),
        include_tensor_features=True,
    )

    assert analysis.sourceRevisionStatus == "MATCHES_INPUT_CONTENT"
    assert analysis.domainRoutingProposal.status == "PROPOSAL_ONLY"
    assert analysis.domainRoutingProposal.confidence is None
    assert analysis.domainRoutingProposal.canonicalAuthority is False
    assert analysis.dispatchAllowed is False
    assert [pair.key for pair in analysis.chunkRows[0].attributes][:2] == ["nodeType", "kind"]
    assert analysis.proceduralSequence[0].nextChunkKey == analysis.proceduralSequence[1].chunkKey
    assert analysis.proceduralSequence[0].previousChunkKey is None
    assert analysis.tensorFeatures is not None
    assert analysis.tensorFeatures.shape == (2, 7)
    assert analysis.tensorFeatures.rowChunkKeys == tuple(row.chunkKey for row in analysis.chunkRows)


def test_missing_source_ref_blocks_routing_and_invalid_spans_are_excluded():
    source = "first\nsecond"
    chunks = _chunks("first\nsecond")
    chunks.append(chunks[0].model_copy(update={"start_byte": 1, "end_byte": len(source.encode()) + 1}))
    analysis = build_ast_chunk_helper_analysis_v1(
        source=source,
        file_path="src/unknown.py",
        language="python",
        source_ref=None,
        source_revision="opaque-revision",
        workspace_revision=None,
        chunks=chunks,
        include_tensor_features=True,
    )

    assert analysis.domainRoutingProposal.status == "BLOCKED_SOURCE_REF_MISSING"
    assert analysis.domainRoutingProposal.routeKeyCandidate is None
    assert analysis.domainRoutingProposal.evidenceRefs == ()
    assert analysis.sourceRevisionStatus == "OPAQUE_CALLER_REVISION"
    assert analysis.invalidSpanCount == 1
    assert analysis.tensorFeatures is not None
    assert analysis.tensorFeatures.shape == (2, 7)


def test_torch_conversion_preserves_row_identity_when_installed():
    torch = pytest.importorskip("torch")
    source = "def build_index():\n    return connect()"
    analysis = build_ast_chunk_helper_analysis_v1(
        source=source,
        file_path="src/retrieval/index.py",
        language="python",
        source_ref="repo:root/src/retrieval/index.py",
        source_revision="opaque-revision",
        workspace_revision=None,
        chunks=_chunks(source),
        include_tensor_features=True,
    )
    assert analysis.tensorFeatures is not None
    tensor, row_keys = ast_chunk_tensor_features_to_torch_cpu_v1(analysis.tensorFeatures)
    assert isinstance(tensor, torch.Tensor)
    assert tuple(tensor.shape) == analysis.tensorFeatures.shape
    assert row_keys == analysis.tensorFeatures.rowChunkKeys


def test_ast_chunk_endpoint_helpers_are_opt_in(monkeypatch):
    source = "def build_index():\n    return connect()"
    response = type("Response", (), {"chunks": _chunks(source), "helper_analysis": None})()
    monkeypatch.setattr("miniforge_nlp_sidecar_v2._native_ast_evidence", lambda _request: response)
    request = AstChunkRequest(
        source=source,
        language="python",
        filePath="src/retrieval/index.py",
        sourceRevision="opaque-revision",
        sourceRef="repo:root/src/retrieval/index.py",
    )

    assert ast_chunk(request).helper_analysis is None
    enriched = ast_chunk(
        request,
        include_helpers=True,
        include_tensor_features=True,
        max_helper_chunks=256,
    )
    assert enriched.helper_analysis is not None
    assert enriched.helper_analysis.tensorFeatures is not None
