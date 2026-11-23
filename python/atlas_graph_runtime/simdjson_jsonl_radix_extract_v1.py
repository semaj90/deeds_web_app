"""Streaming pysimdjson JSONL extractor + SOM radix-sort CPU oracle matching C++ N-API.

Uses `simdjson.Parser` with a lazy Python `Iterator` so large `.jsonl` datasets
can be streamed without loading whole files into RAM, and provides a deterministic
`radix_sort_som_candidates_cpu_v1` matching `addon.radixSortSomCandidateIndicesV1`
in `packages/atlas-native-core/tests/native_addon_smoke.cjs`.
"""
from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import simdjson


def iter_jsonl_simdjson_v1(
    jsonl_path: str | Path,
    *,
    limit: int | None = None,
) -> Iterator[dict[str, Any]]:
    """Lazily stream and parse `.jsonl` records using `simdjson.Parser`."""
    parser = simdjson.Parser()
    yielded = 0
    with Path(jsonl_path).open("rb") as fh:
        for raw_line in fh:
            line = raw_line.strip()
            if not line:
                continue
            obj = parser.parse(line).as_dict()
            yield obj
            yielded += 1
            if limit is not None and yielded >= limit:
                break


def radix_sort_som_candidates_cpu_v1(
    som_rows: np.ndarray | list[int],
    som_cols: np.ndarray | list[int],
    candidate_ordinals: np.ndarray | list[int],
) -> np.ndarray:
    """Deterministic radix/lexicographic sort by `(som_row, som_col, candidate_ordinal)`.

    Matches `addon.radixSortSomCandidateIndicesV1` in `packages/atlas-native-core`
    for `[1, 0, 1], [2, 9, 2], [7, 8, 1] -> [1, 2, 0]`.
    """
    rows = np.asarray(som_rows, dtype=np.uint16)
    cols = np.asarray(som_cols, dtype=np.uint16)
    ords = np.asarray(candidate_ordinals, dtype=np.uint32)
    if not (rows.shape == cols.shape == ords.shape) or rows.ndim != 1:
        raise ValueError("RADIX_SOM_INPUT_SHAPE_MISMATCH")
    if rows.size == 0:
        return np.empty((0,), dtype=np.uint32)
    keys = (rows.astype(np.uint64) << 48) | (cols.astype(np.uint64) << 32) | ords.astype(np.uint64)
    return np.argsort(keys, kind="stable").astype(np.uint32)


def extract_jsonl_som_radix_batch_v1(
    jsonl_path: str | Path,
    *,
    limit: int = 100,
) -> dict[str, Any]:
    """Stream a `.jsonl` dataset via simdjson and pack/sort `(somRow, somCol, candidateOrdinal)`."""
    records = list(iter_jsonl_simdjson_v1(jsonl_path, limit=limit))
    rows: list[int] = []
    cols: list[int] = []
    ords: list[int] = []
    for idx, rec in enumerate(records):
        rows.append(int(rec.get("somRow", rec.get("som_row", 0))) & 0xFFFF)
        cols.append(int(rec.get("somCol", rec.get("som_col", 0))) & 0xFFFF)
        ords.append(int(rec.get("candidateOrdinal", rec.get("ordinal", idx))) & 0xFFFFFFFF)

    sorted_indices = radix_sort_som_candidates_cpu_v1(rows, cols, ords)
    return {
        "schema": "atlas.simdjson-jsonl-radix-extract.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "jsonlPath": str(jsonl_path),
        "recordCount": len(records),
        "sortedIndicesSample": sorted_indices[:10].tolist(),
    }
