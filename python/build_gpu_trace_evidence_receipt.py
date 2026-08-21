#!/usr/bin/env python3
"""Build a conservative GPU execution evidence receipt from Nsight artifacts.

The builder never infers Tensor Core use from a kernel/API name alone. It only
sets tensor_core_used=True when Nsight Compute raw CSV contains a non-zero metric
whose metric name identifies a tensor/HMMA/MMA pipeline counter.
"""

from __future__ import annotations

import argparse
import csv
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
from typing import Any, Iterable


def file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def version_of(command: str) -> str:
    try:
        completed = subprocess.run([command, "--version"], check=False, capture_output=True, text=True, timeout=10)
        text = (completed.stdout or completed.stderr).strip()
        match = re.search(r"(?:version|Version)\s*([0-9][0-9A-Za-z_.+-]*)", text)
        return match.group(1) if match else (text.splitlines()[0][:120] if text else "unknown")
    except Exception:
        return "unknown"


def artifact(path: Path, role: str, artifact_id: str) -> dict[str, Any]:
    return {
        "artifact_id": artifact_id,
        "role": role,
        "relative_path": str(path),
        "sha256": file_sha256(path),
        "size_bytes": path.stat().st_size,
        "canonical_trace_artifact": role == "NSYS_REP",
    }


def iter_json_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from iter_json_strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from iter_json_strings(item)


def parse_blas_observations(path: Path | None, nvtx_range: str) -> list[dict[str, Any]]:
    if path is None or not path.exists():
        return []
    counts: dict[tuple[str, str], int] = {}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            record = json.loads(line)
            text = " ".join(iter_json_strings(record))
        except Exception:
            text = line
        for library, pattern in [
            ("CUBLASLT", r"\b(cublasLt[A-Za-z0-9_]+)\b"),
            ("CUBLAS", r"\b(cublas(?!Lt)[A-Za-z0-9_]+)\b"),
        ]:
            for api_name in re.findall(pattern, text, flags=re.IGNORECASE):
                if isinstance(api_name, tuple):
                    api_name = api_name[0]
                normalized = str(api_name)
                counts[(library, normalized)] = counts.get((library, normalized), 0) + 1
    return [
        {
            "library": library,
            "api_name": api_name,
            "call_count": call_count,
            "nvtx_range": nvtx_range,
            "input_type": None,
            "output_type": None,
            "compute_type": None,
            "algorithm": None,
            "source": "NSYS_CUBLAS_VERBOSE",
        }
        for (library, api_name), call_count in sorted(counts.items())
    ]


def _parse_number(value: str) -> float | None:
    cleaned = value.strip().replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_tensor_metrics(path: Path, nvtx_range: str) -> list[dict[str, Any]]:
    observations: list[dict[str, Any]] = []
    if not path.exists():
        return observations
    with path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        rows = list(csv.reader(handle))
    for row in rows:
        if not row:
            continue
        joined = " | ".join(row)
        lower = joined.lower()
        if not any(token in lower for token in ("tensor", "hmma", "imma", "mma")):
            continue
        numeric = None
        for cell in reversed(row):
            numeric = _parse_number(cell)
            if numeric is not None:
                break
        if numeric is None:
            continue
        metric_name = next((cell for cell in row if any(token in cell.lower() for token in ("tensor", "hmma", "imma", "mma"))), row[0])
        kernel = next((cell for cell in row if "kernel" in cell.lower()), "unknown-kernel")
        unit = next((cell for cell in row if cell in {"%", "percent", "cycle", "cycles", "inst", "instruction", "instructions"}), "raw")
        observations.append({
            "metric_name": metric_name.strip(),
            "metric_value": float(numeric),
            "metric_unit": unit,
            "kernel_name": kernel.strip() or "unknown-kernel",
            "nvtx_range": nvtx_range,
            "source": "NSIGHT_COMPUTE",
        })
    return observations


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture-receipt", required=True)
    parser.add_argument("--nsys-rep", required=True)
    parser.add_argument("--nsys-jsonlines")
    parser.add_argument("--nsys-sqlite")
    parser.add_argument("--ncu-rep", required=True)
    parser.add_argument("--ncu-csv", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--nsys-bin", default="nsys")
    parser.add_argument("--ncu-bin", default="ncu")
    args = parser.parse_args()

    fixture_receipt_path = Path(args.fixture_receipt).resolve()
    fixture = json.loads(fixture_receipt_path.read_text(encoding="utf-8"))
    root_range = "atlas.graph_fixture"
    artifacts = [
        artifact(Path(args.nsys_rep).resolve(), "NSYS_REP", "nsys-rep"),
        artifact(Path(args.ncu_rep).resolve(), "NCU_REP", "ncu-rep"),
        artifact(Path(args.ncu_csv).resolve(), "NCU_CSV", "ncu-csv"),
        artifact(fixture_receipt_path, "FIXTURE_RECEIPT", "fixture-receipt"),
    ]
    jsonlines_path = Path(args.nsys_jsonlines).resolve() if args.nsys_jsonlines else None
    if jsonlines_path and jsonlines_path.exists():
        artifacts.append(artifact(jsonlines_path, "NSYS_JSONLINES", "nsys-jsonlines"))
    if args.nsys_sqlite:
        sqlite_path = Path(args.nsys_sqlite).resolve()
        if sqlite_path.exists():
            artifacts.append(artifact(sqlite_path, "NSYS_SQLITE", "nsys-sqlite"))

    blas = parse_blas_observations(jsonlines_path, root_range)
    tensor_metrics = parse_tensor_metrics(Path(args.ncu_csv).resolve(), root_range)
    tensor_core_used = any(metric["metric_value"] > 0 for metric in tensor_metrics) if tensor_metrics else None
    libraries = {observation["library"] for observation in blas}
    if libraries == {"CUBLAS", "CUBLASLT"}:
        observed_backend = "CUBLAS_AND_CUBLASLT"
    elif "CUBLASLT" in libraries:
        observed_backend = "CUBLASLT"
    elif "CUBLAS" in libraries:
        observed_backend = "CUBLAS"
    else:
        observed_backend = "CUDA_ONLY"

    status = "TRACE_CAPTURED"
    if blas:
        status = "BLAS_API_OBSERVED"
    if tensor_metrics:
        status = "TENSOR_CORE_METRIC_OBSERVED"
    if blas and tensor_metrics:
        status = "VERIFIED"

    receipt = {
        "schema": "atlas.gpu-execution-evidence-receipt.v1",
        "receipt_id": f"gpu-trace:{fixture['workflow_id']}:{fixture['graph_revision']}:{fixture['fixture_checksum'][:16]}",
        "workflow_id": fixture["workflow_id"],
        "workflow_revision": fixture["workflow_revision"],
        "source_snapshot_revision": fixture["source_snapshot_revision"],
        "graph_revision": fixture["graph_revision"],
        "fixture_checksum": fixture["fixture_checksum"],
        "nvtx_domain": "parent-atlas",
        "nvtx_range": root_range,
        "requested_backend": "CUGRAPH_WITH_BLAS_TELEMETRY",
        "observed_backend": observed_backend,
        "precision_policy": "MIXED",
        "tensor_core_expectation": "OPTIONAL",
        "tensor_core_used": tensor_core_used,
        "nsys_version": version_of(args.nsys_bin),
        "ncu_version": version_of(args.ncu_bin),
        "cuda_version": fixture.get("cuda_version"),
        "cugraph_version": fixture.get("cugraph_version"),
        "device_name": fixture.get("gpu_memory_receipt", {}).get("device_name"),
        "compute_capability": None,
        "blas_api_observations": blas,
        "tensor_core_metrics": tensor_metrics,
        "artifacts": artifacts,
        "status": status,
        "canonical_authority": False,
        "producer_revision": "gpu-trace-evidence-builder-v1",
    }
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": status,
        "observed_backend": observed_backend,
        "tensor_core_used": tensor_core_used,
        "blas_api_observation_count": len(blas),
        "tensor_core_metric_count": len(tensor_metrics),
        "output": str(output),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
