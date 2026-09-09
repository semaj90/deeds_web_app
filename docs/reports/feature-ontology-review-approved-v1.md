# REL-01A Human Review Decision — 2026-09-09T01:09:46.272Z

**canonicalAuthority remains false on every row.** REL-01B not performed.

## Approved (32)

- `const MIN_JOIN_COVERAGE` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `function scoreSectionRelevance` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `interface BinaryVectorArtifactV1` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `const DOMAIN_PATH_HINTS` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `function canonicalJson` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `type ResearchDomain` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `type CanonicalTraceRow` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `function persistTemporalRecommendationOutcomeIfEnabled` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `const TEMPORAL_RECOMMENDATION_OUTCOME_PRODUCER` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `const DOMAIN_TAGS` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `qdrant` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `const CANONICAL_COLLECTION` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `type InferenceRuntimeConfig` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `function hashContent` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `function traceRerank` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `interface GRPORerankResult` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `PostgreSQL` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `function preventLoop` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `Neo4j` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `interface RerankableChunk` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `interface TopologyProjectionV1` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `function scoreEntityOverlap` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `const SECTION_RELEVANCE` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `type TraceRerankResult` — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `interface OntologyObservationV1` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `interface LangGraphDomainClassificationRequest` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `function extractQueryEntities` — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `function explicitTemporalAlternativeToolSuccess` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `type AgentState` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `StateGraph` — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `interface PacketIdentityV1` — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `const DOMAIN_QUERY_PREFIX` — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts

## Rejected (221, showing first 30)

- `into` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `reranking` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `langgraph` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `Parent` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `retrieval` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `limit` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `W_SECTION` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `const matched` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `Graph` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `START` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `const ent` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `optional` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `const ENTITY_CACHE_TTL` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `chunkHits` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `registry` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `via` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `from` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `Capabilities` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `<anonymous>` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `const W_ENTITY` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `const needle` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts
- `suggestFix` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `CanonicalTraceRow` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `const persisted` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts
- `DAG` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `const canonicalRow` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `run` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts
- `through` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-client.ts
- `const associatedLenses` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/trace-reranker.ts
- `LangGraph` (generic local variable / low ontology value) — sveltekit-frontend/src/lib/server/ai/langgraph-research.ts

... and 191 more (see JSON)
