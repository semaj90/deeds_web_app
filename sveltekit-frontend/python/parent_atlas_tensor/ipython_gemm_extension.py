from __future__ import annotations

"""IPython extension exposing Parent Atlas GEMM probes to persistent RLM sessions.

Usage:
    %load_ext parent_atlas_tensor.ipython_gemm_extension
    %atlas_cuda
    %atlas_gemm 1024 1024 1024 --repeats 5

This extension is intentionally read-only. It emits benchmark/attestation
receipts into the interactive namespace but never authorizes mutation.
"""

import argparse
import json
import shlex
from typing import Any

from IPython.core.magic import Magics, line_magic, magics_class

from .gemm_primitives import cuda_attestation, run_gemm_suite


@magics_class
class ParentAtlasGemmMagics(Magics):
    @line_magic
    def atlas_cuda(self, line: str = "") -> dict[str, Any]:
        receipt = {
            "schema": "atlas.rtx-cuda-attestation.v1",
            "cuda": cuda_attestation(),
            "canonicalWritesAllowed": False,
        }
        self.shell.user_ns["atlas_cuda_receipt"] = receipt
        print(json.dumps(receipt, indent=2, allow_nan=False))
        return receipt

    @line_magic
    def atlas_gemm(self, line: str = "") -> dict[str, Any]:
        parser = argparse.ArgumentParser(prog="%atlas_gemm", add_help=False)
        parser.add_argument("m", nargs="?", type=int, default=1024)
        parser.add_argument("n", nargs="?", type=int, default=1024)
        parser.add_argument("k", nargs="?", type=int, default=1024)
        parser.add_argument("--seed", type=lambda value: int(value, 0), default=0xA71A5)
        parser.add_argument("--warmup", type=int, default=3)
        parser.add_argument("--repeats", type=int, default=7)
        parser.add_argument("--require-cuda", action="store_true")
        args = parser.parse_args(shlex.split(line))

        receipt = run_gemm_suite(
            m=args.m,
            n=args.n,
            k=args.k,
            seed=args.seed,
            warmup=args.warmup,
            repeats=args.repeats,
            require_cuda=args.require_cuda,
            producer_revision="parent-atlas-ipython-gemm.v1",
        )
        self.shell.user_ns["atlas_gemm_receipt"] = receipt
        print(json.dumps(receipt, indent=2, allow_nan=False))
        return receipt


def load_ipython_extension(ipython: Any) -> None:
    ipython.register_magics(ParentAtlasGemmMagics)


def unload_ipython_extension(ipython: Any) -> None:
    # IPython does not expose a stable public API for surgically removing one
    # registered Magics class across all supported versions. The extension is
    # side-effect-light; unloading is therefore intentionally a no-op.
    return None
