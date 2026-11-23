"""Classical image enhancement helpers for evidence images (OpenCV, no model).

Every function returns a NEW array. Inputs are never modified. These produce DERIVATIVES; the
original's bytes stay the evidence, identified by its SHA-256.

  blur_score(gray)              variance of the Laplacian; low = likely blurry
  clahe(gray)                   local contrast for dark or low-contrast images
  unsharp(gray)                 mild sharpening; it cannot recover detail lost to blur
  adaptive_binary(gray)         local threshold to make pen marks and handwriting easier to read
  redact_box(bgr, bbox)         blur or pixelate a region; for explicit or sensitive content
"""
from __future__ import annotations

import cv2
import numpy as np

REDACT_MODES = ("blur", "pixelate")


def _require_gray_u8(img: np.ndarray) -> None:
    if img.ndim != 2 or img.dtype != np.uint8:
        raise ValueError("GRAY_U8_2D_REQUIRED")


def blur_score(gray: np.ndarray) -> float:
    _require_gray_u8(gray)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def clahe(gray: np.ndarray, clip_limit: float = 2.0, tile: int = 8) -> np.ndarray:
    _require_gray_u8(gray)
    if clip_limit <= 0 or tile <= 0:
        raise ValueError("CLAHE_PARAMS_INVALID")
    op = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile, tile))
    return op.apply(gray)


def unsharp(gray: np.ndarray, sigma: float = 1.0, amount: float = 1.0) -> np.ndarray:
    _require_gray_u8(gray)
    if sigma <= 0 or amount < 0:
        raise ValueError("UNSHARP_PARAMS_INVALID")
    blurred = cv2.GaussianBlur(gray, (0, 0), sigma)
    return cv2.addWeighted(gray, 1.0 + amount, blurred, -amount, 0)


def adaptive_binary(gray: np.ndarray, block: int = 31, c: int = 10) -> np.ndarray:
    _require_gray_u8(gray)
    if block < 3 or block % 2 == 0:
        raise ValueError("ADAPTIVE_BLOCK_MUST_BE_ODD_GE_3")
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block, c)


def redact_box(bgr: np.ndarray, bbox_xyxy: tuple[int, int, int, int], mode: str = "blur", strength: int = 31) -> np.ndarray:
    """Return a copy with the box blurred or pixelated. Bounds must lie inside the image."""
    if bgr.ndim != 3 or bgr.shape[2] != 3 or bgr.dtype != np.uint8:
        raise ValueError("BGR_U8_3CH_REQUIRED")
    if mode not in REDACT_MODES:
        raise ValueError("REDACT_MODE_UNKNOWN")
    x0, y0, x1, y1 = bbox_xyxy
    h, w = bgr.shape[:2]
    if not (0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h):
        raise ValueError("REDACT_BOX_OUTSIDE_IMAGE")
    out = bgr.copy()
    roi = out[y0:y1, x0:x1]
    if mode == "blur":
        k = strength if strength % 2 == 1 else strength + 1
        out[y0:y1, x0:x1] = cv2.GaussianBlur(roi, (k, k), 0)
    else:
        step = max(2, strength)
        small = cv2.resize(roi, (max(1, (x1 - x0) // step), max(1, (y1 - y0) // step)), interpolation=cv2.INTER_LINEAR)
        out[y0:y1, x0:x1] = cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)
    return out
