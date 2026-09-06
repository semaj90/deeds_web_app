# Parent Atlas object-storage owner audit

- Gate: `PARENT-ATLAS-OBJECT-STORAGE-OWNER-01`
- Status: `OBJECT_STORAGE_OWNER_PRESENT_CONVERGENCE_OPEN`
- Scope: read-only source/configuration census; no S3, Postgres, Qdrant, Valkey, Neo4j, or model calls.

## Authority

- PostgreSQL owns structured metadata, identity, revisions, manifests, and checksums.
- SeaweedFS owns large immutable artifact bytes through the S3-compatible transport.
- Qdrant, Neo4j, Valkey, GPU-resident, and local mmap artifacts remain derived projections/residency.

## Current owner

- Parent Atlas adapter: `sveltekit-frontend/src/lib/server/atlas/docs/seaweed-cold-object-store.ts`
- SeaweedFS transport: `sveltekit-frontend/src/lib/server/storage/seaweed.ts`
- Contract: `ColdObjectStorePort + ExternalDocArtifactRefV1`

## Findings

- Legacy-named adapters requiring caller census: **5**
- Local-disk fallback owners: **1**
- Legacy URI-scheme files: **10**

### Blockers

- `DUPLICATE_LEGACY_NAMED_ADAPTERS_REQUIRE_CALLER_CENSUS`
- `LOCAL_DISK_FALLBACK_CAN_CREATE_UNDECLARED_ARTIFACT_AUTHORITY`
- `LEGACY_URI_SCHEMES_PRESENT_RETAIN_AS_COMPATIBILITY_ONLY`

## Next gate

`OBJECT-STORAGE-CALLER-CONVERGENCE-01`: classify callers and runtime profiles before any adapter retirement or fallback removal.
