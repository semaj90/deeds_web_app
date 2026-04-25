"""
Audio Analysis Router
FastAPI endpoints for audio/video transcription using Whisper
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from pathlib import Path

from ..services.whisper_service import get_whisper_service, TranscriptSegment

router = APIRouter(prefix="/audio", tags=["audio"])

# ============================================================================
# Request/Response Models
# ============================================================================

class TranscriptionRequest(BaseModel):
    """Request for audio transcription"""
    evidence_id: str = Field(..., description="Evidence UUID")
    language: Optional[str] = Field(None, description="Language code (en/es/etc) or None for auto-detect")
    task: str = Field("transcribe", description="'transcribe' or 'translate' (to English)")
    word_timestamps: bool = Field(False, description="Enable word-level timestamps")

class TranscriptSegmentResponse(BaseModel):
    """Single transcription segment"""
    start: float = Field(..., description="Start time in seconds")
    end: float = Field(..., description="End time in seconds")
    text: str = Field(..., description="Transcribed text")
    confidence: float = Field(..., description="Confidence score")
    duration: float = Field(..., description="Segment duration")

class TranscriptionResponse(BaseModel):
    """Response for transcription"""
    evidence_id: str
    text: str = Field(..., description="Full transcribed text")
    language: str = Field(..., description="Detected/specified language")
    segments: List[TranscriptSegmentResponse]
    word_count: int
    duration: float = Field(..., description="Total duration in seconds")

class LanguageDetectionResponse(BaseModel):
    """Response for language detection"""
    evidence_id: str
    probabilities: Dict[str, float] = Field(..., description="Language code -> probability")
    top_language: str
    top_probability: float

class AudioFeatureResponse(BaseModel):
    """Response for audio feature extraction"""
    evidence_id: str
    embedding: List[float] = Field(..., description="512-dim Whisper audio embedding")
    embedding_dim: int = Field(512)

# ============================================================================
# Endpoints
# ============================================================================

@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    evidence_id: str = Query(..., description="Evidence UUID"),
    language: Optional[str] = Query(None, description="Language code or None for auto-detect"),
    task: str = Query("transcribe", description="'transcribe' or 'translate'"),
    word_timestamps: bool = Query(False, description="Enable word-level timestamps")
):
    """
    Transcribe audio/video evidence to text using Whisper

    - **file**: Audio/video file (WAV/MP3/M4A/MP4/etc)
    - **evidence_id**: Evidence record UUID
    - **language**: Language code (en, es, fr, etc) or None for auto-detection
    - **task**: 'transcribe' (original language) or 'translate' (to English)
    - **word_timestamps**: Enable word-level timing (slower)

    Supports all ffmpeg-compatible audio/video formats
    """
    try:
        # Read audio bytes
        audio_bytes = await file.read()

        # Get Whisper service
        whisper = get_whisper_service()

        # Transcribe
        result = await whisper.transcribe(
            audio_bytes,
            language=language,
            task=task,
            word_timestamps=word_timestamps
        )

        # Convert segments
        segments = [
            TranscriptSegmentResponse(**seg.to_dict())
            for seg in result.segments
        ]

        return TranscriptionResponse(
            evidence_id=evidence_id,
            text=result.text,
            language=result.language,
            segments=segments,
            word_count=len(result.text.split()),
            duration=result.segments[-1].end if result.segments else 0.0
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

@router.post("/detect-language", response_model=LanguageDetectionResponse)
async def detect_language(
    file: UploadFile = File(...),
    evidence_id: str = Query(..., description="Evidence UUID")
):
    """
    Detect spoken language in audio

    - **file**: Audio file (WAV/MP3/M4A/etc)
    - **evidence_id**: Evidence record UUID

    Returns probabilities for all detected languages
    """
    try:
        audio_bytes = await file.read()
        whisper = get_whisper_service()

        probs = await whisper.detect_language(audio_bytes)

        # Find top language
        top_lang = max(probs.items(), key=lambda x: x[1])

        return LanguageDetectionResponse(
            evidence_id=evidence_id,
            probabilities=probs,
            top_language=top_lang[0],
            top_probability=top_lang[1]
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Language detection failed: {str(e)}")

@router.post("/extract-features", response_model=AudioFeatureResponse)
async def extract_audio_features(
    file: UploadFile = File(...),
    evidence_id: str = Query(..., description="Evidence UUID")
):
    """
    Extract Whisper's internal audio embeddings (512-dim)

    - **file**: Audio file (WAV/MP3/M4A/etc)
    - **evidence_id**: Evidence record UUID

    Useful for audio similarity search and clustering
    """
    try:
        audio_bytes = await file.read()
        whisper = get_whisper_service()

        embedding = await whisper.extract_audio_features(audio_bytes)

        return AudioFeatureResponse(
            evidence_id=evidence_id,
            embedding=embedding.tolist(),
            embedding_dim=len(embedding)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feature extraction failed: {str(e)}")

@router.get("/health")
async def audio_health():
    """Audio service health check"""
    whisper = get_whisper_service()

    return JSONResponse({
        "status": "healthy",
        "service": whisper.get_stats()
    })