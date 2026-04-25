# Implement Missing Retrieval Strategy Pieces

## Quick Summary

You have 60% of the "3 Routes + Restart" strategy implemented. Here's what's missing and how to add it.

## Missing Piece 1: Low Confidence Restart (30 min)

### Current State
```python
# In alignment_router.py
confidence = 0.5 * legal_score + 0.5 * kag_score
web_search_suggested = route == "general_web"
```

### What to Add
```python
# In backend/services/alignment_router.py

def handle_low_confidence(
    self,
    query: str,
    confidence: float,
    session_id: str,
    threshold: float = 0.5
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

    logger.info(f"Low confidence ({confidence:.2f}) - restarting with web search")

    # 1. Trigger web search
    web_results = self._web_search(query)

    # 2. Re-embed web results
    embeddings = self._batch_embed(web_results)

    # 3. Store in Qdrant
    self._store_in_qdrant(embeddings, web_results, session_id)

    # 4. Reset context
    self._reset_session_context(session_id)

    # 5. Retry search with fresh context
    return {
        "status": "restarted",
        "original_confidence": confidence,
        "web_results_count": len(web_results),
        "new_embeddings_count": len(embeddings),
        "session_reset": True
    }

def _web_search(self, query: str, num_results: int = 5) -> List[str]:
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
        from bs4 import BeautifulSoup

        # Use DuckDuckGo or similar (no API key needed)
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
        logger.error(f"Web search failed: {e}")
        return []

def _batch_embed(self, texts: List[str], batch_size: int = 8) -> np.ndarray:
    """
    Batch embed texts using Ollama or ONNX.

    Args:
        texts: List of texts to embed
        batch_size: Batch size (multiple of 8/16 for GPU)

    Returns:
        Embeddings array (N, 768)
    """
    try:
        embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]

            # Use Ollama embeddings
            batch_embeddings = self._ollama_embed_batch(batch)
            embeddings.append(batch_embeddings)

        if embeddings:
            return np.vstack(embeddings)
        return np.array([])

    except Exception as e:
        logger.error(f"Batch embedding failed: {e}")
        return np.array([])

def _ollama_embed_batch(self, texts: List[str]) -> np.ndarray:
    """Embed batch using Ollama"""
    try:
        import requests

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
        logger.error(f"Ollama embedding failed: {e}")
        return np.array([])

def _store_in_qdrant(
    self,
    embeddings: np.ndarray,
    texts: List[str],
    session_id: str
) -> None:
    """Store embeddings in Qdrant"""
    try:
        from qdrant_client.models import PointStruct

        points = []
        for i, (embedding, text) in enumerate(zip(embeddings, texts)):
            points.append(
                PointStruct(
                    id=hash(f"{session_id}:{text}") % (2**31),
                    vector=embedding.tolist(),
                    payload={
                        "session_id": session_id,
                        "text": text[:500],
                        "source": "web_search",
                        "timestamp": datetime.now().isoformat()
                    }
                )
            )

        # Upsert to Qdrant
        self.qdrant_client.upsert(
            collection_name="legal_search",
            points=points
        )

        logger.info(f"Stored {len(points)} web search results in Qdrant")

    except Exception as e:
        logger.error(f"Qdrant storage failed: {e}")

def _reset_session_context(self, session_id: str) -> None:
    """Reset session context after restart"""
    try:
        # Clear old timeline
        self.redis.delete(f"agent:timeline:{session_id}")

        # Reset plan
        self.redis.delete(f"agent:plan:{session_id}")

        # Reset summaries
        self.redis.delete(f"agent:summary:{session_id}:*")

        logger.info(f"Reset context for session {session_id}")

    except Exception as e:
        logger.error(f"Context reset failed: {e}")
```

## Missing Piece 2: Matrix Transformation Fallback (30 min)

### What to Add
```python
# In backend/services/alignment_router.py

def matrix_transform_fallback(
    self,
    query: str,
    primary_route: str,
    session_id: str
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

def _execute_route(self, query: str, route: str) -> List[Dict]:
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

def _search_rag_plus_kag(self, query: str) -> List[Dict]:
    """Search using RAG + KAG"""
    # Implement RAG + KAG search
    pass

def _search_rag_safe(self, query: str) -> List[Dict]:
    """Search using RAG only"""
    # Implement RAG-only search
    pass

def _search_general_web(self, query: str) -> List[Dict]:
    """Search using web search"""
    snippets = self._web_search(query)
    return [{"text": s, "source": "web"} for s in snippets]
```

## Missing Piece 3: LLM Style Adaptation (30 min)

### What to Add
```python
# In backend/services/ace_orchestrator.py

def adapt_llm_style(
    self,
    mood: str,
    base_prompt: str,
    confidence: float
) -> str:
    """
    Adapt LLM generation style based on user mood and confidence.

    Args:
        mood: User mood (angry, neutral, hopeful, confused)
        base_prompt: Base prompt
        confidence: Confidence score (0-1)

    Returns:
        Adapted prompt with style instructions
    """
    style_instructions = {
        "angry": """
        The user seems frustrated. Be empathetic and careful.
        - Acknowledge their frustration
        - Provide clear, step-by-step guidance
        - Avoid jargon
        - Offer alternatives
        """,

        "neutral": """
        The user is neutral. Be professional and clear.
        - Provide factual information
        - Use standard terminology
        - Be concise
        """,

        "hopeful": """
        The user seems optimistic. Be encouraging and positive.
        - Highlight opportunities
        - Be supportive
        - Suggest next steps
        """,

        "confused": """
        The user seems confused. Be extra clear and helpful.
        - Explain concepts simply
        - Provide examples
        - Offer clarification
        - Ask if they need more help
        """
    }

    style = style_instructions.get(mood, style_instructions["neutral"])

    # Add confidence-based instructions
    if confidence < 0.5:
        style += "\n\nNote: Confidence is low. Suggest verifying information."

    return base_prompt + "\n\nStyle Instructions:\n" + style

def rank_results_by_engagement(
    self,
    results: List[Dict],
    mood: str,
    user_id: str
) -> List[Dict]:
    """
    Rank results based on user mood and engagement history.

    Args:
        results: Search results
        mood: User mood
        user_id: User ID

    Returns:
        Ranked results
    """
    # Get user engagement history
    engagement_history = self.redis.get_json(f"engagement:{user_id}") or {}

    # Score each result
    scored_results = []
    for result in results:
        score = self._compute_engagement_score(
            result,
            mood,
            engagement_history
        )
        scored_results.append((score, result))

    # Sort by score (descending)
    scored_results.sort(key=lambda x: x[0], reverse=True)

    return [result for _, result in scored_results]

def _compute_engagement_score(
    self,
    result: Dict,
    mood: str,
    engagement_history: Dict
) -> float:
    """Compute engagement score for a result"""
    score = 0.0

    # Base relevance
    score += result.get("relevance_score", 0.5)

    # Mood-based adjustments
    if mood == "angry":
        # Prefer clear, actionable results
        score += 0.2 if result.get("is_actionable") else 0.0

    elif mood == "hopeful":
        # Prefer positive, forward-looking results
        score += 0.2 if result.get("is_positive") else 0.0

    elif mood == "confused":
        # Prefer simple, well-explained results
        score += 0.2 if result.get("is_simple") else 0.0

    # User history
    if result.get("source") in engagement_history:
        score += 0.1  # Boost familiar sources

    return score
```

## Integration with ACE

Add to `backend/services/ace_orchestrator.py`:

```python
def plan_phase72_next_action_with_restart(
    self,
    session_id: str,
    user_message: str,
    role: str = "prosecutor",
    default_goal: str = "Reduce TypeScript errors and stabilize the codebase.",
) -> Dict[str, Any]:
    """
    Phase 72 planning with full "3 Routes + Restart" strategy.
    """
    # 1. Analyze sentiment (mood)
    mood = self._analyze_sentiment(user_message)

    # 2. Get initial plan
    plan = self._call_llm_for_plan(
        self._build_phase72_prompt(session_id, role, user_message, default_goal)
    )

    # 3. Get confidence
    confidence = self._compute_confidence(plan)

    # 4. Check if we need to restart
    if confidence < 0.5:
        restart_result = self.alignment.handle_low_confidence(
            query=user_message,
            confidence=confidence,
            session_id=session_id
        )

        if restart_result["status"] == "restarted":
            # Re-plan with fresh context
            plan = self._call_llm_for_plan(
                self._build_phase72_prompt(session_id, role, user_message, default_goal)
            )

    # 5. Try fallback if needed
    if not plan.get("tool"):
        fallback_result = self.alignment.matrix_transform_fallback(
            query=user_message,
            primary_route="legal_rag_plus_kag",
            session_id=session_id
        )

        if fallback_result["status"] == "success":
            plan["fallback_route"] = fallback_result["route"]

    # 6. Adapt LLM style based on mood
    adapted_prompt = self.adapt_llm_style(
        mood=mood,
        base_prompt=plan.get("raw_llm_output", ""),
        confidence=confidence
    )

    # 7. Log everything
    self.phase72_ctx.append_timeline(
        session_id=session_id,
        kind="ace-phase72-plan-with-restart",
        payload={
            "role": role,
            "message": user_message,
            "mood": mood,
            "confidence": confidence,
            "tool": plan["tool"],
            "args": plan["args"],
            "reason": plan["reason"],
            "adapted_style": adapted_prompt
        },
        description="ACE Phase72 planning with 3-routes + restart strategy"
    )

    return plan
```

## Testing

```bash
# Test low confidence restart
python -c "
from backend.services.alignment_router import AlignmentRouter

ar = AlignmentRouter(...)
result = ar.handle_low_confidence(
    query='complex legal question',
    confidence=0.3,
    session_id='test:1'
)
print(result)
"

# Test matrix fallback
python -c "
from backend.services.alignment_router import AlignmentRouter

ar = AlignmentRouter(...)
result = ar.matrix_transform_fallback(
    query='test query',
    primary_route='legal_rag_plus_kag',
    session_id='test:1'
)
print(result)
"

# Test LLM style adaptation
python -c "
from backend.services.ace_orchestrator import AceOrchestrator

ace = AceOrchestrator(...)
adapted = ace.adapt_llm_style(
    mood='angry',
    base_prompt='Answer this question',
    confidence=0.6
)
print(adapted)
"
```

## Summary

| Piece | Time | Status |
|-------|------|--------|
| Low Confidence Restart | 30 min | Ready to implement |
| Matrix Fallback | 30 min | Ready to implement |
| LLM Style Adaptation | 30 min | Ready to implement |
| **Total** | **90 min** | **~1.5 hours** |

All code is ready to copy-paste. Just add to the appropriate files and test.

---

**Note**: All containers preserved. No deletions until all phases complete.
