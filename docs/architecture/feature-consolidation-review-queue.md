# Feature Consolidation Review Queue

This queue is derived from `.tmp/feature-organization-proposal.json`.
`evidence`, `observability`, `rag`, `cases`, `aiAgents`, `legalCorpus`, `codebaseIntel`, and `identity` have been applied; the review queue is now closed.

## Review order

1. `evidence` — 5 files, high confidence
2. `observability` — 7 files, high confidence
3. `rag` — 10 files, high confidence
4. `cases` — 9 files, high confidence
## High-confidence groups

### evidence
- `sveltekit-frontend/src/lib/server/audit/evidence-audit.ts`
- `sveltekit-frontend/src/lib/server/db/seed.ts`
- `sveltekit-frontend/src/lib/server/evidence/batch-entity-storer.ts`
- `sveltekit-frontend/src/lib/server/evidence/services/drizzle-stub.ts`
- `sveltekit-frontend/src/lib/server/evidence/video/video-ingest-service.ts`

### observability
- `sveltekit-frontend/src/lib/server/analytics/architectural-guard.ts`
- `sveltekit-frontend/src/lib/server/analytics/codebase-research.ts`
- `sveltekit-frontend/src/lib/server/analytics/mapreduce-matrix-analysis.ts`
- `sveltekit-frontend/src/lib/server/analytics/research-cache.ts`
- `sveltekit-frontend/src/lib/server/analytics/search-analytics.ts`
- `sveltekit-frontend/src/lib/server/analytics/unified-research-query.ts`
- `sveltekit-frontend/src/lib/server/audit/api-audit-buffer.ts`

### rag
- `sveltekit-frontend/src/lib/server/ace/multi-lane-retrieval.ts`
- `sveltekit-frontend/src/lib/server/ace/ngram-retrieval.ts`
- `sveltekit-frontend/src/lib/server/ace/retrieval-lanes.ts`
- `sveltekit-frontend/src/lib/server/admin/retrieval-analytics-service.ts`
- `sveltekit-frontend/src/lib/server/retrieval/ace-retrieval-logger.ts`
- `sveltekit-frontend/src/lib/server/retrieval/codebase-context.ts`
- `sveltekit-frontend/src/lib/server/retrieval/cold-storage-retrieval-service.ts`
- `sveltekit-frontend/src/lib/server/retrieval/context-buffer.ts`

### cases
- `sveltekit-frontend/src/lib/server/agents/regen/telemetry.ts`
- `sveltekit-frontend/src/lib/server/ai/external-research-agent.ts`
- `sveltekit-frontend/src/lib/server/analytics/deep-research.ts`
- `sveltekit-frontend/src/lib/server/analytics/research-graph-rl.ts`
- `sveltekit-frontend/src/lib/server/analytics/research-summaries-db.ts`
- `sveltekit-frontend/src/lib/server/analytics/reward-events.ts`
- `sveltekit-frontend/src/lib/server/analytics/web-research-crawler.ts`
- `sveltekit-frontend/src/lib/server/db/seed-simple.ts`

### aiAgents (applied)
- `sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts`
- `sveltekit-frontend/src/lib/server/features/ai/ace/error-fingerprint.ts`
- `sveltekit-frontend/src/lib/server/features/ai/ace/error-kag-writer.ts`
- `sveltekit-frontend/src/lib/server/features/ai/ace/intent-synthesis-reward.ts`
- `sveltekit-frontend/src/lib/server/features/ai/ace/intent-synthesis.ts`
- `sveltekit-frontend/src/lib/server/features/ai/ace/kag-dag-runner.ts`
- `sveltekit-frontend/src/lib/server/features/ai/ace/relationship-fetcher.ts`
- `sveltekit-frontend/src/lib/server/features/ai/admin/ai-chat-context.ts`

## Applied medium/low-confidence groups

### legalCorpus (applied)
- `sveltekit-frontend/src/lib/server/features/legal-corpus/db/seed-citations.ts`
- `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/constitution-pipeline.ts`
- `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/ingestion-worker.ts`
- `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/law-citations.ts`

### codebaseIntel (applied)
- `sveltekit-frontend/src/lib/server/features/codebase-intel/indexer/cluster-summary.ts`
- `sveltekit-frontend/src/lib/server/features/codebase-intel/indexer/directory-summarizer.ts`
- `sveltekit-frontend/src/lib/server/features/codebase-intel/indexer/karpathy-wiki.ts`
- `sveltekit-frontend/src/lib/server/features/codebase-intel/indexer/run-cluster-assign.ts`

### identity (applied)
- `sveltekit-frontend/src/lib/server/features/identity/db/seed-dev-user.ts`

## Current boundary

- Proposal exists.
- Priority queue exists.
- Review queue has been fully applied and is now closed.

## Applied batch

- `evidence` and its video-sidecar siblings have been moved into `sveltekit-frontend/src/lib/server/features/evidence/`.
- `observability` has been moved into `sveltekit-frontend/src/lib/server/features/observability/`.
- `rag` has been moved into `sveltekit-frontend/src/lib/server/features/rag/`.
- `cases` has been moved into `sveltekit-frontend/src/lib/server/features/cases/`.
- `aiAgents` has been moved into `sveltekit-frontend/src/lib/server/features/ai/`.
- `legalCorpus` has been moved into `sveltekit-frontend/src/lib/server/features/legal-corpus/`.
- `codebaseIntel` has been moved into `sveltekit-frontend/src/lib/server/features/codebase-intel/`.
- `identity` has been moved into `sveltekit-frontend/src/lib/server/features/identity/`.
