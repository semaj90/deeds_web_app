"""Tiled exact cosine top-K over streamed 768-d rows (CPU reference, proposal-only).

Layered on ``topk_paginator`` ordering (SCORE_DESC_ORDINAL_ASC_ID_ASC); it does not
define a second ordering. Rows arrive in bounded tiles, so memory is
O(tile_rows * dim + offset + k), never the full N x Q similarity matrix.

CPU is the correctness oracle. No GPU path exists here: a GPU tile executor must
match this module's output exactly (same ordering, same ties) before promotion.
canonicalAuthority is always False; scores are derived, not identity.
"""

from __future__ import annotations

import hashlib
import heapq
from typing import Iterable, Iterator, Sequence

import numpy as np

SCHEMA = "atlas.tiled-cosine-topk.v1"
ORDER = "SCORE_DESC_ORDINAL_ASC_ID_ASC"


def _unit(rows: np.ndarray) -> np.ndarray:
    rows = np.asarray(rows, dtype=np.float32)
    if rows.ndim != 2:
        raise ValueError("rows must be 2-D")
    if not np.isfinite(rows).all():
        raise ValueError("non-finite values in rows")
    norms = np.linalg.norm(rows, axis=1, keepdims=True)
    if (norms == 0).any():
        raise ValueError("zero-norm row cannot be cosine-scored")
    return rows / norms


def iter_tiles(
    matrix: np.ndarray, ids: Sequence[str], tile_rows: int
) -> Iterator[tuple[int, np.ndarray, Sequence[str]]]:
    """Yield (start_ordinal, rows, ids) tiles from an in-memory or memory-mapped matrix."""
    if tile_rows < 1:
        raise ValueError("tile_rows must be positive")
    for start in range(0, matrix.shape[0], tile_rows):
        yield start, matrix[start : start + tile_rows], ids[start : start + tile_rows]


def tiled_cosine_topk(
    query: np.ndarray,
    tiles: Iterable[tuple[int, np.ndarray, Sequence[str]]],
    k: int = 10,
    offset: int = 0,
    dedupe_exact: bool = False,
    max_duplicate_refs: int = 20,
) -> dict:
    """Exact top-K cosine for one query across streamed tiles.

    ``dedupe_exact`` collapses rows whose unit vectors are byte-identical into one
    representative (lowest ordinal, since tiles must arrive in ascending ordinal order).
    Each kept candidate reports ``duplicateCount`` and up to ``max_duplicate_refs``
    sibling ordinals/ids, so collapsed rows stay visible as evidence. With dedupe,
    ``totalCandidates`` still counts input rows; ``hasMore`` means a further distinct
    vector exists beyond this page.

    ``tiles`` yields (start_ordinal, rows[n, d], ids[n]). Ordinals are
    start_ordinal + row index. Ties order by ordinal ascending, then id.
    """
    if k < 1 or offset < 0:
        raise ValueError("k must be positive and offset non-negative")
    q = np.asarray(query, dtype=np.float32).reshape(-1)
    if not np.isfinite(q).all() or float(np.linalg.norm(q)) == 0.0:
        raise ValueError("query must be finite and non-zero")
    q = q / np.linalg.norm(q)

    capacity = offset + k
    # Heap keeps the WORST kept candidate at heap[0]. Key (score, -ordinal, neg-id-order)
    # is built so that a smaller tuple is worse.
    heap: list[tuple] = []
    total = 0
    live: dict[str, dict] = {}  # vector hash -> group state, only for groups currently in the heap
    rejected_distinct = False
    collapsed = 0
    last_ord = -1
    for tile in tiles:
        if isinstance(tile, _OrdinalTile):
            ords, rows, ids = tile.ordinals, tile.rows, tile.ids
        else:
            start, rows, ids = tile
            ords = range(start, start + len(rows))
        unit = _unit(rows)
        scores = unit @ q  # float32 [n]
        total += scores.shape[0]
        # Pre-shrink: only the best `capacity` of this tile can matter globally.
        n = scores.shape[0]
        if dedupe_exact:
            # Row-level shrink is invalid here: duplicates can occupy several of the best rows,
            # leaving fewer than `capacity` DISTINCT vectors. Filter only by the heap's worst score
            # (a duplicate of a live group has that group's score, so it is never dropped).
            floor = heap[0][0] if len(heap) >= capacity else -np.inf
            cand = np.nonzero(scores >= floor)[0]
        elif n > capacity:
            part = np.argpartition(-scores, capacity - 1)[:capacity]
            cutoff = scores[part].min()
            # keep every row tied with the cutoff so tie-breaking stays exact
            cand = np.nonzero(scores >= cutoff)[0]
        else:
            cand = np.arange(n)
        if dedupe_exact:
            if len(ords) and int(ords[0]) <= last_ord:
                raise ValueError("dedupe_exact requires tiles in strictly ascending ordinal order")
            last_ord = int(ords[-1]) if len(ords) else last_ord
        for i in cand.tolist():
            ordinal = int(ords[i])
            cid = str(ids[i])
            h = hashlib.sha1(unit[i].tobytes()).hexdigest() if dedupe_exact else ""
            if dedupe_exact and h in live:
                g = live[h]
                g["count"] += 1
                collapsed += 1
                if len(g["refs"]) < max_duplicate_refs:
                    g["refs"].append({"candidateOrdinal": ordinal, "canonicalId": cid})
                continue
            item = (float(scores[i]), -ordinal, _NegStr(cid), h)
            if len(heap) < capacity:
                heapq.heappush(heap, item)
                if dedupe_exact:
                    live[h] = {"count": 1, "refs": []}
            elif heap[0] < item:
                evicted = heapq.heapreplace(heap, item)
                if dedupe_exact:
                    live.pop(evicted[3], None)
                    live[h] = {"count": 1, "refs": []}
                rejected_distinct = True
            else:
                rejected_distinct = True

    ranked = sorted(heap, key=lambda t: (-t[0], -t[1], t[2].s))
    page = ranked[offset : offset + k]
    return {
        "schema": SCHEMA,
        "order": ORDER,
        "totalCandidates": total,
        "offset": offset,
        "k": k,
        "hasMore": rejected_distinct if dedupe_exact else offset + len(page) < total,
        "dedupeExact": dedupe_exact,
        "collapsedCount": collapsed,
        "candidates": [_candidate(t, live) for t in page],
        "executor": "cpu_numpy_float32",
        "canonicalAuthority": False,
    }


def _candidate(t: tuple, live: dict) -> dict:
    out = {"candidateOrdinal": -t[1], "canonicalId": t[2].s, "score": t[0]}
    g = live.get(t[3]) if t[3] else None
    if g is not None:
        out["duplicateCount"] = g["count"]
        out["duplicateRefs"] = g["refs"]
    return out


class _OrdinalTile:
    """Tile with explicit (possibly non-contiguous) global ordinals."""

    __slots__ = ("ordinals", "rows", "ids")

    def __init__(self, ordinals, rows, ids) -> None:
        self.ordinals, self.rows, self.ids = ordinals, rows, ids


class _NegStr:
    """String wrapper whose ordering is reversed, so a greater id is 'worse' in the heap."""

    __slots__ = ("s",)

    def __init__(self, s: str) -> None:
        self.s = s

    def __lt__(self, other: "_NegStr") -> bool:
        return self.s > other.s

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _NegStr) and self.s == other.s


def brute_force_oracle(
    query: np.ndarray, matrix: np.ndarray, ids: Sequence[str], k: int, offset: int = 0
) -> list[tuple[int, str, float]]:
    """Full-matrix reference used only by tests."""
    q = np.asarray(query, dtype=np.float32).reshape(-1)
    q = q / np.linalg.norm(q)
    scores = _unit(matrix) @ q
    order = sorted(range(len(ids)), key=lambda i: (-float(scores[i]), i, str(ids[i])))
    return [(i, str(ids[i]), float(scores[i])) for i in order[offset : offset + k]]


def iter_arrow_tiles(
    arrow_path: str,
    *,
    id_column: str = "packet_key",
    vector_column: str = "vector_f32",
    dim_column: str = "vector_dim",
    kind_column: str = "vector_kind",
    required_kind: str = "semantic_768",
    dim: int = 768,
    stats: dict | None = None,
):
    """Stream (start_ordinal, rows, ids) tiles from an Arrow IPC file, one record batch at a time.

    ``vector_f32`` is little-endian float32 bytes (the exporter's contract). Ordinal is the
    Arrow row index (arrow_row_index_not_byte_offset). Rows whose kind or dim do not match
    are skipped and counted in ``stats`` so a mixed-representation file never silently
    scores unlike vectors together.
    """
    import pyarrow as pa
    import pyarrow.ipc as ipc

    stats = stats if stats is not None else {}
    stats.update({"rows_seen": 0, "rows_scored": 0, "skipped_kind": 0, "skipped_dim": 0})
    with pa.memory_map(str(arrow_path), "r") as source:
        reader = ipc.open_file(source)
        row0 = 0
        for b in range(reader.num_record_batches):
            batch = reader.get_batch(b)
            n = batch.num_rows
            blobs = batch.column(vector_column).to_pylist()
            dims = batch.column(dim_column).to_pylist()
            kinds = batch.column(kind_column).to_pylist()
            keys = batch.column(id_column).to_pylist()
            keep, rows, ids = [], [], []
            for i in range(n):
                if kinds[i] != required_kind:
                    stats["skipped_kind"] += 1
                elif dims[i] != dim or blobs[i] is None or len(blobs[i]) != dim * 4:
                    stats["skipped_dim"] += 1
                else:
                    keep.append(row0 + i)
                    rows.append(np.frombuffer(blobs[i], dtype="<f4"))
                    ids.append(keys[i])
            stats["rows_seen"] += n
            stats["rows_scored"] += len(rows)
            row0 += n
            # One tile per record batch; ordinals are per-row, so yield each kept run separately.
            if rows:
                yield _OrdinalTile(keep, np.stack(rows), ids)
