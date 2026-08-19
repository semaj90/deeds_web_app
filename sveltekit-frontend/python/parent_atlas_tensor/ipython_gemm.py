from __future__ import annotations

"""IPython integration for Parent Atlas GEMM probes.

Usage inside a normal IPython / Prime Agent kernel:

    %load_ext parent_atlas_tensor.ipython_gemm
    receipt = %atlas_gemm --m 1024 --n 1024 --k 1024 --repeats 5
    receipt["summary"]

The magic returns the receipt object and optionally writes JSON to disk. It never
claims cuBLAS/cuBLASLt kernel dispatch proof; use the emitted NVTX ranges with an
external profiler when kernel-level attestation is required.
"""

import argparse
import json
from pathlib import Path
import shlex
from typing import Any

from .gemm_primitives import cuda_attestation, run_gemm_suite


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="%atlas_gemm", add_help=False)
    parser.add_argument("--m", type=int, default=1024)
    parser.add_argument("--n", type=int, default=1024)
    parser.add_argument("--k", type=int, default=1024)
    parser.add_argument("--seed", type=lambda value: int(value, 0), default=0xA71A5)
    parser.add_argument("--warmup", type=int, default=3)
    parser.add_argument("--repeats", type=int, default=7)
    parser.add_argument("--require-cuda", action="store_true")
    parser.add_argument("--output", type=str, default=None)
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--attest", action="store_true")
    parser.add_argument("-h", "--help", action="store_true")
    return parser


def _write_json(path: str, value: Any) -> str:
    target = Path(path).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return str(target)


def atlas_gemm_magic(line: str = "") -> dict[str, Any]:
    parser = _parser()
    args = parser.parse_args(shlex.split(line))
    if args.help:
        parser.print_help()
        return {"schema": "atlas.ipython-gemm-help.v1", "canonicalWritesAllowed": False}

    if args.attest:
        receipt: dict[str, Any] = {
            "schema": "atlas.rtx-cuda-attestation.v1",
            "cuda": cuda_attestation(),
            "canonicalWritesAllowed": False,
        }
    else:
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

    if args.output:
        receipt["ipythonOutputPath"] = _write_json(args.output, receipt)

    if not args.compact:
        print(json.dumps(receipt, indent=2, allow_nan=False))
    else:
        summary = receipt.get("summary", receipt.get("cuda", {}))
        print(json.dumps(summary, indent=2, allow_nan=False))
    return receipt


def load_ipython_extension(ipython: Any) -> None:
    ipython.register_magic_function(atlas_gemm_magic, magic_kind="line", magic_name="atlas_gemm")


def unload_ipython_extension(ipython: Any) -> None:
    # IPython does not expose a stable public unregister API for line magics.
    # Leaving the small function registration in the current kernel is harmless.
    _ = ipython
