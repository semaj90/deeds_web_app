"""CUTILE-ACE-01 LEVEL 3 -- fused cuTile challenger kernel, Python cuda.tile API.

Supersedes the C++ (cuda_tile.h) attempt in glyph_fused_tile.cu, which hit a
genuine toolchain version skew (CUDA 13.3 header/frontend vs CUDA 13.2
tileiras backend -- see docs/reports/cutile-ace-level3-attempt-v1.json).
This file uses the SAME venv's own Python cuda.tile package
(/home/james/.venvs/atlas-cutile-cu132), which carries its own matched
nvcc/tileiras internally (get_sm_arch() picks sm_86 automatically) -- no
cross-environment toolchain mixing, confirmed working via a minimal
elementwise-add smoke test before porting this real kernel.

Fuses GlyphScoreV1 scoring and ResidencySortKeyV1 packing into ONE
@ct.kernel -- the actual LEVEL 3 fusion CUTILE-ACE-01 exists to prove,
mirroring native/cutile-ace-level2/glyph_kernels_bench.cu's two separate
LEVEL 2 kernels but combined into a single kernel/launch.

Reads the SAME 16-byte glyph binary fixtures LEVEL 2 already uses
(scripts/atlas/ace-radix-01/write-cutile-level2-fixtures.mjs's output) --
no new fixture format. Gate: exact match against the SAME CPU oracles
LEVEL 1/2 used (scripts/atlas/ace-radix-01/glyph-score-v1.mjs).

Usage (from WSL2, atlas-cutile-cu132 venv activated):
    python glyph_fused_tile.py <glyphs.bin> <scores-ref.bin> <keys-ref.bin> <N>
"""

from __future__ import annotations

import json
import struct
import sys

import cuda.tile as ct
import torch

TILE = 256

# MUST match native/cutile-ace-level2/glyph_kernels_bench.cu's and
# scripts/atlas/ace-radix-01/glyph-score-v1.mjs's named constants exactly.
W_PAGERANK = 4
W_RECENCY = 3
W_RESIDENCY = 2
W_LOD = 1
W_FEATURE_POPCOUNT = 50
W_FLAG_POPCOUNT = 50


def _popcount16_swar(v):
    """Standard SWAR bit-count on a uint32 tile. cuda.tile has no popcount
    builtin (same finding as the C++ header attempt) -- values here only
    ever occupy the low 16 bits, so the 32-bit algorithm's unused high bits
    are always zero and safe."""
    v = ct.sub(v, ct.bitwise_and(ct.bitwise_rshift(v, 1), 0x55555555))
    v = ct.add(
        ct.bitwise_and(v, 0x33333333),
        ct.bitwise_and(ct.bitwise_rshift(v, 2), 0x33333333),
    )
    v = ct.bitwise_and(ct.add(v, ct.bitwise_rshift(v, 4)), 0x0F0F0F0F)
    v = ct.bitwise_rshift(ct.mul(v, 0x01010101), 24)
    return v


@ct.kernel
def fused_glyph_score_and_key_pack(
    ordinal, feature, lod, residency, pagerank, recency, flags, out_scores, out_keys
):
    i = ct.bid(0)

    ordinal_t = ct.astype(
        ct.load(ordinal, (i,), (TILE,), padding_mode=ct.PaddingMode.ZERO), ct.uint64
    )
    feature_t = ct.astype(
        ct.load(feature, (i,), (TILE,), padding_mode=ct.PaddingMode.ZERO), ct.uint32
    )
    lod_t = ct.astype(ct.load(lod, (i,), (TILE,), padding_mode=ct.PaddingMode.ZERO), ct.uint32)
    residency_t = ct.astype(
        ct.load(residency, (i,), (TILE,), padding_mode=ct.PaddingMode.ZERO), ct.uint32
    )
    pagerank_t = ct.astype(
        ct.load(pagerank, (i,), (TILE,), padding_mode=ct.PaddingMode.ZERO), ct.uint32
    )
    recency_t = ct.astype(
        ct.load(recency, (i,), (TILE,), padding_mode=ct.PaddingMode.ZERO), ct.uint32
    )
    flags_t = ct.astype(
        ct.load(flags, (i,), (TILE,), padding_mode=ct.PaddingMode.ZERO), ct.uint32
    )

    feature_pop = _popcount16_swar(feature_t)
    flags_pop = _popcount16_swar(flags_t)

    score = ct.add(
        ct.add(
            ct.add(ct.mul(pagerank_t, W_PAGERANK), ct.mul(recency_t, W_RECENCY)),
            ct.add(
                ct.mul(ct.mul(residency_t, 257), W_RESIDENCY),
                ct.mul(ct.mul(lod_t, 257), W_LOD),
            ),
        ),
        ct.add(
            ct.mul(feature_pop, W_FEATURE_POPCOUNT),
            ct.mul(flags_pop, W_FLAG_POPCOUNT),
        ),
    )

    tier64 = ct.astype(residency_t, ct.uint64)
    lod64 = ct.astype(lod_t, ct.uint64)
    # floordiv on unsigned tiles hits a real backend limitation on this
    # compiler build ("rounding mode 'negative_inf' is not allowed with
    # 'unsigned' flag") -- divide as signed int32 instead and cast the
    # result back to uint64.
    #
    # Safety (CUTILE-ACE-BOUNDARY-01, 2026-09-14): this is not merely safe
    # because pagerankQuantized/recency are "non-negative" -- a non-negative
    # uint32 CAN still overflow int32. It is safe because their REAL
    # declared field width is uint16 (max 65535, per fixture-v1.mjs's own
    # docstring and PackedGlyphInputV1's uint16_t declaration in
    # native/cutile-ace-level2/glyph_kernels_bench.cu) -- ~32,767x smaller
    # than INT32_MAX (2147483647), so the cast can never wrap for any value
    # either field is contractually permitted to hold. Proven with an
    # explicit boundary fixture (N=26, including both fields at exactly
    # 65535) exact-matching across all 3 GPU-primitive lanes:
    # docs/reports/cutile-ace-boundary-01-results.json.
    utility_bucket = ct.astype(ct.floordiv(ct.astype(pagerank_t, ct.int32), 257), ct.uint64)
    recency_bucket = ct.astype(ct.floordiv(ct.astype(recency_t, ct.int32), 257), ct.uint64)

    packed_key = ct.bitwise_or(
        ct.bitwise_or(
            ct.bitwise_or(
                ct.bitwise_lshift(tier64, 56), ct.bitwise_lshift(lod64, 48)
            ),
            ct.bitwise_lshift(utility_bucket, 40),
        ),
        ct.bitwise_or(ct.bitwise_lshift(recency_bucket, 32), ordinal_t),
    )

    ct.store(out_scores, (i,), score)
    ct.store(out_keys, (i,), packed_key)


def _read_glyphs(path: str, n: int):
    with open(path, "rb") as f:
        data = f.read(n * 16)
    ordinal = torch.empty(n, dtype=torch.int64)
    feature = torch.empty(n, dtype=torch.int64)
    lod = torch.empty(n, dtype=torch.int64)
    residency = torch.empty(n, dtype=torch.int64)
    pagerank = torch.empty(n, dtype=torch.int64)
    recency = torch.empty(n, dtype=torch.int64)
    flags = torch.empty(n, dtype=torch.int64)
    for idx in range(n):
        off = idx * 16
        (ord_v, feat_v, lod_v, res_v, pr_v, rec_v, som_v, fl_v) = struct.unpack_from(
            "<IHBBHHHH", data, off
        )
        ordinal[idx] = ord_v
        feature[idx] = feat_v
        lod[idx] = lod_v
        residency[idx] = res_v
        pagerank[idx] = pr_v
        recency[idx] = rec_v
        flags[idx] = fl_v
    return ordinal, feature, lod, residency, pagerank, recency, flags


def main() -> int:
    if len(sys.argv) != 5:
        print(f"usage: {sys.argv[0]} <glyphs.bin> <scores-ref.bin> <keys-ref.bin> <N>", file=sys.stderr)
        return 2
    glyphs_path, scores_ref_path, keys_ref_path, n_str = sys.argv[1:5]
    n = int(n_str)

    ordinal, feature, lod, residency, pagerank, recency, flags = _read_glyphs(glyphs_path, n)
    ordinal_c = ordinal.to(device="cuda", dtype=torch.uint32)
    feature_c = feature.to(device="cuda", dtype=torch.uint16)
    lod_c = lod.to(device="cuda", dtype=torch.uint8)
    residency_c = residency.to(device="cuda", dtype=torch.uint8)
    pagerank_c = pagerank.to(device="cuda", dtype=torch.uint16)
    recency_c = recency.to(device="cuda", dtype=torch.uint16)
    flags_c = flags.to(device="cuda", dtype=torch.uint16)

    out_scores = torch.zeros(n, device="cuda", dtype=torch.uint32)
    out_keys = torch.zeros(n, device="cuda", dtype=torch.uint64)

    grid = ((n + TILE - 1) // TILE,)
    stream = torch.cuda.current_stream().cuda_stream
    ct.launch(
        stream,
        grid,
        fused_glyph_score_and_key_pack,
        (
            ordinal_c,
            feature_c,
            lod_c,
            residency_c,
            pagerank_c,
            recency_c,
            flags_c,
            out_scores,
            out_keys,
        ),
    )
    torch.cuda.synchronize()

    with open(scores_ref_path, "rb") as f:
        scores_ref = torch.frombuffer(bytearray(f.read(n * 4)), dtype=torch.int32).to(torch.int64)
    with open(keys_ref_path, "rb") as f:
        keys_ref = torch.frombuffer(bytearray(f.read(n * 8)), dtype=torch.int64)

    scores_gpu = out_scores.to("cpu", dtype=torch.int64)
    keys_gpu = out_keys.to("cpu", dtype=torch.int64)

    score_match = bool(torch.equal(scores_gpu, scores_ref))
    key_match = bool(torch.equal(keys_gpu, keys_ref))

    first_score_mismatch = None
    if not score_match:
        diff = (scores_gpu != scores_ref).nonzero(as_tuple=True)[0]
        first_score_mismatch = int(diff[0].item())
    first_key_mismatch = None
    if not key_match:
        diff = (keys_gpu != keys_ref).nonzero(as_tuple=True)[0]
        first_key_mismatch = int(diff[0].item())

    result = {
        "schema": "atlas.cutile-ace-level3.result.v1",
        "test": "CUTILE-ACE-01-LEVEL3",
        "n": n,
        "api": "python-cuda-tile",
        "glyphScoreV1ExactMatch": score_match,
        "glyphScoreV1FirstMismatchIndex": first_score_mismatch,
        "residencyKeyPackV1ExactMatch": key_match,
        "residencyKeyPackV1FirstMismatchIndex": first_key_mismatch,
        "RESULT": "DRY_RUN_PROVEN" if (score_match and key_match) else "FAIL",
    }
    print(json.dumps(result))
    return 0 if (score_match and key_match) else 1


if __name__ == "__main__":
    sys.exit(main())
