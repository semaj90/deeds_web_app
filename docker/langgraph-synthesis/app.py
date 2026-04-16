"""
LangGraph Synthesis Service  (port 8091)  — Full Stack Edition
==============================================================
Cache hierarchy:
  L1  Redis exact-match      → 2ms   (SHA-256 of model+messages+temp)
  L2  Bifrost semantic cache → 2-5s  (Qdrant cosine similarity ≥ 0.80)
  L3  LangGraph DAG          → 15-35s (RAG → KAG → ACE → LLM → self-eval)

LangGraph DAG nodes:
  web_search  ──┐
  rg_search   ──┤→ retrieve_rag → retrieve_kag → assemble_ace → merge → synthesize → self_eval
  (parallel)  ──┘

Endpoints:
  POST /synthesize         — full pipeline, JSON
  POST /synthesize/stream  — SSE streaming
  GET  /health             — GPU + dependency health
  GET  /cache/stats        — Redis L1 key count + memory
  DELETE /cache/key        — manual L1 invalidation
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import subprocess
import time
import uuid
from typing import Any, AsyncGenerator, TypedDict

import httpx
import redis.asyncio as aioredis
import torch
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from langgraph.graph import END, StateGraph
from pydantic import BaseModel
from qdrant_client import AsyncQdrantClient

# ── Config ────────────────────────────────────────────────────────────────────

log = logging.getLogger("langgraph-synthesis")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

OLLAMA_URL         = os.environ.get("OLLAMA_URL",       "http://host.docker.internal:11434")
QDRANT_URL         = os.environ.get("QDRANT_URL",       "http://qdrant:6333")
BIFROST_URL        = os.environ.get("BIFROST_URL",      "http://host.docker.internal:3040")
REDIS_URL          = os.environ.get("REDIS_URL",        "redis://redis:6379/0")
NEO4J_URI          = os.environ.get("NEO4J_URI",        "bolt://neo4j:7687")
NEO4J_USER         = os.environ.get("NEO4J_USER",       "neo4j")
NEO4J_PASSWORD     = os.environ.get("NEO4J_PASSWORD",   "password")
SEARXNG_URL        = os.environ.get("SEARXNG_URL",      "http://searxng:8080")
LLM_MODEL          = os.environ.get("LLM_MODEL",        "gemma4-legal:latest")
EMBED_MODEL        = os.environ.get("EMBED_MODEL",      "embeddinggemma:latest")
REPO_ROOT          = os.environ.get("REPO_ROOT",        "/workspace/repo")
CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.65"))
REDIS_L1_PREFIX    = "llm:exact:"
REDIS_L1_TTL       = 3600  # 1 hour — matches TS redis-exact-match.ts
BIFROST_THRESHOLD  = float(os.environ.get("BIFROST_THRESHOLD", "0.80"))

# ── FastAPI ───────────────────────────────────────────────────────────────────

app = FastAPI(title="LangGraph Synthesis", version="2.0.0")

# ── Lazy singletons ───────────────────────────────────────────────────────────

_redis: aioredis.Redis | None = None
_qdrant: AsyncQdrantClient | None = None

async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis

async def get_qdrant() -> AsyncQdrantClient:
    global _qdrant
    if _qdrant is None:
        _qdrant = AsyncQdrantClient(url=QDRANT_URL)
    return _qdrant

# ═══════════════════════════════════════════════════════════════════════════════
# L1: Redis exact-match cache  (matches TS redis-exact-match.ts key scheme)
# ═══════════════════════════════════════════════════════════════════════════════

def _l1_key(model: str, messages: list[dict], temperature: float, max_tokens: int) -> str:
    """SHA-256 cache key — identical algorithm to TS generateCacheKey()."""
    normalized = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "maxTokens": max_tokens,
        "systemPrompt": "",
    }
    digest = hashlib.sha256(json.dumps(normalized, separators=(",", ":")).encode()).hexdigest()[:16]
    return f"{REDIS_L1_PREFIX}{digest}"

async def l1_get(key: str) -> dict | None:
    try:
        redis = await get_redis()
        raw = await redis.get(key)
        if not raw:
            return None
        cached = json.loads(raw)
        age = round((time.time() - time.mktime(
            time.strptime(cached.get("cachedAt","1970-01-01T00:00:00"), "%Y-%m-%dT%H:%M:%S")
        )))
        log.info(f"[L1 HIT] key=...{key[-8:]} age={age}s")
        return cached
    except Exception as exc:
        log.warning(f"[L1] GET error (non-fatal): {exc}")
        return None

async def l1_set(key: str, content: str, model: str, backend: str) -> None:
    try:
        redis = await get_redis()
        payload = {
            "content": content,
            "model": model,
            "backend": backend,
            "cachedAt": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
        }
        await redis.set(key, json.dumps(payload), ex=REDIS_L1_TTL)
        log.info(f"[L1 SET] key=...{key[-8:]} model={model} backend={backend}")
    except Exception as exc:
        log.warning(f"[L1] SET error (non-fatal): {exc}")

# ═══════════════════════════════════════════════════════════════════════════════
# L2: Bifrost semantic cache
# ═══════════════════════════════════════════════════════════════════════════════

async def l2_check(messages: list[dict], model: str, temperature: float) -> str | None:
    """Try Bifrost semantic cache. Returns text on HIT, None on MISS."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.post(
                f"{BIFROST_URL}/v1/chat/completions",
                json={"model": model, "messages": messages, "temperature": temperature, "max_tokens": 1024},
                headers={
                    "x-bf-cache-type": "semantic",
                    "x-bf-cache-threshold": str(BIFROST_THRESHOLD),
                },
            )
            if r.status_code == 200:
                data = r.json()
                text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                source = r.headers.get("x-bf-cache-source", "")
                if text and source in ("semantic", "exact"):
                    log.info(f"[L2 HIT] source={source} model={model}")
                    return text
    except Exception as exc:
        log.debug(f"[L2] Bifrost unavailable (non-fatal): {exc}")
    return None

# ═══════════════════════════════════════════════════════════════════════════════
# Embedding
# ═══════════════════════════════════════════════════════════════════════════════

async def embed_query(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{OLLAMA_URL}/api/embed",
            json={"model": EMBED_MODEL, "input": text[:2048]},
        )
        r.raise_for_status()
        return r.json()["embeddings"][0]

# ═══════════════════════════════════════════════════════════════════════════════
# Web search  (SearXNG → DuckDuckGo fallback)
# ═══════════════════════════════════════════════════════════════════════════════

async def web_search(query: str, limit: int = 5) -> list[dict]:
    """Search web via SearXNG (self-hosted) with DuckDuckGo fallback."""
    # Try SearXNG first
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f"{SEARXNG_URL}/search",
                params={"q": query, "format": "json", "categories": "general", "language": "en"},
            )
            if r.status_code == 200:
                data = r.json()
                return [
                    {"title": h.get("title",""), "url": h.get("url",""), "snippet": h.get("content",""), "source": "searxng"}
                    for h in data.get("results", [])[:limit]
                ]
    except Exception:
        pass
    # DuckDuckGo instant answer fallback
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            r = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
                headers={"User-Agent": "DeedsAI/2.0 (legal-research)"},
            )
            if r.status_code == 200:
                data = r.json()
                results = []
                if data.get("AbstractText"):
                    results.append({"title": data.get("Heading",""), "url": data.get("AbstractURL",""), "snippet": data["AbstractText"], "source": "duckduckgo"})
                for rt in data.get("RelatedTopics", [])[:limit - len(results)]:
                    if isinstance(rt, dict) and rt.get("Text"):
                        results.append({"title": rt.get("Text","")[:60], "url": rt.get("FirstURL",""), "snippet": rt.get("Text",""), "source": "duckduckgo"})
                return results
    except Exception as exc:
        log.debug(f"[web_search] fallback failed: {exc}")
    return []

# ═══════════════════════════════════════════════════════════════════════════════
# Codebase rg search  (ripgrep JSON output)
# ═══════════════════════════════════════════════════════════════════════════════

def rg_search(query: str, path: str = REPO_ROOT, limit: int = 8) -> list[dict]:
    """
    Use ripgrep to search the local codebase.
    Falls back gracefully if rg is not installed or REPO_ROOT doesn't exist.
    """
    if not os.path.isdir(path):
        return []
    try:
        result = subprocess.run(
            ["rg", "--json", "-i", "-l", "--max-count", "1", query, path,
             "--glob", "*.ts", "--glob", "*.svelte", "--glob", "*.py", "--glob", "*.md",
             "--glob", "!node_modules", "--glob", "!.svelte-kit", "--glob", "!dist"],
            capture_output=True, text=True, timeout=10,
        )
        hits: list[dict] = []
        for line in result.stdout.splitlines()[:limit * 3]:
            try:
                obj = json.loads(line)
                if obj.get("type") == "match":
                    data = obj["data"]
                    hits.append({
                        "file": data.get("path", {}).get("text", ""),
                        "line": data.get("line_number", 0),
                        "text": data.get("lines", {}).get("text", "").strip(),
                    })
            except Exception:
                pass
        # Dedupe by file
        seen: set[str] = set()
        deduped = [h for h in hits if not (h["file"] in seen or seen.add(h["file"]))]  # type: ignore[func-returns-value]
        return deduped[:limit]
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        log.debug(f"[rg_search] unavailable: {exc}")
        return []

# ═══════════════════════════════════════════════════════════════════════════════
# ACE entity extraction  (regex — mirrors tag-extractor.ts)
# ═══════════════════════════════════════════════════════════════════════════════

_STATUTE_RE = re.compile(r'\d+\s+[A-Z][a-zA-Z.]+\s*[§Ss]+\s*[\d\-]+(?:\([a-z]\))?', re.I)
_CASE_RE    = re.compile(r'[A-Z][a-z]+(?: [A-Z][a-z]+)* v\.? [A-Z][a-z]+(?: [A-Z][a-z]+)*', re.I)

def extract_legal_entities(text: str) -> dict:
    return {
        "statutes": list({m.group() for m in _STATUTE_RE.finditer(text)})[:6],
        "cases":    list({m.group() for m in _CASE_RE.finditer(text)})[:6],
    }

# ═══════════════════════════════════════════════════════════════════════════════
# Neo4j KAG expansion
# ═══════════════════════════════════════════════════════════════════════════════

async def kag_neighbors(doc_ids: list[str], limit: int = 8) -> list[dict]:
    if not doc_ids:
        return []
    try:
        from neo4j import AsyncGraphDatabase
        driver = AsyncGraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        async with driver.session() as session:
            result = await session.run(
                "MATCH (n)-[:IMPORTS|REFERENCES]->(m) WHERE n.id IN $ids OR m.id IN $ids "
                "RETURN DISTINCT m.id AS id, m.filePath AS path, m.summary AS summary LIMIT $limit",
                ids=doc_ids, limit=limit,
            )
            records = await result.values()
        await driver.close()
        return [{"id": r[0], "path": r[1], "summary": r[2] or ""} for r in records]
    except Exception as exc:
        log.debug(f"[kag] Neo4j unavailable: {exc}")
        return []

# ═══════════════════════════════════════════════════════════════════════════════
# LangGraph state
# ═══════════════════════════════════════════════════════════════════════════════

class SynthesisState(TypedDict):
    query: str
    case_id: str | None
    entities: dict
    web_results: list[dict]
    rg_results: list[dict]
    rag_hits: list[dict]
    kag_neighbors: list[dict]
    ace_context: str
    merged_context: str
    llm_response: str
    confidence: float
    retried: bool
    trace_id: str

# ═══════════════════════════════════════════════════════════════════════════════
# LangGraph nodes
# ═══════════════════════════════════════════════════════════════════════════════

async def node_web_search(state: SynthesisState) -> dict:
    results = await web_search(state["query"])
    return {"web_results": results}

async def node_rg_search(state: SynthesisState) -> dict:
    results = rg_search(state["query"])
    return {"rg_results": results}

async def node_retrieve_rag(state: SynthesisState) -> dict:
    qdrant = await get_qdrant()
    embedding = await embed_query(state["query"])
    hits: list[dict] = []
    for collection in ("legal_documents", "evidence_items", "chat_messages"):
        try:
            results = await qdrant.query_points(
                collection_name=collection, query=embedding, limit=5, with_payload=True,
            )
            for pt in results.points:
                p = pt.payload or {}
                hits.append({
                    "id": str(pt.id),
                    "score": pt.score,
                    "text": p.get("chunk_text", p.get("text", ""))[:600],
                    "title": p.get("title", p.get("doc_title", "")),
                    "source": collection,
                })
        except Exception as exc:
            log.debug(f"[rag] {collection}: {exc}")
    hits.sort(key=lambda h: h["score"], reverse=True)
    return {"rag_hits": hits[:10]}

async def node_retrieve_kag(state: SynthesisState) -> dict:
    neighbors = await kag_neighbors([h["id"] for h in state["rag_hits"][:5]])
    return {"kag_neighbors": neighbors}

async def node_assemble_ace(state: SynthesisState) -> dict:
    """
    Assemble ACE context block from all retrieved sources.
    Mirrors context-assembler.ts token budget allocation.
    """
    parts: list[str] = []

    # Legal entity extraction
    entities = state.get("entities") or extract_legal_entities(state["query"])
    if entities.get("statutes") or entities.get("cases"):
        parts.append("## Legal Entities\n" +
            "\n".join(f"- {s}" for s in entities.get("statutes", [])) +
            "\n".join(f"- {c}" for c in entities.get("cases", [])))

    # RAG chunks  (highest priority)
    if state["rag_hits"]:
        parts.append("## Retrieved Legal Context (RAG)")
        for i, h in enumerate(state["rag_hits"][:6], 1):
            parts.append(f"[{i}] {h['title']} ({h['source']}, score={h['score']:.2f})\n{h['text']}")

    # KAG neighbors
    if state["kag_neighbors"]:
        parts.append("\n## Graph Neighbors (KAG)")
        for nb in state["kag_neighbors"][:4]:
            if nb.get("summary"):
                parts.append(f"- {nb['path']}: {nb['summary']}")

    # Web search results
    if state["web_results"]:
        parts.append("\n## Web Search Results")
        for w in state["web_results"][:4]:
            parts.append(f"- [{w['title']}]({w['url']})\n  {w['snippet'][:200]}")

    # Codebase rg hits
    if state["rg_results"]:
        parts.append("\n## Codebase Context (rg)")
        for r in state["rg_results"][:4]:
            parts.append(f"- `{r['file']}:{r['line']}` — {r['text'][:120]}")

    return {"ace_context": "\n\n".join(parts), "entities": entities}

async def node_merge(state: SynthesisState) -> dict:
    return {"merged_context": state["ace_context"]}

async def node_synthesize(state: SynthesisState) -> dict:
    llm = ChatOllama(base_url=OLLAMA_URL, model=LLM_MODEL, temperature=0.3)
    context = state["merged_context"] or "No context retrieved."
    system = (
        "You are a legal AI assistant (ACE — Adaptive Context Engine). "
        "Answer using ONLY the provided context. Cite sources by [N] index. "
        "If context is insufficient, say so explicitly."
    )
    user_msg = f"Context:\n{context}\n\nQuestion: {state['query']}"
    response = await llm.ainvoke([SystemMessage(content=system), HumanMessage(content=user_msg)])
    text = response.content or ""
    confidence = min(0.95, 0.5 + len(state["rag_hits"]) * 0.05 + (0.1 if "[" in text else 0)
                     + (0.05 if state["web_results"] else 0))
    return {"llm_response": text, "confidence": confidence}

async def node_self_eval(state: SynthesisState) -> dict:
    if state["confidence"] >= CONFIDENCE_THRESHOLD or state["retried"]:
        return {}
    llm = ChatOllama(base_url=OLLAMA_URL, model=LLM_MODEL, temperature=0.5)
    retry = (
        f"Your previous answer may be incomplete. Provide a more thorough legal analysis.\n\n"
        f"Context:\n{state['merged_context']}\n\nQuestion: {state['query']}\n\n"
        f"Previous (incomplete) answer:\n{state['llm_response']}"
    )
    response = await llm.ainvoke([HumanMessage(content=retry)])
    return {
        "llm_response": response.content or state["llm_response"],
        "confidence": min(0.95, state["confidence"] + 0.15),
        "retried": True,
    }

def _should_retry(state: SynthesisState) -> str:
    return "retry" if state["confidence"] < CONFIDENCE_THRESHOLD and not state["retried"] else "done"

# ═══════════════════════════════════════════════════════════════════════════════
# Build graph
# ═══════════════════════════════════════════════════════════════════════════════

def _build_graph() -> Any:
    g = StateGraph(SynthesisState)
    g.add_node("web_search",    node_web_search)
    g.add_node("rg_search",     node_rg_search)
    g.add_node("retrieve_rag",  node_retrieve_rag)
    g.add_node("retrieve_kag",  node_retrieve_kag)
    g.add_node("assemble_ace",  node_assemble_ace)
    g.add_node("merge",         node_merge)
    g.add_node("synthesize",    node_synthesize)
    g.add_node("self_eval",     node_self_eval)

    # Parallel retrieval fan-out from entry
    g.set_entry_point("retrieve_rag")
    # web + rg run in parallel before rag completes — triggered from rag fan-out
    g.add_edge("retrieve_rag",  "retrieve_kag")
    g.add_edge("retrieve_rag",  "web_search")
    g.add_edge("retrieve_rag",  "rg_search")
    g.add_edge("retrieve_kag",  "assemble_ace")
    g.add_edge("web_search",    "assemble_ace")
    g.add_edge("rg_search",     "assemble_ace")
    g.add_edge("assemble_ace",  "merge")
    g.add_edge("merge",         "synthesize")
    g.add_edge("synthesize",    "self_eval")
    g.add_conditional_edges("self_eval", _should_retry, {"retry": "synthesize", "done": END})
    return g.compile()

_graph = _build_graph()

# ═══════════════════════════════════════════════════════════════════════════════
# Request/Response models
# ═══════════════════════════════════════════════════════════════════════════════

class SynthesizeRequest(BaseModel):
    query: str
    case_id: str | None = None
    temperature: float = 0.3
    max_tokens: int = 1024
    skip_cache: bool = False

# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/synthesize")
async def synthesize(req: SynthesizeRequest) -> dict:
    trace_id = str(uuid.uuid4())
    t0 = time.perf_counter()

    messages = [{"role": "user", "content": req.query}]
    cache_key = _l1_key(LLM_MODEL, messages, req.temperature, req.max_tokens)

    # L1: Redis exact-match
    if not req.skip_cache:
        cached = await l1_get(cache_key)
        if cached:
            return {
                "answer": cached["content"], "confidence": 0.95,
                "cache": "L1-redis", "latency_ms": round((time.perf_counter() - t0) * 1000),
                "trace_id": trace_id,
            }

    # L2: Bifrost semantic
    if not req.skip_cache:
        bifrost_hit = await l2_check(messages, LLM_MODEL, req.temperature)
        if bifrost_hit:
            await l1_set(cache_key, bifrost_hit, LLM_MODEL, "bifrost")
            return {
                "answer": bifrost_hit, "confidence": 0.92,
                "cache": "L2-bifrost", "latency_ms": round((time.perf_counter() - t0) * 1000),
                "trace_id": trace_id,
            }

    # L3: LangGraph DAG
    initial: SynthesisState = {
        "query": req.query, "case_id": req.case_id,
        "entities": extract_legal_entities(req.query),
        "web_results": [], "rg_results": [], "rag_hits": [],
        "kag_neighbors": [], "ace_context": "", "merged_context": "",
        "llm_response": "", "confidence": 0.0, "retried": False, "trace_id": trace_id,
    }

    try:
        result = await _graph.ainvoke(initial)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    answer = result["llm_response"]

    # Write back to L1
    await l1_set(cache_key, answer, LLM_MODEL, "langgraph")

    return {
        "answer": answer,
        "confidence": result["confidence"],
        "cache": "L3-langgraph",
        "rag_hits": len(result["rag_hits"]),
        "kag_neighbors": len(result["kag_neighbors"]),
        "web_results": len(result["web_results"]),
        "rg_results": len(result["rg_results"]),
        "retried": result["retried"],
        "entities": result["entities"],
        "latency_ms": round((time.perf_counter() - t0) * 1000),
        "trace_id": trace_id,
        "gpu": torch.cuda.is_available(),
    }


@app.post("/synthesize/stream")
async def synthesize_stream(req: SynthesizeRequest) -> StreamingResponse:
    """SSE streaming: emits stage events then streamed LLM tokens."""

    async def generate() -> AsyncGenerator[str, None]:
        trace_id = str(uuid.uuid4())
        messages = [{"role": "user", "content": req.query}]
        cache_key = _l1_key(LLM_MODEL, messages, req.temperature, req.max_tokens)

        # L1 check
        if not req.skip_cache:
            cached = await l1_get(cache_key)
            if cached:
                yield f"data: {json.dumps({'stage':'cache','source':'L1-redis'})}\n\n"
                yield f"data: {json.dumps({'stage':'llm','token': cached['content']})}\n\n"
                yield f"data: {json.dumps({'stage':'done','confidence':0.95,'trace_id':trace_id,'cache':'L1-redis'})}\n\n"
                return

        # L2 check
        if not req.skip_cache:
            bifrost_hit = await l2_check(messages, LLM_MODEL, req.temperature)
            if bifrost_hit:
                yield f"data: {json.dumps({'stage':'cache','source':'L2-bifrost'})}\n\n"
                await l1_set(cache_key, bifrost_hit, LLM_MODEL, "bifrost")
                yield f"data: {json.dumps({'stage':'llm','token': bifrost_hit})}\n\n"
                yield f"data: {json.dumps({'stage':'done','confidence':0.92,'trace_id':trace_id,'cache':'L2-bifrost'})}\n\n"
                return

        # L3: parallel retrieval
        yield f"data: {json.dumps({'stage':'rag','status':'running'})}\n\n"
        embedding = await embed_query(req.query)
        qdrant = await get_qdrant()
        rag_hits: list[dict] = []
        for col in ("legal_documents", "evidence_items"):
            try:
                res = await qdrant.query_points(col, query=embedding, limit=5, with_payload=True)
                for pt in res.points:
                    p = pt.payload or {}
                    rag_hits.append({"score": pt.score, "text": p.get("chunk_text","")[:400],
                                     "title": p.get("title",""), "id": str(pt.id)})
            except Exception:
                pass
        rag_hits.sort(key=lambda h: h["score"], reverse=True)
        yield f"data: {json.dumps({'stage':'rag','status':'done','hits':len(rag_hits)})}\n\n"

        yield f"data: {json.dumps({'stage':'kag','status':'running'})}\n\n"
        neighbors = await kag_neighbors([h["id"] for h in rag_hits[:5]])
        web_results, rg_results = await asyncio.gather(
            web_search(req.query, limit=3),
            asyncio.to_thread(rg_search, req.query, REPO_ROOT, 4),
        )
        yield f"data: {json.dumps({'stage':'kag','status':'done','neighbors':len(neighbors),'web':len(web_results),'rg':len(rg_results)})}\n\n"

        # Build ACE context
        ctx_state: SynthesisState = {
            "query": req.query, "case_id": None,
            "entities": extract_legal_entities(req.query),
            "web_results": web_results, "rg_results": rg_results,
            "rag_hits": rag_hits, "kag_neighbors": neighbors,
            "ace_context": "", "merged_context": "", "llm_response": "",
            "confidence": 0.0, "retried": False, "trace_id": trace_id,
        }
        ace_out = await node_assemble_ace(ctx_state)
        context = ace_out.get("ace_context", "No context.")

        # Stream LLM tokens
        yield f"data: {json.dumps({'stage':'llm','status':'running'})}\n\n"
        system = ("You are ACE — a legal AI assistant. Answer using ONLY the provided context. "
                  "Cite sources by [N] index.")
        llm = ChatOllama(base_url=OLLAMA_URL, model=LLM_MODEL, temperature=req.temperature, streaming=True)
        full_text = ""
        async for chunk in llm.astream([
            SystemMessage(content=system),
            HumanMessage(content=f"Context:\n{context}\n\nQuestion: {req.query}"),
        ]):
            token = chunk.content or ""
            full_text += token
            yield f"data: {json.dumps({'stage':'llm','token':token})}\n\n"

        await l1_set(cache_key, full_text, LLM_MODEL, "langgraph-stream")
        confidence = min(0.95, 0.5 + len(rag_hits) * 0.05 + (0.1 if "[" in full_text else 0))
        yield f"data: {json.dumps({'stage':'done','confidence':confidence,'trace_id':trace_id,'cache':'L3-langgraph'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/cache/stats")
async def cache_stats() -> dict:
    try:
        redis = await get_redis()
        keys: list[str] = []
        cursor = 0
        while True:
            cursor, batch = await redis.scan(cursor, match=f"{REDIS_L1_PREFIX}*", count=100)
            keys.extend(batch)
            if cursor == 0:
                break
        ttls = await asyncio.gather(*[redis.ttl(k) for k in keys], return_exceptions=True)
        valid = [t for t in ttls if isinstance(t, int) and t > 0]
        return {
            "total_keys": len(keys),
            "avg_ttl_seconds": round(sum(valid) / len(valid)) if valid else 0,
            "prefix": REDIS_L1_PREFIX,
        }
    except Exception as exc:
        return {"error": str(exc)}


@app.delete("/cache/key")
async def cache_delete(key: str = Query(..., description="Full Redis key to delete")) -> dict:
    try:
        redis = await get_redis()
        deleted = await redis.delete(key)
        return {"deleted": deleted == 1, "key": key}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/health")
async def health() -> dict:
    checks: dict[str, Any] = {
        "service": "langgraph-synthesis",
        "version": "2.0.0",
        "gpu": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "vram_free_mb": round(torch.cuda.mem_get_info()[0] / 1024**2) if torch.cuda.is_available() else None,
    }

    async def ping(name: str, coro: Any) -> None:
        try:
            await coro
            checks[name] = "ok"
        except Exception as exc:
            checks[name] = f"error: {exc}"

    qdrant = await get_qdrant()
    redis  = await get_redis()

    await asyncio.gather(
        ping("qdrant",  qdrant.get_collections()),
        ping("redis",   redis.ping()),
        return_exceptions=True,
    )

    try:
        async with httpx.AsyncClient(timeout=4) as c:
            r = await c.get(f"{OLLAMA_URL}/api/tags")
            checks["ollama"] = "ok"
            checks["ollama_models"] = [m["name"] for m in r.json().get("models", [])]
    except Exception as exc:
        checks["ollama"] = f"error: {exc}"

    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get(f"{BIFROST_URL}/health")
            checks["bifrost"] = "ok" if r.status_code == 200 else f"http-{r.status_code}"
    except Exception:
        checks["bifrost"] = "unavailable"

    checks["rg_available"] = subprocess.run(["rg", "--version"], capture_output=True).returncode == 0
    checks["status"] = "ok" if all(
        v in ("ok", True) for k, v in checks.items()
        if k in ("qdrant", "redis", "ollama", "gpu")
    ) else "degraded"
    return checks
