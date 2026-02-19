#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - FastAPI/FastMCP Middleware
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: FastAPI server with FastMCP tool integration
Task: 10.1 - Create FastAPI application
Task: 10.2 - Integrate FastMCP
Task: 10.3 - Create tool endpoints
Task: 10.4 - Add authentication
═══════════════════════════════════════════════════════════════════════
"""

import os
import json
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from functools import wraps

from fastapi import FastAPI, HTTPException, Depends, Header, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import jwt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════
# Pydantic Models for API
# ═══════════════════════════════════════════════════════════════════════

class AnalyzeFileRequest(BaseModel):
    """Request to analyze a file."""
    file_path: str = Field(..., description="Path to file to analyze")
    include_ast: bool = Field(True, description="Include AST analysis")
    include_comments: bool = Field(True, description="Extract comments")
    include_ai_summary: bool = Field(True, description="Generate AI summary")


class SemanticSearchRequest(BaseModel):
    """Request for semantic search."""
    query: str = Field(..., description="Search query")
    top_k: int = Field(10, description="Number of results")
    filters: Optional[Dict[str, Any]] = Field(None, description="Optional filters")


class ClusterTagsRequest(BaseModel):
    """Request to cluster tags."""
    k: int = Field(10, description="Number of clusters")
    generate_summaries: bool = Field(True, description="Generate AI summaries")


class RenameTagRequest(BaseModel):
    """Request to rename a tag."""
    tag_id: str = Field(..., description="Tag ID to rename")
    old_name: str = Field(..., description="Current tag name")
    new_name: str = Field(..., description="New tag name")


class GetDependenciesRequest(BaseModel):
    """Request to get file dependencies."""
    file_path: str = Field(..., description="File path")
    direction: str = Field("both", description="'imports', 'exports', or 'both'")
    depth: int = Field(1, description="Depth of dependency traversal")


class ToolResponse(BaseModel):
    """Standard tool response."""
    success: bool
    tool: str
    result: Any
    execution_time_ms: float
    timestamp: str


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str
    services: Dict[str, bool]
    timestamp: str


# ═══════════════════════════════════════════════════════════════════════
# Authentication
# ═══════════════════════════════════════════════════════════════════════

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
API_KEYS = set(os.getenv("API_KEYS", "dev-api-key").split(","))


def create_jwt_token(user_id: str, expires_hours: int = 24) -> str:
    """Create a JWT token."""
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(hours=expires_hours),
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_jwt_token(token: str) -> Optional[Dict]:
    """Verify a JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


async def get_current_user(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None)
) -> str:
    """
    Authenticate user via JWT or API key.
    Returns user ID or raises HTTPException.
    """
    # Check API key first
    if x_api_key and x_api_key in API_KEYS:
        return "api-key-user"

    # Check JWT token
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        payload = verify_jwt_token(token)
        if payload:
            return payload.get("sub", "unknown")

    # Allow unauthenticated access in dev mode
    if os.getenv("DEV_MODE", "true").lower() == "true":
        return "dev-user"

    raise HTTPException(status_code=401, detail="Invalid authentication")


# ═══════════════════════════════════════════════════════════════════════
# FastAPI Application
# ═══════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="Agentic Knowledge Integration V2 API",
    description="FastMCP-powered knowledge base tools for code analysis",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════════════════
# Tool Registry (FastMCP-style)
# ═══════════════════════════════════════════════════════════════════════

TOOL_REGISTRY: Dict[str, Dict] = {}


def register_tool(name: str, description: str, schema: Dict):
    """Register a tool in the FastMCP registry."""
    def decorator(func):
        TOOL_REGISTRY[name] = {
            "name": name,
            "description": description,
            "schema": schema,
            "handler": func
        }
        @wraps(func)
        async def wrapper(*args, **kwargs):
            return await func(*args, **kwargs)
        return wrapper
    return decorator


# ═══════════════════════════════════════════════════════════════════════
# Health & Info Endpoints
# ═══════════════════════════════════════════════════════════════════════

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    # Check service connectivity
    services = {
        "api": True,
        "qdrant": False,
        "postgresql": False,
        "redis": False,
        "neo4j": False,
        "ollama": False
    }

    # Quick connectivity checks
    try:
        from qdrant_client import QdrantClient
        client = QdrantClient(url="http://localhost:6333", timeout=2)
        client.get_collections()
        services["qdrant"] = True
    except:
        pass

    try:
        import psycopg2
        conn = psycopg2.connect(
            "postgresql://postgres:postgres@localhost:5434/legal_ai_db",
            connect_timeout=2
        )
        conn.close()
        services["postgresql"] = True
    except:
        pass

    try:
        import redis
        r = redis.from_url("redis://localhost:6379", socket_timeout=2)
        r.ping()
        services["redis"] = True
    except:
        pass

    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:11434/api/tags", timeout=aiohttp.ClientTimeout(total=2)) as resp:
                if resp.status == 200:
                    services["ollama"] = True
    except:
        pass

    return HealthResponse(
        status="healthy" if all(services.values()) else "degraded",
        version="2.0.0",
        services=services,
        timestamp=datetime.now().isoformat()
    )


@app.get("/tools")
async def list_tools():
    """List all available tools (FastMCP schema)."""
    return {
        "tools": [
            {
                "name": tool["name"],
                "description": tool["description"],
                "inputSchema": tool["schema"]
            }
            for tool in TOOL_REGISTRY.values()
        ]
    }


# ═══════════════════════════════════════════════════════════════════════
# Tool Endpoints
# ═══════════════════════════════════════════════════════════════════════

@app.post("/tools/analyze_file", response_model=ToolResponse)
@register_tool(
    name="analyze_file",
    description="Analyze a source file with AST, comments, and AI summary",
    schema={
        "type": "object",
        "properties": {
            "file_path": {"type": "string", "description": "Path to file"},
            "include_ast": {"type": "boolean", "default": True},
            "include_comments": {"type": "boolean", "default": True},
            "include_ai_summary": {"type": "boolean", "default": True}
        },
        "required": ["file_path"]
    }
)
async def analyze_file(
    request: AnalyzeFileRequest,
    user: str = Depends(get_current_user)
):
    """Analyze a file with AST, comments, and AI summary."""
    import time
    start = time.time()

    try:
        from backend.services.file_analysis_service import FileAnalysisService
        service = FileAnalysisService()

        result = await service.analyze_file(
            request.file_path,
            include_ast=request.include_ast,
            include_comments=request.include_comments,
            include_ai_summary=request.include_ai_summary
        )

        return ToolResponse(
            success=True,
            tool="analyze_file",
            result=result,
            execution_time_ms=(time.time() - start) * 1000,
            timestamp=datetime.now().isoformat()
        )
    except Exception as e:
        logger.error(f"analyze_file error: {e}")
        return ToolResponse(
            success=False,
            tool="analyze_file",
            result={"error": str(e)},
            execution_time_ms=(time.time() - start) * 1000,
            timestamp=datetime.now().isoformat()
        )


@app.post("/tools/semantic_search", response_model=ToolResponse)
@register_tool(
    name="semantic_search",
    description="Search the knowledge base using semantic similarity",
    schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "top_k": {"type": "integer", "default": 10},
            "filters": {"type": "object", "description": "Optional filters"}
        },
        "required": ["query"]
    }
)
async def semantic_search(
    request: SemanticSearchRequest,
    user: str = Depends(get_current_user)
):
    """Search the knowledge base using semantic similarity."""
    import time
    start = time.time()

    try:
        from backend.services.enhanced_tag_service import EnhancedTagService
        service = EnhancedTagService()

        results = await service.semantic_search(
            query=request.query,
            top_k=request.top_k,
            filters=request.filters
        )

        return ToolResponse(
            success=True,
            tool="semantic_search",
            result={"results": results, "count": len(results)},
            execution_time_ms=(time.time() - start) * 1000,
            timestamp=datetime.now().isoformat()
        )
    except Exception as e:
        logger.error(f"semantic_search error: {e}")
        return ToolResponse(
            success=False,
            tool="semantic_search",
            result={"error": str(e)},
            execution_time_ms=(time.time() - start) * 1000,
            timestamp=datetime.now().isoformat()
        )


@app.post("/tools/cluster_tags", response_model=ToolResponse)
@register_tool(
    name="cluster_tags",
    description="Cluster tags using K-means algorithm",
    schema={
        "type": "object",
        "properties": {
            "k": {"type": "integer", "default": 10, "description": "Number of clusters"},
            "generate_summaries": {"type": "boolean", "default": True}
        }
    }
)
async def cluster_tags(
    request: ClusterTagsRequest,
    user: str = Depends(get_current_user)
):
    """Cluster tags using K-means algorithm."""
    import time
    start = time.time()

    try:
        from backend.services.kmeans_clustering_service import KMeansClusteringService
        service = KMeansClusteringService()

        result = await service.cluster_tags(
            k=request.k,
            generate_summaries=request.generate_summaries
        )

        # Store results
        service.store_clusters_postgresql(result)
        service.cache_clusters_redis(result)

        return ToolResponse(
            success=True,
            tool="cluster_tags",
            result={
                "num_clusters": result.num_clusters,
                "total_tags": result.total_tags,
                "silhouette_score": result.silhouette_score,
                "clusters": [
                    {
                        "id": c.cluster_id,
                        "size": c.size,
                        "summary": c.summary,
                        "keywords": c.keywords
                    }
                    for c in result.clusters
                ]
            },
            execution_time_ms=(time.time() - start) * 1000,
            timestamp=datetime.now().isoformat()
        )
    except Exception as e:
        logger.error(f"cluster_tags error: {e}")
        return ToolResponse(
            success=False,
            tool="cluster_tags",
            result={"error": str(e)},
            execution_time_ms=(time.time() - start) * 1000,
            timestamp=datetime.now().isoformat()
        )


@app.post("/tools/rename_tag", response_model=ToolResponse)
@register_tool(
    name="rename_tag",
    description="Rename a tag atomically across all databases",
    schema={
        "type": "object",
        "properties": {
            "tag_id": {"type": "string", "description": "Tag ID"},
            "old_name": {"type": "string", "description": "Current name"},
            "new_name": {"type": "string", "description": "New name"}
        },
        "required": ["tag_id", "old_name", "new_name"]
    }
)
async def rename_tag(
    request: RenameTagRequest,
    user: str = Depends(get_current_user)
):
    """Rename a tag atomically across all databases."""
    import time
    start = time.time()

    try:
        from backend.services.tag_rename_service import TagRenameService
        service = TagRenameService()

        result = await service.rename_tag(
            tag_id=request.tag_id,
            old_name=request.old_name,
            new_name=request.new_name
        )

        return ToolResponse(
            success=result.get("success", False),
            tool="rename_tag",
            result=result,
            execution_time_ms=(time.time() - start) * 1000,
            timestamp=datetime.now().isoformat()
        )
    except Exception as e:
        logger.error(f"rename_tag error: {e}")
        return ToolResponse(
            success=False,
            tool="rename_tag",
            result={"error": str(e)},
            execution_time_ms=(time.time() - start) * 1000,
            timestamp=datetime.now().isoformat()
        )


@app.post("/tools/get_dependencies", response_model=ToolResponse)
@register_tool(
    name="get_dependencies",
    description="Get file dependencies from Neo4j graph",
    schema={
        "type": "object",
        "properties": {
            "file_path": {"type": "string", "description": "File path"},
            "direction": {"type": "string", "enum": ["imports", "exports", "both"], "default": "both"},
            "depth": {"type": "integer", "default": 1}
        },
        "required": ["file_path"]
    }
)
async def get_dependencies(
    request: GetDependenciesRequest,
    user: str = Depends(get_current_user)
):
    """Get file dependencies from Neo4j graph."""
    import time
    start = time.time()

    try:
        from backend.services.ast_analysis_service import ASTAnalysisService
        service = ASTAnalysisService()

        result = await service.get_dependencies(
            file_path=request.file_path,
            direction=request.direction,
            depth=request.depth
        )

        return ToolResponse(
            success=True,
            tool="get_dependencies",
            result=result,
            execution_time_ms=(time.time() - start) * 1000,
            timestamp=datetime.now().isoformat()
        )
    except Exception as e:
        logger.error(f"get_dependencies error: {e}")
        return ToolResponse(
            success=False,
            tool="get_dependencies",
            result={"error": str(e)},
            execution_time_ms=(time.time() - start) * 1000,
            timestamp=datetime.now().isoformat()
        )


# ═══════════════════════════════════════════════════════════════════════
# FastMCP Execute Endpoint
# ═══════════════════════════════════════════════════════════════════════

@app.post("/mcp/execute")
async def mcp_execute(
    tool_name: str = Body(...),
    arguments: Dict[str, Any] = Body(default={}),
    user: str = Depends(get_current_user)
):
    """
    FastMCP-style tool execution endpoint.
    Executes a registered tool by name with given arguments.
    """
    if tool_name not in TOOL_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")

    tool = TOOL_REGISTRY[tool_name]
    handler = tool["handler"]

    # Build request object based on tool
    try:
        if tool_name == "analyze_file":
            request = AnalyzeFileRequest(**arguments)
            return await handler(request, user)
        elif tool_name == "semantic_search":
            request = SemanticSearchRequest(**arguments)
            return await handler(request, user)
        elif tool_name == "cluster_tags":
            request = ClusterTagsRequest(**arguments)
            return await handler(request, user)
        elif tool_name == "rename_tag":
            request = RenameTagRequest(**arguments)
            return await handler(request, user)
        elif tool_name == "get_dependencies":
            request = GetDependenciesRequest(**arguments)
            return await handler(request, user)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown tool: {tool_name}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════
# Auth Endpoints
# ═══════════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/auth/login")
async def login(request: LoginRequest):
    """Login and get JWT token."""
    # Simple auth for dev - replace with real auth in production
    if request.username and request.password:
        token = create_jwt_token(request.username)
        return {"access_token": token, "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Invalid credentials")


@app.get("/auth/me")
async def get_me(user: str = Depends(get_current_user)):
    """Get current user info."""
    return {"user_id": user}


# ═══════════════════════════════════════════════════════════════════════
# Run Server
# ═══════════════════════════════════════════════════════════════════════

def run_server(host: str = "0.0.0.0", port: int = 8090):
    """Run the FastAPI server."""
    import uvicorn

    # Register admin routes (Task 16.2)
    try:
        from backend.services.admin_api_routes import register_admin_routes
        register_admin_routes(app)
    except ImportError as e:
        logger.warning(f"Could not register admin routes: {e}")

    logger.info(f"🚀 Starting FastAPI server on {host}:{port}")
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    run_server()
