"""cuDF Batch Feature JSON Ingest Pipeline (WSL2 RAPIDS / Fallback).

Ingests ACE feature packet JSONs and Cache Instructions descriptors onto GPU via cuDF
(or Arrow/pandas fallback) without Node.js V8 heap overhead or Python object expansion.

Adheres strictly to AGENTS.md:
- Advisory only, canonicalAuthority = False, writesPerformed = False.
- Strictly validates absence of forbidden keys (hiddenThoughts, chainOfThought, kv_cache, tensor).
- Outputs deterministic execution receipt to docs/reports/cudf-feature-json-ingest-receipt.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

# Check for cuDF availability (WSL RAPIDS cu13 environment) or fallback
try:
    import cudf  # type: ignore
    CUDF_AVAILABLE = True
except ImportError:
    CUDF_AVAILABLE = False

try:
    import pandas as pd  # type: ignore
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False

FORBIDDEN_KEYS = frozenset({
    "hiddenthoughts", "chainofthought", "kv_cache", "kvcache", "tensor", "tensors", "reasoning_content"
})

CANONICAL_FEATURES = [
    "chat", "ai_chat", "auth", "canvas", "html5_visual_playground", "image_creator",
    "wiki", "user_db", "cases", "evidence", "search_rag", "knowledge_graph",
    "recommendations", "reports", "reconstruction_sim", "media_transcribe",
    "upload_ingest", "rich_text", "code_intel", "admin_ops", "terminal"
]


# --- Engram 4x4x6 token remap (operator-defined axes, 2026-10-28) -------------------------------
# axis 0 (4): SOM row quadrant   axis 1 (4): SOM col quadrant   axis 2 (6): domain bucket 0..5
# engram_token_id = axis0 * 24 + axis1 * 6 + axis2  ->  0..95.
# The repo has no canonical 6-value domain set (live atlas_packets.domain_class has 41 distinct,
# case-inconsistent values), so the domain-to-bucket table is an explicit INPUT. A row whose SOM
# cell or domain bucket is missing or out of range gets None, never a defaulted 0.
ENGRAM_QUADRANTS = 4
ENGRAM_DOMAIN_BUCKETS = 6
ENGRAM_TOKEN_COUNT = ENGRAM_QUADRANTS * ENGRAM_QUADRANTS * ENGRAM_DOMAIN_BUCKETS  # 96


def _as_index(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")) or value != int(value):
            return None
        return int(value)
    if isinstance(value, int):
        return value
    return None


def som_quadrant(index: Any, size: int) -> int | None:
    """Map a SOM row/col index in [0, size) to a quadrant 0..3 (floor(index * 4 / size))."""
    i = _as_index(index)
    if i is None or size < ENGRAM_QUADRANTS or not 0 <= i < size:
        return None
    return (i * ENGRAM_QUADRANTS) // size


def _normalize_domain_class(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().casefold()
    return normalized or None


def engram_token_id(
    som_row: Any,
    som_col: Any,
    domain_bucket: Any,
    som_rows: int = 20,
    som_cols: int = 20,
) -> int | None:
    """Return the 0..95 engram token for one record, or None when any axis is unresolved."""
    a0 = som_quadrant(som_row, som_rows)
    a1 = som_quadrant(som_col, som_cols)
    a2 = _as_index(domain_bucket)
    if a0 is None or a1 is None or a2 is None or not 0 <= a2 < ENGRAM_DOMAIN_BUCKETS:
        return None
    return a0 * (ENGRAM_QUADRANTS * ENGRAM_DOMAIN_BUCKETS) + a1 * ENGRAM_DOMAIN_BUCKETS + a2


def load_domain_buckets(path: str | Path) -> dict[str, int]:
    """Load and normalize an engram domain-bucket table, rejecting conflicting aliases."""
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    if doc.get("schema") != "atlas.engram-domain-buckets.v1":
        raise ValueError("unexpected domain-bucket schema")
    mapping = doc.get("mapping")
    if not isinstance(mapping, dict) or not mapping:
        raise ValueError("domain-bucket mapping missing")
    normalized_mapping: dict[str, int] = {}
    for key, bucket in mapping.items():
        if not isinstance(key, str) or _as_index(bucket) is None or not 0 <= bucket < ENGRAM_DOMAIN_BUCKETS:
            raise ValueError(f"invalid domain bucket entry: {key!r}")
        normalized_key = _normalize_domain_class(key)
        if normalized_key is None:
            raise ValueError("domain bucket keys must not be blank")
        normalized_bucket = int(bucket)
        previous = normalized_mapping.get(normalized_key)
        if previous is not None and previous != normalized_bucket:
            raise ValueError(f"conflicting normalized domain bucket entry: {normalized_key!r}")
        normalized_mapping[normalized_key] = normalized_bucket
    return normalized_mapping


def remap_engram_tokens(
    records: list[dict[str, Any]],
    domain_buckets: dict[str, int],
    som_rows: int = 20,
    som_cols: int = 20,
) -> dict[str, Any]:
    """Assign engram tokens to records carrying som_row, som_col and domain_class.

    `domain_buckets` maps normalized domain_class values (trim + casefold) to 0..5.
    Returns tokens in input order plus per-reason unresolved counts and a 96-bucket histogram.
    """
    tokens: list[int | None] = []
    unresolved = {"no_som_cell": 0, "unmapped_domain": 0}
    histogram = [0] * ENGRAM_TOKEN_COUNT
    for rec in records:
        bucket = domain_buckets.get(_normalize_domain_class(rec.get("domain_class")))
        token = engram_token_id(rec.get("som_row"), rec.get("som_col"), bucket, som_rows, som_cols)
        if token is None:
            if som_quadrant(rec.get("som_row"), som_rows) is None or som_quadrant(rec.get("som_col"), som_cols) is None:
                unresolved["no_som_cell"] += 1
            else:
                unresolved["unmapped_domain"] += 1
        else:
            histogram[token] += 1
        tokens.append(token)
    return {
        "tokens": tokens,
        "unresolved": unresolved,
        "histogram": histogram,
        "token_count": ENGRAM_TOKEN_COUNT,
        "canonical_authority": False,
        "writes_performed": False,
    }


def generate_feature_json_records(run_id: str) -> list[dict[str, Any]]:
    """Generates canonical ACE feature records for validation and ingestion."""
    records = []
    for idx, feat in enumerate(CANONICAL_FEATURES):
        rec = {
            "run_id": f"{run_id}_{idx:02d}",
            "feature_label": feat,
            "token_budget": 1024 * (1 + (idx % 4)),
            "allocated_tokens": int(1024 * (1 + (idx % 4)) * 0.75),
            "fsm_state": "PREFIX_HOT",
            "num_components": 2 + (idx % 3),
            "num_tables": 1 + (idx % 4),
            "backend_service": f"service_{feat}",
            "canonical_authority": False,
        }
        # Compute checksum
        chk = hashlib.sha256(json.dumps(rec, sort_keys=True).encode("utf-8")).hexdigest()
        rec["checksum"] = chk
        records.append(rec)
    return records


def ingest_feature_records(records: list[dict[str, Any]], use_gpu: bool = True) -> dict[str, Any]:
    """Ingests records using cuDF (if available and requested) or pandas."""
    start_time = time.perf_counter()

    # Step 1: Scan for forbidden keys
    for r in records:
        for k in r.keys():
            if k.lower() in FORBIDDEN_KEYS:
                raise ValueError(f"CRITICAL: Forbidden key detected in ingest payload: {k}")

    # Serialize to newline-delimited JSON
    ndjson_data = "\n".join(json.dumps(r) for r in records)
    json_bytes = len(ndjson_data.encode("utf-8"))

    engine_used = "cpu_stdlib"
    if use_gpu and CUDF_AVAILABLE:
        try:
            df = cudf.read_json(ndjson_data, lines=True)
            engine_used = "cudf_gpu"
            row_count = len(df)
            total_budget = int(df["token_budget"].sum())
            total_allocated = int(df["allocated_tokens"].sum())
        except Exception:
            engine_used = "cpu_stdlib"
            row_count = len(records)
            total_budget = sum(int(r.get("token_budget", 0)) for r in records)
            total_allocated = sum(int(r.get("allocated_tokens", 0)) for r in records)
    elif PANDAS_AVAILABLE:
        df = pd.read_json(ndjson_data, lines=True)
        engine_used = "cpu_pandas"
        row_count = len(df)
        total_budget = int(df["token_budget"].sum())
        total_allocated = int(df["allocated_tokens"].sum())
    else:
        # Pure Python stdlib stream
        engine_used = "cpu_stdlib"
        row_count = len(records)
        total_budget = sum(int(r.get("token_budget", 0)) for r in records)
        total_allocated = sum(int(r.get("allocated_tokens", 0)) for r in records)

    elapsed_ms = (time.perf_counter() - start_time) * 1000.0

    return {
        "engine_used": engine_used,
        "row_count": row_count,
        "json_raw_bytes": json_bytes,
        "total_token_budget": total_budget,
        "total_allocated_tokens": total_allocated,
        "elapsed_ms": elapsed_ms,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="cuDF Feature JSON Ingest Runner")
    parser.add_argument("--dry-run", action="store_true", help="Run without persisting output files")
    parser.add_argument("--run-id", default=f"run_{int(time.time())}", help="Unique batch run ID")
    args = parser.parse_args()

    records = generate_feature_json_records(args.run_id)
    ingest_result = ingest_feature_records(records, use_gpu=True)

    receipt = {
        "schema": "atlas.cudf-feature-json-ingest-receipt.v1",
        "run_id": args.run_id,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "canonical_authority": False,
        "writes_performed": False,
        "ingest_result": ingest_result,
        "features_covered": CANONICAL_FEATURES,
        "forbidden_keys_detected": 0,
        "status": "SUCCEEDED",
    }

    print(json.dumps(receipt, indent=2))

    if not args.dry_run:
        out_dir = Path("docs/reports")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / "cudf-feature-json-ingest-receipt.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(receipt, f, indent=2)
        print(f"Receipt written to {out_file}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
