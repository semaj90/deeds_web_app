## Context

Phase 2F evaluation currently runs 50 queries against Dense/Lexical/RRF signals and measures their quality by comparing retrieved results to synthetic packet_key expectations. The synthetic keys don't exist in `codebase_chunk_index`, creating a circular evaluation where all three signals self-confirm via consensus scoring. This means metrics (NDCG@10, MAP, MRR) are meaningless — there's no objective ground-truth to validate against.

**Current State:**
- Dense: Qdrant 768-dim ANN search on `codebase_chunks_768` collection
- Lexical: PostgreSQL FTS on `codebase_chunk_index` with tsvector
- RRF: Reciprocal Rank Fusion combining Dense + Lexical with k=60
- All retrieve real `chunk_id` (UUID from `codebase_chunk_index.id`)
- But ground-truth expectations use synthetic `packet_key` values (e.g., `'typescript:generic:types'`) that never match actual retrieval results
- Evaluation still runs, but grades all three signals by their agreement, not by actual relevance

**New State:**
- `evaluation_queries` table: 50+ real CS/technical queries
- `evaluation_relevance` table: mappings to real chunk_id (or derived artifact locations) with graded relevance (0–3) and provenance
- Provenance: source_type ∈ {AST, route, schema, test}, extractor_version, confidence
- FeatureEnvelope: unified signal representation enabling per-lane analysis and ablation studies
- 7 ablation configurations tested independently with proper IR metrics

## Goals / Non-Goals

**Goals:**
1. Establish objective ground-truth grounded in actual code structure (not synthetic consensus)
2. Measure true signal quality differentiation (Dense vs Lexical vs RRF should show real gaps)
3. Enable data-driven RRF weight tuning via 7 ablation configurations
4. Create foundation for Phase 2G (Langfuse tracing), Phase 2H (ClickHouse analytics), Phase 2I (adaptive routing)
5. Validate that current RRF configuration (equal weights 0.33 each) is optimal or identify better weights

**Non-Goals:**
- Implement GPU reranking (Phase 2F.3 work)
- Train ML model for weight optimization (Phase 2F.5 research track)
- Wire Langfuse tracing (Phase 2G work)
- Build ClickHouse warehouse (Phase 2H work)
- Implement adaptive routing (Phase 2I work)

## Decisions

### Decision 1: Ground-Truth Source (Provenance-Grounded, Not Consensus)

**Choice:** Extract ground-truth from four canonical sources: AST declarations, route manifests, PostgreSQL schemas, test files.

**Rationale:**
- Each source is deterministic and verifiable via code inspection
- AST → "where is function X defined?" links to tree-sitter declaration location
- Routes → "which route handles Y?" maps to actual +page.server.ts file
- Schema → "which table stores Z?" points to schema-postgres.ts definition
- Tests → "which test validates W?" references test file + line number
- Each judgment carries provenance metadata (source_type, extractor_version, confidence) enabling audits

**Alternatives Considered:**
- Operator manual labeling: Would take weeks for 50+ queries; hard to scale. Chosen provenance approach is faster and auditable.
- ML consensus (current v2 approach): Circular self-grading, meaningless metrics. Rejected.
- Hybrid (provenance + human review): Phased approach — provenance-first now, operator review in Phase 2F.2.

### Decision 2: Relevance Scale and Encoding

**Choice:** 4-point relevance scale (0–3): 0=non-relevant, 1=marginally relevant, 2=relevant, 3=highly relevant.

**Rationale:**
- Coarse enough to assign deterministically from provenance sources without ambiguity
- Fine enough to show differentiation between signals (e.g., Lexical might score 2.0, Dense 2.5, RRF 2.7)
- Aligns with standard IR evaluation (TREC grading uses 0-3)
- Simple to encode in schema as SMALLINT

**Alternatives:**
- Binary (0–1): Too coarse, loses signal differentiation. Rejected.
- Fine-grained (0–5): Too many gradations for provenance-only extraction (would require operator review). Deferred to Phase 2F.2.

### Decision 3: FeatureEnvelope Interface and Per-Signal Tracking

**Choice:** Unified FeatureEnvelope struct tracking rank, score, grade, confidence per signal independently. RRF blend is a derived signal (computed from Dense/Lexical grades, not merged in advance).

**Rationale:**
- Enables per-signal ablation: "Remove Lexical, re-run RRF" — simple weight adjustment
- Enables signal comparison: Dense top-10 vs Lexical top-10 vs RRF top-10 side-by-side
- Supports Phase 2F.2 (add AST lane): Just add another FeatureEnvelope component
- RRF computed as final blend of independent signals (not merged before evaluation)

**Schema:**
```typescript
interface FeatureEnvelope {
  chunk_id: string;        // UUID from codebase_chunk_index.id
  query_id: string;        // From evaluation_queries.id
  dense_rank: number;      // 1-20, from Qdrant ANN
  dense_score: number;     // Cosine similarity
  dense_grade: number;     // 0-3, from evaluation_relevance
  dense_confidence: number; // 0-1
  
  lexical_rank: number;    // 1-20, from PG FTS
  lexical_score: number;   // ts_rank score
  lexical_grade: number;   // 0-3, from evaluation_relevance
  lexical_confidence: number;
  
  rrf_rank: number;        // Computed from RRF fusion
  rrf_score: number;       // RRF combined score
  rrf_grade: number;       // Same as Dense/Lexical (not merged)
  rrf_confidence: number;
  
  ast_rank?: number;       // Optional, Phase 2F.2
  // ... repeat for AST
}
```

### Decision 4: Ablation Study Configurations

**Choice:** 7 independent evaluation runs with different signal weightings and lane selections:
1. Dense only (semantic signal strength)
2. Lexical only (keyword/BM25 strength)
3. AST only (code structure strength) — Phase 2F.2
4. RRF equal weights (0.33 Dense + 0.33 Lexical + 0.34 AST) — current production
5. RRF dense-heavy (0.50 Dense + 0.25 Lexical + 0.25 AST)
6. RRF lexical-heavy (0.25 Dense + 0.50 Lexical + 0.25 AST)
7. RRF (Dense + Lexical only, no AST; 0.50 Dense + 0.50 Lexical) — Phase 2F.1 baseline

**Rationale:**
- Single-signal lanes (1–3) show intrinsic quality of each
- Config 4 is current production (can validate or improve)
- Configs 5–6 test weight sensitivity
- Config 7 is immediate implementation (Dense + Lexical only, AST deferred to Phase 2F.2)
- Each run stores results with `ablation_id` + `lane_name` for independent analysis

**Storage:**
```sql
phase2f_evaluation_results (
  query_id UUID,
  ablation_id INT,     -- 1-7, enum-like
  ablation_name VARCHAR, -- 'dense-only', 'rrf-equal', etc.
  lane_name VARCHAR,    -- 'dense', 'lexical', 'rrf'
  precision_at_5 REAL,
  precision_at_10 REAL,
  recall_at_5 REAL,
  recall_at_10 REAL,
  recall_at_20 REAL,
  mrr REAL,
  ndcg_10 REAL,
  map REAL,
  PRIMARY KEY (query_id, ablation_id, lane_name)
)
```

### Decision 5: Evaluation Query Diversity

**Choice:** 50+ queries split across 5 domains (programming-languages, web-markup, networking, architecture, algorithms) with queries targeting code declarations, route manifests, schema lookups, test discovery.

**Rationale:**
- Broad coverage avoids domain-specific overfit
- Mixed intent types (where-is-it, what-does-it, explain-structure) show signal strengths
- CS/technical domain (not legal) avoids confusion with core Legal AI feature
- 50 queries is manageable for provenance extraction; 100+ deferred to Phase 2F.2

## Risks / Trade-offs

**[Risk: Provenance Extraction Errors]**
→ AST declaration might link to wrong chunk if same function name appears in multiple files
→ *Mitigation:* Store full location context (file_path + line_number + source_ref); prioritize definition over usage; operator review Phase 2F.2

**[Risk: Schema Queries Ambiguous]**
→ "What table stores X?" could map to multiple tables (e.g., both codebase_chunk_index and atlas_packets have embeddings)
→ *Mitigation:* Canonical mapping: ask "canonical truth source" specifically; document per query

**[Risk: 50 Queries Not Statistically Significant]**
→ TREC uses 50-100 queries per track; we're at lower bound. Variance in metrics will be high.
→ *Mitigation:* Phase 2F.2 increases to 100+ queries; 50 is MVP to validate approach

**[Risk: Ablation Study Overhead]**
→ 7 runs × 50 queries = 350 evaluations. Each Qdrant search ~50ms + lexical search ~100ms + metric computation ~10ms = ~15–20s total per ablation
→ *Mitigation:* Cache embeddings and search results; run ablations in parallel; total time ~2–3 minutes acceptable for one-time baseline

**[Trade-off: Grade Coarseness vs Operator Burden]**
→ 0–3 scale requires binary decisions per query; harder to express "almost relevant" nuances
→ *Mitigation:* Confidence scores (0–1) capture uncertainty; Phase 2F.2 adds operator review for high-variance queries

## Migration Plan

**Phase 2F.1a (Schema):**
- Create `evaluation_queries` table with query_id, query, domain, difficulty
- Create `evaluation_relevance` table with query_id, chunk_id, grade (0–3), source_type, extractor_version, confidence
- Add ablation_id and lane_name columns to `phase2f_evaluation_results`

**Phase 2F.1b (Provenance Extraction):**
- Script `extract-evaluation-corpus.mjs`: AST walk → declarations, route scan → +page.server.ts files, schema parse → table defs, test scan → test IDs
- Populate evaluation_queries and evaluation_relevance via deterministic extraction
- Manual review spot-checks: sample 10 queries, verify chunks are correct

**Phase 2F.1c (Evaluation Runner Update):**
- Update `phase2f-evaluation-runner.mts` to read real ground-truth from evaluation_relevance
- Compute IR metrics per signal and per ablation configuration
- Store results in phase2f_evaluation_results with ablation_id and lane_name

**Phase 2F.1d (Validation & Reporting):**
- Run 7 ablation studies in sequence
- Generate comparison report: NDCG@10 for each ablation, delta from baseline
- Determine optimal RRF weights for Phase 2F.2+

**Rollback:**
- Keep old synthetic evaluation runner as `phase2f-evaluation-runner-v2-consensus.mts` for reference
- No schema rollback needed; new tables are additive
- If real evaluation metrics show degradation (e.g., RRF NDCG@10 lower than expected), investigate root cause before Phase 2F.2

## Open Questions

1. **Are 50 queries sufficient for statistical significance?** → Proceed with 50 as MVP; Phase 2F.2 increases to 100
2. **Should AST lane be included in baseline RRF (config 7), or deferred to Phase 2F.2?** → Deferred; Phase 2F.1 is Dense + Lexical only
3. **How to handle chunk_id → packet_key mapping for reporting?** → Store as metadata in evaluation_relevance; ACE context assembly handles join later
4. **Should operator review provenance judgments before baseline metrics are published?** → Phase 2F.1 uses provenance as-is; Phase 2F.2 adds operator review loop
