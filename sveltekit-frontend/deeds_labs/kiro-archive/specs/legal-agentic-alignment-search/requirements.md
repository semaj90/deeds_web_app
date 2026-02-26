# Legal Agentic Alignment + Search Router - Requirements Document

## Introduction

Extend the Legal Search System with an agentic alignment layer that reads user signals (query negativity, on-task-ness, latency preferences), consults the KAG (Neo4j legal graph), and intelligently routes searches to the optimal backend (RAG-only, RAG+KAG, general web search). The system maintains per-user alignment metrics in Redis, learns user intent patterns, and provides reasoning summaries via Granite. This creates a seamless agent-like experience from document ingestion → semantic search → legal reasoning → frontend UX.

## Glossary

- **Alignment Router**: Agentic component that analyzes user signals and decides search route.
- **ACE Router**: Adaptive Contextual Engine that maps intent + signals to route decisions.
- **User Signals**: Metrics extracted from query (negativity score, legal score, on-task score, latency).
- **Negativity Score**: Measure of emotional language (0.0–1.0) based on keyword matching.
- **On-Task Score**: Measure of legal relevance (0.0–1.0) based on legal keywords + KAG alignment.
- **Intent Label**: Classification of query intent (legal_rag, general_web).
- **Route Decision**: Selected backend path (legal_rag_plus_kag, legal_rag_safe, general_web).
- **KAG**: Knowledge-Augmented Graph (Neo4j) storing legal entities, cases, statutes, relationships.
- **Granite**: IBM's legal reasoning LLM for generating case summaries and reasoning.
- **User Metrics**: Rolling averages of latency, negativity, search count per user in Redis.
- **Alignment Signals**: Structured output containing user_id, intent, route, on_task_score, etc.

## Requirements

### Requirement 1: User Signal Extraction

**User Story:** As an agentic system, I want to extract user signals from search queries so that I can infer intent and emotional state.

#### Acceptance Criteria

1. WHEN a search query is submitted, THE system SHALL compute a negativity_score (0.0–1.0) by counting occurrences of negative keywords (stupid, useless, angry, hate, wtf, trash, garbage) and applying log-scaling.

2. WHEN a search query is submitted, THE system SHALL compute a legal_score (0.0–1.0) by counting occurrences of legal keywords (supremacy clause, preemption, statute, usc, code, complaint, jurisdiction, etc.) and normalizing to [0, 1].

3. WHEN a search query is submitted, THE system SHALL measure query_length (character count) and record it in alignment signals.

4. WHEN a search query is submitted, THE system SHALL measure latency_ms (time from query submission to embedding completion) and record it.

5. WHERE a query contains no keywords, THE system SHALL assign scores of 0.0 for both negativity and legal_score.

### Requirement 2: KAG Alignment Scoring

**User Story:** As an agentic system, I want to check if a query aligns with the existing legal graph so that I can boost confidence in legal_rag routing.

#### Acceptance Criteria

1. WHEN a search query is submitted, THE system SHALL tokenize the query and extract up to 8 tokens (excluding stopwords).

2. WHEN tokens are extracted, THE system SHALL query Neo4j for nodes whose name or cite field partially matches any token.

3. WHEN Neo4j returns matches, THE system SHALL compute kag_match_score as 1.0 - exp(-match_count / 3.0), clamped to [0, 1].

4. WHERE no matches are found, THE system SHALL assign kag_match_score of 0.0.

5. IF Neo4j is unavailable, THE system SHALL fall back to kag_match_score of 0.0 and continue routing.

### Requirement 3: Intent Classification

**User Story:** As an agentic system, I want to classify query intent so that I can decide whether to route to legal_rag or general_web.

#### Acceptance Criteria

1. WHEN legal_score > 0.4 OR kag_match_score > 0.3, THE system SHALL label intent as "legal_rag".

2. WHEN legal_score ≤ 0.4 AND kag_match_score ≤ 0.3, THE system SHALL label intent as "general".

3. WHEN intent is classified, THE system SHALL store it in alignment signals for downstream use.

4. WHERE a query is ambiguous (scores near threshold), THE system SHALL prefer "legal_rag" to maximize legal corpus coverage.

5. IF intent classification fails, THE system SHALL default to "general" and continue routing.

### Requirement 4: Route Decision Logic (ACE Router)

**User Story:** As an agentic system, I want to map intent + user signals to a specific route so that I can optimize search backend selection.

#### Acceptance Criteria

1. WHEN intent is "legal_rag" AND negativity_score ≤ 0.6, THE system SHALL route to "legal_rag_plus_kag" (full RAG + KAG context).

2. WHEN intent is "legal_rag" AND negativity_score > 0.6, THE system SHALL route to "legal_rag_safe" (RAG with guardrails + explanation).

3. WHEN intent is "general", THE system SHALL route to "general_web" (placeholder for web search microservice).

4. WHEN route is "legal_rag_plus_kag", THE system SHALL include KAG context (Neo4j neighborhood) in search results.

5. WHEN route is "legal_rag_safe", THE system SHALL include additional reasoning summary and confidence scores.

### Requirement 5: Per-User Metrics Tracking

**User Story:** As an agentic system, I want to maintain rolling averages of user behavior so that I can personalize routing over time.

#### Acceptance Criteria

1. WHEN a search completes, THE system SHALL update Redis key `user-metrics:{user_id}` with rolling averages of: search_count, avg_latency_ms, avg_negativity.

2. WHEN updating metrics, THE system SHALL compute new average as: (old_avg * old_count + new_value) / (old_count + 1).

3. WHEN metrics are updated, THE system SHALL set Redis TTL to 7 days (604800 seconds).

4. WHERE user_id is not provided, THE system SHALL skip metrics tracking and continue routing.

5. IF Redis is unavailable, THE system SHALL log a warning and continue routing without metrics persistence.

### Requirement 6: /api/search Endpoint

**User Story:** As a frontend developer, I want a unified /api/search endpoint that orchestrates embedding, routing, and result merging so that the SvelteKit UI has a single integration point.

#### Acceptance Criteria

1. WHEN a POST request is received at /api/search, THE system SHALL accept: query (string), user_id (optional), case_id (optional), limit (int, default 10), include_kag (bool, default true), include_reasoning (bool, default true), mode (optional: "fast", "deep").

2. WHEN the request is received, THE system SHALL embed the query using Ollama + embeddinggemma (with Redis L1 cache).

3. WHEN the query is embedded, THE system SHALL run AlignmentRouter.plan() to extract signals and decide route.

4. WHEN the route is decided, THE system SHALL query Qdrant for semantic search results.

5. WHEN results are returned, THE system SHALL optionally enrich chunks with KAG context (if include_kag=true and route includes "kag").

6. WHEN results are enriched, THE system SHALL optionally invoke Granite to generate a reasoning_summary (if include_reasoning=true and route includes "legal_rag").

7. WHEN all processing is complete, THE system SHALL return SearchResponse containing: query, user_id, intent, route_decision, chunks, reasoning_summary, alignment signals.

### Requirement 7: KAG Context Enrichment

**User Story:** As a search system, I want to fetch local neighborhoods from Neo4j so that I can provide legal graph context for reasoning.

#### Acceptance Criteria

1. WHEN a chunk is returned with a case_id, THE system SHALL query Neo4j for nodes connected to that case (up to 10 neighbors).

2. WHEN neighbors are fetched, THE system SHALL return: case node, connected entity nodes, relationship types.

3. WHEN KAG context is returned, THE system SHALL cache it in a per-request dictionary to avoid duplicate Neo4j queries.

4. WHERE a case_id is not found in Neo4j, THE system SHALL return empty KAG context and continue.

5. IF Neo4j is unavailable, THE system SHALL skip KAG enrichment and return chunks without context.

### Requirement 8: Granite Reasoning Summary

**User Story:** As a search system, I want to invoke Granite to generate short legal reasoning summaries so that users understand why results are relevant.

#### Acceptance Criteria

1. WHEN include_reasoning=true AND route includes "legal_rag", THE system SHALL extract top 5 chunk texts.

2. WHEN chunks are extracted, THE system SHALL invoke Granite with a prompt: "Summarize the legal reasoning in these case excerpts in 2-3 sentences."

3. WHEN Granite returns a summary, THE system SHALL include it in the SearchResponse as reasoning_summary.

4. WHERE Granite is unavailable or times out, THE system SHALL set reasoning_summary to null and continue (fail-soft).

5. IF the summary is empty or too short, THE system SHALL omit it from the response.

### Requirement 9: Alignment Signals Response Model

**User Story:** As a frontend developer, I want alignment signals in the search response so that I can display user intent and route information.

#### Acceptance Criteria

1. WHEN a search completes, THE system SHALL return AlignmentSignals containing: user_id, latency_ms, query_length, negativity_score, on_task_score, intent, route_decision, web_search_suggested.

2. WHEN alignment signals are returned, THE system SHALL include on_task_score (0.5 * legal_score + 0.5 * kag_score) for frontend display.

3. WHEN alignment signals are returned, THE system SHALL set web_search_suggested=true if route_decision="general_web".

4. WHERE a signal cannot be computed, THE system SHALL use a default value (0.0 for scores, false for booleans).

5. IF alignment signals are requested but routing fails, THE system SHALL still return partial signals with error indicators.

### Requirement 10: Search Result Chunk Model

**User Story:** As a frontend developer, I want search result chunks to include metadata and optional KAG context so that I can render rich search results.

#### Acceptance Criteria

1. WHEN a chunk is returned, THE system SHALL include: id, case_id, chunk_index, score, text_snippet (first 300 chars), langextract_tags, kag_context (optional).

2. WHEN langextract_tags are included, THE system SHALL preserve: section_type, crime_code, crime_category, entities.

3. WHEN kag_context is included, THE system SHALL contain: case_id, nodes (array of entity nodes), edges (array of relationships).

4. WHERE a chunk has no KAG context, THE system SHALL set kag_context to null.

5. IF a chunk is malformed, THE system SHALL skip it and continue returning other chunks.

### Requirement 11: Error Handling and Fail-Soft Behavior

**User Story:** As a system operator, I want the search system to gracefully degrade when components fail so that users always get some results.

#### Acceptance Criteria

1. IF embedding generation fails, THE system SHALL return HTTP 500 with error message.

2. IF Qdrant search fails, THE system SHALL fall back to Elasticsearch (if available) or return empty results.

3. IF Neo4j is unavailable, THE system SHALL skip KAG enrichment and return chunks without context.

4. IF Granite is unavailable, THE system SHALL skip reasoning summary and return chunks without summary.

5. IF Redis is unavailable, THE system SHALL skip metrics tracking and continue routing.

### Requirement 12: User Metrics Personalization

**User Story:** As an agentic system, I want to use per-user metrics to personalize routing decisions so that frequent users get optimized routes.

#### Acceptance Criteria

1. WHEN a user has completed 10+ searches, THE system SHALL retrieve their user_metrics from Redis.

2. WHEN user_metrics are retrieved, THE system SHALL compute a personalization_factor based on avg_negativity and avg_latency_ms.

3. WHEN personalization_factor is computed, THE system SHALL adjust route_decision: if avg_negativity > 0.5, prefer "legal_rag_safe"; if avg_latency_ms > 500, prefer "fast" mode.

4. WHERE a user is new (< 10 searches), THE system SHALL use default routing logic without personalization.

5. IF user_metrics retrieval fails, THE system SHALL fall back to default routing.

### Requirement 13: Integration with Existing Legal Search System

**User Story:** As a system architect, I want the alignment router to integrate seamlessly with the existing legal-search-system so that all components work together.

#### Acceptance Criteria

1. WHEN /api/search is called, THE system SHALL reuse EmbeddingClient from legal_complaint_ingestion.py (Ollama + embeddinggemma).

2. WHEN /api/search is called, THE system SHALL reuse Qdrant client and query the "legal_complaints" collection.

3. WHEN /api/search is called, THE system SHALL reuse Neo4j driver and query the existing legal graph.

4. WHEN /api/search is called, THE system SHALL reuse Granite client for reasoning summaries.

5. WHERE configuration is needed, THE system SHALL read from environment variables (QDRANT_HOST, NEO4J_URI, REDIS_URL, etc.).

### Requirement 14: Agentic Workflow Integration

**User Story:** As a frontend developer, I want the search system to feel like an agent that learns from user behavior so that the UX feels intelligent and responsive.

#### Acceptance Criteria

1. WHEN a user submits multiple searches, THE system SHALL track their patterns (negativity, on-task-ness, latency preferences).

2. WHEN patterns are detected, THE system SHALL adjust route_decision to match user preferences (e.g., "fast" mode for impatient users).

3. WHEN a user's intent changes (e.g., from general to legal), THE system SHALL detect it and update routing accordingly.

4. WHERE a user is consistently off-task, THE system SHALL suggest web search or clarification prompts.

5. IF a user's metrics indicate frustration (high negativity + low on_task), THE system SHALL route to "legal_rag_safe" with extra explanation.

### Requirement 15: Latency and Performance

**User Story:** As a performance engineer, I want /api/search to return results in < 500ms (p95) so that the frontend feels responsive.

#### Acceptance Criteria

1. WHEN a search is executed, THE system SHALL measure end-to-end latency from query submission to response.

2. WHEN latency exceeds 500ms, THE system SHALL log a warning and include latency_ms in alignment signals.

3. WHEN latency is high, THE system SHALL prefer "fast" mode (skip KAG enrichment, skip reasoning summary).

4. WHERE Redis caching is available, THE system SHALL cache query embeddings and KAG contexts to reduce latency.

5. IF latency consistently exceeds 1000ms, THE system SHALL alert the operator.
