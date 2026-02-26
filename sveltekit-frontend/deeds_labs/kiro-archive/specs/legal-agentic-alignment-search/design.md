# Legal Agentic Alignment + Search Router - Design Document

## Overview

The Legal Agentic Alignment + Search Router extends the Legal Search System with an intelligent routing layer that:

1. **Extracts user signals** from queries (negativity, legal relevance, on-task-ness)
2. **Consults the KAG** (Neo4j legal graph) to assess query alignment
3. **Routes intelligently** to optimal backends (RAG-only, RAG+KAG, general web)
4. **Maintains user metrics** in Redis for personalization
5. **Learns "angry words"** from user chat history via Granite sentiment analysis
6. **Updates 4D topology** based on usage heat and alignment signals
7. **Generates reasoning** via Granite for legal context
8. **Provides alignment signals** to the frontend for transparency

This creates a seamless agentic experience: ingest → search → reasoning → topology → UX.

### Key Design Principles

1. **Signal-Driven Routing**: Use extracted signals (negativity, legal_score, kag_match) to decide route.
2. **Dynamic Learning**: Grow "angry words" lexicon from user chats; personalize per-user.
3. **Fail-Soft Degradation**: If any component fails, continue with reduced functionality.
4. **User Personalization**: Track per-user metrics in Redis; adjust routing based on patterns.
5. **Topology Feedback**: Update 4D manifold heat based on usage + alignment signals.
6. **Transparency**: Return alignment signals so frontend can explain routing decisions.
7. **Performance**: Target < 500ms p95 latency; use caching and fast-path logic.

## Architecture

### High-Level Data Flow

```
User Query
    ↓
/api/search (FastAPI endpoint)
    ↓
1. Embed query (Ollama + embeddinggemma, Redis L1 cache)
    ↓
2. Extract signals (negativity [seed + learned], legal_score, latency)
    ↓
3. Query KAG (Neo4j) for alignment score
    ↓
4. Classify intent (legal_rag vs general)
    ↓
5. Decide route (legal_rag_plus_kag, legal_rag_safe, general_web)
    ↓
6. Update user metrics (Redis)
    ↓
7. Query Qdrant (semantic search)
    ↓
8. Optionally enrich with KAG context (Neo4j neighborhood)
    ↓
9. Optionally generate reasoning (Granite)
    ↓
10. Update manifold usage heat (Redis: manifold-usage:{case_id}:{chunk_index})
    ↓
11. Return SearchResponse (chunks + alignment signals)
    ↓
SvelteKit Frontend (render results + show alignment info)
    ↓
CH-ROM97 Builder (reads heat from Redis, adjusts 4D topology)
```

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend                        │
│  - Display search results + alignment signals               │
│  - Show route_decision (legal_rag_plus_kag, etc.)           │
│  - Display on_task_score as confidence indicator            │
│  - Suggest web search if route=general_web                  │
│  - Render Memory Palace with heat-colored tiles             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
        ┌────────────────────────────┐
        │   /api/search Endpoint     │
        │  (FastAPI + AlignmentRouter)
        └────────────────────────────┘
                     │
        ┌────────────┼────────────┬────────────┐
        ↓            ↓            ↓            ↓
    ┌────────┐  ┌──────────┐  ┌────────┐  ┌────────┐
    │ Ollama │  │ Qdrant   │  │ Neo4j  │  │ Redis  │
    │(Embed) │  │(Search)  │  │(KAG)   │  │(Metrics)
    └────────┘  └──────────┘  └────────┘  │(Heat)  │
        ↑            ↑            ↑        │(Lexicon)
        └────────────┼────────────┘        └────────┘
                     │
        ┌────────────┴────────────┐
        ↓                         ↓
    ┌──────────┐          ┌──────────────┐
    │ Granite  │          │ PostgreSQL   │
    │(Reasoning)          │(Metadata)    │
    │(Sentiment)          │              │
    └──────────┘          └──────────────┘
        ↑
        │
    ┌───────────────────────────────────┐
    │  Chat Backend                     │
    │  (calls learn_from_chat)          │
    └───────────────────────────────────┘
        ↓
    ┌───────────────────────────────────┐
    │  CH-ROM97 Builder                 │
    │  (reads manifold-usage from Redis)│
    │  (adjusts 4D topology by heat)    │
    └───────────────────────────────────┘
```

## Components and Interfaces

### 1. AlignmentRouter Class (with Dynamic Lexicon Learning)

```python
# Seed lexicons (immutable)
SEED_NEGATIVE_KEYWORDS: Set[str] = {
    "stupid", "useless", "angry", "hate", "wtf", "trash", "garbage"
}

SEED_LEGAL_KEYWORDS: Set[str] = {
    "supremacy clause", "preemption", "intergovernmental immunity",
    "statute", "usc", "u.s.c.", "code", "regulation", "bill",
    "complaint", "indictment", "pleading", "jurisdiction",
    "detention", "ab 32", "constitutional", "federal", "state"
}

class AlignmentRouter:
    """Agentic router that:
    - Extracts user signals (negativity [seed + learned], legal_score, kag_match)
    - Classifies intent (legal_rag vs general)
    - Decides route (legal_rag_plus_kag, legal_rag_safe, general_web)
    - Tracks per-user metrics in Redis
    - Learns "angry words" from user chat via Granite sentiment analysis
    """

    def __init__(self, redis_cache: RedisCache, neo4j_uri: str, neo4j_user: str,
                 neo4j_password: str, granite_client: Optional[GraniteClient] = None):
        self.redis = redis_cache
        self.neo_driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
        self.granite = granite_client
        # In-memory cache of lexicons (refreshed every 30 seconds)
        self._lexicon_cache_ts = 0.0
        self._lexicon_cache_ttl = 30.0
        self._global_negative: Set[str] = set()
        self._global_legal: Set[str] = set()

    # Lexicon management
    def _refresh_global_lexicons(self):
        """Pull global lexicons from Redis every _lexicon_cache_ttl seconds."""
        now = time.time()
        if now - self._lexicon_cache_ts < self._lexicon_cache_ttl:
            return

        global_neg = self.redis.get_json("neg-lexicon:global") or []
        self._global_negative = set(global_neg)

        global_legal = self.redis.get_json("legal-lexicon:global") or []
        self._global_legal = set(global_legal)

        self._lexicon_cache_ts = now

    def _user_negative_lexicon(self, user_id: Optional[str]) -> Set[str]:
        """Get user-specific negative lexicon from Redis."""
        if not user_id:
            return set()
        data = self.redis.get_json(f"neg-lexicon:user:{user_id}") or []
        return set(data)

    # Feature extraction methods
    def _negativity_score(self, text: str, user_id: Optional[str]) -> float:
        """Compute negativity score (0.0-1.0) using seed + global + user lexicons."""
        self._refresh_global_lexicons()
        t = text.lower()
        if not t.strip():
            return 0.0

        # Union of seed + global + user-specific words
        dyn_neg = SEED_NEGATIVE_KEYWORDS | self._global_negative | self._user_negative_lexicon(user_id)
        hits = sum(1 for w in dyn_neg if w in t)
        return min(1.0, hits / 3.0)  # log-scaling

    def _legal_score(self, text: str) -> float:
        """Compute legal relevance score (0.0-1.0) from keyword matching."""
        self._refresh_global_lexicons()
        t = text.lower()
        dyn_legal = SEED_LEGAL_KEYWORDS | self._global_legal
        hits = sum(1 for w in dyn_legal if w in t)
        return min(1.0, hits / 4.0)

    def _kag_match_score(self, text: str) -> float:
        """Query Neo4j for node name/cite matches; return alignment score."""
        tokens = [tok for tok in re.split(r"\W+", text.lower()) if tok]
        tokens = tokens[:8]

        if not tokens:
            return 0.0

        query_fragment = " ".join(tokens)
        with self.neo_driver.session() as session:
            result = session.run("""
                MATCH (e)
                WHERE toLower(e.name) CONTAINS $q OR coalesce(toLower(e.cite), '') CONTAINS $q
                RETURN count(e) AS c
            """, q=query_fragment)
            c = result.single()["c"]

        return 1.0 - math.exp(-c / 3.0)

    def _intent_label(self, legal_score: float, kag_score: float) -> str:
        """Classify intent: legal_rag or general."""
        if legal_score > 0.4 or kag_score > 0.3:
            return "legal_rag"
        return "general"

    def _route_decision(self, intent: str, negativity: float) -> str:
        """Map intent + negativity to route."""
        if intent == "legal_rag":
            if negativity > 0.6:
                return "legal_rag_safe"
            return "legal_rag_plus_kag"
        return "general_web"

    def _update_user_metrics(self, user_id: str, latency_ms: float, negativity: float):
        """Update rolling averages in Redis."""
        if not user_id:
            return

        key = f"user-metrics:{user_id}"
        existing = self.redis.get_json(key) or {
            "search_count": 0,
            "avg_latency_ms": 0.0,
            "avg_negativity": 0.0
        }

        count = existing["search_count"] + 1
        avg_latency = (existing["avg_latency_ms"] * existing["search_count"] + latency_ms) / count
        avg_neg = (existing["avg_negativity"] * existing["search_count"] + negativity) / count

        existing.update({
            "search_count": count,
            "avg_latency_ms": avg_latency,
            "avg_negativity": avg_neg
        })

        self.redis.set_json(key, existing, ttl=7 * 24 * 3600)

    def get_user_metrics(self, user_id: str) -> Dict[str, Any]:
        """Retrieve user metrics from Redis."""
        if not user_id:
            return {}
        return self.redis.get_json(f"user-metrics:{user_id}") or {}

    # Learning from chat
    def learn_from_chat(self, user_id: str, text: str):
        """
        Optional hook: call from chat backend to learn user's "angry words".
        Uses Granite (if configured) to classify sentiment and extract negative tokens.
        """
        if not self.granite or not text.strip():
            return

        try:
            analysis = self.granite.classify_sentiment_and_tokens(text)
            # Expected: {"sentiment": "negative"|"neutral"|"positive", "negative_tokens": [...]}
            if analysis.get("sentiment") != "negative":
                return

            tokens = analysis.get("negative_tokens") or []
            if not tokens:
                return

            # Store per-user lexicon in Redis
            key = f"neg-lexicon:user:{user_id}"
            existing = set(self.redis.get_json(key) or [])
            for tok in tokens:
                existing.add(tok.lower())

            self.redis.set_json(key, list(existing), ttl=30 * 24 * 3600)
        except Exception:
            # Fail-soft: alignment still works with seed lexicon
            return

    def plan(self, user_id: Optional[str], query: str, latency_ms: float) -> AlignmentSignals:
        """Main entry point: extract signals, classify intent, decide route."""
        neg = self._negativity_score(query, user_id)
        legal_score = self._legal_score(query)
        kag_score = self._kag_match_score(query)

        intent = self._intent_label(legal_score, kag_score)
        route = self._route_decision(intent, neg)
        web_search_suggested = (route == "general_web")

        on_task = 0.5 * legal_score + 0.5 * kag_score

        self._update_user_metrics(user_id or "", latency_ms, neg)

        return AlignmentSignals(
            user_id=user_id,
            latency_ms=latency_ms,
            query_length=len(query),
            negativity_score=neg,
            on_task_score=on_task,
            intent=intent,
            route_decision=route,
            web_search_suggested=web_search_suggested
        )
```

### 2. Manifold Usage Heat Tracking

```python
def _update_manifold_usage(case_id: str, chunk_index: int, alignment: AlignmentSignals):
    """
    Increase a 'heat' value for (case_id, chunk_index) based on:
    - on_task_score (how aligned with legal/KAG)
    - 1 - negativity_score (calm vs angry)

    Stored in Redis; CH-ROM97 builder can read it to adjust topology
    (e.g., brightness, t-dimension jitter, etc).
    """
    key = f"manifold-usage:{case_id}:{chunk_index}"
    existing = redis_cache.get_json(key) or {
        "hits": 0,
        "heat": 0.0
    }

    hits = existing["hits"] + 1
    on_task = alignment.on_task_score
    calm = 1.0 - alignment.negativity_score

    # Simple scoring: more hits + high on_task + high calm
    delta = 0.5 * on_task + 0.5 * calm

    new_heat = existing["heat"] + delta

    redis_cache.set_json(key, {"hits": hits, "heat": new_heat}, ttl=30 * 24 * 3600)
```

### 3. Pydantic Models

```python
class SearchRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    case_id: Optional[str] = None
    limit: int = 10
    include_kag: bool = True
    include_reasoning: bool = True
    mode: Optional[str] = None  # "fast", "deep"

class SearchResultChunk(BaseModel):
    id: str
    case_id: str
    chunk_index: int
    score: float
    text_snippet: str
    langextract_tags: Dict[str, Any] = {}
    kag_context: Optional[Dict[str, Any]] = None

class AlignmentSignals(BaseModel):
    user_id: Optional[str]
    latency_ms: float
    query_length: int
    negativity_score: float
    on_task_score: float
    intent: str
    route_decision: str
    web_search_suggested: bool

class SearchResponse(BaseModel):
    query: str
    user_id: Optional[str]
    intent: str
    route_decision: str
    chunks: List[SearchResultChunk]
    reasoning_summary: Optional[str] = None
    alignment: AlignmentSignals
```

### 4. /api/search Endpoint Implementation

```python
@router.post("/search", response_model=SearchResponse)
def search(req: SearchRequest):
    """Unified search endpoint with alignment routing."""
    t0 = time.perf_counter()

    # 1. Embed query (Redis-cached)
    query_vec = embedding_client.embed_batch([req.query])[0]

    # 2. Run AlignmentRouter
    alignment = alignment_router.plan(
        user_id=req.user_id,
        query=req.query,
        latency_ms=(time.perf_counter() - t0) * 1000.0
    )

    # 3. Query Qdrant
    hits = qdrant_client.search(
        collection_name="legal_complaints",
        query_vector=query_vec.tolist(),
        limit=req.limit
    )

    # 4. Build chunks, optionally enrich with KAG
    chunks = []
    kag_cache = {}
    for h in hits:
        payload = h.payload or {}
        case_id = payload.get("case_id", "")
        kag_ctx = None

        if req.include_kag and alignment.route_decision.startswith("legal_rag"):
            if case_id not in kag_cache:
                kag_cache[case_id] = _fetch_kag_context_for_case(case_id)
            kag_ctx = kag_cache[case_id]

        chunks.append(SearchResultChunk(
            id=str(h.id),
            case_id=case_id,
            chunk_index=payload.get("chunk_index", -1),
            score=float(h.score),
            text_snippet=payload.get("text", "")[:300],
            langextract_tags=payload.get("langextract_tags", {}),
            kag_context=kag_ctx
        ))

    # 5. Update manifold usage heat
    for c in chunks:
        if c.case_id:
            _update_manifold_usage(c.case_id, c.chunk_index, alignment)

    # 6. Optional: Granite reasoning
    reasoning_summary = None
    if req.include_reasoning and alignment.route_decision.startswith("legal_rag"):
        try:
            top_texts = [c.text_snippet for c in chunks[:5]]
            reasoning_summary = granite_client.summarize_case(
                case_id=req.case_id or (chunks[0].case_id if chunks else "unknown"),
                chunks=top_texts
            )
        except:
            reasoning_summary = None

    # 7. Return response
    return SearchResponse(
        query=req.query,
        user_id=req.user_id,
        intent=alignment.intent,
        route_decision=alignment.route_decision,
        chunks=chunks,
        reasoning_summary=reasoning_summary,
        alignment=alignment
    )
```

### 5. KAG Context Fetching

```python
def _fetch_kag_context_for_case(case_id: str, limit: int = 10) -> Dict[str, Any]:
    """Fetch local neighborhood from Neo4j."""
    driver = alignment_router.neo_driver
    with driver.session() as session:
        result = session.run("""
            MATCH (c:Case {id: $case_id})-[r]-(e)
            RETURN c, type(r) AS rel_type, e
            LIMIT $limit
        """, case_id=case_id, limit=limit)

        edges = []
        nodes = set()
        for rec in result:
            c = dict(rec["c"])
            e = dict(rec["e"])
            rel_type = rec["rel_type"]
            edges.append({
                "from": c,
                "to": e,
                "type": rel_type
            })
            nodes.add(json.dumps(c))
            nodes.add(json.dumps(e))

        return {
            "case_id": case_id,
            "nodes": [json.loads(n) for n in nodes],
            "edges": edges
        }
```

## Data Models

### AlignmentSignals Model
```typescript
interface AlignmentSignals {
  user_id: string | null;
  latency_ms: number;
  query_length: number;
  negativity_score: number;  // 0.0-1.0 (seed + learned lexicon)
  on_task_score: number;     // 0.0-1.0 (0.5 * legal_score + 0.5 * kag_score)
  intent: string;            // "legal_rag" | "general"
  route_decision: string;    // "legal_rag_plus_kag" | "legal_rag_safe" | "general_web"
  web_search_suggested: boolean;
}
```

### SearchResponse Model
```typescript
interface SearchResponse {
  query: string;
  user_id: string | null;
  intent: string;
  route_decision: string;
  chunks: SearchResultChunk[];
  reasoning_summary: string | null;
  alignment: AlignmentSignals;
}
```

### SearchResultChunk Model
```typescript
interface SearchResultChunk {
  id: string;
  case_id: string;
  chunk_index: number;
  score: number;
  text_snippet: string;
  langextract_tags: Record<string, any>;
  kag_context: {
    case_id: string;
    nodes: Array<Record<string, any>>;
    edges: Array<{ from: any; to: any; type: string }>;
  } | null;
}
```

### Manifold Usage Heat Model (Redis)
```typescript
interface ManifoldUsage {
  hits: number;           // How many times this chunk was returned in search
  heat: number;           // Accumulated heat (on_task + calm scores)
}

// Redis key: manifold-usage:{case_id}:{chunk_index}
// TTL: 30 days
```

## Error Handling

### Embedding Errors
- **Ollama Unavailable**: Return HTTP 500 with "Embedding service unavailable".
- **Redis Cache Miss**: Compute embedding on-the-fly; log cache miss.

### Qdrant Errors
- **Qdrant Unavailable**: Return HTTP 500 with "Search service unavailable".
- **Query Timeout**: Return partial results or empty list.

### Neo4j Errors
- **Neo4j Unavailable**: Skip KAG enrichment; return chunks without context.
- **Query Timeout**: Skip KAG enrichment; continue.

### Granite Errors
- **Granite Unavailable**: Skip reasoning summary; return chunks without summary.
- **Timeout**: Skip reasoning summary; continue.

### Redis Errors
- **Redis Unavailable**: Skip metrics tracking and heat updates; continue routing.
- **Metrics Retrieval Fails**: Use default routing; continue.

## Testing Strategy

### Unit Tests
- **Signal Extraction**: Test negativity_score, legal_score, kag_match_score with various inputs.
- **Dynamic Lexicon**: Test that learned words are added to negativity_score computation.
- **Intent Classification**: Test intent_label with different score combinations.
- **Route Decision**: Test route_decision with all intent + negativity combinations.
- **Metrics Tracking**: Test rolling average computation.
- **Manifold Heat**: Test heat accumulation and Redis storage.

### Integration Tests
- **End-to-End Search**: Query → embed → route → search → enrich → heat update → return.
- **KAG Enrichment**: Verify Neo4j context is fetched and included.
- **Granite Reasoning**: Verify reasoning summary is generated.
- **User Metrics**: Verify metrics are tracked and retrieved from Redis.
- **Chat Learning**: Verify learn_from_chat updates user lexicon in Redis.
- **Manifold Heat**: Verify heat is updated in Redis after search.

### Property-Based Tests
- **Signal Scores**: For any query, negativity_score and legal_score should be in [0, 1].
- **Route Consistency**: For any intent + negativity, route_decision should be one of the valid routes.
- **Metrics Monotonicity**: search_count should always increase; avg_latency should converge.
- **Heat Accumulation**: heat should always increase or stay same; never decrease.

### Performance Tests
- **Latency**: Measure p50/p95/p99 latency for /api/search (target < 500ms p95).
- **Throughput**: Measure queries/second with concurrent requests.
- **Cache Hit Rate**: Measure Redis cache hit rate for embeddings.
- **Lexicon Refresh**: Verify lexicon refresh doesn't block requests.
