import hashlib

import pytest
from fastapi import HTTPException

from miniforge_nlp_sidecar import AstChunkRequest
from miniforge_nlp_sidecar_v2 import AstEvidenceResponseV2, ast_chunk


def _response(request: AstChunkRequest) -> AstEvidenceResponseV2:
    return AstEvidenceResponseV2(
        schema="atlas.ast.evidence.v1",
        engine="treesitter-chunker",
        engine_version="fixture",
        language=request.language,
        file_path=request.file_path,
        source_revision=request.source_revision,
        chunks=[],
    )


def test_ast_chunk_rejects_content_digest_mismatch_before_extraction(monkeypatch):
    called = False

    def extract(_request):
        nonlocal called
        called = True
        raise AssertionError("extractor must not receive revision-mismatched source")

    monkeypatch.setattr("miniforge_nlp_sidecar_v2._native_ast_evidence", extract)
    request = AstChunkRequest(
        source="const current = true;",
        language="typescript",
        filePath="src/current.ts",
        sourceRevision="sha256:" + "0" * 64,
    )

    with pytest.raises(HTTPException) as error:
        ast_chunk(request)

    assert error.value.status_code == 422
    assert error.value.detail == "SOURCE_REVISION_MISMATCH"
    assert called is False


def test_ast_chunk_accepts_matching_content_digest(monkeypatch):
    source = "const current = true;"
    revision = "sha256:" + hashlib.sha256(source.encode("utf-8")).hexdigest()
    monkeypatch.setattr("miniforge_nlp_sidecar_v2._native_ast_evidence", _response)
    request = AstChunkRequest(
        source=source,
        language="typescript",
        filePath="src/current.ts",
        sourceRevision=revision,
    )

    assert ast_chunk(request).source_revision == revision


def test_ast_chunk_preserves_opaque_caller_revision(monkeypatch):
    revision = "git:workspace-ref-v1"
    monkeypatch.setattr("miniforge_nlp_sidecar_v2._native_ast_evidence", _response)
    request = AstChunkRequest(
        source="const current = true;",
        language="typescript",
        filePath="src/current.ts",
        sourceRevision=revision,
    )

    assert ast_chunk(request).source_revision == revision
