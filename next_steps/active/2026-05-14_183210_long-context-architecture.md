# Long-Context Architecture Prompt

Use this prompt for the next implementation pass.

## Goal
Implement the correct long-context stack so Gemma4 reasons only over narrowed, retrieved context instead of holding raw corpora in memory.

## Architecture
- SeaweedFS / NVMe: raw PDFs, images, transcripts, Docling artifacts.
- Postgres: durable metadata, case/evidence truth, chunk IDs, topology rows.
- Qdrant: semantic vectors and payload filters.
- Neo4j: KAG/DAG paths and cluster/evidence/entity edges.
- Redis: hot context cache, centroid cache, ACE packets.
- Gemma4: final reasoning over selected context only.

## Required runtime flow
1. User question.
2. Query embedding.
3. Nearest centroid / cluster lookup.
4. Qdrant filtered semantic search.
5. Neo4j graph expansion.
6. Redis ACE cache hit check.
7. Assemble top chunks, summaries, graph paths.
8. Send compact packet to Gemma4.

## Data model targets
- Keep cold files on SeaweedFS/NVMe.
- Store metadata in Postgres.
- Store vectors in Qdrant.
- Backfill payloads with `cluster_id`, `som_cluster`, `manifold4`, `feature_key`, `tags`.
- Cache centroids in Redis using `hypergraph:v1:*` and `ace:*` keys.

## Immediate build sequence
1. Export Qdrant embeddings to NDJSON.
2. Run `hypergraph-build.mjs` outside Vite.
3. Backfill Qdrant payloads with cluster metadata.
4. Cache centroids in Redis.
5. Add query-time nearest-centroid routing.
6. Add Neo4j chunk/cluster/evidence edges.
7. Add an ACE context packet that carries cluster IDs and graph paths.
8. Add a smoke test for clustered Qdrant retrieval.

## Notes
- Do not store raw KV cache in Redis.
- Do not try to fit millions of documents into the model context.
- TurboVec is optional prefiltering only; it does not replace Qdrant.
