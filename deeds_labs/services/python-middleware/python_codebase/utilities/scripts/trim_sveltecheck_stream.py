#!/usr/bin/env python3
"""
trim_sveltecheck_stream.py

Stream a large svelte-check JSON and extract a compact diagnostics JSON file.

Writes: ../.cache/sveltecheck.trimmed.json (relative to repo root when run from repo root)

Usage:
  python scripts/trim_sveltecheck_stream.py --input ./.cache/sveltecheck.json --output ./.cache/sveltecheck.trimmed.json

This script uses ijson for streaming parsing to avoid loading the entire file into memory.
"""
import argparse
import ijson
import json
import sys
from pathlib import Path


def stream_extract(input_path: Path, output_path: Path, max_items: int | None = None):
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    out = []
    count = 0
    # Scan the file in binary chunks to locate the diagnostics token anywhere in the file.
    pattern = b'"diagnostics"'
    buffer_size = 4 * 1024 * 1024  # 4MB
    start_pos = None
    with input_path.open('rb') as bf:
        offset = 0
        overlap = len(pattern) - 1
        prev = b''
        while True:
            chunk = bf.read(buffer_size)
            if not chunk:
                break
            buf = prev + chunk
            idx = buf.find(pattern)
            if idx != -1:
                abs_idx = offset - len(prev) + idx
                # backtrack up to 2MB to find the nearest '{'
                backtrack = min(2 * 1024 * 1024, abs_idx)
                back_start = max(0, abs_idx - backtrack)
                bf.seek(back_start)
                probe = bf.read(abs_idx - back_start)
                brace_idx = probe.rfind(b'{')
                if brace_idx != -1:
                    start_pos = back_start + brace_idx
                else:
                    start_pos = back_start
                break
            # prepare for next read
            offset += len(chunk)
            prev = buf[-overlap:]

    if start_pos is None:
        # fallback to start of file
        start_pos = 0

    import io
    bf = input_path.open('rb')
    try:
        bf.seek(start_pos)
    except Exception:
        bf.seek(0)
    text_stream = io.TextIOWrapper(bf, encoding='utf-8', errors='replace')
    parser = ijson.parse(text_stream)
    in_diagnostics = False
    top_level_array = False
    current = None
    key_stack = []
    for prefix, event, value in parser:
        # Detect top-level array (prefix == '' and start_array) -> treat items as diagnostics
        if not in_diagnostics:
            if prefix == '' and event == 'start_array':
                in_diagnostics = True
                top_level_array = True
                continue
            # Look for named diagnostics property
            if prefix == 'diagnostics' and event == 'start_array':
                in_diagnostics = True
                top_level_array = False
                continue
            # otherwise keep scanning
            continue

        # When in diagnostics, collect objects
        if in_diagnostics:
            if event == 'start_map':
                current = {}
                key_stack = []
                continue
            if event == 'end_map':
                # trim current to essential fields
                trimmed = {
                    'file': current.get('file'),
                    'code': current.get('code'),
                    'message': current.get('message'),
                    'severity': current.get('severity'),
                    'start': current.get('start'),
                    'end': current.get('end')
                }
                out.append(trimmed)
                count += 1
                if max_items and count >= max_items:
                    break
                current = None
                continue
            if event == 'map_key':
                key_stack.append(value)
                continue
            # simple scalar values
            if key_stack and event in ('string', 'number', 'boolean', 'null'):
                k = key_stack.pop()
                current[k] = value

    # Write trimmed output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open('w', encoding='utf-8') as out_f:
        json.dump({'diagnostics': out, 'count': len(out)}, out_f)

    print(f"Wrote {len(out)} diagnostics to {output_path}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', '-i', required=True)
    p.add_argument('--output', '-o', required=True)
    p.add_argument('--max', type=int, default=0, help='Optional max items to extract (0 = all)')
    args = p.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    max_items = args.max if args.max > 0 else None

    try:
        stream_extract(input_path, output_path, max_items)
    except Exception as e:
        print('Error during extraction:', e, file=sys.stderr)
        sys.exit(2)


if __name__ == '__main__':
    main()
