"""Read-only context-length gate for EmbeddingGemma 2 prefill (Parent Atlas).

Measures how many EG2 tokens real canonical chunks need, with the canonical
document recipe applied (`title: {relative_path} | text: {content}`), and
recommends the smallest context bucket that covers the requested percentile.

Read-only: SELECTs from codebase_chunk_index via docker exec psql, tokenizes
locally with the EG2 tokenizer.json. Writes one receipt under .tmp/atlas/.
Does not embed, does not write Postgres/Qdrant/Redis, does not change :8094.
Canonical authority: false.

Pure helpers (selector_sql, decode_rows, build_text, measure) have no I/O and
are covered by python/tests/test_eg2_context_length_gate_v1.py.

Usage (repo root):
  py -3.13 scripts/atlas/eg2-context-length-gate-v1.py [--modulus 250] [--target-percentile 99]
"""
from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import math
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TOKENIZER = REPO / "models" / "embeddinggemma2" / "onnx-q8" / "tokenizer.json"
RECEIPT_DIR = REPO / ".tmp" / "atlas"
BUCKETS = [512, 1024, 2048, 4096, 8192]
CURRENT_CAP = 512  # :8094 GEMMA2_MAX_TOKENS default
RECIPE_REVISION = "eg-doc-title-text-v1"
RECIPE_TEMPLATE = "title: {path} | text: {content}"
# hashtext() returns int4 (-2^31 .. 2^31-1). Shift to non-negative bigint so the
# selector never calls abs() on the minimum int4, which overflows in PostgreSQL.
HASH_SHIFT = 2147483648


def selector_sql(modulus: int) -> str:
    if not isinstance(modulus, int) or modulus < 1:
        raise ValueError("modulus must be a positive integer")
    return f"mod(hashtext(id::text)::bigint + {HASH_SHIFT}, {modulus}) = 0"


def fetch_sql(modulus: int) -> str:
    return (
        "SELECT relative_path || E'\\t' || replace(encode(convert_to(content,'UTF8'),'base64'), E'\\n', '') "
        "FROM codebase_chunk_index "
        "WHERE content IS NOT NULL AND length(content) > 0 "
        f"AND {selector_sql(modulus)} "
        "ORDER BY id"
    )


@dataclass
class DecodeReport:
    rows: list[tuple[str, str]] = field(default_factory=list)
    invalid_records: int = 0
    empty_content: int = 0
    undecodable: int = 0


def decode_rows(raw: str) -> DecodeReport:
    """Parse `path<TAB>base64` records. A record is valid only if it is a single,
    complete line. Any tab-less continuation line marks the preceding record as
    incomplete and rejects it: a wrapped first line is valid base64 and would
    otherwise decode to a silently truncated document."""
    report = DecodeReport()
    records: list[tuple[str, list[str]]] = []  # (first_line, continuation_lines)
    for line in raw.splitlines():
        if not line.strip():
            continue
        if "\t" in line:
            records.append((line, []))
        elif records:
            records[-1][1].append(line)
        else:
            report.invalid_records += 1  # continuation with no record
    for first, continuations in records:
        if continuations:
            report.invalid_records += 1  # incomplete record: never guess the missing bytes
            continue
        path, b64 = first.split("\t", 1)
        b64 = "".join(b64.split())
        try:
            raw_bytes = base64.b64decode(b64, validate=True)
        except (binascii.Error, ValueError):
            report.invalid_records += 1
            continue
        try:
            content = raw_bytes.decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            report.undecodable += 1
            continue
        if not content.strip():
            report.empty_content += 1
            continue
        report.rows.append((path.strip(), content))
    return report


def build_text(path: str, content: str) -> str:
    return RECIPE_TEMPLATE.format(path=path or "none", content=content.strip())


def percentile(sorted_vals: list[int], pct: float) -> int:
    if not sorted_vals:
        return 0
    k = max(0, min(len(sorted_vals) - 1, math.ceil(pct / 100 * len(sorted_vals)) - 1))
    return sorted_vals[k]


def check_tokenizer_no_truncation(tok) -> None:
    # Tokenizer truncation would silently hide over-length text and understate token counts.
    if tok.truncation is not None:
        raise RuntimeError("tokenizer truncation is enabled; token counts would be understated")


def measure(tok, rows: list[tuple[str, str]], target_percentile: float) -> dict:
    check_tokenizer_no_truncation(tok)
    lengths: list[int] = []
    word_counts: list[int] = []
    for path, content in rows:
        lengths.append(len(tok.encode(build_text(path, content)).ids))
        word_counts.append(len(content.split()))
    n = len(lengths)
    srt = sorted(lengths)
    overhead = len(tok.encode(build_text("", "x")).ids) - 1  # tokens added by the recipe, excluding the 1 payload token
    target_need = percentile(srt, target_percentile)
    recommended = next((b for b in BUCKETS if b >= target_need), BUCKETS[-1])
    return {
        "rows": n,
        "tokens": {
            "p50": percentile(srt, 50), "p90": percentile(srt, 90),
            "p95": percentile(srt, 95), "p99": percentile(srt, 99),
            "max": srt[-1] if srt else 0,
        },
        "fractionOver": {str(b): round(sum(1 for x in lengths if x > b) / n, 4) if n else 0.0
                         for b in BUCKETS},
        "tokensPerWord": round(sum(lengths) / max(1, sum(word_counts)), 3),
        "promptOverheadTokens": overhead,
        "targetPercentile": target_percentile,
        "recommendedContextTokens": recommended,
        "verdict": ("CURRENT_CAP_SUFFICIENT" if target_need <= CURRENT_CAP
                    else f"RAISE_CAP_TO_{recommended}_FOR_{int(target_percentile)}P"),
    }


def fetch_raw(modulus: int) -> str:
    proc = subprocess.run(
        ["docker", "exec", "legal-ai-postgres", "psql", "-U", "legal_admin",
         "-d", "legal_ai_db", "-tAc", fetch_sql(modulus)],
        capture_output=True, text=True, timeout=300, check=True,
    )
    return proc.stdout


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--modulus", type=int, default=250)
    ap.add_argument("--target-percentile", type=float, default=99.0)
    args = ap.parse_args()

    from tokenizers import Tokenizer  # local only

    if not TOKENIZER.exists():
        print(f"missing tokenizer: {TOKENIZER}", file=sys.stderr)
        return 2
    tok = Tokenizer.from_file(str(TOKENIZER))
    tok.no_truncation()
    tok.no_padding()

    decoded = decode_rows(fetch_raw(args.modulus))
    stats = measure(tok, decoded.rows, args.target_percentile)
    receipt = {
        "schema": "atlas.eg2-context-length-gate.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "canonicalAuthority": False,
        "writesPerformed": False,
        "tokenizer": {
            "path": str(TOKENIZER.relative_to(REPO)).replace("\\", "/"),
            "sha256": "sha256:" + hashlib.sha256(TOKENIZER.read_bytes()).hexdigest(),
        },
        "recipe": {"revision": RECIPE_REVISION, "template": RECIPE_TEMPLATE},
        "sample": {
            "selector": selector_sql(args.modulus),
            "modulus": args.modulus,
            "cohort": "codebase_chunk_index (code chunks only; not legal or multimodal)",
            "rowsSampled": stats["rows"] + decoded.invalid_records + decoded.empty_content + decoded.undecodable,
            "rowsMeasured": stats["rows"],
            "invalidRecords": decoded.invalid_records,
            "emptyContent": decoded.empty_content,
            "undecodable": decoded.undecodable,
        },
        "tokens": stats["tokens"],
        "fractionOver": stats["fractionOver"],
        "currentCap": CURRENT_CAP,
        "currentCapTruncationRate": stats["fractionOver"].get(str(CURRENT_CAP), 0.0),
        "tokensPerWord": stats["tokensPerWord"],
        "promptOverheadTokens": stats["promptOverheadTokens"],
        "targetPercentile": args.target_percentile,
        "recommendedContextTokens": stats["recommendedContextTokens"],
        "verdict": stats["verdict"],
    }
    body = json.dumps(receipt, indent=2, sort_keys=True)
    receipt["checksum"] = "sha256:" + hashlib.sha256(body.encode()).hexdigest()
    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = RECEIPT_DIR / f"eg2-context-length-gate-v1.{stamp}.json"
    out.write_text(json.dumps(receipt, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({k: receipt[k] for k in ("sample", "tokens", "fractionOver", "verdict")}, indent=2))
    print(f"receipt: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
