#!/usr/bin/env python3
"""
trim_sveltecheck_lines.py

1) Scans the svelte-check output for the first JSON object start (a line starting with '{' or '[').
2) Writes the JSON portion to a temporary cleaned file: ./.cache/sveltecheck.clean.json
3) Streams the cleaned file with ijson and extracts a trimmed diagnostics JSON to the requested output.

Usage:
  python scripts/trim_sveltecheck_lines.py -i ./.cache/sveltecheck.json -o ./.cache/sveltecheck.trimmed.json --max 0

This avoids loading the whole file into memory and is robust to prefixed CLI logs.
"""
import argparse
import io
import json
import sys
from pathlib import Path
import ijson


def find_json_start_line(path: Path):
    with path.open('r', encoding='utf-8', errors='replace') as f:
        for i, line in enumerate(f):
            s = line.lstrip()
            if s.startswith('{') or s.startswith('['):
                return i
    return None


def write_clean_json(input_path: Path, start_line: int, clean_path: Path):
    clean_path.parent.mkdir(parents=True, exist_ok=True)
    with input_path.open('r', encoding='utf-8', errors='replace') as inf, clean_path.open('w', encoding='utf-8') as outf:
        for i, line in enumerate(inf):
            if i >= start_line:
                outf.write(line)


def stream_extract_clean(clean_path: Path, output_path: Path, max_items: int | None = None):
    out = []
    count = 0
    with clean_path.open('r', encoding='utf-8', errors='replace') as f:
        parser = ijson.parse(f)
        in_diagnostics = False
        current = None
        key_stack = []
        for prefix, event, value in parser:
            if not in_diagnostics:
                if prefix == 'diagnostics' and event == 'start_array':
                    in_diagnostics = True
                continue

            if in_diagnostics:
                if event == 'start_map':
                    current = {}
                    key_stack = []
                    continue
                if event == 'end_map':
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
                if key_stack and event in ('string', 'number', 'boolean', 'null'):
                    k = key_stack.pop()
                    current[k] = value

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open('w', encoding='utf-8') as out_f:
        json.dump({'diagnostics': out, 'count': len(out)}, out_f)

    print(f"Wrote {len(out)} diagnostics to {output_path}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument('-i', '--input', required=True)
    p.add_argument('-o', '--output', required=True)
    p.add_argument('--max', type=int, default=0)
    args = p.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    clean_path = Path('.cache') / 'sveltecheck.clean.json'
    start_line = find_json_start_line(input_path)
    if start_line is None:
        print('Could not find JSON start in input file. Aborting.', file=sys.stderr)
        sys.exit(2)

    print(f'Found JSON start at line {start_line}, writing cleaned JSON to {clean_path}...')
    write_clean_json(input_path, start_line, clean_path)
    print('Streaming extract from cleaned JSON...')
    max_items = args.max if args.max > 0 else None
    stream_extract_clean(clean_path, output_path, max_items)


if __name__ == '__main__':
    main()
