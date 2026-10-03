## Why

Parent Atlas has multiple retrieval and compute lanes—PostgreSQL lexical/vector search, Qdrant mirrors, Go gRPC retrieval, FastAPI GPU executors, and Mastra/tRPC orchestration—but no single revision-qualified registry contract that describes their relationship to canonical packets. This change establishes that contract before wiring semantic-AST packets, BM25/pgvector, Qdrant collections and tags, IVFFlat/HNSW, cuVS/RAPIDS, Arrow/mmap, and downstream learning or agentic lanes.

## What Changes

- Add a PostgreSQL-owned packet/projection registry contract keyed by workspace, source, packet, content, representation, and revision identities.
- Add additive RPC messages for semantic-AST packet retrieval and lane capability/health receipts.
- Align Go gRPC, FastAPI, tRPC, and Mastra adapters around the same request context and receipt identity.
- Record BM25, pgvector, Qdrant, IVFFlat/HNSW, and cuVS/RAPIDS as distinct projection/executor lanes with explicit collection, tag, model, and index revisions.
- Provide a SvelteKit 2 Parent Atlas Studio read-only view for registry and lane status, reachable from the existing `dev:gpu` runtime.
- Define future Arrow/mmap, XGBoost, PyTorch, reinforcement-learning, DAG-synthesis, HyperGraphRAG, and agentic-dense-search integrations as rebuildable consumers, not canonical stores.
- Keep all promotion, backfill, Qdrant mirror, and database mutation paths behind existing dry-run, lineage, authorization, and independent-readback gates.

## Capabilities

### New Capabilities

- `atlas-rpc-packet-registry`: Revision-qualified registry and cross-lane RPC contracts for canonical packets and projections.
- `atlas-studio-lane-observability`: Read-only SvelteKit view of packet registry, executor health, projection parity, and proof state.

### Modified Capabilities

No existing capability requirements are modified in this change. Existing
retrieval and agent-runtime requirements remain authoritative; this change
adds the registry and adapter contracts they can consume.

## Impact

- PostgreSQL 18/Drizzle schema and additive migrations under the existing canonical packet and workspace ownership model.
- `proto/active` plus generated Go and protobufjs TypeScript bindings.
- Go retrieval service, FastAPI GPU executor, SvelteKit server adapters, tRPC routers, Mastra runtime boundaries, and Parent Atlas Studio UI.
- No new canonical store; Qdrant, Redis/Valkey, Neo4j, cuVS/RAPIDS, Arrow/mmap, XGBoost, PyTorch, and graph/agent lanes remain projections or executors.
