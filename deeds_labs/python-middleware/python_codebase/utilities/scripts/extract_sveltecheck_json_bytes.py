#!/usr/bin/env python3
"""
extract_sveltecheck_json_bytes.py

Scan the raw svelte-check output file in binary mode for the diagnostics key and
extract a clean JSON file starting from the nearest preceding '{'. This avoids
decoding the noisy prefix and handles large files by streaming to disk.

Usage:
  python scripts/extract_sveltecheck_json_bytes.py --input ./.cache/sveltecheck.json --output ./.cache/sveltecheck.clean.json

If successful, the cleaned file can be parsed by the existing streaming extractor.
"""
import argparse
from pathlib import Path


def find_and_dump(input_path: Path, output_path: Path, pattern=b'"diagnostics"'):
    buffer_size = 4 * 1024 * 1024
    overlap = len(pattern) - 1
    with input_path.open('rb') as inf:
        prev = b''
        offset = 0
        start_pos = None
        while True:
            chunk = inf.read(buffer_size)
            if not chunk:
                break
            buf = prev + chunk
            idx = buf.find(pattern)
            if idx != -1:
                abs_idx = offset - len(prev) + idx
                # backtrack up to 2MB to find nearest '{'
                backtrack = min(2 * 1024 * 1024, abs_idx)
                back_start = max(0, abs_idx - backtrack)
                # find previous '{' between back_start and abs_idx
                inf.seek(back_start)
                probe = inf.read(abs_idx - back_start)
                brace_idx = probe.rfind(b'{')
                if brace_idx != -1:
                    start_pos = back_start + brace_idx
                else:
                    start_pos = back_start
                break
            offset += len(chunk)
            prev = buf[-overlap:]

    if start_pos is None:
        print('Diagnostics pattern not found; aborting')
        return False

    # Copy from start_pos to the end into output_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with input_path.open('rb') as inf, output_path.open('wb') as outf:
        inf.seek(start_pos)
        while True:
            chunk = inf.read(buffer_size)
            if not chunk:
                break
            outf.write(chunk)

    print(f'Wrote cleaned JSON starting at byte {start_pos} to {output_path}')
    return True


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', '-i', required=True)
    p.add_argument('--output', '-o', required=True)
    args = p.parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)
    ok = find_and_dump(input_path, output_path)
    if not ok:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
