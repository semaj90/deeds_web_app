"""PyArrow mmap readback/reference consumer for Parent Atlas structured values.

The Arrow file is a noncanonical immutable projection. Dense value ordinals are
snapshot-local lookup coordinates. Canonical/source identity remains in the
provenance columns and Parent Atlas host contracts.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path
from typing import Any, Mapping, Sequence


def _stable(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _checksum(value: Any) -> str:
    return sha256(_stable(value).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class StructuredValueMmapReceipt:
    schema: str
    file_path: str
    row_count: int
    root_value_ordinal: int
    row_identity_checksum: str
    structure_checksum: str
    provenance_is_struct: bool
    members_is_list_struct: bool
    entries_is_list_struct: bool
    canonical_authority: bool = False

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


def _field_is_struct(field) -> bool:
    import pyarrow as pa
    return pa.types.is_struct(field.type)


def _field_is_list_struct(field) -> bool:
    import pyarrow as pa
    return pa.types.is_list(field.type) and pa.types.is_struct(field.type.value_type)


def _as_python_rows(table) -> list[dict[str, Any]]:
    # to_pylist preserves nested List/Struct values as ordinary Python objects
    # only at this validation boundary; the file itself remains Arrow columnar.
    return table.to_pylist()


def validate_structured_value_rows(rows: Sequence[Mapping[str, Any]], root_value_ordinal: int) -> tuple[str, str]:
    if rows and (root_value_ordinal < 0 or root_value_ordinal >= len(rows)):
        raise ValueError("STRUCTURED_VALUE_ARROW_ROOT_OUT_OF_RANGE")
    identities: list[dict[str, Any]] = []
    topology: list[dict[str, Any]] = []
    for ordinal, row in enumerate(rows):
        observed = int(row["value_ordinal"])
        if observed != ordinal:
            raise ValueError(f"STRUCTURED_VALUE_ARROW_NON_DENSE_ORDINAL:{ordinal}:{observed}")
        provenance = row.get("provenance") or {}
        identities.append({
            "value_ordinal": observed,
            "value_id": row["value_id"],
            "source_span_checksum": provenance.get("source_span_checksum"),
        })
        members = list(row.get("members") or [])
        entries = list(row.get("entries") or [])
        for member in members:
            child = int(member["child_value_ordinal"])
            if child < 0 or child >= len(rows):
                raise ValueError(f"STRUCTURED_VALUE_ARROW_MEMBER_REF_OUT_OF_RANGE:{ordinal}:{child}")
        for entry in entries:
            child = int(entry["child_value_ordinal"])
            if child < 0 or child >= len(rows):
                raise ValueError(f"STRUCTURED_VALUE_ARROW_ENTRY_REF_OUT_OF_RANGE:{ordinal}:{child}")
        topology.append({
            "value_ordinal": observed,
            "kind": row["kind"],
            "members": members,
            "entries": entries,
        })
    return _checksum(identities), _checksum(topology)


def read_structured_value_arrow_mmap(
    file_path: str | Path,
    *,
    root_value_ordinal: int,
    expected_row_identity_checksum: str | None = None,
    expected_structure_checksum: str | None = None,
) -> tuple[Any, StructuredValueMmapReceipt]:
    try:
        import pyarrow as pa
        import pyarrow.ipc as ipc
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise RuntimeError("pyarrow is required for SV-6 mmap proof") from exc

    path = Path(file_path).resolve()
    with pa.memory_map(str(path), "r") as source:
        reader = ipc.open_file(source)
        table = reader.read_all()

    schema = table.schema
    provenance = schema.field("provenance")
    members = schema.field("members")
    entries = schema.field("entries")
    if not _field_is_struct(provenance):
        raise ValueError(f"STRUCTURED_VALUE_ARROW_PROVENANCE_NOT_STRUCT:{provenance.type}")
    if not _field_is_list_struct(members):
        raise ValueError(f"STRUCTURED_VALUE_ARROW_MEMBERS_NOT_LIST_STRUCT:{members.type}")
    if not _field_is_list_struct(entries):
        raise ValueError(f"STRUCTURED_VALUE_ARROW_ENTRIES_NOT_LIST_STRUCT:{entries.type}")

    rows = _as_python_rows(table)
    row_identity_checksum, structure_checksum = validate_structured_value_rows(rows, root_value_ordinal)
    if expected_row_identity_checksum is not None and row_identity_checksum != expected_row_identity_checksum:
        raise ValueError("STRUCTURED_VALUE_ARROW_ROW_IDENTITY_CHECKSUM_MISMATCH")
    if expected_structure_checksum is not None and structure_checksum != expected_structure_checksum:
        raise ValueError("STRUCTURED_VALUE_ARROW_STRUCTURE_CHECKSUM_MISMATCH")

    return table, StructuredValueMmapReceipt(
        schema="atlas.structured-value-arrow-mmap-receipt.v1",
        file_path=str(path),
        row_count=table.num_rows,
        root_value_ordinal=root_value_ordinal,
        row_identity_checksum=row_identity_checksum,
        structure_checksum=structure_checksum,
        provenance_is_struct=True,
        members_is_list_struct=True,
        entries_is_list_struct=True,
        canonical_authority=False,
    )


def reconstruct_structured_value(rows: Sequence[Mapping[str, Any]], root_value_ordinal: int) -> dict[str, Any]:
    """Reconstruct the logical nested topology for parity testing, not canonical materialization."""
    validate_structured_value_rows(rows, root_value_ordinal)
    visiting: set[int] = set()

    def build(ordinal: int) -> dict[str, Any]:
        if ordinal in visiting:
            raise ValueError(f"STRUCTURED_VALUE_ARROW_CYCLE:{ordinal}")
        visiting.add(ordinal)
        row = rows[ordinal]
        result = {
            "value_ordinal": ordinal,
            "value_id": row["value_id"],
            "kind": row["kind"],
            "source_text": row["source_text"],
            "provenance": row["provenance"],
        }
        if row["kind"] in {"ARRAY", "TUPLE", "ARGUMENT_LIST", "PARAMETER_LIST"}:
            result["members"] = [
                {
                    **{key: value for key, value in member.items() if key != "child_value_ordinal"},
                    "value": build(int(member["child_value_ordinal"])),
                }
                for member in row.get("members") or []
            ]
        elif row["kind"] == "OBJECT":
            result["entries"] = [
                {
                    **{key: value for key, value in entry.items() if key != "child_value_ordinal"},
                    "value": build(int(entry["child_value_ordinal"])),
                }
                for entry in row.get("entries") or []
            ]
        elif row["kind"] == "NULL":
            result["value"] = None
        elif row["kind"] == "BOOLEAN":
            result["value"] = row.get("boolean_value")
        elif row["kind"] == "NUMBER":
            result["value"] = row.get("number_value")
        elif row["kind"] == "STRING":
            result["value"] = row.get("string_value")
        else:
            result["expression_node_type"] = row.get("expression_node_type")
        visiting.remove(ordinal)
        return result

    return build(root_value_ordinal)
