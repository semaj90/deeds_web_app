"""Persistent, local Depth Anything V2 Small HTTP worker.

The model is loaded once at startup. Requests contain one bounded image and receive a
source-resolution, EXIF-oriented relative-depth PNG. The worker does not write to PostgreSQL,
SeaweedFS, or the input image. The SvelteKit evidence pipeline remains the storage owner.

Run in the pinned local model environment with:
  python -m uvicorn python.atlas_depth_anything_worker_v1:app --host 127.0.0.1 --port 8092

CPU is the default. Set ATLAS_DEPTH_DEVICE=cuda only when the operator has reserved GPU capacity.
"""
from __future__ import annotations

import base64
import binascii
import io
import json
import os
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool

MAX_REQUEST_BYTES = 44 * 1024 * 1024
MAX_IMAGE_BYTES = 32 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_OUTPUT_BYTES = 32 * 1024 * 1024


def _bounded_int(value: str | None, default: int, low: int, high: int, name: str) -> int:
    if value is None or not value.strip():
        return default
    try:
        parsed = int(value)
    except ValueError as error:
        raise RuntimeError(f"{name}_INVALID") from error
    if parsed < low or parsed > high:
        raise RuntimeError(f"{name}_OUT_OF_RANGE")
    return parsed


class DepthAnythingWorkerV1:
    def __init__(self) -> None:
        # Keep /live model-free: heavyweight inference libraries load only in lifespan startup.
        import torch
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation
        from python.atlas_depth_anything_v1 import DEFAULT_SNAPSHOT, MODEL_ID, MODEL_REVISION

        self.device = os.environ.get("ATLAS_DEPTH_DEVICE", "cpu").strip().lower()
        if self.device not in {"cpu", "cuda"}:
            raise RuntimeError("ATLAS_DEPTH_DEVICE_INVALID")
        if self.device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("ATLAS_DEPTH_CUDA_UNAVAILABLE")

        cpu_threads = _bounded_int(os.environ.get("ATLAS_DEPTH_CPU_THREADS"), 2, 1, 8, "ATLAS_DEPTH_CPU_THREADS")
        if self.device == "cpu":
            torch.set_num_threads(cpu_threads)
            torch.set_num_interop_threads(1)

        snapshot = os.environ.get("ATLAS_DEPTH_MODEL_SNAPSHOT", str(DEFAULT_SNAPSHOT))
        self.snapshot = str(Path(snapshot).resolve())
        if Path(self.snapshot).name != MODEL_REVISION:
            raise RuntimeError("DEPTH_MODEL_SNAPSHOT_REVISION_MISMATCH")
        self.weights_path = os.path.join(self.snapshot, "model.safetensors")
        if not os.path.isfile(self.weights_path):
            raise RuntimeError("ATLAS_DEPTH_WEIGHTS_NOT_FOUND")

        self.processor = AutoImageProcessor.from_pretrained(snapshot, local_files_only=True)
        self.model = AutoModelForDepthEstimation.from_pretrained(snapshot, local_files_only=True).to(self.device).eval()
        from python.atlas_depth_anything_v1 import sha256_file
        self.weights_sha256 = sha256_file(Path(self.weights_path))
        self.torch = torch
        self.model_id = MODEL_ID
        self.model_revision = MODEL_REVISION
        self.inference_lock = threading.Lock()

    def infer(self, image_bytes: bytes) -> dict[str, Any]:
        import base64
        import numpy as np
        from PIL import Image
        from python.atlas_depth_anything_v1 import (
            DEPTH_TYPE,
            MODEL_REVISION,
            load_oriented_rgb,
            normalize_depth_u8,
            sha256_bytes,
        )

        started = time.perf_counter()
        try:
            image = load_oriented_rgb(image_bytes)
            width, height = image.size
            if width < 1 or height < 1 or width * height > MAX_PIXELS:
                raise ValueError("DEPTH_IMAGE_PIXEL_LIMIT_EXCEEDED")
        except Exception as error:
            raise ValueError("DEPTH_IMAGE_DECODE_FAILED") from error

        inputs = self.processor(images=image, return_tensors="pt").to(self.device)
        with self.inference_lock, self.torch.no_grad():
            predicted = self.model(**inputs).predicted_depth
        resized = self.torch.nn.functional.interpolate(
            predicted.unsqueeze(1), size=image.size[::-1], mode="bicubic", align_corners=False
        ).squeeze().float().cpu().numpy().astype(np.float32, copy=False)

        output = io.BytesIO()
        Image.fromarray(normalize_depth_u8(resized), mode="L").save(output, format="PNG")
        png_bytes = output.getvalue()
        if not png_bytes or len(png_bytes) > MAX_OUTPUT_BYTES:
            raise ValueError("DEPTH_OUTPUT_SIZE_INVALID")

        return {
            "depth_base64": base64.b64encode(png_bytes).decode("ascii"),
            "width": width,
            "height": height,
            "processing_time_ms": round((time.perf_counter() - started) * 1000, 1),
            "model_id": self.model_id,
            "model_revision": MODEL_REVISION,
            "model_revision_status": "VERIFIED",
            "model_license": "Apache-2.0",
            "depth_type": DEPTH_TYPE,
            "source_sha256": sha256_bytes(image_bytes),
            "depth_sha256": sha256_bytes(png_bytes),
            "weights_sha256": self.weights_sha256,
            "device": self.device,
        }


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.worker = None
    app.state.startup_error = None
    app.state.inference_busy = False
    try:
        app.state.worker = await run_in_threadpool(DepthAnythingWorkerV1)
    except Exception as error:
        app.state.startup_error = str(error)[:240]
    yield
    app.state.worker = None


app = FastAPI(title="Parent Atlas Depth Worker", version="1", lifespan=lifespan)


@app.get("/live")
async def live() -> dict[str, str]:
    return {"status": "live"}


@app.get("/health")
async def health(request: Request) -> dict[str, Any]:
    worker = getattr(request.app.state, "worker", None)
    if worker is None:
        raise HTTPException(status_code=503, detail="DEPTH_MODEL_NOT_READY")
    return {"status": "ready", "model": worker.model_id, "revision": worker.model_revision, "device": worker.device}


@app.post("/depth")
async def depth(request: Request) -> dict[str, Any]:
    length = request.headers.get("content-length")
    if length:
        try:
            if int(length) > MAX_REQUEST_BYTES:
                raise HTTPException(status_code=413, detail="DEPTH_REQUEST_TOO_LARGE")
        except ValueError as error:
            raise HTTPException(status_code=400, detail="CONTENT_LENGTH_INVALID") from error

    body = await request.body()
    if len(body) > MAX_REQUEST_BYTES:
        raise HTTPException(status_code=413, detail="DEPTH_REQUEST_TOO_LARGE")
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(status_code=400, detail="DEPTH_REQUEST_JSON_INVALID") from error
    if not isinstance(payload, dict) or set(payload) != {"image_base64"} or not isinstance(payload["image_base64"], str):
        raise HTTPException(status_code=400, detail="DEPTH_REQUEST_SCHEMA_INVALID")
    try:
        image_bytes = base64.b64decode(payload["image_base64"], validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(status_code=400, detail="DEPTH_IMAGE_BASE64_INVALID") from error
    if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="DEPTH_IMAGE_SIZE_INVALID")

    worker = getattr(request.app.state, "worker", None)
    if worker is None:
        raise HTTPException(status_code=503, detail="DEPTH_MODEL_NOT_READY")
    if getattr(request.app.state, "inference_busy", True):
        raise HTTPException(status_code=429, detail="DEPTH_WORKER_BUSY")
    # This check/set has no await between it and the assignment, so a second
    # ASGI request cannot join an unbounded inference wait queue.
    request.app.state.inference_busy = True
    try:
        return await run_in_threadpool(worker.infer, image_bytes)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail="DEPTH_INFERENCE_FAILED") from error
    finally:
        request.app.state.inference_busy = False


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("ATLAS_DEPTH_HOST", "127.0.0.1")
    port = _bounded_int(os.environ.get("ATLAS_DEPTH_PORT"), 8092, 1024, 65535, "ATLAS_DEPTH_PORT")
    uvicorn.run(app, host=host, port=port, workers=1)
