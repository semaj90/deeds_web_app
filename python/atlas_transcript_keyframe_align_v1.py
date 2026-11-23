"""Attach keyframes to transcript segments by time window. Pure logic; no model or service calls.

A keyframe belongs to a segment when start_ms <= pts_ms < end_ms (half-open, so a frame on a
boundary attaches to exactly one segment). Attached text is only OCR text from those frames and
the segment's own transcript text. No words are created.
"""
from __future__ import annotations


def _ocr_text(frame: dict) -> str:
    words = frame.get("fullFrameOcr", {}).get("enhanced") or frame.get("fullFrameOcr", {}).get("raw") or []
    return " ".join(w["text"] for w in words)


def align(segments: list[dict], frames: list[dict], tolerance_ms: int = 0) -> list[dict]:
    """segments: [{'id','start_ms','end_ms','text'}]; frames: analysis frames with 'framePtsMs'."""
    out = []
    for seg in segments:
        if seg["end_ms"] <= seg["start_ms"]:
            raise ValueError("SEGMENT_NOT_POSITIVE_DURATION")
        lo, hi = seg["start_ms"] - tolerance_ms, seg["end_ms"] + tolerance_ms
        attached = [f for f in frames if lo <= f["framePtsMs"] < hi]
        out.append({
            "segmentId": seg["id"],
            "startMs": seg["start_ms"],
            "endMs": seg["end_ms"],
            "transcriptText": seg["text"],
            "keyframes": [{
                "framePtsMs": f["framePtsMs"],
                "onScreenText": _ocr_text(f),
                "detectedClasses": sorted({b["classLabel"] for b in f.get("boxes", [])}),
            } for f in attached],
            "status": "ALIGNED" if attached else "NO_KEYFRAME_IN_WINDOW",
        })
    return out
