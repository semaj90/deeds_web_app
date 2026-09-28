from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/atlas/chunk-langchain-doc-corpus-v1.py"
SPEC = importlib.util.spec_from_file_location("chunk_langchain_doc_corpus_v1", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def _fixture(root: Path) -> tuple[Path, Path]:
    run = root / "run"
    (run / "pages").mkdir(parents=True)
    text = "# Persistence\n\nLangGraph’s checkpoints preserve thread state.\n\n```python\nstate = checkpoint()\n```\n"
    artifact_rel = "pages/page.md"
    (run / artifact_rel).write_text(text, encoding="utf-8")
    content_hash = MODULE._sha(text.encode("utf-8"))
    rows = [{
        "status": "FETCHED", "sectionId": "langgraph-python", "product": "langgraph",
        "canonicalUrl": "https://docs.langchain.com/oss/python/langgraph/persistence.md",
        "resolvedUrl": "https://docs.langchain.com/oss/python/langgraph/persistence.md",
        "fetchMethod": "DIRECT_MARKDOWN", "rawSha256": content_hash,
        "normalizedSha256": content_hash, "artifactPath": artifact_rel,
        "canonicalAuthority": False,
    }]
    manifest = b"".join(MODULE._stable(row) + b"\n" for row in rows)
    (run / "pages.jsonl").write_bytes(manifest)
    (run / "receipt.json").write_text(json.dumps({
        "schema": "atlas.langchain-doc-fetch-receipt.v1",
        "generatedAt": "2026-09-26T23:23:53.588Z",
        "pagesManifestSha256": MODULE._sha(manifest),
        "discoveredUrlCount": 2, "fetchedPageCount": 1, "failedPageCount": 1,
        "failures": [{"status": "FETCH_FAILED", "sectionId": "deepagents-python",
                      "canonicalUrl": "https://docs.langchain.com/oss/python/deepagents/code-link.md",
                      "reason": "HTTP_404", "fallbackStatus": "NOT_CONFIGURED"}],
        "writes": {"postgres": 0, "qdrant": 0},
    }), encoding="utf-8")
    config = root / "corpus.json"
    config.write_text(json.dumps({
        "corpusId": "langchain-docs-python-core", "authority": "https://docs.langchain.com",
        "sections": [{"id": "langgraph-python", "product": "langgraph", "allowedPathPrefix": "/oss/python/langgraph/"},
                     {"id": "deepagents-python", "product": "deepagents", "allowedPathPrefix": "/oss/python/deepagents/"}],
    }), encoding="utf-8")
    return run, config


def test_builds_repeatable_version_qualified_chunk_artifacts(tmp_path: Path) -> None:
    run, config = _fixture(tmp_path)
    first, first_receipt = MODULE.build_chunks(run, config)
    second, second_receipt = MODULE.build_chunks(run, config)
    assert first_receipt["status"] == "PARTIAL_ARTIFACT_COHORT"
    assert first_receipt["fetchedPageCount"] + first_receipt["failedPageCount"] == 2
    assert first_receipt["chunkCount"] == 1
    assert first_receipt["chunkManifestSha256"] == second_receipt["chunkManifestSha256"]
    assert first[0]["chunk_id"].startswith("doc:v2:")
    assert first[0]["doc_coordinate"]["product_version"] == "CURRENT_UPSTREAM@2026-09-26"
    assert first[0]["canonical_authority"] is False
    assert first_receipt["writes"]["postgres"] == 0
    normalized = MODULE._normalize_ws((run / "pages/page.md").read_text(encoding="utf-8")).encode("utf-8")
    assert normalized[first[0]["start_byte"]:first[0]["end_byte"]].decode("utf-8") == first[0]["text"]


def test_streaming_and_collected_modes_have_identical_manifest_digest(tmp_path: Path) -> None:
    run, config = _fixture(tmp_path)
    collected, collected_receipt = MODULE.build_chunks(run, config)
    streamed_lines: list[bytes] = []
    _, streamed_receipt = MODULE.build_chunks(run, config, chunk_sink=streamed_lines.append)
    assert len(collected) == streamed_receipt["chunkCount"]
    assert b"".join(streamed_lines) == b"".join(MODULE._stable(row) + b"\n" for row in collected)
    assert collected_receipt["chunkManifestSha256"] == streamed_receipt["chunkManifestSha256"]


def test_rejects_fetch_manifest_digest_drift(tmp_path: Path) -> None:
    run, config = _fixture(tmp_path)
    (run / "pages.jsonl").write_text("{}\n", encoding="utf-8")
    with pytest.raises(ValueError, match="FETCH_MANIFEST_CHECKSUM_MISMATCH"):
        MODULE.build_chunks(run, config)


def test_rejects_url_outside_declared_prefix(tmp_path: Path) -> None:
    run, config = _fixture(tmp_path)
    rows = [json.loads(line) for line in (run / "pages.jsonl").read_text(encoding="utf-8").splitlines()]
    rows[0]["canonicalUrl"] = "https://docs.langchain.com/oss/python/deepagents/not-langgraph.md"
    manifest = b"".join(MODULE._stable(row) + b"\n" for row in rows)
    (run / "pages.jsonl").write_bytes(manifest)
    receipt = json.loads((run / "receipt.json").read_text(encoding="utf-8"))
    receipt["pagesManifestSha256"] = MODULE._sha(manifest)
    (run / "receipt.json").write_text(json.dumps(receipt), encoding="utf-8")
    with pytest.raises(ValueError, match="FETCH_URL_OUTSIDE_DECLARED_SECTION"):
        MODULE.build_chunks(run, config)


def test_conserves_but_does_not_chunk_out_of_prefix_redirect(tmp_path: Path) -> None:
    run, config = _fixture(tmp_path)
    rows = [json.loads(line) for line in (run / "pages.jsonl").read_text(encoding="utf-8").splitlines()]
    rows[0]["resolvedUrl"] = "https://docs.langchain.com/oss/openwiki/overview.md"
    manifest = b"".join(MODULE._stable(row) + b"\n" for row in rows)
    (run / "pages.jsonl").write_bytes(manifest)
    receipt = json.loads((run / "receipt.json").read_text(encoding="utf-8"))
    receipt["pagesManifestSha256"] = MODULE._sha(manifest)
    (run / "receipt.json").write_text(json.dumps(receipt), encoding="utf-8")
    chunks, result = MODULE.build_chunks(run, config)
    assert chunks == []
    assert result["scopeAdmittedPageCount"] == 0
    assert result["scopeRejectedPageCount"] == 1
    assert result["discoveryOutcomeConserved"] is True
    assert result["scopeRejectionRows"][0]["reason"] == "REDIRECT_OUTSIDE_DECLARED_SECTION"


def test_rejects_page_content_digest_drift(tmp_path: Path) -> None:
    run, config = _fixture(tmp_path)
    (run / "pages/page.md").write_text("tampered", encoding="utf-8")
    with pytest.raises(ValueError, match="FETCH_PAGE_CHECKSUM_MISMATCH"):
        MODULE.build_chunks(run, config)
