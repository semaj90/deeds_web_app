# Parent Atlas ORF Repository Alignment v1

The main `packages/parent-atlas` repository now targets the active
`atlas_observation_feature_rows` contract:

- identity: `packet_key + feature_revision`
- exact filters: PostgreSQL array/JSONB feature columns
- source of semantic vectors: separate canonical `semantic_768` lane
- repository writes: additive upsert only, no candidate/vector table ownership

The superseded `candidate_id + workspace_revision + semantic_768` migration is
preserved as historical evidence and is not used by the repository.

Build and canonical-surface tests pass. `sveltekit-frontend/node_modules/@deeds/parent-atlas`
is a workspace junction to `packages/parent-atlas`, so the rebuilt package is the
copy consumed by the frontend without a second source tree.
