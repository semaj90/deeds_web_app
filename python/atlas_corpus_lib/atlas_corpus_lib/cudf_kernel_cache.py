from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterable, Literal

from pydantic import Field, model_validator

from .arrow_tile_stream import CandidateOrdinalEntryV1, CandidateOrdinalMapV1
from .structural_observation_v1 import StrictModel


MAX_JSONL_BATCH_ROWS_V1 = 4096
MAX_JSONL_ROW_BYTES_V1 = 1024 * 1024
MAX_JSONL_BATCH_BYTES_V1 = 64 * 1024 * 1024


class KernelSwapDescriptorV1(StrictModel):
    schema_id: Literal["atlas.kernel-swap-descriptor.v1"] = Field(
        default="atlas.kernel-swap-descriptor.v1", alias="schema", serialization_alias="schema"
    )
    kernel_id: str = Field(min_length=1)
    kernel_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    device_architecture: str = Field(min_length=1)
    runtime_abi: str = Field(min_length=1)
    input_shape: tuple[int, ...] = Field(min_length=1)
    dtype: str = Field(min_length=1)
    resident: Literal[False] = False
    tensor_bytes_persisted: Literal[False] = False


class SomSvdModelManifestV1(StrictModel):
    schema_id: Literal["atlas.som-svd-model-manifest.v1"] = Field(
        default="atlas.som-svd-model-manifest.v1", alias="schema", serialization_alias="schema"
    )
    representation_id: Literal["semantic_768"] = "semantic_768"
    training_corpus_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    mean_sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    basis_sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    codebook_sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    rank: int = Field(strict=True, ge=1, le=768)
    dtype: Literal["float32-le"] = "float32-le"
    som_rows: Literal[20] = 20
    som_columns: Literal[20] = 20
    projection_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    authority: Literal["FROZEN_PROPOSAL_ONLY"] = "FROZEN_PROPOSAL_ONLY"

    @model_validator(mode="after")
    def validate_projection_revision(self) -> "SomSvdModelManifestV1":
        payload = self.model_dump(mode="json", by_alias=True, exclude={"projection_revision"})
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        expected = f"sha256:{hashlib.sha256(encoded).hexdigest()}"
        if self.projection_revision != expected:
            raise ValueError("SOM_SVD_PROJECTION_REVISION_MISMATCH")
        return self


class SomSvdRecommendationV1(StrictModel):
    schema_id: Literal["atlas.som-svd-recommendation.v1"] = Field(
        default="atlas.som-svd-recommendation.v1", alias="schema", serialization_alias="schema"
    )
    representation_id: Literal["semantic_768"] = "semantic_768"
    projection_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    training_corpus_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    mean_sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    basis_sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    codebook_sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    ordinal_map_digest: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    workspace_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    candidate_binding: CandidateOrdinalEntryV1
    candidate_ordinal: int = Field(ge=0)
    som_rows: Literal[20] = 20
    som_columns: Literal[20] = 20
    cell_index: int = Field(ge=0, lt=400)
    cell_x: int = Field(ge=0, lt=20)
    cell_y: int = Field(ge=0, lt=20)
    squared_distance: float = Field(ge=0)
    status: Literal["DERIVED_RECOMMENDATION_ONLY"] = "DERIVED_RECOMMENDATION_ONLY"

    @model_validator(mode="after")
    def validate_candidate_binding(self) -> "SomSvdRecommendationV1":
        if self.candidate_binding.candidate_ordinal != self.candidate_ordinal:
            raise ValueError("SOM_SVD_CANDIDATE_BINDING_ORDINAL_MISMATCH")
        return self


def radix_sort_som_candidates(candidates: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = list(candidates)
    for row in rows:
        keys = ("kmeans_cluster_id", "som_bmu_id", "candidate_ordinal")
        if any(type(row.get(key)) is not int or row[key] < 0 for key in keys):
            raise ValueError("SOM_RADIX_KEYS_MUST_BE_NONNEGATIVE_INTEGERS")
        if row["kmeans_cluster_id"] > 0xFFFF or row["som_bmu_id"] >= 400 or row["candidate_ordinal"] > 0xFFFFFFFF:
            raise ValueError("SOM_RADIX_KEY_OUT_OF_RANGE")
    try:
        from . import _atlas_native_core
    except ImportError:
        try:
            import _atlas_native_core
        except ImportError:
            _atlas_native_core = None
    if _atlas_native_core is not None:
        indices = _atlas_native_core.radix_sort_som_candidate_indices(
            [row["kmeans_cluster_id"] for row in rows],
            [row["som_bmu_id"] for row in rows],
            [row["candidate_ordinal"] for row in rows],
        )
        return [rows[index] for index in indices]
    return sorted(rows, key=lambda row: (row["kmeans_cluster_id"], row["som_bmu_id"], row["candidate_ordinal"]))


def rtx_interpolate_vectors(left: Iterable[float], right: Iterable[float], amount: float) -> list[float]:
    if not 0.0 <= amount <= 1.0:
        raise ValueError("INTERPOLATION_AMOUNT_OUT_OF_RANGE")
    a, b = list(map(float, left)), list(map(float, right))
    if len(a) != len(b) or not a:
        raise ValueError("INTERPOLATION_VECTOR_SHAPE_MISMATCH")
    return [(1.0 - amount) * x + amount * y for x, y in zip(a, b, strict=True)]


def single_vector_svd_som_recommend(
    vector: Iterable[float],
    mean: Iterable[float],
    components: Iterable[Iterable[float]],
    codebook: Iterable[Iterable[float]],
    *,
    model_manifest: SomSvdModelManifestV1,
    ordinal_map: CandidateOrdinalMapV1,
    candidate_ordinal: int,
) -> SomSvdRecommendationV1:
    import numpy as np

    if not isinstance(model_manifest, SomSvdModelManifestV1):
        raise ValueError("SOM_SVD_REQUIRES_FROZEN_MODEL_MANIFEST")
    if type(candidate_ordinal) is not int or not 0 <= candidate_ordinal <= 0xFFFFFFFF:
        raise ValueError("SOM_SVD_CANDIDATE_ORDINAL_INVALID")
    model_manifest = SomSvdModelManifestV1.model_validate(
        model_manifest.model_dump(mode="python", by_alias=True)
    )
    canonical = np.asarray(list(vector), dtype=np.float32)
    center = np.asarray(list(mean), dtype="<f4")
    basis = np.asarray(list(components), dtype="<f4")
    prototypes = np.asarray(list(codebook), dtype="<f4")
    if canonical.shape != (768,) or center.shape != (768,):
        raise ValueError("SVD_INPUT_MUST_USE_CANONICAL_SEMANTIC_768")
    if basis.ndim != 2 or basis.shape[1] != 768 or prototypes.shape != (400, basis.shape[0]):
        raise ValueError("SVD_BASIS_OR_20X20_SOM_CODEBOOK_SHAPE_INVALID")
    if not all(np.isfinite(value).all() for value in (canonical, center, basis, prototypes)):
        raise ValueError("SVD_SOM_INPUTS_MUST_BE_FINITE")
    model_arrays = {
        "mean_sha256": hashlib.sha256(center.tobytes(order="C")).hexdigest(),
        "basis_sha256": hashlib.sha256(basis.tobytes(order="C")).hexdigest(),
        "codebook_sha256": hashlib.sha256(prototypes.tobytes(order="C")).hexdigest(),
    }
    if (
        model_manifest.rank != basis.shape[0]
        or any(
            getattr(model_manifest, field) != f"sha256:{digest}"
            for field, digest in model_arrays.items()
        )
    ):
        raise ValueError("SOM_SVD_MODEL_ARRAY_DIGEST_MISMATCH")
    if not isinstance(ordinal_map, CandidateOrdinalMapV1):
        raise ValueError("SOM_SVD_REQUIRES_VALIDATED_CANDIDATE_ORDINAL_MAP")
    ordinal_map = CandidateOrdinalMapV1.model_validate(ordinal_map.model_dump(mode="python", by_alias=True))
    candidate_binding = next(
        (entry for entry in ordinal_map.entries if entry.candidate_ordinal == candidate_ordinal),
        None,
    )
    if candidate_binding is None:
        raise ValueError("SOM_SVD_CANDIDATE_ORDINAL_NOT_IN_MAP")
    with np.errstate(over="ignore", invalid="ignore"):
        projected = basis @ (canonical - center)
        distances = np.sum((prototypes - projected) ** 2, axis=1)
    if not np.isfinite(projected).all() or not np.isfinite(distances).all():
        raise ValueError("SVD_SOM_DISTANCE_NONFINITE")
    cell = int(np.argmin(distances))
    return SomSvdRecommendationV1(
        projection_revision=model_manifest.projection_revision,
        training_corpus_revision=model_manifest.training_corpus_revision,
        mean_sha256=model_manifest.mean_sha256,
        basis_sha256=model_manifest.basis_sha256,
        codebook_sha256=model_manifest.codebook_sha256,
        ordinal_map_digest=ordinal_map.digest,
        workspace_revision=ordinal_map.workspace_revision,
        candidate_binding=candidate_binding,
        candidate_ordinal=candidate_ordinal,
        cell_index=cell,
        cell_x=cell % 20,
        cell_y=cell // 20,
        squared_distance=float(distances[cell]),
    )


def build_som_svd_model_manifest_v1(
    mean: Iterable[float],
    components: Iterable[Iterable[float]],
    codebook: Iterable[Iterable[float]],
    *,
    training_corpus_revision: str,
) -> SomSvdModelManifestV1:
    import numpy as np

    center = np.asarray(list(mean), dtype="<f4")
    basis = np.asarray(list(components), dtype="<f4")
    prototypes = np.asarray(list(codebook), dtype="<f4")
    if center.shape != (768,) or basis.ndim != 2 or basis.shape[1] != 768:
        raise ValueError("SVD_INPUT_MUST_USE_CANONICAL_SEMANTIC_768")
    if basis.shape[0] < 1 or basis.shape[0] > 768 or prototypes.shape != (400, basis.shape[0]):
        raise ValueError("SVD_BASIS_OR_20X20_SOM_CODEBOOK_SHAPE_INVALID")
    if not all(np.isfinite(value).all() for value in (center, basis, prototypes)):
        raise ValueError("SVD_SOM_INPUTS_MUST_BE_FINITE")
    payload = {
        "schema": "atlas.som-svd-model-manifest.v1",
        "representation_id": "semantic_768",
        "training_corpus_revision": training_corpus_revision,
        "mean_sha256": f"sha256:{hashlib.sha256(center.tobytes(order='C')).hexdigest()}",
        "basis_sha256": f"sha256:{hashlib.sha256(basis.tobytes(order='C')).hexdigest()}",
        "codebook_sha256": f"sha256:{hashlib.sha256(prototypes.tobytes(order='C')).hexdigest()}",
        "rank": int(basis.shape[0]),
        "dtype": "float32-le",
        "som_rows": 20,
        "som_columns": 20,
        "authority": "FROZEN_PROPOSAL_ONLY",
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return SomSvdModelManifestV1(
        **payload,
        projection_revision=f"sha256:{hashlib.sha256(encoded).hexdigest()}",
    )


def _reject_json_constant(value: str):
    raise ValueError(f"JSONL_NONSTANDARD_CONSTANT:{value}")


def _reject_duplicate_json_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"JSONL_DUPLICATE_OBJECT_KEY:{key}")
        result[key] = value
    return result


def iter_jsonl_batches(
    path: str | Path,
    batch_size: int = 1024,
    *,
    max_line_bytes: int = MAX_JSONL_ROW_BYTES_V1,
    max_batch_bytes: int = MAX_JSONL_BATCH_BYTES_V1,
):
    if type(batch_size) is not int or batch_size <= 0:
        raise ValueError("BATCH_SIZE_MUST_BE_POSITIVE")
    if batch_size > MAX_JSONL_BATCH_ROWS_V1:
        raise ValueError("JSONL_BATCH_ROW_LIMIT_EXCEEDED")
    if type(max_line_bytes) is not int or not 0 < max_line_bytes <= MAX_JSONL_ROW_BYTES_V1:
        raise ValueError("JSONL_MAX_LINE_BYTES_OUT_OF_RANGE")
    if type(max_batch_bytes) is not int or not 0 < max_batch_bytes <= MAX_JSONL_BATCH_BYTES_V1:
        raise ValueError("JSONL_MAX_BATCH_BYTES_OUT_OF_RANGE")
    if max_line_bytes > max_batch_bytes:
        raise ValueError("JSONL_LINE_LIMIT_EXCEEDS_BATCH_LIMIT")
    batch: list[dict[str, Any]] = []
    batch_bytes = 0
    with Path(path).open("rb") as stream:
        line_number = 0
        while line := stream.readline(max_line_bytes + 1):
            line_number += 1
            if len(line) > max_line_bytes:
                raise ValueError(f"JSONL_ROW_BYTE_LIMIT_EXCEEDED:{line_number}")
            if not line.strip():
                continue
            try:
                value = json.loads(
                    line,
                    object_pairs_hook=_reject_duplicate_json_keys,
                    parse_constant=_reject_json_constant,
                )
            except (json.JSONDecodeError, UnicodeDecodeError) as error:
                raise ValueError(f"JSONL_JSON_INVALID:{line_number}") from error
            if not isinstance(value, dict):
                raise ValueError(f"JSONL_ROW_MUST_BE_OBJECT:{line_number}")
            if batch and (len(batch) >= batch_size or batch_bytes + len(line) > max_batch_bytes):
                yield batch
                batch = []
                batch_bytes = 0
            batch.append(value)
            batch_bytes += len(line)
    if batch:
        yield batch


def load_batch_json_to_gpu_cache(path: str | Path, batch_size: int = 1024, use_gpu: bool = False):
    for rows in iter_jsonl_batches(path, batch_size):
        if use_gpu:
            try:
                import cudf
            except ImportError as error:
                raise RuntimeError("CUDF_REQUESTED_BUT_UNAVAILABLE") from error
            yield {"backend": "CUDF", "rows": cudf.DataFrame(rows)}
        else:
            digest = hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
            yield {"backend": "CPU_JSONL", "rows": rows, "batch_sha256": digest}
