from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from atlas_graph_runtime.gnn_fixtures import fixture_gnn_input_v1, fixture_gnn_models_v1
from atlas_graph_runtime.gnn_reference import compare_gnn_outputs_v1, run_gnn_v1


def stable_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def gpu_memory_snapshot() -> dict[str, str | int]:
    executable = shutil.which("nvidia-smi")
    if executable is None and Path("/usr/lib/wsl/lib/nvidia-smi").is_file():
        executable = "/usr/lib/wsl/lib/nvidia-smi"
    if executable is None:
        raise RuntimeError("GNN_GPU_PREFLIGHT_NVIDIA_SMI_UNAVAILABLE")
    result = subprocess.run(
        [executable, "--query-gpu=name,memory.total,memory.used", "--format=csv,noheader,nounits"],
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
    )
    rows = list(csv.reader(io.StringIO(result.stdout)))
    if len(rows) != 1 or len(rows[0]) != 3:
        raise RuntimeError("GNN_GPU_PREFLIGHT_DEVICE_COUNT_UNSUPPORTED")
    name, total_text, used_text = (part.strip() for part in rows[0])
    total = int(total_text)
    used = int(used_text)
    return {"deviceName": name, "totalMemoryMiB": total, "usedMemoryMiB": used, "freeMemoryMiB": total - used}


def llama_slots_idle(url: str) -> tuple[bool, str]:
    request = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, TimeoutError, urllib.error.URLError, UnicodeDecodeError, json.JSONDecodeError):
        return False, "GPU_SLOT_STATUS_UNAVAILABLE"
    if not isinstance(payload, list) or not payload or any(
        not isinstance(slot, dict) or not isinstance(slot.get("is_processing"), bool)
        for slot in payload
    ):
        return False, "GPU_SLOT_STATUS_INVALID"
    if any(slot["is_processing"] for slot in payload):
        return False, "GPU_SLOT_BUSY"
    return True, "GPU_SLOT_IDLE"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute-gpu", action="store_true")
    parser.add_argument("--operator-approved-idle", action="store_true")
    parser.add_argument("--minimum-free-mib", type=int, default=4096)
    parser.add_argument("--llama-slots-url", default=os.environ.get("ATLAS_LLAMA_SLOTS_URL"))
    args = parser.parse_args()
    if not args.execute_gpu or not args.operator_approved_idle:
        print(json.dumps({
            "status": "GPU_EXECUTION_NOT_AUTHORIZED",
            "requiredFlags": ["--execute-gpu", "--operator-approved-idle"],
            "gpuWorkStarted": False,
            "writesPerformed": False,
        }, indent=2))
        return 2
    if args.minimum_free_mib < 1:
        raise ValueError("GNN_GPU_PREFLIGHT_MINIMUM_FREE_MIB_INVALID")
    if not args.llama_slots_url:
        print(json.dumps({
            "status": "GPU_SLOT_STATUS_URL_REQUIRED",
            "gpuWorkStarted": False,
            "writesPerformed": False,
        }, indent=2))
        return 4
    slots_idle, slot_status = llama_slots_idle(args.llama_slots_url)
    if not slots_idle:
        print(json.dumps({
            "status": slot_status,
            "gpuWorkStarted": False,
            "writesPerformed": False,
        }, indent=2))
        return 4

    before = gpu_memory_snapshot()
    if before["freeMemoryMiB"] < args.minimum_free_mib:
        print(json.dumps({
            "status": "GPU_EXECUTION_BLOCKED_MEMORY_PRESSURE",
            "gpuMemory": before,
            "minimumFreeMemoryMiB": args.minimum_free_mib,
            "gpuWorkStarted": False,
            "writesPerformed": False,
        }, indent=2))
        return 3

    import torch

    if not torch.cuda.is_available():
        raise RuntimeError("GNN_CUDA_UNAVAILABLE")
    torch.cuda.init()
    free_bytes, total_bytes = torch.cuda.mem_get_info()
    free_mib = free_bytes // (1024 * 1024)
    if free_mib < args.minimum_free_mib:
        print(json.dumps({
            "status": "GPU_EXECUTION_BLOCKED_TORCH_MEMORY_PRESSURE",
            "gpuMemory": before,
            "torchFreeMemoryMiB": free_mib,
            "minimumFreeMemoryMiB": args.minimum_free_mib,
            "gpuWorkStarted": False,
            "writesPerformed": False,
        }, indent=2))
        return 3

    graph_input = fixture_gnn_input_v1()
    results = []
    for model in fixture_gnn_models_v1():
        cpu_output, cpu_receipt = run_gnn_v1(graph_input, model, backend="networkx_torch_cpu")
        gpu_output, gpu_receipt = run_gnn_v1(graph_input, model, backend="networkx_torch_cuda")
        parity = compare_gnn_outputs_v1(cpu_output, gpu_output, tolerance=1e-5)
        results.append({
            "architecture": model.architecture,
            "modelRevision": model.model_revision,
            "modelChecksum": model.model_checksum(),
            "cpuReceipt": cpu_receipt.to_dict(),
            "gpuReceipt": gpu_receipt.to_dict(),
            "cpuOutput": [[ordinal, list(cpu_output[ordinal])] for ordinal in graph_input.node_ordinals],
            "gpuOutput": [[ordinal, list(gpu_output[ordinal])] for ordinal in graph_input.node_ordinals],
            "parity": parity,
        })
        if not parity["parity"]:
            raise RuntimeError(f"GNN_CPU_GPU_PARITY_FAILED:{model.architecture}:{parity['maxAbsoluteError']}")

    after = gpu_memory_snapshot()
    report = {
        "schema": "atlas.networkx-gnn-gpu-parity-proof.v1",
        "status": "CPU_GPU_FIXTURE_PARITY_PROVEN",
        "proofLevel": "GPU_FIXTURE_ONLY",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "input": graph_input.canonical_payload(),
        "inputChecksum": graph_input.input_checksum(),
        "minimumFreeMemoryMiB": args.minimum_free_mib,
        "operatorApprovedIdle": True,
        "gpuMemoryBefore": before,
        "gpuMemoryAfter": after,
        "torchVersion": torch.__version__,
        "cudaVersion": torch.version.cuda,
        "device": torch.cuda.get_device_name(0),
        "architectures": results,
        "parentAtlasEvidence": {
            "candidateSnapshotRevision": None,
            "workspaceRevision": None,
            "graphRevision": None,
            "canonicalPayload": None,
            "canonicalPayloadStatus": "UNAVAILABLE_NO_ADMITTED_PARENT_ATLAS_COHORT",
            "acePacketV3": None,
            "contextManifestV2": None,
            "topologyCoordinates": None,
            "topologyCoordinatesStatus": "UNAVAILABLE_NO_ADMITTED_TOPOLOGY_REPRESENTATION",
        },
        "fixtureOnly": True,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "persistentStoreWrites": {"postgres": 0, "neo4j": 0, "qdrant": 0, "valkey": 0, "graphify": 0},
    }
    report["receiptChecksum"] = sha256_bytes(stable_json(report))
    output_dir = ROOT / ".tmp" / "atlas"
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output_path = output_dir / f"networkx-gnn-gpu-parity-v1-{stamp}.json"
    output_path.write_bytes(stable_json(report) + b"\n")
    readback = json.loads(output_path.read_text(encoding="utf-8"))
    checksum = readback.pop("receiptChecksum")
    if checksum != sha256_bytes(stable_json(readback)):
        raise RuntimeError("GNN_GPU_PROOF_RECEIPT_READBACK_MISMATCH")
    print(json.dumps({
        "status": report["status"],
        "receipt": str(output_path.relative_to(ROOT)),
        "receiptChecksum": checksum,
        "independentReadback": "MATCH",
        "architectures": [item["architecture"] for item in results],
        "maxAbsoluteErrors": {item["architecture"]: item["parity"]["maxAbsoluteError"] for item in results},
        "parentAtlasPayload": report["parentAtlasEvidence"]["canonicalPayloadStatus"],
        "topologyCoordinates": report["parentAtlasEvidence"]["topologyCoordinatesStatus"],
        "writesPerformed": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
