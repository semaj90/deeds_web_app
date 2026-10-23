#!/usr/bin/env python3
"""Compare deterministic CPU and cuDF feature aggregation on a frozen Arrow matrix."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def main() -> int:
    run_started_at = datetime.now(timezone.utc).isoformat()
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"gpu-parity-[a-z0-9-]{1,48}", args.run_id):
        raise SystemExit("RUN_ID_INVALID")
    if not args.input.is_file() or args.output_dir.exists():
        raise SystemExit("INPUT_MISSING_OR_OUTPUT_EXISTS")

    import numpy as np
    import pyarrow as pa
    import pyarrow.ipc as ipc
    import cudf
    import cupy as cp
    import importlib.metadata as metadata

    repository_python = Path(__file__).resolve().parents[2] / "python"
    sys.path.insert(0, str(repository_python))
    from atlas_compute.gpu_memory import GpuMemorySampler

    input_bytes = args.input.read_bytes()
    table = ipc.open_file(pa.BufferReader(input_bytes)).read_all()
    expected_columns = ["entityOrdinal", "featureOrdinal", "value"]
    if table.column_names != expected_columns or table.num_rows == 0:
        raise SystemExit("ARROW_SCHEMA_OR_EMPTY_INPUT_INVALID")
    if any(not pa.types.is_integer(field.type) for field in table.schema):
        raise SystemExit("ARROW_NON_INTEGER_FEATURE_INPUT")

    entity = table.column("entityOrdinal").to_numpy(zero_copy_only=False).astype(np.int64, copy=False)
    feature = table.column("featureOrdinal").to_numpy(zero_copy_only=False).astype(np.int64, copy=False)
    values = table.column("value").to_numpy(zero_copy_only=False).astype(np.int64, copy=False)
    if np.any(entity < 0) or np.any(feature < 0) or np.any(values < 0):
        raise SystemExit("FEATURE_VALUES_OUT_OF_RANGE")
    feature_count = int(feature.max()) + 1
    source_sha = sha256(input_bytes)

    def cpu_aggregate() -> list[int]:
        totals = np.bincount(feature, weights=values, minlength=feature_count).astype(np.int64)
        return totals.tolist()

    cpu_expected = cpu_aggregate()
    gpu_memory_sampler = GpuMemorySampler(interval_seconds=0.01).start()
    device_table = pa.table({
        "featureOrdinal": pa.array(feature, type=pa.int32()),
        "value": pa.array(values, type=pa.int64()),
    })
    gpu_frame = cudf.DataFrame.from_arrow(device_table)

    cp.cuda.runtime.deviceSynchronize()
    free_before, total_memory = cp.cuda.runtime.memGetInfo()
    gpu_result = gpu_frame.groupby("featureOrdinal")["value"].sum().sort_index()
    cp.cuda.runtime.deviceSynchronize()
    gpu_first = [0] * feature_count
    for ordinal, total in zip(gpu_result.index.to_arrow().to_pylist(), gpu_result.to_arrow().to_pylist()):
        gpu_first[int(ordinal)] = int(total)
    if gpu_first != cpu_expected:
        raise SystemExit("CPU_GPU_PARITY_MISMATCH")

    cpu_ms: list[float] = []
    gpu_ms: list[float] = []
    for _ in range(5):
        started = time.perf_counter()
        current_cpu = cpu_aggregate()
        cpu_ms.append((time.perf_counter() - started) * 1000)
        if current_cpu != cpu_expected:
            raise SystemExit("CPU_NONDETERMINISTIC_RESULT")

        cp.cuda.runtime.deviceSynchronize()
        started = time.perf_counter()
        current_gpu = gpu_frame.groupby("featureOrdinal")["value"].sum().sort_index()
        cp.cuda.runtime.deviceSynchronize()
        gpu_ms.append((time.perf_counter() - started) * 1000)
        current_values = [0] * feature_count
        for ordinal, total in zip(current_gpu.index.to_arrow().to_pylist(), current_gpu.to_arrow().to_pylist()):
            current_values[int(ordinal)] = int(total)
        if current_values != cpu_expected:
            raise SystemExit("GPU_NONDETERMINISTIC_RESULT")

    free_after, _ = cp.cuda.runtime.memGetInfo()
    gpu_memory_receipt = gpu_memory_sampler.stop().to_dict()
    result_body = {
        "schema": "atlas.directory-feature-aggregation-parity.v1",
        "runId": args.run_id,
        "status": "PARITY_PASS_ADVISORY_BENCHMARK",
        "startedAt": run_started_at,
        "completedAt": datetime.now(timezone.utc).isoformat(),
        "input": {
            "path": str(args.input),
            "sha256": source_sha,
            "rows": table.num_rows,
            "featureCount": feature_count,
            "schema": str(table.schema),
        },
        "aggregation": "sum(value) grouped by featureOrdinal; CPU NumPy bincount oracle",
        "output": {
            "cpuSha256": sha256(canonical(cpu_expected)),
            "gpuSha256": sha256(canonical(gpu_first)),
            "featureTotals": cpu_expected,
            "parity": cpu_expected == gpu_first,
        },
        "performance": {
            "repetitions": 5,
            "cpuMedianMs": statistics.median(cpu_ms),
            "gpuMedianMs": statistics.median(gpu_ms),
            "cpuSamplesMs": cpu_ms,
            "gpuSamplesMs": gpu_ms,
            "speedupCpuOverGpu": statistics.median(cpu_ms) / statistics.median(gpu_ms),
            "gpuMemoryTotalMiB": total_memory / (1024 * 1024),
            "gpuFreeBeforeMiB": free_before / (1024 * 1024),
            "gpuFreeAfterMiB": free_after / (1024 * 1024),
            "peakGpuMemoryMeasured": gpu_memory_receipt["available"],
            "gpuMemoryReceipt": gpu_memory_receipt,
        },
        "environment": {
            "cudf": metadata.version("cudf"),
            "cupy": metadata.version("cupy"),
            "pyarrow": metadata.version("pyarrow"),
            "numpy": metadata.version("numpy"),
            "gpu": cp.cuda.runtime.getDeviceProperties(0)["name"].decode(errors="replace"),
        },
        "writesPerformed": ["run-scoped benchmark receipt only"],
        "productionMutation": False,
    }
    args.output_dir.mkdir(parents=True, exist_ok=False)
    receipt_path = args.output_dir / "receipt.json"
    receipt = dict(result_body)
    receipt["receiptSha256"] = sha256(canonical(result_body))
    with receipt_path.open("xb") as stream:
        stream.write(json.dumps(receipt, indent=2, ensure_ascii=False).encode() + b"\n")
    print(json.dumps({"status": receipt["status"], "receipt": str(receipt_path), "receiptSha256": receipt["receiptSha256"], "rows": table.num_rows, "cpuMedianMs": receipt["performance"]["cpuMedianMs"], "gpuMedianMs": receipt["performance"]["gpuMedianMs"], "peakGpuMemoryMeasured": receipt["performance"]["peakGpuMemoryMeasured"], "peakGpuMemoryDeltaMiB": (gpu_memory_receipt["peak_delta_bytes"] or 0) / (1024 * 1024), "parity": receipt["output"]["parity"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
