"""Progress tracking endpoints."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import structlog
from typing import AsyncGenerator

from evidence_pipeline.progress import get_event_manager

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.get("/{job_id}/progress")
async def get_progress(job_id: str):
    """Get current progress for a job."""
    try:
        manager = await get_event_manager()
        progress = await manager.get_job_progress(job_id)

        if progress is None:
            raise HTTPException(status_code=404, detail="Job not found")

        return progress
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Progress check failed", error=str(e), job_id=job_id)
        raise HTTPException(status_code=500, detail="Failed to get progress")


@router.get("/{job_id}/stream")
async def stream_progress(job_id: str):
    """Stream progress events via SSE for a job."""
    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events."""
        try:
            manager = await get_event_manager()

            # Stream events
            async for event_str in manager.stream_events(job_id):
                yield event_str

        except Exception as e:
            logger.error("Error streaming progress", error=str(e), job_id=job_id)
            yield f"data: {{'error': '{str(e)}'}}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
