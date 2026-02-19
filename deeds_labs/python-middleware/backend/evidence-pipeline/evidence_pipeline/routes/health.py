"""Health check endpoints."""

from fastapi import APIRouter, HTTPException
import structlog

from evidence_pipeline.queue.connection import health_check as rabbitmq_health
from evidence_pipeline.vector.qdrant_client import health_check as qdrant_health

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.get("/health")
async def health_check():
    """Check service health."""
    try:
        rabbitmq_status = await rabbitmq_health()
        qdrant_status = await qdrant_health()

        all_healthy = (
            rabbitmq_status.get("status") == "healthy"
            and qdrant_status.get("status") == "healthy"
        )

        return {
            "status": "healthy" if all_healthy else "degraded",
            "services": {
                "rabbitmq": rabbitmq_status,
                "qdrant": qdrant_status,
            },
        }
    except Exception as e:
        logger.error("Health check failed", error=str(e))
        raise HTTPException(status_code=503, detail="Service unhealthy")
