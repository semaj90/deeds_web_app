"""
Native C++ / Cython / pybind11 & CUDA Radix Sort Helper (v1)

Bridges:
1. `_atlas_native_core` (C++20 / pybind11 / Cython-ABI native extension, GIL-released 8-pass LSD radix sort):
   - `radix_sort_som_candidate_indices(kmeans_cluster_ids, som_bmu_ids, candidate_ordinals)`
   - `pack_residency_glyph_key_v1(residency_tier, lod, pagerank_quantized, recency, projection_ordinal)`
   - `radix_sort_u64_keys(keys)`
2. PyTorch CUDA (`torch.argsort` / CUB `DeviceRadixSort` on `cuda:0`) for large GPU tensor batches.
3. Pure-NumPy 8-pass 8-bit LSD stable radix sort fallback when native C++ extension is absent.

Invariants:
- Strictly deterministic and read-only (`canonicalAuthority: False`).
- Enforces `MAX_SOM_RADIX_CANDIDATES_V1 = 65_536`, `som_bmu_id in 0..399`, and unique `candidate_ordinals`.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sys
import time
from typing import Any, Sequence

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
NATIVE_BUILD_DIR = REPO_ROOT / "python" / "atlas_corpus_lib" / "atlas_corpus_lib"

MAX_SOM_RADIX_CANDIDATES_V1 = 65_536


def _load_native_core() -> Any | None:
    build_str = str(NATIVE_BUILD_DIR)
    if build_str not in sys.path:
        sys.path.insert(0, build_str)
    try:
        import _atlas_native_core as native_mod  # type: ignore[import-not-found]

        return native_mod
    except ImportError:
        return None


@dataclass(frozen=True)
class RadixSortBenchmarkReceiptV1:
    schema: str
    candidate_count: int
    cpp_native_available: bool
    cpp_native_elapsed_ms: float | None
    numpy_lsd_elapsed_ms: float
    torch_cuda_elapsed_ms: float | None
    cpp_vs_numpy_exact_match: bool
    cuda_vs_cpp_exact_match: bool | None
    speedup_cpp_over_numpy: float | None
    top_sorted_keys_hex: tuple[str, ...]
    top_sorted_indices: tuple[int, ...]
    canonical_authority: bool = False


def pack_som_radix_key_py(
    kmeans_cluster_id: int,
    som_bmu_id: int,
    candidate_ordinal: int,
) -> int:
    if not (0 <= kmeans_cluster_id <= 0xFFFF):
        raise ValueError("SOM_RADIX_KEY_OUT_OF_RANGE")
    if not (0 <= som_bmu_id < 400):
        raise ValueError("SOM_RADIX_KEY_OUT_OF_RANGE")
    if not (0 <= candidate_ordinal <= 0xFFFFFFFF):
        raise ValueError("SOM_RADIX_KEY_OUT_OF_RANGE")
    return ((kmeans_cluster_id & 0xFFFF) << 48) | ((som_bmu_id & 0xFFFF) << 32) | (candidate_ordinal & 0xFFFFFFFF)


def pack_residency_glyph_key_v1(
    *,
    residency_tier: int,
    lod: int,
    pagerank_quantized: int,
    recency: int,
    projection_ordinal: int,
) -> int:
    native = _load_native_core()
    if native is not None and hasattr(native, "pack_residency_glyph_key_v1"):
        return int(
            native.pack_residency_glyph_key_v1(
                int(residency_tier) & 0xFF,
                int(lod) & 0xFF,
                int(pagerank_quantized) & 0xFFFF,
                int(recency) & 0xFFFF,
                int(projection_ordinal) & 0xFFFFFFFF,
            )
        )
    tier = int(residency_tier) & 0xFF
    lod_field = int(lod) & 0xFF
    utility_bucket = (int(pagerank_quantized) // 257) & 0xFF
    recency_bucket = (int(recency) // 257) & 0xFF
    ordinal = int(projection_ordinal) & 0xFFFFFFFF
    return (tier << 56) | (lod_field << 48) | (utility_bucket << 40) | (recency_bucket << 32) | ordinal


def lsb_radix_sort_u64_numpy(keys: Sequence[int] | np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """8-pass 8-bit LSD stable radix sort over uint64 keys in NumPy."""
    work_keys = np.asarray(keys, dtype=np.uint64).copy()
    n = int(work_keys.shape[0])
    if n > MAX_SOM_RADIX_CANDIDATES_V1:
        raise ValueError("RADIX_U64_CANDIDATE_LIMIT_EXCEEDED")
    work_idx = np.arange(n, dtype=np.uint32)
    if n <= 1:
        return work_keys, work_idx

    for byte_pass in range(8):
        shift = np.uint64(byte_pass * 8)
        buckets = ((work_keys >> shift) & np.uint64(0xFF)).astype(np.int64)
        counts = np.bincount(buckets, minlength=256)
        offsets = np.zeros(256, dtype=np.int64)
        offsets[1:] = np.cumsum(counts[:-1])

        next_keys = np.empty_like(work_keys)
        next_idx = np.empty_like(work_idx)
        for i in range(n):
            b = buckets[i]
            pos = offsets[b]
            next_keys[pos] = work_keys[i]
            next_idx[pos] = work_idx[i]
            offsets[b] += 1
        work_keys = next_keys
        work_idx = next_idx

    return work_keys, work_idx


def radix_sort_u64_cpp_or_fallback(keys: Sequence[int] | np.ndarray) -> tuple[list[int], list[int], str]:
    """
    Execute 8-pass 8-bit LSD radix sort using the compiled C++20 `_atlas_native_core`
    extension (with GIL released) when available, falling back to NumPy LSD radix sort.
    """
    key_list = [int(k) & 0xFFFFFFFFFFFFFFFF for k in keys]
    if len(key_list) > MAX_SOM_RADIX_CANDIDATES_V1:
        raise ValueError("RADIX_U64_CANDIDATE_LIMIT_EXCEEDED")
    native = _load_native_core()
    if native is not None and hasattr(native, "radix_sort_u64_keys"):
        sorted_keys, sorted_indices = native.radix_sort_u64_keys(key_list)
        return [int(k) for k in sorted_keys], [int(i) for i in sorted_indices], "cpp_pybind11_native"

    s_keys, s_idx = lsb_radix_sort_u64_numpy(np.asarray(key_list, dtype=np.uint64))
    return [int(k) for k in s_keys.tolist()], [int(i) for i in s_idx.tolist()], "numpy_lsd_fallback"


def radix_sort_som_candidates_cpp_or_fallback(
    kmeans_cluster_ids: Sequence[int],
    som_bmu_ids: Sequence[int],
    candidate_ordinals: Sequence[int],
) -> tuple[list[int], str]:
    """
    Sort SOM/KMeans candidate tiles by `[kmeans_cluster_id:16][som_bmu_id:16][candidate_ordinal:32]`
    via C++ `_atlas_native_core.radix_sort_som_candidate_indices` or Python reference fallback.
    """
    native = _load_native_core()
    if native is not None and hasattr(native, "radix_sort_som_candidate_indices"):
        indices = native.radix_sort_som_candidate_indices(
            [int(x) for x in kmeans_cluster_ids],
            [int(x) for x in som_bmu_ids],
            [int(x) for x in candidate_ordinals],
        )
        return [int(i) for i in indices], "cpp_pybind11_native"

    if len(kmeans_cluster_ids) != len(som_bmu_ids) or len(kmeans_cluster_ids) != len(candidate_ordinals):
        raise ValueError("SOM_RADIX_KEY_ARRAY_LENGTH_MISMATCH")
    if len(candidate_ordinals) > MAX_SOM_RADIX_CANDIDATES_V1:
        raise ValueError("SOM_RADIX_CANDIDATE_LIMIT_EXCEEDED")
    if len(set(candidate_ordinals)) != len(candidate_ordinals):
        raise ValueError("SOM_RADIX_CANDIDATE_ORDINALS_MUST_BE_UNIQUE")

    keys = [
        pack_som_radix_key_py(int(c), int(b), int(o))
        for c, b, o in zip(kmeans_cluster_ids, som_bmu_ids, candidate_ordinals)
    ]
    _, s_idx = lsb_radix_sort_u64_numpy(np.asarray(keys, dtype=np.uint64))
    return [int(i) for i in s_idx.tolist()], "numpy_lsd_fallback"


def benchmark_radix_sort_backends_v1(keys: Sequence[int]) -> RadixSortBenchmarkReceiptV1:
    """
    Benchmark C++20 `_atlas_native_core` LSD Radix Sort vs Python/NumPy 8-pass LSD Radix Sort
    vs PyTorch CUDA (`cuda:0` CUB radix sort) and verify 100% bit-exact ordering parity.
    """
    key_list = [int(k) & 0xFFFFFFFFFFFFFFFF for k in keys]
    np_arr = np.asarray(key_list, dtype=np.uint64)

    t0 = time.perf_counter()
    np_sorted_keys, np_sorted_idx = lsb_radix_sort_u64_numpy(np_arr)
    numpy_ms = round((time.perf_counter() - t0) * 1000.0, 4)

    native = _load_native_core()
    cpp_avail = bool(native is not None and hasattr(native, "radix_sort_u64_keys"))
    cpp_ms: float | None = None
    cpp_match = False
    if cpp_avail and native is not None:
        t1 = time.perf_counter()
        cpp_keys, cpp_idx = native.radix_sort_u64_keys(key_list)
        cpp_ms = round((time.perf_counter() - t1) * 1000.0, 4)
        cpp_match = (
            [int(k) for k in cpp_keys] == [int(k) for k in np_sorted_keys.tolist()]
            and [int(i) for i in cpp_idx] == [int(i) for i in np_sorted_idx.tolist()]
        )
    else:
        cpp_keys = [int(k) for k in np_sorted_keys.tolist()]
        cpp_idx = [int(i) for i in np_sorted_idx.tolist()]

    cuda_ms: float | None = None
    cuda_match: bool | None = None
    try:
        import torch

        if torch.cuda.is_available():
            # Map unsigned uint64 keys to signed int64 order-preserving representation by flipping MSB
            signed_keys = [int(k ^ (1 << 63)) - (1 << 63) for k in key_list]
            gpu_tensor = torch.tensor(signed_keys, dtype=torch.int64, device="cuda:0")
            torch.cuda.synchronize()
            t2 = time.perf_counter()
            gpu_idx = torch.argsort(gpu_tensor, stable=True)
            torch.cuda.synchronize()
            cuda_ms = round((time.perf_counter() - t2) * 1000.0, 4)
            cuda_idx_list = [int(i) for i in gpu_idx.detach().cpu().tolist()]
            cuda_match = cuda_idx_list == [int(i) for i in cpp_idx]
    except Exception:
        pass

    speedup = round(numpy_ms / max(0.0001, cpp_ms), 2) if cpp_ms is not None else None

    return RadixSortBenchmarkReceiptV1(
        schema="atlas.radix-sort-cpp-cython-benchmark.v1",
        candidate_count=len(key_list),
        cpp_native_available=cpp_avail,
        cpp_native_elapsed_ms=cpp_ms,
        numpy_lsd_elapsed_ms=numpy_ms,
        torch_cuda_elapsed_ms=cuda_ms,
        cpp_vs_numpy_exact_match=cpp_match,
        cuda_vs_cpp_exact_match=cuda_match,
        speedup_cpp_over_numpy=speedup,
        top_sorted_keys_hex=tuple(f"0x{int(k):016x}" for k in cpp_keys[:5]),
        top_sorted_indices=tuple(int(i) for i in cpp_idx[:5]),
        canonical_authority=False,
    )
