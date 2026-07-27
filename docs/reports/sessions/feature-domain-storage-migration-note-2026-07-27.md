# Feature Domain Storage Migration Note

Date: 2026-07-27

## Decision

Do not move feature-domain classification rows into `atlas_artifacts`.

Use:

- `feature_domain` for the simple canonical domain row.
- `feature_domain_facts` for the provenance-backed domain ledger.
- `atlas_artifacts` only for generic generated artifacts such as summaries, embeddings, traces, and feature labels.

## Why

Live schema inspection shows:

- `atlas_artifacts` is a generic artifact registry with `artifact_id`, `artifact_type`, `generator`, and `supersedes_artifact_id`.
- `feature_domain` is the older canonical domain-classification row table.
- `feature_domain_facts` is the richer evidence ledger with classifier versioning, content hash lineage, and processing pass tracking.

The repo does not contain a `FeatureDomainPacket` type, so there is no existing contract that forces a new table or an `ALTER TABLE` migration.

## Practical rule

For new work:

- Write simple canonical domain rows to `feature_domain` when you only need the current classification.
- Write audited or replayable domain evidence to `feature_domain_facts` when you need classifier provenance or content-hash lineage.
- Keep generated feature labels, summaries, and traces in `atlas_artifacts`.

## Do not

- Do not repurpose `atlas_artifacts` as the canonical home for feature-domain classification.
- Do not add new domain fields to `atlas_packets` for this purpose.
- Do not introduce a `FeatureDomainPacket` table unless a future schema change explicitly requires one.
