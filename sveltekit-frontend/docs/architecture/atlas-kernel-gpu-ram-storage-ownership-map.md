# Atlas Kernel / GPU / RAM / Storage / Search Ownership Map

**Purpose**: a DRY lookup table. Before building a new discovery/orchestration mechanism for
"what depends on X" / "who owns Y" / "how do I traverse Z", check this table and the two MCP
servers it names first — per root `CLAUDE.md`'s "Duplication Prevention — Audit Before You Build"
and "One Canonical Runtime Owner Per Capability" rules. Verified live 2026-09-08; re-verify before
citing further, this table decays like any other status snapshot.

## Layer map

| Layer | Owner file(s) | Status (verified 2026-09-08) |
|---|---|---|
| **CPU/Python kernel boundary** | `src/lib/server/atlas/kernel/atlas-kernel-session.ts` | Real, strict Zod contract. Python is model-facing/compute-only (`authoritativeHostLanguage: 'TYPESCRIPT'`, `canonicalWritesAllowed: false`, `securitySandbox: false`). Every kernel output is a *nomination* (`CandidateSetV1`, `ClaimNominationV1`, `AgenticFileMutationPlanV1`, `PrefillCompilationNominationV1`, `SubtaskNominationV1`) — the kernel can never itself write canonical state. |
| **GPU compute** | GPU-MINI-FABRIC-01 (`python/atlas_compute/*`; see root `CLAUDE.md`) | cuVS/cuGraph/CUB-radix proven per-phase against CPU/NetworkX oracles. **No GNN (trained graph neural network) exists anywhere in this repo** — "graph GPU work" here is PageRank/BFS/Louvain parity (cuGraph vs NetworkX), not a learned model. cuTile is `ENVIRONMENT_BLOCKED` on this dev host (CUDA 13.0 toolkit ships only a compiler-intrinsic stub) — do not plan work assuming it runs. |
| **Spectral / eigen / PCA / SVD** | `python/atlas_compute/spectral.py`, `low_rank.py`, `rapids_matrix.py`, `parent_atlas_spectral_multihop.py`, `representation_compare.py`; TS-side candidate matrix at `src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts` | Files exist; live-caller wiring **not audited** this pass — treat as `UNCONFIRMED_WIRING`, verify before reuse. |
| **RAM/cache** | `src/lib/server/cache/*` (30+ files: Redis/Valkey, semantic/embedding/reward caches) | Real callers widely, but only **1 spec file across 30+ modules** (`ace-packet-cache-v1.spec.ts`) — a real test-coverage gap, not yet closed. |
| **Canonical storage → retrieval** | Postgres (truth) → Qdrant/Neo4j mirrors → `src/lib/server/atlas/go-retrieval-grpc-client.ts` | **RUNTIME_PROVEN, fixed 2026-09-08**: gRPC path is an intentionally-unimplemented stub (falls through by design); HTTP fallback's routes were fictional, now fixed to call the real `POST /search/codebase` route and map its (snake_case) response — live-proven, returns real evidence packets. `buildContextFromGoHttp`/`validatePacketFromGoHttp` have the same fictional-route bug, not yet fixed (separate, lower-priority). |
| **Neo4j fanout / n-ary relations** | `src/lib/server/atlas/graph/relationship-kernel-neo4j-projector-v1.ts`, wired 2026-09-08 into `src/lib/server/atlas/kag-taxonomy-candidate-postgres.ts`'s `decideTaxonomyAssignmentCandidateV1()` via `hyperedgeToRelationshipKernel()` (`src/lib/server/graph/hyperedge-contract.ts`) | **CLOSED, both sides proven live 2026-09-08**. Consumer-side (traversal whitelist in `multihop-contextual-tree.ts`) and producer-side (nothing called the projector) were both fixed same-day. Live end-to-end proof: promoting a real taxonomy candidate through Postgres now mirrors a real edge into Neo4j — verified via `MATCH ()-[r:ENTITY_CLASSIFIED_AS]->() RETURN count(r)` going 0→1 against the live instance, independent of the call's own return value. Mirror is best-effort/non-blocking (`neo4jMirrored`/`neo4jMirrorError` on the `'promoted'` outcome); a mirror failure never reverts the Postgres promotion. Test data cleaned up after the proof. |
| **External search** | `src/lib/server/ldr/web-search-client.ts::searchViaSearXNG()` (real `SEARXNG_URL` fetch) → `src/mcp/tools/ldr-research.ts` (`executeLDRResearch`) → `ldr-research-tools.ts` (Streamable-HTTP wrapper, registered in `src/mcp/trace-mcp-server.ts` as tool `ldr_research`) | **RUNTIME_PROVEN 2026-09-08** — a real `tools/call` for `ldr_research` executed a genuine SearXNG search + llama-server (Ornith) synthesis end-to-end. Not fragmented: `ldr-research-tools.ts` intentionally wraps `mcp/tools/ldr-research.ts` rather than duplicating it (confirmed via its own header comment). |
| **Agent orchestration (DAG/workflow)** | `atlas-mastra-workflow.ts`, `agentic-file-compiler/mastra-workflow-compiler.ts`, `hermes-mastra-orchestrator.ts`, `okf/mastra-workflows.okf.yaml`; kernel plugs in via `ContextToolDagV1` (`workflow/context-tool-dag-contracts.ts`) | Real, wired to the kernel contract above. |
| **DRY lookup layer for agentic work** | `atlas-tools` MCP (`scripts/mcp/atlas-tools-mcp.mjs` — Neo4j-Cypher generic graph queries: `find_feature`/`find_route`/`find_dependencies`/`trace_database`/`trace_tool_chain`/`find_source_refs`/`classify_intent`/`build_agentic_rag_context`/`build_recommendation`/`record_outcome`) + `atlas-task-kernel` MCP (`scripts/mcp/atlas-task-kernel-mcp.mjs` — narrower, read-only: `atlas_context`/`atlas_inspect`/`atlas_expand`/`atlas_verify`/`atlas_research`; never exposes raw Python or storage ops) | Both live, both local stdio servers per `.mcp.json`. Confirmed **no overlap** with recommendation/validation/cache internals (no `validation`/`cache`/`outbox` keyword hits in `atlas-tools-mcp.mjs`). **Check these two MCP tools before writing new discovery code.** |

## Known drift vs. other docs

Root `CLAUDE.md`'s MCP tool-count claims for `src/mcp/trace-mcp-server.ts` (42 tools, including
`graph.expand_neighborhood` / `graph.shortest_path` / `clusters.get_summary_lenses`) are
**confirmed stale as of this pass** — those specific graph tool names were not found registered
live. Treat that section as aspirational until re-verified against a live `tools/list` call, not
as current fact.

## Related findings from this pass (recorded, not all fixed)

- `scripts/opencode/validation-gate.mjs` and `scripts/opencode/alias-card-mapper.mjs` — both `.mjs`
  files used CommonJS `require()`, which throws under real ESM. **Fixed 2026-09-08** (converted to
  `import`/`export`), verified by running `node scripts/opencode/validation-gate.mjs` cleanly.
  Still zero real callers — this was a demonstration/simulation script, not a live pipeline stage.
- `src/lib/server/retrieval/cold-storage-retrieval-service.ts` vs
  `src/lib/server/features/rag/cold-storage-retrieval-service.ts` — **not a duplicate**: the
  `retrieval/` file is a thin `export *` re-export of the real `features/rag/` implementation, and
  `hyperrag-fusion-service.ts` correctly imports the `retrieval/` alias path. Only fix needed was a
  stale header comment claiming the wrong file path (fixed).
- `parent-atlas-trace-search-joinback-proof/tasks.md`'s "SOM / KMeans / topology" inventory line
  named two files that don't exist (`atlas_embedding_tools.ts`, `scripts/agents/som-cluster-cards.mjs`)
  — corrected to point at the real owners (`src/lib/server/graph/som-topology-pipeline.ts`, wired
  via `mcp/server.ts`'s `graph.index` tool). `src/lib/server/retrieval/phase2-som-training.ts` and
  `phase2-kmeans-clustering.ts` are real files with zero callers — flagged, not archived (needs an
  explicit keep/archive decision).
- `src/lib/server/retrieval/feature-record.ts` — real, typed, versioned CRUD module with
  supersession support — zero callers repo-wide. Flagged, not archived.
- `scripts/opencode/validation-gate.mjs`'s companion — `phase109a-mcp-tools.ts` — is genuinely
  dual-registered in both `src/mcp/server.ts` and `src/mcp/trace-mcp-server.ts`, and is the one
  real, live MCP-discoverable entrypoint in the "recommendation record" cluster.

## Runtime-proof status (updated 2026-09-08 — direct-invocation proofs run this pass, bypassing the need for the SvelteKit dev server)

**Proven genuinely working** (direct function/tool invocation against live Postgres/Neo4j/Valkey/
SearXNG/llama-server, not mocked):
- **Recommendation record**: `phase109a_query_signal_history` over live `trace-mcp-server` (`:8788`)
  round-trips through Drizzle to Postgres cleanly. Table (`semantic_lifecycle_events`) is currently
  empty, so only the empty-result path was proven.
- **Hot/cold storage**: `engram.ace_packet_inject` (MCP) → real Valkey write, independently
  confirmed via a raw `valkey-cli GET`. `ColdStorageRetrievalService.search()` → real pgvector
  query against `embedded_summaries`, returned 2 real rows.
- **NLP/LDR sidecar**: `ldr_research` over `trace-mcp-server` executed a real SearXNG search and a
  real llama-server (Ornith) synthesis pass end-to-end (8.5s, `success:true`). The
  `ldr-research-tools.ts` vs `mcp/tools/ldr-research.ts` "fragmentation" concern was **retracted**
  on inspection — the former intentionally wraps the latter, confirmed by its own header comment.
- **Graph retrieval (hyperedge half)**: `traverseHop1()` round-trips through `searchHyperedges()`
  to live Postgres cleanly. This is a separate mechanism from the Neo4j relationship-kernel path
  below — both real, only one currently populated.
- **Validation receipts — FIXED 2026-09-08**: `reviewAndSaveExecution()` previously threw `column
  "execution_id" does not exist` (Postgres `42703`); root-caused to two unmigrated tables
  (`tool_call_events` missing 12 columns, `execution_reviews` missing `evidence_refs`) — both
  confirmed via a sibling table (`outcome_ledger`) already having the intended shape and a second
  independent call site (`routes/api/agent/execute/+server.ts`'s own INSERT) expecting the same
  columns. Fixed with two additive migrations
  (`drizzle/manual/20260908_tool_call_events_execution_columns.sql`,
  `drizzle/manual/20260908_execution_reviews_evidence_refs.sql`), applied with operator
  authorization, zero data loss (120 pre-existing rows unchanged). Verified end-to-end: a real
  call now returns a well-formed result and genuinely persists to `execution_reviews`; `POST
  /api/agent/execute`'s previously-silent no-op telemetry step is unblocked too.

**Proven genuinely broken, not yet fixed** (real, previously-undocumented bugs found via direct invocation):
- **Tensor/gRPC**: `retrieveFromGo()` fails on both paths — the gRPC client init returns `null`,
  and the HTTP fallback's hardcoded URLs (`/retrieval/retrieve`, `/context/build`, `/validate`)
  match none of the real Go service's routes (`/search/evidence`, `/search/research`,
  `/search/codebase`, `/search/bm25`, `/stats`). All 3 real call sites (including `POST
  /api/atlas/runtime-retrieve`, which has no try/catch around this call) would throw on any real
  invocation.

**Not exercised, deliberately** (safety, not oversight):
- `runSOMTopologyPipeline` — needs the native `tensorrt_bridge.node` GPU addon and would mutate
  live shared Qdrant payloads + write real Neo4j edges. Running it "as a test" against shared data
  is unsafe without a bounded fixture first, matching this repo's own GPU-MINI-FABRIC-01
  proving-ground discipline.
- `POST /api/atlas/runtime-retrieve`, `POST /api/agent/execute`, `POST /api/hypergraph/traverse`
  as actual HTTP routes — the underlying functions were proven/disproven by direct invocation
  above; the HTTP layer itself needs the SvelteKit dev server running, not started this pass.

**Outstanding**: none of the above direct-invocation proofs were committed as real `*.spec.ts`
test files — they were one-off scripts run manually. Converting them into real, repeatable tests
remains open work.

See `openspec/changes/parent-atlas-trace-search-joinback-proof/tasks.md`'s "Repository-first
search inventory" section for the full per-cluster detail and citations.
