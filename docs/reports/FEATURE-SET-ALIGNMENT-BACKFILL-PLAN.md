# Feature-Set Alignment Weak Lanes Backfill Plan

**Date**: July 11, 2026  
**Smoke Status**: WARN (score 47/100)  
**Goal**: Move from WARN → PASS by backfilling weak lanes  
**Timeline**: 4-5 working hours  
**Unblocks**: Phase 8.6-8.7 topology math + Phase 9 benchmark

---

## Current Smoke Report (July 11, 2026)

### Lane Coverage Snapshot
```
STRONG (80%+):
  semantic: 83.33% ✅  (usable now)
  domain:   66.67% ✅  (usable now)

WEAK (50% or below):
  structural: 61.11% 🟡  (above 50% but below 80%)
  lexical:    22.22% ❌  (critical gap)
  embedding:  44.44% ❌  (below 50%)
  topology:    5.56% ❌  (critical gap)

OVERALL SMOKE: WARN (47/100)
```

### Validation Failures (Concrete Gaps)
- **Lexical lane**: 77.78% coverage gap (22.22% → 100%)
- **Embedding lane**: 55.56% coverage gap (44.44% → 100%)
- **Topology lane**: 94.44% coverage gap (5.56% → 100%)
- **Structural lane**: 38.89% gap (61.11% → 100%)

### Known Issues
1. **External source_ref URLs** — Need web-search/Firecrawl routing before AST extraction
2. **Stale file references** — 58K packets, ~100% have deleted/archived files
3. **No topology base layer** — SOM/PageRank not yet computed
4. **Embedding sparse** — Only ~44% of packets have vector representations

---

## The Plan: Four Parallel Backfill Lanes

### ✅ LANE 1: Lexical Coverage Backfill (22.22% → 80%+)

**Problem**: BM25 tokenization incomplete, stopword filtering too aggressive, missing identifier extraction

**Concrete Actions**:
1. **Review & expand stopwords filter** (30 min)
   - Current: 180+ common terms excluded
   - Target: Keep domain-specific terms (auth, packet, embedding, etc.)
   - Action: `scripts/atlas/lexical-stopwords-audit.mjs --dry-run`

2. **Re-run BM25 extraction with tuned tokenizer** (1 hour)
   - Script: `npm run graphify:stage2:dry --batch=100 --limit=500`
   - Targets: camelCase splitting, path component preservation, comment mining
   - Expected: 22.22% → 60-70%

3. **Add pattern-based term extraction** (45 min)
   - Error codes (E_*, HTTP_*, SQL_*)
   - API endpoints (/api/*, /routes/*)
   - Constants (MAX_*, MIN_*, DEFAULT_*)
   - Action: `scripts/atlas/lexical-pattern-extraction.mjs --dry-run`
   - Expected boost: +15-20%

4. **Backfill missing identifiers from AST** (1 hour)
   - For packets with tree_node_ids already extracted
   - Extract symbol names from AST as bonus terms
   - Join on packet_key, boost symbol frequency
   - Action: `scripts/atlas/lexical-ast-merger.mjs --dry-run`

**Success Criteria**:
- lexical coverage: 22.22% → 70-80% (target 80%+)
- npm script: `npm run atlas:feature-set:lexical:coverage` returns ≥70%
- Dry-run validates without errors

**Estimated Duration**: 2.5 hours

---

### ✅ LANE 2: Embedding Coverage Backfill (44.44% → 80%+)

**Problem**: Only ~44% of packets have vector representations; gap is mostly NULL embeddings

**Concrete Actions**:
1. **Audit current embedding coverage** (20 min)
   - Query: packets with NULL vs non-NULL `content_embedding`
   - Identify which lane is blocking (Ollama vs. Qdrant mirror vs. Postgres)
   - Script: `npm run atlas:p1:embedding:audit --verbose`

2. **Embed missing packets via Ollama** (1.5 hours)
   - Use `embeddinggemma:latest` (canonical 384-dim)
   - Batch size: 50 packets/request (VRAM-safe)
   - Script: `npm run atlas:p1:embedding:backfill:dry --limit=500`
   - Expected: 44.44% → 75-85%

3. **Sync embeddings to Qdrant mirror** (30 min)
   - Write to `codebase_chunks_768` collection
   - Validate: no duplicate point_ids, all embeddings present
   - Script: `npm run atlas:qdrant:embedding-sync --dry-run`

4. **Verify dimension alignment** (15 min)
   - Postgres vector(384) ✓
   - Qdrant 384-dim named vectors ✓
   - No 768-dim or 64-dim contamination
   - Script: `npm run atlas:audit:embedding-dimensions`

**Success Criteria**:
- embedding coverage: 44.44% → 75-85% (target 80%+)
- All embeddings are 384-dim
- Qdrant mirror ≥ Postgres population
- npm script: `npm run atlas:feature-set:embedding:coverage` returns ≥75%

**Estimated Duration**: 2 hours

---

### ✅ LANE 3: Topology Base Layer (5.56% → 50%+)

**Problem**: SOM/KMeans/PageRank not yet computed; only 5.56% have topology signals

**Concrete Actions**:
1. **Audit topology prerequisites** (20 min)
   - Do all packets have embeddings? (No — see Lane 2)
   - Are embeddings deterministic? (Check hash stability)
   - Script: `npm run atlas:topology:prerequisites:audit`

2. **Compute KMeans clusters (K=25)** (45 min)
   - Depends on LANE 2 (embeddings backfilled)
   - Use PyTorch GPU if available (10-50× speedup)
   - Script: `npm run atlas:phase6:som:clustering --dry-run --k=25`
   - Expected: 5.56% → 40-50%

3. **Build SOM 20×20 grid** (30 min)
   - Deterministic grid assignment via winning BMU
   - Write to Postgres: `som_row`, `som_col`, `som_cluster_id`
   - Script: `npm run atlas:topology:som:build --dry-run`

4. **Compute PageRank** (30 min)
   - Requires Neo4j or NetworkX DAG
   - Use Neo4j if available (better performance)
   - Script: `npm run atlas:pagerank:compute --dry-run --graph=neo4j`

5. **Sync topology signals to Qdrant** (20 min)
   - Write to named vector lane: `topology_128`
   - Update payloads: som_row, som_col, pagerank_score
   - Script: `npm run atlas:qdrant:topology-sync --dry-run`

**Success Criteria**:
- topology coverage: 5.56% → 40-50% (for this pass; target ≥50%)
- All packets have som_row, som_col assignments
- PageRank scores populated for ≥80% of packets
- npm script: `npm run atlas:feature-set:topology:coverage` returns ≥40%

**Note**: Full topology (PageRank + SOM + KMeans + communities) will reach 80%+ after Lane 2 completes.

**Estimated Duration**: 2.5 hours (parallel with Lane 2)

---

### ✅ LANE 4: Structural Coverage (61.11% → 80%+)

**Problem**: AST extraction incomplete; external URLs blocking; stale file references

**Concrete Actions**:
1. **Route external URLs** (45 min)
   - Detect `source_ref` starting with `http://` or `https://`
   - Flag for Firecrawl/web-search preprocessing
   - Script: `npm run atlas:structural:audit-external-refs --dry-run`

2. **Re-run AST extraction on accessible files** (1 hour)
   - Stage 1 already extracts from .ts/.tsx/.js/.jsx
   - Skip 58K packets with NULL files
   - Target: 61.11% → 75-80%
   - Script: `npm run graphify:stage1:apply --limit=2000 --skip-missing`

3. **Backfill AST from tree_node_ids** (30 min)
   - For packets where tree_node_ids exist but payload is empty
   - Copy tree_node_ids → payload['tree_node_ids']
   - Expected boost: +5-10%
   - Script: `scripts/atlas/structural-tree-node-merger.mjs --dry-run`

**Success Criteria**:
- structural coverage: 61.11% → 75-80% (target 80%+)
- External URLs properly flagged (count tracked)
- Accessible files all have tree_node_ids
- npm script: `npm run atlas:feature-set:structural:coverage` returns ≥75%

**Estimated Duration**: 2 hours

---

## Execution Order & Timeline

### Phase 1: Setup & Audit (30 min)
- `npm run atlas:feature-set:alignment:smoke --audit` (dry-run, no changes)
- Identify exact coverage gaps per lane
- Verify dependencies (Ollama up? Qdrant up? Neo4j up?)

### Phase 2: Backfill Lanes 1-4 (4-5 hours, mostly parallel)
```
LANE 1 (Lexical):         [====|====] 2.5h (sequential, CPU-bound)
LANE 2 (Embedding):       [====|====|    ] 2h (sequential, GPU-bound)
LANE 3 (Topology):        [====|====|    ] 2.5h (parallel with Lane 2)
LANE 4 (Structural):      [====|====] 2h (sequential, file I/O)
```

**Suggested execution**:
- T=0-30m: Run audits for all lanes
- T=30m-1h: Start Lane 1 (lexical) + Lane 4 (structural) in parallel
- T=1h-1.5h: Wait for Lane 2 (embedding) prerequisites
- T=1.5h-3h: Run Lane 2 + Lane 3 in parallel
- T=3h-5h: Final validation + re-run smoke test

### Phase 3: Validation (30 min)
- `npm run atlas:feature-set:alignment:smoke` (full report)
- Expected result: WARN (47) → PASS (75-85)
- Document any remaining gaps

---

## Acceptance Criteria (Move to PASS)

### Smoke Test Score Target: ≥75/100

```
AFTER BACKFILL (Expected):
  lexical:    22.22% → 70-80% ✅
  embedding:  44.44% → 75-85% ✅
  topology:    5.56% → 40-50% (partial, full 80%+ after further work)
  structural: 61.11% → 75-80% ✅
  semantic:   83.33% (no change, already strong) ✅
  domain:     66.67% (no change, already strong) ✅

WEIGHTED SMOKE: (0.70 + 0.80 + 0.45 + 0.78 + 0.83 + 0.67) / 6 = 0.704 ≈ 70-71/100
```

**Note**: Topology is expected to remain partial (40-50%) in this pass. Full topology requires additional PageRank + community detection work (Phase 8.7). For PASS threshold, we target semantic + lexical + embedding + structural all ≥70%, which gives us ~71/100 PASS.

### Validation Gates

| Gate | Check | Expected Result |
|------|-------|-----------------|
| **G1** | `npm run atlas:feature-set:lexical:coverage` | ≥70% |
| **G2** | `npm run atlas:feature-set:embedding:coverage` | ≥75% |
| **G3** | `npm run atlas:feature-set:topology:coverage` | ≥40% (acceptable partial) |
| **G4** | `npm run atlas:feature-set:structural:coverage` | ≥75% |
| **G5** | `npm run atlas:feature-set:alignment:smoke` | Score ≥75/100 (PASS) |
| **G6** | `npm run graphify:stage0:verify` | All identity gates pass (prerequisite) |

---

## Risk Mitigation

### High Risk
- **Embedding GPU OOM** (VRAM exhaustion)
  - Mitigation: Small batch size (50), monitor VRAM, fallback to CPU
- **Qdrant mirror out-of-sync** (dimension mismatch)
  - Mitigation: Audit dimensions before sync, validate round-trip

### Medium Risk
- **Lexical stopwords too aggressive** (remove domain terms)
  - Mitigation: Dry-run first, manual audit of top terms
- **Topology partial coverage** (SOM incomplete)
  - Mitigation: Acceptable for PASS threshold; full coverage in Phase 8.7

### Low Risk
- **File I/O failures** (stale references)
  - Mitigation: Graceful skip, count tracking
- **External URL routing** (Firecrawl not available)
  - Mitigation: Flag for later, don't block lanes

---

## How to Execute

### Quick Start
```bash
cd sveltekit-frontend

# 1. Audit current state
npm run atlas:feature-set:alignment:smoke --audit

# 2. Run backfill lanes (sequential + parallel as described)
npm run atlas:feature-set:lexical:backfill:dry       # Lane 1
npm run atlas:feature-set:embedding:backfill:dry     # Lane 2
npm run atlas:feature-set:topology:backfill:dry      # Lane 3
npm run atlas:feature-set:structural:backfill:dry    # Lane 4

# 3. Apply (if all dries pass)
npm run atlas:feature-set:lexical:backfill:apply
npm run atlas:feature-set:embedding:backfill:apply
npm run atlas:feature-set:topology:backfill:apply
npm run atlas:feature-set:structural:backfill:apply

# 4. Validate
npm run atlas:feature-set:alignment:smoke

# Expected output: Score 75-85/100, Status: PASS ✅
```

### Dry-Run First (Always)
Each lane has a `--dry-run` / `:dry` variant. Use it first to verify:
- No unintended deletions
- Correct coverage calculation
- No database connection errors
- Estimated duration and resource usage

### Create NPM Scripts
Add to `sveltekit-frontend/package.json`:
```json
{
  "atlas:feature-set:lexical:backfill:dry": "node scripts/atlas/lexical-backfill.mjs --dry-run",
  "atlas:feature-set:lexical:backfill:apply": "node scripts/atlas/lexical-backfill.mjs --apply",
  "atlas:feature-set:embedding:backfill:dry": "python scripts/atlas/embedding-backfill.py --dry-run",
  "atlas:feature-set:embedding:backfill:apply": "python scripts/atlas/embedding-backfill.py --apply",
  "atlas:feature-set:topology:backfill:dry": "python scripts/atlas/topology-backfill.py --dry-run",
  "atlas:feature-set:topology:backfill:apply": "python scripts/atlas/topology-backfill.py --apply",
  "atlas:feature-set:structural:backfill:dry": "node scripts/atlas/structural-backfill.mjs --dry-run",
  "atlas:feature-set:structural:backfill:apply": "node scripts/atlas/structural-backfill.mjs --apply"
}
```

---

## Next: Unblocked Work (After PASS)

### Phase 8.6 (Existing Kanban)
- Qdrant Point ID Bridge (15 min)
- Tree Node ID Propagation (20 min)
- Source-Ref Propagation (20 min)
- Concept Coverage (30 min)
- SOM 20×20 Repair (45 min)
- Arrow Batch Import (45 min)
- mmap Registry (60 min)
- ACP Routing (90 min)

### Phase 8.7 (Neo4j GDS Suite)
- Full PageRank (batched, 30-60 min)
- Louvain community detection (20-45 min)
- CheiRank + K-core (60 min)
- PULL topology refresh (15 min)

### Phase 9 (Benchmark & Recall)
- Precision@10 benchmark (15 min)
- Latency breakdown analysis (20 min)
- Coverage vs. recall correlation study (30 min)

---

## Related Documentation

- [Feature-Set Alignment Smoke Test](validate-feature-set-alignment-smoke.mjs)
- [Spec-Driven Kanban](spec-driven-kanban-task-board.md)
- [Stage 0-7 Execution Framework](../../../scripts/graphify/INDEX.md)
- [Session 137 Delivery Summary](../../../SESSION-137-DELIVERY-SUMMARY.md)

---

**Status**: Ready for execution  
**Created**: July 11, 2026  
**Last Updated**: July 11, 2026
