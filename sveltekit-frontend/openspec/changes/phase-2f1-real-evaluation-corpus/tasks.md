## 1. Database Schema Setup

- [ ] 1.1 Create `evaluation_queries` table with columns: id (UUID PK), query (TEXT), domain (VARCHAR), difficulty (INT), expected_count (INT), created_at (TIMESTAMP)
- [ ] 1.2 Create `evaluation_relevance` table with columns: query_id (UUID FK), chunk_id (UUID), grade (SMALLINT 0-3), source_type (VARCHAR: AST/route/schema/test), extractor_version (VARCHAR), confidence (REAL 0-1), created_at (TIMESTAMP), PRIMARY KEY (query_id, chunk_id)
- [ ] 1.3 Add ablation_id (INT) and lane_name (VARCHAR) columns to `phase2f_evaluation_results` table
- [ ] 1.4 Verify schema migration applies cleanly via `npm run migrate`

## 2. Ground-Truth Extraction Scripts

- [ ] 2.1 Create `extract-evaluation-corpus.mts` script with four extractors: AST walker, route scanner, schema parser, test file scanner
- [ ] 2.2 Implement AST extractor: tree-sitter walk on TypeScript/JavaScript files, identify function declarations, map to chunk_id with confidence 0.95
- [ ] 2.3 Implement route extractor: scan routes/ directory for +page.server.ts and +server.ts files, identify route handlers, map to chunk_id with confidence 0.85
- [ ] 2.4 Implement schema extractor: parse schema-postgres.ts file, identify table/column definitions, map to chunk_id with confidence 0.90
- [ ] 2.5 Implement test extractor: scan tests/ directory, identify test files, map to chunk_id with confidence 0.80
- [ ] 2.6 Add 50+ diverse evaluation queries to extraction script (programming-languages, web-markup, networking, architecture, algorithms domains)
- [ ] 2.7 Test extraction script on subset (5 queries), verify chunk_id mappings are real UUIDs in codebase_chunk_index
- [ ] 2.8 Populate evaluation_queries and evaluation_relevance tables via dry-run, review results, then apply

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
