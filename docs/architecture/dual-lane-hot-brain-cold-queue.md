# Dual-Lane Hot Brain, Cold Queue

This repo uses two lanes and one rule:

1. Cold originals stay cold.
2. Warm packets stay compact and indexed.
3. Hot cache only holds active work.

## Lanes

### Cold lane

Cold originals are the source files, raw dumps, transcripts, and archive blobs. They belong in SeaweedFS or archive storage, not in long-lived hot repo surfaces.

### Warm lane

Warm data is the packet/index layer:

- Parent Atlas cards
- NES/Glyph packets
- `sourceRef` / `feature_id` / `queryHash` joins
- Postgres 18 provenance rows
- Qdrant payload-indexed ANN results
- Neo4j contextual trees
- Redis / Bitfrost exact-hit or tuple caches

Warm packets must always point back to cold originals. They are not the source of truth; they are the traversal surface.

### Hot lane

Hot cache is only the active task memory used during a request or workflow run. It should expire quickly and should never become the canonical store.

## Adapter roles

- **TurboVec**: optional local ANN backend / quantized search adapter
- **Qdrant**: default production vector DB and payload filter layer
- **Postgres 18**: durable ledger for packets, provenance, and `sourceRef`
- **LlamaIndex**: optional document/node parser and retriever adapter
- **LangChain**: optional tool/chain wrapper
- **LangGraph**: optional orchestration/state-machine layer for validation and workflow tests

## No-write rule

Adapters must not write directly to Postgres, Qdrant, Redis, Neo4j, or SeaweedFS. All durable writes go through promotion queue scripts and bounded apply gates.

## Suggested order

1. TurboVec adapter smoke
2. LlamaIndex document/node parser adapter
3. LangChain tool wrapper
4. LangGraph validation workflow only
5. cuVS/CAGRA later, behind the same search contract

## Search contract

Keep the stable caller seam in:

- `sveltekit-frontend/src/lib/server/search/qdrant-search.ts`
- `sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts`

Adapters must return the same search hit / retrieval result shape, regardless of backend.

## Compressed semantic geometry

Qdrant, TurboVec, Redis LOD packets, SOM centroids, and NES/CHROM dictionaries
are compressed approximate semantic geometry. They are acceleration and replay
surfaces.

The durable identity remains `sourceRef + feature_id + packetId` in Postgres
and the Parent Atlas ledger.

Use this order:

1. apply sourceRef / feature_id / tag / route filters
2. run approximate ANN or compressed candidate search
3. oversample only when the query needs more recall
4. exact-rescore a bounded candidate set when quality requires it
5. assemble replayable packets with provenance intact
