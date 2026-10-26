from __future__ import annotations

import base64
import hashlib
import math
import re
import struct
from typing import Iterable, Literal

from pydantic import Field, model_validator

from .structural_observation_v1 import (
    LspSymbolObservationV1,
    StrictModel,
    StructuralFunctionObservationV1,
)


_WHITESPACE = re.compile(r"\s+")
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_SHA256_REVISION = re.compile(r"^sha256:[a-f0-9]{64}$")
_WINDOWS_DRIVE_PATH = re.compile(r"^[a-zA-Z]:")


def _float32(value: float) -> float:
    return struct.unpack("=f", struct.pack("=f", value))[0]


class AstParserObservationV1(StrictModel):
    schema_id: Literal["atlas.ast.parser-observation.v1"] = Field(
        default="atlas.ast.parser-observation.v1", alias="schema", serialization_alias="schema"
    )
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    utf8_byte_length: int = Field(ge=0)
    root_has_error: bool
    error_node_count: int = Field(ge=0)
    missing_node_count: int = Field(ge=0)


class CanonicalAstChunkRecordV1(StructuralFunctionObservationV1):
    packet_key: str | None = None
    node_type: str = Field(min_length=1)
    kind: str = Field(min_length=1)
    signature: str | None = None
    parser_observation: AstParserObservationV1 | None = None
    syntax_status: Literal["CLEAN", "RECOVERED_WITH_ERRORS"] = "CLEAN"
    scan_completeness: Literal["COMPLETE", "PARTIAL_AST_FAILED"] = "COMPLETE"
    scan_failure: str | None = None


class AstIndexPayloadV1(StrictModel):
    schema_id: Literal["atlas.ast-index-payload.v1"] = Field(
        default="atlas.ast-index-payload.v1", alias="schema", serialization_alias="schema"
    )
    packet_key: str | None = None
    source_ref: str = Field(min_length=1)
    file_path: str = Field(min_length=1)
    source_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    workspace_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    parser_language: str = Field(min_length=1)
    language_resolver_revision: str = Field(min_length=1)
    extractor_id: str = Field(min_length=1)
    extractor_version: str = Field(min_length=1)
    source_byte_length: int = Field(ge=0)
    start_byte: int = Field(ge=0)
    end_byte: int = Field(gt=0)
    symbol_name: str = Field(min_length=1)
    node_type: str = Field(min_length=1)
    kind: str = Field(min_length=1)
    signature: str | None = None
    feature_id: str | None = Field(default=None, min_length=1)
    feature_label: str | None = Field(default=None, min_length=1)
    taxonomy_revision: str | None = Field(default=None, pattern=r"^sha256:[a-f0-9]{64}$")
    lsp_observation: LspSymbolObservationV1 | None = None
    parser_observation: AstParserObservationV1 | None = None
    syntax_status: Literal["CLEAN", "RECOVERED_WITH_ERRORS"]
    scan_completeness: Literal["COMPLETE", "PARTIAL_AST_FAILED"]
    scan_failure: str | None = None
    authority: Literal["PROPOSAL_ONLY"] = "PROPOSAL_ONLY"

    @model_validator(mode="after")
    def validate_lineage_and_feature_binding(self) -> "AstIndexPayloadV1":
        if self.source_ref != self.file_path:
            raise ValueError("FILE_PATH_MUST_EQUAL_SOURCE_REF")
        parts = self.source_ref.split("/")
        if _WINDOWS_DRIVE_PATH.match(self.source_ref) or self.source_ref.startswith("/") or "\\" in self.source_ref or any(part in {"", ".", ".."} for part in parts):
            raise ValueError("SOURCE_REF_MUST_BE_CANONICAL_REPOSITORY_RELATIVE_POSIX_PATH")
        if not _SHA256_REVISION.fullmatch(self.source_revision) or not _SHA256_REVISION.fullmatch(self.workspace_revision):
            raise ValueError("AST_INDEX_REVISIONS_MUST_BE_SHA256")
        if not self.start_byte < self.end_byte <= self.source_byte_length:
            raise ValueError("UTF8_BYTE_SPAN_OUT_OF_SOURCE_BOUNDS")
        if self.parser_observation is not None and (
            self.parser_observation.source_sha256 != self.source_revision.removeprefix("sha256:")
            or self.parser_observation.utf8_byte_length != self.source_byte_length
        ):
            raise ValueError("AST_PARSER_OBSERVATION_DOES_NOT_MATCH_SOURCE_REVISION")
        if self.lsp_observation is not None and self.lsp_observation.symbol_name != self.symbol_name:
            raise ValueError("LSP_SYMBOL_NAME_DOES_NOT_MATCH_AST_INDEX_SYMBOL")
        feature_values = (self.feature_id, self.feature_label, self.taxonomy_revision)
        if any(value is not None for value in feature_values) and not all(value is not None for value in feature_values):
            raise ValueError("FEATURE_BINDING_FIELDS_MUST_BE_COMPLETE")
        if self.taxonomy_revision is not None and not _SHA256_REVISION.fullmatch(self.taxonomy_revision):
            raise ValueError("TAXONOMY_REVISION_MUST_BE_SHA256")
        return self


class Pg18ByteaTurboVecPayloadV1(StrictModel):
    schema_id: Literal["atlas.turbovec-packed-vector.v1"] = Field(
        default="atlas.turbovec-packed-vector.v1", alias="schema", serialization_alias="schema"
    )
    dimension: Literal[128] = 128
    bits_per_value: Literal[2, 4]
    quantizer: Literal["uniform-affine-v1"] = "uniform-affine-v1"
    minimum: float
    maximum: float
    bytea_hex: str
    base64_transport: str
    base32_transport: str
    payload_sha256: str
    sign_bitset_128_hex: str
    sign_bitset_128_bit_string: str = Field(pattern=r"^[01]{128}$")
    sign_bitset_sha256: str
    storage_authority: Literal["PROJECTION_PROPOSAL"] = "PROJECTION_PROPOSAL"


def normalize_symbol_name(value: str) -> str:
    return _WHITESPACE.sub(" ", value).strip()


def build_canonical_ast_chunk_record(value: dict) -> CanonicalAstChunkRecordV1:
    return CanonicalAstChunkRecordV1.model_validate(value)


def build_ast_index_payload_v1(record: CanonicalAstChunkRecordV1) -> AstIndexPayloadV1:
    feature = record.feature_binding
    return AstIndexPayloadV1.model_validate({
        "packet_key": record.packet_key,
        "source_ref": record.source_ref,
        "file_path": record.file_path,
        "source_revision": record.source_revision,
        "workspace_revision": record.workspace_revision,
        "parser_language": record.parser_language,
        "language_resolver_revision": record.language_resolver_revision,
        "extractor_id": record.extractor_id,
        "extractor_version": record.extractor_version,
        "source_byte_length": record.source_byte_length,
        "start_byte": record.start_byte,
        "end_byte": record.end_byte,
        "symbol_name": record.symbol_name,
        "node_type": record.node_type,
        "kind": record.kind,
        "signature": record.signature,
        "feature_id": feature.feature_id if feature else None,
        "feature_label": feature.feature_label if feature else None,
        "taxonomy_revision": feature.taxonomy_revision if feature else None,
        "lsp_observation": record.lsp_observation,
        "parser_observation": record.parser_observation,
        "syntax_status": record.syntax_status,
        "scan_completeness": record.scan_completeness,
        "scan_failure": record.scan_failure,
        "authority": "PROPOSAL_ONLY",
    })


def build_source_bound_structural_observation(
    *,
    source_ref: str,
    source_bytes: bytes,
    workspace_revision: str,
    parser_language: str,
    language_resolver_revision: str,
    extractor_id: str,
    extractor_version: str,
    start_byte: int,
    end_byte: int,
    symbol_name: str,
    feature_binding: dict | None = None,
    lsp_observation: dict | None = None,
) -> StructuralFunctionObservationV1:
    if not isinstance(source_bytes, bytes):
        raise ValueError("SOURCE_BYTES_MUST_BE_BYTES")
    if isinstance(start_byte, bool) or isinstance(end_byte, bool) or not isinstance(start_byte, int) or not isinstance(end_byte, int):
        raise ValueError("SOURCE_SPAN_OFFSETS_MUST_BE_INTEGERS")
    if not 0 <= start_byte < end_byte <= len(source_bytes):
        raise ValueError("UTF8_BYTE_SPAN_OUT_OF_SOURCE_BOUNDS")
    try:
        source_bytes.decode("utf-8")
        source_bytes[:start_byte].decode("utf-8")
        source_bytes[start_byte:end_byte].decode("utf-8")
        source_bytes[end_byte:].decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("SOURCE_OR_SPAN_IS_NOT_VALID_UTF8") from error

    return StructuralFunctionObservationV1.model_validate({
        "source_ref": source_ref,
        "file_path": source_ref,
        "source_revision": f"sha256:{hashlib.sha256(source_bytes).hexdigest()}",
        "workspace_revision": workspace_revision,
        "parser_language": parser_language,
        "language_resolver_revision": language_resolver_revision,
        "extractor_id": extractor_id,
        "extractor_version": extractor_version,
        "source_byte_length": len(source_bytes),
        "start_byte": start_byte,
        "end_byte": end_byte,
        "symbol_name": symbol_name,
        "feature_binding": feature_binding,
        "lsp_observation": lsp_observation,
        "authority": "PROPOSAL_ONLY",
    })


def build_source_bound_observation_from_8095_chunk(
    *,
    response: dict,
    chunk: dict,
    source_ref: str,
    source_bytes: bytes,
    workspace_revision: str,
    language_resolver_revision: str,
    feature_binding: dict | None = None,
    lsp_observation: dict | None = None,
) -> CanonicalAstChunkRecordV1:
    if not isinstance(response, dict) or response.get("schema") != "atlas.ast.evidence.v1":
        raise ValueError("8095_AST_RESPONSE_SCHEMA_UNSUPPORTED")
    if response.get("file_path") != source_ref:
        raise ValueError("8095_FILE_PATH_DOES_NOT_MATCH_SOURCE_REF")
    if not isinstance(source_bytes, bytes):
        raise ValueError("SOURCE_BYTES_MUST_BE_BYTES")
    expected_source_revision = f"sha256:{hashlib.sha256(source_bytes).hexdigest()}"
    if response.get("source_revision") != expected_source_revision:
        raise ValueError("8095_SOURCE_REVISION_DOES_NOT_MATCH_SOURCE_BYTES")
    engine = response.get("engine")
    engine_version = response.get("engine_version")
    language = response.get("language")
    if not all(isinstance(value, str) and value.strip() for value in (engine, engine_version, language)):
        raise ValueError("8095_PARSER_METADATA_REQUIRED")
    parser_observation = response.get("parser_observation")
    if parser_observation is not None:
        if not isinstance(parser_observation, dict):
            raise ValueError("8095_PARSER_OBSERVATION_INVALID")
        if parser_observation.get("schema") != "atlas.ast.parser-observation.v1":
            raise ValueError("8095_PARSER_OBSERVATION_SCHEMA_UNSUPPORTED")
        if parser_observation.get("source_sha256") != expected_source_revision.removeprefix("sha256:") or parser_observation.get("utf8_byte_length") != len(source_bytes):
            raise ValueError("8095_PARSER_OBSERVATION_DOES_NOT_MATCH_SOURCE_BYTES")
    if not isinstance(chunk, dict):
        raise ValueError("8095_AST_CHUNK_INVALID")
    symbol_name = chunk.get("name")
    node_type = chunk.get("node_type")
    kind = chunk.get("kind")
    if not all(isinstance(value, str) and value.strip() for value in (symbol_name, node_type, kind)):
        raise ValueError("8095_NAMED_AST_CHUNK_REQUIRED")
    if lsp_observation is not None:
        if not isinstance(lsp_observation, dict):
            raise ValueError("LSP_OBSERVATION_INVALID")
        if lsp_observation.get("symbol_name") != symbol_name:
            raise ValueError("LSP_SYMBOL_NAME_DOES_NOT_MATCH_AST_CHUNK")

    observation = build_source_bound_structural_observation(
        source_ref=source_ref,
        source_bytes=source_bytes,
        workspace_revision=workspace_revision,
        parser_language=language,
        language_resolver_revision=language_resolver_revision,
        extractor_id=engine,
        extractor_version=engine_version,
        start_byte=chunk.get("start_byte"),
        end_byte=chunk.get("end_byte"),
        symbol_name=symbol_name,
        feature_binding=feature_binding,
        lsp_observation=lsp_observation,
    )
    return CanonicalAstChunkRecordV1.model_validate({
        **observation.model_dump(),
        "node_type": node_type,
        "kind": kind,
        "signature": chunk.get("signature_text"),
        "parser_observation": parser_observation,
        "syntax_status": response.get("syntax_status", "CLEAN"),
        "scan_completeness": response.get("scan_completeness", "COMPLETE"),
        "scan_failure": response.get("scan_failure"),
    })


def reconcile_missing_source_ref(source_hash: str, exact_bindings: dict[str, str]) -> str | None:
    digest = source_hash.removeprefix("sha256:").lower()
    if not _SHA256.fullmatch(digest):
        raise ValueError("SOURCE_HASH_MUST_BE_SHA256")
    matches = sorted({path for value, path in exact_bindings.items() if value.removeprefix("sha256:").lower() == digest})
    return matches[0] if len(matches) == 1 else None


def pack_turbovec_mrl128_bytes(values: Iterable[float], bits_per_value: int = 4) -> Pg18ByteaTurboVecPayloadV1:
    if bits_per_value not in (2, 4):
        raise ValueError("TURBOVEC_BITS_MUST_BE_2_OR_4")
    vector = [_float32(float(value)) for value in values]
    if len(vector) != 128:
        raise ValueError("TURBOVEC_MRL_PREFIX_MUST_HAVE_128_VALUES")
    if not all(math.isfinite(value) for value in vector):
        raise ValueError("TURBOVEC_VECTOR_VALUES_MUST_BE_FINITE")
    sum_sq = 0.0
    for value in vector:
        sum_sq = _float32(sum_sq + _float32(value * value))
    norm = _float32(math.sqrt(sum_sq))
    inv_norm = _float32(1.0 / norm) if sum_sq > 1e-12 else 1.0
    normalized = [_float32(value * inv_norm) for value in vector]
    minimum = min(normalized)
    maximum = max(normalized)
    levels = (1 << bits_per_value) - 1
    value_range = _float32(maximum - minimum)
    safe_range = max(value_range, _float32(1e-8))
    step = _float32(safe_range / levels)
    quantized = [
        0 if step == 0 else max(0, min(levels, math.floor(_float32(_float32(_float32(value - minimum) / safe_range) * levels) + 0.5)))
        for value in normalized
    ]
    packed = bytearray(128 * bits_per_value // 8)
    if bits_per_value == 4:
        for index in range(0, 128, 2):
            packed[index // 2] = (quantized[index] << 4) | quantized[index + 1]
    else:
        for index, quantized_value in enumerate(quantized):
            packed[index // 4] |= quantized_value << (6 - (index % 4) * 2)
    raw = bytes(packed)
    sign_bits = bytearray(16)
    sign_string = "".join("1" if value >= 0.0 else "0" for value in normalized)
    for index, bit in enumerate(sign_string):
        if bit == "1":
            sign_bits[index >> 3] |= 1 << (7 - (index & 7))
    sign_raw = bytes(sign_bits)
    return Pg18ByteaTurboVecPayloadV1(
        bits_per_value=bits_per_value,
        minimum=minimum,
        maximum=maximum,
        bytea_hex="\\x" + raw.hex(),
        base64_transport=base64.b64encode(raw).decode("ascii"),
        base32_transport=base64.b32encode(raw).decode("ascii"),
        payload_sha256=hashlib.sha256(raw).hexdigest(),
        sign_bitset_128_hex="\\x" + sign_raw.hex(),
        sign_bitset_128_bit_string=sign_string,
        sign_bitset_sha256=hashlib.sha256(sign_raw).hexdigest(),
    )
