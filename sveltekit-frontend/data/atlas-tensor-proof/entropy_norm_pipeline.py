"""
T2-lineage entropy_norm producer (2026-08-10). Byte-level Engram contract per
design review: source bytes -> 3-byte context -> next byte -> MAP counts ->
REDUCE distribution -> H(context) -> per-packet aggregate -> raw_packet_entropy
-> data-driven normalization -> entropy_norm in [0,1].

Frozen input contract (recorded here, not assumed):
  encoding:            UTF-8 (content column is already decoded text; re-encoded
                        to UTF-8 bytes for the byte-level Engram, replacing any
                        unencodable characters rather than crashing)
  line endings:         raw, as stored (not canonicalized) -- CRLF vs LF differences
                        are treated as real byte-level signal, not noise, since this
                        is a byte-entropy measure, not a text-similarity measure
  generated files:      EXCLUDED (path contains a backup/report-dump directory --
                        found live in the source export: `scripts/api-cleanup/
                        reports/backup-*` -- these are stale duplicate snapshots,
                        not canonical live source, and would skew corpus stats
                        with near-duplicate content)
  vendor deps:          EXCLUDED (node_modules, vendor/, .venv, dist/, build/)
  lock files:           EXCLUDED (package-lock.json, pnpm-lock.yaml, *.min.js)
  binary files:         N/A here -- source is `codebase_chunk_index.content`,
                        already text-extracted at ingest time; nothing in this
                        4,480-row export is a raw binary file
  context width:        3 bytes
  packet attribution:   one row per packet_key (chunks concatenated in
                        line_start order per source_ref, matching the same
                        join used for semantic_768/T2b: atlas_packets.source_ref
                        = codebase_chunk_index.relative_path)
  source_revision:      sha256 of the concatenated per-packet UTF-8 text
                        (already computed in SQL, carried through per row)

Run from sveltekit-frontend/python:
  python ../data/atlas-tensor-proof/entropy_norm_pipeline.py
"""
from __future__ import annotations
import json, math, statistics
from collections import Counter, defaultdict
from pathlib import Path

import sys
sys.path.insert(0, ".")
from parent_atlas_tensor.mapreduce_engram import map_counts, reduce_counts

SOURCE_JSONL = "../data/atlas-tensor-proof/entropy_source_rows.jsonl"
CONTEXT_WIDTH = 3
PRODUCER_REVISION = "mapreduce-engram-byte3-v1"

EXCLUDE_SUBSTRINGS = [
    "node_modules/", ".venv/", "vendor/", "dist/", "build/",
    "package-lock.json", "pnpm-lock.yaml", ".min.js",
    "/reports/backup-",  # stale duplicate snapshot dirs found live in this export
]

def is_eligible(relative_path: str) -> tuple[bool, str | None]:
    for pat in EXCLUDE_SUBSTRINGS:
        if pat in relative_path:
            return False, f"excluded_path:{pat.strip('/')}"
    return True, None

rows = []
excluded = Counter()
with open(SOURCE_JSONL, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        eligible, reason = is_eligible(row["relative_path"])
        row["eligible"] = eligible
        row["coverage_reason"] = reason
        if not eligible:
            excluded[reason] += 1
        rows.append(row)

source_rows = len(rows)
eligible_rows_list = [r for r in rows if r["eligible"]]
eligible_rows = len(eligible_rows_list)
print(f"source_rows={source_rows} eligible_rows={eligible_rows} excluded={dict(excluded)}")

# --- MAP + REDUCE: global byte-trigram -> next-byte counts, across all eligible packets ---
global_counts = Counter()
per_packet_bytes = {}
for row in eligible_rows_list:
    data = row["content"].encode("utf-8", errors="replace")
    per_packet_bytes[row["packet_key"]] = data
    global_counts.update(map_counts(data))

print(f"global distinct (context,next) events: {len(global_counts)}")

# per-context entropy (Laplace-smoothed, alpha=0.1, vocab=256), reusing the same
# math as mapreduce_engram.probabilities_and_entropy but computing H(context)
# once per context (not per (context,next) row) for O(1) per-packet lookup.
by_context: dict[int, Counter[int]] = defaultdict(Counter)
for event, count in global_counts.items():
    context = event >> 8
    nxt = event & 0xFF
    by_context[context][nxt] += count

alpha = 0.1
vocab = 256
context_entropy: dict[int, float] = {}
for context, next_counts in by_context.items():
    denom = sum(next_counts.values()) + alpha * vocab
    h = 0.0
    for nxt, raw_count in next_counts.items():
        p = (raw_count + alpha) / denom
        h -= p * math.log2(p)
    # remaining unseen next-bytes each contribute alpha/denom mass
    seen = len(next_counts)
    unseen = vocab - seen
    if unseen > 0:
        p_unseen = alpha / denom
        h -= unseen * p_unseen * math.log2(p_unseen)
    context_entropy[context] = h

print(f"distinct contexts with entropy computed: {len(context_entropy)}")

# --- per-packet aggregation: mean H(context) over the packet's own trigram positions ---
def packed_context3(a: int, b: int, c: int) -> int:
    return ((a & 0xFF) << 16) | ((b & 0xFF) << 8) | (c & 0xFF)

results = []
for row in rows:
    packet_key = row["packet_key"]
    if not row["eligible"]:
        results.append({
            "packet_key": packet_key,
            "source_revision": row["source_revision"],
            "engram_context_width": CONTEXT_WIDTH,
            "entropy_raw": None,
            "entropy_norm": None,
            "observed_contexts": 0,
            "eligible": False,
            "coverage_reason": row["coverage_reason"],
            "producer_revision": PRODUCER_REVISION,
            "normalization_revision": None,
        })
        continue
    data = per_packet_bytes[packet_key]
    if len(data) <= CONTEXT_WIDTH:
        results.append({
            "packet_key": packet_key,
            "source_revision": row["source_revision"],
            "engram_context_width": CONTEXT_WIDTH,
            "entropy_raw": None,
            "entropy_norm": None,
            "observed_contexts": 0,
            "eligible": False,
            "coverage_reason": "too_short",
            "producer_revision": PRODUCER_REVISION,
            "normalization_revision": None,
        })
        continue
    hs = []
    contexts_seen = set()
    for i in range(CONTEXT_WIDTH, len(data)):
        ctx = packed_context3(data[i - 3], data[i - 2], data[i - 1])
        contexts_seen.add(ctx)
        hs.append(context_entropy.get(ctx, math.log2(vocab)))  # unseen context -> max-entropy fallback (never happens here since context comes from this same corpus, but kept for safety)
    raw_entropy = statistics.mean(hs)
    results.append({
        "packet_key": packet_key,
        "source_revision": row["source_revision"],
        "engram_context_width": CONTEXT_WIDTH,
        "entropy_raw": raw_entropy,
        "entropy_norm": None,  # filled in after distribution is known
        "observed_contexts": len(contexts_seen),
        "eligible": True,
        "coverage_reason": None,
        "producer_revision": PRODUCER_REVISION,
        "normalization_revision": None,
    })

raw_values = [r["entropy_raw"] for r in results if r["entropy_raw"] is not None]
produced_rows = len(raw_values)

def pct(p):
    return statistics.quantiles(raw_values, n=100, method="inclusive")[p - 1] if 1 <= p <= 99 else None

dist = {
    "min": min(raw_values), "max": max(raw_values),
    "p05": pct(5), "p25": pct(25), "median": statistics.median(raw_values),
    "p75": pct(75), "p95": pct(95), "p99": pct(99),
    "mean": statistics.mean(raw_values), "stdev": statistics.stdev(raw_values),
}
print("raw_packet_entropy distribution:", json.dumps({k: round(v, 4) for k, v in dist.items()}, indent=2))

# --- data-driven normalization: robust z-score (median/MAD) -> tanh -> squash to [0,1] ---
median = dist["median"]
abs_dev = [abs(v - median) for v in raw_values]
mad = statistics.median(abs_dev)
mad_scaled = mad * 1.4826 if mad > 0 else dist["stdev"]  # fallback if MAD degenerates to 0
NORMALIZATION_REVISION = "robust-mad-tanh-v1"

def normalize(raw: float) -> float:
    z = (raw - median) / mad_scaled if mad_scaled > 0 else 0.0
    return (math.tanh(z) + 1.0) / 2.0

for r in results:
    if r["entropy_raw"] is not None:
        r["entropy_norm"] = normalize(r["entropy_raw"])
        r["normalization_revision"] = NORMALIZATION_REVISION

norm_values = [r["entropy_norm"] for r in results if r["entropy_norm"] is not None]
print(f"normalization: median={median:.4f} MAD={mad:.4f} MAD_scaled={mad_scaled:.4f}")
print(f"entropy_norm distribution: min={min(norm_values):.4f} median={statistics.median(norm_values):.4f} max={max(norm_values):.4f}")

coverage = {
    "sourceRows": source_rows,
    "eligibleRows": eligible_rows,
    "producedRows": produced_rows,
    "coverageRatio": round(produced_rows / source_rows, 4),
    "missingPolicy": "MISSING",
    "producerRevision": PRODUCER_REVISION,
    "normalizationRevision": NORMALIZATION_REVISION,
    "excludedByReason": dict(excluded),
}
print("FeatureCoverage:", json.dumps(coverage, indent=2))

out_path = Path("../data/atlas-tensor-proof/entropy_norm_r1.jsonl")
with out_path.open("w", encoding="utf-8") as f:
    for r in results:
        f.write(json.dumps(r) + "\n")
manifest_path = Path("../data/atlas-tensor-proof/entropy_norm_coverage_r1.json")
manifest_path.write_text(json.dumps({"distribution": dist, "coverage": coverage}, indent=2))
print(f"persisted: {out_path} ({len(results)} rows), {manifest_path}")
