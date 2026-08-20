"""Guarded PyTorch grouped-GEMM experiment for explicitly proven MoE models.

This module does not infer model topology. Callers must supply a topology result
with architecture='moe'. The first proof intentionally uses the documented 3-D
grouped_mm form with equal tokens per expert. Jagged/offs routing is a separate
experiment because its boundary semantics should not be guessed from cumulative
lengths. This is a backend primitive check, not a claim that a local model is MoE.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import time
from typing import Any

import numpy as np

from .determinism import configure_torch_determinism
from .model_topology import ModelTopologyDetection


@dataclass(frozen=True)
class MoeGroupedMmReceipt:
    schema: str
    model_id: str
    num_experts: int
    top_k: int
    tokens_per_expert: int
    hidden_size: int
    output_size: int
    dtype: str
    device_name: str
    compute_capability: str
    eager_reference_ms: float
    grouped_mm_ms: float
    max_abs_error: float
    mean_abs_error: float
    passed_parity: bool
    output_checksum: str
    jagged_routing_tested: bool
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def run_grouped_mm_experiment(
    topology: ModelTopologyDetection,
    *,
    tokens_per_expert: int = 8,
    hidden_size: int | None = None,
    output_size: int = 256,
    seed: int = 0xA71A5,
) -> MoeGroupedMmReceipt:
    import torch
    import torch.nn.functional as F

    if topology.architecture != "moe" or not topology.num_experts or not topology.top_k:
        raise ValueError("grouped_mm experiment requires PROVEN_MOE topology")
    if not torch.cuda.is_available():
        raise RuntimeError("grouped_mm experiment requires CUDA")
    if tokens_per_expert <= 0:
        raise ValueError("tokens_per_expert must be positive")

    major, minor = torch.cuda.get_device_capability()
    if major < 8:
        raise RuntimeError(f"grouped_mm requires SM>=80; detected {major}.{minor}")
    if not hasattr(F, "grouped_mm"):
        raise RuntimeError("torch.nn.functional.grouped_mm is unavailable in this PyTorch build")

    configure_torch_determinism(seed=seed, matmul_mode="ieee")
    experts = topology.num_experts
    h = hidden_size or topology.hidden_size or 256
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    device = torch.device("cuda")
    dtype = torch.bfloat16

    # Documented 3-D form: first dimension enumerates groups and offs=None.
    x = torch.randn((experts, tokens_per_expert, h), device=device, dtype=dtype)
    weights = torch.randn((experts, h, output_size), device=device, dtype=dtype)

    torch.cuda.synchronize()
    start = time.perf_counter()
    reference = torch.stack([x[index] @ weights[index] for index in range(experts)], dim=0)
    torch.cuda.synchronize()
    reference_ms = (time.perf_counter() - start) * 1000.0

    torch.cuda.synchronize()
    start = time.perf_counter()
    output = F.grouped_mm(x, weights)
    torch.cuda.synchronize()
    grouped_ms = (time.perf_counter() - start) * 1000.0

    delta = (reference.float() - output.float()).abs()
    max_error = float(delta.max().cpu())
    mean_error = float(delta.mean().cpu())
    passed = bool(torch.allclose(reference.float(), output.float(), rtol=5e-2, atol=5e-2))
    checksum = hashlib.sha256(np.ascontiguousarray(output.float().cpu().numpy()).tobytes()).hexdigest()

    return MoeGroupedMmReceipt(
        schema="atlas.moe-grouped-mm-receipt.v1",
        model_id=topology.model_id,
        num_experts=experts,
        top_k=topology.top_k,
        tokens_per_expert=tokens_per_expert,
        hidden_size=h,
        output_size=output_size,
        dtype="bfloat16",
        device_name=torch.cuda.get_device_name(device),
        compute_capability=f"{major}.{minor}",
        eager_reference_ms=reference_ms,
        grouped_mm_ms=grouped_ms,
        max_abs_error=max_error,
        mean_abs_error=mean_error,
        passed_parity=passed,
        output_checksum=checksum,
        jagged_routing_tested=False,
        canonical_authority=False,
    )
