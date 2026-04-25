"""
Multimodal Analysis Router
FastAPI endpoints for unified vision + audio + text evidence analysis
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import asyncio
from pathlib import Path
import tempfile

from ..services.yolo_service import get_yolo_service
from ..services.whisper_service import get_whisper_service
from ..services.clip_service import get_clip_service

router = APIRouter(prefix="/multimodal", tags=["multimodal"])

# ============================================================================
# Request/Response Models
# ============================================================================

class MultimodalAnalysisRequest(BaseModel):
    """Request for complete multimodal analysis"""
    evidence_id: str = Field(..., description="Evidence UUID")
    evidence_type: str = Field(..., description="video/audio/image/document")
    analyze_vision: bool = Field(True, description="Run YOLO object detection")
    analyze_audio: bool = Field(True, description="Run Whisper transcription")
    extract_embeddings: bool = Field(True, description="Extract CLIP/Whisper embeddings")

class MultimodalSearchRequest(BaseModel):
    """Request for cross-modal search"""
    query: str = Field(..., description="Text query")
    modalities: List[str] = Field(["vision", "audio", "text"], description="Search modalities")
    top_k: int = Field(10, ge=1, le=100, description="Number of results")

class EmbeddingDistance(BaseModel):
    """Distance between query and evidence"""
    evidence_id: str
    modality: str = Field(..., description="vision/audio/text")
    distance: float = Field(..., description="Cosine distance (lower is more similar)")
    similarity: float = Field(..., description="Cosine similarity (higher is more similar)")

class MultimodalAnalysisResponse(BaseModel):
    """Response for complete multimodal analysis"""
    evidence_id: str
    evidence_type: str
    vision_analysis: Optional[Dict[str, Any]] = None  # YOLO detections
    audio_analysis: Optional[Dict[str, Any]] = None   # Whisper transcription
    embeddings: Optional[Dict[str, List[float]]] = None  # CLIP/Whisper features
    processing_time_ms: float

class MultimodalSearchResponse(BaseModel):
    """Response for cross-modal search"""
    query: str
    results: List[EmbeddingDistance]
    total_searched: int

# ============================================================================
# Endpoints
# ============================================================================

@router.post("/analyze", response_model=MultimodalAnalysisResponse)
async def analyze_multimodal_evidence(
    file: UploadFile = File(...),
    evidence_id: str = Query(...),
    evidence_type: str = Query(..., description="video/audio/image"),
    analyze_vision: bool = Query(True),
    analyze_audio: bool = Query(True),
    extract_embeddings: bool = Query(True)
):
    """
    Complete multimodal evidence analysis

    - **file**: Evidence file (video/audio/image)
    - **evidence_id**: Evidence UUID
    - **evidence_type**: Type of evidence (video/audio/image)
    - **analyze_vision**: Run YOLO object detection (images/videos)
    - **analyze_audio**: Run Whisper transcription (audio/videos)
    - **extract_embeddings**: Extract CLIP (vision) and Whisper (audio) embeddings

    For videos: extracts both visual and audio analysis
    For images: extracts YOLO detections + CLIP embeddings
    For audio: extracts Whisper transcription + audio features
    """
    import time
    start_time = time.time()

    try:
        # Read file bytes
        file_bytes = await file.read()

        results = {
            "evidence_id": evidence_id,
            "evidence_type": evidence_type,
            "vision_analysis": None,
            "audio_analysis": None,
            "embeddings": {}
        }

        # Get services
        yolo = get_yolo_service()
        whisper = get_whisper_service()
        clip_svc = get_clip_service()

        tasks = []

        # Vision analysis (images + videos)
        if analyze_vision and evidence_type in ["image", "video"]:
            if evidence_type == "image":
                # Image: YOLO detection + CLIP embedding
                async def vision_pipeline():
                    vision_tasks = [yolo.detect(file_bytes, confidence_threshold=0.5)]
                    if extract_embeddings:
                        vision_tasks.append(clip_svc.embed_image(file_bytes))

                    vision_results = await asyncio.gather(*vision_tasks)
                    detections = vision_results[0]
                    clip_emb = vision_results[1].tolist() if extract_embeddings else None

                    return {
                        "objects": [det.to_dict() for det in detections],
                        "object_count": len(detections),
                        "clip_embedding": clip_emb
                    }
                tasks.append(("vision", vision_pipeline()))

            elif evidence_type == "video":
                # Video: Sample frames for YOLO detection
                async def video_vision_pipeline():
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.video') as tmp:
                        tmp.write(file_bytes)
                        tmp_path = Path(tmp.name)

                    try:
                        frame_detections = await yolo.detect_video_frames(
                            tmp_path,
                            sample_fps=1.0,
                            confidence_threshold=0.5
                        )

                        return {
                            "frames": [
                                {
                                    "timestamp": ts,
                                    "objects": [det.to_dict() for det in dets]
                                }
                                for ts, dets in frame_detections
                            ],
                            "total_frames": len(frame_detections)
                        }
                    finally:
                        tmp_path.unlink(missing_ok=True)

                tasks.append(("vision", video_vision_pipeline()))

        # Audio analysis (audio + videos)
        if analyze_audio and evidence_type in ["audio", "video"]:
            async def audio_pipeline():
                audio_tasks = [whisper.transcribe(file_bytes, language=None)]
                if extract_embeddings:
                    audio_tasks.append(whisper.extract_audio_features(file_bytes))

                audio_results = await asyncio.gather(*audio_tasks)
                transcription = audio_results[0]
                audio_emb = audio_results[1].tolist() if extract_embeddings else None

                return {
                    "text": transcription.text,
                    "language": transcription.language,
                    "segments": [seg.to_dict() for seg in transcription.segments],
                    "word_count": len(transcription.text.split()),
                    "audio_embedding": audio_emb
                }
            tasks.append(("audio", audio_pipeline()))

        # Execute all pipelines in parallel
        if tasks:
            completed = await asyncio.gather(*[task for _, task in tasks])

            for (modality, _), result in zip(tasks, completed):
                if modality == "vision":
                    results["vision_analysis"] = result
                    if "clip_embedding" in result and result["clip_embedding"]:
                        results["embeddings"]["clip"] = result.pop("clip_embedding")
                elif modality == "audio":
                    results["audio_analysis"] = result
                    if "audio_embedding" in result and result["audio_embedding"]:
                        results["embeddings"]["whisper"] = result.pop("audio_embedding")

        processing_time = (time.time() - start_time) * 1000

        return MultimodalAnalysisResponse(
            **results,
            processing_time_ms=processing_time
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multimodal analysis failed: {str(e)}")

@router.post("/search", response_model=MultimodalSearchResponse)
async def cross_modal_search(
    query: str = Query(..., description="Text search query"),
    modalities: List[str] = Query(["vision", "audio"], description="Modalities to search"),
    top_k: int = Query(10, ge=1, le=100)
):
    """
    Cross-modal semantic search using CLIP text embeddings

    - **query**: Text search query (e.g., "person with weapon")
    - **modalities**: Which modalities to search (vision/audio/text)
    - **top_k**: Number of results to return

    NOTE: This is a mock implementation. In production, this would:
    1. Embed query text using CLIP
    2. Query Qdrant multimodal_evidence collection
    3. Return top-k nearest neighbors across modalities
    """
    try:
        clip_svc = get_clip_service()

        # Embed query
        query_embedding = await clip_svc.embed_text(query)

        # Mock: In production, query Qdrant here
        # For now, return example structure
        results = []

        # This would be replaced with actual Qdrant search:
        # from ..services.qdrant_service import get_qdrant_service
        # qdrant = get_qdrant_service()
        # search_results = await qdrant.search(
        #     collection="multimodal_evidence",
        #     query_vector=query_embedding.tolist(),
        #     limit=top_k,
        #     filter={"modality": {"$in": modalities}}
        # )

        return MultimodalSearchResponse(
            query=query,
            results=results,
            total_searched=0
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cross-modal search failed: {str(e)}")

@router.post("/compare-embeddings")
async def compare_embeddings(
    embedding1: List[float] = Query(..., description="First embedding vector"),
    embedding2: List[float] = Query(..., description="Second embedding vector")
):
    """
    Compute cosine similarity between two embeddings

    - **embedding1**: First embedding vector (512-dim)
    - **embedding2**: Second embedding vector (512-dim)

    Returns cosine similarity score (0.0-1.0, higher is more similar)
    """
    try:
        import numpy as np

        emb1 = np.array(embedding1)
        emb2 = np.array(embedding2)

        # Compute cosine similarity (dot product of L2-normalized vectors)
        similarity = float(np.dot(emb1, emb2))

        return JSONResponse({
            "similarity": similarity,
            "distance": 1.0 - similarity
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Comparison failed: {str(e)}")

@router.get("/health")
async def multimodal_health():
    """Multimodal service health check"""
    yolo = get_yolo_service()
    whisper = get_whisper_service()
    clip_svc = get_clip_service()

    return JSONResponse({
        "status": "healthy",
        "services": {
            "yolo": yolo.get_stats(),
            "whisper": whisper.get_stats(),
            "clip": clip_svc.get_stats()
        }
    })