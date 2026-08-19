#!/usr/bin/env python3
"""Offline Parent Atlas DSPy GEPA runner.

Reads immutable JSONL trajectory rows derived from ExecutionReceipt evidence,
compiles the existing RouteDecision program with dspy.GEPA, saves the optimized
program, and writes an audit receipt. This script never imports production tool
executors and never mutates Parent Atlas routing state.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dspy_policy_program import build_dspy_examples, compile_parent_atlas_gepa


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fh:
        for line_no, raw in enumerate(fh, start=1):
            line = raw.strip()
            if not line:
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"{path}:{line_no}: expected JSON object")
            rows.append(value)
    if not rows:
        raise ValueError(f"{path}: dataset is empty")
    return rows


def lm_identity(model: str) -> str:
    return hashlib.sha256(model.encode("utf-8")).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", type=Path, required=True)
    ap.add_argument("--val", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--receipt", type=Path, required=True)
    ap.add_argument("--student-model", required=True, help="DSPy/LiteLLM model name used by the program")
    ap.add_argument("--reflection-model", required=True, help="DSPy/LiteLLM model name used for GEPA reflection")
    ap.add_argument("--auto", choices=["light", "medium", "heavy"], default="light")
    ap.add_argument("--threads", type=int, default=1)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--log-dir", type=Path)
    args = ap.parse_args()

    import dspy

    train_rows = read_jsonl(args.train)
    val_rows = read_jsonl(args.val)
    train = build_dspy_examples(train_rows)
    val = build_dspy_examples(val_rows)

    student_lm = dspy.LM(args.student_model)
    reflection_lm = dspy.LM(args.reflection_model)

    # GEPA uses the LM configured for normal program execution as the task model.
    with dspy.context(lm=student_lm):
        optimized = compile_parent_atlas_gepa(
            trainset=train,
            valset=val,
            reflection_lm=reflection_lm,
            auto=args.auto,
            num_threads=max(1, args.threads),
            log_dir=str(args.log_dir) if args.log_dir else None,
            seed=args.seed,
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    optimized.save(str(args.output))

    detailed = getattr(optimized, "detailed_results", None)
    receipt = {
        "schema": "atlas.gepa-optimization-receipt.v1",
        "status": "SHADOW_ONLY",
        "optimizer": "dspy.GEPA",
        "gepaImplementation": "gepa-ai/gepa via DSPy",
        "trainDataset": {
            "path": str(args.train),
            "sha256": sha256_file(args.train),
            "examples": len(train),
        },
        "valDataset": {
            "path": str(args.val),
            "sha256": sha256_file(args.val),
            "examples": len(val),
        },
        "studentModel": {
            "id": args.student_model,
            "identityHash": lm_identity(args.student_model),
        },
        "reflectionModel": {
            "id": args.reflection_model,
            "identityHash": lm_identity(args.reflection_model),
        },
        "budget": {"mode": "auto", "value": args.auto},
        "numThreads": max(1, args.threads),
        "seed": args.seed,
        "optimizedProgramPath": str(args.output),
        "optimizedProgramSha256": sha256_file(args.output),
        "detailedResultsAvailable": detailed is not None,
        "promotionAllowed": False,
        "nextGate": "held-out Parent Atlas evaluation and explicit promotion receipt",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
