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
import numpy as np
import redis.asyncio as aioredis
import torch
from fastapi import FastAPI, HTTPException, Query
from collections import Counter
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
REDIS_KAG_PREFIX   = "langgraph:kag:neighbors:"  # pre-warm cache written by Colab Cell 11
REDIS_KAG_TTL      = 86_400  # 24 h — refreshed by nightly Colab run
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
# HMM Legal Section Tagger  (salvaged from deeds_labs/services/hmm-topic-service)
# Pure numpy — no GPU needed. Viterbi over 7 legal states: PARTIES → JURISDICTION
# → FACTS → LEGAL_AUTHORITY → CLAIMS → PRAYER → HOLDING
# ═══════════════════════════════════════════════════════════════════════════════

class LegalHMM:
    STATES = ['PARTIES', 'JURISDICTION', 'FACTS', 'LEGAL_AUTHORITY', 'CLAIMS', 'PRAYER', 'HOLDING']
    TRANSITIONS = {
        'PARTIES':        {'JURISDICTION': 0.9, 'FACTS': 0.1},
        'JURISDICTION':   {'FACTS': 0.8, 'LEGAL_AUTHORITY': 0.2},
        'FACTS':          {'LEGAL_AUTHORITY': 0.7, 'CLAIMS': 0.3},
        'LEGAL_AUTHORITY':{'CLAIMS': 0.8, 'FACTS': 0.2},
        'CLAIMS':         {'PRAYER': 0.6, 'HOLDING': 0.4},
        'PRAYER':         {'HOLDING': 0.9, 'PARTIES': 0.1},
        'HOLDING':        {'PARTIES': 0.1, 'HOLDING': 0.9},
    }
    EMISSIONS = {
        'PARTIES':        {'plaintiff': 0.15, 'defendant': 0.15, 'appellant': 0.1, 'respondent': 0.1, 'petitioner': 0.1, 'v.': 0.2, 'versus': 0.15, 'party': 0.05},
        'JURISDICTION':   {'jurisdiction': 0.2, 'venue': 0.15, 'court': 0.15, 'district': 0.1, 'federal': 0.1, 'state': 0.1, 'competent': 0.05, 'proper': 0.05},
        'FACTS':          {'occurred': 0.1, 'happened': 0.1, 'alleged': 0.15, 'facts': 0.1, 'incident': 0.1, 'event': 0.1, 'date': 0.1, 'time': 0.05, 'place': 0.05},
        'LEGAL_AUTHORITY':{'statute': 0.15, 'regulation': 0.15, 'constitution': 0.1, 'law': 0.15, 'code': 0.1, 'section': 0.1, 'u.s.c.': 0.1, 'precedent': 0.05},
        'CLAIMS':         {'claim': 0.2, 'cause': 0.15, 'action': 0.15, 'violation': 0.15, 'breach': 0.1, 'negligence': 0.1, 'damages': 0.05},
        'PRAYER':         {'prayer': 0.2, 'relief': 0.2, 'damages': 0.15, 'injunction': 0.15, 'declaratory': 0.1, 'request': 0.05},
        'HOLDING':        {'held': 0.2, 'holding': 0.2, 'ruled': 0.15, 'affirmed': 0.1, 'reversed': 0.1, 'remanded': 0.1, 'therefore': 0.05},
    }

    def __init__(self) -> None:
        self._re_tok = re.compile(r'\b\w+\b')

    def _tokens(self, text: str) -> list[str]:
        return self._re_tok.findall(text.lower())

    def _emit(self, state: str, word: str) -> float:
        return self.EMISSIONS.get(state, {}).get(word, 0.01)

    def _trans(self, from_s: str, to_s: str) -> float:
        return self.TRANSITIONS.get(from_s, {}).get(to_s, 1.0 / len(self.STATES))

    def viterbi(self, tokens: list[str]) -> tuple[list[str], float]:
        n, k = len(tokens), len(self.STATES)
        V = np.full((k, n), -np.inf)
        B = np.zeros((k, n), dtype=int)
        for i, s in enumerate(self.STATES):
            V[i, 0] = np.log(self._emit(s, tokens[0]) + 1e-10)
        for t in range(1, n):
            for j, to_s in enumerate(self.STATES):
                ep = np.log(self._emit(to_s, tokens[t]) + 1e-10)
                scores = V[:, t - 1] + np.array([np.log(self._trans(f, to_s) + 1e-10) for f in self.STATES])
                best = int(np.argmax(scores))
                V[j, t] = scores[best] + ep
                B[j, t] = best
        path, s = [], int(np.argmax(V[:, -1]))
        path.append(s)
        for t in range(n - 1, 0, -1):
            s = B[s, t]; path.append(s)
        path.reverse()
        return [self.STATES[i] for i in path], float(np.exp(np.max(V[:, -1])))

    # ── Tag → state supervision map  (Qdrant payload tags / statute glossary) ───
    _TAG_STATE: dict[str, str] = {
        "plaintiff": "PARTIES", "defendant": "PARTIES", "appellant": "PARTIES",
        "respondent": "PARTIES", "petitioner": "PARTIES", "party": "PARTIES",
        "jurisdiction": "JURISDICTION", "venue": "JURISDICTION", "court": "JURISDICTION",
        "district": "JURISDICTION", "federal": "JURISDICTION",
        "facts": "FACTS", "incident": "FACTS", "allegation": "FACTS",
        "narrative": "FACTS", "background": "FACTS", "timeline": "FACTS",
        "statute": "LEGAL_AUTHORITY", "regulation": "LEGAL_AUTHORITY", "code": "LEGAL_AUTHORITY",
        "section": "LEGAL_AUTHORITY", "u.s.c.": "LEGAL_AUTHORITY", "precedent": "LEGAL_AUTHORITY",
        "authority": "LEGAL_AUTHORITY", "constitution": "LEGAL_AUTHORITY",
        "claim": "CLAIMS", "cause_of_action": "CLAIMS", "violation": "CLAIMS",
        "breach": "CLAIMS", "negligence": "CLAIMS", "liability": "CLAIMS",
        "damages": "CLAIMS",
        "prayer": "PRAYER", "relief": "PRAYER", "injunction": "PRAYER",
        "declaratory": "PRAYER", "remedy": "PRAYER",
        "holding": "HOLDING", "ruling": "HOLDING", "affirmed": "HOLDING",
        "reversed": "HOLDING", "remanded": "HOLDING", "judgment": "HOLDING",
        "verdict": "HOLDING", "order": "HOLDING",
    }

    def _forward_backward(self, tokens: list[str]) -> np.ndarray:
        """Baum-Welch E-step → γ[state, t] = P(state at t | full sequence)."""
        n, k = len(tokens), len(self.STATES)
        log_a = np.full((k, n), -np.inf)
        for i, s in enumerate(self.STATES):
            log_a[i, 0] = np.log(self._emit(s, tokens[0]) + 1e-10)
        for t in range(1, n):
            for j, to_s in enumerate(self.STATES):
                ep = np.log(self._emit(to_s, tokens[t]) + 1e-10)
                log_a[j, t] = np.logaddexp.reduce(
                    log_a[:, t - 1] + np.array([np.log(self._trans(f, to_s) + 1e-10) for f in self.STATES])
                ) + ep
        log_b = np.zeros((k, n))
        for t in range(n - 2, -1, -1):
            for i, from_s in enumerate(self.STATES):
                log_b[i, t] = np.logaddexp.reduce([
                    np.log(self._trans(from_s, to_s) + 1e-10)
                    + np.log(self._emit(to_s, tokens[t + 1]) + 1e-10)
                    + log_b[j, t + 1]
                    for j, to_s in enumerate(self.STATES)
                ])
        log_gamma = log_a + log_b
        log_gamma -= np.logaddexp.reduce(log_gamma, axis=0, keepdims=True)
        return np.exp(log_gamma)  # (k, n)

    def _blend_counts(self, soft_counts: dict[str, dict[str, float]], lr: float) -> None:
        """Merge soft word→state counts into emission probs (Laplace + linear blend)."""
        for state in self.STATES:
            counts = soft_counts[state]
            if not counts:
                continue
            total = sum(counts.values()) + len(counts)  # add-1 smoothing
            for word, cnt in counts.items():
                prior = self.EMISSIONS[state].get(word, 0.005)
                learned = (cnt + 1) / total
                self.EMISSIONS[state][word] = round((1 - lr) * prior + lr * learned, 5)

    def adapt_from_texts(self, texts: list[str], lr: float = 0.15) -> int:
        """
        Baum-Welch soft EM on unlabeled legal texts.
        Sources: evidence summaries (PostgreSQL), JSONL corpus, chat RAG chunks.
        Only updates emissions — transition matrix stays fixed.
        Returns total tokens processed.
        """
        soft_counts: dict[str, dict[str, float]] = {s: {} for s in self.STATES}
        total_tokens = 0
        for text in texts:
            tokens = self._tokens(text)[:300]
            if len(tokens) < 5:
                continue
            gamma = self._forward_backward(tokens)
            for t, word in enumerate(tokens):
                for i, state in enumerate(self.STATES):
                    soft_counts[state][word] = soft_counts[state].get(word, 0.0) + gamma[i, t]
            total_tokens += len(tokens)
        if total_tokens > 0:
            self._blend_counts(soft_counts, lr)
            log.info(f"[HMM] adapt_from_texts: {len(texts)} texts, {total_tokens} tokens")
        return total_tokens

    def adapt_from_qdrant_hits(self, hits: list[dict], lr: float = 0.20) -> int:
        """
        Supervised adaptation from Qdrant hits with 'tags' payloads.
        Sources: legal_documents, evidence_items, statute_chunks — any collection
        whose chunks carry tags that map to known legal section states.
        """
        supervised: dict[str, dict[str, float]] = {s: {} for s in self.STATES}
        n_adapted = 0
        for hit in hits:
            tags: list[str] = hit.get("tags", []) or []
            mapped: set[str] = set()
            for tag in tags:
                state = self._TAG_STATE.get(tag.lower().replace(" ", "_")) \
                     or self._TAG_STATE.get(tag.lower())
                if state:
                    mapped.add(state)
            if not mapped:
                continue
            tokens = self._tokens(hit.get("text", ""))[:200]
            w = 1.0 / len(mapped)
            for state in mapped:
                for word in tokens:
                    supervised[state][word] = supervised[state].get(word, 0.0) + w
            n_adapted += 1
        if n_adapted:
            self._blend_counts(supervised, lr)
            log.info(f"[HMM] adapt_from_qdrant_hits: {n_adapted}/{len(hits)} hits tagged")
        return n_adapted

    def to_redis_payload(self) -> str:
        return json.dumps({"v": 1, "emissions": self.EMISSIONS})

    def load_redis_payload(self, raw: str) -> bool:
        try:
            data = json.loads(raw)
            if data.get("v") == 1 and "emissions" in data:
                self.EMISSIONS = data["emissions"]
                log.info("[HMM] Loaded adapted emissions from Redis")
                return True
        except Exception as exc:
            log.debug(f"[HMM] Redis load error: {exc}")
        return False

    def tag_chunk(self, text: str) -> dict:
        """Return primary_state + state_probabilities for a single text chunk."""
        tokens = self._tokens(text)
        if not tokens:
            return {"primary_state": "FACTS", "state_probabilities": {}, "hmm_confidence": 0.0}
        seq, prob = self.viterbi(tokens[:200])
        dist = Counter(seq)
        total = sum(dist.values())
        probs = {s: round(dist[s] / total, 3) for s in dist}
        primary = max(probs, key=probs.get)
        return {"primary_state": primary, "state_probabilities": probs, "hmm_confidence": round(prob, 4)}


_hmm = LegalHMM()  # module-level singleton — numpy, no GPU, safe to share
_HMM_REDIS_KEY = "hmm:emissions:v1"
_HMM_REDIS_TTL = 7 * 86_400  # 7 days

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

def build_citations(rag_hits: list[dict]) -> list[dict]:
    """
    Build structured citation list from tagged RAG hits.
    Saved with synthesis_runs for QLoRA context and provenance tracking.
    """
    return [
        {
            "index": i + 1,
            "id":      h.get("id", ""),
            "title":   h.get("title", ""),
            "source":  h.get("source", ""),
            "score":   round(float(h.get("score", 0)), 4),
            "section": h.get("primary_state", ""),   # HMM label, e.g. "FACTS"
            "text":    h.get("text", "")[:300],       # snippet for QLoRA input context
        }
        for i, h in enumerate(rag_hits[:8])
    ]

# ═══════════════════════════════════════════════════════════════════════════════
# Neo4j KAG expansion
# ═══════════════════════════════════════════════════════════════════════════════

async def kag_neighbors(doc_ids: list[str], limit: int = 8) -> tuple[list[dict], str]:
    """
    Returns (neighbors, kag_source) where kag_source is one of:
      'redis_prewarm'  — served from Colab-prewarmed Redis key (24h TTL)
      'neo4j_live'     — live Neo4j traversal, result written back to Redis
      'none'           — no neighbors found (Neo4j unavailable or empty result)
    """
    if not doc_ids:
        return [], "none"

    # Normalise IDs: deduplicate + sort so key is stable regardless of call order
    norm = "|".join(sorted(set(doc_ids)))
    _kag_cache_key = f"{REDIS_KAG_PREFIX}{hashlib.md5(norm.encode()).hexdigest()[:12]}"

    # ── L0: Redis pre-warm cache (written by Colab Cell 11 or previous live query) ─
    try:
        _redis = await get_redis()
        _raw = await _redis.get(_kag_cache_key)
        if _raw:
            cached_data = json.loads(_raw)
            # Support versioned payload { "v": 1, "neighbors": [...], "source": "..." }
            # and legacy plain list written by older versions of this code
            if isinstance(cached_data, dict) and cached_data.get("v") == 1:
                neighbors = cached_data.get("neighbors", [])
                cache_source = cached_data.get("source", "redis_prewarm")
            else:
                neighbors = cached_data  # legacy list format
                cache_source = "redis_prewarm"
            log.info(f"[kag] Redis hit  source={cache_source}  key=...{_kag_cache_key[-8:]}  ids={len(doc_ids)}")
            return neighbors, cache_source
    except Exception as _exc:
        log.debug(f"[kag] Redis lookup error (non-fatal): {_exc}")

    # ── L1: Live Neo4j query ──────────────────────────────────────────────────
    neighbors = []
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
        neighbors = [{"id": r[0], "path": r[1], "summary": r[2] or ""} for r in records]
    except Exception as exc:
        log.debug(f"[kag] Neo4j unavailable: {exc}")

    # Write back to Redis with versioned payload
    if neighbors:
        try:
            _redis = await get_redis()
            payload = {"v": 1, "neighbors": neighbors, "source": "neo4j_live"}
            await _redis.set(_kag_cache_key, json.dumps(payload), ex=REDIS_KAG_TTL)
            log.debug(f"[kag] Redis write  key=...{_kag_cache_key[-8:]}  neighbors={len(neighbors)}")
        except Exception:
            pass

    source = "neo4j_live" if neighbors else "none"
    return neighbors, source

# ═══════════════════════════════════════════════════════════════════════════════
# LangGraph state
# ═══════════════════════════════════════════════════════════════════════════════

class SynthesisState(TypedDict):
    query: str
    case_id: str | None
    entities: dict
    web_results: list[dict]
    rg_results: list[dict]
    rag_hits: list[dict]          # each hit gains 'primary_state' after tag_chunks node
    kag_neighbors: list[dict]
    kag_source: str               # "redis_prewarm" | "neo4j_live" | "none"
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
    neighbors, kag_source = await kag_neighbors([h["id"] for h in state["rag_hits"][:5]])
    return {"kag_neighbors": neighbors, "kag_source": kag_source}

async def node_tag_chunks(state: SynthesisState) -> dict:
    """
    Annotate each RAG hit with its legal section type via HMM Viterbi.
    Adds 'primary_state' and 'hmm_confidence' to each hit dict.
    Pure numpy — runs in <1ms per chunk, no GPU needed.
    """
    tagged = []
    for hit in state["rag_hits"]:
        tag = _hmm.tag_chunk(hit.get("text", ""))
        tagged.append({**hit, **tag})
    return {"rag_hits": tagged}

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

    # RAG chunks  (highest priority — section type from HMM tagger)
    if state["rag_hits"]:
        parts.append("## Retrieved Legal Context (RAG)")
        for i, h in enumerate(state["rag_hits"][:6], 1):
            section = h.get("primary_state", "")
            section_tag = f" [{section}]" if section else ""
            parts.append(f"[{i}] {h['title']} ({h['source']}, score={h['score']:.2f}{section_tag})\n{h['text']}")

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

def _build_graph(lg_cache: Any | None = None) -> Any:
    """
    Build and compile the LangGraph synthesis DAG.

    lg_cache: optional langgraph.cache.redis.RedisCache instance.
      - Passed to g.compile(cache=lg_cache) so LangGraph caches node outputs
        by their input-state hash (5-min TTL on retrieve_kag).
      - Falls back to no-cache if None (Redis unavailable at startup).
    """
    # Per-node cache policy for the Neo4j KAG expansion (most expensive non-LLM step)
    _kag_policy: Any = None
    try:
        from langgraph.cache.base import CachePolicy  # langgraph ≥ 1.0
        _kag_policy = CachePolicy(ttl=300)  # 5-min node-output cache
    except ImportError:
        pass  # older langgraph — skip per-node policy

    g = StateGraph(SynthesisState)
    g.add_node("web_search",    node_web_search)
    g.add_node("rg_search",     node_rg_search)
    g.add_node("retrieve_rag",  node_retrieve_rag)
    g.add_node(
        "retrieve_kag", node_retrieve_kag,
        **({"cache_policy": _kag_policy} if _kag_policy is not None else {}),
    )
    g.add_node("tag_chunks",    node_tag_chunks)  # HMM legal section tagger
    g.add_node("assemble_ace",  node_assemble_ace)
    g.add_node("merge",         node_merge)
    g.add_node("synthesize",    node_synthesize)
    g.add_node("self_eval",     node_self_eval)

    # Parallel retrieval fan-out from entry
    # retrieve_rag → (retrieve_kag, web_search, rg_search) in parallel
    # retrieve_kag → tag_chunks → assemble_ace  (sequential: need RAG hits tagged first)
    # web_search, rg_search → assemble_ace directly
    g.set_entry_point("retrieve_rag")
    g.add_edge("retrieve_rag",  "retrieve_kag")
    g.add_edge("retrieve_rag",  "web_search")
    g.add_edge("retrieve_rag",  "rg_search")
    g.add_edge("retrieve_kag",  "tag_chunks")
    g.add_edge("tag_chunks",    "assemble_ace")
    g.add_edge("web_search",    "assemble_ace")
    g.add_edge("rg_search",     "assemble_ace")
    g.add_edge("assemble_ace",  "merge")
    g.add_edge("merge",         "synthesize")
    g.add_edge("synthesize",    "self_eval")
    g.add_conditional_edges("self_eval", _should_retry, {"retry": "synthesize", "done": END})

    compile_kwargs: dict = {}
    if lg_cache is not None:
        compile_kwargs["cache"] = lg_cache
    return g.compile(**compile_kwargs)


# ── Lazy graph singleton — wired with RedisCache in startup handler ───────────

_graph: Any | None = None


async def _hmm_adapt_startup() -> None:
    """
    Seed HMM emission probabilities at startup from three sources (priority order):

    1. Redis cache (hmm:emissions:v1) — fastest path, persisted from last run
    2. Qdrant legal_documents / statute_chunks — tagged chunks → supervised adapt
    3. PostgreSQL evidence summaries — unlabeled text → Baum-Welch soft EM

    Writes learned emissions back to Redis (7-day TTL) so the next restart is instant.
    Non-fatal: any failure falls back to hardcoded prior without breaking startup.
    """
    try:
        # ── 1. Try Redis cache ────────────────────────────────────────────────
        redis = await get_redis()
        cached_raw = await redis.get(_HMM_REDIS_KEY)
        if cached_raw and _hmm.load_redis_payload(cached_raw):
            return  # fast path — already adapted

        # ── 2. Qdrant tagged chunks (statute_chunks + legal_documents) ────────
        qdrant_hits: list[dict] = []
        try:
            qdrant = await get_qdrant()
            for collection in ("legal_documents", "statute_chunks", "evidence_items"):
                try:
                    # Scroll up to 200 points per collection
                    results, _ = await qdrant.scroll(
                        collection_name=collection,
                        limit=200,
                        with_payload=True,
                    )
                    for pt in results:
                        p = pt.payload or {}
                        text = p.get("chunk_text") or p.get("text") or p.get("summary") or ""
                        tags = p.get("tags") or []
                        if text and tags:
                            qdrant_hits.append({"text": text, "tags": tags})
                except Exception:
                    pass
            adapted = _hmm.adapt_from_qdrant_hits(qdrant_hits, lr=0.20)
            log.info(f"[HMM startup] Qdrant adapt: {adapted} hits from {len(qdrant_hits)} chunks")
        except Exception as exc:
            log.debug(f"[HMM startup] Qdrant adapt skipped: {exc}")

        # ── 3. PostgreSQL evidence summaries (unlabeled Baum-Welch) ───────────
        try:
            import asyncpg
            pg_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/deeds")
            conn = await asyncpg.connect(pg_url)
            rows = await conn.fetch(
                "SELECT summary FROM evidence WHERE summary IS NOT NULL AND length(summary) > 80 LIMIT 300"
            )
            await conn.close()
            summaries = [r["summary"] for r in rows if r["summary"]]
            if summaries:
                tokens_seen = _hmm.adapt_from_texts(summaries, lr=0.15)
                log.info(f"[HMM startup] Evidence summaries adapt: {len(summaries)} docs, {tokens_seen} tokens")
        except Exception as exc:
            log.debug(f"[HMM startup] PostgreSQL adapt skipped: {exc}")

        # ── Persist adapted emissions to Redis ────────────────────────────────
        try:
            await redis.set(_HMM_REDIS_KEY, _hmm.to_redis_payload(), ex=_HMM_REDIS_TTL)
            log.info(f"[HMM startup] Adapted emissions persisted to Redis (TTL={_HMM_REDIS_TTL}s)")
        except Exception as exc:
            log.debug(f"[HMM startup] Redis persist skipped: {exc}")

    except Exception as exc:
        log.warning(f"[HMM startup] Adaptation failed (non-fatal, using prior): {exc}")


async def _hmm_adapt_from_hits(hits: list[dict]) -> None:
    """
    Background task: supervised-adapt HMM from one synthesis query's RAG hits,
    then persist updated emissions to Redis. Called after every L3 synthesis.
    Non-fatal — errors are logged at DEBUG level only.
    """
    try:
        n = _hmm.adapt_from_qdrant_hits(hits, lr=0.05)  # small lr for incremental updates
        if n > 0:
            redis = await get_redis()
            await redis.set(_HMM_REDIS_KEY, _hmm.to_redis_payload(), ex=_HMM_REDIS_TTL)
            log.debug(f"[HMM bg] adapted {n} hits, emissions persisted")
    except Exception as exc:
        log.debug(f"[HMM bg] non-fatal: {exc}")


@app.on_event("startup")
async def _startup_graph() -> None:
    """
    Build the LangGraph DAG once on startup.
    Wires langgraph.cache.redis.RedisCache if available so node outputs
    (especially retrieve_kag's Neo4j expansion) are cached in Redis.
    Falls back to an uncached graph if LangGraph's Redis cache module is absent.
    Also seeds HMM emission probabilities from Qdrant tags + evidence summaries.
    """
    global _graph
    # Run HMM adaptation in parallel with graph compilation (independent)
    lg_cache: Any | None = None
    try:
        import redis as _sync_redis
        from langgraph.cache.redis import RedisCache
        r_sync = _sync_redis.from_url(REDIS_URL)
        lg_cache = RedisCache(r_sync, prefix="langgraph:cache:")
        log.info("[startup] LangGraph compiled with RedisCache (prefix=langgraph:cache:)")
    except Exception as exc:
        log.warning(f"[startup] LangGraph RedisCache unavailable — compiling without KV cache: {exc}")
    _graph, _ = await asyncio.gather(
        asyncio.to_thread(_build_graph, lg_cache),
        _hmm_adapt_startup(),
    )

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
    graph = _graph
    if graph is None:
        raise HTTPException(status_code=503, detail="Graph initializing — retry in a moment")

    initial: SynthesisState = {
        "query": req.query, "case_id": req.case_id,
        "entities": extract_legal_entities(req.query),
        "web_results": [], "rg_results": [], "rag_hits": [],
        "kag_neighbors": [], "kag_source": "none",
        "ace_context": "", "merged_context": "",
        "llm_response": "", "confidence": 0.0, "retried": False, "trace_id": trace_id,
    }

    try:
        result = await graph.ainvoke(initial)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    answer = result["llm_response"]

    # Write back to L1
    await l1_set(cache_key, answer, LLM_MODEL, "langgraph")

    citations = build_citations(result["rag_hits"])

    # GRPO reward: PyTorch cosine similarity between query and answer embeddings.
    # Provides a scalar reward ∈ [-1, 1] for GRPO fine-tuning of the synthesis model.
    grpo_reward_score: float | None = None
    try:
        import torch.nn.functional as F
        q_emb = await embed_query(req.query)
        a_emb = await embed_query(answer[:512])
        q_t = torch.tensor(q_emb, dtype=torch.float32).unsqueeze(0)
        a_t = torch.tensor(a_emb, dtype=torch.float32).unsqueeze(0)
        grpo_reward_score = float(F.cosine_similarity(q_t, a_t).item())
    except Exception as exc:
        log.debug(f"[grpo] reward compute skipped: {exc}")

    # Background HMM adaptation — fire-and-forget, non-blocking
    asyncio.create_task(_hmm_adapt_from_hits(result["rag_hits"]))

    return {
        "answer": answer,
        "confidence": result["confidence"],
        "grpo_reward_score": grpo_reward_score,
        "cache": "L3-langgraph",
        "rag_hits": len(result["rag_hits"]),
        "kag_neighbors": len(result["kag_neighbors"]),
        "kag_source": result.get("kag_source", "none"),
        "web_results": len(result["web_results"]),
        "rg_results": len(result["rg_results"]),
        "retried": result["retried"],
        "entities": result["entities"],
        "citations": citations,
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
        # Tag chunks inline (pure numpy, <1ms per chunk — safe in streaming path)
        rag_hits = [{**h, **_hmm.tag_chunk(h.get("text", ""))} for h in rag_hits]
        yield f"data: {json.dumps({'stage':'rag','status':'done','hits':len(rag_hits)})}\n\n"

        yield f"data: {json.dumps({'stage':'kag','status':'running'})}\n\n"
        neighbors, kag_source = await kag_neighbors([h["id"] for h in rag_hits[:5]])
        web_results, rg_results = await asyncio.gather(
            web_search(req.query, limit=3),
            asyncio.to_thread(rg_search, req.query, REPO_ROOT, 4),
        )
        yield f"data: {json.dumps({'stage':'kag','status':'done','neighbors':len(neighbors),'kag_source':kag_source,'web':len(web_results),'rg':len(rg_results)})}\n\n"

        # Build ACE context
        ctx_state: SynthesisState = {
            "query": req.query, "case_id": None,
            "entities": extract_legal_entities(req.query),
            "web_results": web_results, "rg_results": rg_results,
            "rag_hits": rag_hits, "kag_neighbors": neighbors, "kag_source": kag_source,
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
        citations = build_citations(rag_hits)
        grpo_reward_score: float | None = None
        try:
            import torch.nn.functional as F
            q_emb = await embed_query(req.query)
            a_emb = await embed_query(full_text[:512])
            q_t = torch.tensor(q_emb, dtype=torch.float32).unsqueeze(0)
            a_t = torch.tensor(a_emb, dtype=torch.float32).unsqueeze(0)
            grpo_reward_score = float(F.cosine_similarity(q_t, a_t).item())
        except Exception:
            pass
        yield f"data: {json.dumps({'stage':'done','confidence':confidence,'trace_id':trace_id,'cache':'L3-langgraph','kag_source':kag_source,'citations':citations,'grpo_reward_score':grpo_reward_score})}\n\n"

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


# ═══════════════════════════════════════════════════════════════════════════════
# HMM management endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/hmm/stats")
async def hmm_stats() -> dict:
    """
    Return current HMM emission state for debugging and QLoRA context audit.
    Shows which words have been up-weighted by corpus adaptation vs. the hard prior.
    """
    top_words: dict[str, list[str]] = {}
    for state in LegalHMM.STATES:
        emissions = _hmm.EMISSIONS.get(state, {})
        # Sort by prob descending, return top-8 words
        ranked = sorted(emissions.items(), key=lambda x: x[1], reverse=True)[:8]
        top_words[state] = [f"{w}={p:.3f}" for w, p in ranked]
    try:
        redis = await get_redis()
        has_redis = bool(await redis.exists(_HMM_REDIS_KEY))
    except Exception:
        has_redis = False
    return {
        "states": LegalHMM.STATES,
        "top_emission_words": top_words,
        "redis_persisted": has_redis,
        "redis_key": _HMM_REDIS_KEY,
    }


@app.post("/hmm/adapt")
async def hmm_adapt_endpoint() -> dict:
    """
    Manual trigger: run full 2-source adaptation (Qdrant + PostgreSQL) and persist.
    Equivalent to a fresh startup adaptation — use after ingesting new documents.
    """
    asyncio.create_task(_hmm_adapt_startup())
    return {"status": "adaptation started in background", "key": _HMM_REDIS_KEY}
