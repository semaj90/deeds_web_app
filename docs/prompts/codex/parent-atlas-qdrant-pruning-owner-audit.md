# Parent Atlas Qdrant retention decision — read-only audit

## Objective

Resolve the reported Qdrant inventory discrepancy (18, 46, or another count) and establish whether any empty collections are genuinely unused before proposing retention changes. This is an audit only. Do not delete collections or snapshots, create snapshots, change aliases, upsert points, or mutate PostgreSQL/Valkey/Neo4j.

## Run the inventory

From the repository root, run the standalone Node.js 22-compatible audit:

```powershell
node scripts/atlas/audit-qdrant-pruning.mjs --url http://127.0.0.1:6333 --expect 46 --out .tmp/atlas/qdrant-pruning-audit-v1.json
```

The script uses Qdrant `GET` requests only and writes a local receipt under `.tmp/atlas/`. A count mismatch is an audit finding, not permission to reconcile or remove collections. Use the expected count only if 46 is still the inventory claim being checked.

## Establish ownership and recovery requirements

For every collection, review its point/vector counts, named vector dimensions and metrics, HNSW and optimizer configuration, payload schema, aliases, snapshots, literal repository references, and known initializer/writer/reader paths. Treat text-search hits as leads, not proof of active use or safe retirement. Distinguish production, experimental, empty-but-initialized, and unknown collections; retain `UNKNOWN` where evidence is incomplete.

For any proposed retention candidate, identify:

- Runtime callers, configuration selectors, startup initializers, scheduled jobs, and restore tooling.
- Snapshot/backup coverage, alias capture, collection configuration, and an isolated restore/readback receipt.
- Point identity and source-lineage status, including known point-ID collisions and whether the collection is rebuildable from an admitted PostgreSQL cohort.
- Exact storage savings versus recovery cost, without assuming snapshot bytes equal total volume savings.

## Required output

Produce a source-backed report with observed endpoint, timestamp, count reconciliation, per-collection ownership classification, evidence references, snapshot/alias recovery gaps, and explicit `NOT_PROVEN` labels. Keep all collections and snapshots unchanged. Recommend the smallest next review gate; do not execute it.

## Hard stop

No pruning, deletion, backup creation, restore, alias mutation, database query/write, Graphify refresh, or service restart is authorized by this prompt. A later removal proposal requires a separate explicit approval for named collections and an independently verified recovery path.
