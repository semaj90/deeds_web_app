"""
Standalone CouchDB Analytics API Server
========================================

Minimal FastAPI server for testing analytics endpoints without
requiring full backend stack (PostgreSQL, etc.)

Week 2 Task 4: Analytics API Testing

Usage:
    python backend/scripts/analytics_api_server.py
"""

import sys
import logging
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import analytics router
from api.couchdb_analytics_api import router as analytics_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


# Create minimal FastAPI app
app = FastAPI(
    title="CouchDB Analytics API",
    description="Analytics endpoints for LLM summaries, dependencies, clusters, and error propagation",
    version="1.0.0",
)

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add health check endpoint for Week 3 readiness
@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "analytics_api",
        "port": 8001,
        "version": "1.0.0"
    }

# Include analytics router
app.include_router(analytics_router)


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "couchdb-analytics-api",
        "version": "1.0.0",
        "couchdb": "localhost:5984"
    }


if __name__ == "__main__":
    import uvicorn

    logger.info("🚀 Starting CouchDB Analytics API Server...")
    logger.info("📊 Endpoints: /api/analytics/*")
    logger.info("🔗 CouchDB: localhost:5984")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        log_level="info"
    )
