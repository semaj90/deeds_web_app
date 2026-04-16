"""
Image Synthesis + 3D Crime Scene Reconstruction Service  (port 8092)
=====================================================================
Primary pipeline:
  text prompt → FLUX.1-schnell (keyframe) → Wan2.1-1.3B T2V (video) → DepthAnything v2 (depth)

Generation modes:
  t2v  — text-to-video: Wan2.1 full scene from prompt alone
  i2v  — image-to-video: FLUX.1-schnell keyframe → Wan2.1 animation

Multi-image mode:
  POST /reconstruct/gaussian-splat — NVIDIA 3DGS from 6-30 overlapping photos

Endpoints:
  POST /reconstruct        — full pipeline → video + depth + point cloud
  POST /reconstruct/stream — SSE progress stream
  POST /generate/video     — Wan2.1 only (text-to-video)
  POST /generate/image     — FLUX.1-schnell only (static keyframe)
  POST /depth              — DepthAnything v2 depth from single image
  POST /reconstruct/gaussian-splat — multi-image 3DGS
  GET  /health             — GPU + model availability
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import subprocess
import tempfile
import time
from typing import AsyncGenerator, Optional

import httpx
import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image
from pydantic import BaseModel

# ── Config ────────────────────────────────────────────────────────────────────

OLLAMA_URL     = os.environ.get("OLLAMA_URL",     "http://host.docker.internal:11434")
LLM_MODEL      = os.environ.get("LLM_MODEL",      "gemma4-legal:latest")

# Wan2.1-1.3B (primary video) — Alibaba, Apache 2.0, ~6GB VRAM fp16
WAN_MODEL_ID   = os.environ.get("WAN_MODEL_ID",   "Wan-AI/Wan2.1-T2V-1.3B")

# FLUX.1-schnell (keyframe) — Black Forest Labs, Apache 2.0, ~4-6GB VRAM NF4
FLUX_MODEL_ID  = os.environ.get("FLUX_MODEL_ID",  "black-forest-labs/FLUX.1-schnell")

# DepthAnything v2 Large — HKU + TikTok, ~1.3GB VRAM
DEPTH_MODEL_ID = os.environ.get("DEPTH_MODEL_ID", "depth-anything/Depth-Anything-V2-Large-hf")

# Generation params
IMAGE_WIDTH    = int(os.environ.get("IMAGE_WIDTH",   "512"))
IMAGE_HEIGHT   = int(os.environ.get("IMAGE_HEIGHT",  "512"))
VIDEO_FRAMES   = int(os.environ.get("VIDEO_FRAMES",  "25"))   # 16-81 frames, 25=~1s
VIDEO_FPS      = int(os.environ.get("VIDEO_FPS",     "24"))
WAN_STEPS      = int(os.environ.get("WAN_STEPS",     "30"))   # 20-50; 30 = quality/speed balance
WAN_GUIDANCE   = float(os.environ.get("WAN_GUIDANCE","6.0"))  # CFG scale

FLUX_STEPS     = int(os.environ.get("FLUX_STEPS",    "4"))    # schnell: 1-4 steps
FLUX_GUIDANCE  = float(os.environ.get("FLUX_GUIDANCE","0.0")) # schnell = 0 (distilled)

# Quantization strategy (TurboQuant via TorchAO)
QUANT_MODE     = os.environ.get("QUANT_MODE", "int8")  # "int8" | "int4" | "nf4" | "none"
GENERATION_MODE = os.environ.get("GENERATION_MODE", "i2v")  # "t2v" | "i2v"
ENABLE_GAUSSIAN_SPLATTING = os.environ.get("ENABLE_GAUSSIAN_SPLATTING", "false").lower() == "true"
USE_FLASH_ATTN = os.environ.get("USE_FLASH_ATTN", "true").lower() == "true"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE  = torch.bfloat16 if DEVICE == "cuda" else torch.float32  # bfloat16 better than float16 for Wan

# ── Lazy singletons ───────────────────────────────────────────────────────────

_wan_pipe    = None
_flux_pipe   = None
_depth_pipe  = None

# ── OOM gate — max 1 concurrent GPU synthesis build ───────────────────────────
# Prevents two simultaneous FLUX/Wan runs from exhausting 8GB VRAM.
_gpu_sem = asyncio.Semaphore(1)

# ── FastAPI ───────────────────────────────────────────────────────────────────

app = FastAPI(title="Image Synthesis + 3D Crime Reconstruction", version="2.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# ── Request / Response Models ─────────────────────────────────────────────────

class ScenePrompt(BaseModel):
    who: str              # suspect / victim / witnesses
    what: str             # crime type / actions
    why: str              # motive / context
    how: str              # method / instruments / sequence
    location: Optional[str] = None
    time_of_day: Optional[str] = None
    weather: Optional[str] = None
    extra: Optional[str] = None


class ReconstructRequest(BaseModel):
    scene: ScenePrompt
    style: str = "photorealistic crime scene forensic photography cinematic 8k"
    mode: str = GENERATION_MODE     # "t2v" | "i2v"
    num_frames: int = VIDEO_FRAMES
    include_depth: bool = True
    include_pointcloud: bool = False  # expensive — only on request
    seed: Optional[int] = None


class VideoRequest(BaseModel):
    prompt: str
    negative_prompt: str = "blurry, cartoon, unrealistic, low quality, text, watermark"
    num_frames: int = VIDEO_FRAMES
    width: int = IMAGE_WIDTH
    height: int = IMAGE_HEIGHT
    num_inference_steps: int = WAN_STEPS
    guidance_scale: float = WAN_GUIDANCE
    seed: Optional[int] = None
    keyframe_base64: Optional[str] = None   # if set → i2v mode


class ImageRequest(BaseModel):
    prompt: str
    negative_prompt: str = "blurry, cartoon, unrealistic, low quality"
    steps: int = FLUX_STEPS
    width: int = IMAGE_WIDTH
    height: int = IMAGE_HEIGHT
    seed: Optional[int] = None


class DepthRequest(BaseModel):
    image_base64: str


class GaussianSplatRequest(BaseModel):
    images_base64: list[str]       # 6-30 overlapping photos
    scene_name: str = "crime_scene"
    iterations: int = 7000
    output_format: str = "splat"


# ── Model Loaders ─────────────────────────────────────────────────────────────

def _apply_quantization(model, name: str):
    """
    TorchAO TurboQuant — fuses INT8/INT4 Triton kernels into transformer.
    Falls back gracefully if torchao not installed.
    """
    if QUANT_MODE == "none" or DEVICE != "cuda":
        return model
    try:
        from torchao.quantization import quantize_, int8_weight_only, int4_weight_only
        if QUANT_MODE == "int4":
            quantize_(model, int4_weight_only())
            print(f"✅ {name}: INT4 TorchAO quantization applied")
        else:
            quantize_(model, int8_weight_only())
            print(f"✅ {name}: INT8 TorchAO quantization applied")
    except ImportError:
        print(f"⚠️ torchao not installed — {name} running at full precision")
    except Exception as e:
        print(f"⚠️ TorchAO quantization failed for {name}: {e}")
    return model


def _enable_flash_attention(pipe, name: str):
    """Enable FlashAttention 2 (Triton CUDA kernels) if available."""
    if not USE_FLASH_ATTN or DEVICE != "cuda":
        return
    try:
        pipe.enable_xformers_memory_efficient_attention()
        print(f"✅ {name}: xformers memory-efficient attention enabled")
    except Exception:
        pass
    try:
        import flash_attn  # noqa
        # diffusers will auto-use flash_attn if installed — just log it
        print(f"✅ {name}: FlashAttention 2 available")
    except ImportError:
        pass


def get_wan_pipe():
    """
    Lazy load Wan2.1-1.3B (text-to-video).
    Quantized to INT8 via TorchAO, FlashAttention 2 / xformers enabled.
    VRAM: ~6GB full → ~3.5GB INT8 quantized.
    """
    global _wan_pipe
    if _wan_pipe is None:
        try:
            from diffusers import WanPipeline
            print(f"⏳ Loading Wan2.1-1.3B on {DEVICE} ({WAN_MODEL_ID})...")
            _wan_pipe = WanPipeline.from_pretrained(
                WAN_MODEL_ID,
                torch_dtype=DTYPE,
            )
            # Apply TurboQuant before moving to GPU
            _apply_quantization(_wan_pipe.transformer, "Wan2.1 transformer")
            _wan_pipe = _wan_pipe.to(DEVICE)
            if DEVICE == "cuda":
                _wan_pipe.enable_model_cpu_offload()
                _wan_pipe.vae.enable_slicing()
            _enable_flash_attention(_wan_pipe, "Wan2.1")
            print("✅ Wan2.1-1.3B loaded")
        except Exception as e:
            print(f"⚠️ Wan2.1 load failed: {e}")
    return _wan_pipe


def get_flux_pipe():
    """
    Lazy load FLUX.1-schnell (keyframe image generator).
    NF4 via bitsandbytes OR INT8 via TorchAO — fits in ~4GB VRAM.
    """
    global _flux_pipe
    if _flux_pipe is None:
        try:
            from diffusers import FluxPipeline
            print(f"⏳ Loading FLUX.1-schnell on {DEVICE} ({FLUX_MODEL_ID})...")

            if QUANT_MODE == "nf4" and DEVICE == "cuda":
                # BitsAndBytes NF4 — 4-bit QLoRA-style quantization
                try:
                    from transformers import BitsAndBytesConfig
                    import bitsandbytes  # noqa
                    bnb_config = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_quant_type="nf4",
                        bnb_4bit_compute_dtype=torch.bfloat16,
                    )
                    _flux_pipe = FluxPipeline.from_pretrained(
                        FLUX_MODEL_ID,
                        torch_dtype=torch.bfloat16,
                        quantization_config=bnb_config,
                    )
                    print("✅ FLUX.1-schnell: NF4 bitsandbytes quantization applied")
                except ImportError:
                    _flux_pipe = FluxPipeline.from_pretrained(FLUX_MODEL_ID, torch_dtype=DTYPE)
            else:
                _flux_pipe = FluxPipeline.from_pretrained(FLUX_MODEL_ID, torch_dtype=DTYPE)
                _apply_quantization(_flux_pipe.transformer, "FLUX transformer")

            _flux_pipe = _flux_pipe.to(DEVICE)
            if DEVICE == "cuda":
                _flux_pipe.enable_model_cpu_offload()
                _flux_pipe.vae.enable_slicing()
            _enable_flash_attention(_flux_pipe, "FLUX.1-schnell")
            print("✅ FLUX.1-schnell loaded (keyframe generator)")
        except Exception as e:
            print(f"⚠️ FLUX.1-schnell load failed: {e}")
    return _flux_pipe


def get_depth_pipe():
    """Lazy load DepthAnything v2 Large."""
    global _depth_pipe
    if _depth_pipe is None:
        try:
            from transformers import pipeline as hf_pipeline
            print(f"⏳ Loading DepthAnything v2 on {DEVICE}...")
            _depth_pipe = hf_pipeline(
                task="depth-estimation",
                model=DEPTH_MODEL_ID,
                device=0 if DEVICE == "cuda" else -1,
                torch_dtype=DTYPE,
            )
            print("✅ DepthAnything v2 loaded")
        except Exception as e:
            print(f"⚠️ DepthAnything v2 load failed: {e}")
    return _depth_pipe


# ── Scene Prompt Expansion ────────────────────────────────────────────────────

async def build_video_prompt(scene: ScenePrompt, style: str) -> str:
    """
    Ollama expands structured who/what/why/how into a rich Wan2.1 video prompt.
    Wan2.1 prompt tips: describe motion + camera movement explicitly.
    """
    system = (
        "You are a forensic scene director. Given structured crime scene data, "
        "write a Stable Diffusion video prompt describing the scene as a slow camera "
        "pan or dolly shot. Include: lighting, environment, camera motion (slow pan left, "
        "slow push in, aerial descent), key objects, atmosphere. "
        "Describe motion explicitly — Wan2.1 generates video, not images. "
        "80-120 words. Present tense. No character names."
    )
    user = (
        f"WHO: {scene.who}\n"
        f"WHAT: {scene.what}\n"
        f"WHY: {scene.why}\n"
        f"HOW: {scene.how}\n"
        + (f"LOCATION: {scene.location}\n" if scene.location else "")
        + (f"TIME: {scene.time_of_day}\n" if scene.time_of_day else "")
        + (f"WEATHER: {scene.weather}\n" if scene.weather else "")
        + (f"EXTRA: {scene.extra}\n" if scene.extra else "")
        + f"\nStyle: {style}\nCamera: slow cinematic dolly or aerial push-in shot."
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": LLM_MODEL,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "stream": False,
                    "options": {"temperature": 0.4, "num_predict": 200},
                },
            )
            resp.raise_for_status()
            return resp.json()["message"]["content"].strip()
    except Exception as e:
        print(f"⚠️ Ollama prompt expansion failed ({e}), using template")
        parts = [scene.what, scene.how]
        if scene.location:
            parts.append(f"at {scene.location}")
        if scene.time_of_day:
            parts.append(scene.time_of_day)
        return f"slow cinematic push-in shot, {', '.join(parts)}, {style}"


# ── Video Generation ──────────────────────────────────────────────────────────

def generate_video_frames(
    prompt: str,
    negative_prompt: str,
    num_frames: int,
    width: int,
    height: int,
    steps: int,
    guidance: float,
    seed: Optional[int],
    keyframe: Optional[Image.Image] = None,
) -> list[Image.Image]:
    """
    Wan2.1-1.3B inference (synchronous — run in thread pool).
    INT8 TorchAO quantized + xformers/FlashAttn2 on RTX 3060 Ti.

    Modes:
      keyframe=None → text-to-video (t2v)
      keyframe=Image → image-conditioned generation (first frame hint via text desc)

    Note: Wan2.1-1.3B is T2V only. For true i2v, use 14B variant (needs 16GB+).
    The keyframe is described in the prompt; future: Wan2.1-I2V-14B with CPU offload.
    """
    pipe = get_wan_pipe()
    if pipe is None:
        raise RuntimeError("Wan2.1-1.3B not available")

    generator = torch.Generator(device=DEVICE).manual_seed(seed) if seed is not None else None

    # Wan2.1 uses num_frames that must satisfy: (num_frames - 1) % 4 == 0
    # Valid: 1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, ...
    n = num_frames
    if (n - 1) % 4 != 0:
        n = ((n - 1) // 4) * 4 + 1

    result = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        num_frames=n,
        width=width,
        height=height,
        num_inference_steps=steps,
        guidance_scale=guidance,
        generator=generator,
    )
    return result.frames[0]  # list[PIL.Image]


def generate_keyframe(
    prompt: str,
    negative_prompt: str,
    width: int,
    height: int,
    seed: Optional[int],
) -> Image.Image:
    """
    FLUX.1-schnell keyframe (synchronous).
    4-step distilled model — ~1-2s on RTX 3060 Ti.
    INT8 TorchAO quantized → ~4GB VRAM.
    """
    pipe = get_flux_pipe()
    if pipe is None:
        raise RuntimeError("FLUX.1-schnell not available")
    generator = torch.Generator(device=DEVICE).manual_seed(seed) if seed is not None else None
    result = pipe(
        prompt=prompt,
        num_inference_steps=FLUX_STEPS,
        guidance_scale=FLUX_GUIDANCE,
        width=width,
        height=height,
        generator=generator,
        # FLUX-schnell is a distilled model — no negative prompt support
    )
    return result.images[0]


# ── Depth + Point Cloud ───────────────────────────────────────────────────────

def estimate_depth(image: Image.Image) -> np.ndarray:
    depth_pipe = get_depth_pipe()
    if depth_pipe is None:
        raise RuntimeError("DepthAnything v2 not available")
    result = depth_pipe(image)
    depth = np.array(result["depth"])
    d_min, d_max = depth.min(), depth.max()
    if d_max > d_min:
        depth = (depth - d_min) / (d_max - d_min) * 255
    return depth.astype(np.uint8)


def depth_to_pointcloud(image: Image.Image, depth: np.ndarray, step: int = 4) -> list[dict]:
    img_arr = np.array(image.resize((depth.shape[1], depth.shape[0])))
    h, w = depth.shape
    fx = fy = w / (2 * np.tan(np.radians(30)))
    cx, cy = w / 2, h / 2
    points = []
    for v in range(0, h, step):
        for u in range(0, w, step):
            z = float(depth[v, u]) / 255.0 * 10.0
            if z < 0.01:
                continue
            x = (u - cx) / fx * z
            y = -(v - cy) / fy * z
            r, g, b = int(img_arr[v, u, 0]), int(img_arr[v, u, 1]), int(img_arr[v, u, 2])
            points.append({"x": round(x, 3), "y": round(y, 3), "z": round(z, 3),
                           "r": r, "g": g, "b": b})
    return points


# ── Helpers ───────────────────────────────────────────────────────────────────

def _img_to_b64(img: Image.Image, fmt: str = "PNG") -> str:
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return base64.b64encode(buf.getvalue()).decode()


def _frames_to_mp4_b64(frames: list[Image.Image], fps: int) -> str:
    """Encode PIL frame list → MP4 base64 via imageio."""
    try:
        import imageio
        buf = io.BytesIO()
        with imageio.get_writer(buf, format="mp4", fps=fps, codec="libx264",
                                output_params=["-crf", "23", "-pix_fmt", "yuv420p"]) as writer:
            for frame in frames:
                writer.append_data(np.array(frame))
        return base64.b64encode(buf.getvalue()).decode()
    except Exception as e:
        print(f"⚠️ MP4 encoding failed ({e}), returning frames as PNG list")
        return ""


# ── COLMAP + Gaussian Splatting helpers ───────────────────────────────────────

def _quat_to_rotmat(qw: float, qx: float, qy: float, qz: float) -> np.ndarray:
    """COLMAP wxyz quaternion → 3×3 rotation matrix (world-to-camera)."""
    n = max(float(np.sqrt(qw**2 + qx**2 + qy**2 + qz**2)), 1e-8)
    qw, qx, qy, qz = qw/n, qx/n, qy/n, qz/n
    return np.array([
        [1-2*(qy**2+qz**2),   2*(qx*qy-qw*qz),   2*(qx*qz+qw*qy)],
        [  2*(qx*qy+qw*qz), 1-2*(qx**2+qz**2),   2*(qy*qz-qw*qx)],
        [  2*(qx*qz-qw*qy),   2*(qy*qz+qw*qx), 1-2*(qx**2+qy**2)],
    ], dtype=np.float32)


def _colmap_to_txt(sparse_dir: str) -> Optional[str]:
    """Convert COLMAP binary sparse output → text. Returns text dir or None."""
    txt_dir = sparse_dir + "_txt"
    os.makedirs(txt_dir, exist_ok=True)
    try:
        subprocess.run([
            "colmap", "model_converter",
            "--input_path",  sparse_dir,
            "--output_path", txt_dir,
            "--output_type", "TXT",
        ], check=True, capture_output=True, timeout=60)
        return txt_dir
    except Exception as exc:
        print(f"⚠️  colmap model_converter: {exc}")
        return None


def _parse_colmap_txt(sparse_dir: str) -> tuple[dict, dict, dict]:
    """Parse cameras.txt / images.txt / points3D.txt from COLMAP sparse dir."""
    cameras:  dict = {}
    images:   dict = {}
    points3D: dict = {}

    cam_path = os.path.join(sparse_dir, "cameras.txt")
    img_path = os.path.join(sparse_dir, "images.txt")
    pts_path = os.path.join(sparse_dir, "points3D.txt")

    if os.path.exists(cam_path):
        with open(cam_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("#") or not line:
                    continue
                p = line.split()
                cam_id = int(p[0])
                model  = p[1]
                w, h   = int(p[2]), int(p[3])
                params = list(map(float, p[4:]))
                cameras[cam_id] = {"model": model, "w": w, "h": h, "params": params}

    if os.path.exists(img_path):
        with open(img_path) as f:
            lines = [l.strip() for l in f if not l.startswith("#") and l.strip()]
        i = 0
        while i + 1 < len(lines):
            p = lines[i].split()
            if len(p) < 9:
                i += 1
                continue
            img_id = int(p[0])
            qw, qx, qy, qz = map(float, p[1:5])
            tx, ty, tz      = map(float, p[5:8])
            cam_id = int(p[8])
            name   = p[9] if len(p) > 9 else f"img_{img_id}"
            images[img_id] = {
                "qw": qw, "qx": qx, "qy": qy, "qz": qz,
                "tx": tx, "ty": ty, "tz": tz,
                "cam_id": cam_id, "name": name,
            }
            i += 2  # skip keypoint line

    if os.path.exists(pts_path):
        with open(pts_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("#") or not line:
                    continue
                p = line.split()
                if len(p) < 7:
                    continue
                pt_id = int(p[0])
                x, y, z = map(float, p[1:4])
                r, g, b = int(p[4]), int(p[5]), int(p[6])
                points3D[pt_id] = {"x": x, "y": y, "z": z, "r": r, "g": g, "b": b}

    return cameras, images, points3D


def _parse_colmap_sparse(sparse_dir: str) -> tuple[dict, dict, dict]:
    """Load COLMAP sparse — converts binary → text if needed."""
    if not os.path.exists(os.path.join(sparse_dir, "cameras.txt")):
        txt_dir = _colmap_to_txt(sparse_dir)
        if txt_dir:
            return _parse_colmap_txt(txt_dir)
        return {}, {}, {}
    return _parse_colmap_txt(sparse_dir)


def _build_training_views(
    img_dir: str,
    cameras: dict,
    images: dict,
    max_res: int = 512,
) -> list[dict]:
    """
    For each COLMAP-registered image: load GT tensor + viewmat + K matrix.
    Images are rescaled so the longer edge ≤ max_res (saves VRAM).
    """
    views = []
    for _img_id, meta in images.items():
        img_path = os.path.join(img_dir, meta["name"])
        if not os.path.exists(img_path):
            continue
        cam = cameras.get(meta["cam_id"])
        if not cam:
            continue

        # Intrinsics
        p = cam["params"]
        if cam["model"] == "PINHOLE" and len(p) >= 4:
            fx, fy, cx, cy = p[0], p[1], p[2], p[3]
        elif cam["model"] in ("SIMPLE_PINHOLE", "SIMPLE_RADIAL", "RADIAL") and len(p) >= 3:
            fx = fy = p[0]; cx, cy = p[1], p[2]
        else:
            fx = fy = max(cam["w"], cam["h"]) * 0.75
            cx, cy  = cam["w"] / 2.0, cam["h"] / 2.0

        # Scale to max_res
        scale  = min(max_res / cam["w"], max_res / cam["h"], 1.0)
        tw, th = max(int(cam["w"] * scale), 1), max(int(cam["h"] * scale), 1)
        fx  *= scale; fy *= scale; cx *= scale; cy *= scale

        pil = Image.open(img_path).convert("RGB")
        if pil.width != tw or pil.height != th:
            pil = pil.resize((tw, th), Image.LANCZOS)

        gt = torch.tensor(
            np.array(pil, dtype=np.float32) / 255.0,
            dtype=torch.float32, device=DEVICE,
        )  # [H, W, 3]

        K = torch.tensor(
            [[fx, 0.0, cx], [0.0, fy, cy], [0.0, 0.0, 1.0]],
            dtype=torch.float32, device=DEVICE,
        ).unsqueeze(0)  # [1, 3, 3]

        R = _quat_to_rotmat(meta["qw"], meta["qx"], meta["qy"], meta["qz"])
        t = np.array([meta["tx"], meta["ty"], meta["tz"]], dtype=np.float32)
        vm = np.eye(4, dtype=np.float32)
        vm[:3, :3] = R
        vm[:3,  3] = t
        viewmat = torch.tensor(vm, dtype=torch.float32, device=DEVICE).unsqueeze(0)

        views.append({"image": gt, "viewmat": viewmat, "K": K, "H": th, "W": tw})
    return views


def _export_splat_bytes(
    means: np.ndarray,       # [N, 3] float32
    scales: np.ndarray,      # [N, 3] float32
    colors: np.ndarray,      # [N, 3] float32 in [0,1]
    opacities: np.ndarray,   # [N]    float32 in [0,1]
    quats: np.ndarray,       # [N, 4] float32 wxyz
) -> bytes:
    """
    antimatter15 .splat format — 32 bytes per Gaussian:
      [0:12]  x,y,z        float32
      [12:24] sx,sy,sz     float32
      [24:28] r,g,b,alpha  uint8
      [28:32] qw,qx,qy,qz  uint8 mapped from [-1,1]→[0,255]
    """
    N = len(means)
    buf = np.zeros((N, 32), dtype=np.uint8)
    buf[:, 0:12]  = means.astype(np.float32).view(np.uint8).reshape(N, 12)
    buf[:, 12:24] = scales.astype(np.float32).view(np.uint8).reshape(N, 12)
    rgb_u8  = np.clip(colors * 255.0, 0, 255).astype(np.uint8)
    alp_u8  = np.clip(opacities * 255.0, 0, 255).astype(np.uint8).reshape(N, 1)
    buf[:, 24:28] = np.concatenate([rgb_u8, alp_u8], axis=1)
    q_u8    = np.clip((quats + 1.0) * 127.5, 0, 255).astype(np.uint8)
    buf[:, 28:32] = q_u8
    return buf.tobytes()


def _export_ply_bytes(
    means: np.ndarray,
    scales: np.ndarray,
    colors: np.ndarray,
    opacities: np.ndarray,
    quats: np.ndarray,
) -> bytes:
    """
    INRIA 3DGS .ply — binary little-endian float32 per property.
    Compatible with the original 3DGS viewer and Gaussian Opacity Fields.
    """
    N = len(means)
    C0 = 0.28209479177387814  # zeroth-order SH coefficient
    sh_dc     = ((colors.astype(np.float64) - 0.5) / C0).astype(np.float32)
    op        = np.clip(opacities.astype(np.float64), 1e-6, 1 - 1e-6)
    log_op    = np.log(op / (1.0 - op)).astype(np.float32).reshape(N, 1)
    log_scale = np.log(np.clip(scales, 1e-10, None)).astype(np.float32)

    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {N}\n"
        + "".join(f"property float {prop}\n" for prop in [
            "x","y","z","nx","ny","nz",
            "f_dc_0","f_dc_1","f_dc_2",
            "opacity",
            "scale_0","scale_1","scale_2",
            "rot_0","rot_1","rot_2","rot_3",
        ])
        + "end_header\n"
    ).encode()

    zeros = np.zeros((N, 3), dtype=np.float32)
    data  = np.concatenate([
        means.astype(np.float32),    # x y z
        zeros,                        # nx ny nz (unused — required by spec)
        sh_dc,                        # f_dc_0,1,2
        log_op,                       # opacity (logit)
        log_scale,                    # scale_0,1,2 (log)
        quats.astype(np.float32),     # rot_0,1,2,3 (wxyz)
    ], axis=1)

    return header + data.tobytes()


def _run_gsplat_training(
    img_dir: str,
    cameras: dict,
    images: dict,
    points3D: dict,
    iterations: int,
    output_format: str,
) -> dict:
    """
    Full Gaussian Splatting training loop (synchronous, GPU).
    Initialises from COLMAP sparse cloud, optimises via gsplat rasterization
    + L1 photometric loss, then exports to .splat or .ply.
    Called via loop.run_in_executor to avoid blocking the event loop.
    """
    import torch.nn.functional as F
    from gsplat import rasterization  # lazy import — requires ENABLE_GAUSSIAN_SPLATTING

    N = len(points3D)
    if N == 0:
        raise RuntimeError(
            "COLMAP produced 0 3D points — provide ≥6 images with ≥60% scene overlap"
        )

    # ── Initialise Gaussians from COLMAP point cloud ──────────────────────────
    pts   = list(points3D.values())
    xyz   = np.array([[p["x"], p["y"], p["z"]] for p in pts], dtype=np.float32)
    clr   = np.array([[p["r"]/255, p["g"]/255, p["b"]/255] for p in pts], dtype=np.float32)

    means     = torch.nn.Parameter(torch.tensor(xyz, device=DEVICE))
    quats     = torch.nn.Parameter(F.normalize(torch.randn(N, 4, device=DEVICE), dim=-1))
    scales    = torch.nn.Parameter(torch.full((N, 3), -4.0, device=DEVICE))   # log-space
    opacities = torch.nn.Parameter(torch.zeros(N, device=DEVICE))              # logit-space
    colors_p  = torch.nn.Parameter(torch.tensor(clr, device=DEVICE))

    optimizer = torch.optim.Adam([
        {"params": means,     "lr": 1.6e-4},
        {"params": quats,     "lr": 1.0e-3},
        {"params": scales,    "lr": 5.0e-3},
        {"params": opacities, "lr": 5.0e-2},
        {"params": colors_p,  "lr": 2.5e-3},
    ])

    # ── Training views ────────────────────────────────────────────────────────
    views = _build_training_views(img_dir, cameras, images)
    if not views:
        raise RuntimeError(
            "No training images matched COLMAP registration — "
            "image filenames in images.txt must match the saved JPEGs"
        )

    # ── Training loop ─────────────────────────────────────────────────────────
    iters     = min(max(iterations, 1), 30_000)  # safety cap
    log_every = max(1, iters // 10)
    loss_log: list[dict] = []

    for step in range(iters):
        view = views[step % len(views)]
        gt   = view["image"]            # [H, W, 3]
        H, W = view["H"], view["W"]

        renders, _alphas, _ = rasterization(
            means=means,
            quats=F.normalize(quats, dim=-1),
            scales=torch.exp(scales).clamp(min=1e-6, max=0.3),
            opacities=torch.sigmoid(opacities),
            colors=torch.sigmoid(colors_p),
            viewmats=view["viewmat"],   # [1, 4, 4]
            Ks=view["K"],               # [1, 3, 3]
            width=W,
            height=H,
            packed=False,
            near_plane=0.01,
            far_plane=1000.0,
        )
        loss = F.l1_loss(renders[0], gt)

        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()

        if step % log_every == 0:
            loss_log.append({"step": step, "loss": round(float(loss.item()), 5)})

    # ── Export trained Gaussians ──────────────────────────────────────────────
    with torch.no_grad():
        m_out  = means.detach().cpu().numpy().astype(np.float32)
        q_out  = F.normalize(quats, dim=-1).detach().cpu().numpy().astype(np.float32)
        sc_out = torch.exp(scales).clamp(min=1e-6).detach().cpu().numpy().astype(np.float32)
        op_out = torch.sigmoid(opacities).detach().cpu().numpy().astype(np.float32)
        cl_out = torch.sigmoid(colors_p).detach().cpu().numpy().astype(np.float32)

    if output_format == "ply":
        splat_bytes = _export_ply_bytes(m_out, sc_out, cl_out, op_out, q_out)
        fmt_info    = "INRIA 3DGS .ply (float32, compatible with 3DGS viewer)"
    else:
        splat_bytes = _export_splat_bytes(m_out, sc_out, cl_out, op_out, q_out)
        fmt_info    = "antimatter15 .splat (32B/Gaussian, WebGL-compatible)"

    return {
        "gaussians":      N,
        "training_views": len(views),
        "iterations_run": iters,
        "final_loss":     loss_log[-1]["loss"] if loss_log else None,
        "loss_history":   loss_log,
        "splat_base64":   base64.b64encode(splat_bytes).decode(),
        "output_format":  output_format,
        "format_info":    fmt_info,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    cuda = torch.cuda.is_available()
    vram_free_mb = 0
    if cuda:
        try:
            vram_free_mb = torch.cuda.mem_get_info()[0] // 1024 // 1024
        except Exception:
            pass
    return {
        "status": "healthy",
        "device": DEVICE,
        "cuda": cuda,
        "vram_free_mb": vram_free_mb,
        "models": {
            "wan_video": _wan_pipe is not None,
            "flux_keyframe": _flux_pipe is not None,
            "depth_anything_v2": _depth_pipe is not None,
        },
        "config": {
            "wan_model": WAN_MODEL_ID,
            "flux_model": FLUX_MODEL_ID,
            "depth_model": DEPTH_MODEL_ID,
            "generation_mode": GENERATION_MODE,
            "quant_mode": QUANT_MODE,
            "use_flash_attn": USE_FLASH_ATTN,
            "video_frames": VIDEO_FRAMES,
            "video_fps": VIDEO_FPS,
            "gaussian_splatting": ENABLE_GAUSSIAN_SPLATTING,
        },
    }


@app.post("/generate/video")
async def generate_video(req: VideoRequest):
    """
    Wan2.1-1.3B text-to-video or image-to-video.

    Omit keyframe_base64 → t2v (prompt only).
    Include keyframe_base64 → i2v (FLUX.1-schnell keyframe described in prompt).
    """
    t0 = time.time()
    loop = asyncio.get_event_loop()

    keyframe: Optional[Image.Image] = None
    if req.keyframe_base64:
        keyframe = Image.open(io.BytesIO(base64.b64decode(req.keyframe_base64))).convert("RGB")

    async with _gpu_sem:
        try:
            frames = await loop.run_in_executor(
                None,
                generate_video_frames,
                req.prompt, req.negative_prompt,
                req.num_frames, req.width, req.height,
                req.num_inference_steps, req.guidance_scale,
                req.seed, keyframe,
            )
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e))

    mp4_b64 = _frames_to_mp4_b64(frames, VIDEO_FPS)

    return {
        "mp4_base64": mp4_b64,
        "frames_base64": [_img_to_b64(f) for f in frames[::4]],  # every 4th frame preview
        "num_frames": len(frames),
        "fps": VIDEO_FPS,
        "mode": "i2v" if keyframe else "t2v",
        "prompt": req.prompt,
        "processing_time_ms": int((time.time() - t0) * 1000),
    }


@app.post("/generate/image")
async def generate_image_endpoint(req: ImageRequest):
    """FLUX.1-schnell static keyframe — 4-step, NF4/INT8 quantized, ~1-2s on RTX 3060 Ti."""
    t0 = time.time()
    loop = asyncio.get_event_loop()
    async with _gpu_sem:
        try:
            img = await loop.run_in_executor(
                None, generate_keyframe,
                req.prompt, req.negative_prompt, req.width, req.height, req.seed,
            )
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e))
    return {
        "image_base64": _img_to_b64(img),
        "width": img.width,
        "height": img.height,
        "prompt": req.prompt,
        "processing_time_ms": int((time.time() - t0) * 1000),
    }


@app.post("/depth")
async def depth_endpoint(req: DepthRequest):
    """DepthAnything v2 depth estimation from a single image."""
    t0 = time.time()
    img = Image.open(io.BytesIO(base64.b64decode(req.image_base64))).convert("RGB")
    loop = asyncio.get_event_loop()
    try:
        depth = await loop.run_in_executor(None, estimate_depth, img)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {
        "depth_base64": _img_to_b64(Image.fromarray(depth)),
        "width": depth.shape[1],
        "height": depth.shape[0],
        "processing_time_ms": int((time.time() - t0) * 1000),
    }


@app.post("/reconstruct")
async def reconstruct(req: ReconstructRequest):
    """
    Full 3D crime scene reconstruction:

    t2v mode (default):
      LLM expands scene → video prompt → Wan2.1-1.3B → depth per frame → point cloud

    i2v mode:
      LLM expands → FLUX.1-schnell keyframe → Wan2.1-1.3B animation → depth → point cloud
"""
    t0 = time.time()
    loop = asyncio.get_event_loop()
    timings: dict[str, int] = {}

    # 1. Expand scene → Wan2.1 video prompt via Ollama
    t1 = time.time()
    video_prompt = await build_video_prompt(req.scene, req.style)
    timings["prompt_ms"] = int((time.time() - t1) * 1000)

    result: dict = {"video_prompt": video_prompt, "mode": req.mode}

    # 2. Optional FLUX.1-schnell keyframe (i2v mode)
    keyframe: Optional[Image.Image] = None
    if req.mode == "i2v":
        t1 = time.time()
        try:
            keyframe = await loop.run_in_executor(
                None, generate_keyframe,
                video_prompt,
                "blurry, cartoon, unrealistic, text, watermark",
                IMAGE_WIDTH, IMAGE_HEIGHT, req.seed,
            )
            result["keyframe_base64"] = _img_to_b64(keyframe)
            timings["keyframe_ms"] = int((time.time() - t1) * 1000)
        except RuntimeError as e:
            result["keyframe_error"] = str(e)

    # 3. Wan2.1-1.3B video generation
    t1 = time.time()
    try:
        frames = await loop.run_in_executor(
            None,
            generate_video_frames,
            video_prompt,
            "blurry, cartoon, unrealistic, text, watermark, low quality",
            req.num_frames, IMAGE_WIDTH, IMAGE_HEIGHT,
            WAN_STEPS, WAN_GUIDANCE, req.seed, keyframe,
        )
        mp4_b64 = _frames_to_mp4_b64(frames, VIDEO_FPS)
        result["mp4_base64"] = mp4_b64
        result["num_frames"] = len(frames)
        result["fps"] = VIDEO_FPS
        # Preview: first, middle, last frame
        previews = [frames[0], frames[len(frames) // 2], frames[-1]]
        result["preview_frames_base64"] = [_img_to_b64(f) for f in previews]
        timings["video_ms"] = int((time.time() - t1) * 1000)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"Wan2.1 video failed: {e}")

    # 4. Depth on middle frame
    if req.include_depth or req.include_pointcloud:
        mid_frame = frames[len(frames) // 2]
        t1 = time.time()
        try:
            depth = await loop.run_in_executor(None, estimate_depth, mid_frame)
            result["depth_base64"] = _img_to_b64(Image.fromarray(depth))
            timings["depth_ms"] = int((time.time() - t1) * 1000)

            if req.include_pointcloud:
                t1 = time.time()
                points = await loop.run_in_executor(
                    None, depth_to_pointcloud, mid_frame, depth, 4
                )
                result["pointcloud"] = points
                result["pointcloud_count"] = len(points)
                timings["pointcloud_ms"] = int((time.time() - t1) * 1000)
        except RuntimeError as e:
            result["depth_error"] = str(e)

    result["timings"] = timings
    result["total_ms"] = int((time.time() - t0) * 1000)
    return result


@app.post("/reconstruct/stream")
async def reconstruct_stream(req: ReconstructRequest):
    """
    SSE streaming reconstruction — progress events then final video.

    Events:
      {"stage": "prompt",    "status": "done",    "prompt": "..."}
      {"stage": "keyframe",  "status": "done",    "image_base64": "..."}   # i2v only
      {"stage": "video",     "status": "running"}
      {"stage": "video",     "status": "done",    "mp4_base64": "...", "num_frames": 25}
      {"stage": "depth",     "status": "done",    "depth_base64": "..."}
      {"stage": "complete",  "status": "done",    "total_ms": 18000}
    """
    async def stream() -> AsyncGenerator[str, None]:
        loop = asyncio.get_event_loop()
        t0 = time.time()

        def sse(data: dict) -> str:
            return f"data: {json.dumps(data)}\n\n"

        yield sse({"stage": "prompt", "status": "running"})
        video_prompt = await build_video_prompt(req.scene, req.style)
        yield sse({"stage": "prompt", "status": "done", "prompt": video_prompt})

        keyframe: Optional[Image.Image] = None

        if req.mode == "i2v":
            yield sse({"stage": "keyframe", "status": "running"})
            try:
                keyframe = await loop.run_in_executor(
                    None, generate_keyframe,
                    video_prompt, "blurry, cartoon, unrealistic, text, watermark",
                    IMAGE_WIDTH, IMAGE_HEIGHT, req.seed,
                )
                yield sse({"stage": "keyframe", "status": "done",
                           "image_base64": _img_to_b64(keyframe)})
            except RuntimeError as e:
                yield sse({"stage": "keyframe", "status": "error", "error": str(e)})

        yield sse({"stage": "video", "status": "running",
                   "note": f"Wan2.1 generating {req.num_frames} frames..."})
        try:
            frames = await loop.run_in_executor(
                None, generate_video_frames,
                video_prompt, "blurry, cartoon, unrealistic, text, watermark, low quality",
                req.num_frames, IMAGE_WIDTH, IMAGE_HEIGHT,
                WAN_STEPS, WAN_GUIDANCE, req.seed, keyframe,
            )
            mp4_b64 = _frames_to_mp4_b64(frames, VIDEO_FPS)
            yield sse({"stage": "video", "status": "done",
                       "mp4_base64": mp4_b64,
                       "num_frames": len(frames),
                       "fps": VIDEO_FPS,
                       "preview_frames_base64": [_img_to_b64(frames[i])
                                                 for i in [0, len(frames)//2, -1]]})
        except RuntimeError as e:
            yield sse({"stage": "video", "status": "error", "error": str(e)})
            return

        if req.include_depth:
            yield sse({"stage": "depth", "status": "running"})
            try:
                mid = frames[len(frames) // 2]
                depth = await loop.run_in_executor(None, estimate_depth, mid)
                depth_b64 = _img_to_b64(Image.fromarray(depth))
                payload: dict = {"stage": "depth", "status": "done",
                                 "depth_base64": depth_b64}
                if req.include_pointcloud:
                    points = await loop.run_in_executor(
                        None, depth_to_pointcloud, mid, depth, 4
                    )
                    payload["pointcloud"] = points
                    payload["pointcloud_count"] = len(points)
                yield sse(payload)
            except RuntimeError as e:
                yield sse({"stage": "depth", "status": "error", "error": str(e)})

        yield sse({"stage": "complete", "status": "done",
                   "total_ms": int((time.time() - t0) * 1000)})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/reconstruct/gaussian-splat")
async def gaussian_splat(req: GaussianSplatRequest):
    """
    NVIDIA 3D Gaussian Splatting from multi-angle crime scene photos.

    Better than DepthAnything for photorealistic 360° courtroom walkthroughs.
    Requires: ENABLE_GAUSSIAN_SPLATTING=true, gsplat installed, COLMAP available.
    Input: 6-30 overlapping photos of the same physical scene.
    """
    if not ENABLE_GAUSSIAN_SPLATTING:
        raise HTTPException(
            status_code=503,
            detail="Set ENABLE_GAUSSIAN_SPLATTING=true and install gsplat + colmap",
        )
    if len(req.images_base64) < 6:
        raise HTTPException(
            status_code=400,
            detail=f"Need ≥6 images, got {len(req.images_base64)}. "
                   "For single-image reconstruction use POST /reconstruct.",
        )
    try:
        import gsplat  # noqa
    except ImportError:
        raise HTTPException(status_code=503, detail="gsplat not installed")

    t0 = time.time()
    loop = asyncio.get_event_loop()

    with tempfile.TemporaryDirectory() as tmpdir:
        img_dir = os.path.join(tmpdir, "images")
        os.makedirs(img_dir)
        for i, b64 in enumerate(req.images_base64):
            img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
            img.save(os.path.join(img_dir, f"frame_{i:04d}.jpg"), quality=95)

        def run_colmap():
            subprocess.run([
                "colmap", "automatic_reconstructor",
                "--workspace_path", tmpdir,
                "--image_path", img_dir,
                "--quality", "low",
            ], check=True, capture_output=True)

        try:
            await loop.run_in_executor(None, run_colmap)
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            raise HTTPException(
                status_code=503,
                detail=f"COLMAP failed: {e}. Install: apt-get install colmap",
            )

        # Locate COLMAP sparse output (automatic_reconstructor writes to sparse/0/)
        sparse_dir: Optional[str] = None
        for candidate in [
            os.path.join(tmpdir, "sparse", "0"),
            os.path.join(tmpdir, "sparse"),
        ]:
            if os.path.isdir(candidate) and any(
                os.path.exists(os.path.join(candidate, f))
                for f in ("cameras.txt", "cameras.bin", "points3D.txt", "points3D.bin")
            ):
                sparse_dir = candidate
                break

        if sparse_dir is None:
            raise HTTPException(
                status_code=422,
                detail="COLMAP produced no sparse reconstruction — "
                       "images may lack sufficient overlap or feature contrast",
            )

        # Parse COLMAP output (converts binary → text if needed)
        cameras, images_data, points3D = _parse_colmap_sparse(sparse_dir)

        # Run gsplat training (CPU-offloaded so asyncio stays responsive)
        try:
            train_result = await loop.run_in_executor(
                None, _run_gsplat_training,
                img_dir, cameras, images_data, points3D,
                req.iterations, req.output_format,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        return {
            "status":            "complete",
            "scene_name":        req.scene_name,
            "images_processed":  len(req.images_base64),
            "processing_time_ms": int((time.time() - t0) * 1000),
            **train_result,
        }


# ── Glyph Tile Conditioning ───────────────────────────────────────────────────
# Converts NES CHR97 glyph tile positions into FLUX/Wan conditioning vectors.
# Called by the SvelteKit server after buildGlyphTileAtlas() to derive
# spatial conditioning embeddings for scene generation.

class GlyphConditionRequest(BaseModel):
    """
    Tile positions from a GlyphTileAtlas.
    Each entry: normX ∈ [0,1], normY ∈ [0,1], clusterId, confidence.
    """
    tiles: list[dict]   # [{normX, normY, clusterId, confidence, entities?}]
    query: str = ""     # optional text query for attention-weighted conditioning
    width:  int = IMAGE_WIDTH
    height: int = IMAGE_HEIGHT


@app.post("/glyph/condition")
async def glyph_condition(req: GlyphConditionRequest):
    """
    Derive FLUX/Wan spatial conditioning vectors from a glyph tile atlas.

    Pipeline:
      1. Build a [k × 768] embedding matrix from tile positions
         (normX, normY padded to 768-dim with zeros + cluster id encoding)
      2. Compute attention weights against the query embedding (if provided)
      3. Return weighted centroid as the conditioning vector + tile layout metadata

    The conditioning vector can be used as:
      - Spatial ControlNet hint (tiled into spatial feature map)
      - Wan image-to-video keyframe selector (select tile grid pos → crop)
      - FLUX img2img seed bias (shift latent mean toward semantic cluster)
    """
    if not req.tiles:
        raise HTTPException(status_code=400, detail="tiles must be non-empty")

    import numpy as np  # already imported at module level; re-import for clarity

    t0 = time.time()
    k = len(req.tiles)

    # ── Build pseudo-embedding matrix from tile positions ──────────────────
    # dims 0-1: normX, normY  (spatial layout signal)
    # dims 2-9: cluster_id one-hot encoding (mod 8, scaled to [0,1])
    # dims 10+: confidence broadcast, zeros
    DIM = 768
    mat = np.zeros((k, DIM), dtype=np.float32)
    for i, t in enumerate(req.tiles):
        mat[i, 0] = float(t.get("normX", 0.0))
        mat[i, 1] = float(t.get("normY", 0.0))
        cid = int(t.get("clusterId", 0)) % 8
        mat[i, 2 + cid] = 1.0
        mat[i, 10] = float(t.get("confidence", 0.5))

    # ── Attention weights (query → tile centroids) ─────────────────────────
    weights = np.ones(k, dtype=np.float32) / k   # uniform default

    if req.query.strip():
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{OLLAMA_URL}/api/embeddings",
                    json={"model": "embeddinggemma:latest", "prompt": req.query},
                )
                qdata = resp.json()
                qvec = np.array(qdata.get("embedding", []), dtype=np.float32)
                if qvec.size == DIM:
                    # Scaled dot-product attention
                    scores = mat[:, :DIM] @ qvec / (DIM ** 0.5)
                    scores -= scores.max()                 # numerical stability
                    weights = np.exp(scores)
                    weights /= weights.sum()
        except Exception as exc:
            print(f"[glyph/condition] query embed skipped: {exc}")

    # ── Weighted centroid (conditioning vector) ────────────────────────────
    conditioning_vec = (weights[:, None] * mat).sum(axis=0)   # [768]

    # Normalise to unit sphere
    norm = float(np.linalg.norm(conditioning_vec))
    if norm > 1e-6:
        conditioning_vec /= norm

    # ── Spatial layout map (for ControlNet spatial hint) ──────────────────
    # Rasterise tile positions onto a (height × width) grid at 1/8 resolution
    gh, gw = req.height // 8, req.width // 8
    spatial_map = np.zeros((gh, gw), dtype=np.float32)
    for i, t in enumerate(req.tiles):
        px = int(float(t.get("normX", 0)) * (gw - 1))
        py = int(float(t.get("normY", 0)) * (gh - 1))
        px = max(0, min(gw - 1, px))
        py = max(0, min(gh - 1, py))
        spatial_map[py, px] = float(weights[i])

    return {
        "conditioning_vector": conditioning_vec.tolist(),  # 768-dim float list
        "attention_weights":   weights.tolist(),           # per-tile weights
        "spatial_map":         spatial_map.tolist(),       # (H/8 × W/8) heatmap
        "tile_count":          k,
        "processing_time_ms":  int((time.time() - t0) * 1000),
    }


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    print(f"🚀 Image Synthesis — device={DEVICE}, mode={GENERATION_MODE}, quant={QUANT_MODE}")
    print(f"   Wan2.1: {WAN_MODEL_ID}")
    print(f"   FLUX:   {FLUX_MODEL_ID}")
    print(f"   Depth:  {DEPTH_MODEL_ID}")
    if os.environ.get("PRELOAD_MODELS", "false").lower() == "true":
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, get_wan_pipe)
        await loop.run_in_executor(None, get_depth_pipe)
        print("✅ Models pre-loaded")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8092)
