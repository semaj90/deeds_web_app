# Langfuse + EmbeddingGemma + Subagent Observability TODO

**Goal:** Add observability and feedback loops for ACE/KAG/Gemma4 subagent workflows, while keeping EmbeddingGemma as the default embedding model and treating ONNX as a later optimization lane.

---

## 1. Direct Decision

Use **EmbeddingGemma through Ollama** as the default embedding lane.

Do **not** switch to ONNX yet.

Reason:

```text
EmbeddingGemma is already simple, local, small, and retrieval-focused.
Ollama exposes it through /api/embed.
Your stack already uses Ollama :11434.
ONNX Runtime on Windows Node has DirectML support, but CUDA prebuilt Node support is Linux-only.
```

Use ONNX later only if:

```text
you need a frozen embedding model file,
you want runtime-independent embedding inference,
you want DirectML on Windows,
you need faster local batch inference,
or Ollama embedding latency becomes the bottleneck.
```

---

## 2. Current Embedding Lane

```text
Text / transcript / frame caption / markdown chunk
  → Ollama embeddinggemma
  → vector
  → Qdrant
  → optional encoded64 / autoencoder
  → optional TurboVec sidecar
```

EmbeddingGemma should remain the canonical default for:

```text
markdown chunks
AGENTS cards
FeatureMap summaries
transcript segments
frame captions
image captions
wiki pages
external docs
```

---

## 3. What Langfuse Adds

Langfuse should be used for **observability**, not as a datastore.

Use Langfuse to trace:

```text
subagent run
query plan
retrieval lanes
Qdrant search
Neo4j graph expansion
Redis/BitFrost cache hit
Gemma4 synthesis
embedding call latency
rerank score
final answer
user feedback
```

Langfuse helps answer:

```text
Which retrieval lane helped?
Which subagent failed?
How many tokens were saved by BitFrost cache?
How long did Qdrant/Neo4j/Gemma4 take?
Which context chunks were selected or rejected?
Which prompt version produced the best result?
```

---

## 4. Langfuse Trace Shape

Each user request should create one trace.

```json
{
  "trace": "ace_query",
  "userId": "operator-or-user-id",
  "sessionId": "case-or-workflow-id",
  "metadata": {
    "intent": "evidence_search",
    "model": "gemma4",
    "embedding_model": "embeddinggemma",
    "cache_key": "ace:ctx:...",
    "repo_sha": "...",
    "rag_bundle_hash": "..."
  }
}
```

Nested spans:

```text
intent.detect
query.expand
embed.query
cache.resolve
qdrant.search.text
qdrant.search.visual
neo4j.expand
redis.cache.lookup
turbovec.prefilter
rrf.merge
rerank.marco
langextract.entities
gemma4.synthesize
feedback.record
```

---

## 5. What to Log Per Span

### embed.query

```json
{
  "model": "embeddinggemma",
  "input_chars": 512,
  "dim": 768,
  "duration_ms": 24,
  "provider": "ollama",
  "cache_hit": false
}
```

### qdrant.search.text

```json
{
  "collection": "evidence_text_chunks",
  "topK": 25,
  "hit_count": 25,
  "duration_ms": 18,
  "filters": {
    "case_id": "case_123",
    "modality": "video"
  }
}
```

### cache.resolve

```json
{
  "cache_key": "ace:ctx:...",
  "source": "redis",
  "hit": true,
  "prompt_tokens_saved_estimate": 3400
}
```

### gemma4.synthesize

```json
{
  "backend": "turboquant",
  "model": "gemma4",
  "model_quant": "rotorquant",
  "draft_model": true,
  "prompt_tokens": 2800,
  "completion_tokens": 420,
  "duration_ms": 9200
}
```

---

## 6. Langfuse Score Events

Add scores for feedback and later GRPO/RL-style tuning.

```text
context_precision
answer_helpfulness
citation_grounding
retrieval_quality
cache_reuse_quality
operator_thumbs_up
operator_thumbs_down
```

Score examples:

```json
{
  "trace_id": "...",
  "name": "retrieval_quality",
  "value": 0.82,
  "comment": "Top 3 chunks matched the operator intent."
}
```

---

## 7. Subagent Workflow Tracking

Every subagent should emit a trace span.

Subagents:

```text
intent-agent
embedding-agent
retrieval-agent
graph-agent
wiki-agent
featuremap-agent
evidence-ingestor
transcript-agent
vision-agent
summary-agent
quality-agent
gemma4-synthesis-agent
```

Each span should include:

```text
agent_name
input_hash
output_hash
duration_ms
status
warnings
error
selected_source_ids
rejected_source_ids
cache_keys
```

---

## 8. EmbeddingGemma vs ONNX

### Keep EmbeddingGemma now

Pros:

```text
already runs through Ollama
small 300M model
local on-device focus
good for search/retrieval/classification/clustering
multilingual
easy JS/Python/cURL API
no custom ONNX runtime work
```

Use for:

```text
Qdrant embeddings
markdown chunks
video transcripts
image captions
FeatureMap summaries
AGENTS cards
wiki docs
```

### Consider ONNX later

Pros:

```text
frozen runtime artifact
can run without Ollama
DirectML possible on Windows
good for specialized embedding model deployment
can be wrapped in a worker
```

Cons:

```text
extra model export/conversion burden
extra runtime support
CUDA prebuilt onnxruntime-node is not available for Windows
more devops complexity
harder to debug than Ollama
```

Use ONNX later only if:

```text
Ollama embedding latency is measured as bottleneck
you need a model not supported by Ollama
you want a specialized image/audio embedding model
you need DirectML Windows acceleration
```

---

## 9. Tensor / Autoencoder Lane

The embedding vector is already a tensor-like float array.

Flow:

```text
text/caption
  → EmbeddingGemma
  → 768d vector
  → Qdrant canonical storage
  → optional autoencoder 768→64
  → Redis centroids
  → optional TurboVec compressed sidecar
```

Use GPU/Tensor work for:

```text
batch embeddings
autoencoder 768→64
batch cosine similarity
SOM / BMU assignment
k-means
rerank model if GPU-served
```

Do not use GPU tensor work for:

```text
Langfuse logging
JSONB writes
Postgres metadata
Neo4j traversal
Qdrant network calls
timestamp alignment
```

---

## 10. ACE / BitFrost Cache Integration

Langfuse should show whether ACE reused a context packet.

Cache order:

```text
Redis ace:ctx:{cacheKey}
  → Postgres llm_context_cache
  → local JSON .cache/ace/context-packs/{cacheKey}.json
  → miss
```

Log:

```text
cache_source
cache_hit
cache_key
chunk_ids
graph_path_count
tool_policy_hash
prompt_tokens_saved_estimate
```

Do not log:

```text
hidden reasoning
raw KV tensors
GPU pointers
native handles
private secrets
```

---

## 11. Implementation TODO

### Phase L1 — Langfuse setup

- [ ] Decide self-hosted Langfuse vs cloud.
- [ ] Add environment variables:
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
  - `LANGFUSE_BASE_URL`
  - `LANGFUSE_ENABLED=true`
- [ ] Add `src/lib/server/observability/langfuse.ts`.
- [ ] Add fail-open wrapper so Langfuse outage never breaks retrieval.
- [ ] Add smoke script: `scripts/smoke-langfuse-trace.mjs`.

### Phase L2 — ACE trace wrapper

- [ ] Create `traceAceRequest()`.
- [ ] Add spans for:
  - intent detection
  - query expansion
  - embedding
  - cache resolve
  - Qdrant search
  - Neo4j expansion
  - RRF merge
  - Gemma4 synthesis
- [ ] Add `trace_id` to `ace_retrieval_runs.metadata`.

### Phase L3 — Embedding trace

- [ ] Wrap EmbeddingGemma calls.
- [ ] Log model, input length, vector dimension, latency.
- [ ] Log cache hit/miss if embedding cache exists.
- [ ] Add warning if Ollama is down.
- [ ] Add fallback behavior.

### Phase L4 — Subagent traces

- [ ] Add subagent span helper.
- [ ] Record selected/rejected source IDs.
- [ ] Record warnings/errors.
- [ ] Record output hash, not full private output.
- [ ] Link spans to workflow run IDs.

### Phase L5 — Feedback scores

- [ ] Add thumbs up/down score.
- [ ] Add retrieval_quality score.
- [ ] Add citation_grounding score.
- [ ] Add cache_reuse_quality score.
- [ ] Store mirrored feedback in Postgres `recommendation_events` or existing feedback table.

### Phase L6 — Dashboard

- [ ] Add Observability panel in Knowledge Base Manager.
- [ ] Show latest trace link.
- [ ] Show lane latency breakdown.
- [ ] Show cache hit rate.
- [ ] Show embedding latency.
- [ ] Show retrieval quality scores.

### Phase L7 — ONNX spike, deferred

- [ ] Do not implement now.
- [ ] Benchmark EmbeddingGemma first.
- [ ] If needed, create isolated ONNX embedding worker.
- [ ] Try CPU/DirectML first on Windows.
- [ ] Do not replace EmbeddingGemma until quality/latency are compared.

---

## 12. Recommended Commit Sequence

### Commit 1

```text
docs(observability): add Langfuse and embedding telemetry plan
```

### Commit 2

```text
feat(observability): add fail-open Langfuse trace wrapper
```

### Commit 3

```text
feat(ace): trace cache, embedding, retrieval, and synthesis spans
```

### Commit 4

```text
feat(feedback): mirror Langfuse scores into recommendation events
```

### Commit 5

```text
feat(ui): show ACE observability in Knowledge Base Manager
```

---

## 13. Guardrails

- [ ] Do not replace EmbeddingGemma with ONNX yet.
- [ ] Do not add ONNX CUDA on Windows unless custom build is explicitly planned.
- [ ] Do not block requests on Langfuse.
- [ ] Do not log secrets.
- [ ] Do not log hidden reasoning.
- [ ] Do not log full private evidence text by default.
- [ ] Do not make Langfuse the source of truth.
- [ ] Do not add LangGraph just for traces.
- [ ] Do not mutate Qdrant/Neo4j from observability code.

---

## 14. Final Recommendation

Use:

```text
EmbeddingGemma through Ollama
  = default embedding model

Langfuse
  = observability / traces / scores

Postgres
  = durable audit and mirrored feedback

Qdrant
  = semantic vector search

Redis
  = hot context cache

Gemma4
  = planner and synthesizer

ONNX
  = deferred optimization spike only
```

Immediate next work:

```text
1. Add Langfuse fail-open wrapper.
2. Trace EmbeddingGemma calls.
3. Trace ACE cache resolution.
4. Trace Qdrant/Neo4j lanes.
5. Add feedback scores.
6. Keep EmbeddingGemma as-is until metrics prove a bottleneck.
```
