"""
Vision Analysis Router
FastAPI endpoints for image/video evidence analysis using YOLO + CLIP
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional
import asyncio
from pathlib import Path

from ..services.yolo_service import get_yolo_service, BoundingBox
from ..services.clip_service import get_clip_service

router = APIRouter(prefix="/vision", tags=["vision"])

# ============================================================================
# Request/Response Models
# ============================================================================

class VisionAnalysisRequest(BaseModel):
    """Request for vision analysis"""
    evidence_id: str = Field(..., description="Evidence UUID")
    confidence_threshold: float = Field(0.5, ge=0.0, le=1.0, description="Min detection confidence")
    extract_clip_embedding: bool = Field(True, description="Extract CLIP embedding")

class DetectedObject(BaseModel):
    """Detected object in image/video"""
    bbox: List[float] = Field(..., description="[x1, y1, x2, y2]")
    confidence: float = Field(..., description="Detection confidence")
    class_name: str = Field(..., description="Object class name")
    class_id: int = Field(..., description="COCO class ID")
    center: List[float] = Field(..., description="[cx, cy]")
    area: float = Field(..., description="Bounding box area")

class VisionAnalysisResponse(BaseModel):
    """Response for vision analysis"""
    evidence_id: str
    objects: List[DetectedObject]
    object_count: int
    clip_embedding: Optional[List[float]] = None
    image_dimensions: Optional[List[int]] = None  # [width, height]

class ZeroShotClassifyRequest(BaseModel):
    """Request for zero-shot classification"""
    evidence_id: str
    candidate_labels: List[str] = Field(..., min_items=2, description="Possible class labels")

class ZeroShotClassifyResponse(BaseModel):
    """Response for zero-shot classification"""
    evidence_id: str
    predictions: List[tuple[str, float]] = Field(..., description="(label, score) sorted by score")

class VideoAnalysisRequest(BaseModel):
    """Request for video frame analysis"""
    evidence_id: str
    sample_fps: float = Field(1.0, gt=0, le=30, description="Frame sampling rate")
    confidence_threshold: float = Field(0.5, ge=0.0, le=1.0)

class VideoFrameDetections(BaseModel):
    """Detections for single video frame"""
    timestamp: float = Field(..., description="Seconds from start")
    objects: List[DetectedObject]

class VideoAnalysisResponse(BaseModel):
    """Response for video analysis"""
    evidence_id: str
    frames: List[VideoFrameDetections]
    total_frames: int
    duration: float = Field(..., description="Video duration in seconds")

# ============================================================================
# Endpoints
# ============================================================================

@router.post("/analyze", response_model=VisionAnalysisResponse)
async def analyze_image(
    file: UploadFile = File(...),
    evidence_id: str = Query(..., description="Evidence UUID"),
    confidence_threshold: float = Query(0.5, ge=0.0, le=1.0),
    extract_clip_embedding: bool = Query(True)
):
    """
    Analyze image evidence: detect objects + extract CLIP embedding

    - **file**: Image file (JPEG/PNG)
    - **evidence_id**: Evidence record UUID
    - **confidence_threshold**: Min YOLO detection confidence (0.0-1.0)
    - **extract_clip_embedding**: Whether to extract 512-dim CLIP embedding
    """
    try:
        # Read image bytes
        image_bytes = await file.read()

        # Get services
        yolo = get_yolo_service()
        clip_svc = get_clip_service()

        # Parallel: YOLO detection + CLIP embedding
        tasks = [yolo.detect(image_bytes, confidence_threshold=confidence_threshold)]
        if extract_clip_embedding:
            tasks.append(clip_svc.embed_image(image_bytes))

        results = await asyncio.gather(*tasks)
        detections = results[0]
        clip_emb = results[1].tolist() if extract_clip_embedding else None

        # Get image dimensions
        from PIL import Image
        import io
        image = Image.open(io.BytesIO(image_bytes))
        dimensions = [image.width, image.height]

        # Convert detections
        objects = [DetectedObject(**det.to_dict()) for det in detections]

        return VisionAnalysisResponse(
            evidence_id=evidence_id,
            objects=objects,
            object_count=len(objects),
            clip_embedding=clip_emb,
            image_dimensions=dimensions
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision analysis failed: {str(e)}")

@router.post("/classify", response_model=ZeroShotClassifyResponse)
async def zero_shot_classify(
    file: UploadFile = File(...),
    request: ZeroShotClassifyRequest = None
):
    """
    Zero-shot image classification using CLIP

    - **file**: Image file (JPEG/PNG)
    - **request**: Classification request with candidate labels

    Example labels: ["weapon", "document", "vehicle", "person", "building"]
    """
    try:
        image_bytes = await file.read()
        clip_svc = get_clip_service()

        predictions = await clip_svc.zero_shot_classify(
            image_bytes,
            candidate_labels=request.candidate_labels,
            return_scores=True
        )

        return ZeroShotClassifyResponse(
            evidence_id=request.evidence_id,
            predictions=predictions
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")

@router.post("/analyze-video", response_model=VideoAnalysisResponse)
async def analyze_video(
    file: UploadFile = File(...),
    request: VideoAnalysisRequest = None
):
    """
    Analyze video evidence: detect objects in sampled frames

    - **file**: Video file (MP4/AVI/MOV)
    - **request**: Analysis parameters (sample_fps, confidence_threshold)

    Samples frames at specified FPS and runs YOLO detection on each
    """
    try:
        # Save uploaded video to temp file
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.video') as tmp:
            tmp.write(await file.read())
            tmp_path = Path(tmp.name)

        try:
            yolo = get_yolo_service()
            frame_detections = await yolo.detect_video_frames(
                tmp_path,
                sample_fps=request.sample_fps,
                confidence_threshold=request.confidence_threshold
            )

            # Convert to response format
            frames = []
            for timestamp, detections in frame_detections:
                objects = [DetectedObject(**det.to_dict()) for det in detections]
                frames.append(VideoFrameDetections(
                    timestamp=timestamp,
                    objects=objects
                ))

            duration = frames[-1].timestamp if frames else 0.0

            return VideoAnalysisResponse(
                evidence_id=request.evidence_id,
                frames=frames,
                total_frames=len(frames),
                duration=duration
            )
        finally:
            tmp_path.unlink(missing_ok=True)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video analysis failed: {str(e)}")

@router.get("/health")
async def vision_health():
    """Vision service health check"""
    yolo = get_yolo_service()
    clip_svc = get_clip_service()

    return JSONResponse({
        "status": "healthy",
        "services": {
            "yolo": yolo.get_stats(),
            "clip": clip_svc.get_stats()
        }
    })
