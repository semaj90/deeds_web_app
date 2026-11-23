"""Build and hash-verify an Apache Arrow IPC `feature_matrix_5.arrow` artifact.

Consumes `docs/reports/doc14-admitted-chunks.jsonl` (200 Postgres-PROVEN chunks),
computes real `entropy_norm` (normalized UTF-8 byte Shannon entropy) and `ast_signal`,
preserves explicit `presence_mask[4] = 0` for missing `execution_utility` (per
`feature-vector-5.ts`), writes true Arrow fixed-size list columns (no JSON strings),
reopens the `.arrow` file for readback verification, and writes
`docs/reports/feature-matrix-5-receipt-v1.json`.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Any, Sequence

import pyarrow as pa
import pyarrow.ipc as pa_ipc

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = REPO_ROOT / "docs" / "reports" / "doc14-admitted-chunks.jsonl"
DEFAULT_ARROW = REPO_ROOT / "docs" / "reports" / "feature_matrix_5.arrow"
DEFAULT_RECEIPT = REPO_ROOT / "docs" / "reports" / "feature-matrix-5-receipt-v1.json"

_AST_DECL_RE = re.compile(r"\b(?:export|async\s+function|function|class|interface|type|const)\b")


def compute_byte_entropy_norm(text: str) -> float:
    raw = text.encode("utf-8", errors="replace")
    n = len(raw)
    if n == 0:
        return 0.0
    counts = Counter(raw)
    entropy = -sum((c / n) * math.log2(c / n) for c in counts.values())
    return round(min(1.0, max(0.0, entropy / 8.0)), 6)


def compute_ast_signal(text: str) -> float:
    hits = len(_AST_DECL_RE.findall(text))
    return round(math.tanh(hits / 5.0), 6)


def build_feature_matrix_5_arrow_v1(
    records: Sequence[dict[str, Any]],
    arrow_path: Path,
) -> dict[str, Any]:
    if not records:
        raise ValueError("EMPTY_CHUNK_RECORDS")

    chunk_ids: list[str] = []
    source_refs: list[str] = []
    source_revisions: list[str] = []
    chunk_sha256s: list[str] = []
    features_col: list[list[float]] = []
    presence_col: list[list[int]] = []

    for rec in records:
        text = str(rec.get("text") or "")
        entropy_norm = compute_byte_entropy_norm(text)
        ast_signal = compute_ast_signal(text)
        domain_fit = 1.0 if rec.get("scope") == "repo:deeds" else 0.5
        authority_norm = (
            1.0
            if rec.get("pgReadbackStatus") == "PROVEN" and rec.get("admissionStatus") == "INDEX_ELIGIBLE"
            else 0.0
        )
        # Missing execution_utility -> 0.0 value with presence_mask[4] = 0
        execution_utility = 0.0
        presence_mask = [1, 1, 1, 1, 0]

        chunk_ids.append(str(rec["chunkId"]))
        source_refs.append(str(rec["sourceRef"]))
        source_revisions.append(str(rec["sourceRevision"]))
        chunk_sha256s.append(str(rec["chunkSha256"]))
        features_col.append([entropy_norm, ast_signal, domain_fit, authority_norm, execution_utility])
        presence_col.append(presence_mask)

    schema = pa.schema([
        pa.field("chunk_id", pa.string()),
        pa.field("source_ref", pa.string()),
        pa.field("source_revision", pa.string()),
        pa.field("chunk_sha256", pa.string()),
        pa.field("features", pa.list_(pa.float32(), 5)),
        pa.field("presence_mask", pa.list_(pa.uint8(), 5)),
    ])
    table = pa.table(
        {
            "chunk_id": pa.array(chunk_ids, type=pa.string()),
            "source_ref": pa.array(source_refs, type=pa.string()),
            "source_revision": pa.array(source_revisions, type=pa.string()),
            "chunk_sha256": pa.array(chunk_sha256s, type=pa.string()),
            "features": pa.array(features_col, type=pa.list_(pa.float32(), 5)),
            "presence_mask": pa.array(presence_col, type=pa.list_(pa.uint8(), 5)),
        },
        schema=schema,
    )

    arrow_path.parent.mkdir(parents=True, exist_ok=True)
    with pa_ipc.new_file(arrow_path, schema) as writer:
        writer.write_table(table)

    arrow_bytes = arrow_path.read_bytes()
    arrow_sha256 = f"sha256:{hashlib.sha256(arrow_bytes).hexdigest()}"

    # Independent readback verification
    with pa_ipc.open_file(arrow_path) as reader:
        readback = reader.read_all()

    return {
        "schema": "atlas.feature-matrix-5-arrow-receipt.v1",
        "arrowPath": str(arrow_path),
        "arrowSha256": arrow_sha256,
        "arrowBytes": len(arrow_bytes),
        "rowCount": int(readback.num_rows),
        "columns": list(readback.column_names),
        "featureColumns": ["entropy_norm", "ast_signal", "domain_fit", "authority_norm", "execution_utility"],
        "executionUtilityMaskedCount": sum(1 for m in presence_col if m[4] == 0),
        "readbackVerified": readback.num_rows == len(records) and readback.schema.equals(schema),
        "canonicalAuthority": False,
        "dbWritesPerformed": False,
    }


def main() -> int:
    records = [
        json.loads(line)
        for line in DEFAULT_INPUT.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    receipt = build_feature_matrix_5_arrow_v1(records, DEFAULT_ARROW)
    DEFAULT_RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
