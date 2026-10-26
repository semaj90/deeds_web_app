# Parent Atlas HyperRAG Production Readiness Audit

**Status: PARTIAL — not production-ready for synthesis or admitted context.**

Scope: read-only source audit of `/api/search/hyperrag`, its SearchRuntime and optional Function Registry/HyperRAG callers, existing ACE admission owners, and focused tests. Read-only TCP probes found PostgreSQL `5432`, Qdrant `6333`, NLP sidecar `8095`, and SvelteKit `5173` reachable; embedding service `8097` was unavailable. No DB query, cache request, HTTP route request, GPU job, or service restart was performed. `svelte-check` was not run.

| Stage | Existing owner / caller | Evidence state | Production gap |
|---|---|---|---|
| Request/auth | HyperRAG POST route; Zod query schema | Focused route tests pass 7/7 | JSON body has no explicit byte-size cap before `request.json()`; rate/abuse controls were not verified in this audit. |
| Intent/OAK | `classifyAtlasQuery`; optional OAK enrichment | Caller present; OAK failures collapse to empty evidence | Failure/degraded status is not distinguishable from an empty successful enrichment in this response. |
| Candidate retrieval | `SearchRuntime` with `readOnly: true` | Route contract test confirms read-only config; source audit found write-side promotion, recommendation, rerank-cache, shadow-receipt, and policy-training paths guarded or disabled in read-only mode | No live request/receipt this audit; this route does not use the separate pgvector orchestrator. `pgvector:false` is explicit, not a measured live status. |
| Function Registry | Existing read-only PostgreSQL snapshot loader and 8095 AST adapter | Revalidated one-symbol readback: symbol version `symbol-version:0c6919c323dfd1c95920a33679764d0b32f19a645c1ec2198ebbc773294781c7`, packet `packet:804cec79a65c`, native node `3561bb301bdf5dcab4a7134afd843fb78da32acb`, exact source digest `efd35051d50fc241012b1f17d043199974294dd6aadfbd87409056aa5a599444`, snapshot checksum `242661a300928b3e860ac98aeecc7404856eb978de1152242be7bbc2a29c8091` | One callable projection revision mismatch remains; the feature flag is disabled and the snapshot is not SearchRuntime consumption or ContextManifest admission. |
| Graph enrichment | `runHyperRagFusionRuntimeV1`, bounded to two hops and fanout 20 | Owner/caller present; focused adapter tests pass after aligning the fixture edge with the packet's canonical feature ID | No live graph snapshot/revision proof in this audit; failure reason is now generic to prevent leaking database details. This SearchRuntime route has no Neo4j retrieval source type, so provenance correctly remains `neo4j:false`; HyperRAG/Postgres enrichment is not proof of Neo4j. |
| Context admission | Existing ACE feature snapshot and ContextManifest owners | `/api/search/hyperrag` does not call them; synthesis request returns `BLOCKED_CONTEXT_MANIFEST_REQUIRED` | No revision-qualified feature-source provider or admitted manifest on this route. This is the first mandatory vertical blocker. |
| Cache / synthesis | SearchRuntime read-only policy; synthesis guarded | Cache writes/synthesis are disabled by current route behavior | Route reports `redis:false`; no live Valkey connection/hit, cache readback, or same-evidence cold/warm parity demonstrated. |

## Changes in this audit

- HyperRAG provenance reports `neo4j:false`: the route's current SearchRuntime source union has no Neo4j executor. AST or Postgres-backed graph evidence must not be relabeled as Neo4j provenance.
- Route-level failures return `Search unavailable`, not raw exception text.
- Hypergraph fusion failures return `HYPERRAG_FUSION_UNAVAILABLE`, not the underlying exception message.
- Added regression coverage for redacting graph lookup failures.
- Corrected a fixture-only identity mismatch: the test graph edge now targets the feature ID carried by its ACE packet; production identity checks were unchanged.

## Validation

- `npx --no-install tsx scripts/atlas/audit-function-discovery-readback-v1.mts --query=getErrorClustering --workspace-revision=sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc --limit=1 --qualify`: exit **0**, `QUALIFIED_SNAPSHOT_READBACK_PROVEN`; 1 candidate, 1 exact AST observation, 1 source binding, exact source bytes/hash and packet verified. Projection revision difference count **1**; ContextManifest admitted **false**; writes **false**.
- `npx vitest run src/routes/api/search/hyperrag/server.route.test.ts src/lib/server/atlas/integration/hyperrag-fusion-runtime-adapter-v1.spec.ts`: exit **0**, **11/11** (route **7/7**, fusion adapter **4/4**). The redaction test intentionally logs a synthetic secret-bearing exception; the response assertion verifies it is not returned to the caller.
- `openspec validate parent-atlas-retrieval-lod-algorithm-taxonomy --strict`: exit **0**. Scoped `git diff --check` on audit files: exit **0**. Repository-wide `git diff --check`: exit **2** due trailing whitespace in the worktree's generated `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CMakeConfigureLog.yaml`; that generated file is outside this audit's changes.
- `svelte-check`: **NOT RUN**. If requested, capture complete stdout/stderr and exit status to a `.txt` file before interpreting it.

## Required next gates

1. Resolve the ACE v3 relationship-evidence contract/test mismatch against the authoritative package schema and actual facade output.
2. Bound request body bytes and make OAK degradation explicit in the stable response shape.
3. Wire the existing revision-qualified feature-source provider into the route's existing ContextManifest admission owner; do not synthesize feature rows or revisions.
4. Implement the revision-qualified feature-source provider before attempting manifest admission; then run a single read-only live request with one semantic executor and record request, workspace/source/representation/graph revisions, candidate identities, source evidence, and manifest checksum.
5. Separately verify Valkey behavior only if cache use is enabled; keep cache and DB writes disabled until independently authorized and read back.

**Writes performed:** database 0; cache 0; GPU 0; service restarts 0. **Canonical authority:** false. **Final gate:** PARTIAL. The 8095 sidecar being reachable on TCP does not prove this route consumes its AST/source evidence; no pgvector or Valkey route integration was demonstrated.

```yaml
likely_cause: The live retrieval path stops before revision-qualified ACE feature-source admission, so retrieved candidates cannot yet become an admitted ContextManifest.
evidence: [sveltekit-frontend/src/routes/api/search/hyperrag/+server.ts, sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-context-manifest-shadow-v1.ts, docs/reports/atlas-function-registry-live-ast-contract-v1.json, focused Vitest results above]
patch_targets: [sveltekit-frontend/src/routes/api/search/hyperrag/+server.ts, sveltekit-frontend/src/lib/server/atlas/integration/hyperrag-fusion-runtime-adapter-v1.ts, sveltekit-frontend/src/routes/api/search/hyperrag/server.route.test.ts, sveltekit-frontend/src/lib/server/atlas/integration/hyperrag-fusion-runtime-adapter-v1.spec.ts, openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/tasks.md]
safe_next_command: "cd sveltekit-frontend && npx vitest run src/lib/server/atlas/integration/hyperrag-fusion-runtime-adapter-v1.spec.ts"
smoke_command: "cd sveltekit-frontend && npx vitest run src/routes/api/search/hyperrag/server.route.test.ts"
report_path: docs/reports/atlas-hyperrag-production-readiness-audit-2026-10-15.md
```
