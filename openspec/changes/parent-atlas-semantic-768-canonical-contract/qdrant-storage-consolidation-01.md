# QDRANT-STORAGE-CONSOLIDATION-01

Status: IMPLEMENTED_AUDIT_AND_RETENTION_PLAN_PENDING_WORKSTATION_PROOF

Owner: `parent-atlas-semantic-768-canonical-contract`

This gate reduces persistent vector duplication without changing Parent Atlas canonical identity or semantic lane ownership.

## Frozen invariants

- `semantic_768` remains the single logical semantic representation.
- PostgreSQL remains canonical identity/lineage authority.
- `codebase_chunks_768_v2/content` is the current Qdrant semantic ANN projection according to the runtime vector-lane registry.
- Qdrant, cuVS exact, CAGRA, and TurboVec are executors/projections; executor count never creates additional semantic votes.
- KMeans/SOM cluster IDs are routing metadata, not new semantic identities.
- No full-corpus latent representation is admitted merely because a model exposes 256/128/64 intermediate widths.
- Collection/snapshot deletion requires a separate caller/rollback proof and explicit authorization.
- Collection metadata mutation requires separate authorization.
- Vector datatype migration requires same-cohort retrieval-quality and storage receipts.

## Implemented read-only storage audit

- `scripts/atlas/lib/qdrant-storage-consolidation-v1.mjs`
- `scripts/atlas/audit-qdrant-storage-consolidation-v1.mjs`
- `scripts/atlas/test-qdrant-storage-consolidation-v1.mjs`

The audit:

1. Lists live Qdrant collections.
2. Reads each collection configuration and point count.
3. Computes a raw dense-vector storage estimate from every named dense vector independently.
4. Reads `/collections/{name}/memory` when supported and records live disk usage.
5. Lists collection snapshots and sums snapshot bytes separately from live collection bytes.
6. Classifies only explicitly-known surfaces as `CURRENT_OWNER`, `MIGRATION_ROLLBACK`, `ROUTING_ONLY`, or `CHALLENGER`; unknown populated collections fail closed to `REVIEW_REQUIRED`.
7. Emits proposed collection metadata but never applies it.
8. Never deletes collections or snapshots.

## Implemented read-only snapshot retention planner

- `scripts/atlas/lib/qdrant-snapshot-retention-v1.mjs`
- `scripts/atlas/plan-qdrant-snapshot-retention-v1.mjs`
- `scripts/atlas/test-qdrant-snapshot-retention-v1.mjs`

The planner inventories both per-collection snapshots and full-storage snapshots and emits recommendations only.

Retention rules are deliberately conservative:

- `CURRENT_OWNER`: every observed snapshot is `KEEP_REQUIRED_CURRENT_OWNER` until a future recovery policy explicitly narrows this.
- Healthy `MIGRATION_ROLLBACK`: preserve the newest rollback snapshot (or `--keep-rollback-count=N` newest); older copies may be marked `ARCHIVE_THEN_RECLAIM_CANDIDATE`.
- Unhealthy `MIGRATION_ROLLBACK`: fail closed; every snapshot is `REVIEW_REQUIRED`.
- `ROUTING_ONLY` and `CHALLENGER`: preserve the newest snapshot, leave older snapshots `REVIEW_AFTER_EVAL`.
- Unknown collections: `REVIEW_REQUIRED`.
- Full-storage snapshots: always `REVIEW_REQUIRED_FULL_STORAGE`; the planner never makes them automatic reclaim candidates.

`ARCHIVE_THEN_RECLAIM_CANDIDATE` is not delete authority. It only reports bytes that could be recovered after separate archival/readback proof and explicit authorization.

Every plan carries:

```text
deleteNow                 []
deleteCollections         false
deleteSnapshots           false
archiveSnapshots          false
mutateQdrant              false
```

## Initial explicit policy

| Collection | Classification | Interpretation |
|---|---|---|
| `codebase_chunks_768_v2` | `CURRENT_OWNER` | current rebuildable semantic_768 ANN projection |
| `codebase_chunks_768` | `MIGRATION_ROLLBACK` | legacy semantic_768 generation; retain until caller + rollback parity |
| `codebase_chunks_384_hybrid` | `MIGRATION_ROLLBACK` | legacy 384 migration/reference surface only |
| `codebase_topology_64` | `ROUTING_ONLY` | derived routing/topology surface; evaluate payload/Postgres replacement |
| `codebase_topology_128` | `CHALLENGER` | keep only while a named topology lift experiment remains open |

## Existing named-vector evidence reused

`docs/reports/retrieval-02-qdrant-named-vector-census-v1.json` already records the current named-vector schema and caller census. It confirms `codebase_chunks_768_v2` exposes `content`, `error`, and `signature`, and it enumerates direct Qdrant call sites.

Do not remove `error` or `signature` from a future collection generation until a refreshed census proves all active callers are migrated or the corresponding quality experiment proves the vector is unnecessary.

## Float16 challenger gate

A physical Float16 collection is a challenger only. Logical identity remains `semantic_768`.

Required before promotion:

- exact same candidate/source cohort as Float32 baseline;
- Recall@K;
- MRR@K;
- overlap@K;
- query latency distribution;
- live collection disk bytes from Qdrant memory endpoint;
- snapshot bytes tracked separately;
- no caller/model/vector-name drift;
- no canonical-authority claim.

Quantization is evaluated separately because it may add an accelerated representation while retaining original vectors; it is not treated as equivalent to reducing the original datatype width.

## Topology consolidation gate

Before removing either topology collection, prove that required routing behavior can be reproduced from revision-qualified Postgres fields and/or indexed Qdrant payload fields (`som_cluster`, `som_row`, `som_col`, `kmeans_cluster`, or the admitted equivalents).

Required comparison:

- CandidateOrdinal parity;
- routing candidate-set overlap;
- latency;
- payload/filter index bytes;
- topology collection disk bytes;
- no ranking-promotion change.

## Workstation proof

```powershell
cd C:\Users\james\Videos\deeds-web-app

node --test scripts/atlas/test-qdrant-storage-consolidation-v1.mjs
node --check scripts/atlas/audit-qdrant-storage-consolidation-v1.mjs
node scripts/atlas/audit-qdrant-storage-consolidation-v1.mjs --no-report
node scripts/atlas/audit-qdrant-storage-consolidation-v1.mjs

node --test scripts/atlas/test-qdrant-snapshot-retention-v1.mjs
node --check scripts/atlas/plan-qdrant-snapshot-retention-v1.mjs
node scripts/atlas/plan-qdrant-snapshot-retention-v1.mjs --no-report
node scripts/atlas/plan-qdrant-snapshot-retention-v1.mjs
```

Expected statuses:

```text
QDRANT_STORAGE_CONSOLIDATION_AUDIT_COMPLETE
QDRANT_SNAPSHOT_RETENTION_PLAN_READY
```

A successful audit or retention plan authorizes no deletion or mutation. The next destructive step, if ever requested, requires separate archival/readback proof, current caller/rollback parity, and explicit operator authorization.
