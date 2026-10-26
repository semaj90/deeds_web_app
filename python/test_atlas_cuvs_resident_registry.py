from __future__ import annotations

from dataclasses import replace
from hashlib import sha256

import numpy as np
import pytest

from atlas_compute.rapids_matrix import (
    RapidsKMeansArtifact,
    RapidsKMeansReceipt,
    build_kmeans_ordinal_assignments_v1,
)
from atlas_compute.som import build_som_ordinal_assignments_v1, train_deterministic_som
from atlas_cuvs_resident_registry import (
    CorpusIdentity,
    ResidentCuvsIndexRegistry,
    ResidentIndexBuildSpec,
    ResidentIndexSearchSpec,
    checksum_identity_order,
    TurboVecIndexCandidateV1,
    attach_kmeans_assignments_to_turbovec_candidates_v1,
    attach_som_assignments_to_turbovec_candidates_v1,
    turbovec_index_dataset_checksum_v1,
    turbovec_index_representation_revision_v1,
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


def test_turbovec_cagra_hnsw_roundtrip_keeps_source_taxonomy_and_ordinals():
    source_revision = "sha256:" + "a" * 64
    source_representation_revision = "sha256:" + "b" * 64
    quantizer_revision = "sha256:" + "c" * 64
    taxonomy_revision = "sha256:" + "d" * 64
    candidates = [
        TurboVecIndexCandidateV1(
            candidate_ordinal=40,
            packet_key="packet:high",
            source_ref="src/high.ts",
            source_revision=source_revision,
            symbol_version_id="symbol:high:v1",
            source_representation_id="ae.latent256",
            source_representation_revision=source_representation_revision,
            quantizer_revision=quantizer_revision,
            bits_per_value=4,
            minimum=0.0,
            maximum=1.0,
            packed_payload=bytes([0xFF]) * 64,
            payload_sha256=sha256(bytes([0xFF]) * 64).hexdigest(),
            domain_id="domain:retrieval",
            feature_id="feature:retrieval:ranker",
            feature_label="Retrieval Ranker",
            taxonomy_revision=taxonomy_revision,
            kmeans_cluster_id=2,
            som_bmu_id=3,
            cluster_assignment_revision="sha256:" + "9" * 64,
            som_assignment_revision="sha256:" + "8" * 64,
        ),
        TurboVecIndexCandidateV1(
            candidate_ordinal=7,
            packet_key="packet:low",
            source_ref="src/low.ts",
            source_revision="sha256:" + "e" * 64,
            symbol_version_id="symbol:low:v1",
            source_representation_id="ae.latent256",
            source_representation_revision=source_representation_revision,
            quantizer_revision=quantizer_revision,
            bits_per_value=4,
            minimum=0.0,
            maximum=1.0,
            packed_payload=bytes(64),
            payload_sha256=sha256(bytes(64)).hexdigest(),
            domain_id="domain:retrieval",
            feature_id="feature:retrieval:ranker",
            feature_label="Retrieval Ranker",
            taxonomy_revision=taxonomy_revision,
            kmeans_cluster_id=1,
            som_bmu_id=9,
            cluster_assignment_revision="sha256:" + "9" * 64,
            som_assignment_revision="sha256:" + "8" * 64,
        ),
    ]
    representation_revision = turbovec_index_representation_revision_v1(
        "ae.latent256", source_representation_revision, 4, quantizer_revision
    )
    spec = ResidentIndexBuildSpec(
        index_id="turbovec-cagra-fixture",
        algorithm="cagra",
        representation_id="atlas.turbovec.mrl128.int4.v1",
        representation_revision=representation_revision,
        workspace_revision="sha256:" + "f" * 64,
        dataset_checksum_sha256="0" * 64,
        metric="sqeuclidean",
        dimension=128,
        domain_id="domain:retrieval",
    )
    spec = replace(spec, dataset_checksum_sha256=turbovec_index_dataset_checksum_v1(spec, candidates))

    registry = ResidentCuvsIndexRegistry(FakeBackend())
    built = registry.build_turbovec_candidates_v1(spec, candidates)
    assert built["rows"] == 2
    converted = registry.convert_cagra_to_hnsw(spec.index_id, "turbovec-hnsw-fixture", hierarchy="cpu")
    result = registry.search(
        ResidentIndexSearchSpec(
            index_id="turbovec-hnsw-fixture",
            representation_revision=representation_revision,
            dataset_checksum_sha256=spec.dataset_checksum_sha256,
            top_k=2,
            domain_id="domain:retrieval",
        ),
        np.zeros((1, 128), dtype=np.float32),
    )

    first = result["results"][0][0]
    assert converted["datasetChecksumSha256"] == spec.dataset_checksum_sha256
    assert first["candidateOrdinal"] == 7
    assert first["packetKey"] == "packet:low"
    assert first["sourceRef"] == "src/low.ts"
    assert first["featureLabel"] == "Retrieval Ranker"
    assert first["taxonomyRevision"] == taxonomy_revision
    assert first["kmeansClusterId"] == 1
    assert first["somBmuId"] == 9
    assert first["clusterAssignmentRevision"] == "sha256:" + "9" * 64
    assert first["classificationAuthority"] == "PROPOSAL_ONLY"
    with pytest.raises(ValueError, match="resident index domain mismatch"):
        registry.search(
            replace(
                ResidentIndexSearchSpec(
                    index_id="turbovec-hnsw-fixture",
                    representation_revision=representation_revision,
                    dataset_checksum_sha256=spec.dataset_checksum_sha256,
                    top_k=1,
                    domain_id="domain:retrieval",
                ),
                domain_id="domain:other",
            ),
            np.zeros((1, 128), dtype=np.float32),
        )


def test_rapids_kmeans_assignments_join_turbovec_by_verified_ordinal_and_bytes():
    source_revision = "sha256:" + "a" * 64
    representation_revision = "sha256:" + "b" * 64
    quantizer_revision = "sha256:" + "c" * 64
    taxonomy_revision = "sha256:" + "d" * 64
    candidates = [
        TurboVecIndexCandidateV1(
            candidate_ordinal=40,
            packet_key="packet:forty",
            source_ref="src/forty.ts",
            source_revision=source_revision,
            symbol_version_id=None,
            source_representation_id="ae.latent256",
            source_representation_revision=representation_revision,
            quantizer_revision=quantizer_revision,
            bits_per_value=4,
            minimum=0.0,
            maximum=1.0,
            packed_payload=bytes([0xFF]) * 64,
            payload_sha256=sha256(bytes([0xFF]) * 64).hexdigest(),
            domain_id="domain:retrieval",
            feature_id="feature:retrieval:test",
            feature_label="Retrieval Test",
            taxonomy_revision=taxonomy_revision,
        ),
        TurboVecIndexCandidateV1(
            candidate_ordinal=7,
            packet_key="packet:seven",
            source_ref="src/seven.ts",
            source_revision=source_revision,
            symbol_version_id=None,
            source_representation_id="ae.latent256",
            source_representation_revision=representation_revision,
            quantizer_revision=quantizer_revision,
            bits_per_value=4,
            minimum=0.0,
            maximum=1.0,
            packed_payload=bytes(64),
            payload_sha256=sha256(bytes(64)).hexdigest(),
            domain_id="domain:retrieval",
            feature_id="feature:retrieval:test",
            feature_label="Retrieval Test",
            taxonomy_revision=taxonomy_revision,
        ),
    ]
    index_representation_revision = turbovec_index_representation_revision_v1(
        "ae.latent256", representation_revision, 4, quantizer_revision
    )
    spec = ResidentIndexBuildSpec(
        index_id="turbovec-kmeans-join-fixture",
        algorithm="cagra",
        representation_id="atlas.turbovec.mrl128.int4.v1",
        representation_revision=index_representation_revision,
        workspace_revision="sha256:" + "e" * 64,
        dataset_checksum_sha256="0" * 64,
        metric="sqeuclidean",
        dimension=128,
        domain_id="domain:retrieval",
    )
    spec = replace(spec, dataset_checksum_sha256=turbovec_index_dataset_checksum_v1(spec, candidates))
    training_matrix = np.stack([np.ones(128, dtype=np.float32), np.zeros(128, dtype=np.float32)])
    labels = np.asarray([0, 1], dtype=np.int64)
    centroids = np.asarray([[1.0] * 128, [0.0] * 128], dtype=np.float32)
    kmeans_receipt = RapidsKMeansReceipt(
        schema="atlas.rapids-kmeans-receipt.v2",
        rows=2,
        dimensions=128,
        n_clusters=2,
        metric="sqeuclidean",
        init_method="deterministic_farthest_first_array",
        initialization_ordinals=[0, 1],
        iterations=2,
        inertia=0.0,
        labels_checksum=sha256(labels.tobytes()).hexdigest(),
        input_checksum=sha256(training_matrix.tobytes()).hexdigest(),
        centroids_checksum=sha256(centroids.tobytes()).hexdigest(),
        canonical_authority=False,
    )
    kmeans_artifact = RapidsKMeansArtifact(kmeans_receipt, centroids, labels)
    assignments = build_kmeans_ordinal_assignments_v1(
        kmeans_artifact,
        [40, 7],
        candidate_identity_bindings=[
            {
                "candidateOrdinal": row.candidate_ordinal,
                "packetKey": row.packet_key,
                "sourceRef": row.source_ref,
                "sourceRevision": row.source_revision,
                "domainId": row.domain_id,
                "featureId": row.feature_id,
                "featureLabel": row.feature_label,
                "taxonomyRevision": row.taxonomy_revision,
            }
            for row in candidates
        ],
        candidate_vectors=training_matrix,
        workspace_revision=spec.workspace_revision,
        representation_revision=spec.representation_revision,
    )
    joined_spec, joined_candidates = attach_kmeans_assignments_to_turbovec_candidates_v1(
        spec, candidates, assignments
    )
    coordinates, _, som_receipt = train_deterministic_som(
        training_matrix,
        grid_rows=1,
        grid_columns=2,
        epochs=2,
        device="cpu",
    )
    som_assignments = build_som_ordinal_assignments_v1(
        coordinates,
        som_receipt,
        [40, 7],
        candidate_identity_bindings=assignments["candidateIdentityBindings"],
        candidate_vectors=training_matrix,
        workspace_revision=spec.workspace_revision,
        representation_revision=spec.representation_revision,
    )
    joined_spec, joined_candidates = attach_som_assignments_to_turbovec_candidates_v1(
        joined_spec, joined_candidates, som_assignments
    )
    by_ordinal = {row.candidate_ordinal: row for row in joined_candidates}
    assert by_ordinal[40].kmeans_cluster_id == 0
    assert by_ordinal[7].kmeans_cluster_id == 1
    assert by_ordinal[40].cluster_assignment_revision == assignments["assignmentRevision"]
    assert by_ordinal[40].som_bmu_id is not None
    assert by_ordinal[40].som_assignment_revision == som_assignments["assignmentRevision"]
    assert joined_spec.dataset_checksum_sha256 != spec.dataset_checksum_sha256
    built = ResidentCuvsIndexRegistry(FakeBackend()).build_turbovec_candidates_v1(
        joined_spec, joined_candidates
    )
    assert built["rows"] == len(candidates)
    assert built["domainId"] == "domain:retrieval"

    tampered = {**assignments, "assignments": [
        {**assignments["assignments"][0], "kmeansClusterId": 0},
        assignments["assignments"][1],
    ]}
    with pytest.raises(ValueError, match="LABEL_CHECKSUM_MISMATCH"):
        attach_kmeans_assignments_to_turbovec_candidates_v1(spec, candidates, tampered)
    identity_tamper = {
        **assignments,
        "candidateIdentityBindings": [
            {**assignments["candidateIdentityBindings"][0], "sourceRef": "src/other.ts"},
            assignments["candidateIdentityBindings"][1],
        ],
    }
    with pytest.raises(ValueError, match="IDENTITY_OR_VECTOR_BINDING_MISMATCH"):
        attach_kmeans_assignments_to_turbovec_candidates_v1(spec, candidates, identity_tamper)
    vector_tamper = {
        **assignments,
        "candidateIdentityBindings": [
            {**assignments["candidateIdentityBindings"][0], "vectorSha256": "0" * 64},
            assignments["candidateIdentityBindings"][1],
        ],
    }
    with pytest.raises(ValueError, match="IDENTITY_OR_VECTOR_BINDING_MISMATCH"):
        attach_kmeans_assignments_to_turbovec_candidates_v1(spec, candidates, vector_tamper)


def test_turbovec_index_checksum_binds_cluster_assignment_and_requires_pair():
    revision = "sha256:" + "a" * 64
    quantizer = "sha256:" + "b" * 64
    taxonomy = "sha256:" + "c" * 64
    payload = bytes(64)
    candidate = TurboVecIndexCandidateV1(
        candidate_ordinal=5,
        packet_key="packet:clustered",
        source_ref="src/clustered.ts",
        source_revision=revision,
        symbol_version_id=None,
        source_representation_id="ae.latent256",
        source_representation_revision=revision,
        quantizer_revision=quantizer,
        bits_per_value=4,
        minimum=0.0,
        maximum=1.0,
        packed_payload=payload,
        payload_sha256=sha256(payload).hexdigest(),
        domain_id="domain:retrieval",
        feature_id="feature:retrieval:test",
        feature_label="Retrieval Test",
        taxonomy_revision=taxonomy,
        kmeans_cluster_id=1,
        som_bmu_id=0,
        cluster_assignment_revision="sha256:" + "e" * 64,
    )
    representation_revision = turbovec_index_representation_revision_v1(
        "ae.latent256", revision, 4, quantizer
    )
    spec = ResidentIndexBuildSpec(
        index_id="turbovec-cluster-binding-fixture",
        algorithm="cagra",
        representation_id="atlas.turbovec.mrl128.int4.v1",
        representation_revision=representation_revision,
        workspace_revision="sha256:" + "d" * 64,
        dataset_checksum_sha256="0" * 64,
        metric="sqeuclidean",
        dimension=128,
        domain_id="domain:retrieval",
    )
    assigned_checksum = turbovec_index_dataset_checksum_v1(spec, [candidate])
    reassigned = replace(candidate, kmeans_cluster_id=2)
    assert turbovec_index_dataset_checksum_v1(spec, [reassigned]) != assigned_checksum
    revised_assignment = replace(candidate, cluster_assignment_revision="sha256:" + "f" * 64)
    assert turbovec_index_dataset_checksum_v1(spec, [revised_assignment]) != assigned_checksum

    incomplete = replace(candidate, cluster_assignment_revision=None)
    invalid_spec = replace(
        spec,
        dataset_checksum_sha256=turbovec_index_dataset_checksum_v1(spec, [incomplete]),
    )
    with pytest.raises(ValueError, match="CLUSTER_ASSIGNMENT_INCOMPLETE"):
        ResidentCuvsIndexRegistry(FakeBackend()).build_turbovec_candidates_v1(
            invalid_spec, [incomplete]
        )

    unclustered = replace(
        candidate,
        candidate_ordinal=6,
        packet_key="packet:unclustered",
        source_ref="src/unclustered.ts",
        kmeans_cluster_id=None,
        som_bmu_id=None,
        cluster_assignment_revision=None,
    )
    mixed = [candidate, unclustered]
    mixed_spec = replace(
        spec,
        dataset_checksum_sha256=turbovec_index_dataset_checksum_v1(spec, mixed),
    )
    with pytest.raises(ValueError, match="CLUSTER_ASSIGNMENT_COHORT_MISMATCH"):
        ResidentCuvsIndexRegistry(FakeBackend()).build_turbovec_candidates_v1(
            mixed_spec, mixed
        )


def test_turbovec_index_rejects_dataset_checksum_or_payload_tampering():
    source_revision = "sha256:" + "a" * 64
    representation_revision = "sha256:" + "b" * 64
    quantizer_revision = "sha256:" + "c" * 64
    payload = bytes(64)
    candidate = TurboVecIndexCandidateV1(
        candidate_ordinal=1,
        packet_key="packet:1",
        source_ref="src/one.ts",
        source_revision=source_revision,
        symbol_version_id=None,
        source_representation_id="ae.latent256",
        source_representation_revision=representation_revision,
        quantizer_revision=quantizer_revision,
        bits_per_value=4,
        minimum=-1.0,
        maximum=1.0,
        packed_payload=payload,
        payload_sha256=sha256(payload).hexdigest(),
        domain_id="domain:example",
        feature_id="feature:example",
        feature_label="Example Feature",
        taxonomy_revision="sha256:" + "d" * 64,
    )
    index_revision = turbovec_index_representation_revision_v1(
        "ae.latent256", representation_revision, 4, quantizer_revision
    )
    spec = ResidentIndexBuildSpec(
        index_id="turbovec-invalid-fixture",
        algorithm="cagra",
        representation_id="atlas.turbovec.mrl128.int4.v1",
        representation_revision=index_revision,
        workspace_revision="sha256:" + "e" * 64,
        dataset_checksum_sha256="0" * 64,
        metric="sqeuclidean",
        dimension=128,
        domain_id="domain:example",
    )
    valid_checksum = turbovec_index_dataset_checksum_v1(spec, [candidate])
    registry = ResidentCuvsIndexRegistry(FakeBackend())
    with pytest.raises(ValueError, match="DATASET_CHECKSUM_MISMATCH"):
        registry.build_turbovec_candidates_v1(spec, [candidate])

    tampered = replace(candidate, packed_payload=bytes([1]) * 64)
    spec = replace(spec, dataset_checksum_sha256=valid_checksum)
    with pytest.raises(ValueError, match="DATASET_CHECKSUM_MISMATCH"):
        registry.build_turbovec_candidates_v1(spec, [tampered])


def test_turbovec_int2_high_bit_first_decode_matches_cpu_query_oracle():
    payload = bytes([0b00011011]) * 32
    source_revision = "sha256:" + "1" * 64
    source_representation_revision = "sha256:" + "2" * 64
    quantizer_revision = "sha256:" + "3" * 64
    candidate = TurboVecIndexCandidateV1(
        candidate_ordinal=12,
        packet_key="packet:int2",
        source_ref="src/int2.ts",
        source_revision=source_revision,
        symbol_version_id="symbol:int2:v1",
        source_representation_id="ae.latent256",
        source_representation_revision=source_representation_revision,
        quantizer_revision=quantizer_revision,
        bits_per_value=2,
        minimum=0.0,
        maximum=1.0,
        packed_payload=payload,
        payload_sha256=sha256(payload).hexdigest(),
        domain_id="domain:retrieval",
        feature_id="feature:retrieval:int2",
        feature_label="INT2 Retrieval Fixture",
        taxonomy_revision="sha256:" + "4" * 64,
    )
    representation_revision = turbovec_index_representation_revision_v1(
        "ae.latent256", source_representation_revision, 2, quantizer_revision
    )
    spec = ResidentIndexBuildSpec(
        index_id="turbovec-int2-fixture",
        algorithm="cagra",
        representation_id="atlas.turbovec.mrl128.int2.v1",
        representation_revision=representation_revision,
        workspace_revision="sha256:" + "5" * 64,
        dataset_checksum_sha256="0" * 64,
        metric="sqeuclidean",
        dimension=128,
        domain_id="domain:retrieval",
    )
    spec = replace(spec, dataset_checksum_sha256=turbovec_index_dataset_checksum_v1(spec, [candidate]))
    registry = ResidentCuvsIndexRegistry(FakeBackend())
    registry.build_turbovec_candidates_v1(spec, [candidate])
    query = np.asarray([[0.0, 1.0 / 3.0, 2.0 / 3.0, 1.0] * 32], dtype=np.float32)
    result = registry.search(
        ResidentIndexSearchSpec(
            spec.index_id,
            representation_revision,
            spec.dataset_checksum_sha256,
            1,
            domain_id="domain:retrieval",
        ),
        query,
    )
    assert result["results"][0][0]["candidateOrdinal"] == 12
    assert result["results"][0][0]["distance"] < 1e-5
