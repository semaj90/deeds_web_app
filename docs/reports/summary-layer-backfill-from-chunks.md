# Summary Layer Backfill From Chunks

Generated: 2026-08-10T18:36:17.051Z
Mode: dry-run
Status: DRY_RUN

## Counts

- chunks read: 200
- candidates with usable summaries: 192
- leaky summaries skipped: 8
- short summaries skipped: 0
- rows without packet context skipped: 147
- packet context joins found: 45
- title_id enriched rows: 45
- deduped packet rows: 3
- rows upserted: 0

## Coverage

- usable candidate pct: 96%
- packet context join pct: 100%
- summary_context pct: 100%

## Sample

- packet:d1464e02f7c4 | packages/parent-atlas/src/adapters/qdrant.ts | 1118 chars
- packet:4bb01d486192 | sveltekit-frontend/docs/documents-atlas-index.md | 1021 chars
- packet:7b8740287636 | scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/document-drafting/+server.ts | 1011 chars
- ace:packet:41ae4f183768 | scripts/agent/agent-orchestrator.mjs | 1023 chars
- packet:f687fb79f3a0 | packages/parent-atlas-retrieval/src/gpu/gpu-job-queue.ts | 1082 chars

## Notes

- Promotes existing Gemma4 chunk summaries from codebase_chunk_index into atlas_summary_layers.
- Uses canonical packet_key from atlas_packets when present; rows without packet context are skipped to satisfy the foreign key on atlas_summary_layers.packet_key.
- atlas_packets is used for optional title_id / feature / topology enrichment; Postgres remains canonical truth.
- Verification rows: 87 total, 87 with summary, 87 with metadata, 87 with summary_context.
- Run atlas:packet-summaries:backfill:apply and atlas:feature-envelope:backfill:apply after this script to complete the promotion chain.