# Redis Centroid Mirror Wiring

Generated: 2026-06-21T21:07:46.728Z
Mode: apply
Status: PASS

## Summary

- source table: atlas_higher_hop_index
- qdrant-backed rows read: 25
- community buckets: 2
- som buckets: 6
- planned writes: 15
- applied writes: 15
- failures: 0

## Planned Keys

- `centroid:1` (centroid) -> 22 rows
- `centroid:10` (centroid) -> 3 rows
- `som:1` (som) -> 17 rows
- `som:cell:1` (som_cell) -> 17 rows
- `som:3` (som) -> 2 rows
- `som:cell:3` (som_cell) -> 2 rows
- `som:58` (som) -> 2 rows
- `som:cell:58` (som_cell) -> 2 rows
- `som:9` (som) -> 2 rows
- `som:cell:9` (som_cell) -> 2 rows
- `som:96` (som) -> 1 rows
- `som:cell:96` (som_cell) -> 1 rows
- `som:7` (som) -> 1 rows
- `som:cell:7` (som_cell) -> 1 rows
- `atlas:centroid:index` (index) -> 1 rows

## Samples

- centroid | centroid:1 | {
  "canonical_source_refs": [
    "sveltekit-frontend/src/lib/client/timeline-client.ts",
    "sveltekit-frontend/src/lib/utils/simd-markdown-parser.ts",
    "…
- centroid | centroid:10 | {
  "canonical_source_refs": [
    "sveltekit-frontend/src/auth-store.svelte.ts",
    "sveltekit-frontend/src/mcp-gpu-orchestrator.ts",
    "sveltekit-frontend/…
- som | som:1 | {
  "canonical_source_refs": [
    "sveltekit-frontend/src/lib/client/timeline-client.ts",
    "sveltekit-frontend/src/routes/(app)/citations/+page.svelte",
   …
- som_cell | som:cell:1 | {
  "canonical_source_refs": [
    "sveltekit-frontend/src/lib/client/timeline-client.ts",
    "sveltekit-frontend/src/routes/(app)/citations/+page.svelte",
   …
- som | som:3 | {
  "canonical_source_refs": [
    "sveltekit-frontend/src/auth-store.svelte.ts",
    "sveltekit-frontend/src/routes/api/graphify/stream/+server.ts"
  ],
  "chu…
- som_cell | som:cell:3 | {
  "canonical_source_refs": [
    "sveltekit-frontend/src/auth-store.svelte.ts",
    "sveltekit-frontend/src/routes/api/graphify/stream/+server.ts"
  ],
  "chu…
- som | som:58 | {
  "canonical_source_refs": [
    "sveltekit-frontend/src/routes/api/rabbitmq/health/+server.ts",
    "sveltekit-frontend/src/routes/api/research/ldr-status/+s…
- som_cell | som:cell:58 | {
  "canonical_source_refs": [
    "sveltekit-frontend/src/routes/api/rabbitmq/health/+server.ts",
    "sveltekit-frontend/src/routes/api/research/ldr-status/+s…
- som | som:9 | {
  "canonical_source_refs": [
    "sveltekit-frontend/src/lib/utils/simd-markdown-parser.ts",
    "sveltekit-frontend/src/lib/utils/ui-recon.ts"
  ],
  "chunk_…
- som_cell | som:cell:9 | {
  "canonical_source_refs": [
    "sveltekit-frontend/src/lib/utils/simd-markdown-parser.ts",
    "sveltekit-frontend/src/lib/utils/ui-recon.ts"
  ],
  "chunk_…

## Next Safe Action

Re-run the mirror in dry-run mode if you want to inspect the generated keys, then proceed to Bifrost mirror wiring.