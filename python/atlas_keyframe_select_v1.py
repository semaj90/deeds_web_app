"""Two-stage keyframe selector (PyAV + numpy). Derivative index only; never writes media by default.

Stage 1 (cheap): decode at a low sample rate, keep 64x64 grayscale for change scores and a
9x8 difference hash, and 256x256 grayscale for a sharpness proxy. Every sample keeps its
presentation timestamp (PTS in milliseconds, plus the stream time base as a rational string).

Stage 2 (selection): keep frames with a visual change, plus a periodic fallback so long static
stretches are still covered. Near-duplicates (small dhash distance within a short window) are
dropped. The result is capped deterministically.

Output is a receipt. Heavier models (YOLOX, SAM 2, depth) run later, only on the selected frames.
Source video is read by byte hash; nothing is uploaded or persisted here.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

SELECTOR_SCHEMA = "atlas-keyframe-select.v1"


@dataclass
class Sample:
    index: int
    pts_ms: int
    gray64: np.ndarray
    sharp: float
    dhash: int


@dataclass
class Keyframe:
    pts_ms: int
    sample_index: int
    reason: str
    change: float
    sharpness: float
    dhash_hex: str


def dhash(gray_9x8: np.ndarray) -> int:
    """64-bit difference hash from a 9-wide by 8-tall grayscale array."""
    diff = gray_9x8[:, 1:] > gray_9x8[:, :-1]
    bits = 0
    for bit in diff.flatten():
        bits = (bits << 1) | int(bool(bit))
    return bits


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def mean_change(a: np.ndarray, b: np.ndarray) -> float:
    """Mean absolute difference between two 64x64 grayscale frames, normalized to 0..1."""
    return float(np.abs(a.astype(np.float32) - b.astype(np.float32)).mean() / 255.0)


def sharpness_proxy(gray256: np.ndarray) -> float:
    """Mean absolute gradient. Higher means more edge detail. A proxy, not a blur measurement."""
    g = gray256.astype(np.float32)
    gx = np.abs(np.diff(g, axis=1)).mean()
    gy = np.abs(np.diff(g, axis=0)).mean()
    return float(gx + gy)


def sample_video(path: Path, sample_fps: float = 1.0, max_samples: int = 7200) -> tuple[list[Sample], dict]:
    import av

    if sample_fps <= 0:
        raise ValueError("SAMPLE_FPS_MUST_BE_POSITIVE")
    samples: list[Sample] = []
    with av.open(str(path)) as container:
        streams = [s for s in container.streams if s.type == "video"]
        if not streams:
            raise ValueError("NO_VIDEO_STREAM")
        stream = streams[0]
        time_base = stream.time_base
        step = 1.0 / sample_fps
        next_t = 0.0
        for frame in container.decode(stream):
            if frame.time is None:
                continue
            if frame.time + 1e-9 < next_t:
                continue
            next_t = frame.time + step
            g64 = frame.reformat(width=64, height=64, format="gray").to_ndarray()
            g9x8 = frame.reformat(width=9, height=8, format="gray").to_ndarray()
            g256 = frame.reformat(width=256, height=256, format="gray").to_ndarray()
            samples.append(
                Sample(
                    index=len(samples),
                    pts_ms=int(round(frame.time * 1000)),
                    gray64=g64.reshape(64, 64),
                    sharp=sharpness_proxy(g256.reshape(256, 256)),
                    dhash=dhash(g9x8.reshape(8, 9)),
                )
            )
            if len(samples) >= max_samples:
                break
        meta = {
            "timeBase": f"{time_base.numerator}/{time_base.denominator}" if time_base else None,
            "durationS": float(container.duration / 1_000_000) if container.duration else None,
            "codec": stream.codec_context.name,
            "width": stream.codec_context.width,
            "height": stream.codec_context.height,
        }
    return samples, meta


def select_keyframes(
    samples: list[Sample],
    change_threshold: float = 0.08,
    max_gap_ms: int = 10_000,
    min_gap_ms: int = 2_000,
    dedupe_hamming: int = 6,
    max_keyframes: int = 200,
) -> list[Keyframe]:
    if not samples:
        return []
    selected: list[Keyframe] = []
    last_selected: Sample | None = None
    prev: Sample | None = None
    for s in samples:
        change = mean_change(s.gray64, prev.gray64) if prev is not None else 1.0
        reason = None
        if prev is None:
            reason = "first_frame"
        elif change >= change_threshold:
            reason = "visual_change"
        elif last_selected is not None and s.pts_ms - last_selected.pts_ms >= max_gap_ms:
            reason = "periodic_fallback"
        prev = s
        if reason is None:
            continue
        if last_selected is not None:
            near_in_time = s.pts_ms - last_selected.pts_ms < min_gap_ms
            near_in_look = hamming(s.dhash, last_selected.dhash) <= dedupe_hamming
            if near_in_time and near_in_look and reason != "first_frame":
                continue
        selected.append(
            Keyframe(
                pts_ms=s.pts_ms,
                sample_index=s.index,
                reason=reason,
                change=round(change, 6),
                sharpness=round(s.sharp, 4),
                dhash_hex=f"{s.dhash:016x}",
            )
        )
        last_selected = s
    if len(selected) > max_keyframes:
        # Deterministic, evenly spaced cap that keeps the first and last selections.
        idx = np.linspace(0, len(selected) - 1, max_keyframes).round().astype(int)
        selected = [selected[i] for i in sorted(set(idx.tolist()))]
    return selected


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def build_receipt(path: Path, meta: dict, samples: list[Sample], keyframes: list[Keyframe], params: dict) -> dict:
    return {
        "schema": SELECTOR_SCHEMA,
        "source": {"sha256": sha256_file(path), "bytes": path.stat().st_size, **meta},
        "params": params,
        "sampling": {"sampledFrames": len(samples), "firstPtsMs": samples[0].pts_ms if samples else None,
                     "lastPtsMs": samples[-1].pts_ms if samples else None},
        "keyframes": [asdict(k) for k in keyframes],
        "limits": [
            "derivative index only; not evidence and not a semantic event detection",
            "change score is pixel-level; it cannot tell a moving object from lighting change",
            "sharpness is a gradient proxy, not a blur measurement",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--sample-fps", type=float, default=1.0)
    parser.add_argument("--change-threshold", type=float, default=0.08)
    parser.add_argument("--max-keyframes", type=int, default=200)
    args = parser.parse_args()
    samples, meta = sample_video(args.video, sample_fps=args.sample_fps)
    params = {"sampleFps": args.sample_fps, "changeThreshold": args.change_threshold,
              "maxKeyframes": args.max_keyframes}
    keyframes = select_keyframes(samples, change_threshold=args.change_threshold, max_keyframes=args.max_keyframes)
    print(json.dumps(build_receipt(args.video, meta, samples, keyframes, params), indent=2))


if __name__ == "__main__":
    main()
