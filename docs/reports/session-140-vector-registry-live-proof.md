# Session 140 Vector Registry Live Proof

## Verified

`public.vector_index_registry` exists in the live PostgreSQL database.

It currently contains 4 rows.

Live row shape:

- `id` integer primary key
- `index_name` varchar
- `index_type` varchar
- `index_backend` varchar
- `vector_dimension` integer
- `total_points` integer
- `created_at` timestamptz
- `updated_at` timestamptz
- `last_validation` timestamptz
- `validation_status` varchar
- `config` jsonb

Live rows:

- `qdrant_codebase_chunks_384` / `dense_vector` / `qdrant` / `384`
- `turbovec_quantized_4bit` / `quantized_vector` / `turbovec` / `64`
- `kmeans_k32` / `clustering` / `gpu` / `384`
- `som_20x20` / `topology` / `gpu` / `384`

All four rows currently show `validation_status = not_validated` and `total_points = 0`.

## In Progress

The codebase already has the intended vector contract layer:

- `embeddinggemma-prefix384-v1`
- `semantic_embedding`
- `topology_embedding`
- `latent_embedding`
- `bm42_sparse`

The live registry table is older than the newer initializer script shape and does not yet expose the richer `engine` / `status` contract proposed in the pasted design.

## Deferred / Not Proven

I did not prove that the registry rows are live-backed by the current retrieval runtime.

I did not prove Qdrant, TurboVec, and brute-force parity.

I did not prove that the legacy 768 materialization path has been retired.

## Next To-Do

1. Add a naming bridge between the live registry schema and the newer contract naming.
2. Verify whether the registry rows are consumed anywhere in the live retrieval path.
3. Keep tokenizer IDs separate from retrieval vectors and routing lanes.
4. Continue treating SOM/K-means as routing metadata, not canonical truth.

## Status

IMPLEMENTED
- vector_index_registry table exists
- four canonical registry rows exist
- initializer script exists

PROVEN
- live table shape inspected
- row count confirmed
- row contents confirmed

EXPECTED GAPS
- no validation proofs
- no populated points
- no parity benchmark evidence

UNRESOLVED
- whether the live registry is actually wired into retrieval execution
- how the older registry schema maps to the newer contract proposal

UNSAFE CONSTRAINTS
- assuming registry initialization means runtime adoption
- assuming 384 naming is already live because the contract files exist

NOT YET PROVEN
- end-to-end use of the registry in the live pipeline
- parity across Qdrant / TurboVec / brute-force lanes

NEXT SAFE ACTION
- inspect the registry consumers and patch the naming bridge only where the live path already reads the table.
