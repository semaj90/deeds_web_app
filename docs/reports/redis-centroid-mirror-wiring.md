# Redis Centroid Mirror Wiring

Generated: 2026-06-21T17:17:26.646Z
Mode: dry-run
Status: PASS

## Summary

- source table: atlas_higher_hop_index
- qdrant-backed rows read: 5
- community buckets: 1
- som buckets: 1
- planned writes: 4
- applied writes: 0
- failures: 0

## Planned Keys

- `centroid:1` (centroid) -> 5 rows
- `som:1` (som) -> 5 rows
- `som:cell:1` (som_cell) -> 5 rows
- `atlas:centroid:index` (index) -> 1 rows

## Samples

- centroid | centroid:1 | {
  "canonical_source_refs": [
    "sveltekit-frontend/src/lib/client/timeline-client.ts",
    "sveltekit-frontend/src/routes/api/cases/[id]/citations/+server.t…
- som | som:1 | {
  "canonical_source_refs": [
    "sveltekit-frontend/src/lib/client/timeline-client.ts",
    "sveltekit-frontend/src/routes/api/cases/[id]/citations/+server.t…
- som_cell | som:cell:1 | {
  "canonical_source_refs": [
    "sveltekit-frontend/src/lib/client/timeline-client.ts",
    "sveltekit-frontend/src/routes/api/cases/[id]/citations/+server.t…
- index | atlas:centroid:index | {
  "centroid_keys": [
    "centroid:1"
  ],
  "community_count": 1,
  "generated_at": "2026-06-21T17:17:26.646Z",
  "qdrant_backed_rows": 5,
  "som_count": 1,
…

## Next Safe Action

Use --apply to write the centroid and SOM mirrors into Redis/Valkey, then move to Bifrost mirror wiring.