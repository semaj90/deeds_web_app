## 1. Infrastructure (Database Schema)

- [x] **2F1-1A1 Locate and validate FeatureEnvelope contract**
  - Stage: validated
  - Evidence:
    - `src/lib/server/retrieval/feature-envelope.ts` (502 lines)
  - Verified exports:
    - `FeatureEnvelopeSchema` (Zod schema with chunk_id, query_id, optional signals)
    - `DenseSignalSchema`, `LexicalSignalSchema`, `ASTSignalSchema`, `MetadataSignalSchema`, `AuthoritySignalSchema`, `RecencySignalSchema`
    - `ABLATION_CONFIGS` (6 configurations: dense_only, lexical_only, rrf_50_50, dense_heavy, lexical_heavy, all_signals)
    - `computeRRFScore()`, `computeWeightedScore()`, `applyAblationConfig()`
    - Type guards: `isValidFeatureEnvelope()`, `parseFeatureEnvelope()`
  - Decision: Reuse existing contract; do not recreate
  - Commit: TBD (discovery phase)
  - Validation: import resolution confirmed ✅

- [x] **2F1-1A2 Create evaluation_results migration**
  - Status: completed
  - Depends on: `2F1-1A1` ✅
  - Target:
    - `drizzle/0055_evaluation_results.sql`
    - Add `evaluation_results` table per contract corrections
  - Acceptance:
    - ✅ uses canonical `packet_key` (not chunk_id as authority)
    - ✅ records `corpus_version` for snapshot freezing
    - ✅ stores per-signal FeatureEnvelope as JSONB
    - ✅ supports all 6 declared ablations via ablation_id
    - ✅ RRF formula deterministic (k=60, one-indexed ranks)
  - Validation:
    - `npm run drizzle:check` passes
    - schema inspection confirms columns
    - rollback test passes
  - Commit: TBD (migration file created)

- [x] **2F1-1A3 Create evaluation_evidence migration**
  - Status: completed
  - Depends on: `2F1-1A2` ✅
  - Target:
    - `drizzle/0056_evaluation_evidence.sql` (deterministic extraction provenance)
  - Acceptance:
    - ✅ packet_key, source_ref, query_id, evidence_type (ast/route/schema/test/semantic)
    - ✅ evidence_detail JSONB for type-specific structured detail
    - ✅ extractor_version, extractor_name for version tracking
    - ✅ confidence (0.0-1.0) for extraction reliability
    - ✅ separates evidence extraction (deterministic) from judgment (human)
  - Validation:
    - migration applies cleanly
    - indexes on query_id, evidence_type, extractor for query efficiency
  - Commit: TBD (migration file created)

- [x] **2F1-1A4 Create evaluation_relevance migration (corrected schema)**
  - Status: completed
  - Depends on: `2F1-1A3` ✅
  - Target:
    - `drizzle/0057_evaluation_relevance.sql` (human judgment with packet_key authority)
  - Acceptance:
    - ✅ CORRECTED from 0052: uses packet_key (not chunk_id) as canonical authority
    - ✅ query_id, packet_key, corpus_version identity
    - ✅ relevance_grade (0-3): 0=not relevant, 1=marginal, 2=relevant, 3=highly relevant
    - ✅ judgment_source enum (human, synthetic, derived, audit)
    - ✅ evidence_ids UUID[] array linking to evaluation_evidence rows
    - ✅ content_hash for audit trail of evidence changes
    - ✅ PRIMARY KEY (query_id, packet_key, corpus_version) enforces uniqueness per corpus
    - ✅ confidence (0.0-1.0) for judgment reliability
  - Validation:
    - migration applies cleanly
    - UNIQUE constraint prevents double-judging same query/packet/corpus
    - schema review confirms separation of evidence from judgment
  - Commit: TBD (migration file created)

- [x] **2F1-1A5 Create evaluation_corpora manifest migration**
  - Status: completed
  - Depends on: `2F1-1A4` ✅
  - Target:
    - `drizzle/0054_evaluation_corpora.sql` (frozen corpus snapshots)
  - Acceptance:
    - ✅ corpus_version TEXT PRIMARY KEY
    - ✅ git_commit, embedding_model, embedding_dimension, packet_count, qdrant_collection, qdrant_point_count
    - ✅ embedding_model_version for model versioning
    - ✅ query_set_hash, judgment_set_hash for reproducibility audit
    - ✅ created_at timestamp for manifest lifecycle tracking
  - Validation:
    - migration applies
    - sample manifest insertable
    - indexes on git_commit, embedding_model, created_at for query performance
  - Commit: TBD (migration file created)

## 2. Ground-Truth Extraction Scripts

- [x] 2.1 Create `extract-evaluation-corpus.mts` script with four extractors: AST walker, route scanner, schema parser, test file scanner
  - Status: completed
  - Target: `scripts/atlas/extract-evaluation-corpus.mts` (650 lines)
  - Implementation: Four classes (AstExtractor, RouteExtractor, SchemaExtractor, TestExtractor)
  - AST walker: tree-sitter TypeScript parser, function/variable/type declarations, confidence 0.95
  - Route scanner: +page.server.ts and +server.ts handlers, confidence 0.85
  - Schema parser: schema-postgres.ts table/column/enum definitions, confidence 0.90
  - Test extractor: test suite discovery, confidence 0.80
  - Validation: Zod schemas for Evidence type validation
  - Commit: TBD

- [x] 2.2 through 2.6: All extractors + 50 queries IMPLEMENTED
  - ✅ 2.2 AST extractor fully wired (tree-sitter v0.20)
  - ✅ 2.3 Route extractor fully wired (manifest scanner)
  - ✅ 2.4 Schema extractor fully wired (schema-postgres.ts parser)
  - ✅ 2.5 Test extractor fully wired (test suite scanner)
  - ✅ 2.6 50 evaluation queries added (10 prog-langs, 12 web, 10 networking, 10 architecture, 8 algorithms)

- [ ] 2.7 Test extraction script on subset (5 queries), verify evidence mappings are valid
  - Status: ready
  - Run: `npx tsx scripts/atlas/extract-evaluation-corpus.mts --verbose`
  - Validation: 
    - All extracted evidence passes Zod schema validation
    - Confidence scores align with extractor type (0.80-0.95)
    - Evidence detail JSONB is well-formed per evidence_type

- [ ] 2.8 Populate evaluation_queries and evaluation_relevance tables via dry-run, review results, then apply
  - Status: ready (after 2.7)
  - Dry-run: `npx tsx scripts/atlas/extract-evaluation-corpus.mts` (default mode)
  - Apply: `npx tsx scripts/atlas/extract-evaluation-corpus.mts --apply`
  - Outputs:
    - evaluation_evidence rows (deterministic extraction provenance)
    - evaluation_relevance rows (query × packet_key × corpus_version judgments)
  - Review checklist:
    - All 50 queries inserted to evaluation_queries
    - Evidence count matches each extractor's output
    - Confidence distribution (0.80 tests, 0.85 routes, 0.90 schemas, 0.95 AST)

## 3. FeatureEnvelope Interface and TypeScript Types

- [ ] 3.1 Create `src/lib/server/retrieval/feature-envelope.ts` with FeatureEnvelope interface: chunk_id, query_id, dense_rank/score/grade/confidence, lexical_rank/score/grade/confidence, rrf_rank/score/grade/confidence
- [ ] 3.2 Create constructor function `createFeatureEnvelope(chunk_id, query_id): FeatureEnvelope` with all fields initialized to null/0
- [ ] 3.3 Create helper function `withDenseSignal(envelope, rank, score, grade, confidence): FeatureEnvelope` to populate Dense fields
- [ ] 3.4 Create helper function `withLexicalSignal(envelope, rank, score, grade, confidence): FeatureEnvelope` to populate Lexical fields
- [ ] 3.5 Create function `computeRRFSignal(envelope, weights): FeatureEnvelope` to compute RRF score and rank from Dense/Lexical ranks and weights
- [ ] 3.6 Add TypeScript tests for FeatureEnvelope: create, populate signals, compute RRF, verify independence

## 4. Evaluation Runner Update

- [ ] 4.1 Update `phase2f-evaluation-runner.mts` to read real ground-truth from evaluation_relevance table (not synthetic consensus from v2)
- [ ] 4.2 Modify runner to accept ablation_id parameter and filter ground-truth by source_type if needed
- [ ] 4.3 Modify Dense retrieval to wrap results in FeatureEnvelope with dense_rank/score, then look up dense_grade from evaluation_relevance
- [ ] 4.4 Modify Lexical retrieval to wrap results in FeatureEnvelope with lexical_rank/score, then look up lexical_grade from evaluation_relevance
- [ ] 4.5 Implement RRF fusion to compute RRF score/rank from Dense and Lexical envelopes, inherit grade from evaluation_relevance
- [ ] 4.6 Update metric computation to use FeatureEnvelope grades (not scores) for relevance judgments
- [ ] 4.7 Add ablation_id and lane_name to all results written to phase2f_evaluation_results
- [ ] 4.8 Test runner on single query (ID TBD), verify results match expected FeatureEnvelope shape

## 5. Ablation Study Configuration and Execution

- [ ] 5.1 Create ablation configuration enum/object: ablation_id (1-7), ablation_name (dense-only, lexical-only, rrf-equal, dense-heavy, lexical-heavy, ast-only, rrf-dense-lexical), weights
- [ ] 5.2 Create function `runAblation(ablation_id, queries): results[]` that parameterizes weights and re-runs retrieval pipeline
- [ ] 5.3 Implement Phase 2F.1 baseline: ablation 7 (RRF with 0.50 Dense + 0.50 Lexical, no AST)
- [ ] 5.4 Implement ablations 1-2 (Dense-only, Lexical-only) for baseline comparison
- [ ] 5.5 Implement ablations 5-6 (Dense-heavy RRF, Lexical-heavy RRF) for weight sensitivity testing
- [ ] 5.6 Implement ablation 4 (RRF equal weights) for production validation
- [ ] 5.7 Defer ablation 3 (AST-only) to Phase 2F.2
- [ ] 5.8 Create orchestrator script `run-phase2f-ablations.mts` that executes all 6 ablations in sequence, stores results with ablation_id

## 6. IR Metrics Implementation

- [ ] 6.1 Implement Precision@K function: count relevant results in top-K / K
- [ ] 6.2 Implement Recall@K function: count relevant results in top-K / total relevant
- [ ] 6.3 Implement MRR (Mean Reciprocal Rank): average of 1/rank for first relevant result per query
- [ ] 6.4 Implement NDCG@K: compute DCG = sum(rel_i / log2(i+1)) for top-K, normalize by IDCG (ideal ranking)
- [ ] 6.5 Implement MAP (Mean Average Precision): average of precision@k for each relevant result position
- [ ] 6.6 Test metrics on single query with known ground-truth, verify values are in expected ranges
- [ ] 6.7 Aggregate metrics across 50 queries: compute average, median, std dev per metric per ablation

## 7. Validation and Spot-Check

- [ ] 7.1 Run extraction script on full codebase, verify 50+ queries loaded into evaluation_queries
- [ ] 7.2 Spot-check 5 random queries: verify chunk_id values are real (can fetch from codebase_chunk_index)
- [ ] 7.3 Run evaluation runner on 5 sample queries (ablation 7: RRF Dense+Lexical), capture results
- [ ] 7.4 Manually verify results for one query: Dense top-3, Lexical top-3, RRF top-3 are semantically reasonable
- [ ] 7.5 Check that metrics (NDCG@10, MAP, MRR) are in expected range (0-1) and not all zero
- [ ] 7.6 Verify ablation_id and lane_name columns are populated correctly in phase2f_evaluation_results

## 8. Full Ablation Run and Reporting

- [ ] 8.1 Run all 6 ablations (1-2, 4-7) against full 50-query corpus
- [ ] 8.2 Aggregate results: compute NDCG@10, MAP, MRR, Recall@10 for each ablation, each signal
- [ ] 8.3 Generate comparison report: table showing NDCG@10 for each ablation, highlight best performer
- [ ] 8.4 Analyze results: does RRF (ablation 7) beat Dense+Lexical individual signals? By how much?
- [ ] 8.5 Document findings: if Dense-heavy or Lexical-heavy ablations show improvement, recommend weight adjustment for Phase 2F.2
- [ ] 8.6 Create summary document `PHASE-2F.1-RESULTS.md` with metrics, key findings, recommendations

## 9. Documentation and Handoff

- [ ] 9.1 Document evaluation_queries and evaluation_relevance table schemas in project README
- [ ] 9.2 Document FeatureEnvelope interface and ablation configurations in `docs/retrieval/phase2f-evaluation.md`
- [ ] 9.3 Create quick-reference guide: how to run Phase 2F.1 evaluation (single command or script)
- [ ] 9.4 Add npm script: `npm run phase2f:evaluate` that runs full ablation suite
- [ ] 9.5 Add npm script: `npm run phase2f:results:compare` that queries phase2f_evaluation_results and prints comparison table
- [ ] 9.6 Document Phase 2F.1 as complete, reference results in Phase 2F.2 kickoff criteria
