# karpathy llm wiki

Master page for fast ACE multi-hop traversal, Karpathy-style GPU/codebase indexing, and debugging logic flow.

## Goal

- Jump from a symptom to the right scripts, routes, workers, and retrieval layers quickly.
- Keep the repo-root atlas focused on the files that matter for semantic search and agentic packet injection.

## Traversal Rules

- Start with the likely layer: `routes`, `lib/server`, `scripts/atlas`, `workers`, `drizzle`, `docker`, `services`.
- Use multi-hop only when the first hop is ambiguous: route -> service -> datastore -> retrieval/cache -> atlas doc.
- Prefer verified executable sources over prose when they disagree.

## Master Scripts (canonical — all under `scripts/atlas/`)

### Atlas / Indexing

- `scripts/atlas/index-repo-root.mjs` — full repo root indexing (streaming, 32K+ files)
- `scripts/atlas/karpathy-gpu-enrich.mjs` — Karpathy blend (0.4·PR + 0.3·attn + 0.3·authority) → Redis
- `scripts/atlas/run-authority-scores.mjs` — authority score computation
- `scripts/atlas/project-codebase-topology.mjs` — 4D topology + SOM cluster assignment
- `scripts/atlas/graphrag-kmeans-communities.mjs` — GPU k-means community partitioner (petgraph Louvain)
- `scripts/atlas/neo4j-graph-enrich.mjs` — Neo4j edge enrichment
- `scripts/atlas/generate-file-summaries.mjs` — directory summary generation

### LLM Wiki Knowledge Layer

- `scripts/atlas/ingest-llm-wiki.mjs` — **orchestrator**: fetch → chunk → rg-enrich → embed → tag → cache → neo4j
- `scripts/atlas/fetch-llm-wiki-corpus.mjs` — SearXNG crawler for 10 LLM topics
- `scripts/atlas/chunk-text-notes.mjs` — semantic chunker → NDJSON per topic
- `scripts/atlas/build-rg-search-matrix.mjs` — rg enrichment: chunk text → `rg_paths` (codebase file refs)
- `scripts/atlas/embed-chunks.mjs` — Qdrant `llm_wiki_chunks` embedding (768d, embeddinggemma)
- `scripts/atlas/qdrant-tag-backfill.mjs` — tag payload backfill from rg terms
- `scripts/atlas/cache-feature-cards.mjs` — Redis `ace:feature:llm_wiki:*` hot cache
- `scripts/atlas/project-feature-matrix-neo4j.mjs` — AtlasFeature nodes + edges
- `scripts/atlas/eval-llm-wiki-routing.mjs` — eval harness: 15 queries, ≥80% recall

### ACE / KAG / Retrieval

- `scripts/atlas/sync-redis-ace-cards.mjs` — Redis ACE card sync
- `scripts/atlas/cache-feature-cards.mjs` — feature card hot cache
- `scripts/atlas/tag-qdrant-codebase-payloads.mjs` — Qdrant payload tag enrichment
- `scripts/atlas/eval-lane-routing.mjs` — lane routing evaluator (100% golden accuracy)
- `scripts/atlas/eval-real-world-routing.mjs` — E2E 25-query eval (100% accuracy, 62% pruning)
- `scripts/atlas/eval-cross-domain-routing.mjs` — cross-domain routing (80% accuracy)
- `scripts/atlas/smoke-ace-packet-builder.mjs` — ACE packet smoke test

### Audit / Contract / Repair

- `scripts/atlas/audit-contract-map.mjs` — cross-layer contract error map (8 audit layers)
- `scripts/atlas/audit-drizzle-postgres-contracts.mjs` — Drizzle vs live DB contract check
- `scripts/atlas/audit-rg-search-integrity.mjs` — ripgrep visibility integrity auditor
- `scripts/atlas/repair-db-all-identities.mjs` — user_id/created_by identity normalization
- `scripts/atlas/build-error-fix-dag.mjs` — error fix DAG (priority scheduling)
- `scripts/atlas/validate-parent-atlas.mjs` — parent atlas output validation

### Routing / Retrieval Evaluation

- `sveltekit-frontend/src/lib/server/routing/query-router-4x4.ts` — 4×4 lane router (LEXICAL/GRAPH/VECTOR/HYBRID)
- `sveltekit-frontend/src/lib/server/ace/context-assembler.ts` — ACE context assembly (Stage A0–A5)
- `sveltekit-frontend/src/lib/server/ace/rg-cluster-pivot.ts` — cluster pivot (64d ANN → rg expansion)

### GPU / Native / Workers

- `sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts` — LibTorch N-API (cosine sim, k-means, PageRank)
- `sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts` — simdjson N-API (2-5× JSON parse)
- `sveltekit-frontend/src/lib/server/topology/gpu-topology-projection.ts` — ae2l-pca 768→64 projection
- `simd-bridge/cpp/build/Release/tensorrt_bridge.node` — compiled N-API addon

## rg Search → Codebase File Mapping

The `build-rg-search-matrix.mjs` stage enriches every chunk with `rg_paths`:

```
chunk text
  → extractTerms() — camelCase, TS error codes, kebab-case, file stems
  → rg --files-with-matches (or JS fallback)
  → rg_paths: string[]   // src/... files that mention those symbols
  → rg_terms: string[]   // terms that fired
```

This gives Qdrant payloads a `rg_paths` array so ACE can boost chunks whose symbols
appear in the file currently being edited. Wired as Stage 1.5 in `ingest-llm-wiki.mjs`.

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
- `memory/atlas/codebase-atlas.latest.md` — live directory rank + cluster map

## Notes

- Keep this page short enough for fast ACE ingestion.
- Add new scripts only when they change traversal behavior or debug flow.
- All canonical atlas scripts are under `scripts/atlas/` — the old `sveltekit-frontend/scripts/` paths are legacy.
