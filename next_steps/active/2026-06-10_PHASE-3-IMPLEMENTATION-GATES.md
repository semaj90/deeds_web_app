# Phase 3: Implementation Gates
**Date:** 2026-06-10  
**Status:** READY FOR EXECUTION  
**Previous Phases:** ATLAS-1.0 ✅ LOCKED, ATLAS-2.0 ✅ FROZEN  

---

## Executive Summary

Phase 3 shifts from **storage architecture** to **retrieval quality**. Four concrete gates replace the previous schema-focused roadmap:

1. **Gate A — Retrieval Benchmark** (100 seed queries, immutable baseline)
2. **Gate B — Authority Reranker** (0.35·vector + 0.25·graph + 0.20·community + 0.10·cache + 0.10·recency)
3. **Gate C — Coverage Closure** (community_id 34% → >95%)
4. **Gate D — Active Learning** (real runtime failures, not synthetic AI)

**Core principle:** The 5% remaining work is not infrastructure—it's **proving the retrieval system works reliably under real workloads.**

---

## Gate A: Retrieval Benchmark — FOUNDATION (IMMEDIATE)

### Artifact
**Location:** `benchmarks/retrieval-100.jsonl`  
**Status:** ✅ CREATED

```json
{"id": "auth-001", "category": "auth", "query": "username already taken", "expected_feature_id": "auth-register", "expected_source_ref": "src/routes/api/auth/register/+server.ts"}
{"id": "drizzle-001", "category": "drizzle", "query": "insert into users table", "expected_feature_id": "db-users", "expected_source_ref": "src/lib/server/db/schema-postgres.ts"}
...
(100 total queries across 10 categories)
```

### Baseline Runner
**Location:** `scripts/benchmark/retrieval-baseline.mjs`  
**Status:** ✅ CREATED  
**Usage:**
```bash
npm run benchmark:retrieval:baseline              # Run baseline
npm run benchmark:retrieval:baseline:save         # Save as reference
npm run benchmark:retrieval:baseline:compare      # Compare vs baseline
```

### Metrics
For each query:
- **Recall@5, Recall@10, Recall@20** — % of expected results in top-K
- **MRR** — Mean Reciprocal Rank (1/rank if found, 0 otherwise)
- **Authority Score** — Average authority score of top-5 results

Aggregate by category (10×10 matrix) + overall stats

### Phase 3 Success Criteria
```
Recall@20 ≥ 0.92
MRR ≥ 0.90
Authority Score > 0.75
```

### Why First
**Without this baseline, we cannot measure whether authority reranking helps.** Current vector-only retrieval is the reference point. Every Phase 3 improvement is validated against this benchmark.

---

## Gate B: Authority Reranker (DEPENDS ON GATE A)

### Current Pipeline
```
embedding → qdrant (vector search) → top-k → hydrate → ACE context → Gemma4
```

### Target Pipeline
```
embedding
  → qdrant (vector search, top-k)
  → community expansion (Neo4j: find related nodes in same community)
  → graph expansion (Neo4j: Dijkstra 5-hop from top-k)
  → authority rerank (formula below)
  → packet hydrate (Redis cache + Postgres)
  → ACE context assembly
  → Gemma4 synthesis
```

### Authority Score Formula
```
score = 
  0.35 * vector_similarity +
  0.25 * graph_authority_score +
  0.20 * community_rank +
  0.10 * cache_hit_frequency +
  0.10 * recency_boost
```

**Weights rationale:**
- Vector similarity dominates (0.35) — semantic matching is foundational
- Graph authority (0.25) — PageRank differentiates high-leverage nodes
- Community rank (0.20) — topology-aware clustering adds signal
- Cache hit (0.10) — proven relevance from prior retrievals
- Recency (0.10) — newer retrievals may be more relevant

### Persistent Columns (ENRICHMENT ONLY)

**In `atlas_feature_map`:**
- `graph_authority_score REAL` — PageRank normalized [0, 1]
- `community_rank REAL` — community-relative ranking [0, 1]
- `retrieval_score REAL` — composite authority (cached)

**In `nes_chrom_packets.payload` (JSONB):**
```json
{
  "authority": {
    "vector": 0.92,
    "graph": 0.78,
    "community": 0.85,
    "cache": 0.45,
    "recency": 0.95,
    "composite": 0.82
  }
}
```

### A/B Test Success Criteria
- Recall@20 improves by >5% (e.g., 0.87 → 0.92)
- OR MRR improves by >0.1 (e.g., 0.80 → 0.91)
- AND authority score ceiling remains <0.95 (not overfitted)

### Implementation Checklist
- [ ] Neo4j community expansion query (Stage 2)
- [ ] Neo4j graph expansion (Dijkstra, Stage 3)
- [ ] Authority score compute in Python/TypeScript (Stage 4)
- [ ] Redis cache layer (`ace:authority:*`)
- [ ] Wire into `fetchACPKnowledgeResults()` reranking stage
- [ ] A/B test against Gate A baseline
- [ ] Gate B sign-off (metrics validated)

---

## Gate C: Coverage Closure (BLOCKING GATE B PRODUCTION)

### Current State
```
glyph_records with community_id: ~5,000 / 14,487 = 34%
REQUIRED for Phase 3A production: > 95% (13,762+ packets)
```

### Root Cause Analysis
1. **Source_ref mapping gaps** — Some glyph_records lack source_ref or have non-matching paths
2. **Rust detection incomplete** — Louvain may not reach all graph nodes
3. **Schema mismatch** — glyph_records.community_id NULL vs codebase_files.community_id populated

### Remediation Path

**Step 1: Analyze NULL records** (1-2 hours)
```sql
SELECT source_ref, COUNT(*) as count
FROM glyph_records
WHERE community_id IS NULL
GROUP BY source_ref
ORDER BY count DESC
LIMIT 50;
```

**Step 2: Fuzzy match** (2-3 hours)
- For each NULL source_ref, find nearest match in codebase_files.file_path
- Use Levenshtein distance or fts5 `MATCH`
- Manual override for ambiguous matches

**Step 3: Rerun Rust community detection** (30 minutes)
```bash
npm run graphify:communities -- --k=30  # k=30 for better coverage than k=20
```

**Step 4: Fallback clustering** (1-2 hours)
- For nodes still uncovered, assign directory-based community
- Preserve community_id chain integrity

**Step 5: Verify gate** (30 minutes)
```sql
SELECT 
  COUNT(*) FILTER (WHERE community_id IS NOT NULL) as with_community,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE community_id IS NOT NULL) / COUNT(*), 2) as pct
FROM glyph_records;
-- Expected: pct >= 95.00
```

### Timeline
- **Estimated:** 1 working day (6-8 hours)
- **Blocking:** Phase 3A cannot ship until > 95%
- **Risk:** Low (community_id enrichment only, no schema changes)

---

## Gate D: Active Learning (DEPENDS ON GATES A–C)

### Table Schema
```sql
CREATE TABLE lora_training_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key TEXT NOT NULL,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  reward_score REAL,
  repair_success BOOLEAN,
  retrieval_score REAL,
  community_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  
  INDEX (packet_key),
  INDEX (community_id),
  INDEX (reward_score DESC),
  INDEX (created_at DESC)
);
```

### Real Data Sources (NOT Synthetic)

1. **Runtime packet replay**
   - Every Gemma4 call → query/response pair
   - Automated capture in retrieval route
   - Source: real user queries

2. **Self-heal packets**
   - Error detection → packet repair → new response
   - High-value signal (error correction)
   - Source: repair loop (`src/lib/server/repair/`)

3. **Repair-loop**
   - Manual user corrections to LLM output
   - Explicit negative feedback
   - Source: feedback buttons + correction UI

4. **Telemetry misses**
   - Queries with low confidence
   - Queries with no relevant packets
   - Failures that trigger fallback
   - Source: ACE retrieval trace

### Reward Scoring Formula
```
reward_score = 
  0.40 * relevance_signal +
  0.30 * user_feedback +
  0.20 * repair_success +
  0.10 * latency_bonus
```

**Signals:**
- **relevance_signal:** Implicit (no follow-up query within 5min = relevant). Score: 0–1
- **user_feedback:** Thumbs up = +1, thumbs down = -1. Normalize to [0, 1]
- **repair_success:** Did self-heal fix the issue? Boolean → {0, 1}
- **latency_bonus:** Retrieval < 2s → +0.1. Otherwise 0

### Collection Targets
- **Week 1:** 100+ examples (authority reranker alpha)
- **Week 2:** 500+ examples (diversity sampling)
- **Week 4:** 1,000+ examples (LoRA fine-tuning ready)

### What NOT to Do
- ❌ Synthetic AI generations (no ground truth)
- ❌ Template-based examples (overfitting risk)
- ❌ LLM-generated labels (cascading errors)
- ❌ Mock retrieval failures (unrealistic patterns)

---

## CHR97 Cartridge Planning (AFTER GATES A–D)

### DO NOT START YET
CHR97 binary export requires:
1. ✅ Authority scores stable (Gate B complete)
2. ✅ Community coverage > 95% (Gate C complete)
3. ✅ LoRA candidates harvested (Gate D in progress)

**If you start cartridge compression before these gates pass, you will:**
- Compress unstable retrieval (wasted storage)
- Lose flexibility for authority reranking tuning
- Miss the LoRA fine-tuning window
- Repeat compression work as gates change

### Final Cartridge Contract (Design Only)

Each packet in the cartridge MUST carry:
```json
{
  "packet_key": "pk:abc123",
  "feature_id": "feat:auth-register",
  "community_id": 42,
  "manifold4": [0.1, 0.2, 0.15, 0.87],
  "authority_score": 0.82,
  "summary": "User registration validation",
  "tags": ["auth", "validation", "register"]
}
```

**Validation gates before cartridge export:**
- [ ] 100% of packets have authority_score
- [ ] 100% of packets have valid community_id
- [ ] manifold4 coordinates populated for >80% of packets
- [ ] Benchmark proves retrieval stable (metrics do not drop >5% after compression)

---

## Weekly Checkpoint Template

### Week N Metrics
```
📊 BENCHMARK PROGRESS
┌─────────────────────────────────────────────┐
│ Recall@20          [current]  / 0.92  ✓     │
│ MRR                [current]  / 0.90  ✓     │
│ Authority Score    [current]  / 0.75  ✓     │
└─────────────────────────────────────────────┘

🎯 COMMUNITY COVERAGE
  Current: [pct]%
  Target:  >95%
  Status:  [⏳ In Progress / ✓ COMPLETE]

💾 LORA CANDIDATES
  Collected: [n]
  Target:    1,000+
  Status:    [⏳ In Progress / ✓ COMPLETE]

⚠️ BLOCKERS
  - [item]
  - [item]

📝 NEXT STEPS
  1. [action]
  2. [action]
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Authority scores don't improve Recall@20 | A/B test + tune weights (0.35/0.25/0.20/0.10/0.10 are defaults, not sacred) |
| Community coverage stalls at 70-80% | Manual source_ref validation + directory-based fallback as safety net |
| LoRA candidates show no signal | Stop collecting; revisit reward formula; don't force LoRA training |
| Packet hydration latency spikes | Add Redis caching tier (ace:packet:* keys); benchmark retrieval stage timing |
| Benchmark metrics drift unexpectedly | Save daily snapshots; measure deltas; check for upstream data changes |

---

## Success Criteria (Phase 3 Complete)

- ✅ **Gate A:** Retrieval Benchmark baseline saved and stable
- ✅ **Gate B:** Authority reranker deployed; Recall@20 > 0.92 OR MRR > 0.90
- ✅ **Gate C:** Community coverage > 95%
- ✅ **Gate D:** LoRA candidates table > 1,000 real examples
- ✅ **Phase 4 CHR97 Design:** Finalized based on retrieval learnings

**Timeline:** 4 weeks (1 week per gate, with overlap possible)

---

## Execution Order

**This week (Gate A):**
1. ✅ Create `benchmarks/retrieval-100.jsonl`
2. ✅ Create `scripts/benchmark/retrieval-baseline.mjs`
3. ✅ Run baseline (establish reference metrics)
4. ✅ Save baseline to `benchmarks/results/baseline-metrics.json`
5. 📋 **NEXT:** Stub the Authority Reranker (Stage 2 Neo4j expansion)

**Next week (Gate B alpha):**
1. Implement Neo4j community expansion (Stage 2)
2. Implement Neo4j graph expansion (Stage 3)
3. Implement authority score compute (Stage 4)
4. A/B test against baseline (does authority reranking help?)
5. Tune weights if needed

**Week 3 (Gate C):**
1. Analyze community_id NULL records
2. Fuzzy match source_ref → file_path
3. Rerun Rust detectCommunitiesRust with k=30
4. Verify > 95% gate

**Week 4 (Gate D + Phase 3 sign-off):**
1. Wire runtime telemetry → lora_training_candidates
2. Harvest 1,000+ real examples
3. Validate reward scoring
4. Finalize Phase 4 CHR97 design
5. Sign off on Phase 3

---

## Reference

- `ATLAS-STABLE-BASELINES.md` — The golden rule: never touch packet_key, glyph_id, source_ref
- `ATLAS-FREEZE-DECISION.md` — Why ATLAS-1.0 and ATLAS-2.0 are frozen
- `ATLAS-3.0-HYPERRAG-RUNTIME.md` — Full HyperRAG retrieval pipeline design
- `memory/atlas-strategic-freeze-phase-3.md` — Memory record of strategic decision

---

**Status:** Ready for immediate execution  
**Approval:** Architectural freeze confirmed  
**Next checkpoint:** 1 week (Gate A baseline saved + Gate B alpha tested)
