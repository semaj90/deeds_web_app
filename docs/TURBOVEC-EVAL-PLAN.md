# TurboVec GPU Acceleration Evaluation Plan

**Status**: LIVE — TurboVec enabled in dev, measurement infrastructure wired
**Enabled**: `TURBOVEC_SIDECAR_GRPC_ENABLED=true` in `.env`
**Target**: Validate latency + accuracy gains, establish baseline for Karpathy blend

---

## Phase 1: Baseline Measurement (Days 1–3)

### 1.1 Live Query Telemetry
- **What**: Run 50–100 real user searches (ACE context retrieval) with TurboVec enabled
- **Measure**:
  - `qdrantLatencyMs` — Qdrant ANN time (baseline)
  - `turbovecLatencyMs` — TurboVec rerank time
  - `totalLatencyMs` — end-to-end (Qdrant → TurboVec → result)
  - Candidate count before/after TurboVec
- **Capture**: `retrieval-metrics.ts` auto-logs to Redis + Postgres
- **Dashboard**: `/api/metrics/retrieval?branch=turbovec-enabled&hours=24`

### 1.2 Baseline Branch (Qdrant-only fallback)
- Temporarily disable TurboVec: `TURBOVEC_SIDECAR_GRPC_ENABLED=false`
- Run same 50–100 queries
- Log to `retrieval:metrics:*:qdrant-only` Redis keys
- Compare: `totalLatencyMs` (Qdrant) vs `totalLatencyMs` (TurboVec)

### 1.3 Expected Outcome
- TurboVec rerank: **15–50ms** (GPU cosine similarity on top-100 candidates)
- Speedup: **5–10×** faster than CPU rerank
- Trade-off: Top-K ordering improved, but fewer total candidates (TurboVec caps at 200 results)

---

## Phase 2: Accuracy Evaluation (Days 4–7)

### 2.1 Gold Standard Creation
- **Source**: 20–30 representative queries from live logs
- **Manual judgment**: For each query, label top-20 Qdrant results as:
  - Relevant (1)
  - Marginally relevant (0.5)
  - Irrelevant (0)
- **Store**: Postgres `retrieval_gold_standard` table (manual, not auto-populated)

### 2.2 Metrics Computation
For each gold query + Qdrant-only + TurboVec-enabled runs:
- **Recall@K**: `|gold ∩ top-K| / |gold|` for K ∈ [5, 10, 20]
- **MRR**: `1 / rank_of_first_relevant` (measure how quickly ranking finds gold)
- **NDCG**: Penalizes getting good results late: `∑ rel_i / log(i+1)`

### 2.3 Expected Outcome
- Recall: **+5–15%** (TurboVec reranking improves recall)
- MRR: **+10–20%** (finds relevant docs earlier)
- NDCG: **+8–12%** (penalizes late-appearing gold)

---

## Phase 3: Production Rollout Readiness (Days 8–10)

### 3.1 Health Checks
- [ ] TurboVec uptime > 99.5% (measured via `/api/health` gRPC probe)
- [ ] Fallback behavior: graceful RRF if TurboVec offline
- [ ] No regressions in other retrieval stages (Qdrant, Postgres, Neo4j)
- [ ] P95 latency < 2s end-to-end

### 3.2 Integration Tests
- [ ] `/api/rag/search` with TurboVec enabled: 50 queries, measure latency distribution
- [ ] `/api/codebase-index/search` (vector search endpoint): TurboVec vs non-TurboVec
- [ ] ACE Stage A2b reranking: verify TurboVec candidates flow to context assembler

### 3.3 Documentation Updates
- [ ] TURBOVEC-WIRED-SESSION-74.md: update stage, metrics, known issues
- [ ] Runbooks: "TurboVec went offline" recovery (fallback to RRF)
- [ ] Dashboards: Grafana or Prometheus export from `retrieval:metrics:*` Redis keys

---

## Phase 4: Latent64 Autoencoder Planning (Days 11+)

### 4.1 Training Data Prep
- Use existing 768-dim embeddings from `codebase_chunk_index.content_embedding`
- Sample: 5K–10K chunks (stratified by feature_id)
- Train unsupervised: vanilla VAE or reconstruction loss

### 4.2 Integration Point
- After TurboVec reranking produces top-100 candidates
- Transform top-100 from 768d → 64d (optional memory path)
- Cache 64d vectors in Redis `gpu:karpathy:encoded` for future MLA consumer

### 4.3 Do NOT block retrieval on autoencoder
- Autoencoder training is independent
- Retrieval lane works with 768d only (no breaking change)
- 64d is future-only (DeepSeek-MLA style consumer)

---

## Measurement Commands

### Check TurboVec health
```bash
npm run dev  # In separate terminal, verify TurboVec gRPC on :50062 is responding
curl -X POST http://127.0.0.1:50062/health  # Or check via gRPC health probe
```

### Run retrieval metrics
```bash
# Get 24-hour summary (all branches)
curl http://127.0.0.1:5173/api/metrics/retrieval

# Compare branches
curl http://127.0.0.1:5173/api/metrics/retrieval?branch=turbovec-enabled&hours=24
curl http://127.0.0.1:5173/api/metrics/retrieval?branch=qdrant-only&hours=24
```

### Baseline queries (manual test)
```bash
# Search via ACE context assembler (auto-logs TurboVec metrics)
curl -X POST http://127.0.0.1:5173/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query":"validation session Lucia", "caseId":"<uuid>", "topK":20}'

# Export metrics to CSV
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "\copy retrieval_eval_runs TO '/tmp/retrieval_evals.csv' CSV HEADER"
```

---

## Success Criteria

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| P95 latency (ms) | ~250 (Qdrant only) | <200 | TBD |
| P99 latency (ms) | ~500 | <400 | TBD |
| TurboVec avg time (ms) | — | 15–50 | TBD |
| Recall@10 | baseline | +5–15% | TBD |
| MRR | baseline | +10–20% | TBD |
| Uptime | 99%+ | 99.5%+ | TBD |
| Graceful fallback | N/A | 100% | TBD |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| TurboVec crashes during eval | Lost metrics, user impact | Graceful fallback to RRF (already wired) |
| Accuracy degrades (NDCG drops) | Worse user experience | Validation gate: NDCG ≥ baseline before prod |
| Latency increases (P95 > 2s) | Slow searches | Timeout handling: fallback to Qdrant if TurboVec slow |
| No improvement observed | Wasted effort | Validate measurement setup on 10 queries first |

---

## Next Steps

1. **Today**: Run 10 manual searches, check `/api/metrics/retrieval` response
2. **Days 1–3**: Collect 50–100 live queries, compute baseline latency + accuracy
3. **Days 4–7**: Build gold standard, validate accuracy metrics
4. **Days 8–10**: Health checks, production readiness review
5. **Days 11+**: Plan latent64 autoencoder training independently

**Owner**: Claude (Karpathy evaluation agent)
**Updated**: 2026-06-28
