"""Tests for DOC-08: Qdrant dense projection (parent-atlas-versioned-doc-intelligence).

Reconciliation note (from this change's own DOC-06A audit): the existing
packages/parent-atlas/src/core/external-doc-qdrant-hybrid.ts confirms
external_programming_docs_768 -- this repo's real, currently-live collection,
verified via a direct GET against it (unnamed dense vector(768), Cosine,
points_count: 0, never actually populated) -- is that TS migration plan's own
source_collection for a later hybrid (dense+BM25 sparse) cutover. DOC-08 is
scoped to the dense-only half only, per this change's own reconciliation
decision: leave the hybrid cutover to the existing, more mature TS design
rather than building a second, disconnected sparse-vector implementation here.

qdrant_points()/build_qdrant_points() already had unit coverage (fail-closed
shape/finiteness checks, UUID point-id projection) before this session.
qdrant_upsert()/qdrant_ensure_payload_indexes() -- the actual HTTP write path
-- had zero tests, live or otherwise. This file closes that gap with a real
integration proof against the live Qdrant instance, using a disposable test
collection (never touches external_programming_docs_768 itself).
"""

from __future__ import annotations

import json
import urllib.request
from dataclasses import replace

import numpy as np
import pytest

from atlas_doc_coordinate import build_doc_coordinate
from atlas_external_docs import chunk_document
from atlas_okf_docs_pipeline import (
    PipelineManifest,
    build_qdrant_points,
    qdrant_ensure_payload_indexes,
    qdrant_upsert,
)

# host.docker.internal (not 127.0.0.1) -- this test runs inside the
# miniforge-nlp-sidecar container, where 127.0.0.1 is the container's own
# loopback, not the host's; confirmed live via
# `docker exec miniforge-nlp-sidecar curl host.docker.internal:6333/collections`.
_QDRANT_URL = "http://host.docker.internal:6333"
_TEST_COLLECTION = "external_programming_docs_768_doc08_proof"


def _qdrant_available() -> bool:
    try:
        with urllib.request.urlopen(f"{_QDRANT_URL}/collections", timeout=3) as response:
            return response.status == 200
    except Exception:
        return False


_SKIP_REASON = "Qdrant not reachable at :6333 in this environment"


def _http(method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        f"{_QDRANT_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read())


def _minimal_manifest() -> PipelineManifest:
    return PipelineManifest(
        manifest_revision="doc08-proof-r1",
        workspace_revision="w1",
        source_snapshot_revision="s1",
        producer_revision="doc08-proof-r1",
        output_root=".",
        sources=(),
        qdrant_collection=_TEST_COLLECTION,
        qdrant_url=_QDRANT_URL,
        qdrant_api_key_env=None,
        embedding_url="http://127.0.0.1:8081",
        embedding_model="embeddinggemma-300m-f16.gguf",
        low_rank=64,
        kmeans_clusters=64,
        som_rows=20,
        som_columns=20,
    )


@pytest.fixture()
def qdrant_test_collection():
    if not _qdrant_available():
        pytest.skip(_SKIP_REASON)
    # Confirm the REAL collection's live vector schema matches what this test
    # (and DOC-08's dense-only scope) assumes, before creating an identically
    # shaped disposable one -- if this ever drifts, this test should fail
    # loudly rather than silently test against a stale assumption.
    real = _http("GET", "/collections/external_programming_docs_768")
    real_vectors = real["result"]["config"]["params"]["vectors"]
    assert real_vectors == {"size": 768, "distance": "Cosine"}, (
        "external_programming_docs_768's live vector schema changed -- "
        "DOC-08's dense-only assumption needs revisiting, not this test silently adjusting."
    )

    _http(
        "PUT",
        f"/collections/{_TEST_COLLECTION}",
        {"vectors": {"size": 768, "distance": "Cosine"}},
    )
    try:
        yield
    finally:
        _http("DELETE", f"/collections/{_TEST_COLLECTION}")


def test_live_upsert_and_readback(qdrant_test_collection):
    coordinate = build_doc_coordinate(
        provider="nvidia", product="cuda-tile-ir", product_version="13.2", architecture="sm_86",
        language="python", url="https://docs.nvidia.com/cuda/tile-ir/13.2/doc08-proof/",
        content_hash="a" * 64,
    )
    chunks = chunk_document(
        source_id="doc08-proof", source_revision="sha256:" + "b" * 64,
        source_url=coordinate.url, title="DOC-08 proof", text="# H\nProof chunk text.",
        doc_coordinate=coordinate,
    )
    manifest = _minimal_manifest()
    embeddings = np.random.default_rng(seed=42).normal(size=(len(chunks), 768)).astype(np.float32)
    embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True)

    points = build_qdrant_points(
        chunks, embeddings, feature_rows={}, producer_revision=manifest.producer_revision,
    )
    receipt = qdrant_upsert(manifest, points)

    assert receipt["schema"] == "atlas.external-doc-qdrant-upsert-receipt.v1"
    assert receipt["points"] == len(points)
    assert receipt["canonical_authority"] is False

    readback = _http("GET", f"/collections/{_TEST_COLLECTION}/points/{points[0]['id']}")
    assert readback["result"]["id"] == points[0]["id"]
    assert readback["result"]["payload"]["chunk_id"] == chunks[0].chunk_id
    assert readback["result"]["payload"]["canonical_authority"] is False


def test_live_payload_indexes_declared(qdrant_test_collection):
    manifest = replace(_minimal_manifest())
    receipt = qdrant_ensure_payload_indexes(manifest)
    assert receipt["schema"] == "atlas.external-doc-payload-index-receipt.v1"
    assert receipt["collection"] == _TEST_COLLECTION
    assert receipt["canonical_authority"] is False
    assert len(receipt["fields"]) > 0

    collection = _http("GET", f"/collections/{_TEST_COLLECTION}")
    payload_schema = collection["result"]["payload_schema"]
    assert "source_revision" in payload_schema
    assert "domain_class" in payload_schema
