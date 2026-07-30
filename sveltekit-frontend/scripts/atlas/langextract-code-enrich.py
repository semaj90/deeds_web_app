#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Enrich syntax chunks with deterministic code-intel metadata.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def derive_concepts(row: dict[str, object]) -> list[str]:
    tokens: set[str] = set()
    for key in ("filePath", "symbol", "kind", "domain"):
        value = row.get(key)
        if isinstance(value, str):
            tokens.update(part.lower() for part in re.split(r"[^A-Za-z0-9_]+", value) if len(part) > 2)

    for import_path in row.get("imports", []) or []:
        if isinstance(import_path, str):
            tokens.update(part.lower() for part in re.split(r"[^A-Za-z0-9_]+", import_path) if len(part) > 2)

    return sorted(tokens)[:24]


def derive_kv_pairs(row: dict[str, object]) -> list[dict[str, str]]:
    return [
        {"key": "filePath", "value": str(row.get("filePath", ""))},
        {"key": "symbol", "value": str(row.get("symbol", ""))},
        {"key": "kind", "value": str(row.get("kind", ""))},
        {"key": "domain", "value": str(row.get("domain", ""))},
    ]


def main() -> int:
    args = parse_args()
    rows = [json.loads(line) for line in args.input.read_text(encoding="utf-8").splitlines() if line.strip()]
    if args.limit:
        rows = rows[: args.limit]

    output_rows: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        row["concepts"] = derive_concepts(row)
        row["key_value_pairs"] = derive_kv_pairs(row)
        output_rows.append(json.dumps(row, ensure_ascii=False))

    if not args.dry_run:
        args.output.write_text("\n".join(output_rows) + ("\n" if output_rows else ""), encoding="utf-8")

    print(json.dumps({
        "dry_run": args.dry_run,
        "input": str(args.input),
        "output": str(args.output),
        "rows": len(output_rows),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
