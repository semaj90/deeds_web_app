# Summary Layer Backfill From Chunks

Generated: 2026-07-14T16:12:52.707Z
Mode: apply
Status: PASS

## Counts

- chunks read: 100
- candidates with usable summaries: 99
- leaky summaries skipped: 1
- short summaries skipped: 0
- rows without packet context skipped: 32
- packet context joins found: 67
- title_id enriched rows: 67
- deduped packet rows: 6
- rows upserted: 69

## Coverage

- usable candidate pct: 99%
- packet context join pct: 100%
- summary_context pct: 100%

## Sample

- packet:ef36841a707e | sveltekit-frontend/src/lib/server/cache/report-template-cache.ts | 797 chars
- packet:cd4c3cd32fd4 | sveltekit-frontend/src/routes/(app)/legal-corpus/+page.svelte | 1009 chars
- packet:225cff0e9939 | sveltekit-frontend/src/routes/(app)/analytics/+page.svelte | 962 chars
- packet:7d6672f7b2d2 | sveltekit-frontend/src/service-worker.ts | 961 chars
- packet:0b86927eecca | sveltekit-frontend/src/lib/server/integrations/obsidian-client.ts | 947 chars

## Notes

- Promotes existing Gemma4 chunk summaries from codebase_chunk_index into atlas_summary_layers.
- Uses canonical packet_key from atlas_packets when present; rows without packet context are skipped to satisfy the foreign key on atlas_summary_layers.packet_key.
- atlas_packets is used for optional title_id / feature / topology enrichment; Postgres remains canonical truth.
- Verification rows: 69 total, 69 with summary, 69 with metadata, 69 with summary_context.
- Run atlas:packet-summaries:backfill:apply and atlas:feature-envelope:backfill:apply after this script to complete the promotion chain.