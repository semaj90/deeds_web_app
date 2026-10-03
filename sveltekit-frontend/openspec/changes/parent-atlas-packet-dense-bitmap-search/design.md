## Context

`atlas_packets` (61,718 rows, verified live via `atlas.workstation_status`) is the canonical
Postgres identity table for Parent Atlas packets. It carries ~40 indexes — a mix of GIN indexes
(`tags`, `concept_ids`, `keywords`, `payload`/`metadata`/`topology`/`vectors` with
`jsonb_path_ops`, `domain_memberships`, `rerank_features`, `bm25_terms`, `extracted_entities`,
`routing_hints`) and scalar btree indexes (`feature_id`, `source_ref`, `community_id`,
`som_cluster`, `domain_class`, `page_rank_score`, `workspace_revision`, `representation_revision`,
a partial index on `domain_confidence > 0.7`, a compound `(source_ref, feature_id)`, a compound
identity index `(packet_key, source_ref, feature_id, title_id)`). This is exactly the shape
Postgres needs to plan a `BitmapAnd`/`BitmapOr` scan across several predicates and fetch only the
matching heap pages. The live Postgres 18.4 instance (`legal-ai-postgres`) already runs
`io_method = worker`, PG18's new AIO subsystem, which prefetches those heap-page fetches
concurrently instead of serially — a real, already-active speedup for this exact scan shape, not
a hypothetical future tuning knob.

Despite that infrastructure, no MCP tool combines it with dense (embedding) retrieval today.
`atlas.packet_search` (in `trace-mcp-server.ts`) is structural/FTS-only — it filters on
`source_ref`/`feature_id`/`concept_id`/`summary_query` (via `to_tsvector` FTS) and explicitly says
in its own description "use this to find packets... before querying Qdrant." A caller who wants
both filtered *and* semantically-ranked results today has to make two separate tool calls (this
one, then a Qdrant-backed tool such as `search_hybrid`/`ace_compact_search`) and reconcile the
results itself — with no shared candidate-set contract between the two calls, so the second call
ends up re-scanning far more than necessary.

`atlas_packets.embedding` (a `vector(768)` column on the table itself) is legacy/mostly-null per
CLAUDE.md's own documented policy — it is explicitly "non-canonical; do not use as the
authoritative embedding source." Canonical 768-dim embeddings live in Qdrant
(`codebase_chunks_768`/`codebase_chunks_768_v2`), joined back to Postgres by `source_ref`/
`packet_key`. Any dense-search design must respect that split rather than resurrecting the legacy
column.

## Goals / Non-Goals

**Goals:**
- Expose one MCP tool, `atlas.packet_dense_search`, that does bitmap-prefiltered structural
  narrowing in Postgres *and* dense semantic reranking in one call, sharing a single candidate
  `packet_key` set between the two stages.
- Make the Postgres stage actually use the existing bitmap-scan-friendly indexes (verify via
  `EXPLAIN (ANALYZE, BUFFERS)` that the planner chooses `BitmapAnd`/`BitmapOr`, not a seq scan).
- Keep the tool's output in the compact packet-control-word projection shape (already defined by
  the closed `parent-atlas-packet-control-word-record` change) so an agent loop can scan many
  candidates cheaply.
- Leave a clean seam for the new tool's output to register as an RRF lane later, without
  implementing fusion now.

**Non-Goals:**
- Not implementing RRF fusion, NDCG/MRR evaluation, or anything else that
  `phase1-rrf-semantic-fusion` (18/49 done) owns — this tool's dense stage is a direct Qdrant ANN
  call with a payload filter, not a multi-lane fusion.
- Not admitting or wiring the phase18 XGBoost reranker (`OWNED_RERANKER_NOT_ADMITTED`) — that
  governance gate is left exactly as-is.
- Not fixing `topology_search` (:8101) — documented as a known, separate, non-blocking gap.
- Not adding a new Postgres index — the existing ~40 already cover every predicate this tool needs.
- Not resurrecting `atlas_packets.embedding` as a query target.

## Decisions

**Decision 1 — two explicit stages, not one fused SQL query.**
Stage 1 (Postgres bitmap prefilter) runs as its own parametrized query, bounded to `LIMIT 500`
candidate `packet_key`s (configurable, default 500). Stage 2 (Qdrant ANN) then runs with a
payload filter restricted to those `packet_key`s (Qdrant's `must` filter on `packet_key IN [...]`,
or on `source_ref` if that's what the target collection payload indexes). Stage 3 joins the
Qdrant hit list back to Postgres by `packet_key`/`source_ref` for the final response fields.
*Alternative considered*: a single Postgres query using `pgvector`'s `<=>` operator directly
against `atlas_packets.embedding`. Rejected — that column is legacy/non-canonical per CLAUDE.md
and is mostly null; using it would silently produce wrong or empty results for most packets.
*Alternative considered*: push the whole query into Qdrant with payload filters mirroring the
Postgres predicates (skip the Postgres stage). Rejected — Qdrant's payload filtering is not backed
by the same bitmap-index infrastructure Postgres already has, and duplicating ~40 index-equivalent
filter conditions into Qdrant payload indexes would be new index-maintenance surface for no proven
win; the Postgres-first-narrow approach reuses infrastructure that already exists and is already
measured to be AIO-accelerated.

**Decision 2 — candidate-set size cap (500) between stages.**
Caps the Qdrant payload-filter `IN` clause to a size that stays fast and avoids an unbounded
candidate list if a caller's structural filter is too loose (e.g. `domain_class` alone matching
thousands of rows). If Stage 1 returns more than the cap, the tool returns a
`candidateSetTruncated: true` flag in the response rather than silently dropping rows without
signaling it — callers can tighten their filter or accept the truncation.
*Alternative considered*: no cap, rely on Qdrant's own top-K to bound cost. Rejected — an
unbounded `IN` list can still make the Postgres prefilter itself and the Qdrant filter
construction expensive, and there's no way to signal to the caller that their filter was too
broad.

**Decision 3 — response shape reuses the packet-control-word projection, not a new schema.**
The closed `parent-atlas-packet-control-word-record` change already defines a compact projection
(`packetKey`, `title_id`, `sourceRevision`, feature-presence bits, LOD/residency class) intended
exactly for "GPU-local scans and human/debug tooling to reason about thousands of candidates
cheaply, without ever becoming a second identity." Reusing it here avoids inventing a third
packet-summary shape (after `atlas.packet_search`'s ad hoc return shape and the control-word
projection). Full `payload`/`summary` is only attached for the top-K the caller actually asks to
expand (a `expandTopK` parameter, default 10), keeping the bulk response cheap.
*Alternative considered*: return full packet rows for every match. Rejected — defeats the point of
a cheap agent-scannable format and duplicates what `atlas.packet_search` already does for callers
who want full rows.

**Decision 4 — RRF lane registration is a documentation-only seam in this change, not code.**
`parent-atlas-rrf-weight-table-lane-registry-consolidation` is still design-only (no shared
`rrf-weight-config-v1.ts` module exists yet). Wiring actual fusion now would mean either blocking
on that unfinished change or building a second, temporary fusion mechanism that would have to be
torn out later. Instead, this change documents the new tool as a named candidate lane
(`atlas_packet_dense_bitmap` — see tasks.md) in a comment/README note near the tool registration,
so whoever finishes the RRF weight-table consolidation has a concrete pointer, without this change
taking on that dependency.

**Decision 5 — Postgres stage uses this repo's existing Drizzle/parametrized-query convention.**
No raw string-concatenated SQL. Reuses the existing pattern already used by
`atlas.packet_search`'s own implementation in `trace-mcp-server.ts` (parametrized `WHERE` clauses
built from optional filter fields) rather than introducing a new query-building library.

## Risks / Trade-offs

- **[Risk]** A caller supplies only a very loose filter (e.g. `domain_class` alone), Stage 1
  returns thousands of rows, and the 500-cap silently narrows results in a way that could exclude
  the actually-best matches before Qdrant ever sees them.
  → **Mitigation**: `candidateSetTruncated: true` flag in the response, plus require at least one
  of `feature_id`/`source_ref`/`concept_id`/`tags` to be present (not `domain_class` alone) —
  matches `atlas.packet_search`'s existing pattern of requiring at least one selective filter.
- **[Risk]** Qdrant payload filtering by `packet_key IN [...]` at N=500 could be slower than an
  unfiltered top-K ANN sweep if Qdrant's filter execution isn't well-optimized for large `IN`
  lists.
  → **Mitigation**: benchmark both directions in the proof gate (task list below) before
  finalizing the cap value; the cap is a configurable parameter, not hardcoded.
- **[Risk]** Two Qdrant collections currently coexist for 768-dim (`codebase_chunks_768` — older,
  richer payload; `codebase_chunks_768_v2` — leaner, EMB3A target) per CLAUDE.md's own documented
  open finding. Picking the wrong one silently returns stale or incomplete results.
  → **Mitigation**: make the target collection an explicit required parameter (no default), and
  document both options' trade-offs in the tool's MCP description so callers choose deliberately;
  do not silently pick one as "the" collection (CLAUDE.md explicitly flags this as unresolved).
- **[Trade-off]** This tool duplicates some filter logic conceptually present in
  `atlas.packet_search` (both filter `atlas_packets` by `feature_id`/`source_ref`/`concept_id`).
  Accepted — the two tools solve different problems (structural-only lookup vs.
  structural-then-dense), and merging them into one tool with an optional dense mode would make
  `atlas.packet_search`'s existing, working, simple contract more complex for its existing callers.

## Migration Plan

No data migration. Additive-only: new tool registration, new query-builder module. Rollback is
deleting the new tool registration and module — no other code path depends on them.

1. Implement the query-builder module and unit-test the generated SQL/params against known
   `atlas_packets` predicates.
2. Register `atlas.packet_dense_search` in `trace-mcp-server.ts`.
3. Run the `EXPLAIN (ANALYZE, BUFFERS)` proof gate against live `legal-ai-postgres` to confirm
   bitmap-scan plan selection.
4. Run the latency comparison (bitmap-prefilter-then-ANN vs. today's two-manual-call pattern) on
   5-10 representative queries.
5. Re-run `trace.system_health` to confirm no regression to the 9 currently-healthy services.

## Open Questions

- Should the 500-candidate cap be a fixed default or auto-tuned based on Stage 1's actual row
  count (e.g. warn below some threshold, cap above another)? Deferred to implementation — start
  with a fixed default, revisit if the latency benchmark shows it matters.
- Which of `codebase_chunks_768` vs `codebase_chunks_768_v2` should this tool default to steering
  callers toward, if either? CLAUDE.md marks this as a genuinely open, separate finding — this
  change does not resolve it, only requires the caller to choose explicitly (Decision above).
