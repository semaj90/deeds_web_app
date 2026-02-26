# Next Steps Checklist - Legal Agentic Search

## ✅ Completed

- [x] AlignmentRouter implementation (backend/services/alignment_router.py)
- [x] /api/search endpoint (backend/api/search_api.py)
- [x] FastAPI main app (backend/api/main.py)
- [x] SvelteKit proxy route (sveltekit-frontend/src/routes/api/search/+server.ts)
- [x] Search store (sveltekit-frontend/src/lib/stores/search.ts)
- [x] SearchPanel component (sveltekit-frontend/src/lib/components/SearchPanel.svelte)
- [x] Integration documentation (backend/AGENTIC_SEARCH_INTEGRATION.md)
- [x] Implementation progress tracking (.kiro/IMPLEMENTATION_PROGRESS.md)

---

## 🚀 Immediate Next Steps (Ready to Execute)

### 1. Start Backend Server

```bash
# SSH into phase-backend container
docker exec -it phase-backend bash

# Start the API
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

**Expected Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

### 2. Test /api/search Endpoint

```bash
# From your local machine
curl -X POST http://localhost:8000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Supremacy Clause",
    "user_id": "test-user",
    "limit": 5,
    "include_kag": true,
    "include_reasoning": true
  }'
```

**Expected Response:**
- HTTP 200 with SearchResponse JSON
- chunks array with search results
- alignment signals showing intent, route, scores
- reasoning_summary (if Granite is configured)

### 3. Check Health Endpoint

```bash
curl http://localhost:8000/health
```

**Expected Response:**
```json
{"status": "ok", "service": "legal-ai-backend"}
```

### 4. Verify Redis Keys

```bash
# Inside phase-redis container
redis-cli

# Check if metrics are being stored
KEYS user-metrics:*
JSON.GET user-metrics:test-user

# Check if heat is being stored
KEYS manifold-usage:*
JSON.GET manifold-usage:CA-2024-001:0
```

---

## 📋 Task 3: Chat Integration (Next)

### Wire learn_from_chat Hook

**Location:** Your chat backend (e.g., `backend/api/chat_api.py`)

```python
from backend.services.alignment_router import AlignmentRouter

# Initialize router (shared instance)
alignment_router = AlignmentRouter(
    redis_cache=redis_cache,
    neo4j_uri=CFG.neo4j_uri,
    neo4j_user=CFG.neo4j_user,
    neo4j_password=CFG.neo4j_password,
    granite_client=granite_client,
)

@app.post("/api/chat")
def chat(req: ChatRequest):
    # ... process chat ...

    # Learn from user message
    alignment_router.learn_from_chat(req.user_id, req.message)

    # ... return response ...
```

**What This Does:**
- Analyzes user message for sentiment (via Granite if configured)
- Extracts negative tokens from frustrated messages
- Stores in Redis: `neg-lexicon:user:{user_id}`
- Influences future /api/search calls for that user

---

## 📊 Task 4: Topology Integration (Next)

### Update Manifold Export Script

**Location:** Your manifold export script (e.g., `scripts/export_to_chr97.py`)

```python
import redis
import math

redis_client = redis.Redis(host='phase-redis', port=6379)

# For each chunk in your manifold
for chunk_id, (u, v, w, t) in enumerate(manifold_4d):
    case_id = chunks[chunk_id]['case_id']
    chunk_index = chunks[chunk_id]['chunk_index']

    # Get heat from Redis
    key = f"manifold-usage:{case_id}:{chunk_index}"
    usage = redis_client.json().get(key) or {"heat": 0.0}
    heat = usage["heat"]

    # Adjust t-dimension by heat
    alpha = 0.1  # tunable parameter
    t_prime = t + alpha * math.tanh(heat)

    # Store adjusted coordinates
    topology.append({
        "chunk_index": chunk_id,
        "base_manifold": [u, v, w, t],
        "adjusted_manifold": [u, v, w, t_prime],
        "heat": heat,
        "hits": usage.get("hits", 0)
    })
```

**What This Does:**
- Reads manifold usage heat from Redis
- Adjusts 4D coordinates based on heat
- Frequently-used chunks move in t-dimension
- Feeds into CH-ROM97 cartridge generation

---

## 🧪 Task 5: Testing (Optional for MVP)

### Unit Tests for AlignmentRouter

```python
# tests/test_alignment_router.py

def test_negativity_score():
    router = AlignmentRouter(...)

    # Test seed keywords
    assert router._negativity_score("this is stupid", None) > 0.0
    assert router._negativity_score("this is fine", None) == 0.0

    # Test user-learned keywords
    # (after learn_from_chat is called)

def test_legal_score():
    router = AlignmentRouter(...)

    assert router._legal_score("Supremacy Clause") > 0.0
    assert router._legal_score("hello world") == 0.0

def test_intent_classification():
    router = AlignmentRouter(...)

    assert router._intent_label(0.5, 0.0) == "legal_rag"
    assert router._intent_label(0.2, 0.2) == "general"

def test_route_decision():
    router = AlignmentRouter(...)

    assert router._route_decision("legal_rag", 0.3) == "legal_rag_plus_kag"
    assert router._route_decision("legal_rag", 0.7) == "legal_rag_safe"
    assert router._route_decision("general", 0.0) == "general_web"
```

### Integration Tests for /api/search

```python
# tests/test_search_api.py

def test_search_endpoint():
    client = TestClient(app)

    response = client.post("/api/search", json={
        "query": "Supremacy Clause",
        "user_id": "test-user",
        "limit": 5
    })

    assert response.status_code == 200
    data = response.json()
    assert "chunks" in data
    assert "alignment" in data
    assert data["alignment"]["intent"] in ["legal_rag", "general"]
    assert data["alignment"]["route_decision"] in [
        "legal_rag_plus_kag",
        "legal_rag_safe",
        "general_web"
    ]

def test_search_with_kag():
    client = TestClient(app)

    response = client.post("/api/search", json={
        "query": "Supremacy Clause",
        "include_kag": True
    })

    assert response.status_code == 200
    data = response.json()
    for chunk in data["chunks"]:
        if chunk["case_id"]:
            assert "kag_context" in chunk

def test_search_with_reasoning():
    client = TestClient(app)

    response = client.post("/api/search", json={
        "query": "Supremacy Clause",
        "include_reasoning": True
    })

    assert response.status_code == 200
    data = response.json()
    # reasoning_summary may be None if Granite is not configured
    assert "reasoning_summary" in data
```

---

## 📈 Performance Targets

| Operation | Target | How to Measure |
|-----------|--------|----------------|
| Embedding | < 100ms | Check `alignment.latency_ms` in response |
| Qdrant search | < 200ms | Included in total latency |
| KAG enrichment | < 50ms | Included in total latency |
| Granite reasoning | < 100ms | Included in total latency |
| Total /api/search | < 500ms p95 | Run load test with 100 concurrent requests |

**Load Test Command:**
```bash
# Using Apache Bench
ab -n 1000 -c 100 -p search_request.json \
  -T application/json \
  http://localhost:8000/api/search
```

---

## 🔍 Debugging Guide

### Check Backend Logs

```bash
docker logs phase-backend -f
```

### Check Redis Keys

```bash
redis-cli

# List all keys
KEYS *

# Get user metrics
JSON.GET user-metrics:test-user

# Get manifold heat
JSON.GET manifold-usage:CA-2024-001:0

# Get learned lexicon
JSON.GET neg-lexicon:user:test-user

# Get embedding cache
KEYS embedding:*
```

### Check Qdrant Collection

```bash
# Inside phase-qdrant container
curl http://localhost:6333/collections/legal_complaints

# Check collection stats
curl http://localhost:6333/collections/legal_complaints/points/count
```

### Check Neo4j Graph

```bash
# Inside phase-neo4j container
cypher-shell

# Count nodes
MATCH (n) RETURN count(n)

# Find cases
MATCH (c:Case) RETURN c LIMIT 5

# Find entities
MATCH (e:LegalEntity) RETURN e LIMIT 5
```

---

## 📝 Deployment Checklist

- [ ] Backend server started and responding to /health
- [ ] /api/search endpoint tested with curl
- [ ] Redis keys being created (user-metrics, manifold-usage)
- [ ] Qdrant collection accessible
- [ ] Neo4j graph accessible
- [ ] SvelteKit proxy route working
- [ ] SearchPanel component rendering
- [ ] Search results displaying correctly
- [ ] Alignment HUD showing signals
- [ ] KAG context collapsible
- [ ] Reasoning summary displaying
- [ ] Error handling tested (services down)
- [ ] Performance targets met (< 500ms p95)

---

## 🎯 Success Criteria

✅ Backend /api/search endpoint responds to requests
✅ Embeddings are cached in Redis
✅ Qdrant search returns results
✅ Neo4j KAG context is fetched
✅ Granite reasoning is generated (if configured)
✅ Manifold heat is updated in Redis
✅ User metrics are tracked
✅ SvelteKit proxy works
✅ SearchPanel renders and searches
✅ Alignment HUD displays signals
✅ Results display with scores and snippets
✅ KAG context is collapsible
✅ Error handling works

---

## 📞 Support

If you encounter issues:

1. **Backend won't start**: Check Python dependencies, Redis/Qdrant/Neo4j connectivity
2. **Search returns 500**: Check Ollama, Qdrant, Neo4j logs
3. **No results**: Check Qdrant collection has data, verify query embedding
4. **Slow searches**: Check Redis cache hit rate, Qdrant performance
5. **No alignment signals**: Check Redis connectivity, verify user_id is passed

---

## 🚀 Ready to Go!

All core components are implemented and ready for testing. Start with the immediate next steps above, then proceed through Tasks 3-5 as needed.

**Current Status: READY FOR INTEGRATION TESTING**
