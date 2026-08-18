"""Red/green contract for the 8095 AST producer's native provenance boundary.

This test intentionally describes the canonical Consiliency CodeChunk fields that
`/ast/chunk` must preserve. It should stay red until `python/miniforge_nlp_sidecar.py`
stops replacing native provenance with a local digest-only `upstream_chunk_id`.

Canonical source contract pinned in:
  docs/atlas/ast-upstream-contract-manifest.json
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

import miniforge_nlp_sidecar as sidecar


REQUIRED_NATIVE_FIELDS = (
    "node_id",
    "file_id",
    "chunk_id",
    "parent_route",
    "qualified_route",
    "parent_context",
)


def _native_chunk() -> SimpleNamespace:
    return SimpleNamespace(
        language="typescript",
        file_path="src/example.ts",
        node_type="function_declaration",
        start_line=2,
        end_line=2,
        byte_start=35,
        byte_end=80,
        parent_context="module",
        content="export function hello() { return helper(); }",
        chunk_id="chunk-native-1",
        node_id="node-native-1",
        file_id="file-native-1",
        symbol_id="symbol-native-hello",
        parent_route=["module"],
        qualified_route=["module", "function_declaration:hello"],
        metadata={"calls": ["helper"], "imports": [], "exports": ["hello"]},
    )


def test_ast_evidence_schema_exposes_consistency_native_fields() -> None:
    """The Pydantic response model itself must be able to serialize native fields."""
    fields = sidecar.AstEvidenceChunk.model_fields
    for field in REQUIRED_NATIVE_FIELDS:
        assert field in fields, f"AstEvidenceChunk drops canonical native field: {field}"
    assert "symbol_id" in fields


def test_ast_evidence_preserves_native_consistency_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    """No compatibility digest may replace a native CodeChunk ID at /ast/chunk."""
    native = _native_chunk()

    # TODO(PRODUCER-WIRING): expose/inject the raw Consiliency chunk path used by
    # _ast_evidence. Once wired, replace this compatibility mock with the raw
    # CodeChunk provider seam and remove the xfail.
    if not hasattr(sidecar, "_native_ast_evidence_chunks"):
        pytest.xfail("TODO(PRODUCER-WIRING): _native_ast_evidence_chunks seam not implemented yet")

    monkeypatch.setattr(sidecar, "_native_ast_evidence_chunks", lambda *_args, **_kwargs: [native])
    req = sidecar.AstChunkRequest(
        source="import { helper } from './helper';\nexport function hello() { return helper(); }",
        language="typescript",
        filePath="src/example.ts",
        sourceRevision="native-provenance-test-v1",
    )
    result = sidecar._ast_evidence(req)
    assert result.chunks
    chunk = result.chunks[0]
    assert chunk.node_id == native.node_id
    assert chunk.file_id == native.file_id
    assert chunk.symbol_id == native.symbol_id
    assert chunk.chunk_id == native.chunk_id
    assert chunk.parent_route == native.parent_route
    assert chunk.qualified_route == native.qualified_route
    assert chunk.parent_context == native.parent_context
    assert chunk.start_byte == native.byte_start
    assert chunk.end_byte == native.byte_end
