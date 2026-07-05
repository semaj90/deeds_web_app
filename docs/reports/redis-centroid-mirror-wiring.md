# Redis Centroid Mirror Wiring

Generated: 2026-07-04T18:31:33.479Z
Mode: apply
Status: PASS

## Summary

- source table: atlas_higher_hop_index
- qdrant-backed rows read: 0
- community buckets: 0
- som buckets: 0
- planned writes: 1
- applied writes: 1
- failures: 0

## Planned Keys

- `atlas:centroid:index` (index) -> 1 rows

## Samples

- index | atlas:centroid:index | {
  "centroid_keys": [],
  "community_count": 0,
  "generated_at": "2026-07-04T18:31:33.478Z",
  "qdrant_backed_rows": 0,
  "som_count": 0,
  "som_keys": [],
  …

## Next Safe Action

Re-run the mirror in dry-run mode if you want to inspect the generated keys, then proceed to Bifrost mirror wiring.