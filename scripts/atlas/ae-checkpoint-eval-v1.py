#!/usr/bin/env python3
"""Checkpoint-faithful, read-only, CPU-only evaluation of a nested semantic autoencoder.

CANONICAL architecture (operator decision 2026-10-19): the CURRENT NestedSemanticAutoencoder in
python/atlas_compute/latent_autoencoder.py (768 -> 512 -> 256 -> 128; latent_128 is a separately
learned bottleneck; latent_64 is the renormalized 64-prefix of latent_128). Use --arch current
(default) with a checkpoint trained by python/train_latent_autoencoder.py.

--arch legacy-v3 reconstructs the 2026-08-29 3-tier model (commit 0cddd29d39: 768 -> 384 -> 256,
latent_128/64 are renormalized prefixes of latent_256) ONLY to diagnose the historical
nested_semantic_autoencoder_v3_full01.pt, whose 55,169 latent rows predate the canonical design.

Metrics: tie-aware recall@10 (hit = exact cosine >= 10th-best - 1e-6, per the corpus's
duplicate-chunk behaviour), set-overlap recall@10, MRR of the exact top-1, and reconstruction
cosine, each against exact 768-d cosine and same-dimension MRL-prefix baselines.

Safety: reads files only, forces CPU, writes nothing unless --out is given (JSON receipt),
touches no database, service or GPU. Result is DIAGNOSTIC (canonicalAuthority:false); a frozen
matrix without per-row source/workspace/representation revisions cannot support promotion.

Usage (from any directory; use an interpreter that has torch, e.g. `py -3.13`):
  py -3.13 scripts/atlas/ae-checkpoint-eval-v1.py --arch legacy-v3 \
      --checkpoint models/nested-semantic-autoencoder/nested_semantic_autoencoder_v3_full01.pt
  py -3.13 scripts/atlas/ae-checkpoint-eval-v1.py --arch current --checkpoint <ckpt.pt>
  py -3.13 scripts/atlas/ae-checkpoint-eval-v1.py --arch current --untrained-smoke   # code path only
"""
from __future__ import annotations

import os

os.environ["CUDA_VISIBLE_DEVICES"] = ""  # CPU only: the 8 GiB GPU is held by the Ornith server

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

DEFAULT_MATRIX = ROOT / "docs" / "reports" / "semantic768" / "frozen_semantic_768_v4_matrix.f32bin"
DEFAULT_MATRIX_SHA = "bd36c163938a661f9c0b3f68dd1a0eb7e576405268ebe9c2221df689697441b0"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class LegacyV3AE(nn.Module):
    """2026-08-29 architecture (git 0cddd29d39). Diagnostic only; not canonical."""

    def __init__(self) -> None:
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(768, 384), nn.GELU(), nn.Linear(384, 256), nn.LayerNorm(256)
        )
        self.decoder256 = nn.Sequential(nn.Linear(256, 384), nn.GELU(), nn.Linear(384, 768))
        self.decoder128 = nn.Sequential(nn.Linear(128, 384), nn.GELU(), nn.Linear(384, 768))
        self.decoder64 = nn.Sequential(nn.Linear(64, 384), nn.GELU(), nn.Linear(384, 768))

    def encode(self, x: torch.Tensor):
        l256 = F.normalize(self.encoder(x), p=2, dim=-1)
        l128 = F.normalize(l256[:, :128], p=2, dim=-1)
        l64 = F.normalize(l128[:, :64], p=2, dim=-1)
        return l256, l128, l64

    def decode256(self, z): return F.normalize(self.decoder256(z), p=2, dim=-1)
    def decode128(self, z): return F.normalize(self.decoder128(z), p=2, dim=-1)
    def decode64(self, z): return F.normalize(self.decoder64(z), p=2, dim=-1)


def build_model(arch: str) -> nn.Module:
    if arch == "legacy-v3":
        return LegacyV3AE()
    from atlas_compute.latent_autoencoder import NestedSemanticAutoencoder  # canonical

    return NestedSemanticAutoencoder()


def load_matrix(path: Path, expected_sha: str | None) -> tuple[torch.Tensor, dict]:
    info: dict = {"path": str(path), "sha256": sha256_file(path)}
    if expected_sha:
        info["sha256Matches"] = info["sha256"] == expected_sha
        if not info["sha256Matches"]:
            raise SystemExit(f"MATRIX_CHECKSUM_MISMATCH: {info['sha256']} != {expected_sha}")
    raw = np.fromfile(path, dtype="<f4")
    if raw.size % 768:
        raise SystemExit(f"MATRIX_SHAPE_INVALID: {raw.size} floats is not a multiple of 768")
    info["rows"] = raw.size // 768
    return torch.from_numpy(raw.reshape(-1, 768).copy()), info


def evaluate(spaces: dict[str, torch.Tensor], xn: torch.Tensor, n_queries: int, seed: int) -> dict:
    gen = torch.Generator().manual_seed(seed)
    q = torch.randperm(len(xn), generator=gen)[:n_queries]
    rows = torch.arange(len(q))
    exact = xn[q] @ xn.T
    exact[rows, q] = -2.0  # exclude the query itself
    top_vals, top_idx = exact.topk(10, dim=1)
    kth = top_vals[:, -1]
    result: dict = {}
    for name, z in spaces.items():
        s = z[q] @ z.T
        s[rows, q] = -2.0
        got = s.topk(10, dim=1).indices
        overlap = tie = mrr = 0.0
        for i in range(len(q)):
            g = got[i]
            overlap += len(set(g.tolist()) & set(top_idx[i].tolist())) / 10
            tie += float((exact[i, g] >= kth[i] - 1e-6).float().mean())
            pos = (g == top_idx[i, 0]).nonzero()
            mrr += 1.0 / (1 + int(pos[0])) if len(pos) else 0.0
        n = len(q)
        result[name] = {
            "recall10_set_overlap": round(overlap / n, 4),
            "recall10_tie_aware": round(tie / n, 4),
            "mrr_of_exact_top1": round(mrr / n, 4),
        }
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--arch", choices=["current", "legacy-v3"], default="current")
    ap.add_argument("--checkpoint", type=Path, help="state_dict .pt matching --arch")
    ap.add_argument("--untrained-smoke", action="store_true", help="random-init model; checks the code path only")
    ap.add_argument("--matrix", type=Path, default=DEFAULT_MATRIX)
    ap.add_argument("--matrix-sha256", default=DEFAULT_MATRIX_SHA, help="'' disables the check")
    ap.add_argument("--queries", type=int, default=500)
    ap.add_argument("--seed", type=int, default=684453)
    ap.add_argument("--out", type=Path, help="optional JSON receipt path (the only write)")
    args = ap.parse_args()

    report: dict = {
        "schema": "atlas.ae-checkpoint-eval.v1",
        "arch": args.arch,
        "canonicalArch": args.arch == "current",
        "device": "cpu",
        "readOnly": True,
        "canonicalAuthority": False,
        "diagnosticOnly": True,
        "queryCohort": f"seeded random {args.queries}, self excluded; includes rows a model may have trained on (optimistic)",
        "promotionEligible": False,
        "promotionBlockedBy": "frozen matrix has no per-row source/workspace/representation revisions",
    }

    model = build_model(args.arch)
    if args.untrained_smoke:
        report["checkpoint"] = "UNTRAINED_RANDOM_INIT"
        report["warning"] = "metrics are meaningless; this only exercises the code path"
    else:
        if not args.checkpoint or not args.checkpoint.is_file():
            print(
                f"NO_CHECKPOINT: --arch {args.arch} needs --checkpoint. "
                "No checkpoint exists yet for the canonical (current) architecture; "
                "the 2026-08-29 v3 file is legacy-v3 only.",
                file=sys.stderr,
            )
            return 2
        report["checkpoint"] = {"path": str(args.checkpoint), "sha256": sha256_file(args.checkpoint)}
        state = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
        if isinstance(state, dict) and "state_dict" in state:
            state = state["state_dict"]
        try:
            model.load_state_dict(state, strict=True)
        except RuntimeError as err:
            print(f"CHECKPOINT_ARCHITECTURE_MISMATCH for --arch {args.arch}: {str(err)[:600]}", file=sys.stderr)
            return 3
    model.eval()

    x, matrix_info = load_matrix(args.matrix, args.matrix_sha256 or None)
    report["matrix"] = matrix_info
    xn = F.normalize(x, p=2, dim=-1)

    with torch.no_grad():
        parts = [model.encode(xn[i : i + 4096]) for i in range(0, len(xn), 4096)]
        l256, l128, l64 = (torch.cat([p[k] for p in parts]) for k in range(3))
        recon = {
            "256": F.normalize(model.decode256(l256), p=2, dim=-1),
            "128": F.normalize(model.decode128(l128), p=2, dim=-1),
            "64": F.normalize(model.decode64(l64), p=2, dim=-1),
        }
    report["reconstructionCosineMean"] = {k: round(float((v * xn).sum(-1).mean()), 4) for k, v in recon.items()}

    def mrl(k: int) -> torch.Tensor:
        return F.normalize(xn[:, :k], p=2, dim=-1)

    spaces = {
        "AE_latent_256": l256, "AE_latent_128": l128, "AE_latent_64": l64,
        "MRL_prefix_256": mrl(256), "MRL_prefix_128": mrl(128), "MRL_prefix_64": mrl(64),
    }
    report["queries"] = args.queries
    report["spaces"] = evaluate(spaces, xn, args.queries, args.seed)

    text = json.dumps(report, indent=1)
    print(text)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
