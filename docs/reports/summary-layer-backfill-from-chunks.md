# Summary Layer Backfill From Chunks

Generated: 2026-07-13T21:42:55.281Z
Mode: apply
Status: PASS

## Counts

- chunks read: 10
- candidates with usable summaries: 10
- leaky summaries skipped: 0
- short summaries skipped: 0
- rows without packet context skipped: 5
- packet context joins found: 5
- title_id enriched rows: 5
- deduped packet rows: 1
- rows upserted: 4

## Coverage

- usable candidate pct: 100%
- packet context join pct: 100%
- summary_context pct: 100%

## Sample

- packet:ef36841a707e | sveltekit-frontend/src/lib/server/cache/report-template-cache.ts | 1072 chars
- packet:cd4c3cd32fd4 | sveltekit-frontend/src/routes/(app)/legal-corpus/+page.svelte | 1009 chars
- packet:225cff0e9939 | sveltekit-frontend/src/routes/(app)/analytics/+page.svelte | 962 chars
- packet:7d6672f7b2d2 | sveltekit-frontend/src/service-worker.ts | 961 chars

## Notes

- Promotes existing Gemma4 chunk summaries from codebase_chunk_index into atlas_summary_layers.
- Uses canonical packet_key from atlas_packets when present; rows without packet context are skipped to satisfy the foreign key on atlas_summary_layers.packet_key.
- atlas_packets is used for optional title_id / feature / topology enrichment; Postgres remains canonical truth.
- Verification rows: 4 total, 4 with summary, 4 with metadata, 4 with summary_context.
- Run atlas:packet-summaries:backfill:apply and atlas:feature-envelope:backfill:apply after this script to complete the promotion chain.