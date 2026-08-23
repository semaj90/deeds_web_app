# Agent runtime alignment audit — 2026-08-22

Scope: tRPC, Mastra, OpenCode, TRACE MCP Streamable HTTP, the local llama-server OpenAI-compatible facade, SQL/ORM ownership, pgvector, and Qdrant semantic storage boundaries. This report is read-only architecture evidence; it does not authorize store mutations, schema migrations, index builds, or protocol migrations.

## Current status

| Surface | Status | Evidence / next gate |
| --- | --- | --- |
| SvelteKit tRPC `/api/trpc` | ALIGNED_STATIC | Route uses `fetchRequestHandler`, app router, request-scoped context, and GET/POST handlers. Runtime smoke still required. |
| Mastra adapters/workflows | PRESENT_UNPROVEN | Multiple Mastra adapters/workflows and contract tests exist. Full package/runtime build remains a separate proof. |
| OpenCode → `hforf.gguf` → `http://127.0.0.1:8090/v1` | ALIGNED_LEGACY_DIALECT | Local configs use the OpenAI-compatible facade. Config is predominantly OpenCode V1 dialect; V2 migration should be explicit, not implicit. |
| llama-server OpenAI facade | CANONICALLY_ALIGNED | Current llama.cpp exposes the expected OpenAI-compatible API family. Live health/model/chat/tool receipt remains local runtime evidence. |
| TRACE MCP HTTP | LEGACY_STREAMABLE_HTTP | Server imports monolithic `@modelcontextprotocol/sdk` v1 transport. It is not yet proven against MCP 2026-07-28 stateless semantics. |
| MCP list caching | NOT_CURRENT_SPEC_PROVEN | 2026-07-28 list results support `ttlMs`/`cacheScope`; current repo audit client/server contracts do not prove this. |
| MCP standard routing headers | NOT_CURRENT_SPEC_PROVEN | 2026-07-28 requires `Mcp-Method` and, for named calls, `Mcp-Name`. Existing ontology probe sends a bare legacy `tools/list`. |
| `.opencode/tools` | MISSING_NONBLOCKING | Current OpenCode docs define `.opencode/tools/` as the project-local custom tool surface. MCP tools remain separate and need not be copied into this directory. |
| Active MCP ownership registry | IMPLEMENTED_UNPROVEN | Contract exists on this branch; population/parity against the live 175-tool surface still requires workstation proof. |
| SQL/query owner | DRIZZLE_NODE_POSTGRES_ALIGNED_STATIC | Shipping DB client uses `drizzle-orm/node-postgres` over one `pg.Pool`. No Kysely runtime import was found. The only Prisma placeholder import in the root shadow adapter was removed on this branch. |
| pgvector session policy | ALIGNED_STATIC | Canonical DB pool sets `hnsw.iterative_scan = relaxed_order` on connect. Runtime extension/index state remains workstation evidence. |
| Legacy ingestion vectors | ALIGNED_SCHEMA_UNPROVEN | `schema-ingestion.ts` now uses Drizzle native `vector(...384)` and UUID document identity, matching the existing legacy ingestion SQL migration. No migration was executed. |
| Parent Atlas `semantic_512` | CANONICAL_CONTRACT_PRESENT | Active persisted/searched Parent Atlas representation remains `semantic_512`; native 768 and legacy ingestion 384 remain separate representation identities. |
| Qdrant | REBUILDABLE_PROJECTION | Existing projection contract says PostgreSQL owns packet/source identity and Qdrant is rebuildable. New storage-boundary contract rejects Qdrant as canonical identity owner. |
| pgvector exact semantic executor | CONFIGURED_UNPROVEN | Existing executor policy allows representation-qualified bounded exact search, but a live `semantic_512` or `semantic_768` pgvector snapshot/column must be proven before promotion. |
| `phase18_reranker` | QUARANTINED | Randomized placeholder scoring must remain non-routable until receipt-backed deterministic inference exists. |

## ORM and SQL ownership

Prisma ORM/Client being open source or available without a hosted subscription is not the deciding architecture issue here. The repository already has a concrete SQL owner: Drizzle + node-postgres.

Freeze this ownership rule:

```text
APPLICATION SQL / TRANSACTIONS / SCHEMA TYPES
                    ↓
           Drizzle + node-postgres
                    ↓
              PostgreSQL
```

Do not add Prisma, Kysely, or TypeORM beside it merely for convenience. Any of those can be good tools in a new codebase, but adding one here would create another query/schema abstraction and increase migration and ownership drift.

Current static evidence:

- `sveltekit-frontend/src/lib/server/db/client.ts` creates the canonical `pg.Pool` and wraps it with Drizzle.
- the same pool owns transaction/raw-SQL escape hatches, so advanced pgvector operations do not require another ORM;
- no Kysely runtime import was found;
- the root shadow `src/lib/server/gateway/state-manager.ts` had an unused `@prisma/client` placeholder import; it was removed rather than installing Prisma.

### Why raw SQL is still valid with Drizzle

Drizzle should own application database access, but it does not have to hide PostgreSQL. Use Drizzle schema/query APIs for ordinary relational operations and parameterized `sql`/`pg.Pool` calls for PostgreSQL-specific primitives such as:

- pgvector distance operators;
- HNSW / IVFFlat session knobs;
- expression and partial indexes;
- `subvector(...)` queries;
- `halfvec`, binary quantization, and sparse-vector experiments;
- `EXPLAIN (ANALYZE, BUFFERS)` and operator-level diagnostics.

That is a single SQL ownership model, not a second ORM.

## PostgreSQL / pgvector / Qdrant boundary

The storage boundary is now explicit:

```text
POSTGRESQL
──────────────────────────────────────────────
canonical packet/source identity
revisions / registries / receipts
relational metadata and filters
FTS
representation-qualified pgvector exact/reference search
legacy vector tables whose representation is explicit

                 projection request
                        ↓

QDRANT
──────────────────────────────────────────────
rebuildable dense ANN projection
sparse/vector retrieval projection
payload indexes / filtered ANN
memory/disk/quantization policy
NO canonical identity authority
```

The two systems may both search semantic evidence, but they are executors/projections for one logical semantic lane. They must not gain independent fusion votes merely because they use different indexes.

### Representation identity is not dimensionality

Current relevant representations must remain distinct:

| Representation | Dimension | Role |
| --- | ---: | --- |
| `semantic_512` | 512 | Active Parent Atlas persisted/searched semantic representation. |
| `semantic_768` | 768 | Native EmbeddingGemma representation / experimental or exact-oracle source. |
| `legacy_ingestion_384` | 384 | Historical legal-document ingestion vector storage. Not Parent Atlas semantic truth. |
| `latent_64` | 64 | Derived routing/control representation only. |

A 384-, 512-, or 768-dimensional vector is never enough to determine representation identity. Every production vector boundary should carry representation ID + representation revision + source/candidate revision.

## Mixed dimensions in pgvector

pgvector can support generic `vector` columns and representation-specific expression/partial indexes, and this is useful for staging or heterogeneous model registries. Do not make an unqualified mixed-dimension vector column the canonical Parent Atlas semantic surface.

Prefer one of these patterns:

1. **Fixed representation column/table** — simplest and strongest for a production indexed lane.
2. **Representation-keyed rows + partial/expression index** — useful when multiple model representations intentionally share metadata storage.
3. **Unbounded `vector` staging column** — acceptable for import/evaluation, but promote into a revision-qualified fixed-dimension representation before it participates in production retrieval.

For example, if a heterogeneous table is ever needed, its uniqueness/index boundary should include the representation identity, not merely `model_id` as an informal convention:

```text
(entity identity, representation_id, representation_revision)
```

and each ANN index should be dimension/representation qualified.

## Subvectors, half precision, binary quantization

These are useful executor optimizations, not new semantic authorities.

Recommended Parent Atlas interpretation:

```text
full admitted representation
        ↓
subvector / halfvec / binary ANN
(coarse candidate generation)
        ↓
CandidateOrdinal
        ↓
full-vector exact or higher-fidelity rerank
        ↓
exact promotion / context materialization
```

Subvector HNSW is especially reasonable for an MRL-compatible experiment, but its receipt should record the source representation, selected dimension range, index revision, and rerank/exact-promotion policy. It must not silently turn a prefix into a new canonical embedding.

## Legacy ingestion drift corrected in this branch

The old `schema-ingestion.ts` described `document_chunks.embedding`, `embedding_cache_enhanced.embedding`, and query embeddings as text-backed arrays while its physical migration creates pgvector `vector(384)` columns. It also typed `document_id` as text while the migration uses UUID.

The branch now aligns the TypeScript schema to the already-existing physical contract:

- native Drizzle `vector(...384)`;
- `document_id` UUID;
- one `LEGACY_INGESTION_VECTOR_DIMENSION = 384` constant;
- explicit comments that this historical lane is not `semantic_512` or native `semantic_768`.

No SQL migration was generated or applied.

## Important compatibility boundaries

### MCP

Do not relabel the existing TRACE server as MCP 2026-07-28 compliant merely because Streamable HTTP works. The current source imports:

- `@modelcontextprotocol/sdk/server/mcp.js`
- `@modelcontextprotocol/sdk/server/streamableHttp.js`

Migration must be a separately tested compatibility tranche.

Required future gates:

1. `MCP-PROTO-01`: pin protocol/SDK revision in runtime receipt.
2. `MCP-PROTO-02`: prove `Mcp-Method` header validation.
3. `MCP-PROTO-03`: prove `Mcp-Name` on `tools/call` and other named requests.
4. `MCP-CACHE-01`: prove deterministic `tools/list` ordering.
5. `MCP-CACHE-02`: prove list `ttlMs` / `cacheScope` behavior before client-side caching is enabled.
6. `MCP-TRACE-01`: propagate W3C trace context through MCP `_meta` without changing tool identity.

### OpenCode

The repo has multiple configuration surfaces (`opencode.jsonc`, `.opencode/opencode.jsonc`, and `sveltekit-frontend/opencode.json`). They must be audited as one effective configuration rather than independently assumed authoritative.

`.opencode/tools/` is absent, but that is only a gap for project-local OpenCode custom tools. TRACE/MCP tools should remain MCP-owned and must not be duplicated there merely to satisfy a static checker.

### llama-server / hforf.gguf

The `8090/v1` boundary is the correct protocol family for the configured OpenAI-compatible provider. Keep model identity and capability claims receipt-backed:

- `/health`
- `/v1/models`
- one bounded `/v1/chat/completions` request
- one bounded tool-call request using the exact exposed model ID

## Remaining vector/storage gaps

1. `representation-matrix-index-contract-v1.ts` still hardcodes `semantic_768` as its canonical matrix/executor representation. Newer canonical chunk/Qdrant policy says persisted/search authority is `semantic_512`. This needs a separate usage audit before changing it.
2. `pgvector_exact` is still `CONFIGURED_UNPROVEN` in the retrieval executor policy; do not call a specific Parent Atlas pgvector semantic column runtime-proven until a revision-qualified live snapshot is checked.
3. Historical 384 migrations remain in the repo. They should be classified as legacy/history, not rewritten in place to 512 or 768.
4. Qdrant and pgvector must return into the same CandidateOrdinal/semantic-lane normalization boundary before fusion.

## Next implementation order

1. Run the updated static alignment audit and vector boundary specs.
2. Reconcile the local deep MCP audit (`READ/AUDIT/PROPOSE/APPLY`) into GitHub before changing active routing.
3. Audit usages of `representation-matrix-index-contract-v1.ts`; migrate it from hardcoded semantic_768 authority to a representation-qualified contract only after callers are understood.
4. Prove the desired pgvector exact snapshot/column against live PostgreSQL read-only metadata (`pg_type`, `pg_attribute`, `pg_indexes`, `vector_dims`) before enabling `pgvector_exact` as PROVEN_AVAILABLE.
5. Keep Qdrant `semantic_512` as the persistent ANN projection and prove CandidateOrdinal parity against the exact oracle.
6. Benchmark optional pgvector subvector/halfvec/binary indexes as challengers with Recall@K + latency + index size; do not promote based on speed alone.

## Non-goals

- No Postgres/Qdrant/Neo4j/Valkey writes.
- No schema migration or HNSW/IVFFlat build in this branch.
- No Prisma/Kysely/TypeORM installation.
- No automatic MCP v2 migration.
- No OpenCode V2 config rewrite.
- No resurrection of `phase18_reranker`.
- No duplication of MCP tools into `.opencode/tools`.
