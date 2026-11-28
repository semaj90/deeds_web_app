#!/usr/bin/env python3
"""Refresh the domain review queue (read-only on PostgreSQL; never overwrites a queue).

Keeps a row only if the full chunk is still in the file at its indexed path (CRLF normalised, no path
fallback), then tops up named classes with current chunks from files not already queued.
`proposed_label` stays PROPOSAL_ONLY and only steers sampling. Run from the repository root.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from export_domain_label_queue_v1 import load_database_url, propose_domain_label

ROOT = Path.cwd().resolve()
KEY = "COALESCE(NULLIF(c.chunk_id, ''), c.id::text)"
COLUMNS = f"""{KEY} AS chunk_id, COALESCE(NULLIF(c.source_ref, ''), c.relative_path) AS source_ref,
    c.relative_path, COALESCE(NULLIF(c.content_hash, ''), encode(sha256(convert_to(c.content, 'UTF8')), 'hex')),
    COALESCE(NULLIF(c.domain_id, ''), c.domain), c.content"""
TOP_UP_PATTERNS = {
    "ml_inference": "(onnx|tensorrt|trt|cuda|gpu|mlp|kmeans|embed|llama|torch|model)",
    "storage_schema": "(drizzle|schema|postgres|pgvector|migration|redis|valkey|cache|db/)",
    "graph_ontology": "(graph|neo4j|gds|ontology|okf|topology|pagerank|leiden|louvain)",
    "legal_regulatory": "(legal|statute|case|evidence|court|citation|compliance|contract)",
}
_files: dict[str, str | None] = {}


def is_current(relative_path: str, content: str) -> bool:
    if relative_path not in _files:
        path = (ROOT / relative_path).resolve()
        try:
            _files[relative_path] = (
                path.read_text(encoding="utf-8").replace("\r\n", "\n") if path.is_relative_to(ROOT) else None
            )
        except (OSError, UnicodeDecodeError):
            _files[relative_path] = None
    text, needle = _files[relative_path], content.replace("\r\n", "\n").strip()
    return bool(needle) and text is not None and needle in text


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", type=Path, default=Path(".tmp/review/domain-label-queue-20261128.jsonl"))
    parser.add_argument("--out", type=Path, default=Path(".tmp/review/domain-label-queue-20261128-current-v2.jsonl"))
    parser.add_argument("--target-proposed", type=int, default=60, help="Suggested rows wanted per topped-up class")
    args = parser.parse_args()
    if args.out.exists():
        raise SystemExit(f"REFUSING_TO_OVERWRITE_QUEUE: {args.out}")

    import psycopg

    old = [json.loads(line) for line in args.queue.read_text(encoding="utf-8").splitlines() if line.strip()]
    kept, dropped = [], []
    db_url = load_database_url(Path("sveltekit-frontend/.env"))
    with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT {COLUMNS} FROM codebase_chunk_index c WHERE {KEY} = ANY(%s)",
                        ([row["chunk_id"] for row in old],))
            live: dict[tuple[str, str], list[tuple[str, str]]] = {}
            for chunk_id, _ref, relative_path, digest, _hint, content in cur.fetchall():
                live.setdefault((chunk_id, digest), []).append((relative_path, content))
        for row in old:
            matches = live.get((row["chunk_id"], row["sha256"]), [])
            if len(matches) == 1 and is_current(*matches[0]):
                kept.append(row)
            else:
                reason = "NOT_ONE_DB_ROW" if len(matches) != 1 else "CHUNK_NOT_IN_FILE_AT_INDEXED_PATH"
                dropped.append({"chunk_id": row["chunk_id"], "source_ref": row["source_ref"], "reason": reason})

        counts = Counter(row["proposed_label"] for row in kept)
        files = {row["source_ref"] for row in kept}
        ids = {row["chunk_id"] for row in old}
        added: Counter[str] = Counter()
        for label, pattern in TOP_UP_PATTERNS.items():
            with conn.cursor(name=f"topup_{label}") as cur:
                cur.itersize = 500
                cur.execute(
                    f"""SELECT {COLUMNS} FROM codebase_chunk_index c
                         WHERE c.content_embedding_768 IS NOT NULL AND LENGTH(c.content) >= 120
                           AND COALESCE(NULLIF(c.source_ref, ''), c.relative_path) ~* %s
                         ORDER BY md5(c.id::text)""",
                    (pattern,),
                )
                for chunk_id, source_ref, relative_path, digest, hint, content in cur:
                    if counts[label] >= args.target_proposed:
                        break
                    if chunk_id in ids or source_ref in files or not is_current(relative_path, content):
                        continue
                    preview = content[:600]
                    if propose_domain_label(source_ref, hint, preview) != label:
                        continue
                    kept.append({
                        "chunk_id": chunk_id, "source_ref": source_ref, "sha256": digest,
                        "proposed_label": label, "proposal_authority": "PROPOSAL_ONLY",
                        "gold_label": None, "status": "pending_review", "text_preview": preview,
                    })
                    ids.add(chunk_id)
                    files.add(source_ref)
                    counts[label] += 1
                    added[label] += 1

    # Mix top-ups through the queue so position does not reveal the suggested class.
    kept.sort(key=lambda row: hashlib.sha256(row["chunk_id"].encode("utf-8")).hexdigest())
    body = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in kept)
    with args.out.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(body)
    summary = {
        "schema": "atlas.domain-label-queue-refresh.v2", "canonical_authority": False,
        "database_writes_performed": False, "input_queue": str(args.queue),
        "input_sha256": hashlib.sha256(args.queue.read_bytes()).hexdigest(),
        "input_rows": len(old), "dropped": len(dropped),
        "dropped_reasons": dict(Counter(d["reason"] for d in dropped)),
        "added": dict(added), "output_rows": len(kept),
        "unique_source_refs": len({row["source_ref"] for row in kept}),
        "proposed_distribution": dict(sorted(counts.items())),
        "out_path": str(args.out), "out_sha256": hashlib.sha256(args.out.read_bytes()).hexdigest(),
    }
    args.out.with_suffix(".receipt.json").write_text(
        json.dumps({**summary, "dropped_rows": dropped}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
