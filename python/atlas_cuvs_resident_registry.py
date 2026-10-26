from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace as dataclass_replace
from datetime import datetime, timezone
from hashlib import sha256
import json
import math
import re
from pathlib import PurePosixPath
import struct
from typing import Any, Iterable, Literal, Protocol

import numpy as np

Algorithm = Literal["brute_force", "cagra", "ivf_flat", "ivf_pq", "hnsw_from_cagra"]
Metric = Literal["cosine", "sqeuclidean", "inner_product"]
MemoryTier = Literal["GPU", "CPU_RAM"]

_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
_SHA256_REVISION_RE = re.compile(r"^sha256:[a-f0-9]{64}$")


@dataclass(frozen=True)
class CorpusIdentity:
    packet_key: str
    source_revision: str
    symbol_version_id: str | None = None
    source_ref: str | None = None
    candidate_ordinal: int | None = None
    domain_id: str | None = None
    feature_id: str | None = None
    feature_label: str | None = None
    taxonomy_revision: str | None = None
    kmeans_cluster_id: int | None = None
    som_bmu_id: int | None = None
    cluster_assignment_revision: str | None = None
    classification_authority: Literal["PROPOSAL_ONLY"] = "PROPOSAL_ONLY"

    def key(self) -> tuple[str, str]:
        return (self.packet_key, self.source_revision)


@dataclass(frozen=True)
class TurboVecIndexCandidateV1:
    candidate_ordinal: int
    packet_key: str
    source_ref: str
    source_revision: str
    symbol_version_id: str | None
    source_representation_id: str
    source_representation_revision: str
    quantizer_revision: str
    bits_per_value: Literal[2, 4]
    minimum: float
    maximum: float
    packed_payload: bytes
    payload_sha256: str
    domain_id: str
    feature_id: str
    feature_label: str
    taxonomy_revision: str
    kmeans_cluster_id: int | None = None
    som_bmu_id: int | None = None
    cluster_assignment_revision: str | None = None


@dataclass(frozen=True)
class ResidentIndexBuildSpec:
    index_id: str
    algorithm: Algorithm
    representation_id: str
    representation_revision: str
    workspace_revision: str
    dataset_checksum_sha256: str
    metric: Metric
    dimension: int
    build_params: dict[str, Any] = field(default_factory=dict)
    domain_id: str | None = None


@dataclass(frozen=True)
class ResidentIndexSearchSpec:
    index_id: str
    representation_revision: str
    dataset_checksum_sha256: str
    top_k: int
    search_params: dict[str, Any] = field(default_factory=dict)
    domain_id: str | None = None


@dataclass
class ResidentIndexEntry:
    spec: ResidentIndexBuildSpec
    identities: tuple[CorpusIdentity, ...]
    index: Any
    memory_tier: MemoryTier
    exact: bool
    mutable: bool
    built_at: str
    dataset_bytes: int
    source_index_id: str | None = None

    def metadata(self) -> dict[str, Any]:
        return {
            "indexId": self.spec.index_id,
            "algorithm": self.spec.algorithm,
            "representationId": self.spec.representation_id,
            "representationRevision": self.spec.representation_revision,
            "workspaceRevision": self.spec.workspace_revision,
            "datasetChecksumSha256": self.spec.dataset_checksum_sha256,
            "domainId": self.spec.domain_id,
            "metric": self.spec.metric,
            "dimension": self.spec.dimension,
            "rows": len(self.identities),
            "memoryTier": self.memory_tier,
            "exact": self.exact,
            "mutable": self.mutable,
            "builtAt": self.built_at,
            "datasetBytes": self.dataset_bytes,
            "sourceIndexId": self.source_index_id,
            "buildParams": dict(self.spec.build_params),
        }


def turbovec_index_representation_revision_v1(
    source_representation_id: str,
    source_representation_revision: str,
    bits_per_value: Literal[2, 4],
    quantizer_revision: str,
) -> str:
    if not source_representation_id or not _SHA256_REVISION_RE.fullmatch(source_representation_revision):
        raise ValueError("TURBOVEC_SOURCE_REPRESENTATION_REVISION_INVALID")
    if bits_per_value not in (2, 4) or not _SHA256_REVISION_RE.fullmatch(quantizer_revision):
        raise ValueError("TURBOVEC_QUANTIZER_REVISION_INVALID")
    canonical = json.dumps({
        "schema": "atlas.turbovec-index-representation.v1",
        "sourceRepresentationId": source_representation_id,
        "sourceRepresentationRevision": source_representation_revision,
        "bitsPerValue": bits_per_value,
        "quantizerRevision": quantizer_revision,
    }, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + sha256(canonical).hexdigest()


def turbovec_index_dataset_checksum_v1(
    spec: ResidentIndexBuildSpec,
    candidates: Iterable[TurboVecIndexCandidateV1],
) -> str:
    rows = sorted(candidates, key=lambda row: row.candidate_ordinal)
    canonical_rows = []
    for row in rows:
        canonical_rows.append({
            "candidateOrdinal": row.candidate_ordinal,
            "packetKey": row.packet_key,
            "sourceRef": row.source_ref,
            "sourceRevision": row.source_revision,
            "symbolVersionId": row.symbol_version_id,
            "sourceRepresentationId": row.source_representation_id,
            "sourceRepresentationRevision": row.source_representation_revision,
            "quantizerRevision": row.quantizer_revision,
            "bitsPerValue": row.bits_per_value,
            "minimumFloat32": struct.pack("<f", row.minimum).hex(),
            "maximumFloat32": struct.pack("<f", row.maximum).hex(),
            "payloadSha256": sha256(row.packed_payload).hexdigest(),
            "domainId": row.domain_id,
            "featureId": row.feature_id,
            "featureLabel": row.feature_label,
            "taxonomyRevision": row.taxonomy_revision,
            "kmeansClusterId": row.kmeans_cluster_id,
            "somBmuId": row.som_bmu_id,
            "clusterAssignmentRevision": row.cluster_assignment_revision,
        })
    canonical = json.dumps({
        "schema": "atlas.turbovec-index-dataset.v1",
        "workspaceRevision": spec.workspace_revision,
        "representationId": spec.representation_id,
        "representationRevision": spec.representation_revision,
        "metric": spec.metric,
        "dimension": 128,
        "candidates": canonical_rows,
    }, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha256(canonical).hexdigest()


def _prepare_turbovec_index_candidates_v1(
    spec: ResidentIndexBuildSpec,
    candidates: Iterable[TurboVecIndexCandidateV1],
) -> tuple[tuple[CorpusIdentity, ...], np.ndarray]:
    rows = sorted(candidates, key=lambda row: row.candidate_ordinal)
    if not rows:
        raise ValueError("TURBOVEC_INDEX_CANDIDATES_MUST_NOT_BE_EMPTY")
    assignment_revisions = {row.cluster_assignment_revision for row in rows}
    assignment_presence = {row.kmeans_cluster_id is not None for row in rows}
    if len(assignment_revisions) != 1 or len(assignment_presence) != 1:
        raise ValueError("TURBOVEC_INDEX_CLUSTER_ASSIGNMENT_COHORT_MISMATCH")
    if not _SHA256_REVISION_RE.fullmatch(spec.workspace_revision):
        raise ValueError("TURBOVEC_INDEX_WORKSPACE_REVISION_INVALID")
    bit_width = rows[0].bits_per_value
    representation_id = f"atlas.turbovec.mrl128.int{bit_width}.v1"
    if spec.dimension != 128 or spec.representation_id != representation_id:
        raise ValueError("TURBOVEC_INDEX_REPRESENTATION_MISMATCH")
    source_signature = (
        rows[0].source_representation_id,
        rows[0].source_representation_revision,
        rows[0].quantizer_revision,
    )
    expected_revision = turbovec_index_representation_revision_v1(
        source_signature[0], source_signature[1], bit_width, source_signature[2]
    )
    if spec.representation_revision != expected_revision:
        raise ValueError("TURBOVEC_INDEX_REVISION_MISMATCH")
    if spec.dataset_checksum_sha256 != turbovec_index_dataset_checksum_v1(spec, rows):
        raise ValueError("TURBOVEC_INDEX_DATASET_CHECKSUM_MISMATCH")

    identities: list[CorpusIdentity] = []
    vectors: list[list[float]] = []
    seen_ordinals: set[int] = set()
    expected_payload_length = 128 * bit_width // 8
    levels = (1 << bit_width) - 1

    for row_number, row in enumerate(rows):
        if row.bits_per_value != bit_width or (
            row.source_representation_id,
            row.source_representation_revision,
            row.quantizer_revision,
        ) != source_signature:
            raise ValueError(f"TURBOVEC_INDEX_ROW_RECIPE_MISMATCH:{row_number}")
        if isinstance(row.candidate_ordinal, bool) or not isinstance(row.candidate_ordinal, int) or not 0 <= row.candidate_ordinal <= 0xFFFFFFFF:
            raise ValueError(f"TURBOVEC_INDEX_ORDINAL_INVALID:{row_number}")
        if row.candidate_ordinal in seen_ordinals:
            raise ValueError("TURBOVEC_INDEX_ORDINALS_MUST_BE_UNIQUE")
        seen_ordinals.add(row.candidate_ordinal)
        path = PurePosixPath(row.source_ref)
        if path.is_absolute() or path.as_posix() != row.source_ref or "\\" in row.source_ref or any(part in {"", ".", ".."} for part in path.parts):
            raise ValueError(f"TURBOVEC_INDEX_SOURCE_REF_INVALID:{row_number}")
        if not _SHA256_REVISION_RE.fullmatch(row.source_revision):
            raise ValueError(f"TURBOVEC_INDEX_SOURCE_REVISION_INVALID:{row_number}")
        if not _SHA256_REVISION_RE.fullmatch(row.taxonomy_revision):
            raise ValueError(f"TURBOVEC_INDEX_TAXONOMY_REVISION_INVALID:{row_number}")
        if not all((row.packet_key, row.domain_id, row.feature_id, row.feature_label)):
            raise ValueError(f"TURBOVEC_INDEX_FEATURE_BINDING_INCOMPLETE:{row_number}")
        assignment_fields = (
            row.kmeans_cluster_id,
            row.som_bmu_id,
            row.cluster_assignment_revision,
        )
        if any(value is not None for value in assignment_fields) and not all(
            value is not None for value in assignment_fields
        ):
            raise ValueError(f"TURBOVEC_INDEX_CLUSTER_ASSIGNMENT_INCOMPLETE:{row_number}")
        if row.cluster_assignment_revision is not None and not _SHA256_REVISION_RE.fullmatch(
            row.cluster_assignment_revision
        ):
            raise ValueError(f"TURBOVEC_INDEX_CLUSTER_ASSIGNMENT_REVISION_INVALID:{row_number}")
        if row.kmeans_cluster_id is not None and (
            isinstance(row.kmeans_cluster_id, bool)
            or not isinstance(row.kmeans_cluster_id, int)
            or not 0 <= row.kmeans_cluster_id <= 0xFFFF
            or isinstance(row.som_bmu_id, bool)
            or not isinstance(row.som_bmu_id, int)
            or not 0 <= row.som_bmu_id < 400
        ):
            raise ValueError(f"TURBOVEC_INDEX_CLUSTER_ASSIGNMENT_INVALID:{row_number}")
        if len(row.packed_payload) != expected_payload_length:
            raise ValueError(f"TURBOVEC_INDEX_PAYLOAD_LENGTH_INVALID:{row_number}")
        if not _SHA256_RE.fullmatch(row.payload_sha256) or sha256(row.packed_payload).hexdigest() != row.payload_sha256:
            raise ValueError(f"TURBOVEC_INDEX_PAYLOAD_DIGEST_MISMATCH:{row_number}")
        if not math.isfinite(row.minimum) or not math.isfinite(row.maximum) or row.maximum < row.minimum:
            raise ValueError(f"TURBOVEC_INDEX_RANGE_INVALID:{row_number}")

        scale = (row.maximum - row.minimum) / levels if row.maximum != row.minimum else 0.0
        values: list[float] = []
        if bit_width == 4:
            for packed in row.packed_payload:
                values.append(row.minimum + ((packed >> 4) & 0x0F) * scale)
                values.append(row.minimum + (packed & 0x0F) * scale)
        else:
            for packed in row.packed_payload:
                for shift in (6, 4, 2, 0):
                    values.append(row.minimum + ((packed >> shift) & 0x03) * scale)

        identities.append(CorpusIdentity(
            packet_key=row.packet_key,
            source_revision=row.source_revision,
            symbol_version_id=row.symbol_version_id,
            source_ref=row.source_ref,
            candidate_ordinal=row.candidate_ordinal,
            domain_id=row.domain_id,
            feature_id=row.feature_id,
            feature_label=row.feature_label,
            taxonomy_revision=row.taxonomy_revision,
            kmeans_cluster_id=row.kmeans_cluster_id,
            som_bmu_id=row.som_bmu_id,
            cluster_assignment_revision=row.cluster_assignment_revision,
            classification_authority="PROPOSAL_ONLY",
        ))
        vectors.append(values)

    return tuple(identities), np.asarray(vectors, dtype=np.float32, order="C")


class CuvsBackend(Protocol):
    def build(self, algorithm: Algorithm, vectors: np.ndarray, metric: Metric, params: dict[str, Any]) -> tuple[Any, MemoryTier, bool, bool]: ...

    def search(self, algorithm: Algorithm, index: Any, queries: np.ndarray, k: int, params: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]: ...

    def convert_cagra_to_hnsw(self, index: Any, hierarchy: Literal["none", "cpu"], params: dict[str, Any]) -> tuple[Any, bool]: ...


class PythonCuvsBackend:
    """Thin adapter around cuVS Python APIs.

    Import this only after the workstation's required torch-before-RAPIDS import
    sequence has run. The registry itself intentionally contains no canonical
    data-store writes and no serialization authority.
    """

    def __init__(self) -> None:
        import cupy as cp
        from cuvs.neighbors import brute_force, cagra, hnsw, ivf_flat, ivf_pq

        self.cp = cp
        self.brute_force = brute_force
        self.cagra = cagra
        self.hnsw = hnsw
        self.ivf_flat = ivf_flat
        self.ivf_pq = ivf_pq

    @staticmethod
    def _positive_int(params: dict[str, Any], name: str, default: int, *, minimum: int = 1) -> int:
        value = int(params.get(name, default))
        if value < minimum:
            raise ValueError(f"{name} must be >= {minimum}")
        return value

    def build(self, algorithm: Algorithm, vectors: np.ndarray, metric: Metric, params: dict[str, Any]) -> tuple[Any, MemoryTier, bool, bool]:
        x = self.cp.asarray(np.asarray(vectors, dtype=np.float32, order="C"))
        rows = int(x.shape[0])

        if algorithm == "brute_force":
            return self.brute_force.build(x, metric=metric), "GPU", True, False

        if algorithm == "cagra":
            graph_degree = min(max(2, self._positive_int(params, "graph_degree", 64)), max(2, rows - 1))
            intermediate = min(
                max(graph_degree, self._positive_int(params, "intermediate_graph_degree", max(128, graph_degree))),
                max(graph_degree, rows),
            )
            kwargs: dict[str, Any] = {
                "metric": metric,
                "graph_degree": graph_degree,
                "intermediate_graph_degree": intermediate,
            }
            if "build_algo" in params:
                kwargs["build_algo"] = str(params["build_algo"])
            return self.cagra.build(self.cagra.IndexParams(**kwargs), x), "GPU", False, False

        if algorithm == "ivf_flat":
            default_lists = max(1, min(1024, int(round(math.sqrt(rows)))))
            n_lists = min(rows, self._positive_int(params, "n_lists", default_lists))
            build = self.ivf_flat.IndexParams(
                n_lists=n_lists,
                metric=metric,
                kmeans_n_iters=self._positive_int(params, "kmeans_n_iters", 20),
                kmeans_trainset_fraction=float(params.get("kmeans_trainset_fraction", 0.5)),
                add_data_on_build=True,
            )
            return self.ivf_flat.build(build, x), "GPU", False, True

        if algorithm == "ivf_pq":
            # cuVS recommends roughly 1k-10k vectors per list for IVF-PQ; use a
            # conservative 2k-row target as an initial challenger default, never
            # as a production constant. Tournament receipts should tune it.
            default_lists = max(1, min(1024, math.ceil(rows / 2000)))
            n_lists = min(rows, self._positive_int(params, "n_lists", default_lists))
            build = self.ivf_pq.IndexParams(
                n_lists=n_lists,
                metric=metric,
                kmeans_n_iters=self._positive_int(params, "kmeans_n_iters", 20),
                kmeans_trainset_fraction=float(params.get("kmeans_trainset_fraction", 0.5)),
                pq_bits=self._positive_int(params, "pq_bits", 8, minimum=4),
                pq_dim=int(params.get("pq_dim", 0)),
                add_data_on_build=True,
            )
            return self.ivf_pq.build(build, x), "GPU", False, True

        raise ValueError("hnsw_from_cagra must be created through convert_cagra_to_hnsw")

    def search(self, algorithm: Algorithm, index: Any, queries: np.ndarray, k: int, params: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
        if algorithm == "hnsw_from_cagra":
            q = np.asarray(queries, dtype=np.float32, order="C")
            search = self.hnsw.SearchParams(
                ef=self._positive_int(params, "ef", max(200, k)),
                num_threads=max(0, int(params.get("num_threads", 0))),
            )
            distances, neighbors = self.hnsw.search(search, index, q, k)
            return np.asarray(distances), np.asarray(neighbors)

        q = self.cp.asarray(np.asarray(queries, dtype=np.float32, order="C"))
        if algorithm == "brute_force":
            distances, neighbors = self.brute_force.search(index, q, k)
        elif algorithm == "cagra":
            search = self.cagra.SearchParams(
                itopk_size=self._positive_int(params, "itopk_size", max(64, k)),
                search_width=self._positive_int(params, "search_width", 1),
            )
            distances, neighbors = self.cagra.search(search, index, q, k)
        elif algorithm == "ivf_flat":
            n_probes = self._positive_int(params, "n_probes", 20)
            distances, neighbors = self.ivf_flat.search(self.ivf_flat.SearchParams(n_probes=n_probes), index, q, k)
        elif algorithm == "ivf_pq":
            n_probes = self._positive_int(params, "n_probes", 20)
            search = self.ivf_pq.SearchParams(n_probes=n_probes)
            distances, neighbors = self.ivf_pq.search(search, index, q, k)
        else:
            raise ValueError(f"unsupported algorithm {algorithm}")
        return self.cp.asnumpy(distances), self.cp.asnumpy(neighbors)

    def convert_cagra_to_hnsw(self, index: Any, hierarchy: Literal["none", "cpu"], params: dict[str, Any]) -> tuple[Any, bool]:
        hparams = self.hnsw.IndexParams(hierarchy=hierarchy)
        converted = self.hnsw.from_cagra(hparams, index)
        return converted, hierarchy == "cpu"


class ResidentCuvsIndexRegistry:
    def __init__(self, backend: CuvsBackend) -> None:
        self._backend = backend
        self._entries: dict[str, ResidentIndexEntry] = {}

    @staticmethod
    def _validate_build(spec: ResidentIndexBuildSpec, identities: Iterable[CorpusIdentity], vectors: np.ndarray) -> tuple[tuple[CorpusIdentity, ...], np.ndarray]:
        if not spec.index_id:
            raise ValueError("index_id required")
        if not spec.representation_id or not spec.representation_revision or not spec.workspace_revision:
            raise ValueError("representation/workspace revisions required")
        if not _SHA256_RE.fullmatch(spec.dataset_checksum_sha256):
            raise ValueError("dataset checksum must be lowercase sha256")
        if spec.dimension <= 0:
            raise ValueError("dimension must be positive")

        matrix = np.asarray(vectors, dtype=np.float32, order="C")
        if matrix.ndim != 2 or matrix.shape[1] != spec.dimension or matrix.shape[0] <= 0:
            raise ValueError("vectors must be non-empty [rows, dimension] float32 matrix")

        rows = tuple(identities)
        if len(rows) != matrix.shape[0]:
            raise ValueError("identity count must match vector rows")
        seen: set[tuple[str, str]] = set()
        seen_ordinals: set[int] = set()
        for row in rows:
            if not row.packet_key or not row.source_revision:
                raise ValueError("packet_key and source_revision are required")
            if row.key() in seen:
                raise ValueError(f"duplicate corpus identity {row.key()}")
            seen.add(row.key())
            if row.candidate_ordinal is not None:
                if isinstance(row.candidate_ordinal, bool) or not isinstance(row.candidate_ordinal, int) or row.candidate_ordinal < 0:
                    raise ValueError("candidate_ordinal must be a non-negative integer")
                if row.candidate_ordinal in seen_ordinals:
                    raise ValueError("candidate_ordinal values must be unique")
                seen_ordinals.add(row.candidate_ordinal)
            classification = (row.domain_id, row.feature_id, row.feature_label, row.taxonomy_revision)
            if any(value is not None for value in classification):
                if not all(isinstance(value, str) and value for value in classification):
                    raise ValueError("domain/feature/taxonomy binding must be complete")
                if not _SHA256_REVISION_RE.fullmatch(row.taxonomy_revision or ""):
                    raise ValueError("taxonomy_revision must be sha256")
            if row.source_ref is not None:
                source_path = PurePosixPath(row.source_ref)
                if source_path.is_absolute() or source_path.as_posix() != row.source_ref or "\\" in row.source_ref or any(part in {"", ".", ".."} for part in source_path.parts):
                    raise ValueError("source_ref must be a canonical repository-relative POSIX path")
        return rows, matrix

    def build(self, spec: ResidentIndexBuildSpec, identities: Iterable[CorpusIdentity], vectors: np.ndarray, *, replace: bool = False) -> dict[str, Any]:
        rows, matrix = self._validate_build(spec, identities, vectors)
        if spec.algorithm == "hnsw_from_cagra":
            raise ValueError("use convert_cagra_to_hnsw")
        if spec.index_id in self._entries and not replace:
            raise ValueError(f"index already exists: {spec.index_id}")

        index, tier, exact, mutable = self._backend.build(spec.algorithm, matrix, spec.metric, dict(spec.build_params))
        entry = ResidentIndexEntry(
            spec=spec,
            identities=rows,
            index=index,
            memory_tier=tier,
            exact=exact,
            mutable=mutable,
            built_at=datetime.now(timezone.utc).isoformat(),
            dataset_bytes=int(matrix.nbytes),
        )
        self._entries[spec.index_id] = entry
        return entry.metadata()

    def build_turbovec_candidates_v1(
        self,
        spec: ResidentIndexBuildSpec,
        candidates: Iterable[TurboVecIndexCandidateV1],
        *,
        replace: bool = False,
    ) -> dict[str, Any]:
        candidate_rows = tuple(candidates)
        identities, vectors = _prepare_turbovec_index_candidates_v1(spec, candidate_rows)
        candidate_domains = {row.domain_id for row in candidate_rows}
        if len(candidate_domains) != 1 or spec.domain_id not in candidate_domains:
            raise ValueError("TURBOVEC_INDEX_DOMAIN_SCOPE_MISMATCH")
        first = candidate_rows[0]
        effective_spec = dataclass_replace(
            spec,
            build_params={
                **spec.build_params,
                "sourceRepresentationId": first.source_representation_id,
                "sourceRepresentationRevision": first.source_representation_revision,
                "quantizerRevision": first.quantizer_revision,
                "bitsPerValue": first.bits_per_value,
                "classificationAuthority": "PROPOSAL_ONLY",
        "clusterAssignmentAuthority": "REVISION_BOUND_INPUT_OR_NONE",
            },
        )
        return self.build(effective_spec, identities, vectors, replace=replace)

    def convert_cagra_to_hnsw(
        self,
        source_index_id: str,
        target_index_id: str,
        *,
        hierarchy: Literal["none", "cpu"] = "none",
        release_source: bool = False,
        build_params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        source = self._entries.get(source_index_id)
        if source is None:
            raise KeyError(source_index_id)
        if source.spec.algorithm != "cagra":
            raise ValueError("HNSW conversion requires a CAGRA source index")
        if target_index_id in self._entries:
            raise ValueError(f"index already exists: {target_index_id}")
        if source.spec.metric not in ("sqeuclidean", "inner_product"):
            raise ValueError(
                "CAGRA->HNSW bridge is restricted to sqeuclidean/inner_product until the exact cuVS HNSW metric contract is proven; "
                "for normalized cosine embeddings build the CAGRA source with sqeuclidean and record cosine-equivalence in the host receipt"
            )

        index, mutable = self._backend.convert_cagra_to_hnsw(source.index, hierarchy, dict(build_params or {}))
        spec = ResidentIndexBuildSpec(
            index_id=target_index_id,
            algorithm="hnsw_from_cagra",
            representation_id=source.spec.representation_id,
            representation_revision=source.spec.representation_revision,
            workspace_revision=source.spec.workspace_revision,
            dataset_checksum_sha256=source.spec.dataset_checksum_sha256,
            metric=source.spec.metric,
            dimension=source.spec.dimension,
            build_params={"hierarchy": hierarchy, **dict(build_params or {})},
            domain_id=source.spec.domain_id,
        )
        entry = ResidentIndexEntry(
            spec=spec,
            identities=source.identities,
            index=index,
            memory_tier="CPU_RAM",
            exact=False,
            mutable=mutable,
            built_at=datetime.now(timezone.utc).isoformat(),
            dataset_bytes=source.dataset_bytes,
            source_index_id=source_index_id,
        )
        self._entries[target_index_id] = entry
        if release_source:
            del self._entries[source_index_id]
        return entry.metadata()

    def search(self, spec: ResidentIndexSearchSpec, queries: np.ndarray) -> dict[str, Any]:
        entry = self._entries.get(spec.index_id)
        if entry is None:
            raise KeyError(spec.index_id)
        if spec.representation_revision != entry.spec.representation_revision:
            raise ValueError("stale representation revision")
        if spec.dataset_checksum_sha256 != entry.spec.dataset_checksum_sha256:
            raise ValueError("stale dataset checksum")
        if spec.domain_id != entry.spec.domain_id:
            raise ValueError("resident index domain mismatch")
        if spec.top_k <= 0 or spec.top_k > len(entry.identities):
            raise ValueError("top_k outside resident index bounds")

        q = np.asarray(queries, dtype=np.float32, order="C")
        if q.ndim != 2 or q.shape[1] != entry.spec.dimension:
            raise ValueError("query matrix dimension mismatch")
        distances, neighbors = self._backend.search(entry.spec.algorithm, entry.index, q, spec.top_k, dict(spec.search_params))
        distances = np.asarray(distances)
        neighbors = np.asarray(neighbors)
        if distances.shape != neighbors.shape or neighbors.ndim != 2 or neighbors.shape[1] != spec.top_k:
            raise RuntimeError("backend returned invalid neighbor shape")

        rows: list[list[dict[str, Any]]] = []
        for distance_row, neighbor_row in zip(distances, neighbors):
            out: list[dict[str, Any]] = []
            for rank, (distance, ordinal_value) in enumerate(zip(distance_row, neighbor_row), start=1):
                ordinal = int(ordinal_value)
                if ordinal < 0 or ordinal >= len(entry.identities):
                    raise RuntimeError(f"backend returned out-of-range ordinal {ordinal}")
                identity = entry.identities[ordinal]
                out.append({
                    "rank": rank,
                    "ordinal": ordinal,
                    "candidateOrdinal": identity.candidate_ordinal if identity.candidate_ordinal is not None else ordinal,
                    "packetKey": identity.packet_key,
                    "sourceRevision": identity.source_revision,
                    "symbolVersionId": identity.symbol_version_id,
                    "sourceRef": identity.source_ref,
                    "domainId": identity.domain_id,
                    "featureId": identity.feature_id,
                    "featureLabel": identity.feature_label,
                    "taxonomyRevision": identity.taxonomy_revision,
                    "kmeansClusterId": identity.kmeans_cluster_id,
                    "somBmuId": identity.som_bmu_id,
                    "clusterAssignmentRevision": identity.cluster_assignment_revision,
                    "classificationAuthority": identity.classification_authority,
                    "distance": float(distance),
                })
            rows.append(out)

        return {
            "index": entry.metadata(),
            "queryCount": int(q.shape[0]),
            "topK": spec.top_k,
            "results": rows,
        }

    def get(self, index_id: str) -> dict[str, Any]:
        entry = self._entries.get(index_id)
        if entry is None:
            raise KeyError(index_id)
        return entry.metadata()

    def list(self) -> list[dict[str, Any]]:
        return [self._entries[key].metadata() for key in sorted(self._entries)]

    def drop(self, index_id: str) -> bool:
        return self._entries.pop(index_id, None) is not None


def checksum_identity_order(identities: Iterable[CorpusIdentity]) -> str:
    """Diagnostic checksum for ordinal->canonical identity ordering only.

    This is not the dataset/vector checksum. The authoritative dataset checksum
    must come from the upstream revisioned artifact producer.
    """
    digest = sha256()
    for row in identities:
        digest.update(row.packet_key.encode("utf-8"))
        digest.update(b"\0")
        digest.update(row.source_revision.encode("utf-8"))
        digest.update(b"\0")
        digest.update((row.symbol_version_id or "").encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()
