"""Tests for pysimdjson JSONL streaming extractor and C++ N-API-compatible SOM radix sort."""
from __future__ import annotations

from pathlib import Path

from atlas_graph_runtime.simdjson_jsonl_radix_extract_v1 import (
    extract_jsonl_som_radix_batch_v1,
    iter_jsonl_simdjson_v1,
    radix_sort_som_candidates_cpu_v1,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_radix_sort_som_candidates_matches_cpp_napi_smoke() -> None:
    sorted_idx = radix_sort_som_candidates_cpu_v1([1, 0, 1], [2, 9, 2], [7, 8, 1])
    assert sorted_idx.tolist() == [1, 2, 0]


def test_iter_and_extract_repo_jsonl_datasets() -> None:
    cuda_jsonl = REPO_ROOT / "data" / "external-docs" / "chunks" / "cuda.jsonl"
    items = list(iter_jsonl_simdjson_v1(cuda_jsonl, limit=5))
    assert len(items) == 4

    res = extract_jsonl_som_radix_batch_v1(cuda_jsonl, limit=10)
    assert res["canonicalAuthority"] is False
    assert res["writesPerformed"] is False
    assert res["recordCount"] == 4
    assert len(res["sortedIndicesSample"]) == 4
