"""FastAPI application for evidence processing pipeline."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog

from evidence_pipeline.config import settings
from evidence_pipeline.routes import health, upload, progress, api
from evidence_pipeline.database import init_db
from evidence_pipeline.queue import init_queue
from evidence_pipeline.queue.rabbitmq import init_queues
from evidence_pipeline.storage import init_minio
from evidence_pipeline.vector import init_qdrant
from evidence_pipeline.error_handling import ErrorHandlingMiddleware, RequestLoggingMiddleware

logger = structlog.get_logger(__name__)

app = FastAPI(
    title="Evidence Processing Pipeline",
    description="FastAPI middleware for legal document processing",
    version="0.1.0",
)

# Error handling middleware (must be first)
app.add_middleware(ErrorHandlingMiddleware)
app.add_middleware(RequestLoggingMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Initialize database and queue connections on startup."""
    logger.info("Starting Evidence Processing Pipeline")
    try:
        await init_db()
        logger.info("Database initialized")

        await init_queue()
        logger.info("RabbitMQ connection established")

        await init_queues()
        logger.info("RabbitMQ queues initialized")

        await init_minio()
        logger.info("MinIO initialized")

        await init_qdrant()
        logger.info("Qdrant initialized")

        logger.info("Pipeline initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize pipeline", error=str(e))
        raise


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up connections on shutdown."""
    logger.info("Shutting down Evidence Processing Pipeline")


# Include routers
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(api.router)  # API router includes /api/evidence prefix


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "Evidence Processing Pipeline",
        "version": "0.1.0",
        "status": "running",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "evidence_pipeline.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
