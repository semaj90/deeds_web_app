#!/usr/bin/env python3
"""Validate environment readiness for real TensorRT-LLM build.

Checks:
 1. GPU visibility (nvidia-smi)
 2. Torch CUDA availability + version alignment
 3. TensorRT-LLM import & version
 4. trtexec presence & version
 5. CUDA compiler (nvcc) (optional)
 6. HF model directory structure (config + safetensors) if provided
 7. Disk space estimate in engine/output dirs

Usage:
  python scripts/validate_tensorrt_env.py --hf-dir models/gemma3-legal-hf --engine-dir engines/gemma3-legal-trt

Exits non-zero if any critical check fails.
"""
from __future__ import annotations
import argparse, os, shutil, subprocess, sys, json, glob, textwrap
from pathlib import Path
from dataclasses import dataclass

CRITICAL_FAIL = False

def run_cmd(cmd: list[str], timeout=10):
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=timeout, text=True)
        return 0, out.strip()
    except subprocess.CalledProcessError as e:
        return e.returncode, e.output.strip()
    except FileNotFoundError:
        return 127, 'NOT_FOUND'
    except subprocess.TimeoutExpired:
        return 124, 'TIMEOUT'

@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str
    critical: bool = True

    def format(self) -> str:
        status = '✅' if self.ok else ('⚠️' if not self.critical else '❌')
        return f"{status} {self.name}: {self.detail}"

results: list[CheckResult] = []

def add_result(name: str, ok: bool, detail: str, critical: bool = True):
    global CRITICAL_FAIL
    if not ok and critical:
        CRITICAL_FAIL = True
    results.append(CheckResult(name, ok, detail, critical))


def check_gpu():
    rc, out = run_cmd(['nvidia-smi'])
    if rc == 0:
        first_line = out.splitlines()[0]
        add_result('GPU (nvidia-smi)', True, first_line)
    else:
        add_result('GPU (nvidia-smi)', False, f'Unavailable rc={rc} msg={out}', True)

def check_torch():
    try:
        import torch
        cuda = torch.cuda.is_available()
        ver = torch.__version__
        if cuda:
            cap = torch.cuda.get_device_name(0)
            add_result('PyTorch CUDA', True, f'version={ver} device="{cap}"')
        else:
            add_result('PyTorch CUDA', False, f'version={ver} but CUDA not available', True)
    except Exception as e:
        add_result('PyTorch import', False, repr(e), True)

def check_tensorrt_llm():
    try:
        import tensorrt_llm
        ver = getattr(tensorrt_llm, '__version__', 'unknown')
        add_result('TensorRT-LLM import', True, f'version={ver}')
    except Exception as e:
        add_result('TensorRT-LLM import', False, repr(e), True)

def check_trtexec():
    rc, out = run_cmd(['which', 'trtexec']) if os.name != 'nt' else run_cmd(['where', 'trtexec'])
    if rc != 0:
        add_result('trtexec binary', False, 'Not found in PATH', True)
        return
    # try version
    rc2, out2 = run_cmd(['trtexec', '--version'])
    if rc2 == 0:
        line = out2.splitlines()[0]
        add_result('trtexec version', True, line)
    else:
        add_result('trtexec version', False, f'Failed rc={rc2} msg={out2}', False)

def check_nvcc():
    rc, out = run_cmd(['nvcc', '--version'])
    if rc == 0:
        last = out.splitlines()[-1]
        add_result('nvcc', True, last, False)
    else:
        add_result('nvcc', False, 'Not found (OK if using prebuilt wheels)', False)

def human_bytes(num):
    for unit in ['B','KB','MB','GB','TB']:
        if num < 1024:
            return f"{num:.1f}{unit}"
        num /= 1024
    return f"{num:.1f}PB"

def check_hf_dir(hf_dir: Path | None):
    if not hf_dir:
        add_result('HF model dir', False, 'Not provided (--hf-dir missing)', False)
        return
    if not hf_dir.exists():
        add_result('HF model dir', False, f'Missing path {hf_dir}', True)
        return
    config = hf_dir / 'config.json'
    safes = list(hf_dir.glob('*.safetensors'))
    tokenizer_any = any((hf_dir / name).exists() for name in ['tokenizer.json','tokenizer.model'])
    ok = config.exists() and safes and tokenizer_any
    detail = f"config={'Y' if config.exists() else 'N'} safetensors={len(safes)} tokenizer={'Y' if tokenizer_any else 'N'}"
    add_result('HF model structure', ok, detail, True)
    if safes:
        total = sum(f.stat().st_size for f in safes)
        add_result('HF model size', True, human_bytes(total), False)


def check_disk(paths):
    for p in paths:
        path = Path(p)
        base = path if path.exists() else path.parent
        try:
            usage = shutil.disk_usage(base)
            free = human_bytes(usage.free)
            add_result(f'Disk free ({base})', True, free, False)
        except Exception as e:
            add_result(f'Disk free ({base})', False, repr(e), False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--hf-dir', type=Path, help='Path to merged real HF Gemma3 model')
    parser.add_argument('--engine-dir', type=Path, default=Path('engines'))
    args = parser.parse_args()

    check_gpu()
    check_torch()
    check_tensorrt_llm()
    check_trtexec()
    check_nvcc()
    check_hf_dir(args.hf_dir)
    check_disk([args.hf_dir or Path('.'), args.engine_dir])

    print('\n=== TensorRT Build Readiness Report ===')
    for r in results:
        print(r.format())

    if CRITICAL_FAIL:
        print('\n❌ One or more critical checks failed. Fix before building the engine.')
        return 1
    print('\n✅ All critical checks passed.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
