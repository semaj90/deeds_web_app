"""
Legal AI MCP Server - FastMCP Integration
Provides: RAG, KAG, MinIO SIMD, ACE tools for gemma3-legal:latest
"""
from fastmcp import FastMCP
import httpx
import os
from typing import Optional, Dict, Any, List

# Initialize FastMCP server
mcp = FastMCP("Legal AI Tools")

# Configuration
MINIO_SIMD_URL = os.getenv("MINIO_SIMD_URL", "http://localhost:8096")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
QDRANT_HOST = os.getenv("QDRANT_HOST", "http://localhost:6333")
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
ACE_BASE = os.getenv("ACE_BASE", "http://localhost:8000/api/ace")
EMBED_MODEL = os.getenv("EMBED_MODEL", "embeddinggemma:latest")
LLM_MODEL = os.getenv("LLM_MODEL", "gemma3-legal:latest")

# ============================================================================
# MinIO SIMD Tools (Evidence Index)
# ============================================================================

@mcp.tool()
async def get_document_chunks(doc_id: str, bucket: str = "legal-documents") -> Dict[str, Any]:
    """
    Fetch document chunk metadata using MinIO SIMD service (AVX2-optimized).
    Fast retrieval of chunked document metadata for RAG pipeline.

    Args:
        doc_id: Document identifier
        bucket: MinIO bucket name (default: legal-documents)

    Returns:
        Chunk metadata with SIMD-parsed JSON
    """
    async with httpx.AsyncClient(timeout=3.0) as client:
        resp = await client.get(
            f"{MINIO_SIMD_URL}/api/chunks",
            params={"doc_id": doc_id, "bucket": bucket}
        )
        resp.raise_for_status()
        return resp.json()

@mcp.tool()
async def get_case_evidence_metadata(case_id: str, bucket: str = "evidence") -> Dict[str, Any]:
    """
    List all evidence metadata for a legal case using MinIO SIMD.
    Parallel fetching with 16 concurrent goroutines.

    Args:
        case_id: Case identifier
        bucket: MinIO bucket name (default: evidence)

    Returns:
        Evidence list with metadata (EXIF, OCR, embeddings)
    """
    async with httpx.AsyncClient(timeout=3.0) as client:
        resp = await client.get(
            f"{MINIO_SIMD_URL}/api/evidence",
            params={"case_id": case_id, "bucket": bucket}
        )
        resp.raise_for_status()
        return resp.json()

@mcp.tool()
async def get_manifest(path: str, bucket: str = "legal-documents") -> Dict[str, Any]:
    """
    Fetch and parse large JSON manifest using SIMD acceleration.
    Sub-1ms JSON parsing for manifests up to 10MB.

    Args:
        path: Manifest key/path in MinIO
        bucket: MinIO bucket name

    Returns:
        Parsed manifest with file listings
    """
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{MINIO_SIMD_URL}/api/manifest",
            params={"key": path, "bucket": bucket}
        )
        resp.raise_for_status()
        return resp.json()

# ============================================================================
# RAG Tools (Retrieval Augmented Generation)
# ============================================================================

@mcp.tool()
async def search_legal_documents(
    query: str,
    top_k: int = 5,
    case_type: Optional[str] = None,
    jurisdiction: Optional[str] = None
) -> Dict[str, Any]:
    """
    Search legal documents using RAG + KAG with embeddinggemma.
    Combines vector search (Qdrant) with knowledge graph (Neo4j).

    Args:
        query: Search query
        top_k: Number of results to return
        case_type: Filter by case type (optional)
        jurisdiction: Filter by jurisdiction (optional)

    Returns:
        Relevant documents with scores and citations
    """
    # Generate embedding
    async with httpx.AsyncClient(timeout=10.0) as client:
        embed_resp = await client.post(
            f"{OLLAMA_HOST}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": query}
        )
        embedding = embed_resp.json()["embedding"]

        # Search Qdrant
        search_resp = await client.post(
            f"{QDRANT_HOST}/collections/legal-documents/points/search",
            json={
                "vector": embedding,
                "limit": top_k,
                "filter": {
                    "must": [
                        {"key": "case_type", "match": {"value": case_type}} if case_type else None,
                        {"key": "jurisdiction", "match": {"value": jurisdiction}} if jurisdiction else None
                    ]
                }
            }
        )

        results = search_resp.json()
        return {
            "query": query,
            "results": results.get("result", []),
            "count": len(results.get("result", [])),
            "model": EMBED_MODEL
        }

@mcp.tool()
async def analyze_document_with_gemma(
    doc_id: str,
    query: str,
    max_chunks: int = 5
) -> Dict[str, Any]:
    """
    Analyze document using Go SIMD + Gemma3 pipeline.

    Flow:
    1. Go SIMD fetches chunk metadata (fast I/O)
    2. Python selects relevant chunks
    3. Gemma3 analyzes selected chunks (GPU inference)

    Args:
        doc_id: Document ID
        query: Analysis query
        max_chunks: Maximum chunks to analyze

    Returns:
        Analysis results from Gemma3
    """
    # Get chunks via SIMD
    chunks_data = await get_document_chunks(doc_id)
    chunks = chunks_data.get("chunks", [])[:max_chunks]

    # Analyze with Gemma3
    async with httpx.AsyncClient(timeout=30.0) as client:
        analysis_resp = await client.post(
            f"{OLLAMA_HOST}/api/generate",
            json={
                "model": LLM_MODEL,
                "prompt": f"Analyze these document chunks:\n\nQuery: {query}\n\nChunks: {chunks}",
                "stream": False
            }
        )

        return {
            "doc_id": doc_id,
            "query": query,
            "chunks_analyzed": len(chunks),
            "analysis": analysis_resp.json()["response"],
            "model": LLM_MODEL
        }

# ============================================================================
# ACE Agent Tools (Autonomous Coding Engine)
# ============================================================================

@mcp.tool()
async def ace_plan_action(session_id: str, message: str, role: str = "warden") -> Dict[str, Any]:
    """
    Plan next action using ACE (Autonomous Coding Engine).
    Uses gemma3-legal to decide which tool to call next.

    Args:
        session_id: Session identifier
        message: User message/goal
        role: Agent role (warden, analyst, etc.)

    Returns:
        Planned action with tool, args, and reasoning
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{ACE_BASE}/plan",
            json={
                "session_id": session_id,
                "message": message,
                "role": role
            }
        )
        resp.raise_for_status()
        return resp.json()

@mcp.tool()
async def ace_execute_action(
    session_id: str,
    message: str,
    role: str = "warden"
) -> Dict[str, Any]:
    """
    Plan and execute action using ACE.
    Full autonomous loop: plan → execute → return results.

    Args:
        session_id: Session identifier
        message: User message/goal
        role: Agent role

    Returns:
        Execution results with tool output
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{ACE_BASE}/plan-and-execute",
            json={
                "session_id": session_id,
                "message": message,
                "role": role
            }
        )
        resp.raise_for_status()
        return resp.json()

@mcp.tool()
async def ace_get_session(session_id: str) -> Dict[str, Any]:
    """
    Get ACE session summary for ACA timeline.

    Args:
        session_id: Session identifier

    Returns:
        Session state with progress and history
    """
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{ACE_BASE}/session/{session_id}")
        resp.raise_for_status()
        return resp.json()

# ============================================================================
# AST/TypeScript Tools
# ============================================================================

@mcp.tool()
async def run_svelte_check(path: str = "src", threshold: str = "error") -> Dict[str, Any]:
    """
    Run svelte-check and collect TS/Svelte errors.

    Args:
        path: Path to check (default: src)
        threshold: Error threshold (error or warning)

    Returns:
        Error list with counts
    """
    import subprocess

    cmd = [
        "npx", "svelte-check",
        "--tsconfig", "./tsconfig.json",
        "--threshold", threshold,
        "--output", "machine"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, cwd="sveltekit-frontend")

    errors = []
    for line in result.stdout.split("\n"):
        if line.strip():
            try:
                import json
                error = json.loads(line)
                errors.append(error)
            except:
                pass

    return {
        "errors": errors,
        "count": len(errors),
        "exit_code": result.returncode
    }

@mcp.tool()
async def get_ast_graph(file_path: str) -> Dict[str, Any]:
    """
    Get AST graph from /api/ast/analyze endpoint.

    Args:
        file_path: File path to analyze

    Returns:
        AST graph with nodes and edges
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            "http://localhost:5173/api/ast/analyze",
            json={"filePath": file_path}
        )
        resp.raise_for_status()
        return resp.json()

# ============================================================================
# Knowledge Graph Tools (Neo4j)
# ============================================================================

@mcp.tool()
async def query_knowledge_graph(cypher: str) -> Dict[str, Any]:
    """
    Query Neo4j knowledge graph with Cypher.

    Args:
        cypher: Cypher query

    Returns:
        Query results
    """
    from neo4j import GraphDatabase

    driver = GraphDatabase.driver(NEO4J_URI, auth=("neo4j", "password"))

    with driver.session() as session:
        result = session.run(cypher)
        records = [record.data() for record in result]

    driver.close()

    return {
        "query": cypher,
        "results": records,
        "count": len(records)
    }

# ============================================================================
# Ollama Direct Tools
# ============================================================================

@mcp.tool()
async def get_ollama_endpoint() -> Dict[str, str]:
    """
    Get Ollama endpoint configuration for Gemma3 inference.

    Returns:
        Ollama endpoint and available models
    """
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{OLLAMA_HOST}/api/tags")
        models = resp.json().get("models", [])

    return {
        "endpoint": OLLAMA_HOST,
        "embed_model": EMBED_MODEL,
        "llm_model": LLM_MODEL,
        "available_models": [m["name"] for m in models]
    }

@mcp.tool()
async def generate_with_gemma(prompt: str, system: Optional[str] = None) -> str:
    """
    Generate text using gemma3-legal:latest.

    Args:
        prompt: User prompt
        system: System prompt (optional)

    Returns:
        Generated text
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{OLLAMA_HOST}/api/generate",
            json={
                "model": LLM_MODEL,
                "prompt": prompt,
                "system": system,
                "stream": False
            }
        )
        return resp.json()["response"]

# ============================================================================
# Health Check
# ============================================================================

@mcp.tool()
async def check_services_health() -> Dict[str, Any]:
    """
    Check health of all integrated services.

    Returns:
        Health status of MinIO SIMD, Ollama, Qdrant, Neo4j, ACE
    """
    health = {}

    async with httpx.AsyncClient(timeout=2.0) as client:
        # MinIO SIMD
        try:
            resp = await client.get(f"{MINIO_SIMD_URL}/health")
            health["minio_simd"] = resp.json()
        except:
            health["minio_simd"] = {"status": "unavailable"}

        # Ollama
        try:
            resp = await client.get(f"{OLLAMA_HOST}/api/tags")
            health["ollama"] = {"status": "healthy", "models": len(resp.json().get("models", []))}
        except:
            health["ollama"] = {"status": "unavailable"}

        # Qdrant
        try:
            resp = await client.get(f"{QDRANT_HOST}/health")
            health["qdrant"] = {"status": "healthy"}
        except:
            health["qdrant"] = {"status": "unavailable"}

        # ACE
        try:
            resp = await client.get(f"{ACE_BASE}/tools")
            health["ace"] = {"status": "healthy", "tools": resp.json()["count"]}
        except:
            health["ace"] = {"status": "unavailable"}

    return health

if __name__ == "__main__":
    mcp.run()
