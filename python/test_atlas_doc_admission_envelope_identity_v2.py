"""DOC-26: admission-envelope generation preserves the manifest chunk-ID version."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

from atlas_doc_manifest import SourceConfigV1
from atlas_doc_coordinate import external_doc_chunk_id_v2
from atlas_external_docs import _normalize_ws, _sha


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "atlas" / "build-external-doc-admission-envelopes-v1.py"


def _load_builder():
    spec = importlib.util.spec_from_file_location("external_doc_admission_envelopes_v1", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _source(identity_version: str) -> SourceConfigV1:
    return SourceConfigV1.model_validate({
        "source_id": "pgvector",
        "source_revision": "manifest-r1",
        "base_urls": ["https://github.com/pgvector/pgvector"],
        "allowed_domains": ["github.com"],
        "output_namespace": "docs/.okf/pinned/pgvector",
        "provider": "pgvector",
        "product": "pgvector",
        "product_version": "0.9.0",
        "version_qualification": "EXACT_VERSION",
        "chunk_identity_version": identity_version,
    })


def _envelope_for(tmp_path: Path, identity_version: str) -> dict:
    builder = _load_builder()
    builder.ROOT = tmp_path
    source = _source(identity_version)
    raw_dir = tmp_path / source.output_namespace / "raw"
    raw_dir.mkdir(parents=True)
    url = "https://github.com/pgvector/pgvector"
    text = "# Indexes\nVersioned HNSW indexing remains available.\n"
    normalized = _normalize_ws(text)
    receipt = {
        "requested_url": url,
        "resolved_url": url,
        "title": "pgvector indexes",
        "fetcher": "BEAUTIFULSOUP_HTTP",
        "raw_checksum": _sha("<html>fixture</html>"),
        "normalized_checksum": _sha(normalized),
        "fetched_at": "2026-09-24T00:00:00Z",
        "metadata": {"parserVersion": "4.12.3"},
    }
    (raw_dir / "page.json").write_text(json.dumps(receipt), encoding="utf-8")
    (raw_dir / "page.md").write_text(text, encoding="utf-8")
    manifest = SimpleNamespace(manifest_revision="manifest-r1", sources=(source,))
    coords = {"sources": {"pgvector": {"authorityClass": "OFFICIAL_PRIMARY", "urlOverrides": {}}}}
    envelopes, _summary = builder.build(manifest, coords)
    assert len(envelopes) == 1
    return envelopes[0]


def test_admission_envelope_builder_uses_v2_selection_and_preserves_v1(tmp_path, monkeypatch):
    v1 = _envelope_for(tmp_path / "v1", "V1")
    v2 = _envelope_for(tmp_path / "v2", "V2")

    old_chunk = v1["chunks"][0]
    new_chunk = v2["chunks"][0]
    assert old_chunk["chunkId"].startswith("doc:pgvector:")
    assert new_chunk["chunkId"] == external_doc_chunk_id_v2(
        source_id="pgvector", chunk_evidence_revision=new_chunk["evidenceRevision"]
    )
    assert old_chunk["chunkId"] != new_chunk["chunkId"]
    assert old_chunk["evidenceRevision"] == new_chunk["evidenceRevision"]

