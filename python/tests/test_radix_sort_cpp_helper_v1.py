from __future__ import annotations

import pytest

from atlas_compute.radix_sort_cpp_helper_v1 import (
    MAX_SOM_RADIX_CANDIDATES_V1,
    benchmark_radix_sort_backends_v1,
    pack_residency_glyph_key_v1,
    pack_som_radix_key_py,
    radix_sort_som_candidates_cpp_or_fallback,
    radix_sort_u64_cpp_or_fallback,
)


def test_pack_residency_glyph_key_v1_bit_layout() -> None:
    key = pack_residency_glyph_key_v1(
        residency_tier=1,
        lod=0,
        pagerank_quantized=257 * 3,
        recency=257 * 5,
        projection_ordinal=35,
    )
    assert key == (1 << 56) | (0 << 48) | (3 << 40) | (5 << 32) | 35


def test_cpp_radix_sort_u64_matches_numpy_and_cuda_parity() -> None:
    keys = [
        pack_residency_glyph_key_v1(
            residency_tier=(i % 3) + 1,
            lod=i % 2,
            pagerank_quantized=((31 - (i % 32)) * 257),
            recency=((i * 17) % 65535),
            projection_ordinal=i + 100,
        )
        for i in range(512)
    ]
    sorted_keys, sorted_idx, backend = radix_sort_u64_cpp_or_fallback(keys)
    assert backend == "cpp_pybind11_native"
    assert sorted_keys == sorted(keys)
    assert [keys[i] for i in sorted_idx] == sorted_keys

    receipt = benchmark_radix_sort_backends_v1(keys)
    assert receipt.cpp_native_available is True
    assert receipt.cpp_vs_numpy_exact_match is True
    assert receipt.canonical_authority is False
    if receipt.cuda_vs_cpp_exact_match is not None:
        assert receipt.cuda_vs_cpp_exact_match is True


def test_cpp_radix_sort_som_candidates_and_negative_guards() -> None:
    clusters = [2, 0, 1, 0]
    bmus = [120, 45, 10, 12]
    ordinals = [104, 102, 103, 101]

    sorted_idx, backend = radix_sort_som_candidates_cpp_or_fallback(clusters, bmus, ordinals)
    assert backend == "cpp_pybind11_native"
    # Cluster 0 BMU 12 (idx 3) -> Cluster 0 BMU 45 (idx 1) -> Cluster 1 BMU 10 (idx 2) -> Cluster 2 BMU 120 (idx 0)
    assert sorted_idx == [3, 1, 2, 0]

    with pytest.raises(ValueError, match="SOM_RADIX_KEY_OUT_OF_RANGE"):
        radix_sort_som_candidates_cpp_or_fallback([0], [400], [1])

    with pytest.raises(ValueError, match="SOM_RADIX_CANDIDATE_ORDINALS_MUST_BE_UNIQUE"):
        radix_sort_som_candidates_cpp_or_fallback([0, 0], [10, 20], [99, 99])

    with pytest.raises(ValueError, match="RADIX_U64_CANDIDATE_LIMIT_EXCEEDED"):
        radix_sort_u64_cpp_or_fallback([1] * (MAX_SOM_RADIX_CANDIDATES_V1 + 1))

    assert pack_som_radix_key_py(1, 2, 3) == (1 << 48) | (2 << 32) | 3
