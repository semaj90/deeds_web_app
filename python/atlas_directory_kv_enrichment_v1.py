"""Directory key/value metadata enrichment (read-only, deterministic, no ML, no datastore writes).

Input : the file-inventory Parquet (source_ref, extension, byte_length, source_digest), e.g. the dataset in the dev lake.
Output: (1) long key/value Parquet (one row per directory x key) for Polars/DuckDB joins,
        (2) wide numeric Parquet (int64/float32 only, no nulls, sorted) for cuDF/cuML/cuVS,
        (3) JSONL "enrichment hints": descriptors keyed by directory_path, status HINT, packet_identity null.
These are NOT ACE packets. atlas.ace-packet.v3 (packages/parent-atlas/src/core/ace-packet-v3.ts) requires a canonical packet_key from
PostgreSQL, and no packet is minted here. A later, authorized composer may attach these values as HINT sections of a real packet.
Every row carries an evidence digest over the sorted member digests, so a changed file changes the directory's digest.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import PurePosixPath

import polars as pl

SCHEMA = "atlas.kv-enrichment.v1"
STATUS = "HINT"


def directory_of(source_ref: str) -> str:
    parent = str(PurePosixPath(source_ref).parent)
    return "" if parent == "." else parent


def build(inventory: pl.DataFrame) -> tuple[pl.DataFrame, pl.DataFrame, list[dict]]:
    df = inventory.with_columns(
        pl.col("source_ref").map_elements(directory_of, return_dtype=pl.Utf8).alias("directory_path"),
    ).with_columns(pl.col("source_digest").is_duplicated().alias("is_duplicate_content"))
    grouped = df.group_by("directory_path").agg(
        pl.len().cast(pl.Int64).alias("file_count"),
        pl.col("byte_length").sum().cast(pl.Int64).alias("byte_total"),
        (pl.col("extension") == ".svelte").sum().cast(pl.Int64).alias("svelte_count"),
        (pl.col("extension") == ".ts").sum().cast(pl.Int64).alias("ts_count"),
        (pl.col("extension") == ".md").sum().cast(pl.Int64).alias("md_count"),
        (pl.col("extension") == ".bak").sum().cast(pl.Int64).alias("bak_count"),
        pl.col("is_duplicate_content").sum().cast(pl.Int64).alias("duplicate_content_files"),
        pl.col("extension").mode().sort().first().alias("top_extension"),
        pl.col("source_digest").sort().str.join("|").alias("_members"),
    ).sort("directory_path")
    grouped = grouped.with_columns(
        pl.col("directory_path").map_elements(lambda d: 0 if d == "" else d.count("/") + 1, return_dtype=pl.Int64).alias("depth"),
        pl.col("_members").map_elements(lambda s: "sha256:" + hashlib.sha256(s.encode("utf-8")).hexdigest(), return_dtype=pl.Utf8).alias("evidence_digest"),
        (pl.col("byte_total") / pl.col("file_count")).cast(pl.Float32).alias("mean_file_bytes"),
        (pl.col("svelte_count") / pl.col("file_count")).cast(pl.Float32).alias("svelte_fraction"),
    ).drop("_members")

    numeric = ["file_count", "byte_total", "svelte_count", "ts_count", "md_count", "bak_count", "duplicate_content_files", "depth", "mean_file_bytes", "svelte_fraction"]
    long_rows = []
    for row in grouped.iter_rows(named=True):
        for key in numeric:
            v = row[key]
            long_rows.append((row["directory_path"], key, None, float(v), "number", row["evidence_digest"]))
        long_rows.append((row["directory_path"], "top_extension", row["top_extension"], None, "string", row["evidence_digest"]))
    kv = pl.DataFrame(long_rows, schema=["subject_id", "key", "value_str", "value_num", "value_type", "evidence_digest"], orient="row").with_columns(
        pl.lit("directory").alias("subject_kind"), pl.lit("filesystem-inventory").alias("source"), pl.lit(SCHEMA).alias("schema"), pl.lit(STATUS).alias("status"),
        pl.col("value_num").cast(pl.Float64),
    ).select("schema", "subject_kind", "subject_id", "key", "value_str", "value_num", "value_type", "source", "status", "evidence_digest").sort("subject_id", "key")

    wide = grouped.select(["directory_path", *numeric, "evidence_digest"]).with_columns(
        [pl.col(c).cast(pl.Int64) for c in numeric if c not in ("mean_file_bytes", "svelte_fraction")]
    )
    hints = [
        {"schema": "atlas.directory-enrichment-hint.v1", "directory_path": r["directory_path"], "status": STATUS, "packet_identity": None,
         "kv": {k: r[k] for k in [*numeric, "top_extension"]}, "evidence_digest": r["evidence_digest"], "canonicalAuthority": False, "writesPerformed": False}
        for r in grouped.iter_rows(named=True)
    ]
    return kv, wide, hints


def main(argv: list[str]) -> int:
    if len(argv) != 5:
        print("usage: atlas_directory_kv_enrichment_v1.py <inventory.parquet> <out_kv.parquet> <out_wide.parquet> <out_hints.jsonl>", file=sys.stderr)
        return 2
    kv, wide, hints = build(pl.read_parquet(argv[1]))
    kv.write_parquet(argv[2], compression="zstd")
    wide.write_parquet(argv[3], compression="zstd")
    with open(argv[4], "w", encoding="utf-8", newline="\n") as handle:
        for hint in hints:
            handle.write(json.dumps(hint, sort_keys=True, ensure_ascii=False) + "\n")
    print(json.dumps({"directories": wide.height, "kv_rows": kv.height, "wide_columns": wide.width}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
