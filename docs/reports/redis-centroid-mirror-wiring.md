# Redis Centroid Mirror Wiring

Generated: 2026-06-15T23:40:01.137Z
Mode: dry-run
Status: PASS

## Summary

- source table: atlas_higher_hop_index
- qdrant-backed rows read: 1
- community buckets: 1
- som buckets: 1
- planned writes: 4
- applied writes: 0
- failures: 0

## Planned Keys

- `centroid:1` (centroid) -> 1 rows
- `som:1` (som) -> 1 rows
- `som:cell:1` (som_cell) -> 1 rows
- `atlas:centroid:index` (index) -> 1 rows

## Samples

- centroid | centroid:1 | {
  "canonical_source_refs": [
    "src/lib/client/timeline-client.ts"
  ],
  "chunk_ids": [
    "card:src/lib/client/timeline-client.ts:3d6ecb4eaa1bb17d"
  ],
…
- som | som:1 | {
  "canonical_source_refs": [
    "src/lib/client/timeline-client.ts"
  ],
  "chunk_ids": [
    "card:src/lib/client/timeline-client.ts:3d6ecb4eaa1bb17d"
  ],
…
- som_cell | som:cell:1 | {
  "canonical_source_refs": [
    "src/lib/client/timeline-client.ts"
  ],
  "chunk_ids": [
    "card:src/lib/client/timeline-client.ts:3d6ecb4eaa1bb17d"
  ],
…
- index | atlas:centroid:index | {
  "centroid_keys": [
    "centroid:1"
  ],
  "community_count": 1,
  "generated_at": "2026-06-15T23:40:01.137Z",
  "qdrant_backed_rows": 1,
  "som_count": 1,
…

## Next Safe Action

Use --apply to write the centroid and SOM mirrors into Redis/Valkey, then move to Bifrost mirror wiring.