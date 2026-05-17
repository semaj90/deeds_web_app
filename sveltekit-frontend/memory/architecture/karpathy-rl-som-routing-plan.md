# Karpathy RL + SOM Routing Plan

## Goal

Improve retrieval routing accuracy without changing the main LLM (Gemma4).
Three tiers in dependency order — do NOT jump to Tier 3 until Tier 2 is verified.

---

## Tier 1 — Interpretable Lane Router (DO THIS FIRST)

Train a decision-table lane router from `chunk_hit_log`. Observable, debuggable, reversible.

**Input features from chunk_hit_log**:
```
lane_id         — L0–L11 (which multi-lane retrieval lane)
trust_tier      — T1/T2/T3/T4/T5
som_cluster     — integer (BMU cluster from SOM training)
gpu_cluster     — integer (k-means cluster from kmeansWithCentroids)
pipeline        — ace/kag/dag/rag/reranker/codebase
query_hash      — for grouping same-query hits
score           — raw retrieval score
rerank_score    — Karpathy-blended final score
```

**Target labels**:
```
avg_rerank_score  — higher = this lane was useful
accepted_context  — true if chunk appeared in final ACE context (proxy: rerank_score ≥ 0.5)
```

**Output**:
```
Redis key: ace:lane:routing_policy
Format:    JSON { lane_id → { weight, trust_threshold, cluster_boost } }
TTL:       24h
```

**Export script**: `npm run kb:export-lane-router-training` → `memory/kb/lane-router-training-set.jsonl`

**Train script**: `npm run kb:train-lane-router` → `memory/kb/lane-router-policy.json` + Redis `ace:lane:routing_policy` (HASH, TTL 24h)

**Full pipeline**: `npm run kb:lane-router:full` (export → train in sequence)

**Redis hash format** (one field per feature key `{som_bucket}|{gpu_cluster}|{trust_tier}`):
```
ace:lane:routing_policy  →  HASH
  "r0-4|3|T3"   →  {"lane":"rag","conf":0.82,"support":47,"avg_score":0.71}
  "r5-9|1|T2"   →  {"lane":"kag","conf":0.67,"support":23,"avg_score":0.68}
```

**How context-assembler.ts reads it** (Stage A0, before vector ANN):
```typescript
const key = `${somBucket}|${gpuCluster}|${trustTier}`;
const raw = await redis.hget('ace:lane:routing_policy', key);
const { lane, conf } = raw ? JSON.parse(raw) : { lane: 'default', conf: 0 };
// conf >= 0.6 → prefer named lane; conf < 0.6 → fall through to vector ANN
```

**Feature key bucketing**: som_bmu_row → 5 buckets (r0-4, r5-9, r10-14, r15-19, r20+)

**Safety**: Read-only from `chunk_hit_log`. No production weight mutation. No GPU required.

---

## Tier 2 — PCA Semantic Projection (DO AFTER TIER 1)

Activate the PCA 768→64 path in `karpathy-gpu-enrich.mjs` by getting ≥65 Qdrant hits.

**Steps**:
```bash
# 1. Populate Qdrant (prerequisite — infra files not indexed yet)
npm run graphify:semantic

# 2. Run Karpathy with enough candidates to hit PCA threshold
npm run karpathy:gpu -- --limit 200

# 3. Verify PCA activated (not Xavier random)
docker exec legal-ai-redis redis-cli HGET gpu:karpathy:summary weightsSource
# Expected: "pca:krylov" or "ols:decoder" — NOT "random:xavier"

# 4. Verify encoded vectors are meaningful (not all near 0)
docker exec legal-ai-redis redis-cli HGET gpu:karpathy:encoded 'src/lib/server/db/client.ts'
```

**Weight resolution chain** (from `karpathy-gpu-enrich.mjs`):
```
1. Redis ace:autoencoder:decoder:weights   (OLS-trained — EMPTY currently)
2. PCA power-iteration Krylov (~20ms CPU) — REQUIRES n ≥ 65 Qdrant hits
3. Xavier random init                      — CURRENT (n=11, meaningless 64-dim output)
```

---

## Tier 3 — GRPO / ConAE Fine-Tune (DO AFTER TIER 2)

Only after PCA path is producing meaningful 64-dim vectors.

**Training loop**:
```
query_emb (768-dim embeddinggemma)
  → autoencoderEncode(W, b) [from ace:autoencoder:weights]
  → retrieve top-K candidates (Qdrant ANN on 64-dim encoded space)
  → rewardScoreGPU(retrieved, relevant)
  → policy gradient: ΔW = lr × reward × ∂loss/∂W
  → write ace:autoencoder:decoder:weights:candidate
  → evaluate on held-out queries
  → if eval_score > current: promote candidate → production
  → retrain SOM on new autoencoder encoding space
  → update Qdrant payload (som_cluster + manifold4)
  → update Neo4j SIMILAR_TOPOLOGY edges
```

**Reward sources** (priority order):
1. `rerank_score ≥ 0.7` in chunk_hit_log (retrieval quality proxy)
2. `accepted_context = true` (chunk appeared in ACE context window)
3. Citation density in synthesis output
4. Human thumbs-up via `/api/analytics/feedback`

**Safety rules**:
- NEVER write directly to `ace:autoencoder:weights` (production key)
- Always write to `ace:autoencoder:weights:candidate` first
- Promote only after eval_score passes threshold on 50+ held-out queries
- Keep fallback: if candidate causes avg_rerank drop >10%, auto-revert
- Do not mutate SOM/Qdrant/Neo4j during training — only after promotion

---

## Web Search Lane (SearXNG — not Ollama)

Gemma4 has NO native web search. The cascade is:

```
Gemma4 calls web_search MCP tool
  → /api/research/web-search (SvelteKit route)
    → SEARXNG_URL :8888      (primary — live web)
    → BRAVE_API_KEY          (fallback)
    → SERPER_API_KEY         (fallback)
    → DuckDuckGo scrape      (last resort)
```

SearXNG results enter as T4 trust-tier content and go through `sanitizer.ts` 8-pattern check before entering the ACE system prompt fence. They are NOT promoted to T1 without manual review.

---

## LangExtract — Keyword Extraction from LLM Outputs

LangExtract (Google, v0.5.0 Feb 2026) extracts structured keywords/entities from LLM output text with exact source offsets and schema enforcement.

**Use case in this stack**:
```
Inference logs / CouchDB inference_log docs
  → LangExtract keyword extraction (native TS via langextract/native.ts)
    → keywords array → kb_notecards Qdrant upsert
      → BM42 sparse index enrichment
        → Lane A lexical search improvement
```

**Pipeline position**: Stage 5.5 — between TurboQuant synthesis (Stage 5) and DAG loop (Stage 6).
After each LiteRT/TurboQuant synthesis pass, run LangExtract on the output to backfill keyword tags into the Qdrant payload.

**Implementation target**:
- Script: `scripts/langextract-keywords-from-logs.mjs`
- Input: CouchDB `inference_log` (last N entries) OR pipe from stdio
- Output: Redis `code:llm:{hash}:keywords` + Qdrant payload `keywords[]` field
- ETA bar: `ora` or inline `process.stdout.write('\r[${i}/${total}]')` every 10 docs

---

## Correct Build Order

```
Phase 0: graphify:semantic                # populate Qdrant (unblocks everything)
Phase 1a: kb:export-lane-router-training # Tier 1: export training set from chunk_hit_log
Phase 1b: kb:train-lane-router           # Tier 1: build decision table → Redis ace:lane:routing_policy
Phase 2: karpathy:gpu -- --limit 200     # Tier 2: activate PCA path
Phase 3: ae:train                         # train autoencoder (PyTorch, RTX 3060 Ti, ~30s)
Phase 4: karpathy:gpu                     # rebuild blend with trained encoder
Phase 5: smoke:hyperrag                   # verify G-HR3/G-HR4 now pass
Phase 6: graphify:full                    # full regeneration: SOM + manifold4 + PageRank
```

GRPO (Tier 3) only after Phase 4 confirms meaningful 64-dim vectors.

---

## Langfuse — Disable Recommendation

**Langfuse footprint**: ~30GB (ClickHouse OLAP + PostgreSQL). Not needed for current work.

**Available without Langfuse**:
- `curl http://localhost:5173/api/cache/exact-match/stats` — L1/L2/L3 hit rates
- `docker exec legal-ai-redis redis-cli HGETALL gpu:karpathy:summary` — blend run metadata
- `docker exec legal-ai-redis redis-cli XRANGE gpu:karpathy:run_log - + COUNT 10` — run history
- `/api/analytics/context-timeline` — ACE retrieval audit trail

**To stop and reclaim 30GB**:
```bash
docker compose stop langfuse clickhouse
docker compose rm -f langfuse clickhouse
# Optionally prune volumes (destructive — loses all trace history):
docker volume rm deeds_langfuse_data deeds_clickhouse_data
```

Re-enable only if you need to debug a latency regression that Redis stats can't explain.