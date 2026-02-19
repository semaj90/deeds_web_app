"""
Agentic Alignment Router for Legal Search System.

Reads user signals (negativity, legal relevance, on-task-ness), consults KAG (Neo4j),
and intelligently routes searches to optimal backends (RAG-only, RAG+KAG, general web).

Maintains per-user alignment metrics in Redis and learns "angry words" from chat history.
"""

from __future__ import annotations

import math
import re
import time
from typing import Any, Dict, Optional, Set

from neo4j import GraphDatabase


# Seed lexicons (immutable base)
SEED_NEGATIVE_KEYWORDS: Set[str] = {
    "stupid",
    "useless",
    "angry",
    "hate",
    "wtf",
    "trash",
    "garbage",
    "broken",
    "buggy",
    "annoying",
    "fuck",
    "fucking",
    "shit",
}

SEED_LEGAL_KEYWORDS: Set[str] = {
    "supremacy clause",
    "preemption",
    "intergovernmental immunity",
    "statute",
    "usc",
    "u.s.c.",
    "code",
    "regulation",
    "bill",
    "complaint",
    "indictment",
    "pleading",
    "jurisdiction",
    "detention",
    "ab 32",
    "constitutional",
    "federal",
    "state",
    "4th amendment",
    "fifth amendment",
    "due process",
    "eighth amendment",
}


class AlignmentRouter:
    """
    Agentic alignment + routing brain.

    - Scores negativity (base lexicon + per-user learned tokens).
    - Scores legal-ness + KAG alignment.
    - Chooses a route (legal_rag_plus_kag, legal_rag_safe, general_web).
    - Logs per-user metrics to Redis (avg latency, avg negativity).
    - Learns new "angry" tokens from chat via Granite sentiment (optional).
    """

    def __init__(
        self,
        redis_cache: Any,
        neo4j_uri: str,
        neo4j_user: str,
        neo4j_password: str,
        granite_client: Optional[Any] = None,
    ) -> None:
        self.redis = redis_cache
        self.neo_driver = GraphDatabase.driver(
            neo4j_uri,
            auth=(neo4j_user, neo4j_password),
        )
        self.granite = granite_client

    # ---------- helpers: redis JSON ----------

    def _redis_get_json(self, key: str) -> Optional[Dict[str, Any]]:
        """Safely get JSON from Redis."""
        try:
            return self.redis.get_json(key)
        except Exception:
            return None

    def _redis_set_json(self, key: str, value: Dict[str, Any], ttl: int) -> None:
        """Safely set JSON in Redis."""
        try:
            self.redis.set_json(key, value, ttl=ttl)
        except Exception:
            pass

    # ---------- negativity & legal scores ----------

    def _load_user_neg_lexicon(self, user_id: Optional[str]) -> Set[str]:
        """Load user-specific negative lexicon from Redis."""
        if not user_id:
            return set()
        key = f"neg-lexicon:user:{user_id}"
        data = self._redis_get_json(key) or {}
        return set(data.get("tokens", []))

    def _negativity_score(self, text: str, user_id: Optional[str]) -> float:
        """
        Compute negativity score (0.0-1.0) using seed + user lexicons.

        Counts occurrences of negative keywords and applies log-scaling.
        """
        t = text.lower()
        if not t.strip():
            return 0.0

        user_tokens = self._load_user_neg_lexicon(user_id)
        lexicon = SEED_NEGATIVE_KEYWORDS.union(user_tokens)

        hits = sum(1 for w in lexicon if w in t)
        return min(1.0, hits / 4.0)

    def _legal_score(self, text: str) -> float:
        """
        Compute legal relevance score (0.0-1.0) from keyword matching.

        Counts occurrences of legal keywords and normalizes to [0, 1].
        """
        t = text.lower()
        hits = sum(1 for w in SEED_LEGAL_KEYWORDS if w in t)
        return min(1.0, hits / 4.0)

    # ---------- KAG alignment ----------

    def _kag_match_score(self, text: str) -> float:
        """
        Query Neo4j for node name/cite matches; return alignment score.

        Tokenizes query and searches for matching nodes in the legal graph.
        """
        tokens = [tok for tok in re.split(r"\W+", text.lower()) if tok]
        tokens = tokens[:8]  # cheap heuristic

        if not tokens:
            return 0.0

        query_fragment = " ".join(tokens)

        try:
            with self.neo_driver.session() as session:
                result = session.run(
                    """
                    MATCH (e)
                    WHERE toLower(e.name) CONTAINS $q
                       OR coalesce(toLower(e.cite), '') CONTAINS $q
                    RETURN count(e) AS c
                    """,
                    q=query_fragment,
                )
                c = result.single()["c"] or 0
        except Exception:
            c = 0

        return 1.0 - math.exp(-c / 3.0)

    # ---------- intent + route ----------

    def _intent_label(self, legal_score: float, kag_score: float) -> str:
        """
        Classify intent: legal_rag or general.

        If legal_score > 0.4 or kag_score > 0.3, classify as legal_rag.
        """
        if legal_score > 0.4 or kag_score > 0.3:
            return "legal_rag"
        return "general"

    def _route_decision(self, intent: str, negativity: float) -> str:
        """
        Map intent + negativity to route.

        - legal_rag + low negativity  -> legal_rag_plus_kag
        - legal_rag + high negativity -> legal_rag_safe
        - general                     -> general_web
        """
        if intent == "legal_rag":
            if negativity > 0.6:
                return "legal_rag_safe"
            return "legal_rag_plus_kag"
        return "general_web"

    # ---------- user metrics (alignment memory) ----------

    def _update_user_metrics(
        self, user_id: str, latency_ms: float, negativity: float
    ) -> None:
        """
        Update rolling averages in Redis.

        Maintains search_count, avg_latency_ms, avg_negativity per user.
        """
        if not user_id:
            return

        key = f"user-metrics:{user_id}"
        existing = self._redis_get_json(key) or {
            "search_count": 0,
            "avg_latency_ms": 0.0,
            "avg_negativity": 0.0,
        }

        count = existing["search_count"] + 1
        avg_latency = (
            existing["avg_latency_ms"] * existing["search_count"] + latency_ms
        ) / count
        avg_neg = (
            existing["avg_negativity"] * existing["search_count"] + negativity
        ) / count

        existing.update(
            {
                "search_count": count,
                "avg_latency_ms": avg_latency,
                "avg_negativity": avg_neg,
            }
        )

        self._redis_set_json(key, existing, ttl=7 * 24 * 3600)

    def get_user_metrics(self, user_id: str) -> Dict[str, Any]:
        """Retrieve user metrics from Redis."""
        if not user_id:
            return {}
        return self._redis_get_json(f"user-metrics:{user_id}") or {}

    # ---------- public: plan for /api/search ----------

    def plan(
        self,
        user_id: Optional[str],
        query: str,
        latency_ms: float,
    ) -> Dict[str, Any]:
        """
        Main entry point: extract signals, classify intent, decide route.

        Returns AlignmentSignals dict with all computed values.
        """
        neg = self._negativity_score(query, user_id)
        legal_score = self._legal_score(query)
        kag_score = self._kag_match_score(query)

        intent = self._intent_label(legal_score, kag_score)
        route = self._route_decision(intent, neg)
        web_search_suggested = route == "general_web"

        on_task = 0.5 * legal_score + 0.5 * kag_score

        if user_id:
            self._update_user_metrics(user_id, latency_ms, neg)

        return {
            "user_id": user_id,
            "latency_ms": latency_ms,
            "query_length": len(query),
            "negativity_score": neg,
            "on_task_score": on_task,
            "intent": intent,
            "route_decision": route,
            "web_search_suggested": web_search_suggested,
        }

    # ---------- optional: learn from chat ----------

    def learn_from_chat(self, user_id: Optional[str], message: str) -> None:
        """
        Called by chat pipeline to learn user's "angry words".

        Uses Granite (if configured) to classify sentiment and extract negative tokens,
        then updates per-user negative lexicon in Redis.
        """
        if not user_id or not message.strip():
            return

        tokens: Set[str] = set()

        if self.granite is not None:
            try:
                analysis = self.granite.analyze_sentiment(message)
                # expected shape: {"sentiment": "negative"/"neutral"/"positive",
                #                  "negative_tokens": ["...", "..."]}
                if analysis.get("sentiment") == "negative":
                    tokens.update(
                        t.lower() for t in analysis.get("negative_tokens", [])
                    )
            except Exception:
                # fail-soft, fall back to heuristics
                pass

        # crude fallback if Granite not configured or fails
        if not tokens:
            for w in SEED_NEGATIVE_KEYWORDS:
                if w in message.lower():
                    tokens.add(w)

        if not tokens:
            return

        key = f"neg-lexicon:user:{user_id}"
        existing = self._redis_get_json(key) or {"tokens": []}
        merged = set(existing.get("tokens", [])) | tokens
        self._redis_set_json(
            key, {"tokens": sorted(list(merged))}, ttl=30 * 24 * 3600
        )

    # ---------- NEW: Low Confidence Restart ----------

    def handle_low_confidence(
        self,
        query: str,
        confidence: float,
        session_id: str,
        threshold: float = 0.5,
    ) -> Dict[str, Any]:
        """
        If confidence is low, restart with web search + re-embed.

        Args:
            query: Original query
            confidence: Current confidence score (0-1)
            session_id: Session ID for context reset
            threshold: Confidence threshold (default 0.5)

        Returns:
            Dict with restart results
        """
        if confidence >= threshold:
            return {"status": "confident", "confidence": confidence}

        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Low confidence ({confidence:.2f}) - restarting with web search")

        # 1. Trigger web search
        web_results = self._web_search(query)

        # 2. Re-embed web results
        embeddings = self._batch_embed(web_results)

        # 3. Store in Qdrant
        self._store_in_qdrant(embeddings, web_results, session_id)

        # 4. Reset context
        self._reset_session_context(session_id)

        # 5. Return restart status
        return {
            "status": "restarted",
            "original_confidence": confidence,
            "web_results_count": len(web_results),
            "new_embeddings_count": len(embeddings),
            "session_reset": True
        }

    def _web_search(self, query: str, num_results: int = 5) -> list:
        """
        Perform web search and return snippets.

        Args:
            query: Search query
            num_results: Number of results to return

        Returns:
            List of search result snippets
        """
        try:
            import requests
            import logging
            logger = logging.getLogger(__name__)

            # Use DuckDuckGo (no API key needed)
            url = f"https://duckduckgo.com/search?q={query}&format=json"
            response = requests.get(url, timeout=5)
            data = response.json()

            snippets = []
            for result in data.get("Results", [])[:num_results]:
                snippet = result.get("Text", "")
                if snippet:
                    snippets.append(snippet)

            logger.info(f"Web search returned {len(snippets)} results")
            return snippets

        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Web search failed: {e}")
            return []

    def _batch_embed(self, texts: list, batch_size: int = 8) -> list:
        """
        Batch embed texts using Ollama.

        Args:
            texts: List of texts to embed
            batch_size: Batch size (multiple of 8/16 for GPU)

        Returns:
            Embeddings array (N, 768)
        """
        try:
            import numpy as np
            embeddings = []

            for i in range(0, len(texts), batch_size):
                batch = texts[i:i+batch_size]

                # Use Ollama embeddings
                batch_embeddings = self._ollama_embed_batch(batch)
                if len(batch_embeddings) > 0:
                    embeddings.append(batch_embeddings)

            if embeddings:
                return np.vstack(embeddings)
            return np.array([])

        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Batch embedding failed: {e}")
            return np.array([])

    def _ollama_embed_batch(self, texts: list) -> list:
        """Embed batch using Ollama"""
        try:
            import requests
            import numpy as np

            response = requests.post(
                "http://localhost:11434/api/embeddings",
                json={
                    "model": "embeddinggemma:latest",
                    "input": texts
                },
                timeout=30
            )

            data = response.json()
            embeddings = data.get("embeddings", [])
            return np.array(embeddings, dtype=np.float32)

        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Ollama embedding failed: {e}")
            return np.array([])

    def _store_in_qdrant(
        self,
        embeddings: list,
        texts: list,
        session_id: str
    ) -> None:
        """Store embeddings in Qdrant"""
        try:
            from datetime import datetime
            import logging
            logger = logging.getLogger(__name__)

            # Try to import qdrant client
            try:
                from qdrant_client.models import PointStruct
                qdrant_available = True
            except ImportError:
                qdrant_available = False
                logger.warning("Qdrant client not available")
                return

            if not qdrant_available or len(embeddings) == 0:
                return

            points = []
            for i, (embedding, text) in enumerate(zip(embeddings, texts)):
                points.append(
                    PointStruct(
                        id=hash(f"{session_id}:{text}") % (2**31),
                        vector=embedding.tolist() if hasattr(embedding, 'tolist') else embedding,
                        payload={
                            "session_id": session_id,
                            "text": text[:500],
                            "source": "web_search",
                            "timestamp": datetime.now().isoformat()
                        }
                    )
                )

            # Upsert to Qdrant (if client available)
            if hasattr(self, 'qdrant_client') and self.qdrant_client:
                self.qdrant_client.upsert(
                    collection_name="legal_search",
                    points=points
                )

            logger.info(f"Stored {len(points)} web search results")

        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Qdrant storage failed: {e}")

    def _reset_session_context(self, session_id: str) -> None:
        """Reset session context after restart"""
        try:
            import logging
            logger = logging.getLogger(__name__)

            # Clear old timeline
            self.redis.delete(f"agent:timeline:{session_id}")

            # Reset plan
            self.redis.delete(f"agent:plan:{session_id}")

            # Reset summaries
            self.redis.delete(f"agent:summary:{session_id}:*")

            logger.info(f"Reset context for session {session_id}")

        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Context reset failed: {e}")

    # ---------- NEW: Matrix Transformation Fallback ----------

    def matrix_transform_fallback(
        self,
        query: str,
        primary_route: str,
        session_id: str,
    ) -> Dict[str, Any]:
        """
        If primary route fails, try alternatives in order.

        Fallback chain:
        1. legal_rag_plus_kag → legal_rag_safe → general_web
        2. legal_rag_safe → general_web
        3. general_web → web_search + re-embed

        Args:
            query: Search query
            primary_route: Primary route to try first
            session_id: Session ID

        Returns:
            Dict with results from successful route
        """
        import logging
        logger = logging.getLogger(__name__)

        fallback_chain = {
            "legal_rag_plus_kag": ["legal_rag_safe", "general_web"],
            "legal_rag_safe": ["general_web"],
            "general_web": ["web_search_with_reembed"]
        }

        routes_to_try = [primary_route] + fallback_chain.get(primary_route, [])

        for route in routes_to_try:
            try:
                logger.info(f"Trying route: {route}")

                if route == "web_search_with_reembed":
                    # Last resort: web search + re-embed
                    return self.handle_low_confidence(
                        query=query,
                        confidence=0.0,
                        session_id=session_id,
                        threshold=1.0  # Force restart
                    )
                else:
                    # Try normal route
                    results = self._execute_route(query, route)

                    if results and len(results) > 0:
                        logger.info(f"Success with route: {route}")
                        return {
                            "status": "success",
                            "route": route,
                            "results": results,
                            "fallback_used": route != primary_route
                        }

            except Exception as e:
                logger.warning(f"Route {route} failed: {e}")
                continue

        # All routes failed
        logger.error(f"All routes failed for query: {query}")
        return {
            "status": "failed",
            "error": "All routes exhausted",
            "query": query
        }

    def _execute_route(self, query: str, route: str) -> list:
        """Execute a specific route"""
        if route == "legal_rag_plus_kag":
            # RAG + KAG
            return self._search_rag_plus_kag(query)

        elif route == "legal_rag_safe":
            # RAG only
            return self._search_rag_safe(query)

        elif route == "general_web":
            # Web search
            return self._search_general_web(query)

        else:
            raise ValueError(f"Unknown route: {route}")

    def _search_rag_plus_kag(self, query: str) -> list:
        """Search using RAG + KAG"""
        # Placeholder - implement with actual RAG + KAG search
        return []

    def _search_rag_safe(self, query: str) -> list:
        """Search using RAG only"""
        # Placeholder - implement with actual RAG-only search
        return []

    def _search_general_web(self, query: str) -> list:
        """Search using web search"""
        snippets = self._web_search(query)
        return [{"text": s, "source": "web"} for s in snippets]
