# Autoencoder lane

This directory is the single reference for the autoencoder / latent-64 pipeline.

Keep the rules here, and do not repeat them across scripts:

- `EmbeddingGemma` produces the 768-dim source embeddings.
- `scripts/train-autoencoder.mjs` trains and publishes:
  - `ace:autoencoder:weights`
  - `ace:autoencoder:meta`
- `scripts/autoencoder-backfill-qdrant.mjs` backfills `latent_64` into `codebase_topology_64`.
- `scripts/autoencoder-centroids.mjs` derives centroid metadata in Valkey.
- `scripts/graphify-som-cluster-summaries.mjs` consumes the centroid metadata and must fail fast if it is missing.

Ownership:

- Postgres / Qdrant store the data.
- Valkey stores the published autoencoder hashes.
- This README stores the contract.

If you change the schema, key names, or launch order, update this file first and then the scripts that consume it.
