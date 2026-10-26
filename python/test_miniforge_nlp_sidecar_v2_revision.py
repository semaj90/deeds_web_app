import asyncio
import hashlib

import httpx
import pytest
from fastapi import HTTPException

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
        workspace_revision=request.workspace_revision,
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


def test_ast_chunk_echoes_caller_workspace_revision(monkeypatch):
    monkeypatch.setattr("miniforge_nlp_sidecar_v2._native_ast_evidence", _response)
    request = AstChunkRequest(
        source="const current = true;",
        language="typescript",
        filePath="src/current.ts",
        sourceRevision="sha256:" + hashlib.sha256(b"const current = true;").hexdigest(),
        workspaceRevision="sha256:" + "c" * 64,
    )

    response = ast_chunk(request)

    assert response.workspace_revision == request.workspace_revision
    assert response.model_dump(by_alias=True)["workspace_revision"] == request.workspace_revision


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


def test_ast_chunk_http_route_accepts_large_source(monkeypatch):
    monkeypatch.setattr(sidecar_v2, '_native_ast_evidence', _response)
    source = ("// x\n" * (239_212 // 5)) + "  "
    revision = "sha256:" + hashlib.sha256(source.encode("utf-8")).hexdigest()
    async def post_request():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
            return await client.post(
                "/ast/chunk",
                json={
                    "source": source,
                    "language": "typescript",
                    "filePath": "src/large-source.ts",
                    "sourceRevision": revision,
                },
            )

    response = asyncio.run(post_request())

    assert response.status_code == 200
    assert response.json()["source_revision"] == revision
    # Wire contract: the HTTP key stays "schema" even though the Python attribute is schema_.
    assert response.json()["schema"] == "atlas.ast.evidence.v1"
    assert "schema_" not in response.json()


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


def test_ast_evidence_response_model_schema_field_is_aliased_to_schema():
    props = AstEvidenceResponseV2.model_json_schema(by_alias=True)["properties"]
    assert "schema" in props and "schema_" not in props
    assert AstEvidenceResponseV2.model_fields["schema_"].alias == "schema"
    assert "workspace_revision" in AstEvidenceResponseV2.model_json_schema(by_alias=True)["properties"]


_EXISTING_PACKET = {
    "schema": "atlas.ast.evidence.v1",
    "engine": "treesitter-chunker",
    "engine_version": "fixture",
    "language": "python",
    "file_path": "src/a.py",
    "source_revision": "sha256:" + "a" * 64,
    "chunks": [],
}


def test_existing_json_packet_deserializes_unchanged_and_keeps_provenance():
    response = AstEvidenceResponseV2.model_validate(_EXISTING_PACKET)
    assert response.schema_ == "atlas.ast.evidence.v1"
    assert response.source_revision == _EXISTING_PACKET["source_revision"]
    assert response.file_path == "src/a.py"
    assert response.language == "python"


def test_serialized_packet_keeps_schema_key_and_emits_no_internal_names_or_extra_keys():
    response = AstEvidenceResponseV2.model_validate(_EXISTING_PACKET)
    dumped = response.model_dump(by_alias=True)
    allowed = set(AstEvidenceResponseV2.model_json_schema(by_alias=True)["properties"])
    assert dumped["schema"] == "atlas.ast.evidence.v1"
    assert "schema_" not in dumped
    assert set(dumped) <= allowed
    assert dumped["source_revision"] == _EXISTING_PACKET["source_revision"]


def test_schema_field_validation_is_unchanged_for_missing_and_wrong_values():
    from pydantic import ValidationError

    missing = {k: v for k, v in _EXISTING_PACKET.items() if k != "schema"}
    with pytest.raises(ValidationError):
        AstEvidenceResponseV2.model_validate(missing)
    wrong = {**_EXISTING_PACKET, "schema": "atlas.ast.evidence.v0"}
    with pytest.raises(ValidationError):
        AstEvidenceResponseV2.model_validate(wrong)
    no_engine = {k: v for k, v in _EXISTING_PACKET.items() if k != "engine"}
    with pytest.raises(ValidationError):
        AstEvidenceResponseV2.model_validate(no_engine)
