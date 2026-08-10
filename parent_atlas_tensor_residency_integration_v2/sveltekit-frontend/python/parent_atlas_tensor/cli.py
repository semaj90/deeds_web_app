from __future__ import annotations
import argparse
from pathlib import Path
import json
import numpy as np

from .arrow_ipc import feature_batch, semantic_batch, write_ipc_file, sha256_file
from .feature_matrix import load_jsonl


def main() -> None:
    p = argparse.ArgumentParser(prog="parent-atlas-tensor")
    sub = p.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("build-feature")
    f.add_argument("input_jsonl")
    f.add_argument("output_arrow")
    f.add_argument("--compression", choices=["lz4", "zstd"], default=None)

    s = sub.add_parser("smoke")

    args = p.parse_args()
    if args.cmd == "build-feature":
        keys, features, topology = load_jsonl(args.input_jsonl)
        batch = feature_batch(keys, features, topology)
        write_ipc_file(args.output_arrow, [batch], compression=args.compression)
        print(json.dumps({"path": args.output_arrow, "rows": len(keys), "sha256": sha256_file(args.output_arrow)}))
    elif args.cmd == "smoke":
        print(json.dumps({"status": "ok", "package": "parent_atlas_tensor"}))

if __name__ == "__main__":
    main()
