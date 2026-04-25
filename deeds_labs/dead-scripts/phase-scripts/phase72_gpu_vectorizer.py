#!/usr/bin/env python
"""
Phase 72 GPU Vectorizer - PyTorch-based error embedding generator
Uses CUDA when available, falls back to CPU
"""
import sys
import json
import time

try:
    import torch
except ImportError:
    print(json.dumps({"error": "torch_not_installed"}))
    sys.exit(1)


def log(msg: str):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    sys.stderr.write(f"[phase72-gpu-vectorizer] {ts} {msg}\n")
    sys.stderr.flush()


def main():
    started = time.time()
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            log("no input received")
            print(json.dumps({"vectors": [], "dim": 8}))
            return

        payload = json.loads(raw)
        errors = payload.get("errors", [])

        if not isinstance(errors, list) or not errors:
            log("no errors in payload")
            print(json.dumps({"vectors": [], "dim": 8}))
            return

        device = "cuda" if torch.cuda.is_available() else "cpu"
        log(f"using device={device}, num_errors={len(errors)}")

        feats = []
        for e in errors:
            code = float(e.get("code") or 0)
            sev = float(e.get("severity") or 1)
            line = float((e.get("range") or {}).get("start", {}).get("line", 0))
            col = float((e.get("range") or {}).get("start", {}).get("character", 0))
            file_path = e.get("file") or ""
            file_score = float(len(file_path)) / 1024.0
            feats.append([code, sev, line, col, file_score, 1.0, 0.0, 0.0])

        x = torch.tensor(feats, dtype=torch.float32, device=device)  # [N, 8]

        # Tiny learned-ish projection: here just 8x8 linear; later you can load .pt
        proj = torch.nn.Linear(8, 8, bias=True).to(device)
        with torch.no_grad():
            out = proj(x)
            out = torch.nn.functional.normalize(out, p=2.0, dim=1)

        out_cpu = out.cpu().tolist()
        elapsed = time.time() - started
        log(f"encoded {len(errors)} errors into 8D vectors in {elapsed:.3f}s")

        print(json.dumps({"vectors": out_cpu, "dim": 8}))
    except Exception as exc:
        log(f"fatal error: {exc}")
        print(json.dumps({"error": "exception", "message": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
