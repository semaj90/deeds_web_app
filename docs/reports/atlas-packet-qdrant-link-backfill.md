# Atlas Packet Qdrant Link Backfill

- status: PASS
- mode: apply
- collection: codebase_chunks_768
- packets_loaded: 55243
- all_packets_loaded: 58304
- qdrant_points_scanned: 40573
- matches: 31
- updated: 31
- skipped_duplicate_packet: 558
- already_linked_seen: 36793
- no_postgres_join_seen: 3191

## Matched Samples

- packet:1b7ba3c5d8aa -> 00537352-b039-45bf-9009-b44d4ccf337d via src/lib/services/error-analysis/KAGTraverser.ts (768d)
- packet:10e1acda7d60 -> 006960bb-8d3a-49e1-8c9b-ee1a8138111f via src/lib/services/knowledge-search/TagExtractor.ts (768d)
- packet:d5b399d99439 -> 00f23cbd-3f36-428c-8579-c29f0b632ea1 via src/lib/services/error-analysis/OllamaService.ts (768d)
- packet:40a77f5816d3 -> 011e26f2-64f6-456d-b776-b51366ddc19b via src/lib/services/error-analysis/FixSynthesizer.ts (768d)
- packet:088f7ea57bf8 -> 017f7d5c-40ec-4ef1-bb2c-cfbe2119a339 via src/lib/services/knowledge-search/KnowledgeSearcher.ts (768d)
- packet:6c0715e536cd -> 019eba1d-ce59-410f-94c9-240717a5bcd8 via src/lib/services/knowledge-search/KnowledgeIndexer.ts (768d)
- packet:ad74ddf44938 -> 02571631-3f7b-41fd-a6e7-65e73dc78bec via src/lib/services/knowledge-search/RedisCacheService.ts (768d)
- packet:fae9f568ac3b -> 028ce2eb-10be-4e1d-9158-0c4debb7728d via src/lib/services/knowledge-search/PostgresKnowledgeStore.ts (768d)
- packet:4c4c4977c0ce -> 035be65f-000d-4eb2-a1f0-1046e63a72ce via src/lib/services/knowledge-search/MinioKnowledgeStore.ts (768d)
- packet:9d3837061e56 -> 040c1296-29d6-46b6-a807-7b56c2bee88b via src/lib/services/error-analysis/PatternStorage.ts (768d)

## Already Linked Samples

- packet:12dfac568730 -> 0000d635-8df8-4a03-a1b0-e33d2699f6c0 (sveltekit-frontend/src/lib/components/evidence/EvidencePrimaryUpload.svelte)
- packet:1f18437ee58f -> 0001981c-da69-4b0e-9acb-ad29544029c8 (sveltekit-frontend/src/routes/(app)/demos/+page.svelte)
- packet:39131da36eed -> 0002c4d4-3f96-4a8f-934d-61d8c6985340 (sveltekit-frontend/src/routes/(app)/demos/notifications/+page.svelte)
- packet:d8628b36a885 -> 0004791e-40fe-4736-be3b-d84796ac5476 (sveltekit-frontend/src/routes/(app)/admin/codebase-index/+page.svelte)
- packet:2dd3a5e049f5 -> 0006a6fd-d2ec-48ab-926b-2adb327acaaf (sveltekit-frontend/src/lib/server/analytics/unified-research-query.ts)
- packet:7f08f6b3ea65 -> 000700dd-d698-4589-a3b3-62c404909095 (sveltekit-frontend/src/lib/server/db/schema-postgres.ts)
- packet:d6068edcf347 -> 000b45f4-0368-4a92-bde7-5698e49d6f8c (sveltekit-frontend/src/routes/(app)/demos/bits-ui/+page.svelte)
- packet:cbb4949dd176 -> 000d381c-017b-4154-900c-f87e54e79539 (sveltekit-frontend/src/lib/server/helpers/docker-discovery.ts)
- packet:931f622b69c0 -> 0010432e-9be2-4faf-9fc6-f6c26db3fe44 (sveltekit-frontend/src/lib/server/embedding-cache.ts)
- packet:b2b1b246e0fe -> 00113f4e-919d-4799-8eb1-b5e65f5a72fc (sveltekit-frontend/src/lib/utils/webgpu-array-utils.ts)

## No Postgres Join Samples

- 0062a661-a993-4cfc-9e86-0bc1785dd997: src/routes/(analysis)/video-analysis/[evidenceId]/AGENTS.md
- 00865f5e-a81d-454a-b60a-ad66b5781146: src/lib/components/legal-corpus/AGENTS.md
- 0096d303-1566-4c9b-9686-46fb24d70eba: src/lib/server/evidence/services/drizzle-stub.ts
- 00a5ac67-62a0-4539-b8dd-65d5f9714135: src/lib/components/legal/AGENTS.md
- 00abe2b4-f279-4aff-8b28-1c39e429a60d: src/lib/server/ff1/cli/AGENTS.md
- 00aee0f9-ac9d-4f90-9fb9-600fc04ccd8f: src/lib/components/chat/AGENTS.md
- 00b6cd93-7b91-4283-a7b3-0a09d19acb0e: src/lib/components/ai/AGENTS.md
- 00bac87c-24c9-4873-97ad-8bf0a921f32c: src/routes/(app)/fictional-cases/[id]/AGENTS.md
- 014a97cb-9a99-4258-bc3d-624194fdba42: src/lib/components/evidence/AGENTS.md
- 015863c2-e2b1-4296-94be-2e7be29a098f: src/routes/(app)/cases/[id]/notes/AGENTS.md

## Errors

- none
