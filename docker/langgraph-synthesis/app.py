"""
LangGraph Synthesis Service  (port 8091)
=========================================
GPU-accelerated RAG → KAG → LangGraph DAG synthesis pipeline.

Endpoints:
  POST /synthesize       — full RAG+KAG+LLM pipeline, returns JSON
  POST /synthesize/stream — SSE streaming synthesis
  GET  /health           — service + GPU + dependency health

LangGraph DAG:
  retrieve_rag  →  retrieve_kag  →  merge_context
                                       ↓
                                   synthesize_llm  →  self_eval
                                       ↓ (low confidence)
                                   retry_synthesize
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from typing import Any, AsyncGenerator, TypedDict

import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from langgraph.graph import END, StateGraph
from pydantic import BaseModel
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import SearchRequest, SparseVector
import httpx

# ── Config ────────────────────────────────────────────────────────────────────

OLLAMA_URL       = os.environ.get("OLLAMA_URL",    "http://host.docker.internal:11434")
QDRANT_URL       = os.environ.get("QDRANT_URL",    "http://qdrant:6333")
NEO4J_URL        = os.environ.get("NEO4J_URI",     "bolt://neo4j:7687")
NEO4J_USER       = os.environ.get("NEO4J_USER",    "neo4j")
NEO4J_PASS       = os.environ.get("NEO4J_PASSWORD", "password")
LLM_MODEL        = os.environ.get("LLM_MODEL",     "gemma4-legal:latest")
EMBED_MODEL      = os.environ.get("EMBED_MODEL",   "embeddinggemma:latest")
LANGFUSE_HOST    = os.environ.get("LANGFUSE_HOST", "http://langfuse-web:3000")
CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.65"))

# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="LangGraph Synthesis Service",
    description="GPU-accelerated RAG+KAG+LangGraph synthesis pipeline",
    version="1.0.0",
)

# ── Qdrant client (lazy init) ─────────────────────────────────────────────────

_qdrant: AsyncQdrantClient | None = None

async def get_qdrant() -> AsyncQdrantClient:
    global _qdrant
    if _qdrant is None:
        _qdrant = AsyncQdrantClient(url=QDRANT_URL)
    return _qdrant

# ── Embed via Ollama ──────────────────────────────────────────────────────────

async def embed_query(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{OLLAMA_URL}/api/embed",
            json={"model": EMBED_MODEL, "input": text},
        )
        r.raise_for_status()
        return r.json()["embeddings"][0]

# ── Neo4j KAG expansion ───────────────────────────────────────────────────────

async def kag_neighbors(doc_ids: list[str], limit: int = 8) -> list[dict]:
    """Return neighboring documents from Neo4j for KAG context expansion."""
    if not doc_ids:
        return []
    try:
        from neo4j import AsyncGraphDatabase
        driver = AsyncGraphDatabase.driver(NEO4J_URL, auth=(NEO4J_USER, NEO4J_PASS))
        async with driver.session() as session:
            result = await session.run(
                """
                MATCH (n:CodebaseFile)-[:IMPORTS|REFERENCES]->(m:CodebaseFile)
                WHERE n.id IN $ids OR m.id IN $ids
                RETURN DISTINCT m.id AS id, m.filePath AS path,
                       m.gpuCluster AS cluster, m.summary AS summary
                LIMIT $limit
                """,
                ids=doc_ids,
                limit=limit,
            )
            records = await result.values()
        await driver.close()
        return [
            {"id": r[0], "path": r[1], "cluster": r[2], "summary": r[3] or ""}
            for r in records
        ]
    except Exception as exc:  # Neo4j unavailable → non-fatal
        print(f"[kag] Neo4j unavailable: {exc}")
        return []

# ── LangGraph state ───────────────────────────────────────────────────────────

class SynthesisState(TypedDict):
    query: str
    case_id: str | None
    rag_hits: list[dict]
    kag_neighbors: list[dict]
    merged_context: str
    llm_response: str
    confidence: float
    retried: bool
    trace_id: str

# ── LangGraph nodes ───────────────────────────────────────────────────────────

async def node_retrieve_rag(state: SynthesisState) -> dict:
    """Vector search over legal_documents + evidence_items."""
    qdrant = await get_qdrant()
    embedding = await embed_query(state["query"])

    hits: list[dict] = []
    for collection in ("legal_documents", "evidence_items"):
        try:
            results = await qdrant.query_points(
                collection_name=collection,
                query=embedding,
                limit=5,
                with_payload=True,
            )
            for pt in results.points:
                payload = pt.payload or {}
                hits.append(
                    {
                        "id": str(pt.id),
                        "score": pt.score,
                        "text": payload.get("chunk_text", payload.get("text", "")),
                        "title": payload.get("title", payload.get("doc_title", "")),
                        "source": collection,
                    }
                )
        except Exception as exc:
            print(f"[rag] {collection} search failed: {exc}")

    hits.sort(key=lambda h: h["score"], reverse=True)
    return {"rag_hits": hits[:10]}


async def node_retrieve_kag(state: SynthesisState) -> dict:
    """Graph neighbor expansion from RAG hit document IDs."""
    doc_ids = [h["id"] for h in state["rag_hits"][:5]]
    neighbors = await kag_neighbors(doc_ids)
    return {"kag_neighbors": neighbors}


async def node_merge_context(state: SynthesisState) -> dict:
    """Merge RAG hits + KAG neighbors into a single context block."""
    parts: list[str] = []

    if state["rag_hits"]:
        parts.append("## Retrieved Context (RAG)\n")
        for i, hit in enumerate(state["rag_hits"][:6], 1):
            parts.append(f"[{i}] {hit['title']} (score={hit['score']:.2f})\n{hit['text']}\n")

    if state["kag_neighbors"]:
        parts.append("\n## Graph Neighbors (KAG)\n")
        for nb in state["kag_neighbors"][:4]:
            if nb.get("summary"):
                parts.append(f"- {nb['path']}: {nb['summary']}\n")

    return {"merged_context": "\n".join(parts)}


async def node_synthesize(state: SynthesisState) -> dict:
    """Call Ollama Gemma4-legal with the merged context."""
    llm = ChatOllama(base_url=OLLAMA_URL, model=LLM_MODEL, temperature=0.3)

    system = (
        "You are a legal AI assistant. Answer using ONLY the provided context. "
        "If the context is insufficient, say so. Be concise and cite sources where possible."
    )
    context = state["merged_context"] or "No context retrieved."
    user_msg = f"Context:\n{context}\n\nQuestion: {state['query']}"

    response = await llm.ainvoke([SystemMessage(content=system), HumanMessage(content=user_msg)])
    text = response.content or ""

    # Simple confidence heuristic: longer, citation-rich answers score higher
    confidence = min(0.95, 0.5 + len(state["rag_hits"]) * 0.05 + (0.1 if "[" in text else 0))
    return {"llm_response": text, "confidence": confidence}


async def node_self_eval(state: SynthesisState) -> dict:
    """Low-confidence retry with reformulated prompt."""
    if state["confidence"] >= CONFIDENCE_THRESHOLD or state["retried"]:
        return {}  # no change

    llm = ChatOllama(base_url=OLLAMA_URL, model=LLM_MODEL, temperature=0.5)
    retry_prompt = (
        f"Your previous answer may be incomplete. "
        f"Retry with a more thorough analysis.\n\n"
        f"Context:\n{state['merged_context']}\n\n"
        f"Question: {state['query']}\n\n"
        f"Previous answer: {state['llm_response']}"
    )
    response = await llm.ainvoke([HumanMessage(content=retry_prompt)])
    confidence = min(0.95, state["confidence"] + 0.15)
    return {"llm_response": response.content or state["llm_response"], "confidence": confidence, "retried": True}


def should_retry(state: SynthesisState) -> str:
    if state["confidence"] < CONFIDENCE_THRESHOLD and not state["retried"]:
        return "retry"
    return "done"

# ── Build LangGraph ───────────────────────────────────────────────────────────

def build_graph() -> Any:
    g = StateGraph(SynthesisState)
    g.add_node("retrieve_rag", node_retrieve_rag)
    g.add_node("retrieve_kag", node_retrieve_kag)
    g.add_node("merge_context", node_merge_context)
    g.add_node("synthesize", node_synthesize)
    g.add_node("self_eval", node_self_eval)

    g.set_entry_point("retrieve_rag")
    g.add_edge("retrieve_rag", "retrieve_kag")
    g.add_edge("retrieve_kag", "merge_context")
    g.add_edge("merge_context", "synthesize")
    g.add_edge("synthesize", "self_eval")
    g.add_conditional_edges("self_eval", should_retry, {"retry": "synthesize", "done": END})

    return g.compile()

_graph = build_graph()

# ── API models ────────────────────────────────────────────────────────────────

class SynthesizeRequest(BaseModel):
    query: str
    case_id: str | None = None

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/synthesize")
async def synthesize(req: SynthesizeRequest) -> dict:
    trace_id = str(uuid.uuid4())
    t0 = time.perf_counter()

    initial: SynthesisState = {
        "query": req.query,
        "case_id": req.case_id,
        "rag_hits": [],
        "kag_neighbors": [],
        "merged_context": "",
        "llm_response": "",
        "confidence": 0.0,
        "retried": False,
        "trace_id": trace_id,
    }

    try:
        result = await _graph.ainvoke(initial)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "answer": result["llm_response"],
        "confidence": result["confidence"],
        "rag_hits": len(result["rag_hits"]),
        "kag_neighbors": len(result["kag_neighbors"]),
        "retried": result["retried"],
        "latency_ms": round((time.perf_counter() - t0) * 1000),
        "trace_id": trace_id,
        "gpu": torch.cuda.is_available(),
    }


@app.post("/synthesize/stream")
async def synthesize_stream(req: SynthesizeRequest) -> StreamingResponse:
    """SSE streaming synthesis — RAG+KAG context then streamed LLM response."""

    async def generate() -> AsyncGenerator[str, None]:
        trace_id = str(uuid.uuid4())

        # Stage 1: RAG
        yield f"data: {json.dumps({'stage': 'rag', 'status': 'running'})}\n\n"
        embedding = await embed_query(req.query)
        qdrant = await get_qdrant()
        rag_hits: list[dict] = []
        for col in ("legal_documents", "evidence_items"):
            try:
                results = await qdrant.query_points(col, query=embedding, limit=5, with_payload=True)
                for pt in results.points:
                    p = pt.payload or {}
                    rag_hits.append({"score": pt.score, "text": p.get("chunk_text", ""), "title": p.get("title", "")})
            except Exception:
                pass
        rag_hits.sort(key=lambda h: h["score"], reverse=True)
        yield f"data: {json.dumps({'stage': 'rag', 'status': 'done', 'hits': len(rag_hits)})}\n\n"

        # Stage 2: KAG
        yield f"data: {json.dumps({'stage': 'kag', 'status': 'running'})}\n\n"
        neighbors = await kag_neighbors([h.get("id", "") for h in rag_hits[:5]])
        yield f"data: {json.dumps({'stage': 'kag', 'status': 'done', 'neighbors': len(neighbors)})}\n\n"

        # Stage 3: LLM stream
        yield f"data: {json.dumps({'stage': 'llm', 'status': 'running'})}\n\n"
        context_parts = [f"[{i+1}] {h['title']}\n{h['text']}" for i, h in enumerate(rag_hits[:6])]
        context = "\n\n".join(context_parts) or "No context available."
        prompt = f"Context:\n{context}\n\nQuestion: {req.query}"

        llm = ChatOllama(base_url=OLLAMA_URL, model=LLM_MODEL, temperature=0.3, streaming=True)
        full_text = ""
        async for chunk in llm.astream([HumanMessage(content=prompt)]):
            token = chunk.content or ""
            full_text += token
            yield f"data: {json.dumps({'stage': 'llm', 'token': token})}\n\n"

        yield f"data: {json.dumps({'stage': 'done', 'confidence': 0.8, 'trace_id': trace_id})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/health")
async def health() -> dict:
    checks: dict[str, Any] = {
        "service": "langgraph-synthesis",
        "gpu": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "vram_free_mb": (
            round((torch.cuda.mem_get_info()[0]) / 1024**2)
            if torch.cuda.is_available() else None
        ),
    }

    # Qdrant ping
    try:
        qdrant = await get_qdrant()
        await qdrant.get_collections()
        checks["qdrant"] = "ok"
    except Exception as exc:
        checks["qdrant"] = f"error: {exc}"

    # Ollama ping
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            models = [m["name"] for m in r.json().get("models", [])]
            checks["ollama"] = "ok"
            checks["ollama_models"] = models
    except Exception as exc:
        checks["ollama"] = f"error: {exc}"

    all_ok = all(v in ("ok", True) or (isinstance(v, list)) or v is None
                 for k, v in checks.items()
                 if k not in ("gpu_name", "vram_free_mb", "service", "ollama_models"))
    checks["status"] = "ok" if all_ok else "degraded"
    return checks
