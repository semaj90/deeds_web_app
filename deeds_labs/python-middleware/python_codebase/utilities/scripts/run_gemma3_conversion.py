#!/usr/bin/env python3
import argparse
import os
import subprocess
import sys
from pathlib import Path
from datetime import datetime

"""
Robust Gemma3 HF -> TensorRT-LLM checkpoint conversion runner
- Patches config to text-only first (optional)
- Streams logs to timestamped file
- Applies larger timeouts for 20+ GB models

Example:
  python scripts/run_gemma3_conversion.py \
    --hf ./models/gemma3_hf --out ./models/gemma3_trt --dtype float16
"""

HERE = Path(__file__).resolve().parent

def run(cmd, cwd=None, timeout=None):
    proc = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    lines = []
    try:
        for line in proc.stdout:
            print(line, end='')
            lines.append(line)
        rc = proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        rc = 124
    return rc, ''.join(lines)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--hf', required=True, help='HF model dir with safetensors')
    ap.add_argument('--out', required=True, help='Output TRT-LLM checkpoint dir')
    ap.add_argument('--dtype', default='float16', choices=['float16','bfloat16'])
    ap.add_argument('--tp', type=int, default=1)
    ap.add_argument('--pp', type=int, default=1)
    ap.add_argument('--no_patch', action='store_true', help='Skip text-only patch')
    args = ap.parse_args()

    hf = Path(args.hf).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)

    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    log = out / f'convert_{ts}.log'

    # Optional text-only patch
    if not args.no_patch:
        patcher = HERE / 'patch_gemma3_config_text_only.py'
        if not patcher.exists():
            print('ERROR: patch_gemma3_config_text_only.py missing', file=sys.stderr)
            return 2
        rc, _ = run([sys.executable, str(patcher), str(hf)])
        if rc != 0:
            print('ERROR: config patch failed', file=sys.stderr)
            return rc

    # Build conversion command using module entry
    cmd = [
        sys.executable, '-m', 'tensorrt_llm.models.gemma.convert',
        '--model_dir', str(hf),
        '--output_dir', str(out),
        '--dtype', args.dtype,
        '--tp_size', str(args.tp),
        '--pp_size', str(args.pp)
    ]

    print('Running conversion...')
    print('Command:', ' '.join(cmd))
    with log.open('w') as f:
        f.write('CMD: ' + ' '.join(cmd) + '\n')
    rc, output = run(cmd, timeout=6*3600)
    with log.open('a') as f:
        f.write(output)
    if rc == 0:
        print('✅ Conversion complete')
        return 0
    elif rc == 124:
        print('❌ Conversion timed out (6h). See log:', log)
        return rc
    else:
        print('❌ Conversion failed. See log:', log)
        return rc

if __name__ == '__main__':
    sys.exit(main())
