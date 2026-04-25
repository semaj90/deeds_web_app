"""
AutoGen LLM Configuration for Legal AI Agents
==============================================
Configures Ollama backend for AutoGen multi-agent workflows.
Uses gemma3-legal:latest via OpenAI-compatible API.

**Phase 66 Integration**: Langfuse observability for LLM traces
"""

import os
from typing import Dict, List, Any, Optional

# Langfuse observability configuration
LANGFUSE_ENABLED = os.getenv("LANGFUSE_ENABLED", "true").lower() == "true"
LANGFUSE_URL = os.getenv("LANGFUSE_URL", "http://localhost:3000")
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY")
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY")

# Ollama configuration
OLLAMA_BASE_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/v1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3-legal:latest")
OLLAMA_EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "embeddinggemma:latest")


def get_langfuse_callback():
    """
    Get Langfuse callback handler for AutoGen observability.

    Returns:
        CallbackHandler if Langfuse is enabled and configured, None otherwise.

    **Phase 66**: Automatically logs all AutoGen agent calls to Langfuse:
    - LLM traces (input, output, tokens, latency)
    - Agent interactions (multi-agent conversations)
    - Tool calls (function calling observability)
    - Costs and performance metrics
    """
    if not LANGFUSE_ENABLED:
        print("⚠️  Langfuse observability disabled (LANGFUSE_ENABLED=false)")
        return None

    if not LANGFUSE_PUBLIC_KEY or not LANGFUSE_SECRET_KEY:
        print("⚠️  Langfuse API keys not configured. Observability disabled.")
        print(f"   👉 Visit {LANGFUSE_URL} and generate API keys in Settings → API Keys")
        print("   👉 Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY environment variables")
        return None

    try:
        from langfuse.callback import CallbackHandler

        handler = CallbackHandler(
            public_key=LANGFUSE_PUBLIC_KEY,
            secret_key=LANGFUSE_SECRET_KEY,
            host=LANGFUSE_URL,
            debug=os.getenv("LANGFUSE_DEBUG", "false").lower() == "true",
            # Enable OpenTelemetry tracing
            enabled=True,
            # Flush interval (seconds)
            flush_interval=1.0
        )

        print(f"✅ Langfuse observability enabled: {LANGFUSE_URL}")
        print(f"   Public Key: {LANGFUSE_PUBLIC_KEY[:8]}...")

        return handler
    except ImportError:
        print("❌ Langfuse SDK not installed. Run: pip install langfuse")
        return None
    except Exception as e:
        print(f"❌ Failed to initialize Langfuse: {e}")
        return None

# AutoGen LLM config for Ollama
# NOTE: 'callbacks' will be added dynamically via get_autogen_config()
OLLAMA_CONFIG = {
    "config_list": [
        {
            "model": OLLAMA_MODEL,
            "api_key": "ollama",  # Placeholder (Ollama doesn't use keys)
            "base_url": OLLAMA_BASE_URL,
            "api_type": "openai",  # OpenAI-compatible endpoint
        }
    ],
    "temperature": 0.7,
    "max_tokens": 4096,
    "cache_seed": None,  # Disable caching for development
    "timeout": 120,
}

# Tool execution config
AUTOGEN_TOOLS_CONFIG = {
    "timeout": 60,
    "work_dir": "autogen_workspace",
    "use_docker": False,  # Set True for sandboxed execution
}

# FastMCP tools mapping
FASTMCP_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "rag_vector_search",
            "description": "Search legal knowledge base using semantic similarity. Returns relevant documents with citations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query for legal documents, case law, or statutes",
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of results to return (default: 5)",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "neo4j_graph_query",
            "description": "Query Neo4j knowledge graph with Cypher. Use for finding relationships between legal entities, precedents, and evidence.",
            "parameters": {
                "type": "object",
                "properties": {
                    "cypher": {
                        "type": "string",
                        "description": "Cypher query string (e.g., MATCH (n:Case)-[:CITES]->(m:Precedent) RETURN n, m LIMIT 10)",
                    },
                },
                "required": ["cypher"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_document_chunks",
            "description": "Retrieve document chunks from MinIO storage with SIMD optimization. Fast retrieval for large documents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "doc_id": {
                        "type": "string",
                        "description": "Document ID in MinIO bucket",
                    },
                    "bucket": {
                        "type": "string",
                        "description": "MinIO bucket name (default: legal-documents)",
                        "default": "legal-documents",
                    },
                },
                "required": ["doc_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_case_evidence_metadata",
            "description": "Get metadata for all evidence in a case. Returns parallel-fetched evidence with 16 concurrent goroutines.",
            "parameters": {
                "type": "object",
                "properties": {
                    "case_id": {
                        "type": "string",
                        "description": "Case identifier",
                    },
                },
                "required": ["case_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "redis_kag_pattern_search",
            "description": "Search Redis KAG (Knowledge-Augmented Generation) patterns. Returns high-confidence fix patterns learned from previous successful fixes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "error_type": {
                        "type": "string",
                        "description": "Error type or pattern to search (e.g., 'TS2322', 'UnionType')",
                    },
                    "min_confidence": {
                        "type": "number",
                        "description": "Minimum confidence score (0.0-1.0, default: 0.75)",
                        "default": 0.75,
                    },
                },
                "required": ["error_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "postgres_query_knowledge_base",
            "description": "Query PostgreSQL knowledge base with pgvector. Returns semantically similar errors and proven fixes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language query for knowledge base",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum results to return (default: 10)",
                        "default": 10,
                    },
                },
                "required": ["query"],
            },
        },
    },
]


def get_autogen_config() -> Dict[str, Any]:
    """
    Get AutoGen configuration for legal AI agents.

    **Phase 66**: Automatically adds Langfuse callback handlers for observability.
    All LLM calls, agent interactions, and tool executions will be logged to Langfuse.

    Returns:
        AutoGen config dict with LLM settings, tools, and callbacks.
    """
    config = {
        **OLLAMA_CONFIG,
        "functions": FASTMCP_TOOLS,
    }

    # Add Langfuse observability if configured
    langfuse_callback = get_langfuse_callback()
    if langfuse_callback:
        # AutoGen expects a list of callbacks
        config["callbacks"] = [langfuse_callback]
        print("   📊 Langfuse observability attached to AutoGen config")

    return config


def get_tool_execution_config() -> Dict[str, Any]:
    """Get tool execution configuration"""
    return AUTOGEN_TOOLS_CONFIG


def get_fastmcp_tools() -> List[Dict[str, Any]]:
    """Get FastMCP tools in OpenAI function calling format"""
    return FASTMCP_TOOLS
