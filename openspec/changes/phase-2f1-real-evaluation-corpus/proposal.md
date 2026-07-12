# Phase 2F.1: Real Evaluation Corpus for Multi-Signal Retrieval

## Why This Change Is Needed

The original Phase 2F evaluation design used **synthetic packet_key values** (e.g., `'typescript:generic:types'`) as ground-truth expectations. These synthetic IDs do not exist in the 52,417-row `codebase_chunk_index` table. This created a **circular self-grading problem**: the retrieval system generated its own labels via consensus between three signals (Dense, Lexical, RRF), then measured itself against those same labels. As a result, all three signals appeared equally strong (0.67+ average relevance) even though they were only confirming each other.

**The core issue:** A retrieval system cannot objectively grade itself using agreement among its own outputs. All consensus-based metrics are self-confirming and cannot distinguish true quality from mutual hallucination.

## What Changes

This change pivots from synthetic ground-truth to a **real evaluation corpus** grounded in actual indexed chunks:

1. **Real Evaluation Corpus Schema**
   - `evaluation_queries` table: 50–100 deterministic queries with diverse intent (code declarations, route manifests, schema lookups, test discovery)
   - `evaluation_relevance` table: mapping queries to real `chunk_id` (UUID from `codebase_chunk_index.id`) with graded relevance (0–3 scale) and provenance metadata

2. **Deterministic Judgment Generation**
   - Judgments extracted from three canonical sources:
     - **AST Facts**: "Where is function X defined?" → chain to declaration chunk via tree-sitter symbol location
     - **Route Manifests**: "Which route handles evidence upload?" → chain to `+server.ts` file path
     - **PostgreSQL Schema**: "What schema stores packet identity?" → chain to `schema-postgres.ts` table definition
     - **Test Manifests**: "Which test validates HyperRAG packet RPC?" → chain to test file + line number
   - Each judgment carries provenance: source type (AST/route/schema/test), extractor version, confidence

3. **FeatureEnvelope Contract**
   - Unified interface for all retrieval signals (Dense, Lexical, AST, RRF fusion)
   - Each signal independently tracks: rank, score, relevance_grade, confidence
   - RRF fusion combines signals with deterministic weight and produces final rank/score
   - Enables per-signal ablation: "What if we remove Lexical?" "What if we weight RRF 0.6 Dense + 0.4 Lexical?"

4. **Ablation Study Runs**
   - Dense-only baseline
   - Lexical-only baseline
   - RRF with equal weights (0.33 each) — current production configuration
   - RRF dense-heavy (0.50 Dense + 0.25 Lexical + 0.25 AST)
   - RRF lexical-heavy (0.25 Dense + 0.50 Lexical + 0.25 AST)
   - AST-only baseline (new lane, Phase 2F.2)

## New Capabilities

- **real-evaluation-corpus**: Real queries and chunk mappings, not synthetic labels
- **deterministic-ast-judgments**: Leverage tree-sitter + ast-grep to ground truth in code structure
- **deterministic-route-judgments**: Map route queries to actual `+page.server.ts` and `+server.ts` files
- **deterministic-schema-judgments**: Map schema queries to `schema-postgres.ts` table/column definitions
- **deterministic-test-judgments**: Map test queries to test file locations and test IDs
- **feature-envelope-contract**: Unified FeatureEnvelope interface enabling per-signal analysis
- **rrf-ablations**: A/B test RRF weights and lane contributions (7 configurations)

## Impact

**Retrieval Quality Measurement Becomes Objective**:
- Before: All signals self-confirm → metrics are meaningless
- After: Judgments grounded in actual code/routes/schemas/tests → metrics are valid

**Each Signal's True Contribution Is Visible**:
- Before: Dense + Lexical + RRF all show ~0.67 NDCG@10 (circular)
- After: Dense may show 0.55, Lexical 0.62, RRF 0.71 → RRF genuinely wins

**Enables Data-Driven Tuning**:
- Ablation results guide next Phase 2F phases (Phase 2F.2: add AST, Phase 2F.3: add GPU rerank, Phase 2F.4: route to recommendation engine)
- RRF weight configuration becomes evidence-based, not guessed

**Supports Production Confidence**:
- Phase 2F.1 validation passes → Phase 2G Langfuse tracing wires telemetry
- Phase 2H ClickHouse warehouse collects production retrieval events
- Phase 2I adaptive routing engine routes by lane based on real metrics

---

## Implementation Acceptance Criteria

1. ✅ `evaluation_queries` table created with 50+ diverse CS/technical queries (TypeScript, JavaScript, Go, CUDA, networking)
2. ✅ `evaluation_relevance` table created with real chunk_id mappings and graded relevance (0–3)
3. ✅ Provenance metadata captured (source_type, extractor_version, confidence) for every judgment
4. ✅ FeatureEnvelope interface defined and used by all three retrieval lanes
5. ✅ Phase 2F evaluation runner updated to:
   - Read real ground-truth from database (not synthetic consensus)
   - Compute IR metrics per signal and per ablation configuration
   - Store results in `phase2f_evaluation_results` with ablation_id and lane_name
6. ✅ All 7 ablation runs execute successfully with valid metrics (no NaN/Inf)
7. ✅ Results show clear differentiation between lanes (not all ~0.67)
