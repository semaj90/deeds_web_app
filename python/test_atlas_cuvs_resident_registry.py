from __future__ import annotations

import numpy as np
import pytest

from atlas_cuvs_resident_registry import (
    CorpusIdentity,
    ResidentCuvsIndexRegistry,
    ResidentIndexBuildSpec,
    ResidentIndexSearchSpec,
    checksum_identity_order,
)


class FakeBackend:
    def build(self, algorithm, vectors, metric, params):
        exact = algorithm == "brute_force"
        mutable = algorithm in ("ivf_flat", "ivf_pq")
        return {"algorithm": algorithm, "vectors": np.asarray(vectors).copy()}, "GPU", exact, mutable

    def search(self, algorithm, index, queries, k, params):
        x = index["vectors"]
        q = np.asarray(queries, dtype=np.float32)
        distances = ((q[:, None, :] - x[None, :, :]) ** 2).sum(axis=2)
        ordinals = np.argsort(distances, axis=1)[:, :k]
        values = np.take_along_axis(distances, ordinals, axis=1)
        return values.astype(np.float32), ordinals.astype(np.int64)

    def convert_cagra_to_hnsw(self, index, hierarchy, params):
        return {"algorithm": "hnsw_from_cagra", "vectors": index["vectors"].copy()}, hierarchy == "cpu"


def identities():
    return [
        CorpusIdentity("p0", "r1", "s0"),
        CorpusIdentity("p1", "r1", "s1"),
        CorpusIdentity("p2", "r1", "s2"),
    ]


def vectors():
    return np.asarray([[0, 0], [1, 0], [0, 2]], dtype=np.float32)


def build_spec(index_id="exact", algorithm="brute_force", metric="sqeuclidean"):
    return ResidentIndexBuildSpec(
        index_id=index_id,
        algorithm=algorithm,
        representation_id="fixture_2",
        representation_revision="rep-7",
        workspace_revision="ws-42",
        dataset_checksum_sha256="a" * 64,
        metric=metric,
        dimension=2,
    )


def test_build_search_preserves_revisioned_identity():
    registry = ResidentCuvsIndexRegistry(FakeBackend())
    meta = registry.build(build_spec(), identities(), vectors())
    assert meta["exact"] is True
    assert meta["memoryTier"] == "GPU"
    assert meta["rows"] == 3

    result = registry.search(
        ResidentIndexSearchSpec(
            index_id="exact",
            representation_revision="rep-7",
            dataset_checksum_sha256="a" * 64,
            top_k=2,
        ),
        np.asarray([[0.1, 0]], dtype=np.float32),
    )
    assert [row["packetKey"] for row in result["results"][0]] == ["p0", "p1"]
    assert [row["sourceRevision"] for row in result["results"][0]] == ["r1", "r1"]


def test_stale_revision_and_checksum_fail_closed():
    registry = ResidentCuvsIndexRegistry(FakeBackend())
    registry.build(build_spec(), identities(), vectors())
    with pytest.raises(ValueError, match="stale representation"):
        registry.search(ResidentIndexSearchSpec("exact", "rep-old", "a" * 64, 1), np.zeros((1, 2), dtype=np.float32))
    with pytest.raises(ValueError, match="stale dataset"):
        registry.search(ResidentIndexSearchSpec("exact", "rep-7", "b" * 64, 1), np.zeros((1, 2), dtype=np.float32))


def test_duplicate_identity_rejected():
    registry = ResidentCuvsIndexRegistry(FakeBackend())
    bad = [CorpusIdentity("p0", "r1"), CorpusIdentity("p0", "r1"), CorpusIdentity("p2", "r1")]
    with pytest.raises(ValueError, match="duplicate corpus identity"):
        registry.build(build_spec(), bad, vectors())


def test_cagra_to_hnsw_moves_to_cpu_residency_without_semantic_reidentity():
    registry = ResidentCuvsIndexRegistry(FakeBackend())
    registry.build(build_spec("hot", "cagra", "sqeuclidean"), identities(), vectors())
    converted = registry.convert_cagra_to_hnsw("hot", "warm", hierarchy="cpu", release_source=True)
    assert converted["algorithm"] == "hnsw_from_cagra"
    assert converted["memoryTier"] == "CPU_RAM"
    assert converted["sourceIndexId"] == "hot"
    assert converted["representationRevision"] == "rep-7"
    assert converted["datasetChecksumSha256"] == "a" * 64
    assert [row["indexId"] for row in registry.list()] == ["warm"]


def test_cagra_to_hnsw_blocks_unproven_cosine_conversion_contract():
    registry = ResidentCuvsIndexRegistry(FakeBackend())
    registry.build(build_spec("hot", "cagra", "cosine"), identities(), vectors())
    with pytest.raises(ValueError, match="restricted to sqeuclidean/inner_product"):
        registry.convert_cagra_to_hnsw("hot", "warm")


def test_identity_order_checksum_changes_when_ordinal_mapping_changes():
    first = identities()
    second = [first[1], first[0], first[2]]
    assert checksum_identity_order(first) != checksum_identity_order(second)
