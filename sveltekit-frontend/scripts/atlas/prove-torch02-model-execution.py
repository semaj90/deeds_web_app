#!/usr/bin/env python3
"""TORCH-02 model execution proof over the frozen TORCH-03 [C,25] fixture.

This is deliberately a deterministic 25->1 linear parity probe, not a production
reranker. It proves that the exact same feature bytes and exact same model state
can be executed by PyTorch CPU and PyTorch CUDA under a revision-qualified
manifest/receipt contract.

No database, Qdrant, Valkey, graph, or SearchRuntime writes are performed.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn

EXECUTION_REVISION = "atlas.torch-model-execution.manifest-receipt-v1"
MODEL_ID = "atlas/torch02-linear-probe"
MODEL_REVISION = "atlas/torch02-linear-probe.v1"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def stable_digest(value: Any) -> str:
    return sha256(stable_json(value).encode("utf-8"))


def f32le_bytes(values: np.ndarray) -> bytes:
    return np.asarray(values, dtype="<f4").tobytes(order="C")


def load_fixture(path: Path) -> tuple[dict[str, Any], np.ndarray]:
    fixture = json.loads(path.read_text(encoding="utf-8"))
    if fixture.get("fixtureSchema") != "atlas.torch-feature-tensor-fixture.v1":
        raise RuntimeError("TORCH02_FIXTURE_SCHEMA_MISMATCH")
    if fixture.get("dtype") != "float32" or fixture.get("byteOrder") != "little-endian":
        raise RuntimeError("TORCH02_FIXTURE_DTYPE_CONTRACT_MISMATCH")
    if fixture.get("layout") != "ROW_MAJOR_CONTIGUOUS":
        raise RuntimeError("TORCH02_FIXTURE_LAYOUT_MISMATCH")
    rows = int(fixture["rowCount"])
    cols = int(fixture["columnCount"])
    if cols != 25:
        raise RuntimeError(f"TORCH02_EXPECTED_25_COLUMNS:{cols}")

    raw = base64.b64decode(fixture["featureBytesBase64"], validate=True)
    if sha256(raw) != fixture["featureBytesSha256"]:
        raise RuntimeError("TORCH02_FEATURE_BYTES_CHECKSUM_MISMATCH")
    if len(raw) != rows * cols * 4:
        raise RuntimeError("TORCH02_FEATURE_BYTE_LENGTH_MISMATCH")
    array = np.frombuffer(raw, dtype="<f4").reshape(rows, cols).copy(order="C")
    if not np.isfinite(array).all():
        raise RuntimeError("TORCH02_NON_FINITE_INPUT")
    return fixture, array


class LinearProbe(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.linear = nn.Linear(25, 1, bias=True)
        with torch.no_grad():
            weights = torch.arange(1, 26, dtype=torch.float32).reshape(1, 25) / 100.0
            self.linear.weight.copy_(weights)
            self.linear.bias.fill_(0.125)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.linear(x)


def serialize_state_dict(model: nn.Module) -> tuple[bytes, str]:
    buf = io.BytesIO()
    torch.save(model.state_dict(), buf)
    raw = buf.getvalue()
    return raw, sha256(raw)


def build_manifest(
    fixture: dict[str, Any],
    model_sha: str,
    requested_executor: str,
    executor_revision: str,
    atol: float,
    rtol: float,
) -> dict[str, Any]:
    return {
        "schema": "atlas.torch-model-execution.v1",
        "executionRevision": EXECUTION_REVISION,
        "modelId": MODEL_ID,
        "modelRevision": MODEL_REVISION,
        "modelArtifactSha256": model_sha,
        "modelFormat": "PYTORCH_STATE_DICT",
        "modelRole": "parity_probe",
        "inputTensorSchema": fixture["schema"],
        "inputTensorRevision": fixture["tensorRevision"],
        "inputFeatureBytesSha256": fixture["featureBytesSha256"],
        "inputRowKeysSha256": fixture["rowKeysSha256"],
        "inputRowCount": int(fixture["rowCount"]),
        "inputColumnCount": int(fixture["columnCount"]),
        "inputFeatureRevision": fixture["featureRevision"],
        "inputWorkspaceRevision": fixture["workspaceRevision"],
        "inputRepresentationRevision": fixture["representationRevision"],
        "requestedExecutor": requested_executor,
        "executorRevision": executor_revision,
        "outputRole": "score_per_row",
        "outputWidth": 1,
        "numericPolicy": {
            "inputDtype": "float32",
            "outputDtype": "float32",
            "requireFinite": True,
            "atol": atol,
            "rtol": rtol,
        },
        "evidenceAuthority": False,
        "canonicalOwnerChanged": False,
        "logicalLaneVoteAdded": False,
    }


def make_receipt(
    manifest: dict[str, Any],
    *,
    actual_executor: str,
    status: str,
    block_reason: str | None,
    output: np.ndarray | None,
    reference_receipt_sha: str | None,
    max_delta: float | None,
    within_tolerance: bool | None,
) -> dict[str, Any]:
    output_sha = sha256(f32le_bytes(output)) if output is not None else None
    outputs_finite = bool(output is not None and np.isfinite(output).all())
    output_count = int(output.size) if output is not None else 0
    preimage = {
        "schema": "atlas.torch-model-execution-receipt.v1",
        "executionRevision": EXECUTION_REVISION,
        "manifestSha256": stable_digest(manifest),
        "modelId": manifest["modelId"],
        "modelRevision": manifest["modelRevision"],
        "modelArtifactSha256": manifest["modelArtifactSha256"],
        "modelRole": manifest["modelRole"],
        "inputTensorRevision": manifest["inputTensorRevision"],
        "inputFeatureBytesSha256": manifest["inputFeatureBytesSha256"],
        "inputRowKeysSha256": manifest["inputRowKeysSha256"],
        "inputRowCount": manifest["inputRowCount"],
        "requestedExecutor": manifest["requestedExecutor"],
        "actualExecutor": actual_executor,
        "executorRevision": manifest["executorRevision"],
        "status": status,
        "blockReason": block_reason,
        "outputRole": manifest["outputRole"],
        "outputWidth": manifest["outputWidth"],
        "outputCount": output_count,
        "outputBytesSha256": output_sha,
        "outputsFinite": outputs_finite,
        "referenceReceiptSha256": reference_receipt_sha,
        "maxAbsoluteDeltaVsReference": max_delta,
        "withinTolerance": within_tolerance,
        "atol": manifest["numericPolicy"]["atol"],
        "rtol": manifest["numericPolicy"]["rtol"],
        "evidenceAuthority": False,
        "canonicalOwnerChanged": False,
        "logicalLaneVoteAdded": False,
    }
    return {**preimage, "receiptSha256": stable_digest(preimage)}


def execute(model: nn.Module, features: np.ndarray, device: torch.device) -> np.ndarray:
    model = model.to(device).eval()
    tensor = torch.from_numpy(features).to(device=device, dtype=torch.float32)
    with torch.no_grad():
        out = model(tensor).detach().to("cpu", dtype=torch.float32).contiguous().numpy()
    if out.shape != (features.shape[0], 1):
        raise RuntimeError(f"TORCH02_OUTPUT_SHAPE_MISMATCH:{out.shape}")
    if not np.isfinite(out).all():
        raise RuntimeError("TORCH02_NON_FINITE_OUTPUT")
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("docs/reports/torch02-model-execution-proof.json"))
    parser.add_argument("--atol", type=float, default=1e-6)
    parser.add_argument("--rtol", type=float, default=1e-5)
    parser.add_argument("--require-cuda", action="store_true")
    args = parser.parse_args()

    fixture, features = load_fixture(args.fixture)
    base_model = LinearProbe().eval()
    state_bytes, model_sha = serialize_state_dict(base_model)

    # Reload from the exact serialized artifact so both executors use the same bytes.
    cpu_model = LinearProbe()
    cpu_model.load_state_dict(torch.load(io.BytesIO(state_bytes), map_location="cpu", weights_only=True))
    cpu_manifest = build_manifest(
        fixture, model_sha, "PYTORCH_CPU", f"torch:{torch.__version__}:cpu", args.atol, args.rtol
    )
    cpu_output = execute(cpu_model, features, torch.device("cpu"))
    cpu_receipt = make_receipt(
        cpu_manifest,
        actual_executor="PYTORCH_CPU",
        status="SUCCESS",
        block_reason=None,
        output=cpu_output,
        reference_receipt_sha=None,
        max_delta=None,
        within_tolerance=None,
    )

    cuda_available = bool(torch.cuda.is_available())
    if cuda_available:
        cuda_model = LinearProbe()
        cuda_model.load_state_dict(torch.load(io.BytesIO(state_bytes), map_location="cpu", weights_only=True))
        cuda_manifest = build_manifest(
            fixture, model_sha, "PYTORCH_CUDA", f"torch:{torch.__version__}:cuda:{torch.version.cuda}", args.atol, args.rtol
        )
        cuda_output = execute(cuda_model, features, torch.device("cuda"))
        max_delta = float(np.max(np.abs(cpu_output - cuda_output))) if cpu_output.size else 0.0
        within = bool(np.allclose(cpu_output, cuda_output, atol=args.atol, rtol=args.rtol))
        cuda_receipt = make_receipt(
            cuda_manifest,
            actual_executor="PYTORCH_CUDA",
            status="SUCCESS",
            block_reason=None,
            output=cuda_output,
            reference_receipt_sha=cpu_receipt["receiptSha256"],
            max_delta=max_delta,
            within_tolerance=within,
        )
    else:
        cuda_manifest = build_manifest(
            fixture, model_sha, "PYTORCH_CUDA", f"torch:{torch.__version__}:cuda:unavailable", args.atol, args.rtol
        )
        cuda_output = None
        cuda_receipt = make_receipt(
            cuda_manifest,
            actual_executor="BLOCKED",
            status="BLOCKED",
            block_reason="CAPABILITY_NOT_PRESENT:PYTORCH_CUDA",
            output=None,
            reference_receipt_sha=cpu_receipt["receiptSha256"],
            max_delta=None,
            within_tolerance=None,
        )

    result = {
        "schema": "atlas.torch02-model-execution-proof.v1",
        "fixture": str(args.fixture),
        "fixtureFeatureBytesSha256": fixture["featureBytesSha256"],
        "fixtureRowKeysSha256": fixture["rowKeysSha256"],
        "modelId": MODEL_ID,
        "modelRevision": MODEL_REVISION,
        "modelArtifactSha256": model_sha,
        "modelRole": "parity_probe",
        "torchVersion": torch.__version__,
        "cudaAvailable": cuda_available,
        "cudaRuntimeVersion": torch.version.cuda,
        "cpuManifest": cpu_manifest,
        "cpuReceipt": cpu_receipt,
        "cudaManifest": cuda_manifest,
        "cudaReceipt": cuda_receipt,
        "status": (
            "TORCH02_PYTORCH_CPU_CUDA_PARITY_PROVEN"
            if cuda_receipt["status"] == "SUCCESS" and cuda_receipt["withinTolerance"]
            else "TORCH02_PYTORCH_CPU_PROVEN_CUDA_BLOCKED"
            if cuda_receipt["status"] == "BLOCKED"
            else "TORCH02_PYTORCH_CPU_CUDA_PARITY_FAILED"
        ),
        "canonicalOwnerChanged": False,
        "logicalLaneVoteAdded": False,
        "writesPerformed": False,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))

    if args.require_cuda and not cuda_available:
        return 2
    if cuda_receipt["status"] == "SUCCESS" and not cuda_receipt["withinTolerance"]:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
