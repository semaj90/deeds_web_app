## ADDED Requirements

### Requirement: Load real evaluation queries
The system SHALL load 50+ ground-truth queries from the `evaluation_queries` table. Each query SHALL have an ID, query text, domain (programming-languages, web-markup, networking, architecture, algorithms), and difficulty level.

#### Scenario: Load queries successfully
- **WHEN** evaluation runner starts
- **THEN** system loads all 50+ queries from evaluation_queries table into memory

#### Scenario: Handle missing queries
- **WHEN** evaluation_queries table is empty or not found
- **THEN** system logs error and exits with non-zero status

### Requirement: Load real evaluation relevance judgments
The system SHALL load ground-truth relevance judgments from the `evaluation_relevance` table. Each judgment SHALL map a query_id to a chunk_id (UUID from codebase_chunk_index.id) with graded relevance (0–3), source_type (AST/route/schema/test), extractor_version, and confidence.

#### Scenario: Load relevance judgments
- **WHEN** evaluation runner loads queries
- **THEN** system loads all evaluation_relevance rows matching each query_id

#### Scenario: Group judgments by query
- **WHEN** evaluation runner processes a query
- **THEN** system groups all relevance judgments for that query_id, building a ground-truth mapping {chunk_id → grade}

### Requirement: Create FeatureEnvelope interface
The system SHALL define a FeatureEnvelope struct that tracks rank, score, grade, and confidence for each retrieval signal independently. FeatureEnvelope SHALL support Dense, Lexical, and future RRF/AST lanes without coupling.

#### Scenario: Envelope tracks Dense signal
- **WHEN** Dense retrieval returns top-20 results
- **THEN** each result is wrapped in FeatureEnvelope with dense_rank, dense_score, dense_grade (from evaluation_relevance), dense_confidence

#### Scenario: Envelope tracks Lexical signal
- **WHEN** Lexical retrieval returns top-20 results
- **THEN** each result is wrapped in FeatureEnvelope with lexical_rank, lexical_score, lexical_grade, lexical_confidence

#### Scenario: Envelope computes RRF blend
- **WHEN** both Dense and Lexical envelopes are available for a chunk
- **THEN** system computes RRF score from dense_score and lexical_score, assigns rrf_rank by sorted RRF score

### Requirement: Extract ground-truth from AST declarations
The system SHALL extract AST-based judgments by walking code structure. For a query like "where is function X defined?", the system SHALL identify the tree-sitter declaration location and link it to the chunk containing that declaration.

#### Scenario: Identify function declaration
- **WHEN** query asks "where is getUserSession defined?"
- **THEN** system walks tree-sitter AST, finds function declaration, maps to chunk_id of the file containing that function, grades as relevance 3 (highly relevant)

#### Scenario: Handle no AST match
- **WHEN** query asks "where is nonexistent_fn defined?"
- **THEN** system finds no AST match, skips AST judgment for that query

### Requirement: Extract ground-truth from route manifests
The system SHALL extract route-based judgments by scanning +page.server.ts and +server.ts files. For a query like "which route handles evidence upload?", system SHALL identify the file path and link to the chunk.

#### Scenario: Identify route handler
- **WHEN** query asks "which route handles evidence upload?"
- **THEN** system scans routes/ for +server.ts with upload handler, maps to chunk_id, grades as relevance 3

#### Scenario: Handle route ambiguity
- **WHEN** multiple routes could handle a query
- **THEN** system ranks primary handlers higher (grades 3) than secondary handlers (grades 2)

### Requirement: Extract ground-truth from PostgreSQL schemas
The system SHALL extract schema-based judgments by parsing schema-postgres.ts. For a query like "what schema stores packet identity?", system SHALL identify table/column definitions and link to chunks.

#### Scenario: Identify schema table
- **WHEN** query asks "what table stores packet identity?"
- **THEN** system parses schema-postgres.ts, finds atlas_packets table, maps to chunk containing table definition, grades as relevance 3

#### Scenario: Handle schema joins
- **WHEN** query asks "how do packets relate to chunks?"
- **THEN** system identifies both atlas_packets and codebase_chunk_index tables, creates relevance judgments for both (grades 2.5 for relational context)

### Requirement: Extract ground-truth from test manifests
The system SHALL extract test-based judgments by scanning test files. For a query like "which test validates HyperRAG packet RPC?", system SHALL identify test file and line number.

#### Scenario: Identify test file
- **WHEN** query asks "which test validates packet RPC?"
- **THEN** system scans tests/ for matching test, maps to chunk_id of test file, grades as relevance 3

#### Scenario: Handle multiple test matches
- **WHEN** multiple tests are relevant
- **THEN** system prioritizes exact-match tests (grades 3) over partial-match tests (grades 2)

### Requirement: Store evaluation results with ablation metadata
The system SHALL store evaluation results in `phase2f_evaluation_results` table with ablation_id and lane_name columns. Each result row SHALL record IR metrics (NDCG@10, MAP, MRR, Recall@K, Precision@K) for one query, one signal, and one ablation configuration.

#### Scenario: Store Dense-only ablation results
- **WHEN** Dense-only ablation run completes for a query
- **THEN** system writes row with ablation_id=1, ablation_name='dense-only', lane_name='dense', and all IR metrics

#### Scenario: Store RRF equal-weight results
- **WHEN** RRF equal-weight ablation completes
- **THEN** system writes row with ablation_id=4, ablation_name='rrf-equal', lane_name='rrf', and computed RRF metrics

#### Scenario: Query results by ablation
- **WHEN** analyst runs `SELECT * FROM phase2f_evaluation_results WHERE ablation_id=4`
- **THEN** system returns all RRF equal-weight results across all queries and signals

### Requirement: Compute IR metrics per signal
The system SHALL compute standard information retrieval metrics for each signal: Precision@5, Precision@10, Recall@5, Recall@10, Recall@20, MRR (Mean Reciprocal Rank), NDCG@10 (Normalized Discounted Cumulative Gain), MAP (Mean Average Precision).

#### Scenario: Compute Precision@10 for Dense signal
- **WHEN** Dense signal returns top-10 results for a query
- **THEN** system counts how many results match ground-truth relevance (grade > 0), divides by 10, stores as precision_at_10

#### Scenario: Compute NDCG@10 with relevance grades
- **WHEN** system has Dense results ranked 1-10 with corresponding relevance grades (0-3)
- **THEN** system computes DCG = sum(rel_i / log2(i+1)), normalizes by IDCG (ideal ranking), stores as ndcg_10

#### Scenario: Handle ties in RRF scores
- **WHEN** multiple chunks have identical RRF score
- **THEN** system assigns ranks deterministically (e.g., by chunk_id alphabetically) to ensure reproducible metrics
