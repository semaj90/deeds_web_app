from __future__ import annotations

import hashlib
import json
import math
import struct
from pathlib import Path
from typing import Any, Iterable


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_text(value: str) -> str:
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_text(canonical_json(value))


def sha256_float32(values: Iterable[float]) -> str:
    h = hashlib.sha256()
    for value in values:
        x = float(value)
        if not math.isfinite(x):
            raise ValueError("NON_FINITE_FLOAT")
        h.update(struct.pack("<f", x))
    return "sha256:" + h.hexdigest()


def load_ndjson(path: str | Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, start=1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"INVALID_NDJSON:{path}:{line_no}:{exc}") from exc
            if not isinstance(value, dict):
                raise ValueError(f"NDJSON_ROW_NOT_OBJECT:{path}:{line_no}")
            rows.append(value)
    return rows


def write_ndjson(path: str | Path, rows: Iterable[dict[str, Any]]) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as fh:
        for row in rows:
            fh.write(canonical_json(row) + "\n")


def dcg_at_k(grades: list[int], k: int) -> float:
    total = 0.0
    for rank, grade in enumerate(grades[:k], start=1):
        total += (2.0 ** int(grade) - 1.0) / math.log2(rank + 1.0)
    return total


def ndcg_at_k(ranked_grades: list[int], all_grades: list[int], k: int) -> float | None:
    ideal = sorted((int(g) for g in all_grades), reverse=True)
    denom = dcg_at_k(ideal, k)
    if denom == 0.0:
        return None
    return dcg_at_k([int(g) for g in ranked_grades], k) / denom


def reciprocal_rank_at_k(ranked_grades: list[int], k: int, relevant_grade: int = 2) -> float:
    for rank, grade in enumerate(ranked_grades[:k], start=1):
        if int(grade) >= relevant_grade:
            return 1.0 / rank
    return 0.0


def judged_pool_recall_at_k(
    ranked_grades: list[int], all_grades: list[int], k: int, relevant_grade: int = 2
) -> float | None:
    denom = sum(1 for grade in all_grades if int(grade) >= relevant_grade)
    if denom == 0:
        return None
    num = sum(1 for grade in ranked_grades[:k] if int(grade) >= relevant_grade)
    return num / denom
