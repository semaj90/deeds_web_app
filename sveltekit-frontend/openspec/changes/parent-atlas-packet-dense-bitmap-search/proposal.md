## Why

No registered MCP tool currently combines Postgres structural filtering with dense (embedding)
similarity over `atlas_packets` in one call. `atlas.packet_search` (the only packet-search MCP
tool) is explicitly structural/FTS-only — its own description says "use this to find packets
associated with a file or feature **before** querying Qdrant" — so an OpenCode/agent caller who
wants filtered dense retrieval today must make two uncoordinated tool calls and stitch the results
together itself, with no shared identity contract between them. Meanwhile `atlas_packets` already
carries ~40 GIN/btree indexes purpose-built for multi-predicate bitmap filtering
(`tags`, `concept_ids`, `keywords`, `payload`/`metadata`/`topology`/`vectors` `jsonb_path_ops`,
`domain_memberships`, `rerank_features`, `bm25_terms`, scalar `feature_id`/`source_ref`/
`community_id`/`domain_class`/`workspace_revision`), and the live Postgres 18.4 instance already
runs with `io_method=worker` (PG18's AIO subsystem, active now) — which specifically accelerates
the heap-page prefetch step after a bitmap index scan. That infrastructure is unused for dense
retrieval today. This proposal adds the missing tool rather than routing through
`phase1-rrf-semantic-fusion` (18/49 tasks done, no dedicated test files per its own tasks.md) or
the governance-gated phase18 XGBoost reranker (`OWNED_RERANKER_NOT_ADMITTED`, deliberately not
promoted to production retrieval per `atlas.workstation_status`).

## What Changes

- Add a new MCP tool, `atlas.packet_dense_search`, registered in `trace-mcp-server.ts` alongside
  the existing `atlas.packet_search`, that runs a two-stage query: (1) a Postgres bitmap-prefilter
  over `atlas_packets` using existing GIN/btree indexes (`feature_id`, `tags`, `domain_class`,
  `workspace_revision`, `concept_ids`), bounded to a candidate `packet_key` set; (2) a Qdrant
  dense-ANN rerank restricted to that candidate set (payload-filtered, not an unfiltered ANN
  sweep), joined back to Postgres by `packet_key`/`source_ref` for final scoring fields
  (`summary`, `reward_prior`, `community_id`, `page_rank_score`).
- Add a small parametrized query-builder module for the bitmap-prefilter predicate set (reusing
  this repo's existing Drizzle/parametrized-query conventions — no hand-rolled SQL string
  concatenation).
- Response shape follows the compact packet-control-word projection already defined by the
  (already-closed) `parent-atlas-packet-control-word-record` change: `packetKey`, `title_id`,
  `sourceRevision`, feature-presence bits, LOD/residency class — cheap for an agent loop to scan
  many candidates, with a pointer back to full payload only for the top-K actually used.
- Register the new tool's output as a candidate lane in the RRF weight-table registry contract
  (`parent-atlas-rrf-weight-table-lane-registry-consolidation`, design-only today) so a future
  fusion pass can pick it up without becoming a second, uncoordinated fusion owner — this change
  does **not** implement fusion itself.
- Document (not fix, separate small note) that the `topology_search` MCP backend (:8101) is
  currently down with a known remedy (`npm run topology:search:ensure`); this change does not
  depend on it.
- **Not** in scope: modifying `phase1-rrf-semantic-fusion`, admitting the phase18 XGBoost
  reranker to production, or adding a second canonical embedding column to `atlas_packets`
  (the existing `atlas_packets.embedding` column is legacy/non-canonical per CLAUDE.md and is not
  used by this tool — dense vectors are read from Qdrant `codebase_chunks_768`/`_768_v2` only).

## Capabilities

### New Capabilities
- `atlas-packet-dense-search`: Bitmap-prefiltered structural query over `atlas_packets` combined
  with a Qdrant-ANN dense rerank restricted to the prefiltered candidate set, exposed as the MCP
  tool `atlas.packet_dense_search`, returning results in the packet-control-word projection shape.

### Modified Capabilities
(none — this is additive; `atlas.packet_search` is unchanged and remains the structural-only tool)

## Impact

- **New file**: query-builder module for the bitmap-prefilter predicate set under
  `src/lib/server/retrieval/` (exact filename decided in design.md).
- **Modified file**: `sveltekit-frontend/src/mcp/trace-mcp-server.ts` — new tool registration next
  to the existing `atlas.packet_search` registration (~line 9317).
- **Reads from**: `atlas_packets` (Postgres, existing indexes only — no new indexes required),
  Qdrant `codebase_chunks_768`/`_768_v2` (existing collections, via the already-healthy Go
  retrieval service on :8100 or a direct Qdrant client call).
- **No schema migration required** — `atlas_packets` already has every index this tool needs.
- **No impact** to `atlas.packet_search`, `phase1-rrf-semantic-fusion`, or the phase18 reranker —
  all left exactly as they are.
- **Dependencies**: none new (Postgres, Qdrant, and the MCP gateway are already live and healthy
  per the 2026-09-16 `trace.system_health` check).
