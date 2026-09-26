## Context

Parent Atlas already has PostgreSQL packet/chunk tables, PostgreSQL full-text
and pgvector paths, Qdrant collections, Go retrieval gRPC, FastAPI GPU
executors, tRPC/SvelteKit server code, and Mastra orchestration. They are not
yet described by one revision-qualified registry contract. The registry must
make canonical identity and projection health observable without turning a
projection or executor into an authority.

## Goals / Non-Goals

**Goals:**

- Reuse `atlas_packets`, workspace/source revision owners, and Drizzle rather
  than creating a second packet identity table.
- Define additive RPC contracts for semantic-AST packets, lane capabilities,
  and receipts.
- Represent PostgreSQL BM25/pgvector, Qdrant, IVFFlat/HNSW, and cuVS/RAPIDS
  as separate lanes with model, index, collection, tag, and checksum revisions.
- Align Go gRPC, FastAPI, tRPC, protobufjs, and Mastra context identity.
- Provide read-only Parent Atlas Studio observability under `dev:gpu`.
- Leave Arrow/mmap, XGBoost, PyTorch, reinforcement learning, DAG synthesis,
  HyperGraphRAG, and agentic dense search as downstream consumers.

**Non-Goals:**

- No new canonical packet store or dual embedding authority.
- No automatic database migrations, packet backfills, Qdrant writes, cache
  warming, model training, or promotion.
- No requirement for `ts-proto`; frontend protobuf generation remains
  protobufjs and Go generation remains `protoc`.
- Unrelated frontend dependency/build repair is out of scope: this change does
  not introduce, remove, or promote `nodemailer`, `mammoth`, Babylon loaders,
  or any Svelte build workaround.
- No direct Mastra/LangGraph writes to durable stores.

## Decisions

1. **PostgreSQL owns identity.** `atlas_packets` and existing workspace/source
   revision tables remain canonical. A future registry relation may index
   projection metadata, but its packet foreign key and revisions must resolve
   back to PostgreSQL truth.

2. **RPC carries qualified packets, not authority.** Additive protobuf messages
   carry caller-owned workspace/packet revisions, source references, exact AST
   spans, parser/grammar revisions, and receipts. The semantic-AST RPC is
   read-only; a producer admission path is separate and gated.

3. **One logical lane per executor family.** BM25, pgvector, Qdrant dense,
   Qdrant sparse/tags, IVFFlat, HNSW, cuVS/RAPIDS, and FastAPI are recorded as
   distinct lane descriptors. SearchRuntime owns normalization and fusion;
   mirrors do not add votes merely because they contain the same packet.

4. **Transport split.** Go gRPC is the retrieval service boundary. FastAPI is
   the optional GPU executor boundary. tRPC is the SvelteKit application
   boundary. Mastra consumes typed tools/context and never writes stores
   directly. Protobufjs remains the frontend generated-artifact owner.

5. **Studio is observational.** The Parent Atlas Studio page reads registry,
   health, parity, and proof receipts through tRPC/server adapters. `dev:gpu`
   may start optional executors, but startup remains valid in Engram-only mode.

6. **Future compute is rebuildable.** Arrow/mmap manifests, XGBoost/PyTorch
   features, RL policies, DAG plans, HyperGraphRAG context, and agentic dense
   search consume revisioned packet snapshots and emit receipts. They cannot
   create canonical identity.

## Risks / Trade-offs

- [Registry drift] → Require independent readback and checksums against
  PostgreSQL packet/source revisions before marking a projection healthy.
- [Duplicate retrieval votes] → Record logical lane and executor identity and
  let SearchRuntime deduplicate before fusion.
- [Optional GPU outage] → Return explicit unavailable receipts and preserve
  CPU/PostgreSQL read-only behavior.
- [Schema expansion] → Use additive migrations, `to_regclass` guards, and
  dry-run reports before any live DDL.
- [RPC incompatibility] → Reserve fields, regenerate Go/protobufjs artifacts,
  and run replay/identity tests before rollout.

## Migration Plan

1. Freeze the registry and packet identity contract in specs and protobuf.
2. Add read-only schema introspection and Drizzle types; do not apply DDL.
3. Add RPC messages and generated bindings with fixture tests.
4. Add Go/FastAPI/tRPC adapters and health/receipt readback.
5. Add a read-only Studio page and `dev:gpu` capability display.
6. Run production mutation only through a later, separately authorized
   migration and promotion change.

## Open Questions

- Whether registry projection rows belong in a new additive table or an
  existing packet metadata/manifest relation after live schema audit.
- Which existing 8095 producer is authorized to emit the first canonical AST
  packet cohort.
- Whether the FastAPI GPU lane should expose gRPC directly or remain HTTP with
  a Go adapter.
