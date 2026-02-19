"""
Upload API Routes: FastAPI endpoints for evidence upload

Endpoints:
- POST /api/upload/file - Upload file and trigger worker
- GET /api/upload/progress/{doc_id} - Stream progress via SSE
- GET /api/upload/history/{case_id} - Get upload history
"""

import logging
from typing import Dict, List

from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from pydantic import BaseModel

from backend.upload_service import UploadService, get_upload_service
from backend.progress_tracker import ProgressTracker, get_progress_tracker
from sse_starlette import EventSourceResponse

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

router = APIRouter(prefix="/api/upload", tags=["upload"])


class UploadResponse(BaseModel):
    """Upload response"""
    doc_id: str
    filename: str
    file_size: int
    status: str
    progress_url: str


@router.post("/file")
async def upload_file(
    file: UploadFile = File(...),
    case_id: str = Query(...),
) -> UploadResponse:
    """Upload file and trigger worker pipeline"""
    try:
        # Validate inputs
        if not file.filename:
            raise HTTPException(status_code=400, detail="Filename required")

        if not case_id:
            raise HTTPException(status_code=400, detail="Case ID required")

        # Read file data
        file_data = await file.read()

        # Get upload service
        upload_service = await get_upload_service()

        # Upload file
        logger.info(f"Uploading file: {file.filename} for case {case_id}")
        result = await upload_service.upload_file(
            filename=file.filename,
            file_data=file_data,
            content_type=file.content_type or "application/octet-stream",
            case_id=case_id,
        )

        return UploadResponse(
            doc_id=result.doc_id,
            filename=result.filename,
            file_size=result.file_size,
            status=result.status,
            progress_url=result.progress_url,
        )

    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail="Upload failed")


@router.get("/progress/{doc_id}")
async def stream_progress(doc_id: str):
    """Stream upload progress via SSE"""
    try:
        progress_tracker = await get_progress_tracker()

        async def event_generator():
            try:
                async for event in progress_tracker.stream_progress(doc_id):
                    if event["type"] == "progress":
                        yield f"event: progress\n"
                        yield f"data: {event['data']}\n\n"
                    elif event["type"] == "done":
                        yield f"event: done\n"
                        yield f"data: {event['data']}\n\n"
                    elif event["type"] == "error":
                        yield f"event: error\n"
                        yield f"data: {event['data']}\n\n"

            except Exception as e:
                logger.error(f"Stream error: {e}")
                yield f"event: error\n"
                yield f"data: {{'error': '{str(e)}'}}\n\n"

        return EventSourceResponse(event_generator())

    except Exception as e:
        logger.error(f"Progress stream error: {e}")
        raise HTTPException(status_code=500, detail="Stream failed")


@router.get("/history/{case_id}")
async def get_history(
    case_id: str,
    limit: int = Query(10, ge=1, le=100),
) -> Dict:
    """Get upload history for case"""
    try:
        upload_service = await get_upload_service()

        history = await upload_service.get_upload_history(case_id, limit)

        return {
            "case_id": case_id,
            "uploads": history,
            "total": len(history),
        }

    except Exception as e:
        logger.error(f"History error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get history")


@router.get("/health")
async def health_check() -> Dict:
    """Health check endpoint"""
    try:
        upload_service = await get_upload_service()
        progress_tracker = await get_progress_tracker()

        return {
            "status": "healthy",
            "upload_service": "ready",
            "progress_tracker": "ready",
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Service unavailable")
