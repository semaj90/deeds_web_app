"""Depth-Anything-V2-Small producer (offline, relative/monocular depth).

Writes, into --out-dir:
  depth.npy       float32 depth raster, source resolution (RELATIVE, not metric)
  depth_u8.png    8-bit normalized preview (per-image normalization)
  receipt.json    model revision, weight hash, input/output hashes and dimensions

Loads only from a local snapshot (local_files_only=True). Never downloads. Never writes to
SeaweedFS or PostgreSQL: the caller decides what to persist.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

import numpy as np

MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"
MODEL_REVISION = "5426e4f0f36572d16453bbda7a8389317b1bef99"
DEPTH_TYPE = "relative_monocular"
DEFAULT_SNAPSHOT = Path(
    r"C:\Users\james\.cache\huggingface\hub"
    r"\models--depth-anything--Depth-Anything-V2-Small-hf\snapshots"
    r"\5426e4f0f36572d16453bbda7a8389317b1bef99"
)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def load_oriented_rgb(data: bytes):
    """Decode to RGB with EXIF orientation applied, matching the Node side's sharp().rotate().

    Without this, a rotated phone photo gets a depth map in a different frame from the
    YOLOX/SAM 2 coordinates computed on the oriented image.
    """
    import io

    from PIL import Image, ImageOps

    return ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")


def normalize_depth_u8(depth: np.ndarray) -> np.ndarray:
    """Per-image min/max normalization to uint8. Preview only; the raw float32 raster is canonical."""
    if depth.ndim != 2:
        raise ValueError("DEPTH_MUST_BE_2D")
    finite = np.isfinite(depth)
    if not finite.any():
        raise ValueError("DEPTH_HAS_NO_FINITE_VALUES")
    lo = float(depth[finite].min())
    hi = float(depth[finite].max())
    span = max(hi - lo, 1e-6)
    scaled = np.where(finite, (depth - lo) / span, 0.0)
    return np.clip(scaled * 255.0, 0, 255).astype(np.uint8)


def build_receipt(
    *,
    weights: Path,
    image_bytes: bytes,
    image_size: tuple[int, int],
    depth: np.ndarray,
    device: str,
    load_s: float,
    infer_s: float,
    png_bytes: bytes,
    npy_path: Path,
) -> dict:
    return {
        "schema": "atlas-depth-anything-receipt.v1",
        "model": {
            "id": MODEL_ID,
            "revision": MODEL_REVISION,
            "weights": str(weights),
            "weightsSha256": sha256_file(weights),
            "license": "Apache-2.0 (project ledger; weight file not re-checked here)",
        },
        "depthType": DEPTH_TYPE,
        "input": {"sha256": sha256_bytes(image_bytes), "width": image_size[0], "height": image_size[1]},
        "output": {
            "npy": str(npy_path),
            "npySha256": sha256_file(npy_path),
            "pngSha256": sha256_bytes(png_bytes),
            "width": int(depth.shape[1]),
            "height": int(depth.shape[0]),
            "dtype": "float32",
            "rawMin": float(np.nanmin(depth)),
            "rawMax": float(np.nanmax(depth)),
        },
        "runtime": {"device": device, "loadSeconds": round(load_s, 3), "inferSeconds": round(infer_s, 3)},
        "limits": [
            "relative depth only: no metric scale, no camera intrinsics",
            "derivative artifact, not evidence",
        ],
    }


def run(image_path: Path, out_dir: Path, snapshot: Path) -> dict:
    import io

    import torch
    from PIL import Image
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    out_dir.mkdir(parents=True, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    t0 = time.perf_counter()
    processor = AutoImageProcessor.from_pretrained(snapshot, local_files_only=True)
    model = AutoModelForDepthEstimation.from_pretrained(snapshot, local_files_only=True).to(device).eval()
    load_s = time.perf_counter() - t0

    image_bytes = image_path.read_bytes()
    image = load_oriented_rgb(image_bytes)
    inputs = processor(images=image, return_tensors="pt").to(device)

    t1 = time.perf_counter()
    with torch.no_grad():
        predicted = model(**inputs).predicted_depth
    infer_s = time.perf_counter() - t1

    resized = torch.nn.functional.interpolate(
        predicted.unsqueeze(1), size=image.size[::-1], mode="bicubic", align_corners=False
    ).squeeze().float().cpu().numpy()

    npy_path = out_dir / "depth.npy"
    np.save(npy_path, resized.astype(np.float32))

    buf = io.BytesIO()
    Image.fromarray(normalize_depth_u8(resized), mode="L").save(buf, format="PNG")
    png_bytes = buf.getvalue()
    (out_dir / "depth_u8.png").write_bytes(png_bytes)

    weights = snapshot / "model.safetensors"
    receipt = build_receipt(
        weights=weights,
        image_bytes=image_bytes,
        image_size=image.size,
        depth=resized,
        device=device,
        load_s=load_s,
        infer_s=infer_s,
        png_bytes=png_bytes,
        npy_path=npy_path,
    )
    (out_dir / "receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    args = parser.parse_args()
    print(json.dumps(run(args.image, args.out_dir, args.snapshot), indent=2))


if __name__ == "__main__":
    main()
