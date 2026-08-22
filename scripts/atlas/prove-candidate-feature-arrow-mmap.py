#!/usr/bin/env python3
"""FEAT-03C-MMAP true OS mmap + optional PyArrow IPC readback proof.

This script does not write stores or mutate the artifact. It opens the Arrow IPC
FILE through Python's mmap module with ACCESS_READ, verifies the immutable
ArtifactAddressV1 checksum/revision identity, then uses PyArrow (when installed)
to read the file from the mapped buffer and compare dense ordinals plus optional
expected CandidateFeatureColumnarV1 values/presence bits.

If PyArrow is unavailable, the script emits a typed blocker and exits non-zero.
That proves mmap capability separately without falsely promoting Arrow mmap
readback parity.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mmap
import os
import sys
from pathlib import Path
from typing import Any

ARROW_SCHEMA = "atlas.candidate-feature-arrow-ipc.v1"
FEATURE_NAMES = [
    "semanticRelevance",
    "lexicalRelevance",
    "astAffinity",
    "graphAuthority",
    "personalizedPageRank",
    "communityAffinity",
    "manifold4OrientationSimilarity",
    "crossEncoderRawScore",
    "crossEncoderCalibratedScore",
    "domainAffinity",
    "executionUtility",
    "memoryUtility",
]
IDENTITY_COLUMNS = [
    ("canonical_id", "canonicalIds"),
    ("packet_key", "packetKeys"),
    ("tree_node_id", "treeNodeIds"),
    ("symbol_version_id", "symbolVersionIds"),
    ("source_revision", "sourceRevisions"),
    ("graph_revision", "graphRevisions"),
    ("semantic_revision", "semanticRevisions"),
    ("degraded_identity", "degradedIdentity"),
    ("lane_mask_u16", "laneMaskU16"),
]


def canonical_json(value: Any) -> str:
    def normalize(item: Any) -> Any:
        if isinstance(item, list):
            return [normalize(child) for child in item]
        if isinstance(item, dict):
            return {key: normalize(item[key]) for key in sorted(item) if item[key] is not None}
        return item

    return json.dumps(normalize(value), separators=(",", ":"), ensure_ascii=False)


def sha256_bytes(value: bytes | bytearray | memoryview | mmap.mmap) -> str:
    digest = hashlib.sha256()
    view = memoryview(value)
    try:
        for start in range(0, len(view), 1024 * 1024):
            digest.update(view[start : start + 1024 * 1024])
    finally:
        view.release()
    return digest.hexdigest()


def artifact_from_envelope(value: Any) -> dict[str, Any]:
    if isinstance(value, dict) and isinstance(value.get("artifact"), dict):
        return value["artifact"]
    if not isinstance(value, dict):
        raise ValueError("CANDIDATE_FEATURE_MMAP_ARTIFACT_ADDRESS_REQUIRED")
    return value


def validate_artifact(artifact: dict[str, Any]) -> None:
    if artifact.get("schema") != "atlas.artifact-address.v1":
        raise ValueError("CANDIDATE_FEATURE_MMAP_ARTIFACT_ADDRESS_REQUIRED")
    if artifact.get("schemaId") != ARROW_SCHEMA:
        raise ValueError(f"CANDIDATE_FEATURE_MMAP_SCHEMA_MISMATCH:{artifact.get('schemaId')}")
    locator = artifact.get("locator") or {}
    if locator.get("storage") != "ARROW_IPC" or not locator.get("path"):
        raise ValueError("CANDIDATE_FEATURE_MMAP_ARROW_LOCATOR_REQUIRED")
    for name in ("artifactHash", "checksum", "revisionSetHash"):
        value = artifact.get(name)
        if not isinstance(value, str) or len(value) != 64 or any(ch not in "0123456789abcdef" for ch in value):
            raise ValueError(f"CANDIDATE_FEATURE_MMAP_INVALID_CHECKSUM:{name}")
    revisions = artifact.get("revisions")
    if not isinstance(revisions, dict):
        raise ValueError("CANDIDATE_FEATURE_MMAP_REVISIONS_REQUIRED")
    revision_set_hash = hashlib.sha256(canonical_json(revisions).encode("utf-8")).hexdigest()
    if revision_set_hash != artifact["revisionSetHash"]:
        raise ValueError("CANDIDATE_FEATURE_MMAP_REVISION_SET_HASH_MISMATCH")
    artifact_hash = hashlib.sha256(
        canonical_json(
            {
                "schemaId": artifact["schemaId"],
                "checksum": artifact["checksum"],
                "revisionSetHash": artifact["revisionSetHash"],
            }
        ).encode("utf-8")
    ).hexdigest()
    if artifact_hash != artifact["artifactHash"] or artifact.get("artifactId") != f"sha256:{artifact_hash}":
        raise ValueError("CANDIDATE_FEATURE_MMAP_ARTIFACT_HASH_MISMATCH")


def parse_csv_strings(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return list(default)
    result = list(dict.fromkeys(part for part in value.split(",") if part))
    unknown = [name for name in result if name not in FEATURE_NAMES]
    if unknown:
        raise ValueError(f"CANDIDATE_FEATURE_MMAP_UNKNOWN_FEATURE:{unknown[0]}")
    return result


def parse_ordinals(value: str | None, row_count: int) -> list[int]:
    if not value:
        return list(range(row_count))
    parsed = list(dict.fromkeys(int(part) for part in value.split(",") if part))
    for ordinal in parsed:
        if ordinal < 0 or ordinal >= row_count:
            raise ValueError(f"CANDIDATE_FEATURE_MMAP_ORDINAL_OUT_OF_RANGE:{ordinal}")
    return parsed


def pyarrow_value(column: Any, index: int) -> Any:
    return column[index].as_py()


def verify_expected(table: Any, expected: dict[str, Any], selected_features: list[str]) -> None:
    if expected.get("schema") != "atlas.candidate-feature-columnar.v1":
        raise ValueError("CANDIDATE_FEATURE_MMAP_EXPECTED_COLUMNAR_SCHEMA_REQUIRED")
    if table.num_rows != expected.get("rowCount"):
        raise ValueError("CANDIDATE_FEATURE_MMAP_EXPECTED_ROW_COUNT_MISMATCH")
    ordinals = table.column("candidate_ordinal")
    for row, expected_ordinal in enumerate(expected["candidateOrdinals"]):
        if int(pyarrow_value(ordinals, row)) != expected_ordinal:
            raise ValueError(f"CANDIDATE_FEATURE_MMAP_ORDINAL_MISMATCH:{row}")
    for arrow_name, expected_name in IDENTITY_COLUMNS:
        column = table.column(arrow_name)
        expected_values = expected[expected_name]
        for row, expected_value in enumerate(expected_values):
            actual = pyarrow_value(column, row)
            if actual != expected_value:
                raise ValueError(f"CANDIDATE_FEATURE_MMAP_IDENTITY_MISMATCH:{arrow_name}:{row}")
    for feature_name in selected_features:
        feature_index = expected["featureNames"].index(feature_name)
        values = table.column(feature_name)
        presence = table.column(f"{feature_name}_present")
        for row in range(expected["rowCount"]):
            cell = row * expected["featureCount"] + feature_index
            actual_value = float(pyarrow_value(values, row))
            actual_present = int(pyarrow_value(presence, row))
            expected_value = float(expected["featureValues"][cell])
            expected_present = int(expected["featurePresence"][cell])
            if abs(actual_value - expected_value) > 1e-6:
                raise ValueError(f"CANDIDATE_FEATURE_MMAP_FEATURE_VALUE_MISMATCH:{row}:{feature_name}")
            if actual_present != expected_present:
                raise ValueError(f"CANDIDATE_FEATURE_MMAP_FEATURE_PRESENCE_MISMATCH:{row}:{feature_name}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", required=True, help="ArtifactAddressV1 or writer receipt JSON")
    parser.add_argument("--expected", help="CandidateFeatureColumnarV1 JSON for exact parity checks")
    parser.add_argument("--features", help="Comma-separated feature columns")
    parser.add_argument("--ordinals", help="Comma-separated candidate ordinals")
    args = parser.parse_args()

    artifact_envelope = json.loads(Path(args.artifact).read_text(encoding="utf-8"))
    artifact = artifact_from_envelope(artifact_envelope)
    validate_artifact(artifact)
    expected = json.loads(Path(args.expected).read_text(encoding="utf-8")) if args.expected else None
    selected_features = parse_csv_strings(args.features, FEATURE_NAMES)
    file_path = Path(artifact["locator"]["path"]).resolve()

    with file_path.open("rb") as handle:
        stat = os.fstat(handle.fileno())
        if stat.st_size < 12:
            raise ValueError("CANDIDATE_FEATURE_MMAP_FILE_TOO_SMALL")
        with mmap.mmap(handle.fileno(), length=0, access=mmap.ACCESS_READ) as mapped:
            if mapped[:6] != b"ARROW1" or mapped[-6:] != b"ARROW1":
                raise ValueError("CANDIDATE_FEATURE_MMAP_NOT_ARROW_IPC_FILE")
            checksum = sha256_bytes(mapped)
            if checksum != artifact["checksum"]:
                raise ValueError("CANDIDATE_FEATURE_MMAP_FILE_CHECKSUM_MISMATCH")

            base_receipt = {
                "schema": "atlas.candidate-feature-arrow-mmap-receipt.v1",
                "artifactId": artifact["artifactId"],
                "checksum": checksum,
                "revisionSetHash": artifact["revisionSetHash"],
                "candidateSnapshotRevision": artifact["revisions"].get("candidateSnapshotRevision"),
                "ordinalMapChecksum": artifact["revisions"].get("ordinalMapChecksum"),
                "featureSnapshotChecksum": artifact["revisions"].get("featureSnapshotChecksum"),
                "columnarChecksum": artifact["revisions"].get("columnarChecksum"),
                "fileByteLength": stat.st_size,
                "ipcFileMagicVerified": True,
                "artifactChecksumVerified": True,
                "osMmap": True,
                "mmapAccess": "READ_ONLY",
                "storeWrites": False,
                "identityAuthority": False,
                "canonicalOwnerChanged": False,
            }

            try:
                import pyarrow as pa  # type: ignore
                import pyarrow.ipc as ipc  # type: ignore
            except ImportError:
                print(json.dumps({
                    **base_receipt,
                    "status": "MMAP_FILE_PROVEN_PYARROW_BLOCKED",
                    "pyarrowAvailable": False,
                    "arrowReadbackProven": False,
                    "blocker": "PYARROW_NOT_INSTALLED",
                }, indent=2))
                return 3

            mapped_view = memoryview(mapped)
            reader = None
            ipc_file = None
            table = None
            try:
                reader = pa.BufferReader(mapped_view)
                ipc_file = ipc.open_file(reader)
                table = ipc_file.read_all()
                row_count = table.num_rows
                ordinals = table.column("candidate_ordinal")
                for ordinal in range(row_count):
                    if int(pyarrow_value(ordinals, ordinal)) != ordinal:
                        raise ValueError(f"CANDIDATE_FEATURE_MMAP_NON_DENSE_ORDINAL:{ordinal}")
                if expected is not None:
                    verify_expected(table, expected, selected_features)
                selected_ordinals = parse_ordinals(args.ordinals, row_count)
                selected_rows = [
                    {
                        "candidateOrdinal": ordinal,
                        "canonicalId": pyarrow_value(table.column("canonical_id"), ordinal),
                        "features": {
                            feature: {
                                "value": float(pyarrow_value(table.column(feature), ordinal)),
                                "present": bool(int(pyarrow_value(table.column(f"{feature}_present"), ordinal))),
                            }
                            for feature in selected_features
                        },
                    }
                    for ordinal in selected_ordinals
                ]
                output = {
                    **base_receipt,
                    "status": "CANDIDATE_FEATURE_ARROW_MMAP_PROVEN",
                    "pyarrowAvailable": True,
                    "arrowReadbackProven": True,
                    "denseOrdinalVerified": True,
                    "expectedColumnarVerified": expected is not None,
                    "rowCount": row_count,
                    "selectedRowCount": len(selected_rows),
                    "selectedFeatures": selected_features,
                    "selectedRows": selected_rows,
                }
            finally:
                # PyArrow may retain references to the exported mmap memoryview.
                # Drop the table and reader before releasing the view so the
                # surrounding mmap context can close deterministically.
                table = None
                ipc_file = None
                if reader is not None:
                    reader.close()
                reader = None
                mapped_view.release()

            print(json.dumps(output, indent=2))
            return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
