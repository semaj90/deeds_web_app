## ADDED Requirements

### Requirement: Canonical semantic embedding dimension changes only via explicit OpenSpec decision
The value of `ATLAS_CANONICAL_SEMANTIC_DIMENSION` (`sveltekit-frontend/src/lib/server/atlas/retrieval/qdrant-semantic-projection.ts`) and every caller that constructs a query/corpus vector against it (including `atlas-rapids-semantic512-client.ts`'s `exactKnn()`) SHALL agree on the same dimension at all times. Changing this value SHALL require an explicit OpenSpec change that reconciles any existing conflicting canonicalization decisions, not a standalone code edit.

#### Scenario: semantic512 exact-KNN call site stays reachable
- **WHEN** `routes/api/admin/atlas/synthesize/+server.ts` calls `createAtlasRapidsSemantic512Client().exactKnn(...)` with `representationId: 'semantic_512'` and a vector produced by `embedSemantic512()`
- **THEN** the vector's length equals `ATLAS_CANONICAL_SEMANTIC_DIMENSION`, and the call does not throw `ATLAS_SEMANTIC512_QUERY_DIMENSION`

#### Scenario: Qdrant collection name has one source of truth
- **WHEN** any server module (`turbovec-search.ts`, `trace-mcp-server.ts`, `packet-assembler.ts`, `qdrant-recall.adapter.ts`) needs the canonical codebase-chunks Qdrant collection name
- **THEN** it imports the name from `embedding-contract.ts`'s `qdrant_collection` constant rather than hardcoding a literal, so a rename in one place cannot silently diverge from another caller's stale literal
