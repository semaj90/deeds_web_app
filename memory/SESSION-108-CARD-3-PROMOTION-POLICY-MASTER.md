---
name: Session 108 Card 3 - Promotion Policy & SOM Contract (Master Objective)
description: CARD 3 - Fix SOM contract, close qdrant_point_id determinism loop, add retrieval-attempt ledger, wire promotion policy, enable ACP tracing
type: project
---

# CARD 3: Promotion Policy & Semantic Compiler Layer — SESSION 108+ ✅ MASTER OBJECTIVE

**Status**: ✅ **BLOCKED PENDING SOM VALIDATION** (design phase ready)

**Strategic Frame** (from architect feedback):
The current system is a "good retrieval stack" but lacks promotion semantics. The missing layer is **promotion policy**, not more raw scoring. Dense cosine (candidate generation) → Hilbert index (locality) → SOM + PageRank (topology promotion) → ACP (only after promotion gate). Currently we have 1,2,3 but no gate at 4.

## Execution Order (Hard Dependencies)

### P1: SOM Contract Fix (Coordinate Clamping)
**Blocker**: 799/400 contradiction means coordinate normalization is broken

**See**: [SESSION-108-P1-SOM-CONTRACT-FIX.md](SESSION-108-P1-SOM-CONTRACT-FIX.md) — detailed audit + recovery plan

**The Problem**:
- SOM grid is strictly 20×20 = 400 cells
- Coordinates must be integers in [0-19]×[0-19]
- Data shows max coordinates up to 799 (out of bounds)
- Root cause: Classification script assigns unclamped coordinates

**The Fix**:
```javascript
// Add deterministic clamping everywhere som_row/som_col are assigned
const som_col = Math.max(0, Math.min(19, Math.floor(rawX)));
const som_row = Math.max(0, Math.min(19, Math.floor(rawY)));
const linear_cell_id = (som_row * 20) + som_col;  // Always [0-399]
```

**Audit Steps**:
1. Query: `SELECT MAX(som_row), MAX(som_col) FROM atlas_packets` → should be 19, 19 (not 799)
2. Find root script: grep for `som_row|som_col` in `scripts/atlas/derive-topology.mjs`
3. Add normalizer to all coordinate assignments
4. Recover invalid rows via SQL UPDATE with LEAST/GREATEST clamping
5. Verify: `SELECT COUNT(DISTINCT (som_row * 20 + som_col))` → must equal 400

**Validation Gate**:
```sql
SELECT COUNT(DISTINCT som_cluster) as unique_clusters FROM atlas_packets;
-- Must return 400 (not 799)

SELECT som_row, som_col, COUNT(*) as count FROM atlas_packets 
WHERE som_cluster IS NOT NULL 
GROUP BY som_row, som_col 
ORDER BY count DESC LIMIT 5;
-- Must show grid coordinates 0-19 × 0-19 (uniform distribution ideal)
```

### P2: Qdrant Point ID Determinism (CARD 2 Extension)
**Blocker**: Tree-node-id propagation needs qdrant_point_id as foreign key

```
Current: 3,262/58,365 packets have qdrant_point_id (5.59% after CARD 2)
Target: 100% of codebase_chunk_index rows have atlas_packets.qdrant_point_id backref

Bridge Fix:
  ✅ Done CARD 2: file-based packets → qdrant_id via source_ref join
  ⏳ Next: non-file packets (proto:, task:, aggregates)
    - Assign qdrant_point_id = NULL (intentional)
    - Mark in Qdrant: not_indexed=true in payload
    - ACP skips when qdrant_point_id IS NULL
  ⏳ Verify: SELECT COUNT(*) FROM atlas_packets WHERE qdrant_point_id IS NOT NULL
    - Acceptance: All indexed packets have the backref
    - No cycles, no duplicates, no orphans

Hard Rule: packet_key ↔ qdrant_point_id is 1:1 bijection for indexed packets
```

**Validation Gate**:
```sql
SELECT COUNT(*) as packets_with_qid FROM atlas_packets WHERE qdrant_point_id IS NOT NULL;
-- For non-file packets (proto:, task:), qdrant_point_id must be NULL
SELECT COUNT(DISTINCT qdrant_point_id) as unique_qid FROM atlas_packets;
-- Must equal packets_with_qid (no duplicates)
```

### P3: Tree-Node-ID Propagation (Postgres → Neo4j → Qdrant)
**Blocker**: HMM classification needs tree_node_id for error cluster ancestry

```
Current: tree_node_id coverage ≈ 65% (from SESSION-105 report)
Target: 100% coverage, synchronized across three stores

Propagation Chain:
  1. Postgres atlas_packets.tree_node_id (canonical)
  2. Neo4j nodes carry tree_node_id as property
  3. Qdrant payload includes tree_node_id + parent_tree_node_id
  4. HMM uses tree_node_id to find error ancestor in SOM grid

Backfill:
  - For packets with NULL tree_node_id: derive from som_cluster
    (SOM cell → tree node in hierarchy)
  - For packets with tree_node_id: sync to Neo4j + Qdrant payload
  - Verify: SELECT COUNT(*) WHERE tree_node_id IS NULL
    Expected: 0
```

**Validation Gate**:
```sql
-- Postgres
SELECT COUNT(*) as null_tree_id FROM atlas_packets WHERE tree_node_id IS NULL;
-- Expected: 0

-- Neo4j: MATCH (n:CodebaseFile) WHERE n.tree_node_id IS NULL RETURN COUNT(n);
-- Expected: 0

-- Qdrant: curl http://127.0.0.1:6333/collections/codebase_chunks_768/points
-- Expected: tree_node_id in payload for all points
```

### P4: AST / Lexical / Concept Coverage (Batch Expansion)
**Blocker**: Concept extraction is 0% (SESSION-105: concept_ids coverage 0%)

```
Current:
  - domain_class: 100% ✅
  - concept_ids: 0% ❌ (not extracted yet)
  - AST details: partial (only for direct code files)
  - Lexical: partial (summary-based, not AST-backed)

Batch Plan (NOT row-by-row):
  1. Extract concepts via LangExtract in parallel batches
     - Batch size: 500 packets, 6 workers
     - Input: packet summary + title
     - Output: concept_ids (Postgres + Qdrant payload)
     - Dry-run: npm run atlas:concepts:extract:dry --batch=500
     - Apply: npm run atlas:concepts:extract:apply --workers=6

  2. Expand AST coverage via ast-grep for code files
     - Batch size: 100 files, 4 workers
     - Input: source_ref (relative_path)
     - Output: ast_symbols, ast_depth, ast_kind
     - Dry-run: npm run atlas:ast:expand:dry --batch=100
     - Apply: npm run atlas:ast:expand:apply --workers=4

  3. Denormalize to Qdrant payload
     - Update codebase_chunks_768 with concept_ids + ast_details
     - Batch size: 1000 chunks
     - Dry-run: npm run atlas:qdrant:payload:sync:dry --batch=1000
     - Apply: npm run atlas:qdrant:payload:sync:apply

Expected Coverage (Session 109 end):
  - domain_class: 100%
  - concept_ids: 90%+ (LangExtract coverage)
  - ast: 85%+ (code files only)
  - lexical: 80%+ (summaries + AST)
```

**Validation Gate**:
```sql
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN concept_ids IS NOT NULL THEN 1 END) as concept_coverage,
  COUNT(CASE WHEN ast_symbols IS NOT NULL THEN 1 END) as ast_coverage,
  COUNT(CASE WHEN lexical_tags IS NOT NULL THEN 1 END) as lexical_coverage
FROM atlas_packets;
-- Expected: ~58K total, 50K+ concepts, 20K+ AST, 40K+ lexical
```

### P5: Retrieval-Attempt Ledger (New Table)
**Blocker**: No tracing → can't learn promotion policy

```
Table: atlas_retrieval_attempts
Columns:
  - attempt_id: UUID (primary key)
  - timestamp: TIMESTAMP
  - query: TEXT (user query or internal probe)
  - query_embedding: vector(384) or NULL
  - candidate_set: UUID[] (top-K before promotion gate)
  - candidate_count: INT
  - stage: ENUM ('dense_cosine', 'hilbert', 'som_promotion', 'acp', 'synthesis')
  - loser_archive: UUID[] (candidates rejected at each stage)
  - winner_promotion: UUID (final selected packet_key)
  - cache_target: ENUM ('redis', 'bifrost', 'none')
  - success: BOOLEAN (was the answer correct/useful?)
  - telemetry: JSONB (latency per stage, confidence scores, etc.)
  - created_by: TEXT ('user', 'test', 'harness')

Index:
  - (timestamp DESC, stage)
  - (winner_promotion)
  - (success, stage)

Usage:
  - Every retrieval attempt logs: candidates → promotion gate → winner → cache
  - Analysis: SELECT stage, COUNT(*), AVG(latency), SUM(CASE WHEN success THEN 1 END) / COUNT(*) AS accuracy FROM atlas_retrieval_attempts GROUP BY stage;
  - Learn: Which stages filter out winners? Which promote noise?
  - Feedback loop: Update promotion policy based on attempt ledger patterns
```

**Validation Gate**:
```sql
CREATE TABLE IF NOT EXISTS atlas_retrieval_attempts (
  attempt_id UUID PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  query TEXT,
  candidate_count INT,
  stage TEXT,
  winner_promotion TEXT,
  success BOOLEAN,
  telemetry JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attempts_timestamp ON atlas_retrieval_attempts(timestamp DESC, stage);

-- Acceptance: table exists, index exists, zero rows (ready for production logs)
SELECT COUNT(*) FROM atlas_retrieval_attempts;
-- Expected: 0 (new table, ready for live logging)
```

### P6: Promotion Policy (Decision Tree)
**Blocker**: Currently all dense-cosine hits → ACP directly (no gate)

```
Current Flow:
  dense cosine top-K → ACP → Gemma4

Desired Flow:
  dense cosine → Hilbert slab filter → SOM promotion gate → ACP → Gemma4

Promotion Policy (pseudocode):
```python
def promotion_gate(candidate: Packet, stage: str) -> bool:
    """
    Return True to promote; False to archive.
    """
    # Hard gates (non-negotiable)
    if candidate.qdrant_point_id is None:
        return False  # Not indexed, can't trust embedding
    if candidate.tree_node_id is None:
        return False  # Not in topology, can't rerank
    
    # Topology promotion (SOM + PageRank blend)
    som_confidence = SOM_GRID[candidate.som_row][candidate.som_col].confidence
    page_rank_score = candidate.page_rank_score or 0.5
    topology_score = 0.6 * som_confidence + 0.4 * page_rank_score
    
    if topology_score < 0.4:
        return False  # Topology doesn't support this candidate
    
    # Concept alignment (soft evidence)
    query_concepts = extract_concepts(query)
    candidate_concepts = candidate.concept_ids or []
    concept_overlap = len(set(query_concepts) & set(candidate_concepts)) / max(len(query_concepts), 1)
    
    if concept_overlap < 0.1:
        # Soft warn (allow but lower confidence)
        candidate.confidence *= 0.7
    
    # HMM soft evidence (error classification)
    if candidate.error_class == "StructureError":
        candidate.confidence *= 0.5  # Soft penalty for repair candidates
    
    # Final gate: confidence threshold
    return candidate.confidence >= 0.3
```

**Implementation Locations**:
  - `src/lib/server/retrieval/promotion-gate.ts` (candidate filter)
  - `src/lib/server/ace/context-assembler.ts` (apply before ACP)
  - `npm run atlas:retrieval-attempt:log` (capture attempts in ledger)
  - `scripts/atlas/analyze-promotion-policy.mjs` (audit effectiveness)

**Validation Gate**:
```
Test 1: Promotion gate rejects packet with qdrant_point_id=NULL
  Input: candidate with qdrant_point_id=NULL
  Expected: promotion_gate() → false
  Status: TBD (implement)

Test 2: Promotion gate accepts packet with topology_score >= 0.4
  Input: candidate with som_cluster=42, page_rank=0.5, confidence=0.8
  Expected: promotion_gate() → true
  Status: TBD (implement)

Test 3: Retrieval-attempt ledger captures decision
  Input: attempt with 10 candidates, 1 promoted to ACP
  Expected: loser_archive=[9 UUID], winner_promotion=[1 UUID]
  Status: TBD (implement)
```

### P7: ACP Loop Closure with Tracing
**Blocker**: ACP doesn't validate that promoted packets are correct

```
Current: ACP receives candidates (no validation)
Desired: ACP validates + traces every dispatch

Loop Closure:
  1. ACP.dispatch(packet_key) → fetch packet envelope from cache or Postgres
  2. Validate: packet_key exists, qdrant_point_id is indexed, tree_node_id in topology
  3. Log to retrieval_attempts: stage='acp', winner_promotion=packet_key
  4. Execute: Gemma4 synthesis
  5. Capture feedback: success=true/false (user confirms)
  6. Update ledger: success boolean
  7. Use ledger to learn: which packets promoted consistently win?

Implementation:
  - `src/lib/server/ace/context-assembler.ts` → add tracing calls
  - `npm run atlas:acp:trace:enable` → toggle tracing (default: on)
  - `npm run atlas:retrieval-attempt:analyze` → audit success rate per promotion gate
  - Feedback: If success < 70%, adjust promotion policy thresholds

Expected Outcome:
  - Zero invalid packet dispatches to ACP
  - Retrieval-attempt ledger shows 80%+ success on promoted packets
  - Promotion policy tunable by threshold adjustment
```

**Validation Gate**:
```
Test 1: ACP receives packet from promotion gate
  Input: promotion_gate(candidate) → true
  Expected: ACP.dispatch() succeeds, ledger logs winner_promotion
  Status: TBD (implement)

Test 2: Invalid packet rejected before ACP
  Input: candidate with tree_node_id=NULL
  Expected: promotion_gate() → false, packet archived, ACP never called
  Status: TBD (implement)

Test 3: Tracing captures success/failure
  Input: user provides feedback on synthesis quality
  Expected: retrieval_attempts.success = true/false recorded
  Status: TBD (implement)
```

## Dependency Graph

```
P1 (SOM Contract)
  ↓
P2 (Qdrant Point ID Determinism) ← CARD 2 SUCCESS
  ↓
P3 (Tree-Node-ID Propagation)
  ↓
P4 (AST/Lexical/Concept Coverage) + P5 (Retrieval-Attempt Ledger)
  ↓
P6 (Promotion Policy)
  ↓
P7 (ACP Loop Closure)
```

## Why This Order?

1. **SOM first**: Broken contract blocks topology promotion entirely
2. **Qdrant determinism next**: Tree-node-ID backref depends on it
3. **Tree-node-ID sync**: Required for HMM ancestry tracking
4. **Coverage expansion + ledger**: Parallel (independent)
5. **Promotion policy last**: Needs all prior data in place
6. **ACP closure final**: Closes feedback loop

## Success Criteria

| P | Metric | Target | Status |
|---|--------|--------|--------|
| P1 | SOM cells | 400 (not 799) | ⏳ TODO |
| P2 | qdrant_point_id coverage | 100% of indexed packets | ✅ PARTIAL (5.59%) |
| P3 | tree_node_id coverage | 100% | ⏳ TODO |
| P4 | concept_ids coverage | 90%+ | ⏳ TODO |
| P5 | retrieval_attempts rows | 1,000+ (test runs) | ⏳ TODO |
| P6 | promotion_gate validation | 7/7 tests pass | ⏳ TODO |
| P7 | ACP trace validation | 7/7 tests pass, 80%+ success | ⏳ TODO |

## Estimated Effort

- P1: 2-3h (audit + rebuild)
- P2: 1-2h (run CARD 2 extension)
- P3: 4-6h (backfill + sync)
- P4: 8-12h (LangExtract + AST, parallel)
- P5: 2-3h (table + index)
- P6: 6-8h (gate logic + tests)
- P7: 4-6h (tracing + closure)

**Total: 27-40h** (Session 108-109 + continuation)

## Related Files to Create/Modify

```
New:
  - src/lib/server/retrieval/promotion-gate.ts (100 lines)
  - src/lib/server/ace/context-assembler.ts (add tracing, 50 lines)
  - src/lib/server/db/schema-retrieval-attempts.ts (60 lines)
  - scripts/atlas/analyze-promotion-policy.mjs (150 lines)

Modify:
  - src/lib/server/db/schema-postgres.ts (add retrieval_attempts table)
  - src/lib/server/ace/context-assembler.ts (add promotion gate call)
  - scripts/atlas/derive-topology.mjs (P1: SOM contract fix)
  - scripts/atlas/backfill-qdrant-point-id-bridge.mjs (P2 extension)
```

## Next Immediate Action (Session 108+)

1. **Audit SOM contract** (P1):
   ```bash
   SELECT COUNT(DISTINCT som_cluster) FROM atlas_packets WHERE som_cluster IS NOT NULL;
   # If ≠ 400 → investigate derive-topology.mjs
   ```

2. **Run CARD 2 full backfill** (P2 extension):
   ```bash
   npm run atlas:qdrant-bridge:apply  # No limit, all packets
   ```

3. **Decide P3-P7 sequencing** based on P1 result

---

**Status**: ✅ **DESIGN READY** | ⏳ **IMPLEMENTATION BLOCKED on P1 (SOM audit)**

**Blocking**: Everything downstream depends on SOM contract fix

**Blocked By**: None (P1 is the root)
