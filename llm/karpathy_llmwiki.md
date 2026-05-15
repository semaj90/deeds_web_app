# karpathy llm wiki

Master page for fast ACE multi-hop traversal, Karpathy-style GPU/codebase indexing, and debugging logic flow.

## Goal

- Jump from a symptom to the right scripts, routes, workers, and retrieval layers quickly.
- Keep the repo-root atlas focused on the files that matter for semantic search and agentic packet injection.

## Traversal Rules

- Start with the likely layer: `routes`, `lib/server`, `scripts`, `workers`, `drizzle`, `docker`, `services`.
- Use multi-hop only when the first hop is ambiguous: route -> service -> datastore -> retrieval/cache -> atlas doc.
- Prefer verified executable sources over prose when they disagree.

## Master Scripts

### Atlas / Indexing

- `sveltekit-frontend/scripts/codebase-semantic-indexer.ts` — semantic indexing and codebase search substrate
- `sveltekit-frontend/scripts/run-hypergraph.ts` — hypergraph / topology traversal entrypoint
- `sveltekit-frontend/scripts/hypergraph-build-4d.ts` — 4D topology build path
- `sveltekit-frontend/scripts/run-pagerank.ts` — authority / ranking support
- `sveltekit-frontend/scripts/warm-forest-clusters.mjs` — cluster warmup
- `sveltekit-frontend/scripts/validate-qdrant-cluster-tags.mjs` — cluster-tag validation

### ACE / KAG / Retrieval

- `sveltekit-frontend/scripts/ace-policy-synthesis.ts` — ACE policy synthesis
- `sveltekit-frontend/scripts/seed-ace-hits-for-synthesis.ts` — ACE packet seeding
- `sveltekit-frontend/scripts/verify-kag-path.mjs` — KAG path checks
- `sveltekit-frontend/scripts/ingest-kag-notes.mjs` — KAG note ingestion
- `sveltekit-frontend/scripts/tests/smoke-kag-note-roundtrip.mjs` — KAG roundtrip smoke
- `sveltekit-frontend/scripts/verify-neo4j-graph.mjs` — graph health / traversal sanity

### Debugging Logic Flow

- `sveltekit-frontend/scripts/debug-schema.ts` — schema debugging
- `sveltekit-frontend/scripts/error-brain-fix.ts` — error-brain repair path
- `sveltekit-frontend/scripts/fix-missing-imports.ts` — import repair
- `sveltekit-frontend/scripts/fix-missing-imports-enhanced.ts` — enhanced import repair
- `sveltekit-frontend/scripts/fix-type-imports-usage.ts` — type-import cleanup
- `sveltekit-frontend/scripts/repair-services.ts` — service-layer repair flow
- `sveltekit-frontend/scripts/reachability-analysis.ts` — reachability / dead-path analysis
- `sveltekit-frontend/scripts/triage-orphans-vs-next-steps.mjs` — orphaned path triage

### GPU / Native / Workers

- `sveltekit-frontend/scripts/tests/smoke-rust-native.mjs` — native bridge smoke
- `sveltekit-frontend/scripts/tests/smoke-simdjson-dispatch.mjs` — SIMD dispatch smoke
- `sveltekit-frontend/scripts/verify-trace-startup.mjs` — startup verification
- `sveltekit-frontend/scripts/verify-db-connection.ts` — DB connectivity check
- `sveltekit-frontend/scripts/patch-cluster-embeddings.ts` — embedding repair path
- `sveltekit-frontend/scripts/summarize-clusters-pg.ts` — cluster summarization path

## Debug Flow

1. Identify the failing layer.
2. Map it to the nearest script above.
3. Trace the route or worker into `lib/server`.
4. Trace datastore writes into Drizzle / Postgres / Qdrant / Redis.
5. Update the relevant wiki page and append the timeline.

## Relevant Attachments

- `llm/llm_inventory.md` — repo map and counts
- `llm/llm_dependencies.md` — services and entrypoints
- `llm/llm_timeline.md` — append-only event log
- `llm/repo_root_map.md` — workspace-root traversal map

## Notes

- Keep this page short enough for fast ACE ingestion.
- Add new scripts only when they change traversal behavior or debug flow.
