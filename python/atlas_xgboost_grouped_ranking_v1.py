#!/usr/bin/env python3
"""Deterministic Parent Atlas XGBoost grouped-ranking preparation.

This module is intentionally storage/runtime neutral. It turns exact candidate
rows into a stable qid-sorted matrix without inventing candidate identity.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
from typing import Iterable, Mapping, Sequence

import numpy as np


@dataclass(frozen=True)
class GroupedRankingDatasetV1:
    feature_names: tuple[str, ...]
    qid_labels: tuple[str, ...]
    qid: np.ndarray
    candidate_keys: tuple[str, ...]
    X: np.ndarray
    y: np.ndarray
    dataset_checksum: str


def _canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256(value: object) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def prepare_grouped_ranking_dataset_v1(
    rows: Iterable[Mapping[str, object]],
    feature_names: Sequence[str],
    *,
    qid_field: str = "qid",
    candidate_key_field: str = "packet_key",
    label_field: str = "label",
) -> GroupedRankingDatasetV1:
    names = tuple(str(name).strip() for name in feature_names)
    if not names or any(not name for name in names):
        raise ValueError("XGB_FEATURE_NAMES_REQUIRED")
    if len(set(names)) != len(names):
        raise ValueError("XGB_FEATURE_NAMES_DUPLICATE")

    normalized: list[dict[str, object]] = []
    seen_pairs: set[tuple[str, str]] = set()

    for row in rows:
        qid_label = str(row.get(qid_field, "")).strip()
        candidate_key = str(row.get(candidate_key_field, "")).strip()
        if not qid_label:
            raise ValueError("XGB_QID_REQUIRED")
        if not candidate_key:
            raise ValueError("XGB_CANDIDATE_KEY_REQUIRED")
        pair = (qid_label, candidate_key)
        if pair in seen_pairs:
            raise ValueError(f"XGB_DUPLICATE_QID_CANDIDATE:{qid_label}:{candidate_key}")
        seen_pairs.add(pair)

        try:
            label = float(row.get(label_field, 0.0))
        except (TypeError, ValueError) as exc:
            raise ValueError("XGB_LABEL_INVALID") from exc
        if not math.isfinite(label):
            raise ValueError("XGB_LABEL_NONFINITE")

        features: list[float] = []
        for name in names:
            value = row.get(name)
            if value is None:
                features.append(float("nan"))
                continue
            try:
                numeric = float(value)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"XGB_FEATURE_INVALID:{name}") from exc
            if not math.isfinite(numeric):
                if math.isnan(numeric):
                    features.append(numeric)
                    continue
                raise ValueError(f"XGB_FEATURE_NONFINITE:{name}")
            features.append(numeric)

        normalized.append({
            "qid": qid_label,
            "candidate_key": candidate_key,
            "label": label,
            "features": features,
        })

    if not normalized:
        raise ValueError("XGB_GROUPED_ROWS_REQUIRED")

    normalized.sort(key=lambda row: (str(row["qid"]), str(row["candidate_key"])))
    qid_labels = tuple(sorted({str(row["qid"]) for row in normalized}))
    if any(sum(1 for row in normalized if row["qid"] == qid) < 2 for qid in qid_labels):
        raise ValueError("XGB_QID_REQUIRES_AT_LEAST_TWO_CANDIDATES")

    qid_map = {label: index for index, label in enumerate(qid_labels)}
    qid = np.asarray([qid_map[str(row["qid"])] for row in normalized], dtype=np.uint32)
    candidate_keys = tuple(str(row["candidate_key"]) for row in normalized)
    X = np.asarray([row["features"] for row in normalized], dtype=np.float32)
    y = np.asarray([float(row["label"]) for row in normalized], dtype=np.float32)

    checksum_rows = [
        {
            "qid": str(row["qid"]),
            "candidate_key": str(row["candidate_key"]),
            "label": float(row["label"]),
            "features": [None if math.isnan(float(v)) else float(v) for v in row["features"]],
        }
        for row in normalized
    ]
    dataset_checksum = _sha256({
        "schema": "atlas.xgboost-grouped-ranking-dataset.v1",
        "feature_names": names,
        "rows": checksum_rows,
    })

    return GroupedRankingDatasetV1(
        feature_names=names,
        qid_labels=qid_labels,
        qid=qid,
        candidate_keys=candidate_keys,
        X=X,
        y=y,
        dataset_checksum=dataset_checksum,
    )
