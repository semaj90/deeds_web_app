from __future__ import annotations

import hashlib
import json
import math
import time
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort

REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL_ROOT = REPO_ROOT / "models" / "embeddinggemma2" / "onnx-q8" / "onnx"
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "eg2-onnx-encoder-inspection-v1.json"


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return f"sha256:{h.hexdigest()}"


def main() -> int:
    artifacts: dict[str, Any] = {}
    for name in ("model_quantized.onnx", "vision_encoder_quantized.onnx", "audio_encoder_quantized.onnx"):
        p = MODEL_ROOT / name
        d = MODEL_ROOT / f"{name}_data"
        artifacts[name] = {
            "present": p.is_file(),
            "bytes": p.stat().st_size if p.is_file() else 0,
            "sha256": _sha256_file(p) if p.is_file() else None,
            "externalDataPresent": d.is_file(),
            "externalDataBytes": d.stat().st_size if d.is_file() else 0,
            "externalDataSha256": _sha256_file(d) if d.is_file() else None,
        }

    so = ort.SessionOptions()
    so.intra_op_num_threads = 4
    so.inter_op_num_threads = 1
    sess = ort.InferenceSession(str(MODEL_ROOT / "model_quantized.onnx"), so, providers=["CPUExecutionProvider"])

    seq_results: list[dict[str, Any]] = []
    empty = np.zeros((0, 512), dtype=np.float32)
    for seq_len in (512, 1024, 2048, 4096, 8192):
        ids = np.full((1, seq_len), 100, dtype=np.int64)
        ids[0, 0] = 2
        mask = np.ones((1, seq_len), dtype=np.int64)
        feeds = {
            "input_ids": ids,
            "attention_mask": mask,
            "image_features": empty,
            "video_features": empty,
            "audio_features": empty,
        }
        t0 = time.perf_counter()
        try:
            out = sess.run(["sentence_embedding"], feeds)[0]
            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            vec = out[0].astype(np.float32)
            finite = bool(np.isfinite(vec).all())
            l2 = float(np.linalg.norm(vec))
            seq_results.append(
                {
                    "seqLen": seq_len,
                    "ok": finite and len(vec) == 768,
                    "dim": int(len(vec)),
                    "finite": finite,
                    "l2Norm": round(l2, 6),
                    "elapsedMs": elapsed_ms,
                    "error": None,
                }
            )
            if elapsed_ms > 20000:
                break
        except Exception as exc:
            seq_results.append(
                {
                    "seqLen": seq_len,
                    "ok": False,
                    "dim": 0,
                    "finite": False,
                    "l2Norm": None,
                    "elapsedMs": round((time.perf_counter() - t0) * 1000.0, 2),
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )
            break

    report = {
        "schema": "atlas.eg2-onnx-encoder-inspection.v1",
        "modelDir": str(MODEL_ROOT.parent.relative_to(REPO_ROOT)).replace("\\", "/"),
        "providers": sess.get_providers(),
        "artifacts": artifacts,
        "sequenceLengthBenchmarks": seq_results,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
