#!/usr/bin/env python3
"""
Optional deterministic GPU scoring helper.

This script never derives packet identity. Every tensor row must arrive with an
explicit packet_key manifest. Input is JSONL:

{"packet_key":"packet:abc","features":[0.1,0.2,0.3]}
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from typing import Iterable

import torch


@dataclass(frozen=True)
class Row:
    packet_key: str
    features: list[float]


def read_rows(stream: Iterable[str]) -> list[Row]:
    rows: list[Row] = []
    seen: set[str] = set()

    for line_number, raw in enumerate(stream, start=1):
        raw = raw.strip()
        if not raw:
            continue

        item = json.loads(raw)
        packet_key = item.get("packet_key")
        features = item.get("features")

        if not isinstance(packet_key, str) or not packet_key:
            raise ValueError(f"line {line_number}: packet_key is required")
        if packet_key in seen:
            raise ValueError(f"line {line_number}: duplicate packet_key {packet_key}")
        if not isinstance(features, list) or not features:
            raise ValueError(f"line {line_number}: non-empty features are required")
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in features):
            raise ValueError(f"line {line_number}: features must be finite numbers")

        seen.add(packet_key)
        rows.append(Row(packet_key, [float(v) for v in features]))

    if not rows:
        raise ValueError("no rows supplied")

    width = len(rows[0].features)
    if any(len(row.features) != width for row in rows):
        raise ValueError("feature dimensions are inconsistent")

    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    parser.add_argument("--dtype", choices=("float16", "float32"), default="float16")
    args = parser.parse_args()

    rows = read_rows(sys.stdin)
    dtype = torch.float16 if args.dtype == "float16" else torch.float32
    device = torch.device(args.device)

    tensor = torch.tensor(
        [row.features for row in rows],
        dtype=dtype,
        device=device,
    )

    # Example bounded score: L2-normalize rows, then score against the batch mean.
    normalized = torch.nn.functional.normalize(tensor.float(), p=2, dim=1)
    query = torch.nn.functional.normalize(normalized.mean(dim=0, keepdim=True), p=2, dim=1)
    scores = (normalized @ query.T).squeeze(1).cpu().tolist()

    for row, score in zip(rows, scores, strict=True):
        print(json.dumps({
            "packet_key": row.packet_key,
            "score": float(score),
            "device": str(device),
            "dtype": args.dtype,
        }))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
