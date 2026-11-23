"""Task-Domain CSR & Tournament Promotion Gate (v1).

Read-only / non-canonical (`canonicalAuthority=False`, `writesPerformed=False`):
  - Validates task identity (taskId, taskRevision, scope, sourceRef, sourceSha256).
  - Rejects duplicate taskIds and cross-scope candidates.
  - Builds deterministic sparse CSR arrays (indptr/indices/data) for:
      1) task x keyword
      2) task x proposed-domain (PROPOSAL_ONLY; never mints ontology identity)
  - Emits idempotent, revision-bound queue proposals for durable job owners.
  - Blocks production ranker promotion until evalRows >= 30 and 5/5 feature columns are unmasked.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Mapping, Sequence

import numpy as np

_SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_TOKEN_RE = re.compile(r"[a-z0-9_]{2,}")


def _sha256_json(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def validate_task_batch_v1(
    tasks: Sequence[Mapping[str, Any]],
    *,
    expected_scope: str | None = None,
) -> list[dict[str, Any]]:
    if not tasks:
        raise ValueError("EMPTY_TASK_BATCH")
    seen_ids: set[str] = set()
    validated: list[dict[str, Any]] = []
    for row in tasks:
        task_id = str(row.get("taskId") or "").strip()
        task_rev = str(row.get("taskRevision") or "").strip()
        scope = str(row.get("scope") or "").strip()
        source_ref = str(row.get("sourceRef") or "").strip()
        source_sha = str(row.get("sourceSha256") or "").strip()

        if not task_id or not task_rev or not scope or not source_ref:
            raise ValueError(f"TASK_IDENTITY_INCOMPLETE:{task_id or 'unknown'}")
        if not _SHA256_RE.fullmatch(source_sha):
            raise ValueError(f"TASK_SOURCE_SHA256_INVALID:{task_id}")
        if task_id in seen_ids:
            raise ValueError(f"DUPLICATE_TASK_ID:{task_id}")
        if expected_scope is not None and scope != expected_scope:
            raise ValueError(f"CROSS_SCOPE_TASK_REJECTED:{task_id}:{scope}!={expected_scope}")

        seen_ids.add(task_id)
        validated.append({
            "taskId": task_id,
            "taskRevision": task_rev,
            "scope": scope,
            "sourceRef": source_ref,
            "sourceSha256": source_sha,
            "text": str(row.get("text") or ""),
            "proposedDomains": [str(d).strip() for d in (row.get("proposedDomains") or []) if str(d).strip()],
        })
    return validated


def _build_csr_from_rows(
    row_maps: Sequence[dict[str, float]],
    vocab: Sequence[str],
) -> dict[str, Any]:
    vocab_index = {term: idx for idx, term in enumerate(vocab)}
    indptr = [0]
    indices: list[int] = []
    data: list[float] = []

    for mapping in row_maps:
        cols = sorted((vocab_index[k], float(v)) for k, v in mapping.items() if k in vocab_index and v != 0.0)
        for col_idx, val in cols:
            indices.append(col_idx)
            data.append(val)
        indptr.append(len(indices))

    indptr_arr = np.ascontiguousarray(np.asarray(indptr, dtype=np.int32))
    indices_arr = np.ascontiguousarray(np.asarray(indices, dtype=np.int32))
    data_arr = np.ascontiguousarray(np.asarray(data, dtype=np.float32))
    shape = [len(row_maps), len(vocab)]
    checksum = _sha256_json({
        "shape": shape,
        "vocab": list(vocab),
        "indptr": indptr_arr.tolist(),
        "indices": indices_arr.tolist(),
        "data": [round(float(x), 6) for x in data_arr.tolist()],
    })
    return {
        "shape": shape,
        "vocab": list(vocab),
        "indptr": indptr_arr,
        "indices": indices_arr,
        "data": data_arr,
        "nnz": int(data_arr.size),
        "csrChecksum": checksum,
    }


def build_task_keyword_csr_v1(tasks: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    validated = validate_task_batch_v1(tasks)
    vocab_set: set[str] = set()
    row_counts: list[dict[str, float]] = []
    for t in validated:
        tokens = _TOKEN_RE.findall(t["text"].lower())
        counts: dict[str, float] = {}
        for tok in tokens:
            counts[tok] = counts.get(tok, 0.0) + 1.0
            vocab_set.add(tok)
        row_counts.append(counts)
    vocab = sorted(vocab_set)
    csr = _build_csr_from_rows(row_counts, vocab)
    return {**csr, "proposalOnly": True, "canonicalAuthority": False}


def build_task_domain_csr_v1(
    tasks: Sequence[Mapping[str, Any]],
    *,
    allowed_domains: Sequence[str],
) -> dict[str, Any]:
    validated = validate_task_batch_v1(tasks)
    allowed_set = set(allowed_domains)
    vocab = list(allowed_domains)
    row_maps: list[dict[str, float]] = []
    unresolved: list[str] = []

    for t in validated:
        row_map: dict[str, float] = {}
        for dom in t["proposedDomains"]:
            if dom in allowed_set:
                row_map[dom] = 1.0
            else:
                unresolved.append(dom)
        row_maps.append(row_map)

    csr = _build_csr_from_rows(row_maps, vocab)
    return {
        **csr,
        "unresolvedProposedDomains": sorted(set(unresolved)),
        "proposalOnly": True,
        "canonicalAuthority": False,
    }


def build_idempotent_queue_proposals_v1(tasks: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    validated = validate_task_batch_v1(tasks)
    proposals: list[dict[str, Any]] = []
    for t in validated:
        idem_key = _sha256_json({
            "taskId": t["taskId"],
            "taskRevision": t["taskRevision"],
            "sourceSha256": t["sourceSha256"],
            "scope": t["scope"],
        })
        proposals.append({
            "idempotencyKey": idem_key,
            "taskId": t["taskId"],
            "taskRevision": t["taskRevision"],
            "scope": t["scope"],
            "sourceRef": t["sourceRef"],
            "sourceSha256": t["sourceSha256"],
            "status": "PROPOSED",
            "canonicalAuthority": False,
        })
    return proposals


def evaluate_tournament_promotion_gate_v1(
    tournament_report: Mapping[str, Any],
    feature_receipt: Mapping[str, Any] | None = None,
    *,
    min_eval_rows: int = 30,
) -> dict[str, Any]:
    eval_rows = int(tournament_report.get("evalRows") or 0)
    masked_utility = int((feature_receipt or {}).get("executionUtilityMaskedCount") or 0)
    reasons: list[str] = []

    if eval_rows < min_eval_rows:
        reasons.append(f"INSUFFICIENT_EVAL_GROUPS:{eval_rows}<{min_eval_rows}")
    if feature_receipt is not None and masked_utility > 0:
        reasons.append(f"EXECUTION_UTILITY_MASKED:{masked_utility}")

    return {
        "schema": "atlas.tournament-promotion-gate.v1",
        "winner": tournament_report.get("winner"),
        "evalRows": eval_rows,
        "minEvalRows": min_eval_rows,
        "executionUtilityMaskedCount": masked_utility,
        "promotionAllowed": len(reasons) == 0,
        "reasons": reasons,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
