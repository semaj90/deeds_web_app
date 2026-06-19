# Phase 16-H SOM/AE Schema Alignment

Generated: 2026-06-19T18:02:00.907Z
Status: IMPLEMENTATION_ALIGNED

## Current Truth

- active migration: `drizzle/manual/0046_phase_16_topology_gds.sql`
- live topology table: READY
- latent_64 stays bytea: yes
- embedding_384 remains dense-retrieval truth: yes
- latent_64 is routing/topology/rerank evidence only: yes
- ae_distance stays additive: yes
- z_som remains the SOM BMU: yes
- checkpoint required: no
- native SOM bridge: present
- CUDA available: yes
- latent artifact entries: 20702
- addressable packet entries in latent artifact: 20642
- derived AE/SOM/checkpoint artifacts found: 21

## Existing Runners

- gds: present (`sveltekit-frontend/scripts/neo4j-graph-enrich.mjs`)
- autoencoderPython: present (`sveltekit-frontend/scripts/train-autoencoder.py`)
- autoencoderNode: present (`sveltekit-frontend/scripts/train-autoencoder.mjs`)
- latentBackfill: present (`scripts/atlas/backfill-latent-vectors.mjs`)
- som20x20: present (`scripts/atlas/train-som-20x20.mjs`)
- combinedGpuPipeline: present (`scripts/atlas/pytorch-qdrant-redis-som-index.mjs`)
- adaptiveSchema: present (`scripts/atlas/adaptive-schema-contract-reconciler.mjs`)

The previously requested `run-topology-gds-pass.mjs` and
`train-autoencoder-768-64.mjs` names are stale aliases. The command map uses
the existing GDS and autoencoder implementations.

## Database Contract

- required topology columns present: 11/11
- missing topology columns: none

## Next Safe Action

Run the read-only join-key audit and classify unmatched reasons. Do not retrain AE/SOM or use latent_64 as the primary retrieval vector.
