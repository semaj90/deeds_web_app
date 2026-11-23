"""Align versioned replay bundles into a frozen, leakage-free DSPy GEPA corpus.

`dspy.GEPA` requires a frozen, SHA-256-checksummed corpus (`train` / `val` /
`held_out`) grouped by `sourceRef` (no cross-split file leakage) where each
example feeds the full bounded inference-time candidate context (`candidateContext`)
and keeps gold `expectedChunkId` / `expectedQuote` strictly as evaluation targets.

Strictly offline & non-canonical (`canonicalAuthority: False`, `writesPerformed: False`).
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

import dspy

from atlas_graph_runtime.doc14_versioned_replay_export_v1 import (
    replay_and_verify_bundle_v1,
)
from atlas_graph_runtime.dspy_predict_ace_recommender_v1 import (
    evaluate_gepa_offline_promotion_gate_v1,
)


def _sha256_json(obj: Any) -> str:
    raw = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def build_frozen_gepa_corpus_from_replays_v1(
    bundles: list[dict[str, Any]],
    *,
    expected_source_revisions: dict[str, str],
    expected_chunk_hashes: dict[str, str],
    source_bytes_by_ref: dict[str, bytes],
    expected_chunk_spans: dict[str, tuple[int, int]],
    train_ratio: float = 0.6,
    val_ratio: float = 0.2,
) -> dict[str, Any]:
    """Verify replay bundles fail-closed and partition by sourceRef group into train/val/held_out."""
    if not bundles:
        raise ValueError("GEPA_CORPUS_EMPTY")
    if train_ratio <= 0 or val_ratio < 0 or (train_ratio + val_ratio) >= 1.0:
        raise ValueError("GEPA_SPLIT_RATIOS_INVALID")

    verified_records: list[dict[str, Any]] = []
    seen_queries: set[str] = set()
    for b in bundles:
        replay_and_verify_bundle_v1(
            b,
            expected_source_revisions=expected_source_revisions,
            expected_chunk_hashes=expected_chunk_hashes,
            source_bytes_by_ref=source_bytes_by_ref,
            expected_chunk_spans=expected_chunk_spans,
            require_reviewed_grades=True,
        )
        qid = str(b["queryId"])
        if qid in seen_queries:
            raise ValueError(f"GEPA_DUPLICATE_QUERY_ID:{qid}")
        seen_queries.add(qid)

        grades_by_chunk = {g["chunkId"]: g for g in b.get("relevanceGrades") or []}
        best = max(
            b["ordinalMap"],
            key=lambda c: (int(grades_by_chunk[c["chunkId"]]["reviewedGrade"]), -int(c["candidateOrdinal"])),
        )
        best_grade = int(grades_by_chunk[best["chunkId"]]["reviewedGrade"])
        best_start, best_end = expected_chunk_spans[best["chunkId"]]
        expected_quote = next((
            quote["quote"] for quote in b["quoteChecks"]
            if quote["sourceRef"] == best["sourceRef"]
            and quote.get("chunkId") in (None, best["chunkId"])
            and best_start <= quote["startByte"] < quote["endByte"] <= best_end
        ), None)
        if best_grade > 0 and expected_quote is None:
            raise ValueError(f"GEPA_EXPECTED_QUOTE_MISSING:{qid}")
        candidate_context = [
            {
                "chunkId": c["chunkId"],
                "sourceRef": c["sourceRef"],
                "sourceRevision": c["sourceRevision"],
                "text": source_bytes_by_ref[c["sourceRef"]][slice(*expected_chunk_spans[c["chunkId"]])].decode("utf-8"),
            }
            for c in sorted(b["ordinalMap"], key=lambda item: int(item["candidateOrdinal"]))
        ]
        verified_records.append(
            {
                "queryId": qid,
                "queryText": b["queryText"],
                "bundleChecksum": b["bundleChecksum"],
                "primarySourceRef": best["sourceRef"],
                "candidateContext": candidate_context,
                "expectedChunkId": best["chunkId"],
                "expectedGrade": best_grade,
                "expectedQuote": expected_quote or "",
            }
        )

    # Group by primarySourceRef so chunks from the same file never leak across splits.
    groups: dict[str, list[dict[str, Any]]] = {}
    for rec in verified_records:
        groups.setdefault(rec["primarySourceRef"], []).append(rec)
    sorted_group_keys = sorted(groups.keys())
    if len(sorted_group_keys) < 2:
        raise ValueError("GEPA_HELD_OUT_SPLIT_EMPTY")

    g_n = len(sorted_group_keys)
    g_train = max(1, int(round(g_n * train_ratio)))
    g_val = max(0, int(round(g_n * val_ratio)))
    if g_train + g_val >= g_n:
        g_train = max(1, g_n - 1)
        g_val = 0

    train_keys = sorted_group_keys[:g_train]
    val_keys = sorted_group_keys[g_train : g_train + g_val]
    held_keys = sorted_group_keys[g_train + g_val :]

    splits = {
        "train": [r for k in train_keys for r in groups[k]],
        "val": [r for k in val_keys for r in groups[k]],
        "held_out": [r for k in held_keys for r in groups[k]],
    }
    if not splits["held_out"]:
        raise ValueError("GEPA_HELD_OUT_SPLIT_EMPTY")

    corpus_checksum = _sha256_json(splits)
    return {
        "schema": "atlas.gepa-frozen-corpus.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "hiddenStatePersisted": False,
        "corpusChecksum": corpus_checksum,
        "counts": {k: len(v) for k, v in splits.items()},
        "splits": splits,
    }


def to_dspy_examples_v1(records: list[dict[str, Any]]) -> list[dspy.Example]:
    """Convert frozen GEPA split records into `dspy.Example` with bounded candidate context."""
    examples: list[dspy.Example] = []
    for r in records:
        ex = dspy.Example(
            task_query=r["queryText"],
            ace_manifest_json=json.dumps(r["candidateContext"], ensure_ascii=False),
            expected_chunk_id=r["expectedChunkId"],
            expected_quote=r["expectedQuote"],
        ).with_inputs("task_query", "ace_manifest_json")
        examples.append(ex)
    return examples


def check_gepa_corpus_and_promotion_ready_v1(
    frozen_corpus: dict[str, Any],
    *,
    program_version: str,
    metric_version: str,
    before_held_out_score: float,
    after_held_out_score: float,
    approved_by: str | None = None,
) -> dict[str, Any]:
    """Check both frozen-split integrity and offline GEPA promotion gate."""
    counts = frozen_corpus.get("counts") or {}
    return evaluate_gepa_offline_promotion_gate_v1(
        dataset_checksum=str(frozen_corpus["corpusChecksum"]),
        program_version=program_version,
        metric_version=metric_version,
        train_count=int(counts.get("train", 0)),
        held_out_count=int(counts.get("held_out", 0)),
        before_held_out_score=before_held_out_score,
        after_held_out_score=after_held_out_score,
        approved_by=approved_by,
    )
