# Session 140 Vector Registry Consumer Audit

## Verified

The live retrieval path imports `VECTOR_INDEX_REGISTRY` from `sveltekit-frontend/src/lib/server/vector/vector-index-registry.ts`.

`retrieve-candidates.ts` uses that in-memory registry to choose between `codebase_chunks_384_hybrid` and `codebase_chunks_384`.

The SQL `vector_index_registry` table is not referenced by the live retrieval code found in this audit.

The in-memory registry is the place where the runtime expresses:

- frozen 5k snapshot
- Qdrant hybrid retrieval
- Qdrant dense fallback
- TurboVec shadow index
- brute-force reference
- K-means 384 lane
- SOM 20x20 routing lane
- Redis centroid warm cache

## In Progress

The runtime and database are split intentionally but not yet fully bridged.

The runtime registry already carries the newer contract vocabulary and build scripts.

The SQL registry table is older, smaller, and currently acts more like a database-side operational record than the live retrieval selector.

## Deferred / Not Proven

I did not prove a live code path that reads `public.vector_index_registry` during retrieval.

I did not prove a live bridge between the SQL table and the in-memory registry object.

I did not prove that the SQL row statuses are consumed anywhere.

## What This Means

The correct bridge target is the runtime registry module, not the retrieval algorithm itself.

If we need live synchronization, the patch should map database registry state into `VECTOR_INDEX_REGISTRY`, or add a loader that hydrates the runtime registry from the SQL table.

But there is no evidence yet that retrieval semantics should change.

## Next To-Do

1. Leave retrieval semantics alone.
2. Decide whether the SQL registry should hydrate the runtime registry or simply remain as an audit/control table.
3. If hydration is required, add a narrow adapter from `public.vector_index_registry` to `vector-index-registry.ts`.
4. Preserve the tokenizer/vector separation and keep SOM/K-means as routing metadata only.

## Status

IMPLEMENTED
- runtime vector registry exists
- retrieval uses the runtime registry
- SQL registry table exists

PROVEN
- live consumer of `VECTOR_INDEX_REGISTRY` identified
- SQL table not shown to be a retrieval dependency

EXPECTED GAPS
- no live SQL-to-runtime bridge
- no status hydration path

UNRESOLVED
- whether the SQL registry is meant to become authoritative or remain advisory

UNSAFE CONSTRAINTS
- patching retrieval logic before defining registry authority
- assuming the SQL table is already on the hot path

NOT YET PROVEN
- registry hydration from Postgres
- runtime status sync
- parity between table state and runtime registry state

NEXT SAFE ACTION
- decide whether to hydrate `VECTOR_INDEX_REGISTRY` from Postgres or keep it as a static contract file and leave the SQL table advisory.
