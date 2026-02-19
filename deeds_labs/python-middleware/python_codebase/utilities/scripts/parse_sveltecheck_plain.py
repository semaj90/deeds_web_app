#!/usr/bin/env python3
"""
parse_sveltecheck_plain.py

Parse svelte-check textual output (when JSON wasn't produced or is polluted with logs).
Scans for lines like: <path>:<line>:<col>  Error: <message>
and builds a compact diagnostics JSON.

Usage:
  python scripts/parse_sveltecheck_plain.py --input ./.cache/sveltecheck.json --output ./.cache/sveltecheck.trimmed.json --max 0
"""
import argparse
import json
import re
from pathlib import Path


DIAG_RE = re.compile(r'^(?P<file>[^:\n]+):(?P<line>\d+):(?P<col>\d+)\s+(?P<severity>Error|Warning):\s*(?P<message>.+)$')


def parse_plain(input_path: Path, output_path: Path, max_items: int | None = None):
    if not input_path.exists():
        raise FileNotFoundError(input_path)
    diagnostics = []
    with input_path.open('r', encoding='utf-8', errors='replace') as f:
        for line in f:
            m = DIAG_RE.match(line.strip())
            if not m:
                continue
            d = m.groupdict()
            diag = {
                'file': d['file'],
                'message': d['message'].strip(),
                'severity': d['severity'].lower(),
                'start': {'line': int(d['line']), 'character': int(d['col'])},
                'end': None,
            }
            diagnostics.append(diag)
            if max_items and len(diagnostics) >= max_items:
                break

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open('w', encoding='utf-8') as outf:
        json.dump({'diagnostics': diagnostics, 'count': len(diagnostics)}, outf, indent=2)

    print(f'Wrote {len(diagnostics)} diagnostics to {output_path}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', '-i', required=True)
    p.add_argument('--output', '-o', required=True)
    p.add_argument('--max', type=int, default=0)
    args = p.parse_args()
    max_items = args.max if args.max > 0 else None
    parse_plain(Path(args.input), Path(args.output), max_items)


if __name__ == '__main__':
    main()
