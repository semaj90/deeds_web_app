"""CPU ONNX pool benchmark for the :8094 EmbeddingGemma 2 server (read-only).

Compares one session with N intra-op threads, run sequentially, against K
sessions with M intra-op threads each, run in parallel threads. Same inputs.
Repeats each arm and reports the median. Writes one checksummed receipt to
.tmp/atlas/. Does not touch :8094, Docker, or Postgres. Canonical authority: false.

Usage (repo root):
  py -3.13 scripts/atlas/gemma2-onnx-pool-bench-v1.py [--batches 4] [--repeats 3]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

REPO = Path(__file__).resolve().parents[2]
ONNX_DIR = REPO / "models" / "embeddinggemma2" / "onnx-q8"
MODEL = ONNX_DIR / "onnx" / "model_quantized.onnx"
RECEIPT_DIR = REPO / ".tmp" / "atlas"


def make_inputs(n: int = 32) -> dict[str, np.ndarray]:
    tok = Tokenizer.from_file(str(ONNX_DIR / "tokenizer.json"))
    tok.enable_padding()
    tok.enable_truncation(512)
    texts = [
        f"title: file_{i}.ts | text: function handleRequest{i}(req) {{ return validate(req.body) }}"
        for i in range(n)
    ]
    enc = tok.encode_batch(texts)
    return {
        "input_ids": np.array([e.ids for e in enc], np.int64),
        "attention_mask": np.array([e.attention_mask for e in enc], np.int64),
        "image_features": np.zeros((0, 512), np.float32),
        "video_features": np.zeros((0, 512), np.float32),
        "audio_features": np.zeros((0, 512), np.float32),
    }


def make_session(intra: int) -> ort.InferenceSession:
    so = ort.SessionOptions()
    so.intra_op_num_threads = intra
    so.inter_op_num_threads = 1
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    so.log_severity_level = 3
    return ort.InferenceSession(str(MODEL), so, providers=["CPUExecutionProvider"])


def arm_sequential(intra: int, batches: int, feed: dict) -> float:
    sess = make_session(intra)
    sess.run(None, feed)  # warm-up
    t = time.perf_counter()
    for _ in range(batches):
        sess.run(None, feed)
    return time.perf_counter() - t


def arm_parallel(sessions: int, intra: int, batches: int, feed: dict) -> float:
    pool = [make_session(intra) for _ in range(sessions)]
    for s in pool:
        s.run(None, feed)  # warm-up
    def job(s: ort.InferenceSession) -> None:
        for _ in range(batches // sessions):
            s.run(None, feed)
    threads = [threading.Thread(target=job, args=(s,)) for s in pool]
    t = time.perf_counter()
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    return time.perf_counter() - t


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batches", type=int, default=4, help="batches of 32 texts per arm")
    ap.add_argument("--repeats", type=int, default=3)
    args = ap.parse_args()
    if not MODEL.exists():
        print(f"missing model: {MODEL}", file=sys.stderr)
        return 2

    feed = make_inputs(32)
    arms = {
        "seq_1x_intra8": lambda: arm_sequential(8, args.batches, feed),
        "par_4x_intra4": lambda: arm_parallel(4, 4, args.batches, feed),
    }
    times: dict[str, list[float]] = {k: [] for k in arms}
    for _ in range(args.repeats):
        for name, fn in arms.items():
            times[name].append(round(fn(), 3))

    texts = args.batches * 32
    summary = {}
    for name, ts in times.items():
        med = statistics.median(ts)
        summary[name] = {"seconds": ts, "median_s": med,
                         "texts_per_s_median": round(texts / med, 2)}
    speedup = round(summary["seq_1x_intra8"]["median_s"] / summary["par_4x_intra4"]["median_s"], 3)

    receipt = {
        "schema": "atlas.gemma2-onnx-pool-bench.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "canonicalAuthority": False,
        "writesPerformed": False,
        "model": str(MODEL.relative_to(REPO)).replace("\\", "/"),
        "provider": "CPUExecutionProvider",
        "ort_version": ort.__version__,
        "texts_per_arm": texts,
        "batches": args.batches,
        "repeats": args.repeats,
        "arms": summary,
        "speedup_par_over_seq_median": speedup,
        "note": "short synthetic inputs; directional, not a corpus benchmark",
    }
    body = json.dumps(receipt, indent=2, sort_keys=True)
    receipt["checksum"] = "sha256:" + hashlib.sha256(body.encode()).hexdigest()
    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = RECEIPT_DIR / f"gemma2-onnx-pool-bench-v1.{stamp}.json"
    out.write_text(json.dumps(receipt, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({"arms": summary, "speedup": speedup}, indent=2))
    print(f"receipt: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
