import hashlib

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from miniforge_nlp_sidecar import AnalyzeRequest, AstChunkRequest, MAX_AST_SOURCE_CHARS
from miniforge_nlp_sidecar_v2 import AstEvidenceResponseV2, app, ast_chunk, _native_ast_evidence
import miniforge_nlp_sidecar_v2 as sidecar_v2


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


def test_ast_chunk_request_accepts_large_but_bounded_source():
    source = "x" * 239_212
    request = AstChunkRequest(
        source=source,
        language="typescript",
        filePath="src/large-source.ts",
        sourceRevision="sha256:" + "0" * 64,
    )

    assert len(request.source) == 239_212


def test_analyze_request_accepts_large_bounded_input_and_rejects_above_cap():
    request = AnalyzeRequest(text="x" * 328_372, max_chars=1_000_000)

    assert len(request.text) == 328_372
    assert request.max_chars == 1_000_000
    with pytest.raises(ValueError):
        AnalyzeRequest(text="x", max_chars=1_000_001)


def test_ast_chunk_http_route_accepts_large_source():
    source = ("// x\n" * (239_212 // 5)) + "  "
    revision = "sha256:" + hashlib.sha256(source.encode("utf-8")).hexdigest()
    response = TestClient(app).post(
        "/ast/chunk",
        json={
            "source": source,
            "language": "typescript",
            "filePath": "src/large-source.ts",
            "sourceRevision": revision,
        },
    )

    assert response.status_code == 200
    assert response.json()["source_revision"] == revision


def test_ast_chunk_request_rejects_source_above_explicit_cap():
    with pytest.raises(ValueError):
        AstChunkRequest(
            source="x" * (MAX_AST_SOURCE_CHARS + 1),
            language="typescript",
            filePath="src/oversize-source.ts",
            sourceRevision="sha256:" + "0" * 64,
        )


def _receipt_request(source: str) -> AstChunkRequest:
    revision = "sha256:" + hashlib.sha256(source.encode("utf-8")).hexdigest()
    return AstChunkRequest(
        source=source,
        language="typescript",
        filePath="src/receipt-check.ts",
        sourceRevision=revision,
    )


def test_ast_chunk_receipt_is_complete_for_normal_source():
    response = _native_ast_evidence(_receipt_request("export function alpha(): number { return 1; }\n"))

    assert response.scan_completeness == "COMPLETE"
    assert response.scan_failure is None


def test_ast_chunk_receipt_is_partial_when_extraction_raises(monkeypatch):
    def failing_chunker(*args, **kwargs):
        raise RuntimeError("chunker exploded")

    monkeypatch.setattr(sidecar_v2, "_raw_chunk_file", failing_chunker)
    response = _native_ast_evidence(_receipt_request("export function alpha(): number { return 1; }\n"))

    assert response.scan_completeness == "PARTIAL_AST_FAILED"
    assert "chunker exploded" in (response.scan_failure or "")
    assert response.chunks == []


def test_unsupported_language_is_partial_not_complete():
    """Fail closed: an unsupported language must never report a complete empty AST scan."""
    req = AstChunkRequest(
        source="x = 1\n",
        language="not-a-language",
        filePath="a/b.svelte",
        sourceRevision="sha256:" + "a" * 64,
    )
    result = _native_ast_evidence(req)
    assert result.chunks == []
    assert result.scan_completeness == "PARTIAL_AST_FAILED"
    assert result.scan_failure and result.scan_failure.startswith("UnsupportedLanguageError")
