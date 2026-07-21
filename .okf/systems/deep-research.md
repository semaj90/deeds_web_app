---
type: system
title: Deep Research Task Infrastructure
id: system/deep-research
status: active
owners:
  - legal-ai-team
source_refs:
  - docs/DEEP-RESEARCH-INDEX.md
  - docs/DEEP-RESEARCH-COMPLETION-SUMMARY.md
  - sveltekit-frontend/src/lib/server/db/schema-postgres.ts
related:
  - pipeline/retrieval-ranking-synthesis
  - pipeline/content-ingestion
  - datasets/legal-corpus
  - tools/gemma4-synthesis
  - tools/ml-ranking-sidecar
  - runbooks/admin-dashboard-setup
  - runbooks/ml-ranking-validation
---

# Deep Research Task Infrastructure

## Overview

Deep Research is the end-to-end workflow for legal Q&A that takes a user query through six phases: understanding → search strategy → retrieval → ranking → synthesis → quality assurance. It is integrated with HyperRAG for retrieval orchestration and uses Gemma4 for legal-domain synthesis.

## Six-Phase Workflow

### Phase 1: Query Understanding & Analysis
**Agents**: `legal-nlp-extractor`, `domain-classifier`

- Parse user query into domain (Evidence, Criminal, Civil, Commercial, etc.)
- Extract applicable statutes, rules, jurisdiction scope
- Identify temporal scope (current law vs. historical)
- Extract case names, citations, entities
- **Corpus Needed**: Federal Rules of Evidence, State Evidence Codes (50 states), UCC sections, model penal code
- **Output**: Structured query intent with extracted entities and domain classification

### Phase 2: Search Strategy Formation
**Agents**: `search-planner`, `keyword-enricher`, `graph-navigator`

- Decide which retrieval lanes to use (Qdrant dense, BM25 lexical, Neo4j graph, LDR autonomous)
- Generate keyword synonyms and query variants
- Plan k-hop graph traversal entry points
- Estimate recall/precision per lane
- **Corpus Needed**: Legal term synonymy (5000+ terms), case law citation networks
- **Output**: Multi-source search plan with lane priorities

### Phase 3: Multi-Source Retrieval Execution
**Agents**: `retriever-orchestrator`, `vector-search-executor`, `full-text-search-executor`, `ldr-autonomous-planner`

**Parallel lanes** (executed concurrently):

1. **Qdrant Dense Search** (50–100ms)
   - Embed query (embeddinggemma, 768-dim)
   - HNSW ANN on codebase_chunks_768 → top-50 candidates
   - Extract payloads (source_ref, feature_id, statute_tags)

2. **BM25 Full-Text Search** (100–200ms)
   - Expand query with synonyms
   - Lexical ranking on legal document index
   - Return top-50 by BM25 score

3. **Local Deep Research Autonomous** (5–30s)
   - Route query to LDR orchestrator (:5000)
   - Execute web search + API calls + synthesis
   - Aggregate results with metadata

4. **Web Search via Firecrawl** (10–20s, parallel with LDR)
   - Execute web search for current/recent information
   - Crawl top results, extract text
   - Normalize citations

**Output**: 10–50 candidates per lane, aggregated candidate pool 40–200 items

### Phase 4: Candidate Ranking & Fusion
**Agents**: `ml-ranker`, `score-blender`, `fusion-orchestrator`

1. **ML Ranking (XGBoost or Naive Bayes)**
   - Extract features: semantic_similarity, bm25_score, freshness, authority_score, etc.
   - Call Miniforge sidecar (:8095)
   - Receive normalized scores [0, 1]
   - Blend with upstream: 0.6·ML + 0.4·upstream

2. **RRF Fusion (Reciprocal Rank Fusion)**
   - Formula: `RRF = 1/(k + rank)` where k=60
   - Combine ranks from Qdrant + BM25 + ML
   - Apply freshness boost (newer +0.1)
   - Apply authority boost (statute/precedent +0.2)

3. **Final Top-K Selection**
   - Re-rank by fused score
   - Select top 5–10 for synthesis context

**Output**: Ranked top-K candidates with fusion scores and reasoning trace

### Phase 5: Synthesis via Gemma4
**Agents**: `context-assembler`, `gemma4-synthesizer`, `citation-linker`, `finding-extractor`

1. **Context Packing** (4800-token budget)
   - Select top-K results
   - Truncate each to 300–400 tokens
   - Pack into prompt (system + context + query)
   - Preserve citations in context

2. **Gemma4 Generation**
   - Call llama-server :8090
   - Model: `gemma4-legal-iq4xs-direct.gguf` (IQ4_XS quantized, 5.3GB VRAM)
   - Params: temperature=0.3, max_tokens=1024, stream=true
   - Stream response for real-time UX

3. **Citation Linking**
   - Extract citations from synthesis (e.g., "See FRE 401")
   - Map to source documents via candidate_id
   - Build cited_result_ids list

4. **Key Finding Extraction**
   - Identify 4–8 main findings from synthesis
   - Store as JSONB array in ldr_synthesis.key_findings

5. **Confidence Scoring**
   - Assess synthesis confidence [0, 1]
   - Factor in: ML ranking confidence, citation quality, Gemma4 certainty

**Output**: Coherent legal answer with citations, key findings, and confidence score

### Phase 6: Quality Assurance & Audit
**Agents**: `qa-validator`, `citation-verifier`, `audit-logger`

- Validate synthesis accuracy (verify statute citations, legal reasoning)
- Cross-check citations against source corpus
- Flag broken or incorrect citations
- Log all decisions (task creation, retrieval lanes, ML ranking, synthesis, user actions)
- Collect user feedback for model retraining

**Output**: Validated answer, audit trail, flagged issues for human review

## PostgreSQL 18 Database Schema

### Core Tables

| Table | Columns | Purpose | Status |
|-------|---------|---------|--------|
| `ldr_research_tasks` | 20 | Main workflow tracking (query, status, results) | ✅ Live |
| `ldr_research_results` | 13 | Ranked search results from all sources | ✅ Live |
| `ldr_synthesis` | 8 | Gemma4-generated answers with citations | ✅ Live |
| `ml_ranking_cache` | 10 | Cached ML ranking results (24h TTL) | ✅ Live |
| `ml_clustering` | 10 | GPU clustering output (optional) | ✅ Live |
| `deep_research_audit_log` | 8 | Complete audit trail of all operations | ✅ Live |

### Drizzle ORM Schema

**Location**: `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` (lines 1672–2730)

**Exports**:
- `ldrResearchTasks` — main task table
- `ldrResearchResults` — search results
- `ldrSynthesis` — synthesized answers
- `mlRankingCache` — ML ranking cache
- `mlClustering` — clustering results
- `deepResearchAuditLog` — audit trail
- Relations: `ldrResearchTasksRelations`, `ldrResearchResultsRelations`, `ldrSynthesisRelations`, etc.

**Type Safety**: Full TypeScript support via `$inferSelect` and `$inferInsert`

## Admin Dashboard

**Route**: `GET /admin/deep-research`

**Location**: `sveltekit-frontend/src/routes/(app)/admin/deep-research/`

**Features**:
- Paginated task list (limit 50, offset-based)
- Filter by status (pending, running, completed, failed), user_id, date range
- Auto-join with results and synthesis via Drizzle relations
- Status distribution aggregations (stats overview)
- Inline actions: Retry (reset to pending), Delete (cascading)
- Expandable details: Results table, Synthesis answer, Error logs
- Role-based access (requires admin or prosecutor role)
- Performance: 200–500ms page load on 50 tasks

**Files**:
- `+page.server.ts` — Load function, actions, auth guard
- `+page.svelte` — Svelte 5 UI with `$state()` and `$derived()` runes

## API Endpoints

### POST /api/research/deep
**Submit Deep Research Task**

Request:
```json
{
  "query": "What are the key requirements for evidence admissibility?",
  "rank_model": "xgboost",
  "include_web_search": true,
  "include_ldr": true,
  "top_k": 5
}
```

Response:
```json
{
  "taskId": "uuid",
  "status": "pending",
  "createdAt": "2026-07-20T...",
  "estimatedDuration": "30-60 seconds"
}
```

**Execution Pipeline**:
1. Qdrant dense search
2. Firecrawl web search (parallel)
3. Local Deep Research autonomous (parallel)
4. ML ranking (Miniforge :8095)
5. RRF fusion
6. Gemma4 synthesis
7. Store results + audit log (atomic transaction)

## ML Sidecar Integration

**Service**: Miniforge Flask server at :8095

**Client**: `src/lib/server/ml/miniforge-ml-sidecar.ts`

**Endpoints**:
- `/health` — Service health check
- `/rank` — XGBoost candidate ranking
- `/classify` — Text classification
- `/cluster` — Vector clustering

**Features**:
- HTTP endpoints for XGBoost/Naive Bayes ranking
- Feature extraction and normalization
- Score blending (60% ML + 40% upstream)
- Error handling with graceful fallback
- CUDA acceleration for GPU (with CPU fallback)
- Cuml/cuVS for clustering (optional)

**Python Server**: `scripts/ml/ml_sidecar/server.py`

## Corpus Requirements

| Corpus | Coverage | Status | Integration Point |
|--------|----------|--------|---|
| Federal Rules of Evidence | 100% (1000+ rules) | 📋 Reference | Query analysis, synthesis |
| State Evidence Codes (50 states) | 100% | 📋 Reference | Query analysis |
| UCC Sections | 100% | 📋 Reference | Commercial law queries |
| Legal Term Synonymy | 5000+ terms | ⏳ Needs population | Keyword expansion |
| Case Law Citation Networks | All appellate | ⏳ Neo4j import needed | Graph traversal |
| Qdrant Embeddings (768-dim) | 40,568 points | ✅ Indexed | Dense retrieval |
| BM25 Full-Text Index | All documents | ✅ Functional | Lexical search |
| XGBoost Training Labels | 7,051 samples | ✅ Ready | ML ranking |
| Gemma4 Model | 5.3GB VRAM | ✅ Running at :8090 | Synthesis |
| Prompt Templates | 5+ domains | ✅ Created | Synthesis |

## Performance Targets (SLA)

| Component | Target | Notes |
|-----------|--------|-------|
| Task creation | 5ms | Async Postgres write |
| Qdrant search | 50–100ms | HNSW ANN on 40K points |
| BM25 search | 100–200ms | Full-text index |
| LDR autonomous | 5–30s | Web search + synthesis |
| ML ranking | 100–500ms | XGBoost on 10–50 candidates |
| Gemma4 synthesis | 5–15s | Streaming generation |
| **Total E2E** | **30–60s** | All phases parallel |
| Admin page load | 200–500ms | Pagination + Drizzle relations |

## Roadmap

### Phase 2 (Next)
- Graph-augmented ranking (Neo4j SIMILAR_TOPOLOGY edges)
- Domain-specific scoring boosters
- Temporal scope awareness (legislative history)

### Phase 3
- Multi-jurisdiction comparative analysis
- Regulatory compliance checking
- Legislative history tracking

### Phase 4
- Multi-language support (Spanish, French, German)
- Hypothesis generation
- Counter-argument synthesis
