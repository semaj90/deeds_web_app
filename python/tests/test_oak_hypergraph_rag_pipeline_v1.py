"""Tests for the sealed OaK + PG18 pgvector + DSPy lm15 HyperGraphRAG pipeline."""
from __future__ import annotations

from atlas_graph_runtime.oak_hypergraph_rag_pipeline_v1 import (
    run_sealed_oak_hypergraph_rag_v1,
)


def test_oak_prefill_does_not_masquerade_as_admitted_ace_context() -> None:
    prefill = {
        "memoryTelemetry": {"mmapUsed": False, "pgvectorSsdBacked": True, "tracemallocPeakBytes": 1234},
        "hits": [
            {
                "chunkId": "c-1",
                "relativePath": "docs/atlas/db-schema-migration-guidelines.md",
                "cosineSimilarity": 0.89,
            }
        ],
    }
    hydrated = {
        "c-1": {
            "chunkId": "c-1",
            "sourceRef": "docs/atlas/db-schema-migration-guidelines.md",
            "sourceRevision": "git:abc",
            "text": "Always use migrate not drizzle-kit push on live data in production.",
        }
    }
    res = run_sealed_oak_hypergraph_rag_v1(
        task_id="oak-pipe-1",
        query_text="How should Drizzle migrations run?",
        source_revision="sha256:" + "a" * 64,
        workspace_revision="sha256:" + "b" * 64,
        graph_snapshot_revision="sha256:" + "c" * 64,
        prefill_result=prefill,
        hydrated_chunks=hydrated,
    )
    assert res["canonicalAuthority"] is False
    assert res["writesPerformed"] is False
    assert res["hiddenStatePersisted"] is False
    assert res["status"] == "CANONICAL_ACE_CONTEXT_REQUIRED"
    assert res["prefillManifestChecksum"].startswith("sha256:")
    assert res["recommendation"]["citationVerified"] is False


def test_oak_prefill_rejects_missing_revision_inputs_instead_of_minting_defaults() -> None:
    res = run_sealed_oak_hypergraph_rag_v1(
        task_id="oak-pipe-2",
        query_text="How should Drizzle migrations run?",
        prefill_result={"hits": [{"chunkId": "c-1", "relativePath": "docs/migrations.md"}]},
        hydrated_chunks={"c-1": {"chunkId": "c-1", "sourceRef": "docs/migrations.md", "sourceRevision": "untrusted", "text": "Use migrate."}},
    )
    assert res["status"] == "PREFILL_LINEAGE_REQUIRED"
    assert res["canonicalAuthority"] is False
    assert res["writesPerformed"] is False
