from __future__ import annotations

import hashlib
import json
import math
import re
import struct
from typing import Literal, Mapping, Sequence

from pydantic import Field, model_validator

from .ast_chunker_helpers import AstIndexPayloadV1
from .lod_blob_streamer import assemble_lod_texture_block_128b, stream_lod_blocks_to_pytorch_blob
from .structural_observation_v1 import StrictModel


MAX_LOD_ARROW_RECORDS_V1 = 4096
MAX_LOD_ARROW_IPC_BYTES_V1 = 64 * 1024 * 1024


class CandidateOrdinalEntryV1(StrictModel):
    candidate_ordinal: int = Field(strict=True, ge=0, le=0xFFFFFFFF)
    packet_key: str | None = None
    source_ref: str = Field(min_length=1)
    source_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    start_byte: int = Field(strict=True, ge=0)
    end_byte: int = Field(strict=True, gt=0)
    symbol_name: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_span(self) -> "CandidateOrdinalEntryV1":
        if self.start_byte >= self.end_byte:
            raise ValueError("CANDIDATE_ORDINAL_SPAN_INVALID")
        return self


class CandidateOrdinalMapV1(StrictModel):
    schema_id: Literal["atlas.candidate-ordinal-map.v1"] = Field(
        default="atlas.candidate-ordinal-map.v1", alias="schema", serialization_alias="schema"
    )
    workspace_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    entries: list[CandidateOrdinalEntryV1] = Field(min_length=1, max_length=MAX_LOD_ARROW_RECORDS_V1)
    digest: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")

    @model_validator(mode="after")
    def validate_order_and_digest(self) -> "CandidateOrdinalMapV1":
        ordinals = [entry.candidate_ordinal for entry in self.entries]
        if ordinals != sorted(ordinals) or len(ordinals) != len(set(ordinals)):
            raise ValueError("CANDIDATE_ORDINAL_MAP_ORDER_OR_UNIQUENESS_INVALID")
        canonical = {
            "schema": self.schema_id,
            "workspace_revision": self.workspace_revision,
            "entries": [entry.model_dump(mode="json") for entry in self.entries],
        }
        encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        expected = f"sha256:{hashlib.sha256(encoded).hexdigest()}"
        if self.digest != expected:
            raise ValueError("CANDIDATE_ORDINAL_MAP_DIGEST_MISMATCH")
        return self


def build_candidate_ordinal_map_from_entries_v1(
    entries: list[CandidateOrdinalEntryV1], workspace_revision: str
) -> CandidateOrdinalMapV1:
    if not entries:
        raise ValueError("CANDIDATE_ORDINAL_MAP_REQUIRES_ENTRIES")
    if len(entries) > MAX_LOD_ARROW_RECORDS_V1:
        raise ValueError("CANDIDATE_ORDINAL_MAP_RECORD_LIMIT_EXCEEDED")
    ordered = sorted(entries, key=lambda entry: entry.candidate_ordinal)
    ordinals = [entry.candidate_ordinal for entry in ordered]
    if len(ordinals) != len(set(ordinals)):
        raise ValueError("CANDIDATE_ORDINAL_MAP_ORDER_OR_UNIQUENESS_INVALID")
    canonical = {
        "schema": "atlas.candidate-ordinal-map.v1",
        "workspace_revision": workspace_revision,
        "entries": [entry.model_dump(mode="json") for entry in ordered],
    }
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return CandidateOrdinalMapV1(
        workspace_revision=workspace_revision,
        entries=ordered,
        digest=f"sha256:{hashlib.sha256(encoded).hexdigest()}",
    )


class LodTileArrowRecordV1(StrictModel):
    schema_id: Literal["atlas.lod-tile-arrow-record.v1"] = Field(
        default="atlas.lod-tile-arrow-record.v1", alias="schema", serialization_alias="schema"
    )
    ast_payload: AstIndexPayloadV1
    candidate_ordinal: int = Field(strict=True, ge=0, le=0xFFFFFFFF)
    som_bmu_id: int = Field(strict=True, ge=0, le=0xFFFF)
    kmeans_cluster_id: int = Field(strict=True, ge=0, le=0xFFFF)
    som_assignment_revision: str | None = Field(default=None, pattern=r"^sha256:[a-f0-9]{64}$")
    kmeans_assignment_revision: str | None = Field(default=None, pattern=r"^sha256:[a-f0-9]{64}$")
    tile_block: bytes
    tile_sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    authority: Literal["PROPOSAL_ONLY"] = "PROPOSAL_ONLY"

    @model_validator(mode="after")
    def validate_lineage_and_payload(self) -> "LodTileArrowRecordV1":
        if not all((self.ast_payload.feature_id, self.ast_payload.feature_label, self.ast_payload.taxonomy_revision)):
            raise ValueError("FEATURE_BINDING_REQUIRED_FOR_LOD_ARROW_EXPORT")
        if (self.som_assignment_revision is None) != (self.kmeans_assignment_revision is None):
            raise ValueError("LOD_TILE_ASSIGNMENT_REVISIONS_MUST_BE_PAIRED")
        if len(self.tile_block) != 128:
            raise ValueError("LOD_TILE_BLOCK_MUST_BE_128_BYTES")
        actual_digest = f"sha256:{hashlib.sha256(self.tile_block).hexdigest()}"
        if self.tile_sha256 != actual_digest:
            raise ValueError("LOD_TILE_BLOCK_DIGEST_MISMATCH")
        return self


def build_lod_tile_arrow_record_v1(
    ast_payload: AstIndexPayloadV1,
    *,
    mrl128_values: list[float],
    candidate_ordinal: int,
    som_bmu_id: int,
    kmeans_cluster_id: int,
) -> LodTileArrowRecordV1:
    if not all((ast_payload.feature_id, ast_payload.feature_label, ast_payload.taxonomy_revision)):
        raise ValueError("FEATURE_BINDING_REQUIRED_FOR_LOD_ARROW_EXPORT")
    block, _, _ = assemble_lod_texture_block_128b(
        mrl128_values=mrl128_values,
        candidate_ordinal=candidate_ordinal,
        som_bmu_id=som_bmu_id,
        kmeans_cluster_id=kmeans_cluster_id,
    )
    return LodTileArrowRecordV1(
        ast_payload=ast_payload,
        candidate_ordinal=candidate_ordinal,
        som_bmu_id=som_bmu_id,
        kmeans_cluster_id=kmeans_cluster_id,
        tile_block=block,
        tile_sha256=f"sha256:{hashlib.sha256(block).hexdigest()}",
    )


def _validated_assignment_artifact_v1(artifact: dict, schema: str, ordinal: int) -> tuple[dict, dict, str, str, str]:
    if not isinstance(artifact, dict) or artifact.get("schema") != schema:
        raise ValueError("LOD_TILE_ASSIGNMENT_SCHEMA_INVALID")
    if artifact.get("authority") != "PROPOSAL_ONLY" or artifact.get("canonicalAuthority") is not False or artifact.get("promotionEligible") is not False:
        raise ValueError("LOD_TILE_ASSIGNMENT_AUTHORITY_INVALID")
    identity_rows = artifact.get("candidateIdentityBindings")
    assignments = artifact.get("assignments")
    ordinals = artifact.get("inputCandidateOrdinals")
    if not isinstance(identity_rows, list) or not isinstance(assignments, list) or not isinstance(ordinals, list):
        raise ValueError("LOD_TILE_ASSIGNMENT_ROWS_INVALID")
    if (
        any(isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 0xFFFFFFFF for value in ordinals)
        or len(ordinals) != len(set(ordinals))
        or len(identity_rows) != len(ordinals)
        or len(assignments) != len(ordinals)
    ):
        raise ValueError("LOD_TILE_ASSIGNMENT_COHORT_INVALID")
    if {row.get("candidateOrdinal") for row in identity_rows if isinstance(row, dict)} != set(ordinals):
        raise ValueError("LOD_TILE_ASSIGNMENT_IDENTITY_COHORT_MISMATCH")
    if {row.get("candidateOrdinal") for row in assignments if isinstance(row, dict)} != set(ordinals):
        raise ValueError("LOD_TILE_ASSIGNMENT_RESULT_COHORT_MISMATCH")
    identities = [row for row in identity_rows if isinstance(row, dict) and row.get("candidateOrdinal") == ordinal]
    assigned = [row for row in assignments if isinstance(row, dict) and row.get("candidateOrdinal") == ordinal]
    if len(identities) != 1 or len(assigned) != 1:
        raise ValueError("LOD_TILE_ASSIGNMENT_ORDINAL_NOT_UNIQUE")
    canonical_keys = (
        "schema", "workspaceRevision", "representationRevision", "receipt",
        "inputCandidateOrdinals", "candidateIdentityBindings", "assignments",
    )
    if any(key not in artifact for key in canonical_keys):
        raise ValueError("LOD_TILE_ASSIGNMENT_CANONICAL_FIELDS_MISSING")
    canonical = {key: artifact[key] for key in canonical_keys}
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
    expected_revision = "sha256:" + hashlib.sha256(encoded).hexdigest()
    if artifact.get("assignmentRevision") != expected_revision:
        raise ValueError("LOD_TILE_ASSIGNMENT_REVISION_MISMATCH")
    if not all(
        isinstance(artifact.get(field), str) and re.fullmatch(r"sha256:[a-f0-9]{64}", artifact[field])
        for field in ("workspaceRevision", "representationRevision")
    ):
        raise ValueError("LOD_TILE_ASSIGNMENT_REVISION_BINDING_INVALID")
    if not isinstance(identities[0].get("vectorSha256"), str) or not re.fullmatch(r"[a-f0-9]{64}", identities[0]["vectorSha256"]):
        raise ValueError("LOD_TILE_ASSIGNMENT_VECTOR_DIGEST_INVALID")
    return identities[0], assigned[0], artifact["workspaceRevision"], artifact["representationRevision"], expected_revision


def build_revision_bound_lod_tile_arrow_record_v1(
    ast_payload: AstIndexPayloadV1,
    *,
    mrl128_values: list[float],
    candidate_ordinal: int,
    kmeans_assignment_artifact: dict,
    som_assignment_artifact: dict,
) -> LodTileArrowRecordV1:
    if not all((ast_payload.feature_id, ast_payload.feature_label, ast_payload.taxonomy_revision)):
        raise ValueError("FEATURE_BINDING_REQUIRED_FOR_LOD_ARROW_EXPORT")
    k_identity, k_assignment, k_workspace, k_representation, k_revision = _validated_assignment_artifact_v1(
        kmeans_assignment_artifact, "atlas.kmeans-ordinal-assignments.v1", candidate_ordinal
    )
    s_identity, s_assignment, s_workspace, s_representation, s_revision = _validated_assignment_artifact_v1(
        som_assignment_artifact, "atlas.som-ordinal-assignments.v1", candidate_ordinal
    )
    if k_workspace != s_workspace or k_workspace != ast_payload.workspace_revision or k_representation != s_representation:
        raise ValueError("LOD_TILE_ASSIGNMENT_REVISION_BINDING_MISMATCH")
    expected_identity = {
        "packetKey": ast_payload.packet_key,
        "sourceRef": ast_payload.source_ref,
        "sourceRevision": ast_payload.source_revision,
        "featureId": ast_payload.feature_id,
        "featureLabel": ast_payload.feature_label,
        "taxonomyRevision": ast_payload.taxonomy_revision,
    }
    for identity in (k_identity, s_identity):
        if any(identity.get(key) != value for key, value in expected_identity.items()):
            raise ValueError("LOD_TILE_ASSIGNMENT_SOURCE_FEATURE_BINDING_MISMATCH")
    vector_bytes = struct.pack("<128f", *mrl128_values)
    vector_digest = hashlib.sha256(vector_bytes).hexdigest()
    if k_identity.get("vectorSha256") != vector_digest or s_identity.get("vectorSha256") != vector_digest:
        raise ValueError("LOD_TILE_ASSIGNMENT_VECTOR_DIGEST_MISMATCH")
    kmeans_cluster_id = k_assignment.get("kmeansClusterId")
    som_bmu_id = s_assignment.get("somBmuId")
    if isinstance(kmeans_cluster_id, bool) or not isinstance(kmeans_cluster_id, int) or not 0 <= kmeans_cluster_id <= 0xFFFF:
        raise ValueError("LOD_TILE_KMEANS_CLUSTER_ID_INVALID")
    cluster_count = kmeans_assignment_artifact["receipt"].get("n_clusters")
    if isinstance(cluster_count, bool) or not isinstance(cluster_count, int) or not 1 <= cluster_count <= 0x10000 or kmeans_cluster_id >= cluster_count:
        raise ValueError("LOD_TILE_KMEANS_CLUSTER_RECEIPT_MISMATCH")
    if isinstance(som_bmu_id, bool) or not isinstance(som_bmu_id, int) or not 0 <= som_bmu_id < 400:
        raise ValueError("LOD_TILE_SOM_BMU_ID_INVALID")
    som_receipt = som_assignment_artifact["receipt"]
    grid_rows = som_receipt.get("grid_rows")
    grid_columns = som_receipt.get("grid_columns")
    som_row = s_assignment.get("somRow")
    som_column = s_assignment.get("somColumn")
    if (
        isinstance(grid_rows, bool) or not isinstance(grid_rows, int)
        or isinstance(grid_columns, bool) or not isinstance(grid_columns, int)
        or grid_rows <= 0 or grid_columns <= 0 or grid_rows * grid_columns > 400
        or isinstance(som_row, bool) or not isinstance(som_row, int)
        or isinstance(som_column, bool) or not isinstance(som_column, int)
        or not 0 <= som_row < grid_rows or not 0 <= som_column < grid_columns
        or som_row * grid_columns + som_column != som_bmu_id
    ):
        raise ValueError("LOD_TILE_SOM_BMU_RECEIPT_MISMATCH")
    record = build_lod_tile_arrow_record_v1(
        ast_payload,
        mrl128_values=mrl128_values,
        candidate_ordinal=candidate_ordinal,
        som_bmu_id=som_bmu_id,
        kmeans_cluster_id=kmeans_cluster_id,
    )
    return record.model_copy(update={
        "som_assignment_revision": s_revision,
        "kmeans_assignment_revision": k_revision,
    })


def verify_native_batch_tile_parity_v1(
    records: list[LodTileArrowRecordV1],
    vectors_by_candidate_ordinal: Mapping[int, Sequence[float]],
    *,
    worker_count: int = 0,
) -> dict:
    if not records or len(records) > MAX_LOD_ARROW_RECORDS_V1:
        raise ValueError("NATIVE_TILE_PARITY_RECORD_COUNT_INVALID")
    if type(worker_count) is not int or not 0 <= worker_count <= 32:
        raise ValueError("NATIVE_TILE_PARITY_WORKER_COUNT_INVALID")
    ordinals = [record.candidate_ordinal for record in records]
    if len(ordinals) != len(set(ordinals)) or set(vectors_by_candidate_ordinal) != set(ordinals):
        raise ValueError("NATIVE_TILE_PARITY_ORDINAL_COHORT_MISMATCH")
    workspace_revisions = {record.ast_payload.workspace_revision for record in records}
    if len(workspace_revisions) != 1:
        raise ValueError("NATIVE_TILE_PARITY_WORKSPACE_REVISION_MISMATCH")

    ordered_vectors = []
    for ordinal in ordinals:
        values = [float(value) for value in vectors_by_candidate_ordinal[ordinal]]
        if len(values) != 128 or not all(math.isfinite(value) for value in values):
            raise ValueError("NATIVE_TILE_PARITY_VECTOR_INVALID")
        ordered_vectors.extend(values)

    try:
        from . import _atlas_native_core as native_core
    except ImportError:
        try:
            import _atlas_native_core as native_core
        except ImportError as error:
            raise RuntimeError("ATLAS_NATIVE_CORE_REQUIRED_FOR_BATCH_PARITY") from error

    native_bytes = native_core.assemble_lod_texture_blocks_v1(
        ordered_vectors,
        len(records),
        128,
        [record.candidate_ordinal for record in records],
        [record.som_bmu_id for record in records],
        [record.kmeans_cluster_id for record in records],
        worker_count,
    )
    expected_length = len(records) * 128
    if len(native_bytes) != expected_length:
        raise ValueError("NATIVE_TILE_PARITY_OUTPUT_LENGTH_MISMATCH")
    native_blocks = [native_bytes[index * 128:(index + 1) * 128] for index in range(len(records))]
    if native_blocks != [record.tile_block for record in records]:
        raise ValueError("NATIVE_TILE_PARITY_BLOCK_MISMATCH")

    ordinal_map = build_candidate_ordinal_map_v1(records)
    workspace_revision = next(iter(workspace_revisions))
    return {
        "schema": "atlas.native-batch-tile-parity-receipt.v1",
        "authority": "PROPOSAL_ONLY",
        "canonicalAuthority": False,
        "promotionEligible": False,
        "workspaceRevision": workspace_revision,
        "ordinalMapDigest": ordinal_map.digest,
        "rowCount": len(records),
        "workerCountRequested": worker_count,
        "nativeBatchSha256": f"sha256:{hashlib.sha256(native_bytes).hexdigest()}",
        "arrowBlockSetSha256": f"sha256:{hashlib.sha256(b''.join(record.tile_block for record in records)).hexdigest()}",
        "byteForByteParity": True,
        "writesPerformed": False,
    }


def bind_hnsw_hits_to_lod_tile_records_v1(
    hits: list[dict],
    records: list[LodTileArrowRecordV1],
    *,
    workspace_revision: str,
) -> dict:
    if not hits or len(hits) > MAX_LOD_ARROW_RECORDS_V1:
        raise ValueError("HNSW_TILE_HIT_COUNT_INVALID")
    if not records or len(records) > MAX_LOD_ARROW_RECORDS_V1:
        raise ValueError("HNSW_TILE_RECORD_COUNT_INVALID")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", workspace_revision):
        raise ValueError("HNSW_TILE_WORKSPACE_REVISION_INVALID")
    if any(record.ast_payload.workspace_revision != workspace_revision for record in records):
        raise ValueError("HNSW_TILE_RECORD_WORKSPACE_REVISION_MISMATCH")

    ordinal_map = build_candidate_ordinal_map_v1(records)
    bound = []
    seen_ordinals: set[int] = set()
    for rank, hit in enumerate(hits, start=1):
        if not isinstance(hit, dict) or not isinstance(hit.get("payload"), dict):
            raise ValueError("HNSW_TILE_HIT_SHAPE_INVALID")
        payload = hit["payload"]
        required = (
            "packet_key", "source_ref", "source_revision", "workspace_revision",
            "feature_id", "feature_label", "taxonomy_revision", "parser_language",
            "language_resolver_revision", "representation_id",
        )
        if any(not isinstance(payload.get(key), str) or not payload[key].strip() for key in required):
            raise ValueError("HNSW_TILE_HIT_CANONICAL_PAYLOAD_INCOMPLETE")
        if payload["workspace_revision"] != workspace_revision:
            raise ValueError("HNSW_TILE_HIT_WORKSPACE_REVISION_MISMATCH")
        if payload["representation_id"] != "semantic_768":
            raise ValueError("HNSW_TILE_HIT_REPRESENTATION_NOT_CANONICAL")
        score = hit.get("score")
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(float(score)):
            raise ValueError("HNSW_TILE_HIT_SCORE_INVALID")
        point_id = hit.get("id")
        if not isinstance(point_id, (str, int)) or isinstance(point_id, bool):
            raise ValueError("HNSW_TILE_HIT_PROJECTION_ID_INVALID")

        candidates = [
            record for record in records
            if record.ast_payload.packet_key == payload["packet_key"]
            and record.ast_payload.source_ref == payload["source_ref"]
            and record.ast_payload.source_revision == payload["source_revision"]
            and record.ast_payload.workspace_revision == workspace_revision
            and record.ast_payload.feature_id == payload["feature_id"]
            and record.ast_payload.feature_label == payload["feature_label"]
            and record.ast_payload.taxonomy_revision == payload["taxonomy_revision"]
            and record.ast_payload.parser_language == payload["parser_language"]
            and record.ast_payload.language_resolver_revision == payload["language_resolver_revision"]
        ]
        start_byte = payload.get("start_byte")
        end_byte = payload.get("end_byte")
        has_start, has_end = start_byte is not None, end_byte is not None
        if has_start != has_end:
            raise ValueError("HNSW_TILE_HIT_SPAN_PARTIAL")
        if has_start:
            if (
                isinstance(start_byte, bool) or not isinstance(start_byte, int) or start_byte < 0
                or isinstance(end_byte, bool) or not isinstance(end_byte, int) or end_byte <= start_byte
            ):
                raise ValueError("HNSW_TILE_HIT_SPAN_INVALID")
            candidates = [
                record for record in candidates
                if record.ast_payload.start_byte == start_byte
                and record.ast_payload.end_byte == end_byte
            ]
        symbol = payload.get("symbol")
        if isinstance(symbol, str) and symbol.strip():
            candidates = [record for record in candidates if record.ast_payload.symbol_name == symbol.strip()]
        if not candidates:
            raise ValueError("HNSW_TILE_HIT_NOT_IN_QUALIFIED_TILE_SET")
        if len(candidates) != 1:
            raise ValueError("HNSW_TILE_HIT_TO_ORDINAL_AMBIGUOUS")

        record = candidates[0]
        if record.candidate_ordinal in seen_ordinals:
            raise ValueError("HNSW_TILE_DUPLICATE_CANDIDATE_ORDINAL")
        seen_ordinals.add(record.candidate_ordinal)
        bound.append({
            "rank": rank,
            "projectionPointId": str(point_id),
            "score": float(score),
            "candidateOrdinal": record.candidate_ordinal,
            "packetKey": record.ast_payload.packet_key,
            "sourceRef": record.ast_payload.source_ref,
            "sourceRevision": record.ast_payload.source_revision,
            "workspaceRevision": record.ast_payload.workspace_revision,
            "featureId": record.ast_payload.feature_id,
            "featureLabel": record.ast_payload.feature_label,
            "taxonomyRevision": record.ast_payload.taxonomy_revision,
            "retrievalRepresentationId": payload["representation_id"],
            "tileRepresentationId": "semantic_mrl_128",
            "tileQuantization": "mixed_lod_int2_int4",
            "somBmuId": record.som_bmu_id,
            "kmeansClusterId": record.kmeans_cluster_id,
            "tileBlock": record.tile_block,
            "tileSha256": record.tile_sha256,
        })

    return {
        "schema": "atlas.hnsw-lod-candidate-binding.v1",
        "authority": "PROPOSAL_ONLY",
        "canonicalAuthority": False,
        "promotionEligible": False,
        "workspaceRevision": workspace_revision,
        "candidateOrdinalMapDigest": ordinal_map.digest,
        "rankingScoresRemainQdrantProjectionScores": True,
        "bindings": bound,
        "writesPerformed": False,
    }


def _pyarrow():
    try:
        import pyarrow as pa
    except ImportError as error:
        raise RuntimeError("PYARROW_REQUIRED_FOR_ARROW_TILE_EXPORT; install atlas-corpus-lib[arrow]") from error
    return pa


def _ast_json(payload: AstIndexPayloadV1) -> str:
    return json.dumps(payload.model_dump(mode="json", by_alias=True), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def build_candidate_ordinal_map_v1(records: list[LodTileArrowRecordV1]) -> CandidateOrdinalMapV1:
    if not records:
        raise ValueError("CANDIDATE_ORDINAL_MAP_REQUIRES_RECORDS")
    if len(records) > MAX_LOD_ARROW_RECORDS_V1:
        raise ValueError("CANDIDATE_ORDINAL_MAP_RECORD_LIMIT_EXCEEDED")
    ordered = sorted(records, key=lambda record: record.candidate_ordinal)
    revisions = {record.ast_payload.workspace_revision for record in ordered}
    if len(revisions) != 1:
        raise ValueError("CANDIDATE_ORDINAL_MAP_REQUIRES_ONE_WORKSPACE_REVISION")
    entries = [CandidateOrdinalEntryV1(
        candidate_ordinal=record.candidate_ordinal,
        packet_key=record.ast_payload.packet_key,
        source_ref=record.ast_payload.source_ref,
        source_revision=record.ast_payload.source_revision,
        start_byte=record.ast_payload.start_byte,
        end_byte=record.ast_payload.end_byte,
        symbol_name=record.ast_payload.symbol_name,
    ) for record in ordered]
    return build_candidate_ordinal_map_from_entries_v1(entries, next(iter(revisions)))


def encode_lod_tiles_arrow_ipc(records: list[LodTileArrowRecordV1]) -> bytes:
    if not records:
        raise ValueError("LOD_ARROW_EXPORT_REQUIRES_RECORDS")
    if len(records) > MAX_LOD_ARROW_RECORDS_V1:
        raise ValueError("LOD_ARROW_RECORD_LIMIT_EXCEEDED")
    ordinal_map = build_candidate_ordinal_map_v1(records)
    workspace_revisions = {record.ast_payload.workspace_revision for record in records}
    if len(workspace_revisions) != 1:
        raise ValueError("LOD_ARROW_EXPORT_REQUIRES_ONE_WORKSPACE_REVISION")

    pa = _pyarrow()
    ordered = sorted(records, key=lambda record: record.candidate_ordinal)
    ast_fields = [
        ("packet_key", pa.string()),
        ("source_ref", pa.string()),
        ("file_path", pa.string()),
        ("source_revision", pa.string()),
        ("workspace_revision", pa.string()),
        ("feature_id", pa.string()),
        ("feature_label", pa.string()),
        ("taxonomy_revision", pa.string()),
        ("parser_language", pa.string()),
        ("language_resolver_revision", pa.string()),
        ("extractor_id", pa.string()),
        ("extractor_version", pa.string()),
        ("source_byte_length", pa.uint64()),
        ("start_byte", pa.uint64()),
        ("end_byte", pa.uint64()),
        ("symbol_name", pa.string()),
        ("node_type", pa.string()),
        ("kind", pa.string()),
        ("signature", pa.string()),
    ]
    fields = [pa.field(name, type_, nullable=(name in {"packet_key", "signature"})) for name, type_ in ast_fields]
    fields.extend([
        pa.field("ast_payload_json", pa.string(), nullable=False),
        pa.field("candidate_ordinal", pa.uint32(), nullable=False),
        pa.field("som_bmu_id", pa.uint16(), nullable=False),
        pa.field("kmeans_cluster_id", pa.uint16(), nullable=False),
        pa.field("som_assignment_revision", pa.string(), nullable=True),
        pa.field("kmeans_assignment_revision", pa.string(), nullable=True),
        pa.field("tile_block", pa.binary(128), nullable=False),
        pa.field("tile_sha256", pa.string(), nullable=False),
        pa.field("authority", pa.string(), nullable=False),
    ])
    schema = pa.schema(fields, metadata={
        b"atlas.schema": b"atlas.lod-tile-arrow.v1",
        b"atlas.workspace_revision": next(iter(workspace_revisions)).encode("ascii"),
        b"atlas.ordinal_map_digest": ordinal_map.digest.encode("ascii"),
        b"atlas.authority": b"PROPOSAL_ONLY",
    })
    columns = []
    for name, type_ in ast_fields:
        values = [getattr(record.ast_payload, name) for record in ordered]
        columns.append(pa.array(values, type=type_))
    columns.extend([
        pa.array([_ast_json(record.ast_payload) for record in ordered], type=pa.string()),
        pa.array([record.candidate_ordinal for record in ordered], type=pa.uint32()),
        pa.array([record.som_bmu_id for record in ordered], type=pa.uint16()),
        pa.array([record.kmeans_cluster_id for record in ordered], type=pa.uint16()),
        pa.array([record.som_assignment_revision for record in ordered], type=pa.string()),
        pa.array([record.kmeans_assignment_revision for record in ordered], type=pa.string()),
        pa.array([record.tile_block for record in ordered], type=pa.binary(128)),
        pa.array([record.tile_sha256 for record in ordered], type=pa.string()),
        pa.array([record.authority for record in ordered], type=pa.string()),
    ])
    table = pa.Table.from_arrays(columns, schema=schema)
    sink = pa.BufferOutputStream()
    options = pa.ipc.IpcWriteOptions(compression=None, use_threads=False)
    with pa.ipc.new_file(sink, schema, options=options) as writer:
        writer.write_table(table, max_chunksize=len(ordered))
    encoded = sink.getvalue().to_pybytes()
    if len(encoded) > MAX_LOD_ARROW_IPC_BYTES_V1:
        raise ValueError("LOD_ARROW_IPC_BYTE_LIMIT_EXCEEDED")
    return encoded


def decode_lod_tiles_arrow_ipc(data: bytes) -> list[LodTileArrowRecordV1]:
    if not isinstance(data, bytes) or not data:
        raise ValueError("LOD_ARROW_INPUT_MUST_BE_NONEMPTY_BYTES")
    if len(data) > MAX_LOD_ARROW_IPC_BYTES_V1:
        raise ValueError("LOD_ARROW_IPC_BYTE_LIMIT_EXCEEDED")
    pa = _pyarrow()
    try:
        table = pa.ipc.open_file(pa.BufferReader(data)).read_all()
    except Exception as error:
        raise ValueError("LOD_ARROW_IPC_DECODE_FAILED") from error
    metadata = table.schema.metadata or {}
    if metadata.get(b"atlas.schema") != b"atlas.lod-tile-arrow.v1" or metadata.get(b"atlas.authority") != b"PROPOSAL_ONLY":
        raise ValueError("LOD_ARROW_SCHEMA_METADATA_INVALID")
    rows = table.to_pylist()
    if not rows:
        raise ValueError("LOD_ARROW_INPUT_MUST_CONTAIN_RECORDS")
    if len(rows) > MAX_LOD_ARROW_RECORDS_V1:
        raise ValueError("LOD_ARROW_RECORD_LIMIT_EXCEEDED")
    output = []
    seen_ordinals = set()
    for row in rows:
        try:
            ast_payload = AstIndexPayloadV1.model_validate_json(row["ast_payload_json"])
            for name in (
                "packet_key", "source_ref", "file_path", "source_revision", "workspace_revision",
                "feature_id", "feature_label", "taxonomy_revision", "parser_language",
                "language_resolver_revision", "extractor_id", "extractor_version", "source_byte_length",
                "start_byte", "end_byte", "symbol_name", "node_type", "kind", "signature",
            ):
                if row[name] != getattr(ast_payload, name):
                    raise ValueError("LOD_ARROW_AST_METADATA_COLUMN_MISMATCH")
            record = LodTileArrowRecordV1(
                ast_payload=ast_payload,
                candidate_ordinal=row["candidate_ordinal"],
                som_bmu_id=row["som_bmu_id"],
                kmeans_cluster_id=row["kmeans_cluster_id"],
                som_assignment_revision=row["som_assignment_revision"],
                kmeans_assignment_revision=row["kmeans_assignment_revision"],
                tile_block=row["tile_block"],
                tile_sha256=row["tile_sha256"],
                authority=row["authority"],
            )
        except Exception as error:
            raise ValueError("LOD_ARROW_ROW_VALIDATION_FAILED") from error
        if record.candidate_ordinal in seen_ordinals:
            raise ValueError("LOD_ARROW_CANDIDATE_ORDINALS_MUST_BE_UNIQUE")
        seen_ordinals.add(record.candidate_ordinal)
        output.append(record)
    if rows and metadata.get(b"atlas.workspace_revision") != output[0].ast_payload.workspace_revision.encode("ascii"):
        raise ValueError("LOD_ARROW_WORKSPACE_REVISION_METADATA_MISMATCH")
    if any(record.ast_payload.workspace_revision != output[0].ast_payload.workspace_revision for record in output):
        raise ValueError("LOD_ARROW_EXPORT_REQUIRES_ONE_WORKSPACE_REVISION")
    if [record.candidate_ordinal for record in output] != sorted(seen_ordinals):
        raise ValueError("LOD_ARROW_ROWS_NOT_ORDINAL_SORTED")
    ordinal_map = build_candidate_ordinal_map_v1(output)
    if metadata.get(b"atlas.ordinal_map_digest") != ordinal_map.digest.encode("ascii"):
        raise ValueError("LOD_ARROW_ORDINAL_MAP_DIGEST_MISMATCH")
    return output


def decode_lod_tiles_arrow_to_cpu_tensor_v1(data: bytes):
    records = decode_lod_tiles_arrow_ipc(data)
    ordinal_map = build_candidate_ordinal_map_v1(records)
    tensor = stream_lod_blocks_to_pytorch_blob([record.tile_block for record in records])
    if tuple(tensor.shape) != (len(records), 128):
        raise ValueError("LOD_ARROW_TENSOR_SHAPE_MISMATCH")
    if str(tensor.dtype) not in {"torch.uint8", "uint8"}:
        raise ValueError("LOD_ARROW_TENSOR_DTYPE_MISMATCH")
    device = getattr(tensor, "device", None)
    if device is not None and str(device) != "cpu":
        raise ValueError("LOD_ARROW_TENSOR_MUST_REMAIN_ON_CPU")
    return records, ordinal_map, tensor


def decode_lod_tiles_arrow_to_cpu_tensor_view_v1(data: bytes):
    """Return a CPU uint8 tensor viewing Arrow IPC tile bytes; callers must not mutate it."""
    records = decode_lod_tiles_arrow_ipc(data)
    ordinal_map = build_candidate_ordinal_map_v1(records)
    pa = _pyarrow()
    try:
        source_buffer = pa.py_buffer(data)
        table = pa.ipc.open_file(pa.BufferReader(source_buffer)).read_all()
        tile_column = table.column("tile_block")
        if tile_column.num_chunks != 1:
            raise ValueError("LOD_ARROW_TILE_BUFFER_MUST_BE_CONTIGUOUS")
        values_buffer = tile_column.chunk(0).buffers()[1]
        expected_size = len(records) * 128
        if values_buffer.size != expected_size:
            raise ValueError("LOD_ARROW_TILE_BUFFER_SIZE_MISMATCH")
        source_start = source_buffer.address
        if not source_start <= values_buffer.address or values_buffer.address + values_buffer.size > source_start + source_buffer.size:
            raise ValueError("LOD_ARROW_TILE_BUFFER_OUTSIDE_IPC_SOURCE")
        import torch  # type: ignore

        values_view = memoryview(values_buffer)
        tensor = torch.frombuffer(values_view, dtype=torch.uint8).reshape(len(records), 128)
    except ImportError as error:
        raise RuntimeError("TORCH_REQUIRED_FOR_ARROW_TILE_BUFFER_VIEW") from error
    except ValueError:
        raise
    except Exception as error:
        raise ValueError("LOD_ARROW_TILE_BUFFER_VIEW_FAILED") from error
    if tensor.data_ptr() != values_buffer.address:
        raise ValueError("LOD_ARROW_TENSOR_BUFFER_ADDRESS_MISMATCH")
    tensor._atlas_arrow_owner = (data, source_buffer, table, values_buffer, values_view)
    return records, ordinal_map, tensor
