"""
FastMCP Server - Model-Agnostic Tool Router
Exposes tools for Ollama, Triton, or any LLM with function calling
"""
import asyncio
import json
import os
import time
from datetime import datetime
from pathlib import Path
from fastmcp import FastMCP

# Import tool implementations
from tools.web_search import web_search
from tools.kb_ingest import kb_ingest
from tools.graph_upsert import graph_upsert_entities, graph_upsert_edges, graph_query

# Initialize FastMCP server
mcp = FastMCP("Legal AI Tool Server")

# ═══════════════════════════════════════════════════════════════
# JSONL LOGGING (SIMD JSON Accelerator Compatible)
# ═══════════════════════════════════════════════════════════════

LOG_DIR = Path(__file__).parent.parent.parent / "logs" / "mcp"
LOG_DIR.mkdir(parents=True, exist_ok=True)
TRACE_FILE = LOG_DIR / f"llm-traces-{datetime.now().strftime('%Y%m%d')}.jsonl"

def log_llm_call(
    tool_name: str,
    provider: str = "ollama",
    prompt: str = "",
    response: str = "",
    tokens_in: int = 0,
    tokens_out: int = 0,
    latency_ms: float = 0,
    success: bool = True,
    error: str = None,
    metadata: dict = None
):
    """
    Log LLM/tool calls to JSONL for observability.
    Compatible with Go SIMD JSON Accelerator parsing.
    """
    log_entry = {
        "ts": datetime.now().isoformat(),
        "epoch": int(time.time() * 1000),
        "tool": tool_name,
        "provider": provider,
        "tokens_in": tokens_in or len(prompt.split()),
        "tokens_out": tokens_out or len(response.split()),
        "latency_ms": latency_ms,
        "success": success,
        "error": error,
        "metadata": metadata or {}
    }

    try:
        with open(TRACE_FILE, 'a') as f:
            f.write(json.dumps(log_entry, default=str) + '\n')
    except Exception as e:
        print(f"⚠️ Failed to write log: {e}")


# ═══════════════════════════════════════════════════════════════
# WEB SEARCH TOOLS
# ═══════════════════════════════════════════════════════════════

@mcp.tool()
async def web_search_tool(
    query: str,
    recency_days: int = None,
    domains: list[str] = None,
    max_results: int = 10
) -> dict:
    """
    Search the web for information

    Args:
        query: Search query string
        recency_days: Filter results from last N days (optional)
        domains: Limit to specific domains (optional)
        max_results: Maximum number of results (default: 10)

    Returns:
        Search results with metadata
    """
    return await web_search(query, recency_days, domains, max_results)


@mcp.tool()
async def http_fetch(url: str) -> dict:
    """
    Fetch content from a URL

    Args:
        url: URL to fetch

    Returns:
        {
            "content": "...",
            "status": 200,
            "headers": {...}
        }
    """
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            return {
                'content': response.text[:10000],  # Limit to 10KB
                'status': response.status_code,
                'headers': dict(response.headers),
                'url': str(response.url)
            }
    except Exception as e:
        return {
            'content': '',
            'status': 500,
            'error': str(e),
            'url': url
        }


# ═══════════════════════════════════════════════════════════════
# KNOWLEDGE BASE TOOLS
# ═══════════════════════════════════════════════════════════════

@mcp.tool()
async def kb_upsert_documents(
    documents: list[dict],
    collection: str = 'default',
    chunk_size: int = 512,
    overlap: int = 50
) -> dict:
    """
    Ingest documents into knowledge base

    Args:
        documents: List of {title, content, metadata}
        collection: Target collection name
        chunk_size: Characters per chunk
        overlap: Overlap between chunks

    Returns:
        Ingestion statistics
    """
    return await kb_ingest(documents, collection, chunk_size, overlap)


@mcp.tool()
async def kb_vector_search(
    query: str,
    collection: str = 'default',
    limit: int = 10,
    threshold: float = 0.7
) -> dict:
    """
    Search knowledge base with vector similarity

    Args:
        query: Search query
        collection: Collection to search
        limit: Max results
        threshold: Similarity threshold (0-1)

    Returns:
        Search results with scores
    """
    import httpx

    qdrant_url = os.getenv('QDRANT_URL', 'http://localhost:6333')
    ollama_url = os.getenv('OLLAMA_URL', 'http://localhost:11434')

    try:
        start_time = time.time()

        # 1. Generate query embedding
        async with httpx.AsyncClient(timeout=10.0) as client:
            embed_resp = await client.post(
                f"{ollama_url}/api/embeddings",
                json={
                    "model": "nomic-embed-text:latest",
                    "prompt": query
                }
            )

            if embed_resp.status_code != 200:
                log_llm_call("kb_vector_search", "ollama", query, "", 0, 0,
                           (time.time() - start_time) * 1000, False, "Embedding failed")
                return {'results': [], 'error': 'Embedding generation failed'}

            embedding = embed_resp.json().get('embedding', [])

            # 2. Search Qdrant
            search_resp = await client.post(
                f"{qdrant_url}/collections/{collection}/points/search",
                json={
                    "vector": embedding,
                    "limit": limit,
                    "score_threshold": threshold,
                    "with_payload": True
                }
            )

            if search_resp.status_code != 200:
                log_llm_call("kb_vector_search", "qdrant", query, "", 0, 0,
                           (time.time() - start_time) * 1000, False, "Search failed")
                return {'results': [], 'error': 'Vector search failed'}

            results = search_resp.json()
            latency_ms = (time.time() - start_time) * 1000

            # Log successful search
            log_llm_call(
                tool_name="kb_vector_search",
                provider="qdrant",
                prompt=query,
                response=f"{len(results)} results",
                latency_ms=latency_ms,
                success=True,
                metadata={"collection": collection, "limit": limit, "threshold": threshold}
            )

            return {
                'results': results,
                'query': query,
                'collection': collection,
                'count': len(results)
            }

    except Exception as e:
        log_llm_call("kb_vector_search", "qdrant", query, "", 0, 0, 0, False, str(e))
        return {'results': [], 'error': str(e)}


# ═══════════════════════════════════════════════════════════════
# GRAPH TOOLS (Neo4j KAG)
# ═══════════════════════════════════════════════════════════════

@mcp.tool()
async def graph_upsert_nodes(
    entities: list[dict],
    label: str = 'Entity'
) -> dict:
    """
    Upsert nodes into knowledge graph

    Args:
        entities: List of {id, properties}
        label: Node label

    Returns:
        {entities_created, entities_updated, status}
    """
    return await graph_upsert_entities(entities, label)


@mcp.tool()
async def graph_upsert_relationships(
    edges: list[dict],
    relationship_type: str = 'RELATED_TO'
) -> dict:
    """
    Upsert relationships into knowledge graph

    Args:
        edges: List of {from_id, to_id, properties}
        relationship_type: Relationship type

    Returns:
        {edges_created, edges_updated, status}
    """
    return await graph_upsert_edges(edges, relationship_type)


@mcp.tool()
async def graph_cypher_query(
    cypher: str,
    params: dict = None
) -> dict:
    """
    Execute Cypher query on knowledge graph

    Args:
        cypher: Cypher query string
        params: Query parameters

    Returns:
        Query results
    """
    return await graph_query(cypher, params)


# ═══════════════════════════════════════════════════════════════
# SERVER STARTUP
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv('MCP_PORT', 3003))

    print(f"""
╔═══════════════════════════════════════════════════════════════╗
║         FastMCP Server - Legal AI Tool Router                 ║
╚═══════════════════════════════════════════════════════════════╝

🔧 Tools Registered:
   • web_search_tool          - Search the web
   • http_fetch               - Fetch URL content
   • kb_upsert_documents      - Ingest into KB
   • kb_vector_search         - Vector similarity search
   • graph_upsert_nodes       - Create/update graph nodes
   • graph_upsert_relationships - Create/update graph edges
   • graph_cypher_query       - Execute Cypher queries

🌐 Server: http://localhost:{port}
📡 Protocol: MCP (Model Context Protocol)

Compatible with:
  • Ollama (Gemma3 tool calling)
  • Triton/TRT-LLM (structured outputs)
  • Any LLM with function calling support

Press Ctrl+C to stop
    """)

    # FastMCP uses mcp.run() instead of get_asgi_app()
    mcp.run(
        host="0.0.0.0",
        port=port
    )
