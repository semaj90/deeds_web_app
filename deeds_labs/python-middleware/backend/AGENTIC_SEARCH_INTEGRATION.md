# Agentic Search Integration Guide

## Quick Start

### 1. Start Backend

```bash
# Inside phase-backend container
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

### 2. Test Endpoint

```bash
curl -X POST http://localhost:8000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Supremacy Clause preemption",
    "user_id": "user-123",
    "limit": 10,
    "include_kag": true,
    "include_reasoning": true
  }'
```

### 3. Expected Response

```json
{
  "query": "Supremacy Clause preemption",
  "user_id": "user-123",
  "intent": "legal_rag",
  "route_decision": "legal_rag_plus_kag",
  "chunks": [
    {
      "id": "chunk-1",
      "case_id": "CA-2024-001",
      "chunk_index": 5,
      "score": 0.92,
      "text_snippet": "The Supremacy Clause establishes...",
      "langextract_tags": {
        "section_type": "holding",
        "crime_code": "PC 211"
      },
      "kag_context": {
        "case_id": "CA-2024-001",
        "nodes": [...],
        "edges": [...]
      }
    }
  ],
  "reasoning_summary": "This case establishes that federal law preempts state law when...",
  "alignment": {
    "user_id": "user-123",
    "latency_ms": 245.3,
    "query_length": 32,
    "negativity_score": 0.0,
    "on_task_score": 0.85,
    "intent": "legal_rag",
    "route_decision": "legal_rag_plus_kag",
    "web_search_suggested": false
  }
}
```

---

## Integration Points

### 1. Chat Backend Integration

Wire up the learn_from_chat hook to learn user's "angry words":

```python
from backend.services.alignment_router import AlignmentRouter

# In your chat endpoint handler
alignment_router = AlignmentRouter(...)

@app.post("/api/chat")
def chat(req: ChatRequest):
    # ... process chat ...

    # Learn from user message
    alignment_router.learn_from_chat(user_id, user_message)

    # ... return response ...
```

### 2. SvelteKit Integration

Use the SearchPanel component in your pages:

```svelte
<script>
  import SearchPanel from '$lib/components/SearchPanel.svelte';
</script>

<div class="container">
  <h1>Legal Search</h1>
  <SearchPanel />
</div>
```

Or use the store directly:

```svelte
<script>
  import { executeSearch, searchResults, searchAlignment } from '$lib/stores/search';

  async function search() {
    await executeSearch("Supremacy Clause", {
      include_kag: true,
      include_reasoning: true
    });
  }
</script>

<button on:click={search}>Search</button>

{#if $searchAlignment}
  <p>Intent: {$searchAlignment.intent}</p>
  <p>Route: {$searchAlignment.route_decision}</p>
  <p>On-task: {$searchAlignment.on_task_score}%</p>
{/if}

{#each $searchResults as chunk}
  <div>{chunk.text_snippet}</div>
{/each}
```

### 3. Topology Integration

Update your manifold export script to read Redis heat:

```python
import redis

redis_client = redis.Redis(host='phase-redis', port=6379)

# For each chunk in your manifold
for case_id, chunk_index in chunks:
    key = f"manifold-usage:{case_id}:{chunk_index}"
    usage = redis_client.json().get(key) or {"heat": 0.0}
    heat = usage["heat"]

    # Adjust t-dimension by heat
    t_prime = t + 0.1 * math.tanh(heat)

    # Store adjusted coordinates
    topology.append({
        "chunk_index": chunk_index,
        "base_manifold": [u, v, w, t],
        "adjusted_manifold": [u, v, w, t_prime],
        "heat": heat
    })
```

---

## Redis Keys Reference

### Alignment Lexicons

```
neg-lexicon:global
  Type: JSON
  Value: {"tokens": ["stupid", "useless", ...]}
  TTL: None (persistent)

neg-lexicon:user:{user_id}
  Type: JSON
  Value: {"tokens": ["angry", "frustrated", ...]}
  TTL: 30 days
```

### User Metrics

```
user-metrics:{user_id}
  Type: JSON
  Value: {
    "search_count": 42,
    "avg_latency_ms": 312.5,
    "avg_negativity": 0.15
  }
  TTL: 7 days
```

### Manifold Usage Heat

```
manifold-usage:{case_id}:{chunk_index}
  Type: JSON
  Value: {
    "hits": 5,
    "heat": 3.2
  }
  TTL: 30 days
```

---

## Alignment Signals Explained

### Intent

- **legal_rag**: Query is legal-related (legal_score > 0.4 OR kag_score > 0.3)
- **general**: Query is general (legal_score ≤ 0.4 AND kag_score ≤ 0.3)

### Route Decision

- **legal_rag_plus_kag**: Legal query with low negativity (< 0.6)
  - Full RAG + KAG context + reasoning
  - Best for calm, focused legal research

- **legal_rag_safe**: Legal query with high negativity (≥ 0.6)
  - RAG + KAG context + extra explanation
  - For frustrated or angry users

- **general_web**: General query
  - Suggest web search
  - Not legal corpus

### Scores

- **negativity_score** (0.0-1.0): How angry/frustrated the query sounds
  - 0.0 = calm
  - 1.0 = very angry
  - Based on seed + learned "angry words"

- **on_task_score** (0.0-1.0): How aligned with legal corpus
  - 0.0 = not legal
  - 1.0 = very legal
  - Calculated as: 0.5 * legal_score + 0.5 * kag_score

- **latency_ms**: Time to embed query + search Qdrant
  - Target: < 500ms p95

---

## Error Handling

### Embedding Errors

If Ollama is down:
```
HTTP 500: "Embedding error: ..."
```

### Qdrant Errors

If Qdrant is down:
```
HTTP 500: "Qdrant search error: ..."
```

### Neo4j Errors

If Neo4j is down:
- KAG context is skipped
- Search continues with RAG only
- No error returned

### Granite Errors

If Granite is down:
- Reasoning summary is skipped
- Search continues with chunks only
- No error returned

### Redis Errors

If Redis is down:
- Metrics tracking is skipped
- Heat updates are skipped
- Search continues normally
- No error returned

---

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Embedding | < 100ms | GPU-accelerated via Ollama |
| Qdrant search | < 200ms | Semantic search on 768-d vectors |
| KAG enrichment | < 50ms | Neo4j local neighborhood |
| Granite reasoning | < 100ms | Optional, can be skipped |
| Total /api/search | < 500ms p95 | End-to-end latency |

---

## Debugging

### Check Redis Keys

```bash
# Inside phase-redis container
redis-cli

# List all keys
KEYS *

# Get user metrics
JSON.GET user-metrics:user-123

# Get manifold heat
JSON.GET manifold-usage:CA-2024-001:5

# Get learned lexicon
JSON.GET neg-lexicon:user:user-123
```

### Check Qdrant Collection

```bash
# Inside phase-qdrant container
curl http://localhost:6333/collections/legal_complaints
```

### Check Neo4j Graph

```bash
# Inside phase-neo4j container
cypher-shell

# Count nodes
MATCH (n) RETURN count(n)

# Find cases
MATCH (c:Case) RETURN c LIMIT 5
```

---

## Next Steps

1. **Test /api/search** with real data
2. **Wire chat learning** via learn_from_chat hook
3. **Update topology** with manifold heat
4. **Monitor performance** and adjust thresholds
5. **Gather user feedback** on alignment signals

---

## Support

For issues or questions:
1. Check Redis keys for metrics/heat
2. Check Qdrant collection for vectors
3. Check Neo4j for graph structure
4. Check backend logs for errors
5. Test endpoint directly with curl
