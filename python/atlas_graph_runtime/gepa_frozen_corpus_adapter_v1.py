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
from collections.abc import Callable, Mapping
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


def _group_by_candidate_source_overlap_v1(
    records: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Keep any two queries sharing a candidate source in the same split group."""
    parents = list(range(len(records)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left: int, right: int) -> None:
        left_root, right_root = find(left), find(right)
        if left_root != right_root:
            parents[max(left_root, right_root)] = min(left_root, right_root)

    source_owner: dict[str, int] = {}
    for index, record in enumerate(records):
        source_refs = {
            str(candidate.get("sourceRef", "")).strip()
            for candidate in record.get("candidateContext", [])
            if str(candidate.get("sourceRef", "")).strip()
        }
        if not source_refs:
            raise ValueError(f"GEPA_CANDIDATE_SOURCE_MISSING:{record.get('queryId', '')}")
        for source_ref in source_refs:
            if source_ref in source_owner:
                union(index, source_owner[source_ref])
            else:
                source_owner[source_ref] = index

    components: dict[int, list[dict[str, Any]]] = {}
    for index, record in enumerate(records):
        components.setdefault(find(index), []).append(record)

    # The key depends only on sorted query IDs, not input order or DSU roots.
    return {
        "\0".join(sorted(str(record["queryId"]) for record in component)): component
        for component in components.values()
    }


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

    # Group by every source present in candidate context, not only the gold
    # primary source. Otherwise a distractor file can leak across train/held-out.
    groups = _group_by_candidate_source_overlap_v1(verified_records)
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
    expected_corpus_checksum: str,
    program_version: str,
    metric_version: str,
    before_held_out_score: float,
    after_held_out_score: float,
    approval_receipt: Mapping[str, Any] | None = None,
    approval_verifier: Callable[[Mapping[str, Any], Mapping[str, Any]], bool] | None = None,
) -> dict[str, Any]:
    """Check both frozen-split integrity and offline GEPA promotion gate."""
    if frozen_corpus.get("schema") != "atlas.gepa-frozen-corpus.v1":
        raise ValueError("GEPA_CORPUS_SCHEMA_INVALID")
    if frozen_corpus.get("canonicalAuthority") is not False or frozen_corpus.get("writesPerformed") is not False:
        raise ValueError("GEPA_CORPUS_AUTHORITY_INVALID")
    if frozen_corpus.get("hiddenStatePersisted") is not False:
        raise ValueError("GEPA_HIDDEN_STATE_POLICY_INVALID")
    splits = frozen_corpus.get("splits")
    if not isinstance(splits, dict) or set(splits) != {"train", "val", "held_out"}:
        raise ValueError("GEPA_CORPUS_SPLITS_INVALID")
    if not isinstance(expected_corpus_checksum, str) or not expected_corpus_checksum.startswith("sha256:"):
        raise ValueError("GEPA_EXPECTED_CORPUS_CHECKSUM_REQUIRED")
    actual_checksum = _sha256_json(splits)
    if (actual_checksum != expected_corpus_checksum
            or frozen_corpus.get("corpusChecksum") != expected_corpus_checksum):
        raise ValueError("GEPA_CORPUS_CHECKSUM_MISMATCH")

    split_for_source: dict[str, str] = {}
    seen_query_ids: set[str] = set()
    for split_name, records in splits.items():
        if not isinstance(records, list):
            raise ValueError("GEPA_CORPUS_SPLIT_ROWS_INVALID")
        for record in records:
            query_id = str(record.get("queryId", "")).strip()
            if not query_id or query_id in seen_query_ids:
                raise ValueError("GEPA_CORPUS_QUERY_ID_INVALID_OR_DUPLICATE")
            seen_query_ids.add(query_id)
            refs = {
                str(candidate.get("sourceRef", "")).strip()
                for candidate in record.get("candidateContext", [])
                if str(candidate.get("sourceRef", "")).strip()
            }
            if not refs:
                raise ValueError("GEPA_CANDIDATE_SOURCE_MISSING")
            for source_ref in refs:
                previous_split = split_for_source.setdefault(source_ref, split_name)
                if previous_split != split_name:
                    raise ValueError("GEPA_SOURCE_LEAKAGE_DETECTED")

    counts = {name: len(rows) for name, rows in splits.items()}
    if frozen_corpus.get("counts") != counts:
        raise ValueError("GEPA_CORPUS_COUNTS_MISMATCH")
    approval_claim = {
        "datasetChecksum": expected_corpus_checksum,
        "programVersion": program_version,
        "metricVersion": metric_version,
        "beforeHeldOutScore": before_held_out_score,
        "afterHeldOutScore": after_held_out_score,
    }
    approved_by: str | None = None
    if (approval_receipt is not None and approval_verifier is not None
            and approval_receipt.get("schema") == "atlas.gepa-promotion-approval.v1"
            and approval_receipt.get("decision") == "APPROVE"
            and approval_receipt.get("reviewerRef")
            and approval_receipt.get("approvalEvidenceRef")
            and all(approval_receipt.get(key) == value for key, value in approval_claim.items())
            and approval_verifier(approval_receipt, approval_claim) is True):
        approved_by = str(approval_receipt["reviewerRef"])
    return evaluate_gepa_offline_promotion_gate_v1(
        dataset_checksum=str(frozen_corpus["corpusChecksum"]),
        program_version=program_version,
        metric_version=metric_version,
        train_count=counts["train"],
        held_out_count=counts["held_out"],
        before_held_out_score=before_held_out_score,
        after_held_out_score=after_held_out_score,
        approved_by=approved_by,
    )
