"""
Main FastAPI application for Legal AI Backend.

Mounts all API routers including:
- similarity_api (existing)
- search_api (agentic search)
- poi_routes (Person of Interest management)
- And other service routers
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db_pool, close_db_pool, get_db_pool
from .services import init_services

logger = logging.getLogger(__name__)

# Import routers
try:
    from .similarity_api import router as similarity_router
except ImportError:
    similarity_router = None

from .search_api import router as search_router

try:
    from .agent_api import router as agent_router
except ImportError:
    agent_router = None

try:
    from .phase72_agent_api import router as phase72_agent_router
except ImportError:
    phase72_agent_router = None

try:
    from .chat_routes import router as chat_router
except ImportError:
    chat_router = None

try:
    from .upload_routes import router as upload_router
except ImportError:
    upload_router = None

try:
    from .search_routes import router as search_router_extra
except ImportError:
    search_router_extra = None

try:
    from .poi_routes_complete import router as poi_router
except ImportError:
    poi_router = None

try:
    from .couchdb_analytics_api import router as analytics_router
except ImportError:
    analytics_router = None

try:
    from .kb_fixing_api import router as kb_fixing_router
except ImportError:
    kb_fixing_router = None

try:
    from .kb_fixing_api_v2 import router as kb_fixing_v2_router
except ImportError:
    kb_fixing_v2_router = None


# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown"""
    # Startup
    try:
        logger.info("🚀 Starting Legal AI Backend...")

        # Initialize database pool
        db_pool = await init_db_pool()
        logger.info("✅ Database pool initialized")

        # Initialize services
        await init_services(db_pool)
        logger.info("✅ Services initialized")

        logger.info("🎯 Legal AI Backend ready!")
    except Exception as e:
        logger.error(f"❌ Startup failed: {e}")
        raise

    yield

    # Shutdown
    try:
        logger.info("🛑 Shutting down Legal AI Backend...")
        await close_db_pool()
        logger.info("✅ Database pool closed")
    except Exception as e:
        logger.error(f"❌ Shutdown error: {e}")


# Create FastAPI app with lifespan
app = FastAPI(
    title="Legal AI Backend",
    description="Agentic legal search with alignment routing, RAG, KAG, topology feedback, and POI management",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
if similarity_router:
    app.include_router(similarity_router)

app.include_router(search_router)

if agent_router:
    app.include_router(agent_router)

if phase72_agent_router:
    app.include_router(phase72_agent_router)

if chat_router:
    app.include_router(chat_router)

if upload_router:
    app.include_router(upload_router)

if search_router_extra:
    app.include_router(search_router_extra)

# Include POI router
if poi_router:
    app.include_router(poi_router)
    logger.info("✅ POI routes registered")
else:
    logger.warning("⚠️  POI routes not available")

# Include CouchDB Analytics router
if analytics_router:
    app.include_router(analytics_router)
    logger.info("✅ CouchDB Analytics API registered")
else:
    logger.warning("⚠️  CouchDB Analytics API not available")

# Include KB Fixing router (Week 3 Task 1)
if kb_fixing_router:
    app.include_router(kb_fixing_router)
    logger.info("✅ KB Fixing API registered")
else:
    logger.warning("⚠️  KB Fixing API not available")

# Include KB Fixing V2 router (Week 3 Tasks 2-4)
if kb_fixing_v2_router:
    app.include_router(kb_fixing_v2_router)
    logger.info("✅ KB Fixing API V2 registered (auto-approval + agentic)")
else:
    logger.warning("⚠️  KB Fixing API V2 not available")


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "legal-ai-backend",
        "version": "1.0.0"
    }


@app.get("/api/health")
def api_health_check():
    """API health check endpoint."""
    return {
        "status": "ok",
        "service": "legal-ai-backend",
        "version": "1.0.0",
        "components": {
            "database": "initialized",
            "services": "initialized",
            "poi": "available"
        }
    }
