# Search Fusion Owner Census — 2026-10-18

## Verdict

`SEARCH-OWNER-01` remains `PARTIAL / MIGRATION_NOT_AUTHORIZED`. The earlier two-caller summary is incomplete: `rrf-fuse.ts` already delegates contribution arithmetic to `fusion-core-v1.ts`, while several other local RRF implementations remain. The callers also operate on different candidate and lane contracts, so routing all of them through SearchRuntime would not be behavior-preserving by default.

## Current owners and callers

| Surface | Current behavior | Migration constraint |
| --- | --- | --- |
| `sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts::fuseSearchRuntimeCandidates` | SearchRuntime fusion; requires packet key and source reference, groups logical lanes, computes ranks from candidate scores, and applies SearchRuntime identity/tie-break rules. | Canonical retrieval owner; do not alter without output parity on the same normalized candidates. |
| `sveltekit-frontend/src/lib/server/retrieval/rrf-fuse.ts::reciprocalRankFusion` | Compatibility adapter retains weighted lanes, identity normalization, logical-lane collapsing and output provenance; its cross-lane score aggregation calls `fuseContributionsV1`. | Already shares arithmetic core, but is not semantically identical to SearchRuntime. |
| `sveltekit-frontend/src/routes/api/rag/search-fused/+server.ts` | Legal-document Qdrant dense plus PostgreSQL sparse lanes; weights 0.6/0.4, `k=60`, route-specific response shape. | Separate legal-search route; retrieval, auth and lane behavior need a route-level replay. |
| `sveltekit-frontend/src/mcp/tools/repair_tools.ts::marco_rerank_chunks` | Reranks caller-supplied candidates across six weighted signals; does not itself retrieve candidates. | Not a SearchRuntime endpoint; preserve tool input and weighted signal semantics. |
| `sveltekit-frontend/src/routes/api/admin/parents-atlas/actions/+server.ts` and `src/routes/api/admin/atlas/query/+server.ts` | Inline route-local `rrfFuse` helpers. | Classify route scope and output contract before any consolidation. |
| `sveltekit-frontend/src/lib/server/routing/query-router-4x4.ts` and `src/lib/server/features/ai/ace/context-assembler.ts` | Additional local fusion helpers for routing/context assembly. | Not established as interchangeable retrieval RRF callers; retain until owner/caller contract is proven. |
| `sveltekit-frontend/src/lib/server/retrieval/rrf-combiner-utils.ts` | Uses the shared `fuseContributionsV1` arithmetic core while preserving its own envelope and metadata handling. | Shared arithmetic does not imply shared identity or response ownership. |

## Replay status and safe next gate

The existing `rf7-09-bounded-live-replay.test.ts` exercises real Qdrant packet identities against `rrf-fuse.ts` and the shared arithmetic core; it does not compare the legal route or MCP caller against SearchRuntime. No route-level replay was run in this audit. The legal endpoint invokes embedding, Qdrant, and PostgreSQL reads; the MCP reranker receives caller-provided data. A safe migration gate must capture equivalent normalized lane inputs for each intended caller, compare identity sets, per-lane votes, scores, tie ordering, and final Top-K, and account for SearchRuntime's known side effects or explicitly use its read-only mode.

No code, database, Qdrant, Neo4j, Valkey, or runtime state was changed for this census. Do not mark fusion consolidation complete or enable cluster routing from this evidence.
