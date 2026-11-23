"""Keyframe analysis: YOLOX boxes -> SAM 2 masks -> relative depth in box -> OCR (Tesseract).

Runs in the SAM 2 venv (numpy, PIL, OpenCV, pytesseract). Derivative outputs only:
masks and OCR text are proposals tied to a frame and box; nothing is persisted here.

- SAM 2 is invoked through the existing one-box runner (python/atlas_sam2_silhouette_runner_v1.py),
  so its request/response contract is unchanged.
- Depth is sampled inside each box as an ordering key (relative monocular, no units).
- OCR runs on the raw grayscale and on an OpenCV-enhanced variant (CLAHE + adaptive threshold);
  both results are recorded. Enhanced text is a reading to verify, not a fact.
"""
from __future__ import annotations

import base64
import io
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
RUNNER = HERE / "atlas_sam2_silhouette_runner_v1.py"
DEFAULT_CONFIG = "configs/sam2.1/sam2.1_hiera_t.yaml"
DEFAULT_CHECKPOINT = str(HERE.parent / "models" / "sam2" / "sam2.1_hiera_tiny.pt")
TESSERACT_DEFAULT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def normalized_box(bbox_xyxy, width: int, height: int) -> list[float]:
    x0, y0, x1, y1 = bbox_xyxy
    nb = [max(0.0, x0 / width), max(0.0, y0 / height), min(1.0, x1 / width), min(1.0, y1 / height)]
    if not (nb[0] < nb[2] and nb[1] < nb[3]):
        raise ValueError("BOX_DEGENERATE_AFTER_NORMALIZATION")
    return nb


def run_sam2_box(image_path: Path, bbox_xyxy, width: int, height: int, timeout_s: int = 600) -> dict:
    """One SAM 2 mask for one box, via the existing subprocess runner."""
    req = {
        "imagePath": str(image_path.resolve()),
        "bboxNormalized": normalized_box(bbox_xyxy, width, height),
        "config": DEFAULT_CONFIG,
        "checkpoint": DEFAULT_CHECKPOINT,
    }
    proc = subprocess.run(
        [sys.executable, str(RUNNER)],
        input=json.dumps(req),
        capture_output=True,
        text=True,
        timeout=timeout_s,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"SAM2_RUNNER_FAILED: {proc.stderr.strip()[:300]}")
    return json.loads(proc.stdout)


def mask_from_png_b64(b64: str, width: int, height: int) -> np.ndarray:
    mask = np.array(Image.open(io.BytesIO(base64.b64decode(b64))).convert("L"))
    if mask.shape != (height, width):
        raise ValueError("MASK_SIZE_MISMATCH")
    return mask > 127


def mask_stats(mask: np.ndarray) -> dict:
    ys, xs = np.nonzero(mask)
    if xs.size == 0:
        return {"pixels": 0, "bboxXYXY": None}
    return {
        "pixels": int(xs.size),
        "bboxXYXY": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
    }


def box_median_depth(depth: np.ndarray, bbox_xyxy) -> float:
    """Median of finite relative-depth values inside the box. Ordering key only; no units."""
    h, w = depth.shape
    x0, y0, x1, y1 = [int(np.floor(v)) for v in bbox_xyxy]
    roi = depth[max(0, y0):min(h, y1), max(0, x0):min(w, x1)]
    vals = roi[np.isfinite(roi)]
    if vals.size == 0:
        raise ValueError("DEPTH_BOX_HAS_NO_FINITE_SAMPLES")
    return float(np.median(vals))


OCR_UPSCALE = 3


def upscale_for_ocr(gray: np.ndarray) -> np.ndarray:
    """Small pixel-font text is unreadable at native size; 3x cubic upscaling made the dialogue readable."""
    import cv2

    return cv2.resize(gray, None, fx=OCR_UPSCALE, fy=OCR_UPSCALE, interpolation=cv2.INTER_CUBIC)


def enhance_for_ocr(gray: np.ndarray) -> np.ndarray:
    """Upscale, then Otsu threshold. The raw pass is upscale-only, so both readings are recorded."""
    import cv2

    up = upscale_for_ocr(gray)
    _, th = cv2.threshold(up, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return th


def configure_tesseract() -> str:
    import pytesseract

    cmd = os.environ.get("TESSERACT_CMD", TESSERACT_DEFAULT)
    pytesseract.pytesseract.tesseract_cmd = cmd
    return cmd


def ocr_words(gray: np.ndarray, min_conf: float = 50.0, psm: int = 6) -> list[dict]:
    """Word-level OCR (psm 6: one uniform block of text). Words below min_conf or blank are dropped.
    Bounding boxes are in the coordinates of the image passed in (upscaled by OCR_UPSCALE)."""
    import pytesseract

    data = pytesseract.image_to_data(
        Image.fromarray(gray), lang="eng", config=f"--psm {psm}", output_type=pytesseract.Output.DICT
    )
    words = []
    for i, text in enumerate(data["text"]):
        t = (text or "").strip()
        try:
            conf = float(data["conf"][i])
        except (TypeError, ValueError):
            continue
        if t and conf >= min_conf:
            words.append({"text": t, "conf": round(conf, 1),
                          "bboxXYWH": [int(data["left"][i]), int(data["top"][i]),
                                       int(data["width"][i]), int(data["height"][i])]})
    return words


def ocr_region(rgb: np.ndarray, bbox_xyxy) -> dict:
    """OCR on a crop, raw and enhanced. Both are recorded; the enhanced reading is unverified."""
    import cv2

    x0, y0, x1, y1 = [int(v) for v in bbox_xyxy]
    crop = rgb[max(0, y0):y1, max(0, x0):x1]
    if crop.size == 0:
        return {"raw": [], "enhanced": []}
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    return {"raw": ocr_words(upscale_for_ocr(gray)), "enhanced": ocr_words(enhance_for_ocr(gray))}


def analyse_frame(
    rgb: np.ndarray,
    frame_png: Path,
    detections: list[dict],
    depth: np.ndarray,
    *,
    max_boxes: int = 8,
    out_dir: Path | None = None,
    frame_pts_ms: int,
) -> dict:
    import cv2

    h, w = rgb.shape[:2]
    full_gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    chosen = sorted(detections, key=lambda d: d["detectionConfidence"], reverse=True)[:max_boxes]
    results = []
    for idx, det in enumerate(chosen):
        sam = run_sam2_box(frame_png, det["bboxXYXY"], w, h)
        mask = mask_from_png_b64(sam["maskPngBase64"], w, h)
        stats = mask_stats(mask)
        mask_path = None
        if out_dir is not None and stats["pixels"] > 0:
            out_dir.mkdir(parents=True, exist_ok=True)
            mask_path = out_dir / f"mask_{frame_pts_ms}_{idx}.png"
            Image.fromarray((mask * 255).astype(np.uint8)).save(mask_path)
        results.append({
            "classLabel": det["classLabel"],
            "detectionConfidence": det["detectionConfidence"],
            "bboxXYXY": det["bboxXYXY"],
            "sam2": {"iouScore": round(float(sam["iouScore"]), 4), "device": sam.get("device"),
                     "maskPixels": stats["pixels"], "maskBboxXYXY": stats["bboxXYXY"],
                     "maskPath": str(mask_path) if mask_path else None},
            "relativeDepthMedian": round(box_median_depth(depth, det["bboxXYXY"]), 4),
            "ocr": ocr_region(rgb, det["bboxXYXY"]),
        })
    return {
        "framePtsMs": frame_pts_ms,
        "imageSize": [w, h],
        "fullFrameOcr": {"raw": ocr_words(upscale_for_ocr(full_gray)), "enhanced": ocr_words(enhance_for_ocr(full_gray))},
        "boxes": results,
    }


def frame_text(frame: dict) -> str:
    """Join full-frame OCR words (enhanced pass preferred, raw as fallback) into one text block.
    Word order follows Tesseract's reading order; no words are invented."""
    words = frame.get("fullFrameOcr", {}).get("enhanced") or frame.get("fullFrameOcr", {}).get("raw") or []
    return " ".join(w["text"] for w in words)


def role_proposals_for_frame(frame: dict, source_ref: str) -> dict:
    """Textual role proposals for one frame, via the :8095 helper. Empty text is not sent."""
    import hashlib
    import atlas_role_evidence_v1 as rv

    text = frame_text(frame)
    text_sha256 = "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()
    if not text.strip():
        return {"status": "NO_TEXT", "sourceRef": source_ref, "textSha256": text_sha256, "proposals": []}
    if not rv.find_role_mentions(text):
        return {"status": "NO_ROLE_TERMS", "sourceRef": source_ref, "textSha256": text_sha256,
                "text": text, "proposals": []}
    try:
        out = rv.extract_role_proposals(text, source_ref=source_ref)
    except Exception as exc:  # sidecar down: record it, do not fail the analysis
        return {"status": "SIDECAR_UNAVAILABLE", "sourceRef": source_ref, "textSha256": text_sha256,
                "error": str(exc)[:200], "proposals": []}
    return {"status": out["status"], "sourceRef": source_ref,
            "sidecarRevision": out["sidecarRevision"],
            "textSha256": out["textSha256"], "text": text, "proposals": out["proposals"]}
