---
name: qdrant-embedding-ranker-audit
description: Audit Qdrant collection growth, embedding identity, snapshot retention, and ranking ownership without mutating stores or deleting recovery data.
---

# Qdrant Embedding and Ranker Audit

Use this skill when asked whether Qdrant collections, snapshots, embedding variants, or ranking components are needed, who writes them, or what can safely be cleaned up. This is an audit and disposition workflow, not a cleanup authorization.

## Non-negotiable safety

- Default to read-only. Never delete Qdrant points, collections, aliases, snapshots, Docker images, containers, or volumes from this skill.
- Do not use `docker system prune`, volume prune, Qdrant delete APIs, or collection recreation as an audit shortcut.
- "Newest" does not mean "duplicate." Only byte-identical checksums establish identical snapshot files; distinct snapshots are separate recovery points until an owner approves retention policy and restore proof.
- PostgreSQL owns canonical packet/chunk identity, evidence, and revisions. Qdrant, TurboVec, cuVS, Neo4j, and GPU outputs are derived projections or executors.
- Canonical dense retrieval is `EmbeddingGemma` to `semantic_768` (768 dimensions, cosine). Never use 384-D vectors in the active evidence path. EmbeddingGemma 2 is a challenger until its model recipe, quality evaluation, parity, and promotion are approved.
- Qdrant point IDs are projection IDs, not packet identity. Join and deduplicate by verified canonical identity and source/revision metadata; never infer identity from point order, filename, or vector similarity alone.
- Do not convert estimates, point counts, or "duplicate-looking" vectors into deletion candidates without canonical join-back, consumer census, backup/restore evidence, and independent readback.
- Avoid heavy scans/builds when host free space is low. Do not write reports into tracked paths unless explicitly requested; use stdout or an ignored run-scoped location.

## Audit sequence

1. **Measure workspace scope.** Separate `git ls-files` from ignored and untracked files. Report counts and sizes by top-level directory; distinguish source, dependencies, generated caches, model artifacts, and backups. Do not recursively enumerate or delete everything by default. Preserve user changes and submodule contents.
2. **Find owners and callers.** Trace each collection name from configuration to every producer, consumer, queue, worker, and scheduled job. Record whether a current runtime producer is connected, not just whether source code exists. Follow `graphify-pipeline-gap-audit` for identity/revision evidence and caller tracing.
3. **Inspect collection contracts.** Record dimensions, named vector keys, distance, quantization, point count, payload indexes, disk/RAM, aliases, and last verified source revision. Compare with the canonical `semantic_768` contract. Do not change collection configuration during the audit.
4. **Trace ranking once.** Start at `sveltekit-frontend/src/lib/server/search/hybrid-search.ts`; identify candidate-generation lanes, normalization/dedup, fusion owner, and optional reranker. Record whether each backend is actually configured and called. Treat `build_recommendation` as an advisor unless source proves it owns production ranking. Separate Qdrant ANN, GPU reranking, TurboVec, and cuVS roles; do not add extra ranking votes or score fusion.
5. **Inventory snapshots by checksum.** Report collection, creation time, bytes, checksum, and known restore/consumer evidence. Exact checksum matches may be marked duplicate-file candidates. Distinct checksums remain separate restore points regardless of age.
6. **Classify disposition.** Use only `RETAIN`, `ARCHIVE_CANDIDATE`, `REVIEW_REQUIRED`, or `UNKNOWN_OWNER`. An archive candidate is not deletion approval. For point-level duplicate candidates require the same canonical packet/chunk key, content hash, source revision, representation/model recipe, and payload semantics; also prove all readers use the surviving canonical point.
7. **Recommend prevention.** Prefer deterministic idempotent projection IDs derived by the existing owner, Postgres-first outbox/CAS, revision-bound payloads, bounded batches, and per-run added/updated/rejected counts. Do not invent a second writer or canonical index.
8. **Validate only with bounded checks.** Prefer fixture/unit tests and read-only API/catalog calls. Do not warm caches, run reindex/backfill, GPU jobs, `EXPLAIN ANALYZE`, migrations, or browser-heavy runs without explicit scope and adequate disk headroom.

## Existing audit owners

Reuse these instead of creating duplicate inventory/ranker implementations:

- `scripts/atlas/audit-qdrant-storage-breakdown-v1.mjs` - collection, `/memory`, snapshot, consumer, and storage inventory. It writes a report by default; use `--no-report` for stdout-only runs. Inspect the current script before invocation.
- `scripts/atlas/qdrant-postgres-identity-audit.mjs` - inspect its implementation and input requirements before use; keep it read-only.
- `scripts/atlas/audit-ranker-envelope-readiness.mjs` and `scripts/atlas/audit-ranking-signal-coverage.mjs` - inspect report destinations and inputs before running; use ignored run-scoped outputs when supported.
- `sveltekit-frontend/src/lib/server/search/hybrid-search.ts` - current application ranking/fusion entry point; verify current callers before stating it is live.
- `sveltekit-frontend/src/lib/server/search/create-codebase-search-backend.ts` - backend selection contract; a stub or selectable backend is not proof of configured traffic.

## Required report

Include:

- inventory scope and timestamp, tracked/untracked/ignored distinction, and free disk space;
- each collection/snapshot's owner, producer, consumers, identity/revision coverage, size, and disposition;
- the ranking call chain and configured versus dormant backends;
- exact versus suspected duplicates, with checksum or canonical join evidence;
- risks, unknown owners, and the first stop condition;
- explicit statement that no data was deleted or mutated.

Classify claims as `CREATED`, `WIRED`, `PROVEN`, or `DONE`; tests and API health alone are not end-to-end proof. Do not mark cleanup complete until an approved archival/deletion operation has its own rollback/restore plan and independent verification.

Every execution concludes with:

```yaml
likely_cause: <one sentence>
evidence: <specific paths, counts, commands, and receipts>
patch_targets: <changed paths or remaining owner paths>
safe_next_command: <read-only next step>
smoke_command: <focused validation run or recommended>
report_path: <report location or none>
```
