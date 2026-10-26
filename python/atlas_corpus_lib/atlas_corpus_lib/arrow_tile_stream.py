from __future__ import annotations

import hashlib
import json
from typing import Literal

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
    tile_block: bytes
    tile_sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    authority: Literal["PROPOSAL_ONLY"] = "PROPOSAL_ONLY"

    @model_validator(mode="after")
    def validate_lineage_and_payload(self) -> "LodTileArrowRecordV1":
        if not all((self.ast_payload.feature_id, self.ast_payload.feature_label, self.ast_payload.taxonomy_revision)):
            raise ValueError("FEATURE_BINDING_REQUIRED_FOR_LOD_ARROW_EXPORT")
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
