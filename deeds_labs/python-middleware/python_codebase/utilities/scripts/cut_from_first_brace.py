#!/usr/bin/env python3
"""
cut_from_first_brace.py

Binary-safe: find first '{' or '[' in input file and copy from there to output file.
This strips noisy console prefixes (colors, logs) that may precede the JSON payload.

Usage:
  python scripts/cut_from_first_brace.py --input .cache/sveltecheck.clean.json --output .cache/sveltecheck.clean2.json
"""
import argparse
from pathlib import Path


def cut(input_path: Path, output_path: Path, chunk_size=4*1024*1024):
    with input_path.open('rb') as inf:
        pos = 0
        found = False
        # read in chunks and search for first brace
        while True:
            chunk = inf.read(chunk_size)
            if not chunk:
                break
            idx1 = chunk.find(b'{')
            idx2 = chunk.find(b'[')
            idx = -1
            if idx1 != -1 and idx2 != -1:
                idx = min(idx1, idx2)
            elif idx1 != -1:
                idx = idx1
            elif idx2 != -1:
                idx = idx2

            if idx != -1:
                start = pos + idx
                found = True
                break
            pos += len(chunk)

        if not found:
            print('No JSON brace found in input; nothing written')
            return False

        # copy from start to output
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with input_path.open('rb') as inf2, output_path.open('wb') as outf:
            inf2.seek(start)
            while True:
                chunk = inf2.read(chunk_size)
                if not chunk:
                    break
                outf.write(chunk)

    print(f'Wrote cleaned file starting at byte {start} to {output_path}')
    return True


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', '-i', required=True)
    p.add_argument('--output', '-o', required=True)
    args = p.parse_args()
    inp = Path(args.input)
    outp = Path(args.output)
    ok = cut(inp, outp)
    if not ok:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
