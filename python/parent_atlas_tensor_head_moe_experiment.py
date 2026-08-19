#!/usr/bin/env python3
"""Parent Atlas shadow MoE/tensor-head experiment.

This is NOT a canonical routing owner. It consumes already-versioned feature rows
and produces a shadow route/receipt for comparison against deterministic policy.

Goals:
- readable PyTorch reference first;
- optional torch.compile;
- optional torch.library.triton_op for a tiny fused scoring helper;
- non-reentrant activation checkpointing for training experiments;
- no canonical writes, no identity minting, no retrieval vote creation.

Current PyTorch docs recommend ordinary Triton kernels first and triton_op only
when built-in-like subsystem composability is needed. Keep the Triton path
optional and parity-check it against the PyTorch reference.
"""
from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
from torch import nn
from torch.utils.checkpoint import checkpoint

try:
    import triton
    import triton.language as tl
    from torch.library import triton_op, wrap_triton
    TRITON_AVAILABLE = True
except Exception:
    triton = None
    tl = None
    triton_op = None
    wrap_triton = None
    TRITON_AVAILABLE = False


@dataclass(frozen=True)
class ExperimentConfig:
    input_dim: int = 16
    hidden_dim: int = 64
    expert_count: int = 4
    top_k: int = 2
    checkpoint_experts: bool = True
    compile_model: bool = False
    use_triton_router: bool = False
    seed: int = 0xA71A5


if TRITON_AVAILABLE:
    @triton.jit
    def _affinity_kernel(x_ptr, w_ptr, out_ptr, n_elements: tl.constexpr, BLOCK: tl.constexpr):
        offsets = tl.arange(0, BLOCK)
        mask = offsets < n_elements
        x = tl.load(x_ptr + offsets, mask=mask, other=0.0).to(tl.float32)
        w = tl.load(w_ptr + offsets, mask=mask, other=0.0).to(tl.float32)
        score = tl.sum(x * w, axis=0)
        # One Triton program instance computes one scalar reduction.
        tl.store(out_ptr, score)

    @triton_op("parent_atlas::feature_affinity", mutates_args={})
    def feature_affinity(x: torch.Tensor, w: torch.Tensor) -> torch.Tensor:
        if x.ndim != 1 or w.ndim != 1 or x.numel() != w.numel():
            raise ValueError("feature_affinity expects same-length 1D tensors")
        out = torch.empty((), device=x.device, dtype=torch.float32)
        block = triton.next_power_of_2(x.numel())
        wrap_triton(_affinity_kernel)[(1,)](x, w, out, n_elements=x.numel(), BLOCK=block)
        return out
else:
    def feature_affinity(x: torch.Tensor, w: torch.Tensor) -> torch.Tensor:
        return (x.float() * w.float()).sum()


class Expert(nn.Module):
    def __init__(self, dim: int, hidden: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(dim, hidden),
            nn.GELU(),
            nn.Linear(hidden, dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class AtlasShadowMoE(nn.Module):
    def __init__(self, cfg: ExperimentConfig):
        super().__init__()
        self.cfg = cfg
        self.router = nn.Linear(cfg.input_dim, cfg.expert_count, bias=True)
        self.experts = nn.ModuleList([Expert(cfg.input_dim, cfg.hidden_dim) for _ in range(cfg.expert_count)])
        self.head = nn.Linear(cfg.input_dim, 1)

    def _expert_forward(self, expert: nn.Module, x: torch.Tensor) -> torch.Tensor:
        if not self.training or not self.cfg.checkpoint_experts:
            return expert(x)
        # Current PyTorch recommends use_reentrant=False. Routing is computed
        # outside the checkpointed expert call so recomputation sees identical
        # expert assignments and does not read mutable global policy state.
        return checkpoint(expert, x, use_reentrant=False, determinism_check="default")

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
        logits = self.router(x)
        top_values, top_indices = torch.topk(logits, k=min(self.cfg.top_k, self.cfg.expert_count), dim=-1)
        weights = torch.softmax(top_values, dim=-1)
        combined = torch.zeros_like(x)
        for slot in range(top_indices.shape[-1]):
            ids = top_indices[:, slot]
            slot_weight = weights[:, slot].unsqueeze(-1)
            slot_out = torch.zeros_like(x)
            for expert_id, expert in enumerate(self.experts):
                mask = ids == expert_id
                if mask.any():
                    slot_out[mask] = self._expert_forward(expert, x[mask])
            combined = combined + slot_weight * slot_out
        score = torch.sigmoid(self.head(combined)).squeeze(-1)
        return score, {"router_logits": logits, "top_indices": top_indices, "top_weights": weights}


def deterministic_fixture(rows: int, dim: int, seed: int, device: torch.device) -> torch.Tensor:
    g = torch.Generator(device="cpu")
    g.manual_seed(seed)
    x = torch.randn(rows, dim, generator=g, dtype=torch.float32)
    return x.to(device)


def run(cfg: ExperimentConfig, rows: int, device: str) -> dict[str, Any]:
    torch.manual_seed(cfg.seed)
    dev = torch.device(device if device == "cpu" or torch.cuda.is_available() else "cpu")
    model: nn.Module = AtlasShadowMoE(cfg).to(dev)
    model.train()
    if cfg.compile_model:
        model = torch.compile(model, dynamic=True)

    x = deterministic_fixture(rows, cfg.input_dim, cfg.seed, dev).requires_grad_(True)
    score, aux = model(x)
    target = torch.linspace(0.1, 0.9, rows, device=dev)
    loss = torch.nn.functional.mse_loss(score, target)
    loss.backward()

    route_counts = torch.bincount(aux["top_indices"].reshape(-1).detach().cpu(), minlength=cfg.expert_count)
    grad_norm = math.sqrt(sum(float((p.grad.detach().float() ** 2).sum().cpu()) for p in model.parameters() if p.grad is not None))
    return {
        "schema": "atlas.tensor-head-moe-experiment-report.v1",
        "status": "SHADOW_ONLY",
        "torchVersion": torch.__version__,
        "cudaVersion": torch.version.cuda,
        "device": str(dev),
        "gpu": torch.cuda.get_device_name(dev) if dev.type == "cuda" else None,
        "config": cfg.__dict__,
        "rows": rows,
        "loss": float(loss.detach().cpu()),
        "gradNorm": grad_norm,
        "expertRouteCounts": route_counts.tolist(),
        "topIndices": aux["top_indices"].detach().cpu().tolist(),
        "topWeights": aux["top_weights"].detach().cpu().tolist(),
        "tritonAvailable": TRITON_AVAILABLE,
        "canonicalWrites": False,
        "notes": [
            "MoE route is shadow evidence only; deterministic Parent Atlas routing remains authoritative.",
            "Hypergraph/n-ary relations, AST, ontology, PageRank, POS, domain and semantic_768 are input features, not replaced by experts.",
            "Geometry experiments must be supplied as explicit feature columns; no unexplained constants route experts.",
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=32)
    ap.add_argument("--dim", type=int, default=16)
    ap.add_argument("--experts", type=int, default=4)
    ap.add_argument("--top-k", type=int, default=2)
    ap.add_argument("--hidden", type=int, default=64)
    ap.add_argument("--device", choices=["cpu", "cuda"], default="cuda")
    ap.add_argument("--compile", action="store_true")
    ap.add_argument("--no-checkpoint", action="store_true")
    ap.add_argument("--json-out", type=Path)
    args = ap.parse_args()

    cfg = ExperimentConfig(
        input_dim=args.dim,
        hidden_dim=args.hidden,
        expert_count=args.experts,
        top_k=args.top_k,
        checkpoint_experts=not args.no_checkpoint,
        compile_model=args.compile,
    )
    report = run(cfg, args.rows, args.device)
    payload = json.dumps(report, indent=2, sort_keys=True)
    if args.json_out:
        args.json_out.write_text(payload + "\n", encoding="utf-8")
    print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
