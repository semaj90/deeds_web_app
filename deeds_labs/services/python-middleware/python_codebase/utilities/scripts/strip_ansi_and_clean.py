#!/usr/bin/env python3
"""
strip_ansi_and_clean.py

Stream a svelte-check capture, strip ANSI escape sequences and leading non-JSON lines,
and write a cleaned JSON candidate file suitable for ijson streaming.

Usage:
  python scripts/strip_ansi_and_clean.py --input .cache/sveltecheck.clean.json --output .cache/sveltecheck.clean2.json

This is defensive: it doesn't attempt to parse JSON, only removes ANSI and trims prefix until first '{' or '['.
"""
import argparse
import re
from pathlib import Path

ANSI_RE = re.compile(r"\x1B\[[0-9;?]*[ -/]*[@-~]")


def clean_stream(input_path: Path, output_path: Path, chunk_size=1024*1024):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    first_json_found = False
    buffer = ''
    with input_path.open('rb') as inf, output_path.open('w', encoding='utf-8') as outf:
        while True:
            chunk = inf.read(chunk_size)
            if not chunk:
                break
            try:
                text = chunk.decode('utf-8', errors='replace')
            except Exception:
                text = chunk.decode('latin-1', errors='replace')
            # strip ANSI sequences
            text = ANSI_RE.sub('', text)
            if not first_json_found:
                buffer += text
                # look for first { or [ that likely starts JSON
                m = re.search(r'[\{\[]', buffer)
                if m:
                    first_json_found = True
                    start = m.start()
                    outf.write(buffer[start:])
                    buffer = ''
                else:
                    # keep at most 1MB in buffer
                    if len(buffer) > 1024*1024:
                        buffer = buffer[-1024*1024:]
            else:
                outf.write(text)

    return first_json_found


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', '-i', required=True)
    p.add_argument('--output', '-o', required=True)
    args = p.parse_args()
    inp = Path(args.input)
    outp = Path(args.output)
    ok = clean_stream(inp, outp)
    if not ok:
        print('Warning: did not find JSON start in input; output contains stripped content but may not be valid JSON')
    else:
        print(f'Wrote cleaned JSON candidate to {outp}')


if __name__ == '__main__':
    main()
