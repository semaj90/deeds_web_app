# SeaweedFS Storage Alignment Audit

Date: 2026-07-26

## Goal

Make SeaweedFS the visible canonical object-storage path across active runtime code and workspace guidance, while preserving legacy MinIO-compatible names only where the live schema or adapter contracts still require them.

## Updated In This Pass

- `codex.md`
- `CLAUDE.md`
- `.env.example`
- `sveltekit-frontend/src/routes/api/library/crawl/+server.ts`
- `sveltekit-frontend/src/lib/server/env.server.ts`
- `sveltekit-frontend/src/lib/server/config/service-urls.ts`
- `sveltekit-frontend/src/lib/server/adapters/service-integrations.ts`
- `sveltekit-frontend/src/lib/server/helpers/service-discovery.ts`
- `sveltekit-frontend/src/lib/server/db/mirror-query.ts`
- `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/ingestion-worker.ts`
- `sveltekit-frontend/src/mcp/server.ts`
- `sveltekit-frontend/src/routes/api/health/+server.ts`
- `sveltekit-frontend/src/lib/server/services/knowledge-search/KnowledgeSearcher.ts`
- `sveltekit-frontend/src/lib/server/services/knowledge-search/MinioKnowledgeStore.ts`
- `sveltekit-frontend/src/lib/server/services/knowledge-search/KnowledgeIndexer.ts`
- `sveltekit-frontend/src/lib/config/env.server.ts`
- `sveltekit-frontend/src/lib/server/minio.ts`
- `sveltekit-frontend/src/lib/server/minio-client.ts`
- `sveltekit-frontend/src/lib/server/minio/client.ts`
- `sveltekit-frontend/src/lib/server/minio/health-check.ts`
- `sveltekit-frontend/src/lib/server/services/knowledge-search/types.ts`
- `sveltekit-frontend/src/lib/server/services/knowledge-search/QdrantKnowledgeStore.ts`
- `sveltekit-frontend/src/lib/server/rag/types.ts`
- `sveltekit-frontend/src/lib/server/rag/sdk.ts`
- `sveltekit-frontend/src/lib/types/legal-corpus.ts`
- `sveltekit-frontend/src/routes/api/knowledge/document/[id]/+server.ts`
- `sveltekit-frontend/src/lib/stores/unified/evidence-store.svelte.ts`
- `sveltekit-frontend/src/routes/api/persons-of-interest/[id]/photos/+server.ts`
- `sveltekit-frontend/src/lib/server/services/knowledge-search/PostgresKnowledgeStore.ts`

## Rename Now

These were safe to update immediately because they were comments, docs, helper aliases, or local variable names rather than durable contracts.

- `codex.md`
  - Added SeaweedFS canonical object-store rule.
- `CLAUDE.md`
  - Added explicit SeaweedFS-first implementation rule.
- `.env.example`
  - Reordered storage setup so `SEAWEED_*` appears first.
- `sveltekit-frontend/src/lib/server/config/service-urls.ts`
  - Added `seaweedS3` service URL alias.
- `sveltekit-frontend/src/routes/api/library/crawl/+server.ts`
  - Clarified SeaweedFS-first object-key generation.
- `sveltekit-frontend/src/lib/server/adapters/service-integrations.ts`
  - Updated comments and adapter description to reflect SeaweedFS via S3-compatible client.
- `sveltekit-frontend/src/lib/server/helpers/service-discovery.ts`
  - Added `seaweedfs` discovery target and pointed legacy `minio` discovery to the SeaweedFS S3 container.
- `sveltekit-frontend/src/lib/server/db/mirror-query.ts`
  - Updated comments and stub config names to `OBJECT_STORAGE_*`.
- `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/ingestion-worker.ts`
  - Renamed local upload variable from `minioKey` to `objectStorageKey` while still writing to the legacy DB field.
- `sveltekit-frontend/src/mcp/server.ts`
  - Made the MCP file fetch helper prefer `SEAWEED_ENDPOINT` and `SEAWEED_S3_BUCKET` before falling back to legacy MinIO-compatible values.
- `sveltekit-frontend/src/routes/api/health/+server.ts`
  - Made the SeaweedFS master health probe prefer `SEAWEED_ENDPOINT` before falling back to `MINIO_ENDPOINT`.
- `sveltekit-frontend/src/lib/server/services/knowledge-search/KnowledgeSearcher.ts`
  - Renamed a local `minioKey` variable to `storageKey` while preserving the response field name for compatibility.
- `sveltekit-frontend/src/lib/server/services/knowledge-search/MinioKnowledgeStore.ts`
  - Updated defaults to prefer `SEAWEED_*` endpoint, bucket, region, and credentials while keeping the legacy MinIO-compatible class name.
- `sveltekit-frontend/src/lib/server/services/knowledge-search/KnowledgeIndexer.ts`
  - Renamed config fields and internal helper names to object-storage terminology while preserving `minioKey` in the public result contract.
- `sveltekit-frontend/src/lib/config/env.server.ts`
  - Changed the secondary env normalization layer to prefer SeaweedFS endpoint and credential inputs before legacy `MINIO_*` values.
- `sveltekit-frontend/src/lib/server/minio.ts`
  - Updated the compatibility adapter to prefer `SEAWEED_*` endpoint, port, and credentials and to accept `seaweedfs://` URLs in key extraction.
- `sveltekit-frontend/src/lib/server/minio-client.ts`
  - Updated the shared MinIO-compatible helper to prefer SeaweedFS endpoint, port, bucket, and credentials and to emit `seaweedfs://` fallback URLs.
- `sveltekit-frontend/src/lib/server/minio/client.ts`
  - Updated the low-level client bootstrap to prefer SeaweedFS endpoint, port, and credentials.
- `sveltekit-frontend/src/lib/server/minio/health-check.ts`
  - Updated health and upload checks to probe SeaweedFS-first configuration while keeping legacy function names.
- `sveltekit-frontend/src/lib/server/services/knowledge-search/types.ts`
  - Added `objectStorageKey` alongside `minioKey` in the public knowledge-search DTOs.
- `sveltekit-frontend/src/lib/server/services/knowledge-search/QdrantKnowledgeStore.ts`
  - Added `objectStorageKey` population with fallback to the legacy `minioKey` payload field.
- `sveltekit-frontend/src/lib/server/rag/types.ts`
  - Added `objectStorageBucket` and `objectStorageKey` alongside the legacy shard-job fields.
- `sveltekit-frontend/src/lib/server/rag/sdk.ts`
  - Added optional object-storage inputs and mirrors them into shard jobs without breaking legacy callers.
- `sveltekit-frontend/src/lib/types/legal-corpus.ts`
  - Added `objectStorageKey` to the document-detail view model.
- `sveltekit-frontend/src/routes/api/knowledge/document/[id]/+server.ts`
  - Exposes `objectStorageKey` in the response while preserving `minioKey`.
- `sveltekit-frontend/src/lib/stores/unified/evidence-store.svelte.ts`
  - Added `objectStorageKey` support to the upload-response metadata bridge while preserving `minioKey`.
- `sveltekit-frontend/src/routes/api/persons-of-interest/[id]/photos/+server.ts`
  - Switched route-facing paths and local variable naming to object-storage terminology while still persisting the legacy `minioKey` DB field.
- `sveltekit-frontend/src/lib/server/services/knowledge-search/PostgresKnowledgeStore.ts`
  - Added `objectStorageKey` / `object_storage_key` to the in-memory contract surface alongside the legacy fields.

## Leave As Legacy Compatibility

These still appear to be active compatibility surfaces and should not be renamed blindly.

- `MINIO_*` env variables in `sveltekit-frontend/src/lib/server/env.server.ts`
  - These are still used as the compatibility layer that points the S3 client at SeaweedFS.
- `minio_key` and `minio_key_normalized` database fields
  - These are live schema fields and are still required by ingestion and retrieval paths.
- `MinIOAdapter`, `MinIOClient`, and `MinIOConfig` type/interface names in `sveltekit-frontend/src/lib/server/adapters/service-integrations.ts`
  - These appear to be shared contracts; rename only with a coordinated refactor.
- `minio` service key in `COMMON_SERVICES`
  - Kept for compatibility with callers that still request `COMMON_SERVICES.minio`.
- `sveltekit-frontend/src/lib/config/env.server.ts`
  - This is a second environment contract layer that still defines and normalizes `MINIO_*` values.
- `sveltekit-frontend/src/lib/server/minio-client.ts`, `sveltekit-frontend/src/lib/server/minio.ts`, and `sveltekit-frontend/src/lib/server/minio/*`
  - These are still the active S3-compatible storage client surfaces despite their legacy MinIO naming.

## Needs Migration Plan

These are the next likely candidates for a deeper cleanup pass because they involve broader runtime contract changes rather than simple wording fixes.

- `sveltekit-frontend/src/lib/server/env.server.ts`
  - Move from `MINIO_*` compatibility names toward a canonical `S3_*` or `SEAWEED_*` contract.
- `sveltekit-frontend/src/lib/server/adapters/service-integrations.ts`
  - Replace `MinIOAdapter` naming with a storage-neutral or SeaweedFS-specific contract.
- `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`
  - Rename legacy fields such as `minioKey`, `imageMinioKey`, and `minioKeyNormalized` only with migrations and caller updates.
- `sveltekit-frontend/src/lib/server/helpers/service-discovery.ts`
  - Migrate callers from `minio` to `seaweedfs` before removing the alias.
- `sveltekit-frontend/src/mcp/server.ts`
  - Consider renaming the internal MinIO helper functions only after confirming no external code generation or tracing depends on those names.
- `sveltekit-frontend/src/lib/server/services/knowledge-search/*`
  - Several knowledge-search contracts still expose `minioKey` in payloads and DTOs; these should move only with coordinated Qdrant and API contract updates.
- `sveltekit-frontend/src/lib/server/services/knowledge-search/types.ts`
  - Public DTOs such as `IndexResult` and `FullDocument` still expose `minioKey` and should only change with a versioned contract migration.
- `sveltekit-frontend/src/lib/server/minio.ts`, `sveltekit-frontend/src/lib/server/minio-client.ts`, and `sveltekit-frontend/src/lib/server/minio/*`
  - The module and helper names are still legacy MinIO-compatible names and should only be renamed after callers are migrated to a storage-neutral alias surface.
- `sveltekit-frontend/src/lib/server/rag/types.ts`, `sveltekit-frontend/src/lib/server/rag/sdk.ts`, and `sveltekit-frontend/src/lib/types/legal-corpus.ts`
  - These now carry both names and should only drop the legacy `minio*` fields in a versioned API/schema cleanup.

## Remaining High-Signal Legacy References Seen

- `sveltekit-frontend/src/lib/server/features/evidence/video/video-ingest-service.ts`
  - Uses `ENV.MINIO_EVIDENCE_BUCKET` but already emits `seaweedfs://...` URIs.
- `sveltekit-frontend/src/mcp/server.ts`
  - Uses a legacy MinIO-compatible client for object fetches, now patched to prefer SeaweedFS endpoint and bucket values.
- `sveltekit-frontend/src/routes/api/health/+server.ts`
  - Was deriving the SeaweedFS health probe host from `MINIO_ENDPOINT`; now patched to prefer `SEAWEED_ENDPOINT`.
- `sveltekit-frontend/src/lib/server/services/knowledge-search/KnowledgeIndexer.ts`
  - Still writes `minioKey` into knowledge-search payloads.
- `sveltekit-frontend/src/lib/server/services/knowledge-search/MinioKnowledgeStore.ts`
  - Class name remains legacy for compatibility, but runtime defaults now prefer SeaweedFS values.
- `sveltekit-frontend/src/lib/config/env.server.ts`
  - Still exports `getMinioConfig` and `MINIO_*` config keys as compatibility aliases.
- `sveltekit-frontend/src/lib/server/minio-client.ts`
  - Still exports `getMinioClient` and related MinIO-compatible helpers, but runtime resolution is now SeaweedFS-first.
- `sveltekit-frontend/src/lib/server/minio.ts`
  - Still exports `MinIOService` and `getMinioConfig`, but runtime resolution is now SeaweedFS-first.
- `sveltekit-frontend/src/lib/server/services/knowledge-search/PostgresKnowledgeStore.ts`
  - Still persists and returns `minio_key` / `minioKey` compatibility fields.
- `sveltekit-frontend/src/lib/server/services/knowledge-search/types.ts`
  - Still intentionally preserves `minioKey` for compatibility, but now also exposes `objectStorageKey`.
- `sveltekit-frontend/src/lib/stores/unified/evidence-store.svelte.ts`
  - Still passes through `minioKey` for compatibility, but now also carries `objectStorageKey`.
- `sveltekit-frontend/src/routes/api/library/documents/[documentId]/pdf/+server.ts`
  - Reads `minio_key` directly from `library_documents`; this is schema-bound and should not be renamed without a migration.
- `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`
  - Durable schema still encodes `minio_*` field names.
- `sveltekit-frontend/src/lib/server/db/error_analysis.txt`
  - Large generated/debug artifact with stale MinIO text; not an active runtime contract.

## Active Caller Inventory

### `ENV.MINIO_*` or `process.env.MINIO_*`

Compatibility-layer env consumers still exist in these active files:

- `sveltekit-frontend/src/mcp/server.ts`
- `sveltekit-frontend/src/lib/config/env.server.ts`
- `sveltekit-frontend/src/lib/env.server.ts`
- `sveltekit-frontend/src/lib/server/env.server.ts`
- `sveltekit-frontend/src/lib/server/config/service-urls.ts`
- `sveltekit-frontend/src/lib/server/minio-client.ts`
- `sveltekit-frontend/src/lib/server/minio.ts`
- `sveltekit-frontend/src/lib/server/minio/client.ts`
- `sveltekit-frontend/src/lib/server/minio/health-check.ts`
- `sveltekit-frontend/src/lib/server/adapters/service-integrations.ts`
- `sveltekit-frontend/src/lib/server/unified/legal-ai-service.ts`
- `sveltekit-frontend/src/lib/server/features/evidence/video/video-ingest-service.ts`
- `sveltekit-frontend/src/lib/server/init/legal-search-init.ts`
- `sveltekit-frontend/src/lib/server/legal/constitution-fetcher.ts`
- `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/ingestion-worker.ts`
- `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/constitution-pipeline.ts`
- `sveltekit-frontend/src/lib/server/services/knowledge-search/MinioKnowledgeStore.ts`
- `sveltekit-frontend/src/lib/server/services/knowledge-search/KnowledgeIndexer.ts`
- `sveltekit-frontend/src/routes/api/system/services/+server.ts`
- `sveltekit-frontend/src/routes/api/system/phase13/+server.ts`
- `sveltekit-frontend/src/routes/api/system/env/+server.ts`
- `sveltekit-frontend/src/routes/api/vision/analyze/+server.ts`
- `sveltekit-frontend/src/routes/api/health/+server.ts`
- `sveltekit-frontend/src/routes/api/evidence/upload/+server.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/download/+server.ts`
- `sveltekit-frontend/src/routes/api/evidence/[id]/vlm-analyze/+server.ts`
- `sveltekit-frontend/src/routes/api/library/documents/[documentId]/pdf/+server.ts`
- `sveltekit-frontend/src/routes/api/persons/face-synth/+server.ts`
- `sveltekit-frontend/src/routes/api/persons-of-interest/[id]/face-rerank/+server.ts`
- `sveltekit-frontend/src/routes/api/admin/ai-chat/upload/+server.ts`

### `COMMON_SERVICES.minio`

No direct active callers were found in the current search pass. The alias remains because other callers may still request the string key `minio` indirectly through service-discovery helpers.

### `MinIOAdapter`

Direct active references:

- `sveltekit-frontend/src/lib/server/adapters/service-integrations.ts`
  - class definition
  - adapter instantiation

### `minio_key` and related schema fields

Schema-bound or DB-bound active callers include:

- `sveltekit-frontend/src/routes/api/library/documents/[documentId]/pdf/+server.ts`
- `sveltekit-frontend/src/routes/api/library/crawl/+server.ts`
- `sveltekit-frontend/src/routes/api/library/documents/[documentId]/+server.ts`
- `sveltekit-frontend/src/routes/api/library/document/[id]/+server.ts`
- `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/ingestion-worker.ts`
- `sveltekit-frontend/src/lib/server/features/legal-corpus/legal/constitution-pipeline.ts`
- `sveltekit-frontend/src/lib/server/services/knowledge-search/PostgresKnowledgeStore.ts`
- `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`
- `sveltekit-frontend/src/lib/server/db/schema/library-documents.ts`
- `sveltekit-frontend/src/lib/server/db/schema/page-artifacts.ts`

Payload/DTO compatibility references using `minioKey` still exist in:

- `sveltekit-frontend/src/routes/api/knowledge/document/[id]/+server.ts`
- `sveltekit-frontend/src/routes/api/persons-of-interest/[id]/photos/+server.ts`
- `sveltekit-frontend/src/lib/types/legal-corpus.ts`
- `sveltekit-frontend/src/lib/server/services/knowledge-search/types.ts`
- `sveltekit-frontend/src/lib/server/services/knowledge-search/QdrantKnowledgeStore.ts`
- `sveltekit-frontend/src/lib/server/services/knowledge-search/KnowledgeIndexer.ts`
- `sveltekit-frontend/src/lib/server/services/knowledge-search/KnowledgeSearcher.ts`
- `sveltekit-frontend/src/lib/server/rag/types.ts`
- `sveltekit-frontend/src/lib/server/rag/sdk.ts`
- `sveltekit-frontend/src/lib/stores/unified/evidence-store.svelte.ts`

## API Alias Outcome

The public contract layer now exposes `objectStorageKey` in the touched knowledge-search and RAG DTOs while preserving `minioKey` for compatibility.

That means the remaining rename risk is concentrated in:

- persistent schema fields such as `minio_key`
- Qdrant payload conventions that still store `minioKey`
- older UI/state consumers that have not yet switched to `objectStorageKey`

## Consumer-Layer Outcome

The touched consumer layer now accepts or emits `objectStorageKey` in addition to `minioKey`.

The remaining high-signal follow-up is narrower:

- any untouched UI/state code that still reads only `minioKey`
- route surfaces that still hardcode `/minio/...` paths
- schema-backed persistence that still uses `minio_key` as the sole durable column name

## Latest Pass Outcome

The shared storage-client layer now prefers:

- `SEAWEED_ENDPOINT` before `MINIO_ENDPOINT`
- `SEAWEED_S3_PORT` before `MINIO_PORT`
- `SEAWEED_ACCESS_KEY` / `SEAWEED_SECRET_KEY` before `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`
- `SEAWEED_S3_BUCKET` before legacy bucket envs where a generic object-storage bucket is appropriate

It still intentionally preserves:

- legacy module names such as `minio-client.ts`
- legacy helper names such as `getMinioClient`
- legacy DTO and schema fields such as `minioKey` and `minio_key`

## Recommended Next Step

Run a dedicated storage-contract pass that inventories every caller of:

- `ENV.MINIO_*`
- `COMMON_SERVICES.minio`
- `minio_key`
- `MinIOAdapter`

Then split the work into:

1. compatibility aliases to keep
2. code-level renames to do now
3. schema and migration work that must be staged
