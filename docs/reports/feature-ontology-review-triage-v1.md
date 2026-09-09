# REL-01A Review Triage — 2026-09-09T00:57:59.099Z

**Read-only. Zero writes.** 51 candidates excluded (stale source: `sveltekit-frontend/src/lib/server/retrieval/cross-encoder-reranker.ts`).
253 candidates triaged mechanically — confidence field ignored (uniformly 0.5, no signal).

## Bucket counts

- `LIKELY_NOISE`: 26
- `UNCERTAIN`: 148
- `LIKELY_SYMBOL`: 72
- `GROUNDED`: 7

## GROUNDED (7) — real source-span evidence, review these first

- `qdrant` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `Qdrant` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `PostgreSQL` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `Neo4j` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `Record` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `StateGraph` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `StateGraph` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts

## LIKELY_SYMBOL (72) — real code declarations, plausible concepts

- `const MIN_JOIN_COVERAGE` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `function scoreSectionRelevance` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `interface BinaryVectorArtifactV1` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `const DOMAIN_PATH_HINTS` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `const matched` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `function canonicalJson` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `const ent` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `type ResearchDomain` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `const ENTITY_CACHE_TTL` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `type CanonicalTraceRow` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `const W_ENTITY` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `const needle` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `function persistTemporalRecommendationOutcomeIfEnabled` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `const persisted` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `const TEMPORAL_RECOMMENDATION_OUTCOME_PRODUCER` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `const DOMAIN_TAGS` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `const canonicalRow` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `const associatedLenses` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `const chunkHits` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `const canonicalRowByRef` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `const str` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `const CANONICAL_COLLECTION` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `type InferenceRuntimeConfig` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `const value` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `const keys` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `const row` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `const canonicalRows` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `function hashContent` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `function adjustStrategy` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `const lensHits` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `function traceRerank` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `const memoryHits` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `const key` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `interface GRPORerankResult` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `const sortedObj` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `function preventLoop` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `const authoritativeOutcome` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `const result` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `const W_SECTION` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `interface RerankableChunk` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts

... and 32 more (see JSON)

## LIKELY_NOISE (26) — stopwords/fragments, low review priority

- `into` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `limit` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `START` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `optional` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `via` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `from` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `<anonymous>` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `run` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `ace` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `are` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `lib` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `the` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `orm` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `with` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `<anonymous>` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `for` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `from` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `not` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `str` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `<anonymous>` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts

... and 6 more (see JSON)

## UNCERTAIN (148) — needs an actual human look

- `reranking` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `langgraph` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `Parent` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `retrieval` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `W_SECTION` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `Graph` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `chunkHits` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `registry` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `Capabilities` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `suggestFix` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `CanonicalTraceRow` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `DAG` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `through` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `LangGraph` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `ACE` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `lensHits` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `DOMAIN_TAGS` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `LangExtract` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `Implements` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `Promise` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `neighbor` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `parallel` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `W_ENTITY` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `PacketIdentityV1` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `synthesizer` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `executeTool` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `parseToolCall` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `rerank` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `DAG` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `cache` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `lensesToRetrieve` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `lane` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `server` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `END` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `plan` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `classifies` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `merge` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `canonicalJson` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `matched` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `extension` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts

... and 108 more (see JSON)
