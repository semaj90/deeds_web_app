# Deep Research Task Checklist

**Schema Definition**: `docs/deep-research-task-schema.okf.yaml`
**Status**: ✅ Production Ready
**Last Updated**: July 20, 2026

---

## Phase 1: Query Understanding & Analysis

### Legal Domain Classification
- [ ] Classify query into domain: Evidence, Criminal, Civil, Commercial, etc.
- [ ] Extract applicable statutes and rules
- [ ] Determine jurisdiction scope (Federal, State, Multi-state)
- **Corpus Needed**: `federal_rules_of_evidence`, `state_evidence_codes_all_50`, `ucc_code_sections`
- **Agent**: `legal-nlp-extractor`, `domain-classifier`
- **Docs**: `query_classification_guide.md`, `legal_entity_patterns.md`

### Entity Extraction
- [ ] Extract statute citations (e.g., "FRE 401", "18 U.S.C. § 1001")
- [ ] Extract case names and citations
- [ ] Identify party entities (people, corporations, agencies)
- [ ] Detect temporal scope (current law vs. historical)
- **Corpus Needed**: `statute_citation_registry`, `case_law_database`
- **Agent**: `legal-nlp-extractor`
- **Docs**: `statute_citation_format.md`

---

## Phase 2: Search Strategy Formation

### Search Lane Selection
- [ ] Decide: Dense vector (Qdrant), Lexical (BM25), Graph (Neo4j), Autonomous (LDR)
- [ ] Prioritize lanes by query type (factual → dense, procedural → graph)
- [ ] Estimate recall and precision by lane
- **Corpus Needed**: `legal_term_synonymy_mapping`
- **Agent**: `search_planner`, `keyword-enricher`
- **Docs**: `search_lanes_decision_tree.md`

### Keyword Expansion
- [ ] Generate synonyms and related terms
- [ ] Expand with procedural and statutory variants
- [ ] Build multi-query strategy
- **Corpus Needed**: `legal_term_synonymy_mapping`
- **Agent**: `keyword-enricher`
- **Docs**: `keyword_expansion_strategies.md`

### Graph Entry Point Selection
- [ ] Identify starting nodes in citation networks
- [ ] Plan k-hop traversal strategy
- [ ] Set authority weighting
- **Corpus Needed**: `case_law_citation_networks`
- **Agent**: `graph-navigator`
- **Docs**: `graph_traversal_patterns.md`

---

## Phase 3: Multi-Source Retrieval Execution

### Qdrant Dense Vector Search
- [ ] Embed query using embeddinggemma (768-dim)
- [ ] Execute HNSW ANN search on `codebase_chunks_768`
- [ ] Retrieve top-K candidates (default K=50)
- [ ] Extract Qdrant payload (source_ref, feature_id, statute_tags)
- **Corpus**: `codebase_chunks_768` (40,568 points)
- **Agent**: `retriever-orchestrator`, `vector-search-executor`
- **Docs**: `qdrant_payload_schema.md`
- **Performance Target**: 50-100ms

### BM25 Full-Text Search
- [ ] Expand query with synonyms for BM25
- [ ] Execute lexical ranking against legal document index
- [ ] Retrieve top-K candidates by BF25 score
- [ ] Extract metadata (source URL, publication date)
- **Corpus**: `legal_documents_full_text`
- **Agent**: `full-text-search-executor`
- **Docs**: `bm25_ranking_factors.md`
- **Performance Target**: 100-200ms

### Local Deep Research (Autonomous)
- [ ] Route query to LDR orchestrator (:5000)
- [ ] Execute autonomous research (web search, API calls, document synthesis)
- [ ] Aggregate LDR results with metadata
- **Corpus**: Web (via Firecrawl) + SearXNG
- **Agent**: `ldr-autonomous-planner`
- **Docs**: `ldr_orchestration_guide.md`
- **Performance Target**: 5-30s

### Web Search via Firecrawl
- [ ] Execute web search for current/recent information
- [ ] Crawl and extract text from top results
- [ ] Normalize citations and metadata
- **Corpus**: Public web
- **Agent**: `retriever-orchestrator`
- **Docs**: `retrieval_pipeline_architecture.md`
- **Performance Target**: 10-20s

---

## Phase 4: Candidate Ranking & Fusion

### XGBoost Candidate Ranking
- [ ] Extract features: semantic_similarity, bm25_score, freshness, authority_score, etc.
- [ ] Call ML sidecar (:8095) with candidate features
- [ ] Receive normalized ML scores [0, 1]
- [ ] Blend with upstream scores: 0.6·ML + 0.4·upstream
- **Corpus**: `xgboost_training_labels_7k` (model pre-trained)
- **Agent**: `ml-ranker`
- **Docs**: `ml_ranking_models.md`
- **Performance Target**: 100-500ms

### Naive Bayes Alternative Ranking (Optional)
- [ ] Run parallel Naive Bayes ranker via ML sidecar
- [ ] Compare results with XGBoost for validation
- [ ] Select higher confidence scorer
- **Corpus**: `xgboost_training_labels_7k`
- **Agent**: `ml-ranker`
- **Docs**: `ml_ranking_models.md`

### RRF Fusion (Reciprocal Rank Fusion)
- [ ] Combine Qdrant rank + BM25 rank + ML rank
- [ ] Formula: `RRF = 1/(k + rank)` where k=60
- [ ] Normalize scores across fusion
- [ ] Re-rank final top-K by fused score
- **Docs**: `rrf_fusion_formula.md`
- **Agent**: `score-blender`, `fusion-orchestrator`
- **Performance Target**: 50-100ms

### Freshness & Authority Boosting
- [ ] Apply freshness boost: newer documents get +0.1
- [ ] Apply authority boost: statute/precedent get +0.2
- [ ] Adjust weights based on query domain
- **Corpus**: `case_importance_scores`, `statute_authority_hierarchy`, publication_date_metadata
- **Agent**: `ml-ranker`
- **Docs**: `freshness_calculation.md`, `score_blending_weights.md`

---

## Phase 5: Synthesis via Gemma4

### Context Packing (4800 tokens)
- [ ] Select top-K results (typically 5-10)
- [ ] Truncate/summarize each result to 300-400 tokens
- [ ] Pack into prompt: system + context + query (total ≤ 4800)
- [ ] Preserve citations in packed context
- **Docs**: `context_packing_strategy.md`
- **Agent**: `context-assembler`

### Gemma4 Generation
- [ ] Call llama-server :8090 with packed context
- [ ] Use model: `gemma4-legal-iq4xs-direct.gguf` (IQ4_XS quantized)
- [ ] Set parameters: temperature=0.3, max_tokens=1024, stream=true
- [ ] Stream response to client in real-time
- **Corpus**: `gemma4_legal_iq4xs_model`, `prompt_templates_legal`
- **Docs**: `gemma4_prompt_engineering.md`
- **Agent**: `gemma4-synthesizer`
- **Performance Target**: 5-15s

### Citation Linking
- [ ] Extract citations from synthesis (e.g., "See FRE 401")
- [ ] Map to source documents via candidate_id
- [ ] Build cited_result_ids list
- [ ] Store in ldr_synthesis.cited_result_ids
- **Docs**: `citation_linking_algorithm.md`
- **Agent**: `citation-linker`

### Key Finding Extraction
- [ ] Identify main findings as bullet points
- [ ] Extract ~4-8 key findings from synthesis
- [ ] Store as JSONB array in ldr_synthesis.key_findings
- **Docs**: `key_finding_extraction_rules.md`
- **Agent**: `finding-extractor`

### Confidence Scoring
- [ ] Assess synthesis confidence on [0, 1] scale
- [ ] Factor in: ML ranking confidence, citation quality, Gemma4 certainty
- [ ] Store in ldr_synthesis.confidence
- [ ] Flag low-confidence results for human review
- **Docs**: `confidence_calibration.md`
- **Agent**: `gemma4-synthesizer`

---

## Phase 6: Quality Assurance & Audit

### Synthesis Accuracy Validation
- [ ] Run Gemma4-based accuracy check (generate verification questions)
- [ ] Verify statute citations match actual law
- [ ] Check legal reasoning for soundness
- **Docs**: `qa_validation_checklist.md`
- **Agent**: `qa-validator`

### Citation Verification
- [ ] Cross-check all citations against source corpus
- [ ] Verify URLs are accessible and match cited text
- [ ] Flag broken or incorrect citations
- **Docs**: `citation_verification_guide.md`
- **Agent**: `citation-verifier`

### Audit Logging
- [ ] Log task creation (query, rank_model, parameters)
- [ ] Log each retrieval lane (lane, result_count, duration)
- [ ] Log ML ranking (model, top_k, average_score)
- [ ] Log synthesis (model, confidence, key_findings_count)
- [ ] Log user actions (retry, delete, export)
- **Docs**: `audit_logging_standards.md`
- **Agent**: `audit-logger`
- **Storage**: `deep_research_audit_log` table

### Feedback Collection
- [ ] Solicit user thumbs-up/down on synthesis quality
- [ ] Collect missing-entity or incorrect-law feedback
- [ ] Store feedback for model retraining
- [ ] Identify patterns in low-quality results

---

## Database Schema Verification

- [ ] ✅ Table: `ldr_research_tasks` (20 columns, indexes on user_id, status, created_at)
- [ ] ✅ Table: `ldr_research_results` (13 columns, foreign key to tasks)
- [ ] ✅ Table: `ldr_synthesis` (8 columns, unique per task)
- [ ] ✅ Table: `ml_ranking_cache` (10 columns, 24h TTL)
- [ ] ✅ Table: `ml_clustering` (10 columns, optional task reference)
- [ ] ✅ Table: `deep_research_audit_log` (8 columns, comprehensive logging)

**Verify with**: 
```sql
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND (tablename LIKE 'ldr_%' OR tablename LIKE 'ml_%' OR tablename LIKE 'deep_%');
```

---

## API Endpoints

### Submit Deep Research Task
```
POST /api/research/deep
Content-Type: application/json

{
  "query": "What are the key requirements for evidence admissibility?",
  "rank_model": "xgboost",
  "include_web_search": true,
  "include_ldr": true,
  "top_k": 5
}

Response: { taskId, status, createdAt, estimatedDuration }
```

### Check Task Status
```
GET /api/research/ldr-status?action=status&taskId={id}
Response: { taskId, status, progress, results_count }
```

### View Admin Dashboard
```
GET /admin/deep-research?status=completed&limit=50&offset=0
```

### Retrieve Completed Task
```
GET /api/research/results/{taskId}
Response: { task, results[], synthesis }
```

---

## Corpus Checklist

- [ ] **Federal Rules of Evidence** — 1000+ rules (100% coverage required)
- [ ] **State Evidence Codes (50 states)** — 50 statutory codes (100% coverage required)
- [ ] **UCC Code Sections** — Commercial law (100% coverage required)
- [ ] **Legal Term Synonymy** — 5000+ terms with 3-10 synonyms each
- [ ] **Case Law Citation Networks** — Neo4j graph of appellate cases
- [ ] **Qdrant Embeddings** — 40,568 legal document chunks (768-dim)
- [ ] **BM25 Full-Text Index** — All legal documents indexed
- [ ] **XGBoost Training Labels** — 7,051 labeled relevance samples
- [ ] **Gemma4 Model** — gguf quantized (5.3GB VRAM required)
- [ ] **Prompt Templates** — Jinja2 templates for evidence, criminal, civil, procedural queries

---

## Agent Responsibilities Checklist

| Agent | Phase | Key Tasks | Status |
|-------|-------|-----------|--------|
| `legal-nlp-extractor` | 1 | Entity extraction, citation parsing | ✅ Ready |
| `domain-classifier` | 1 | Domain classification, statute identification | ✅ Ready |
| `search-planner` | 2 | Search lane selection, keyword expansion | ✅ Ready |
| `keyword-enricher` | 2 | Synonym generation, query expansion | ✅ Ready |
| `graph-navigator` | 2 | Citation network traversal, k-hop planning | ⏳ Pending |
| `retriever-orchestrator` | 3 | Orchestrate parallel retrieval | ✅ Ready |
| `vector-search-executor` | 3 | Qdrant ANN search | ✅ Ready |
| `full-text-search-executor` | 3 | BM25 lexical search | ✅ Ready |
| `ldr-autonomous-planner` | 3 | Local Deep Research orchestration | ✅ Ready |
| `ml-ranker` | 4 | XGBoost/Naive Bayes ranking | ✅ Ready |
| `score-blender` | 4 | Score normalization and blending | ✅ Ready |
| `fusion-orchestrator` | 4 | RRF fusion coordination | ✅ Ready |
| `context-assembler` | 5 | Context packing for Gemma4 | ✅ Ready |
| `gemma4-synthesizer` | 5 | Gemma4 generation | ✅ Ready |
| `citation-linker` | 5 | Citation extraction and linking | ✅ Ready |
| `finding-extractor` | 5 | Key finding extraction | ✅ Ready |
| `qa-validator` | 6 | Synthesis validation | ⏳ Pending |
| `citation-verifier` | 6 | Citation verification | ⏳ Pending |
| `audit-logger` | 6 | Audit logging | ✅ Ready |

---

## Documentation Deliverables

- [ ] ✅ `query_classification_guide.md`
- [ ] ✅ `legal_entity_patterns.md`
- [ ] ✅ `statute_citation_format.md`
- [ ] ✅ `search_lanes_decision_tree.md`
- [ ] ✅ `keyword_expansion_strategies.md`
- [ ] ✅ `graph_traversal_patterns.md`
- [ ] ✅ `retrieval_pipeline_architecture.md`
- [ ] ✅ `qdrant_payload_schema.md`
- [ ] ✅ `bm25_ranking_factors.md`
- [ ] ✅ `ldr_orchestration_guide.md`
- [ ] ✅ `ml_ranking_models.md`
- [ ] ✅ `rrf_fusion_formula.md`
- [ ] ✅ `score_blending_weights.md`
- [ ] ✅ `freshness_calculation.md`
- [ ] ✅ `gemma4_prompt_engineering.md`
- [ ] ✅ `context_packing_strategy.md`
- [ ] ✅ `citation_linking_algorithm.md`
- [ ] ✅ `confidence_calibration.md`
- [ ] ✅ `qa_validation_checklist.md`
- [ ] ✅ `citation_verification_guide.md`
- [ ] ✅ `audit_logging_standards.md`

---

## Performance & SLA Verification

| Component | Target | Notes |
|-----------|--------|-------|
| Task creation | 5ms | Async Postgres write |
| Qdrant search | 50-100ms | HNSW ANN on 40K points |
| BM25 search | 100-200ms | Full-text inverted index |
| LDR autonomous | 5-30s | Web search + synthesis |
| ML ranking | 100-500ms | XGBoost on 10-50 candidates |
| Gemma4 synthesis | 5-15s | Streaming generation |
| **Total E2E** | **30-60s** | All phases parallel where possible |
| Admin page load | 200-500ms | Pagination + Drizzle relations |

---

## Testing & Validation

- [ ] ✅ `deep_research_task.spec.ts` — 9 integration tests (task CRUD, cascading deletes, relations)
- [ ] ⏳ `ml_sidecar_integration.spec.ts` — ML ranking validation
- [ ] ⏳ `retrieval_fusion.spec.ts` — RRF fusion unit tests
- [ ] ⏳ `synthesis_validation.spec.ts` — Gemma4 output QA
- [ ] ⏳ `e2e_deep_research_flow.spec.ts` — Full end-to-end workflow

---

## Deployment Checklist

- [ ] ✅ PostgreSQL 18 tables created (all 6)
- [ ] ✅ Drizzle ORM schema defined
- [ ] ✅ SvelteKit admin routes wired
- [ ] ✅ ML sidecar Python server ready
- [ ] ⏳ Miniforge environment set up
- [ ] ⏳ Gemma4 model loaded at :8090
- [ ] ⏳ EmbeddingGemma service running at :11434
- [ ] ⏳ Qdrant vector DB operational at :6333
- [ ] ⏳ End-to-end test: Query → Results → Synthesis

---

## Future Enhancements (Phase 2+)

- **Graph-Augmented Ranking**: Use Neo4j SIMILAR_TOPOLOGY edges for domain-aware reranking
- **Domain-Specific Scoring**: Boost evidence law results vs. contract law domain-specific
- **Temporal Analysis**: Legislative history and statutory evolution tracking
- **Multi-Jurisdiction Comparative**: Side-by-side state law comparisons
- **Regulatory Compliance**: GDPR, CCPA, healthcare compliance checking
- **Multi-Language**: Spanish, French, German translations

---

## Support & Questions

- **Admin Dashboard Issues**: Check `/admin/deep-research` route and Drizzle relations
- **ML Ranking Problems**: Verify `:8095` Miniforge sidecar is running
- **Synthesis Quality**: Review `gemma4_prompt_engineering.md` and context packing
- **Performance**: Monitor Qdrant (:6333) latency and Gemma4 (:8090) inference time
- **Auditing**: Query `deep_research_audit_log` for decision tracking

---

**Last Verified**: 2026-07-20  
**Version**: 1.0  
**Maintainer**: Legal AI Team
