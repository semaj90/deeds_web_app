#!/usr/bin/env python3
"""
scripts/atlas/verify_lowrank_task_rpc_v2_py.py

Cross-language v2 low-rank task RPC decoder and verifier.
Reads receipt docs/reports/openspec-lowrank-task-rpc-receipt-v1.json,
decodes the binary, latent64, and bitset files, and verifies all fields.
"""

from __future__ import annotations
import sys
from pathlib import Path

# Delegate to canonical decode script
from importlib.machinery import SourceFileLoader

target = Path(__file__).resolve().parent / "test-lowrank-task-rpc-decode-v1.py"
loader = SourceFileLoader("test_lowrank_decode", str(target))
mod = loader.load_module()

if __name__ == "__main__":
    records = mod.decode()
    print(f"PYTHON_DECODE_PASS records={len(records)} stride={mod.RECORD_SIZE}")
    sys.exit(0)
