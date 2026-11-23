"""SAM 2 silhouette runner (one normalized box per call).

Reads one JSON request from stdin:
  {"imagePath": str, "bboxNormalized": [x0, y0, x1, y1], "config": str, "checkpoint": str}
Writes one JSON response to stdout:
  {"maskPngBase64": str, "iouScore": float, "device": str, "peakGpuAllocatedMib": float|null}

Writes nothing else: no evidence, database, or storage access. Masks are derivative 2D artifacts.
Exit code 2 on invalid input, 1 on runtime failure (message on stderr).
"""
import base64
import io
import json
import sys

import numpy as np
from PIL import Image


MAX_IMAGE_PIXELS = 40_000_000


def _fail(code: int, message: str) -> None:
    sys.stderr.write(message + "\n")
    sys.exit(code)


def main() -> None:
    try:
        req = json.load(sys.stdin)
    except json.JSONDecodeError:
        _fail(2, "SAM2_RUNNER_INVALID_JSON")

    box = req.get("bboxNormalized")
    if not (isinstance(box, list) and len(box) == 4 and all(isinstance(v, (int, float)) for v in box)):
        _fail(2, "SAM2_RUNNER_BOX_MUST_BE_4_NUMBERS")
    x0, y0, x1, y1 = (float(v) for v in box)
    if not (0.0 <= x0 < x1 <= 1.0 and 0.0 <= y0 < y1 <= 1.0):
        _fail(2, "SAM2_RUNNER_BOX_MUST_BE_NORMALIZED_AND_NON_DEGENERATE")
    for key in ("imagePath", "config", "checkpoint"):
        if not isinstance(req.get(key), str) or not req[key]:
            _fail(2, f"SAM2_RUNNER_MISSING_{key.upper()}")

    try:
        image = np.array(Image.open(req["imagePath"]).convert("RGB"))
    except Exception:  # noqa: BLE001 - surface a single stable code
        _fail(1, "SAM2_RUNNER_IMAGE_UNREADABLE")

    # Bound the decoded size before any model work (about 40 megapixels).
    if image.shape[0] * image.shape[1] > MAX_IMAGE_PIXELS:
        _fail(2, "SAM2_RUNNER_IMAGE_TOO_LARGE")

    try:
        import torch
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor
    except ImportError:
        _fail(1, "SAM2_RUNNER_IMPORT_FAILED")

    height, width = image.shape[:2]
    prompt = np.array([x0 * width, y0 * height, x1 * width, y1 * height], dtype=np.float32)
    import os
    forced = os.environ.get("SAM2_DEVICE", "").strip().lower()
    if forced not in ("", "cpu", "cuda"):
        _fail(2, "SAM2_RUNNER_DEVICE_INVALID")
    device = forced or ("cuda" if torch.cuda.is_available() else "cpu")
    if device == "cuda" and not torch.cuda.is_available():
        _fail(1, "SAM2_RUNNER_CUDA_UNAVAILABLE")
    if device == "cuda":
        torch.cuda.reset_peak_memory_stats()
    try:
        model = build_sam2(req["config"], req["checkpoint"], device=device)
        predictor = SAM2ImagePredictor(model)
        predictor.set_image(image)
        masks, scores, _ = predictor.predict(box=prompt, multimask_output=False)
    except RuntimeError as error:
        _fail(1, "SAM2_RUNNER_PREDICT_FAILED: " + str(error)[:300])

    mask = (np.asarray(masks[0]).astype(bool)).astype(np.uint8) * 255
    buffer = io.BytesIO()
    Image.fromarray(mask, mode="L").save(buffer, format="PNG")
    peak = round(torch.cuda.max_memory_allocated() / 2**20, 1) if device == "cuda" else None
    json.dump(
        {
            "maskPngBase64": base64.b64encode(buffer.getvalue()).decode("ascii"),
            "iouScore": float(scores[0]),
            "device": device,
            "peakGpuAllocatedMib": peak,
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
