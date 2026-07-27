# Feature Domain Storage Ownership Report

Generated: 2026-07-27

## Question

Where should a `FeatureDomainPacket`-style record live, based on the current repository schema and writers?

## Evidence

### `atlas_artifacts`

- Defined in [`sveltekit-frontend/src/lib/server/db/schema/atlas-artifacts.ts`](../../../sveltekit-frontend/src/lib/server/db/schema/atlas-artifacts.ts).
- Columns observed:
  - `artifact_id` primary key
  - `packet_key`
  - `source_ref`
  - `feature_id`
  - `artifact_type`
  - `content_hash`
  - `generator`
  - `generator_version`
  - `generator_config`
  - `storage_backend`
  - `storage_location`
  - `gan_validated`
  - `gan_validation_score`
  - `supersedes_artifact_id`
  - `status`
  - `trace_id`
  - `git_commit`
  - timestamps
- Indexes observed:
  - `packet_key`, `source_ref`, `feature_id`
  - `generator`, `generator_version`
  - `artifact_type`, `status`, `supersedes_artifact_id`
  - `created_at`, `gan_validated`, `(generator, status)`
- Current writer:
  - [`sveltekit-frontend/src/lib/server/generation/artifact-logger.ts`](../../../sveltekit-frontend/src/lib/server/generation/artifact-logger.ts)
  - This logger is explicitly a universal derived-artifact registry for summaries, embeddings, latent64, feature labels, GAN reports, traces, and similar generated outputs.
  - It uses `atlas_artifacts` as a generic artifact store, not a feature-domain-specific table.

### `feature_domain_facts`

- Defined in [`sveltekit-frontend/src/lib/server/db/schema-postgres.ts`](../../../sveltekit-frontend/src/lib/server/db/schema-postgres.ts).
- Columns observed:
  - `id` primary key
  - `packet_key`
  - `source_ref`
  - `feature_key`
  - `domain_class`
  - `domain_confidence`
  - `domain_probabilities`
  - `classifier_kind`
  - `classifier_version`
  - `model_hash`
  - `feature_contract_version`
  - `content_hash`
  - `processing_pass_id`
  - `evidence`
  - `created_at`
- Unique/index support observed:
  - unique on `(packet_key, classifier_version, content_hash)`
  - indexes on `packet_key`, `source_ref`, `domain_class`, `domain_confidence`
- Current writers:
  - [`sveltekit-frontend/scripts/atlas/classify-domains-direct-db.mts`](../../../sveltekit-frontend/scripts/atlas/classify-domains-direct-db.mts)
  - [`sveltekit-frontend/scripts/atlas/backfill-feature-layer-from-atlas-packets.mjs`](../../../sveltekit-frontend/scripts/atlas/backfill-feature-layer-from-atlas-packets.mjs)
- These writers already treat `feature_domain_facts` as the domain-classification ledger and do not use `atlas_artifacts` for this role.

### `feature_domain`

- Defined in [`sveltekit-frontend/drizzle/0043_feature_extraction_tables.sql`](../../../sveltekit-frontend/drizzle/0043_feature_extraction_tables.sql).
- Columns observed:
  - `id`
  - `packet_key`
  - `source_ref`
  - `domain_class`
  - `primary_source`
  - `secondary_sources`
  - `confidence`
  - `confidence_method`
  - `materialization_version`
  - timestamps
- Live rows observed: 61,659
- Live samples show:
  - `primary_source = atlas_packets.domain_class`
  - `confidence_method = canonical`
  - `confidence = 1`
- Interpretation:
  - This is the older canonical domain-classification row table.
  - It is not the richer provenance ledger.
  - No active code writers were found in `src/` or `scripts/` that target `feature_domain` directly.

### Writer map

- `atlas_artifacts`
  - Used by [`sveltekit-frontend/src/lib/server/generation/artifact-logger.ts`](../../../sveltekit-frontend/src/lib/server/generation/artifact-logger.ts)
  - Also referenced by the feature label extractor as a storage target for generated labels, not feature-domain classification rows.
- `atlas_artifacts` callers found:
  - [`sveltekit-frontend/src/lib/server/generation/feature-label-extractor.ts`](../../../sveltekit-frontend/src/lib/server/generation/feature-label-extractor.ts)
  - [`sveltekit-frontend/src/routes/api/atlas/feature-labels/+server.ts`](../../../sveltekit-frontend/src/routes/api/atlas/feature-labels/+server.ts)
  - [`sveltekit-frontend/src/lib/server/generation/packet-summary-pipeline.ts`](../../../sveltekit-frontend/src/lib/server/generation/packet-summary-pipeline.ts)
  - [`sveltekit-frontend/src/lib/server/generation/summary-qa.ts`](../../../sveltekit-frontend/src/lib/server/generation/summary-qa.ts)
- `feature_domain_facts`
  - Used by the direct domain classifier backfill script and the feature-layer backfill path.
- `feature_domain_facts` callers found:
  - [`sveltekit-frontend/scripts/atlas/classify-domains-direct-db.mts`](../../../sveltekit-frontend/scripts/atlas/classify-domains-direct-db.mts)
  - [`sveltekit-frontend/scripts/atlas/backfill-feature-layer-from-atlas-packets.mjs`](../../../sveltekit-frontend/scripts/atlas/backfill-feature-layer-from-atlas-packets.mjs)

### Search result

- No repository definition named `FeatureDomainPacket` was found in `src/`, `scripts/`, or `tests/`.

## Conclusion

- The repository has two domain tables:
  - `feature_domain` is the older canonical domain-classification row table.
  - `feature_domain_facts` is the active provenance/evidence ledger.
- `atlas_artifacts` is a generic derived artifact registry, not the evidentiary home for feature-domain classification rows.
- There is no code evidence that `atlas_artifacts` should be repurposed as the canonical storage home for a `FeatureDomainPacket`.
- There is also no evidence for an `ALTER TABLE` requirement based on the current schema alone.

## Live Schema Snapshot

Live Postgres inspection confirms the same ownership split:

- `atlas_packets`
  - Has canonical identity columns such as `packet_key`, `source_ref`, `feature_id`, `title_id`, `content_hash`, `workspace_id`, `semantic_anchor`, and `ontology_version`.
  - Also carries many orthogonal projection lanes: Qdrant linkage, topology, embeddings, SOM/K-means, pagerank, ontology JSON, and classifier outputs.
  - Its live primary/unique identity support is packet-centric, not feature-domain-registry-centric.
- `atlas_artifacts`
  - Has `artifact_id` as the primary key and indexes around `packet_key`, `source_ref`, `feature_id`, `artifact_type`, `generator`, `status`, and `supersedes_artifact_id`.
  - It behaves as a broad artifact registry with supersession tracking, not as a specialized feature-domain packet table.
- `feature_domain_facts`
  - Has the exact domain-classification fields expected for a ledger: `packet_key`, `source_ref`, `domain_class`, `domain_confidence`, `domain_probabilities`, `classifier_kind`, `classifier_version`, `content_hash`, `processing_pass_id`, and `evidence`.
  - The live unique index on `(packet_key, classifier_version, content_hash)` matches the current ledger-only classifier writer.

### Live counts

- `atlas_packets`: 61,659 rows
- `atlas_artifacts`: 58,312 rows
- `feature_domain_facts`: 61,659 rows
- Top `feature_domain_facts.domain_class` values:
  - `Graph`: 7,716
  - `documentation`: 6,782
  - `Other`: 5,441
  - `UI`: 4,365
  - `test`: 4,228
  - `gpu`: 3,876
  - `compiler`: 3,766
  - `tool`: 3,695
  - `frontend`: 3,190
  - `database`: 2,515

## Safe interpretation

If a `FeatureDomainPacket` abstraction is needed, it should be modeled as an application-level contract that maps to `feature_domain` for the simple canonical domain row, and to `feature_domain_facts` when provenance, classifier versioning, or content-hash lineage is required.
