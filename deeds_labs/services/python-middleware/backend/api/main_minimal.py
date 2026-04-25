"""
Minimal FastAPI application for testing.

Only includes the health endpoint and search router.
"""

from fastapi import FastAPI

# Import only the essential router
from backend.api.search_api import router as search_router

# Create FastAPI app
app = FastAPI(
    title="Legal AI Backend - Minimal",
    description="Minimal backend for testing",
    version="1.0.0",
)

# Include only search router
app.include_router(search_router)

@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "legal-ai-backend-minimal"}