"""Persistent faster-whisper CPU ASR worker (challenger-scope transcription lane).

Loads the Whisper model once and serves bounded transcription jobs over HTTP.
Runs in its own venv (pinned: faster-whisper 1.2.1, av 18.1.0) because PyAV 19
breaks faster-whisper 1.2.1. Never downloads models (local_files_only=True).

Endpoints:
  GET  /health      -> model, threads, allowed roots, load state
  POST /transcribe  -> {"path": "...", "word_timestamps": false, "beam_size": 1}

Security: only files under ASR_ALLOWED_ROOTS (';'-separated) are readable.
One transcription at a time (CPU lock). Results are returned, never persisted here.
"""
from __future__ import annotations

import os
import threading
import time
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODEL_SIZE = os.environ.get("ASR_MODEL_SIZE", "base")
DEVICE = "cpu"
COMPUTE_TYPE = os.environ.get("ASR_COMPUTE_TYPE", "int8")
CPU_THREADS = int(os.environ.get("ASR_CPU_THREADS", "4"))
ALLOWED_ROOTS = [
    Path(p).resolve()
    for p in os.environ.get("ASR_ALLOWED_ROOTS", r"C:\Users\james\Music").split(";")
    if p.strip()
]
MAX_DURATION_S = float(os.environ.get("ASR_MAX_DURATION_S", "1800"))

app = FastAPI(title="faster-whisper-asr-worker", version="1.0.0")
_lock = threading.Lock()
_model = None
_load_error: Optional[str] = None
_load_seconds: Optional[float] = None


def _load() -> None:
    global _model, _load_error, _load_seconds
    try:
        from faster_whisper import WhisperModel

        t0 = time.perf_counter()
        _model = WhisperModel(
            MODEL_SIZE,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            cpu_threads=CPU_THREADS,
            num_workers=1,
            local_files_only=True,
        )
        _load_seconds = round(time.perf_counter() - t0, 2)
    except Exception as exc:  # fail closed: health reports it
        _load_error = f"{type(exc).__name__}: {exc}"


_load()


class TranscribeRequest(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
    word_timestamps: bool = False
    beam_size: int = Field(default=1, ge=1, le=5)


def _resolve_allowed(path_str: str) -> Path:
    p = Path(path_str).resolve()
    for root in ALLOWED_ROOTS:
        try:
            p.relative_to(root)
            if p.is_file():
                return p
        except ValueError:
            continue
    raise HTTPException(status_code=403, detail="path outside ASR_ALLOWED_ROOTS or not a file")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok" if _model is not None else "unavailable",
        "model_size": MODEL_SIZE,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "cpu_threads": CPU_THREADS,
        "load_seconds": _load_seconds,
        "allowed_roots": [str(r) for r in ALLOWED_ROOTS],
        "max_duration_s": MAX_DURATION_S,
        "load_error": _load_error,
    }


@app.post("/transcribe")
def transcribe(req: TranscribeRequest) -> dict:
    if _model is None:
        raise HTTPException(status_code=503, detail=_load_error or "model not loaded")
    audio = _resolve_allowed(req.path)
    t0 = time.perf_counter()
    with _lock:
        segments, info = _model.transcribe(
            str(audio),
            beam_size=req.beam_size,
            vad_filter=False,
            word_timestamps=req.word_timestamps,
        )
        if info.duration > MAX_DURATION_S:
            raise HTTPException(status_code=413, detail=f"duration {info.duration:.0f}s exceeds limit")
        rows: List[dict] = []
        for s in segments:
            item = {"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()}
            if req.word_timestamps:
                item["words"] = [
                    {"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word}
                    for w in (s.words or [])
                ]
            rows.append(item)
    return {
        "language": info.language,
        "duration_s": round(info.duration, 3),
        "model_size": MODEL_SIZE,
        "compute_type": COMPUTE_TYPE,
        "cpu_threads": CPU_THREADS,
        "transcribe_seconds": round(time.perf_counter() - t0, 3),
        "segments": rows,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8093")))
