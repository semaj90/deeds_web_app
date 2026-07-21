---
type: pipeline
title: Retrieval → Ranking → Synthesis Pipeline
id: pipeline/retrieval-ranking-synthesis
status: active
owners:
  - legal-ai-team
source_refs:
  - sveltekit-frontend/src/routes/api/research/deep/+server.ts
  - src/lib/server/ml/miniforge-ml-sidecar.ts
  - docs/DEEP-RESEARCH-COMPLETION-SUMMARY.md
related:
  - system/hyperrag
  - system/deep-research
  - tools/gemma4-synthesis
  - tools/ml-ranking-sidecar
---

# Retrieval → Ranking → Synthesis Pipeline

## Overview

This pipeline orchestrates the three-stage transformation of a legal query into a ranked, synthesized answer. It is implemented in the SvelteKit deep research endpoint and coordinates Qdrant (retrieval), Miniforge (ranking), and Gemma4 (synthesis) services.

## Stage 1: Parallel Multi-Source Retrieval (10–30s)

### Inputs
- User query (natural language text)
- Query parameters: rank_model (xgboost|naive_bayes), include_web_search (bool), include_ldr (bool), top_k (int, default 5)
- Audit context: userId, caseId (optional), timestamp

### Execution (Parallel)

All four lanes execute concurrently; the slowest lane determines total stage latency:

1. **Qdrant Dense Search** (50–100ms)
   ```
   Query → Embed (embeddinggemma:latest, 768-dim)
        → HNSW ANN search on codebase_chunks_768 (40.5K points)
        → Extract payloads (source_ref, feature_id, statute_tags, summary)
        → Return top-50 by cosine distance
   ```
   **Output**: 50 scored candidates from Qdrant

2. **BM25 Full-Text Search** (100–200ms)
   ```
   Query → Synonym expansion (legal_term_synonymy corpus)
        → BM25 inverted index lookup
        → Relevance ranking by term frequency
        → Return top-50 by BM25 score
   ```
   **Output**: 50 scored candidates from PostgreSQL full-text index

3. **Local Deep Research Autonomous** (5–30s)
   ```
   Query → LDR orchestrator (:5000)
        → Web search (SearXNG)
        → API calls (external sources)
        → Document synthesis (Gemma4 mini)
        → Aggregate with metadata (source URL, publish date)
        → Return top-50 by synthesis quality score
   ```
   **Output**: 50 candidates from web + API sources

4. **Firecrawl Web Search** (10–20s, parallel with LDR)
   ```
   Query → Firecrawl web search
        → Crawl top results
        → Extract clean text + metadata
        → Return top-50 by relevance
   ```
   **Output**: 50 candidates from Firecrawl

### Stage 1 Output
- Candidate pool: 200–400 items (deduplicated by source_ref/URL)
- Structure per candidate: { score, source_ref, summary, statute_tags, url, publish_date, confidence_source }

## Stage 2: ML Ranking & RRF Fusion (100–500ms)

### Inputs
- Candidate pool from Stage 1
- Query embedding (cached from Stage 1)
- Rank model selection (xgboost | naive_bayes)

### Execution

1. **Feature Extraction** (CPU, 10–20ms)
   ```
   For each candidate:
   - semantic_similarity: cosine(query_embedding, candidate_embedding)
   - bm25_score: from Stage 1 BM25 output
   - freshness: (now - publish_date) / 30 days (normalized)
   - authority_score: statute? +0.3, precedent? +0.2, test? -0.1, etc.
   - length_score: prefer 200–500 tokens
   - recency_boost: recent changes +0.1
   ```

2. **ML Ranking** (GPU sidecar :8095, 50–100ms)
   ```
   POST http://127.0.0.1:8095/rank
   {
     "candidates": [{ semantic_similarity, bm25_score, freshness, authority_score, ... }],
     "model": "xgboost"  // or "naive_bayes"
   }
   Response: { scores: [0.87, 0.73, ...] }  // normalized [0, 1]
   ```
   **Output**: ML-normalized scores for all candidates

3. **Score Blending** (10ms)
   ```
   final_upstream = (bm25_score + semantic_similarity + authority) / 3
   final_score = 0.6 * ml_score + 0.4 * final_upstream
   ```

4. **RRF Fusion** (20–30ms)
   ```
   For each candidate:
   - rank_qdrant = position in Qdrant results (1..50)
   - rank_bm25 = position in BM25 results (1..50)
   - rank_ml = position in ML-ranked results (1..200)
   
   rrf_score = 1/(60+rank_qdrant) + 1/(60+rank_bm25) + 1/(60+rank_ml)
   final_ranking = sort by rrf_score DESC
   ```

5. **Top-K Selection** (5–10ms)
   ```
   Select top-10 candidates by final score
   Deduplicate on source_ref (keep highest-scoring per source)
   Return top-5 to synthesis stage
   ```

### Stage 2 Output
- Ranked top-5 candidates: { candidate_id, score, source_ref, summary, citations, rank_explanation }
- Ranking trace (decision log for audit)

## Stage 3: Gemma4 Synthesis (5–15s)

### Inputs
- Top-5 ranked candidates from Stage 2
- Original user query
- Query classification from Phase 1 (domain, jurisdiction, entities)

### Execution

1. **Context Packing** (50–100ms)
   ```
   Budget: 4800 tokens total
   Allocation:
   - System prompt: 200 tokens
   - Query + context: 3000 tokens (600 per top-5 candidate)
   - Answer space: 1600 tokens (generation budget)
   
   Pack candidates:
   - Preserve full citations (FRE 401, 18 U.S.C. § 1001, etc.)
   - Truncate long passages (keep key sentences only)
   - Use bullet points instead of prose where possible
   - Mark candidate source and confidence in prompt
   ```

2. **Gemma4 Generation** (5–15s)
   ```
   POST http://127.0.0.1:8090/v1/chat/completions
   {
     "model": "gemma4-legal-iq4xs-direct.gguf",
     "messages": [
       { "role": "system", "content": "You are a legal assistant..." },
       { "role": "user", "content": "Packed context + query" }
     ],
     "temperature": 0.3,
     "max_tokens": 1024,
     "stream": true,  // REQUIRED for Gemma4 thinking model
     "cache_prompt": true  // KV cache reuse for identical prefixes
   }
   ```
   **Streaming**: Return chunks to client via SSE as they arrive

3. **Citation Linking** (100–200ms)
   ```
   Parse synthesis text for citations:
   - Pattern: "FRE 401", "18 U.S.C. § 1001", "cite: Daubert v. Merrell"
   - Map to candidate_id (via source_ref lookup)
   - Build cited_result_ids array
   ```

4. **Key Finding Extraction** (100ms)
   ```
   Call Gemma4 mini (or regex pattern) to identify:
   - Main legal rules (statutes, precedents)
   - Supporting facts
   - Practical implications
   - Limitations/caveats
   
   Extract as JSONB array: [{ finding: string, type: "rule"|"fact"|"implication"|"caveat", source_candidate_id: uuid }]
   ```

5. **Confidence Scoring** (50ms)
   ```
   confidence = 0.8 * ml_ranking_confidence + 0.2 * citation_quality
   
   Where:
   - ml_ranking_confidence = average of top-5 ML scores (0.6–0.95 range)
   - citation_quality = (cited_count / total_sentences) normalized to [0, 1]
   
   Flag low-confidence results (< 0.6) for human review
   ```

### Stage 3 Output
```json
{
  "synthesis": {
    "text": "Legal answer text...",
    "key_findings": [
      { "finding": "...", "type": "rule", "source_candidate_id": "uuid" }
    ],
    "cited_result_ids": ["uuid1", "uuid2", ...],
    "confidence": 0.87
  },
  "metadata": {
    "model": "gemma4-legal-iq4xs-direct.gguf",
    "generated_at": "2026-07-20T...",
    "generation_tokens": 247,
    "prompt_cache_hit": true
  }
}
```

## Database Persistence

All stages write to PostgreSQL atomically:

```sql
BEGIN TRANSACTION;

-- Write task status
UPDATE ldr_research_tasks
SET status = 'running', started_at = NOW()
WHERE id = $task_id;

-- Write retrieval results
INSERT INTO ldr_research_results (task_id, rank, source, score, source_ref, summary)
VALUES ($task_id, 1, 'qdrant', 0.87, $source_ref, $summary), ...;

-- Write ML ranking cache
INSERT INTO ml_ranking_cache (task_id, model, scores_json, timestamp)
VALUES ($task_id, 'xgboost', $scores_json, NOW());

-- Write synthesis
INSERT INTO ldr_synthesis (task_id, synthesis_text, key_findings, cited_result_ids, confidence)
VALUES ($task_id, $text, $findings_json, $citations_json, 0.87);

-- Write audit log
INSERT INTO deep_research_audit_log (task_id, stage, decision, timestamp)
VALUES ($task_id, 'synthesis', $decision_json, NOW()), ...;

-- Update task status
UPDATE ldr_research_tasks
SET status = 'completed', completed_at = NOW(), ml_score = 0.87
WHERE id = $task_id;

COMMIT;
```

## Error Handling & Degradation

| Failure Mode | Degradation |
|---|---|
| Qdrant down | Continue with BM25 + LDR + Firecrawl (no dense search) |
| BM25 index missing | Continue with Qdrant + LDR + Firecrawl |
| LDR timeout (>30s) | Skip LDR, use Qdrant + BM25 + Firecrawl |
| ML sidecar down | Use upstream scores (Qdrant + BM25 + authority), skip ML blend |
| Gemma4 timeout (>15s) | Return top-5 candidates without synthesis |
| Any write failure | Rollback entire transaction, return 500 + error log |

## Metrics & Telemetry

Every stage logs to `deep_research_audit_log`:

```json
{
  "task_id": "uuid",
  "stage": "retrieval|ranking|synthesis",
  "decision": {
    "lane": "qdrant|bm25|ldr|firecrawl",
    "candidates_returned": 50,
    "duration_ms": 87,
    "errors": []
  },
  "timestamp": "2026-07-20T..."
}
```

Accessible via `/admin/deep-research` dashboard (Expandable Details → Error logs).
