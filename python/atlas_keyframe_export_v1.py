"""Keyframe export and background extraction. Local files only; no database.

- export_frame: writes PNG (lossless) and/or JPEG (lossy) with SHA-256 and dimensions in a sidecar.
- background_plate: removes object masks (SAM 2) and inpaints them (OpenCV Telea) to give a
  background image, and cut_out: RGBA crops of each object from its mask. Masks are derivative.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


def _sha(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def export_frame(rgb: np.ndarray, out_base: Path, formats=("png", "jpeg"), jpeg_quality: int = 92) -> dict:
    if rgb.ndim != 3 or rgb.shape[2] != 3 or rgb.dtype != np.uint8:
        raise ValueError("RGB_U8_HWC_REQUIRED")
    out_base.parent.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(rgb)
    files = {}
    for fmt in formats:
        if fmt == "png":
            p = out_base.with_suffix(".png")
            img.save(p, format="PNG", optimize=True)
        elif fmt == "jpeg":
            p = out_base.with_suffix(".jpg")
            img.save(p, format="JPEG", quality=jpeg_quality, optimize=True)
        else:
            raise ValueError("FORMAT_UNKNOWN")
        files[fmt] = {"path": str(p), "sha256": _sha(p), "bytes": p.stat().st_size}
    sidecar = {"width": int(rgb.shape[1]), "height": int(rgb.shape[0]), "files": files,
               "note": "derivative export; original evidence bytes are unchanged"}
    out_base.with_suffix(".export.json").write_text(json.dumps(sidecar, indent=2), encoding="utf-8")
    return sidecar


def background_plate(rgb: np.ndarray, masks: list[np.ndarray], dilate_px: int = 5, radius: int = 5) -> np.ndarray:
    """Inpaint the union of all object masks (dilated) to produce a background-only image."""
    import cv2

    if rgb.ndim != 3 or rgb.dtype != np.uint8:
        raise ValueError("RGB_U8_HWC_REQUIRED")
    union = np.zeros(rgb.shape[:2], np.uint8)
    for m in masks:
        if m.shape != rgb.shape[:2]:
            raise ValueError("MASK_SIZE_MISMATCH")
        union |= (m > 0).astype(np.uint8)
    if union.sum() == 0:
        return rgb.copy()
    if dilate_px > 0:
        union = cv2.dilate(union, np.ones((2 * dilate_px + 1, 2 * dilate_px + 1), np.uint8))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    out = cv2.inpaint(bgr, union * 255, radius, cv2.INPAINT_TELEA)
    return cv2.cvtColor(out, cv2.COLOR_BGR2RGB)


def cut_out(rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """RGBA crop of one object, tightly bounded by its mask, with the mask as alpha."""
    ys, xs = np.nonzero(mask)
    if xs.size == 0:
        raise ValueError("EMPTY_MASK")
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = rgb[y0:y1, x0:x1]
    alpha = (mask[y0:y1, x0:x1] > 0).astype(np.uint8) * 255
    return np.dstack([crop, alpha])
