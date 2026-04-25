## Integrated Best Practices: Autosolve + Enhanced RAG + Context7 MCP

### 1. Architectural Principles

- Separation of Concerns: distinct processes for (a) ingestion & embeddings, (b) autosolve loop, (c) RAG query serving, (d) orchestration/state (XState), (e) GPU/CUDA jobs.
- Event / Stream First: Prefer Redis Streams + RabbitMQ queues for decoupling; never block autosolve loop on external inference.
- Idempotency: Each autosolve iteration produces deterministic summary (hash inputs → summary id) enabling safe replays.
- Observability by Contract: /metrics endpoints must expose: queue lag, embedding latency p95, autosolve iteration duration, fix success rate.

### 2. Health & Resilience

| Component   | Health Signal                  | Fallback Strategy                                    |
| ----------- | ------------------------------ | ---------------------------------------------------- |
| Redis       | PING latency < 100ms           | Switch to in-memory ring buffer (temporary)          |
| RabbitMQ    | Queue depth trending           | Backpressure: reduce autosolve concurrency           |
| CUDA Worker | Successful health-check vector | Use mock worker & flag degraded mode                 |
| Embedder    | fallbackCalls == 0             | Switch to lightweight local embedding model (MiniLM) |
| RAG HTTP    | 2xx within 300ms median        | Serve cached results (Redis)                         |

### 3. Autosolve Loop Best Practices

1. Pre-flight snapshot: commit git diff → backups/ timestamp folder.
2. Batch classify errors (group by code + file) to avoid duplicate patch suggestions.
3. Prioritize deterministic transformations (lint autofix, explicit typing) before AI free-form edits.
4. Convergence detection: stop when (new_errors_count / previous_errors_count) > 0.98 for 2 consecutive iterations.
5. Safety rails: reject AI patch if diff > 800 lines or deletes > 20% of a file without regeneration step.

### 4. Enhanced RAG Integration

- Dual-Stage Retrieval: (a) Semantic (Qdrant) → (b) Re-rank with high_score composite.
- Partition Indexes: Separate collections: code_errors, law_docs, recommendations. Avoid cross-pollution noise.
- TTL for Stale Error Vectors: expire embeddings older than 14d unless referenced in open TODOs.
- Embedding Cache: sha256(snippet) → vector to prevent recomputation inside same iteration.

### 5. Context7 Alignment

- Deterministic Prompts: Provide explicit scoring factors (already implemented via high_score details) for reproducibility.
- Minimal Prompt Drift: Keep system prompt content hashed; log hash with each Gemma call for audit.
- Memory Layer: Store iteration summaries in memory server with tags (autosolve, iteration_n, success|fail).

### 6. Scoring & Ranking Evolution

Current: 0.6 semantic + 0.25 recencyBoost + 0.15 overlapBoost.
Planned Adaptive Step:

1. Collect resolved error contexts (vector + features + resolved flag).
2. Train ridge regression to fit contribution weights -> new coefficients.
3. Enforce stability guard: Only adopt new weights if semantic weight remains ≥ 0.45.

### 7. Metrics Minimum Set

| Metric                          | Source              | Purpose                 |
| ------------------------------- | ------------------- | ----------------------- |
| embedding_latency_ms_avg        | embedder            | Performance baseline    |
| fallback_calls_total            | embedder            | Model/tokenizer health  |
| autosolve_iteration_duration_ms | autosolve loop      | SLA monitoring          |
| fix_jobs_published_total        | orchestrator worker | Pipeline throughput     |
| gemma_failures_total            | worker              | LLM reliability         |
| high_score_mean                 | worker              | Retrieval quality proxy |

### 8. Security & Safety

- Sanitise AI patches: disallow shell injection patterns and credential artifacts.
- Principle of Least Privilege: autosolve runner writes only within src/ & types/ (configurable allowlist).
- Audit Trail: JSONL line per patch: { ts, file, old_sha, new_sha, token_usage, prompt_hash }.

### 9. Failure Recovery Playbook

1. Abort loop if error count spikes > 20% after a patch batch → perform git rollback for those files.
2. If Gemma unresponsive: switch to local fallback (Ollama mini model) & mark reduced_confidence=true.
3. If Qdrant unavailable: use last cached top contexts; delay indexing until service restoration.

### 10. Tokenizer & Model Strategy

- Primary: Domain Legal-BERT (768-dim) for stable embeddings.
- Secondary: Gemma3 legal for reasoning only (not embeddings).
- Fallback: Generated tokenizer (tokenizer.generated.json) + random vector guard (detect via variance threshold → log warning).

### 11. Deployment Order (Cold Start)

1. Start infra: PostgreSQL → Redis → RabbitMQ → Qdrant.
2. Launch embedder_server (verify /metrics fallbackCalls=0).
3. Start worker (ensure embeddings increment on test snippet).
4. Start orchestrator (autosolve disabled) + run health.
5. Run autosolve:once for baseline; then enable autosolve loop.
6. Activate RAG ingest tasks; warm index.

### 12. Observability Dashboard (Planned Panels)

- Error Count Over Iterations (line chart)
- Autosolve Iteration Duration p50/p95
- Embedding Latency vs Fallback Calls
- High Score Distribution Histogram
- Fix Job Queue Depth

### 13. MCP Tooling Hooks

- Expose command mcp.autosolve.status → returns last iteration stats.
- memory.add(observation) on each resolved error to maintain context for next reasoning cycle.

### 14. Backlog / Next Steps

- [ ] Implement adaptive ranking weight training job
- [ ] Prometheus exporter formatting
- [ ] Patch safety diff size gate
- [ ] Embedding cache layer
- [ ] Regression benchmark: measure avgHighScore vs TODO acceptance rate

---

Document version: 2025-08-15
