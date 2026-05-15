# Wiki Loop End-to-End

## Goal
Finish the canonical Karpathy / LLMS / atlas loop so graph ingestion, graph algorithms, CouchDB materialization, Qdrant tag writes, pgvector search, Redis ACE packets, multi-query clustering, and Neo4j multi-hop traversal all share one source-of-truth pipeline.

## Canonical surfaces
- PostgreSQL: source of truth for envelopes, relations, and durable indexing state.
- CouchDB: materialized wiki views and directory cards.
- DuckDB: offline analysis / projection lane when needed.
- Qdrant: dense vectors, tags, cosine ranking, cluster payloads.
- Redis: hot ACE packets, centroid cache, loop summaries.
- Neo4j: multi-hop graph traversal, graph algorithms, and synthesis paths.

## Loop contract
1. Ingest graph data once.
2. Materialize graph and wiki views without deduplicating provenance away.
3. Refresh cluster, topology, and authority signals.
4. Rebuild Redis hot packets and ACE cache slices.
5. Refresh Qdrant tags and cosine-search payloads.
6. Re-run synthesis so Gemma4 sees the newest graph and retrieval state.

## Commands
- `npm run graph:full`
- `npm run graphify:full`
- `npm run llms:cache:build`
- `npm run wiki:loop`

## Startup / CI
- Keep `wiki:loop` as the manual end-to-end entrypoint.
- Allow it in startup policy for the heavy lane, but do not auto-wire it into the incremental path yet.
- CI should prefer the smaller smoke slices until the full loop is stable under the available services.

## Next work
1. Add the remaining graph ingestion / Qdrant tag refresh steps to the heavy lane wrapper.
2. Verify pgvector and Qdrant produce matching cosine-ranked candidates.
3. Extend multi-hop traversal synthesis for node neighborhood expansion.
4. Fold the enhanced graph mapping outputs back into the LLMS atlas refresh.
5. Keep `wiki:loop:smoke` as the fast contract gate for CI and local validation.

## Work slices
### 1. Ingestion and storage order
- Postgres first as the durable source of truth.
- CouchDB next for materialized wiki / directory views.
- DuckDB only for offline projection and inspection jobs.
- Qdrant payload/tag refresh after Postgres relations are stable.

### 2. Retrieval and ranking
- Make pgvector and Qdrant return compatible candidate sets.
- Keep cosine ranking as the shared ordering rule.
- Preserve provenance fields so deduplication does not erase source traces.

### 3. Graph reasoning
- Use Neo4j for multi-hop traversal, cluster neighborhood expansion, and graph algorithms.
- Feed the traversal outputs back into synthesis packets.
- Keep the 4D/topology labels intact for downstream sort order.

### 4. Synthesis packet
- Build the Redis ACE packet from graph + retrieval + traversal data.
- Include cluster IDs, tags, authority, hits, and path snippets.
- Hand that compact packet to Gemma4 for final orchestration.

## Acceptance criteria
- `wiki:loop` completes without rewriting provenance away.
- `wiki:loop:smoke` validates the cache and retrieval slices locally.
- The loop produces refreshed Redis, Qdrant, and Neo4j outputs from the same run.
- Next-step notes remain append-only and local-only.
