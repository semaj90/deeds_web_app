#!/usr/bin/env python3
"""Synthetic cuVS brute-force exact-search parity probe.

Run in the RAPIDS environment. This is an executor fixture only: it does not
read repository data, persist artifacts, or establish semantic authority.
"""

from __future__ import annotations

import json
import platform
import sys

import cupy as cp
import numpy as np
from cuvs.neighbors import brute_force
from importlib.metadata import version


def main() -> int:
    seed = 20260929
    corpus_rows, dimensions, query_rows, top_k = 64, 16, 8, 7
    tolerance = 2e-5

    rng = np.random.default_rng(seed)
    corpus_cpu = rng.standard_normal((corpus_rows, dimensions), dtype=np.float32)
    queries_cpu = rng.standard_normal((query_rows, dimensions), dtype=np.float32)

    # Keep strong references for the full index/search lifetime. cuVS consumes
    # CUDA array-interface objects and the index may retain its input storage.
    corpus_gpu = cp.ascontiguousarray(cp.asarray(corpus_cpu))
    queries_gpu = cp.ascontiguousarray(cp.asarray(queries_cpu))
    if corpus_gpu.dtype != cp.float32 or queries_gpu.dtype != cp.float32:
        raise TypeError("cuVS fixture inputs must be float32")

    index = brute_force.build(corpus_gpu, metric="sqeuclidean")
    distances_gpu, neighbors_gpu = brute_force.search(index, queries_gpu, top_k)
    cp.cuda.runtime.deviceSynchronize()

    distances = cp.asnumpy(cp.asarray(distances_gpu))
    neighbors = cp.asnumpy(cp.asarray(neighbors_gpu)).astype(np.int64, copy=False)
    if distances.shape != (query_rows, top_k) or neighbors.shape != (query_rows, top_k):
        raise AssertionError("cuVS returned unexpected output shapes")
    if not np.isfinite(distances).all():
        raise AssertionError("cuVS returned non-finite distances")
    if (neighbors < 0).any() or (neighbors >= corpus_rows).any():
        raise AssertionError("cuVS returned out-of-range corpus ordinals")

    delta = queries_cpu.astype(np.float64)[:, None, :] - corpus_cpu.astype(np.float64)[None, :, :]
    oracle_distances = np.einsum("qnd,qnd->qn", delta, delta)
    oracle_neighbors = np.argsort(oracle_distances, axis=1, kind="stable")[:, :top_k]
    oracle_selected_distances = np.take_along_axis(oracle_distances, neighbors, axis=1)
    max_abs_error = float(np.max(np.abs(distances.astype(np.float64) - oracle_selected_distances)))
    exact_order_rows = int(np.sum(np.all(neighbors == oracle_neighbors, axis=1)))
    passed = exact_order_rows == query_rows and max_abs_error <= tolerance

    device = cp.cuda.runtime.getDeviceProperties(cp.cuda.runtime.getDevice())
    device_name = device["name"].decode("utf-8") if isinstance(device["name"], bytes) else str(device["name"])
    receipt = {
        "schema": "atlas.cuvs-brute-force-parity-probe.v1",
        "status": "PASS" if passed else "MISMATCH",
        "executor": "cuvs.neighbors.brute_force",
        "cuvsVersion": version("cuvs"),
        "cupyVersion": cp.__version__,
        "pythonVersion": platform.python_version(),
        "device": device_name,
        "metric": "sqeuclidean",
        "seed": seed,
        "fixture": {
            "corpusRows": corpus_rows,
            "dimensions": dimensions,
            "queryRows": query_rows,
            "topK": top_k,
            "dtype": "float32",
        },
        "checks": {
            "documentedReturnOrder": "distances, neighbors",
            "inputOwnersRetained": True,
            "synchronizedBeforeReadback": True,
            "exactOrderRows": exact_order_rows,
            "queryRows": query_rows,
            "maxDistanceBindingAbsoluteError": max_abs_error,
            "tolerance": tolerance,
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    print(json.dumps(receipt, sort_keys=True))
    return 0 if passed else 2


if __name__ == "__main__":
    sys.exit(main())
