from __future__ import annotations

import numpy as np
import pytest

from atlas_compute.tiled_cosine_topk_v1 import (
    brute_force_oracle,
    iter_tiles,
    tiled_cosine_topk,
)


def _data(n=300, d=768, seed=7, dupes=True):
    rng = np.random.default_rng(seed)
    m = rng.standard_normal((n, d)).astype(np.float32)
    if dupes:  # exact-duplicate rows force score ties (corpus has 13% rank-10 ties)
        m[50] = m[10]
        m[200] = m[10]
        m[201] = m[10]
    ids = [f"id{idx:04d}" for idx in range(n)]
    return m, ids, m[min(10, n - 1)] + 0.0


@pytest.mark.parametrize("tile_rows", [1, 7, 64, 300, 1000])
def test_matches_bruteforce_for_any_tile_size(tile_rows):
    m, ids, q = _data()
    got = tiled_cosine_topk(q, iter_tiles(m, ids, tile_rows), k=10)
    want = brute_force_oracle(q, m, ids, 10)
    assert [(c["candidateOrdinal"], c["canonicalId"]) for c in got["candidates"]] == [
        (i, cid) for i, cid, _ in want
    ]
    assert got["totalCandidates"] == 300


def test_ties_break_by_ordinal_then_id():
    m, ids, q = _data()
    got = tiled_cosine_topk(q, iter_tiles(m, ids, 13), k=4)
    # rows 10, 50, 200, 201 are identical to the query: all tie; ordinal ascending
    assert [c["candidateOrdinal"] for c in got["candidates"]] == [10, 50, 200, 201]


def test_pages_are_consistent_and_disjoint():
    m, ids, q = _data()
    p1 = tiled_cosine_topk(q, iter_tiles(m, ids, 32), k=10, offset=0)
    p2 = tiled_cosine_topk(q, iter_tiles(m, ids, 32), k=10, offset=10)
    want = brute_force_oracle(q, m, ids, 20)
    got = [c["candidateOrdinal"] for c in p1["candidates"] + p2["candidates"]]
    assert got == [i for i, _, _ in want]
    assert len(set(got)) == 20
    assert p1["hasMore"] and p2["hasMore"]


def test_k_larger_than_n_and_offset_past_end():
    m, ids, q = _data(n=5, dupes=False)
    r = tiled_cosine_topk(q, iter_tiles(m, ids, 2), k=10)
    assert len(r["candidates"]) == 5 and not r["hasMore"]
    r = tiled_cosine_topk(q, iter_tiles(m, ids, 2), k=10, offset=9)
    assert r["candidates"] == [] and not r["hasMore"]


def test_rejects_bad_input_and_is_non_canonical():
    m, ids, q = _data(n=5, dupes=False)
    with pytest.raises(ValueError):
        tiled_cosine_topk(np.zeros(768, np.float32), iter_tiles(m, ids, 2))
    bad = m.copy()
    bad[1] = 0
    with pytest.raises(ValueError):
        tiled_cosine_topk(q, iter_tiles(bad, ids, 2))
    nan = m.copy()
    nan[0, 0] = np.nan
    with pytest.raises(ValueError):
        tiled_cosine_topk(q, iter_tiles(nan, ids, 2))
    assert tiled_cosine_topk(q, iter_tiles(m, ids, 2))["canonicalAuthority"] is False


def test_parity_with_mrl_evaluator_stable_topk():
    from atlas_compute.mrl_gpu_fanout_evaluation_v1 import _stable_topk

    m, ids, _ = _data(n=400, dupes=True)
    q = np.random.default_rng(3).standard_normal(768).astype(np.float32)
    q[:] = m[10] * 0.5 + q * 0.01
    unit = m / np.linalg.norm(m, axis=1, keepdims=True)
    scores = unit @ (q / np.linalg.norm(q))
    want = _stable_topk(scores, 399, 10)
    got = tiled_cosine_topk(q, iter_tiles(m[:399], ids[:399], 50), k=10)
    assert [c["candidateOrdinal"] for c in got["candidates"]] == want


def test_arrow_tiles_skip_unlike_vectors_and_keep_global_ordinals(tmp_path):
    import pyarrow as pa
    import pyarrow.ipc as ipc

    from atlas_compute.tiled_cosine_topk_v1 import iter_arrow_tiles

    m, ids, q = _data(n=20, dupes=False)
    kinds = ["semantic_768"] * 20
    kinds[3] = "none"
    dims = [768] * 20
    dims[5] = 512
    blobs = [r.astype("<f4").tobytes() for r in m]
    blobs[5] = blobs[5][: 512 * 4]
    tbl = pa.table({"packet_key": ids, "vector_f32": pa.array(blobs, pa.binary()),
                    "vector_dim": pa.array(dims, pa.int32()), "vector_kind": kinds})
    f = tmp_path / "t.arrow"
    with pa.OSFile(str(f), "wb") as sink:
        with ipc.new_file(sink, tbl.schema) as w:
            for b in tbl.to_batches(max_chunksize=6):
                w.write_batch(b)
    stats: dict = {}
    r = tiled_cosine_topk(m[7], iter_arrow_tiles(str(f), stats=stats), k=3)
    assert r["candidates"][0]["candidateOrdinal"] == 7
    assert stats == {"rows_seen": 20, "rows_scored": 18, "skipped_kind": 1, "skipped_dim": 1}
    assert all(c["candidateOrdinal"] not in (3, 5) for c in r["candidates"])


def _dedupe_oracle(q, m, ids, k, offset=0):
    q = q / np.linalg.norm(q)
    unit = m / np.linalg.norm(m, axis=1, keepdims=True)
    scores = unit @ q
    order = sorted(range(len(ids)), key=lambda i: (-float(scores[i]), i, ids[i]))
    seen, kept = {}, []
    for i in order:
        h = unit[i].tobytes()
        if h in seen:
            seen[h][1] += 1
            continue
        seen[h] = [i, 1]
        kept.append(i)
    return [(i, seen[unit[i].tobytes()][1]) for i in kept[offset : offset + k]]


@pytest.mark.parametrize("tile_rows", [1, 5, 33, 500])
def test_dedupe_matches_oracle_with_late_and_early_duplicates(tile_rows):
    rng = np.random.default_rng(11)
    m = rng.standard_normal((400, 768)).astype(np.float32)
    # a LOW-scoring group that appears early and again late (eviction + reappearance path)
    for j in (5, 150, 399):
        m[j] = m[5]
    for j in (20, 21, 300):  # a high-scoring group near the query
        m[j] = m[20]
    q = (m[20] + 0.05 * rng.standard_normal(768)).astype(np.float32)
    ids = [f"id{i:04d}" for i in range(400)]
    got = tiled_cosine_topk(q, iter_tiles(m, ids, tile_rows), k=10, dedupe_exact=True)
    want = _dedupe_oracle(q, m, ids, 10)
    assert [(c["candidateOrdinal"], c.get("duplicateCount", 1)) for c in got["candidates"]] == want
    top = got["candidates"][0]
    assert top["candidateOrdinal"] == 20 and top["duplicateCount"] == 3
    assert [r["candidateOrdinal"] for r in top["duplicateRefs"]] == [21, 300]
    assert got["collapsedCount"] >= 2 and got["dedupeExact"] is True


def test_dedupe_pages_are_distinct_and_hasmore_means_more_distinct_vectors():
    m, ids, q = _data(n=300)
    p1 = tiled_cosine_topk(q, iter_tiles(m, ids, 40), k=10, dedupe_exact=True)
    p2 = tiled_cosine_topk(q, iter_tiles(m, ids, 40), k=10, offset=10, dedupe_exact=True)
    want = _dedupe_oracle(q, m, ids, 20)
    got = [c["candidateOrdinal"] for c in p1["candidates"] + p2["candidates"]]
    assert got == [i for i, _ in want]
    assert p1["hasMore"] is True
    small, sids, sq = _data(n=5, dupes=False)
    assert tiled_cosine_topk(sq, iter_tiles(small, sids, 2), k=10, dedupe_exact=True)["hasMore"] is False


def test_dedupe_requires_ascending_ordinals_and_default_is_unchanged():
    m, ids, q = _data(n=300)
    tiles = list(iter_tiles(m, ids, 100))[::-1]
    with pytest.raises(ValueError):
        tiled_cosine_topk(q, iter(tiles), k=3, dedupe_exact=True)
    plain = tiled_cosine_topk(q, iter_tiles(m, ids, 100), k=4)
    assert [c["candidateOrdinal"] for c in plain["candidates"]] == [10, 50, 200, 201]
    assert plain["dedupeExact"] is False and plain["collapsedCount"] == 0
