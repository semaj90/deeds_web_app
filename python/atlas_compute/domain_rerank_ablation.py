"""Frozen qid-grouped ablation evaluator for Parent Atlas domainClassMatch.

This module evaluates whether the lineage-qualified domainClassMatch feature is
useful to a learning-to-rank model. It is deliberately offline/shadow-only:
no model artifact is promoted, no live XGBoost transport is changed, and
missing domain evidence remains NaN rather than being re-labeled as mismatch.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import math
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np


@dataclass(frozen=True)
class FrozenDomainAblationRow:
    qid: str
    packet_key: str
    label: float
    baseline_features: dict[str, float]
    domain_class_match: float | None
    domain_match_eligible: bool
    comparison_checksum: str
    lineage_status: str


@dataclass(frozen=True)
class RankingMetrics:
    ndcg_at_k: float
    mrr_at_k: float
    query_count: int


@dataclass(frozen=True)
class DomainRerankAblationReceipt:
    schema: str
    status: str
    dataset_checksum: str
    row_count: int
    qid_count: int
    train_qid_count: int
    validation_qid_count: int
    baseline_feature_names: list[str]
    augmented_feature_name: str
    domain_match_eligible_count: int
    domain_match_coverage: float
    objective: str
    ndcg_exp_gain: bool
    eval_k: int
    seed: int
    baseline: RankingMetrics
    augmented: RankingMetrics
    delta_ndcg_at_k: float
    delta_mrr_at_k: float
    ranking_promoted: bool
    xgboost_live_feature_activated: bool

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["baseline"] = asdict(self.baseline)
        result["augmented"] = asdict(self.augmented)
        return result


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _finite_float(value: Any, field: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed):
        raise ValueError(f"{field} must be finite")
    return parsed


def parse_frozen_row(raw: dict[str, Any]) -> FrozenDomainAblationRow:
    qid = str(raw.get("qid", "")).strip()
    packet_key = str(raw.get("packet_key", raw.get("packetKey", ""))).strip()
    if not qid:
        raise ValueError("qid required")
    if not packet_key:
        raise ValueError("packet_key required")

    label = _finite_float(raw.get("label"), "label")
    if label < 0:
        raise ValueError("label must be nonnegative")

    baseline_raw = raw.get("baseline_features")
    if not isinstance(baseline_raw, dict) or not baseline_raw:
        raise ValueError("baseline_features must be a non-empty object")
    if "domain_class_match" in baseline_raw:
        raise ValueError("baseline_features must not already contain domain_class_match")

    baseline_features: dict[str, float] = {}
    for key, value in baseline_raw.items():
        feature = str(key).strip()
        if not feature:
            raise ValueError("baseline feature name must be non-empty")
        baseline_features[feature] = _finite_float(value, f"baseline_features.{feature}")

    eligible = bool(raw.get("domain_match_eligible", raw.get("domainMatchEligible", False)))
    match_raw = raw.get("domain_class_match", raw.get("domainClassMatch"))
    if match_raw is None:
        domain_class_match = None
    else:
        domain_class_match = _finite_float(match_raw, "domain_class_match")
        if domain_class_match not in (0.0, 0.5, 1.0):
            raise ValueError("domain_class_match must be one of 0, 0.5, 1, or null")

    if eligible and domain_class_match is None:
        raise ValueError("eligible domain match requires a numeric domain_class_match")
    if not eligible and domain_class_match is not None:
        raise ValueError("ineligible domain match must remain null")

    comparison_checksum = str(raw.get("comparison_checksum", raw.get("comparisonChecksum", ""))).strip()
    lineage_status = str(raw.get("lineage_status", raw.get("lineageStatus", ""))).strip()
    if not comparison_checksum:
        raise ValueError("comparison_checksum required")
    if lineage_status != "PROVEN" and eligible:
        raise ValueError("eligible domain match requires PROVEN lineage_status")

    return FrozenDomainAblationRow(
        qid=qid,
        packet_key=packet_key,
        label=label,
        baseline_features=dict(sorted(baseline_features.items())),
        domain_class_match=domain_class_match,
        domain_match_eligible=eligible,
        comparison_checksum=comparison_checksum,
        lineage_status=lineage_status,
    )


def load_frozen_rows(path: str | Path) -> list[FrozenDomainAblationRow]:
    rows: list[FrozenDomainAblationRow] = []
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                raw = json.loads(line)
                if not isinstance(raw, dict):
                    raise ValueError("row must be an object")
                rows.append(parse_frozen_row(raw))
            except Exception as exc:
                raise ValueError(f"invalid frozen row at line {line_number}: {exc}") from exc
    validate_frozen_rows(rows)
    return rows


def validate_frozen_rows(rows: Sequence[FrozenDomainAblationRow]) -> list[str]:
    if not rows:
        raise ValueError("frozen ablation dataset is empty")

    feature_names = list(rows[0].baseline_features)
    seen: set[tuple[str, str]] = set()
    qid_counts: dict[str, int] = {}
    for row in rows:
        if list(row.baseline_features) != feature_names:
            raise ValueError("all rows must share the same ordered baseline feature schema")
        identity = (row.qid, row.packet_key)
        if identity in seen:
            raise ValueError(f"duplicate qid/packet identity: {row.qid}/{row.packet_key}")
        seen.add(identity)
        qid_counts[row.qid] = qid_counts.get(row.qid, 0) + 1

    if len(qid_counts) < 2:
        raise ValueError("at least two distinct qids are required")
    if any(count < 2 for count in qid_counts.values()):
        raise ValueError("every qid must contain at least two candidates")
    return feature_names


def dataset_checksum(rows: Sequence[FrozenDomainAblationRow]) -> str:
    payload = [
        {
            "qid": row.qid,
            "packet_key": row.packet_key,
            "label": row.label,
            "baseline_features": row.baseline_features,
            "domain_class_match": row.domain_class_match,
            "domain_match_eligible": row.domain_match_eligible,
            "comparison_checksum": row.comparison_checksum,
            "lineage_status": row.lineage_status,
        }
        for row in sorted(rows, key=lambda item: (item.qid, item.packet_key))
    ]
    return _sha256(_canonical_json(payload))


def split_qids(rows: Sequence[FrozenDomainAblationRow], *, seed: int = 42, validation_fraction: float = 0.2) -> tuple[set[str], set[str]]:
    if not 0 < validation_fraction < 1:
        raise ValueError("validation_fraction must be between 0 and 1")
    qids = sorted({row.qid for row in rows}, key=lambda qid: _sha256(f"{seed}:{qid}"))
    if len(qids) < 2:
        raise ValueError("at least two qids are required")
    validation_count = min(len(qids) - 1, max(1, round(len(qids) * validation_fraction)))
    validation = set(qids[:validation_count])
    train = set(qids[validation_count:])
    return train, validation


def _matrix(rows: Sequence[FrozenDomainAblationRow], feature_names: Sequence[str], *, include_domain_match: bool) -> np.ndarray:
    values: list[list[float]] = []
    for row in rows:
        vector = [row.baseline_features[name] for name in feature_names]
        if include_domain_match:
            vector.append(np.nan if row.domain_class_match is None else row.domain_class_match)
        values.append(vector)
    return np.asarray(values, dtype=np.float32)


def _labels(rows: Sequence[FrozenDomainAblationRow]) -> np.ndarray:
    return np.asarray([row.label for row in rows], dtype=np.float32)


def _qids(rows: Sequence[FrozenDomainAblationRow]) -> np.ndarray:
    # XGBRanker accepts arbitrary integer qids. Map stable sorted string IDs to ints.
    mapping = {qid: index for index, qid in enumerate(sorted({row.qid for row in rows}))}
    return np.asarray([mapping[row.qid] for row in rows], dtype=np.int64)


def _ordered_subset(rows: Sequence[FrozenDomainAblationRow], allowed_qids: set[str]) -> list[FrozenDomainAblationRow]:
    return sorted(
        [row for row in rows if row.qid in allowed_qids],
        key=lambda row: (row.qid, row.packet_key),
    )


def ndcg_at_k(labels: Sequence[float], *, k: int) -> float:
    if k <= 0:
        raise ValueError("k must be positive")
    actual = list(labels)[:k]
    ideal = sorted(labels, reverse=True)[:k]
    dcg = sum(rel / math.log2(index + 2) for index, rel in enumerate(actual))
    idcg = sum(rel / math.log2(index + 2) for index, rel in enumerate(ideal))
    return dcg / idcg if idcg > 0 else 0.0


def mrr_at_k(labels: Sequence[float], *, k: int) -> float:
    for index, relevance in enumerate(list(labels)[:k]):
        if relevance > 0:
            return 1.0 / (index + 1)
    return 0.0


def evaluate_grouped_predictions(
    rows: Sequence[FrozenDomainAblationRow],
    predictions: Sequence[float],
    *,
    k: int,
) -> RankingMetrics:
    if len(rows) != len(predictions):
        raise ValueError("row/prediction length mismatch")
    grouped: dict[str, list[tuple[float, float, str]]] = {}
    for row, prediction in zip(rows, predictions, strict=True):
        grouped.setdefault(row.qid, []).append((float(prediction), row.label, row.packet_key))

    ndcgs: list[float] = []
    mrrs: list[float] = []
    for qid in sorted(grouped):
        ordered = sorted(grouped[qid], key=lambda item: (-item[0], item[2]))
        relevances = [item[1] for item in ordered]
        ndcgs.append(ndcg_at_k(relevances, k=k))
        mrrs.append(mrr_at_k(relevances, k=k))

    return RankingMetrics(
        ndcg_at_k=float(np.mean(ndcgs)) if ndcgs else 0.0,
        mrr_at_k=float(np.mean(mrrs)) if mrrs else 0.0,
        query_count=len(grouped),
    )


def _fit_ranker(
    train_rows: Sequence[FrozenDomainAblationRow],
    validation_rows: Sequence[FrozenDomainAblationRow],
    feature_names: Sequence[str],
    *,
    include_domain_match: bool,
    seed: int,
    device: str,
) -> np.ndarray:
    try:
        import xgboost as xgb
    except ImportError as exc:
        raise RuntimeError("xgboost is required for the live ablation evaluation") from exc

    model = xgb.XGBRanker(
        objective="rank:ndcg",
        eval_metric="ndcg@10",
        ndcg_exp_gain=False,
        n_estimators=200,
        learning_rate=0.05,
        max_depth=5,
        min_child_weight=2,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        tree_method="hist",
        device=device,
        random_state=seed,
        verbosity=0,
    )
    model.fit(
        _matrix(train_rows, feature_names, include_domain_match=include_domain_match),
        _labels(train_rows),
        qid=_qids(train_rows),
        eval_set=[(_matrix(validation_rows, feature_names, include_domain_match=include_domain_match), _labels(validation_rows))],
        eval_qid=[_qids(validation_rows)],
        verbose=False,
    )
    return np.asarray(
        model.predict(_matrix(validation_rows, feature_names, include_domain_match=include_domain_match)),
        dtype=np.float64,
    )


def run_domain_rerank_ablation(
    rows: Sequence[FrozenDomainAblationRow],
    *,
    eval_k: int = 10,
    seed: int = 42,
    validation_fraction: float = 0.2,
    device: str = "cpu",
) -> DomainRerankAblationReceipt:
    feature_names = validate_frozen_rows(rows)
    train_qids, validation_qids = split_qids(rows, seed=seed, validation_fraction=validation_fraction)
    train_rows = _ordered_subset(rows, train_qids)
    validation_rows = _ordered_subset(rows, validation_qids)

    baseline_predictions = _fit_ranker(
        train_rows,
        validation_rows,
        feature_names,
        include_domain_match=False,
        seed=seed,
        device=device,
    )
    augmented_predictions = _fit_ranker(
        train_rows,
        validation_rows,
        feature_names,
        include_domain_match=True,
        seed=seed,
        device=device,
    )

    baseline = evaluate_grouped_predictions(validation_rows, baseline_predictions, k=eval_k)
    augmented = evaluate_grouped_predictions(validation_rows, augmented_predictions, k=eval_k)
    eligible_count = sum(1 for row in rows if row.domain_match_eligible)

    return DomainRerankAblationReceipt(
        schema="atlas.domain-rerank-ablation-receipt.v1",
        status="DOMAIN_MATCH_ABLATION_MEASURED_NOT_PROMOTED",
        dataset_checksum=dataset_checksum(rows),
        row_count=len(rows),
        qid_count=len({row.qid for row in rows}),
        train_qid_count=len(train_qids),
        validation_qid_count=len(validation_qids),
        baseline_feature_names=list(feature_names),
        augmented_feature_name="domain_class_match",
        domain_match_eligible_count=eligible_count,
        domain_match_coverage=eligible_count / float(len(rows)),
        objective="rank:ndcg",
        ndcg_exp_gain=False,
        eval_k=eval_k,
        seed=seed,
        baseline=baseline,
        augmented=augmented,
        delta_ndcg_at_k=augmented.ndcg_at_k - baseline.ndcg_at_k,
        delta_mrr_at_k=augmented.mrr_at_k - baseline.mrr_at_k,
        ranking_promoted=False,
        xgboost_live_feature_activated=False,
    )
