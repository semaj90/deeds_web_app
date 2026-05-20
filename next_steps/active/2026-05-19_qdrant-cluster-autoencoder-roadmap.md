# GraphRAG Qdrant Cluster Roadmap — 2026-05-19

> Repo note for cluster ingestion, tag search, autoencoding compression, and hot-path retrieval wiring.
> This captures the current code surfaces and the next dependency-ordered steps.

## Search Findings

| File | Why it matters |
|---|---|
| `sveltekit-frontend/src/routes/api/tags/search/+server.ts` | Existing semantic tag search endpoint over Qdrant. |
| `sveltekit-frontend/src/lib/server/ace/tag-sync.ts` | Mirrors and searches tags in Qdrant / Postgres / CouchDB. |
| `sveltekit-frontend/src/lib/server/retrieval/codebase-context.ts` | Existing cluster-aware retrieval with `neo4j_gpuCluster` and `som_cluster`. |
| `sveltekit-frontend/src/lib/server/ace/cluster-tags-cache.ts` | Hot cluster-tag cache used by ACE and multi-lane retrieval. |
| `sveltekit-frontend/src/lib/server/search/qdrant-search.ts` | Qdrant code search with `topo_class` filtering and encoded cluster prefilter hooks. |
| `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts` | Central Qdrant payload indexer for `cluster_id`, `som_cluster`, `tags`, and `topo_class`. |
| `sveltekit-frontend/src/lib/server/services/knowledge-search/QdrantKnowledgeStore.ts` | Tag/source/date filter builder for Qdrant searches. |
| `scripts/migrate-qdrant-clusters.ts` | Pattern for bulk Qdrant payload migration and cluster metadata backfill. |
| `docs/architecture/storage-tier-schema.md` | Canonical warm/hot/cold routing design, centroid registry, and compression layout. |
| `next_steps/active/2026-05-09_gpu-routing-autoencoder-todo.md` | Prior roadmap note with autoencoder and GPU routing context. |

## What Already Exists

- `GET /api/tags/search` already performs semantic tag search with `embeddinggemma:latest` and `searchTagsBySemantic()`.
- Tag search payloads already use Qdrant tag filters in the repo:
  - arrays: `match: { any: [...] }`
  - scalars: `match: { value: ... }`
- Cluster-aware code search already exists via `searchByCluster()` and `searchQdrantCode()`.
- ACE already has a dedicated cluster-tag cache in `cluster-tags-cache.ts` for the latest `qdrant_cluster_tags.json` artifact.
- The storage-tier doc already defines the warm routing layer:
  - `centroid_registry`
  - `cluster_cards`
  - `centroid_id`
  - `compressed_embedding`
  - `reconstruction_error`
  - `routing_tier`

## TODO — Ordered by Dependency

### Phase 1 — Tag / Cluster Query Contract

- [ ] Extend the semantic tag search path to accept optional cluster/topic filters without breaking `GET /api/tags/search?q=...`.
- [ ] Add a regression test for the combined filter path so tag search and cluster filters stay merged.
- [ ] Keep the filter semantics explicit:
  - `match: { any: [...] }` for tag arrays.
  - `match: { value: ... }` for scalar cluster/topic fields.

### Phase 2 — Autoencoding Compression

- [ ] Add the 768d -> 64d or 768d -> 128d -> 768d compression stage behind the existing storage-tier model.
- [ ] Persist `centroid_id`, `routing_tier`, and `reconstruction_error` into Qdrant payloads and the routing tables.
- [ ] Reuse the existing Qdrant cluster backfill pattern from `scripts/migrate-qdrant-clusters.ts` for payload migration.

### Phase 3 — Hot Cluster Recall

- [ ] Add Redis hot keys for `cluster:card:{centroid_id}` and `ace:cluster:top:{collection}`.
- [ ] Use Bitfrost / Redis for hot cluster topic recall before falling back to Qdrant ANN.
- [ ] Fold the existing `cluster-tags-cache.ts` artifact into the warm/hot retrieval path instead of rereading the file on every request.
- [ ] Keep the cluster topic cache aligned with the current retrieval trace so ACE packets can reuse it.

### Phase 4 — GPU Scoring Bridge

- [ ] Prototype the xgradient / tree boosting scoring lane in PyTorch or LibTorch.
- [ ] Expose the scoring lane through the existing RTX CUDA + TypeScript + WebGPU bridge layer.
- [ ] Keep the bridge focused on hot cluster topics and ranking, not on final synthesis output.

### Phase 5 — ACE Packet Injection

- [ ] Inject hot Qdrant cluster topics into ACE packets before Gemma4 synthesis.
- [ ] Feed the compressed topology output into the cache-aware retrieval trace.
- [ ] Treat packet injection as the last step after routing, recall, and ranking are stable.

### Phase 6 — Validation

- [ ] Verify the combined filter behavior with a focused regression test.
- [ ] Re-run the Qdrant tag search path after any cluster payload migration.
- [ ] Only then iterate on the GPU bridge and Bitfrost cache tuning.

## Notes

- The current repo already has the pieces for tag search, cluster search, and routing metadata.
- The missing work is the dependency chain that connects those pieces into a single cluster/topic recall pipeline.
- Keep the first implementation small: search contract first, compression second, hot cache third, GPU bridge fourth, ACE packet injection last.