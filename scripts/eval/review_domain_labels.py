#!/usr/bin/env python3
"""Fast terminal reviewer for domain gold labels (append-only, resume-safe)."""
from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
from pathlib import Path

CLASSES = [
    "retrieval_search",
    "graph_ontology",
    "ui_frontend",
    "storage_schema",
    "ml_inference",
    "legal_regulatory",
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Review domain classification queue")
    parser.add_argument("--queue", type=Path, default=Path(".tmp/review/domain-label-queue-20261128-current-v2.jsonl"))
    parser.add_argument("--show-proposal", action="store_true",
                        help="Show the suggested class before you choose (biases labels; recorded on each row)")
    parser.add_argument("--out", type=Path, default=Path("data/eval/domain_gold_labels_v1.jsonl"))
    parser.add_argument("--reviewer", type=str, default=os.environ.get("USERNAME", "james"))
    args = parser.parse_args()
    # Previews can hold characters a legacy Windows code page cannot print; never crash mid-review.
    sys.stdout.reconfigure(errors="replace")

    if not args.queue.exists():
        raise FileNotFoundError(f"Queue file not found: {args.queue}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    done: set[str] = set()
    if args.out.exists():
        for line in args.out.read_text(encoding="utf-8").splitlines():
            if line.strip():
                done.add(json.loads(line)["chunk_id"])

    with args.queue.open("r", encoding="utf-8") as f_in, args.out.open("a", encoding="utf-8") as f_out:
        for line in f_in:
            if not line.strip():
                continue
            row = json.loads(line)
            if row["chunk_id"] in done:
                continue
            print("\n" + "=" * 72)
            suggestion = f"  |  PROPOSED (advisory): {row.get('proposed_label', '-')}" if args.show_proposal else ""
            print(f"FILE: {row['source_ref']}{suggestion}")
            print("-" * 72)
            print(row.get("text_preview", ""))
            print("-" * 72)
            for idx, cls_name in enumerate(CLASSES, 1):
                print(f"[{idx}] {cls_name}", end="  ")
            while True:  # ask again on a typo; never move past a row without an answer
                try:
                    choice = input("\nSelect [1-6], [s]kip, [a]mbiguous, [q]uit: ").strip().lower()
                except (EOFError, KeyboardInterrupt):
                    choice = "q"
                if choice in {"q", "s", "a"} or choice in {str(i) for i in range(1, len(CLASSES) + 1)}:
                    break
                print(f"Not a choice: {choice!r}")
            if choice == "q":
                break
            if choice in {"s", "a"}:
                status = "skip" if choice == "s" else "ambiguous"
                label = None
            else:
                status = "reviewed"
                label = CLASSES[int(choice) - 1]

            record = {
                "chunk_id": row["chunk_id"],
                "source_ref": row["source_ref"],
                "sha256": row["sha256"],
                "proposed_label": row.get("proposed_label"),
                "proposal_shown": args.show_proposal,
                "blind_review": not args.show_proposal,
                "gold_label": label,
                "status": status,
                "reviewer": args.reviewer,
                "reviewed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "notes": "",
            }
            f_out.write(json.dumps(record, ensure_ascii=False) + "\n")
            f_out.flush()
            done.add(row["chunk_id"])

    print(f"Saved reviewed entries to {args.out} (total processed={len(done)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
