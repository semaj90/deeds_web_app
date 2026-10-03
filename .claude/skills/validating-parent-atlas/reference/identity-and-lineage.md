# Identity and lineage

Rule set: Identity identifies. Coordinates bind a computation. Lineage qualifies evidence. Feature grain determines the required qualification. Storage IDs never promote identity. Artifacts never select "latest" when a coordinate exists. Packet qualification never implies chunk qualification.

Four identities, never merged:
- Packet identity: `packet_key` (canonical).
- Chunk identity: `canonical_chunk_id`, canonical only when hydrated from PROVEN packet<->chunk lineage.
- Storage locators: `packet_id`, `chunk_row_id`, Qdrant point id. Never identity.
- Artifact coordinates: `candidateSnapshotRevision`, `ordinalMapChecksum`, `coordinateArtifactChecksum`.

Owners (`docs/atlas/package-boundary-registry.json`: `packages/atlas-core/src/identity/atlas-coordinate-v1.ts` is the single canonical coordinate owner; the SvelteKit module is a compatibility re-export, so app imports keep working):
- `packages/atlas-core/src/identity/atlas-coordinate-v1.ts`: `AtlasCoordinateV1`, `PacketEvidenceCoordinateV1`, `ChunkEvidenceCoordinateV1`, `EvidenceEligibilityV1`, `satisfiesEvidenceEligibilityV1`.
- `sveltekit-frontend/src/lib/server/atlas/identity/lineage-qualification-v1.ts`: `qualifyEvidenceV1` (pure; caller passes rows).
- `sveltekit-frontend/src/lib/server/atlas/identity/atlas-uuid-namespaces-v1.ts`: frozen UUIDv5 namespaces derived from `ATLAS_ROOT_NAMESPACE_V1`; use the `uuid` package's `v5`, never a hand-rolled one.
- `sveltekit-frontend/src/lib/server/retrieval/identity-resolution.ts`: `resolveCanonicalIdentityV2` (identity strength; not eligibility).

Chunk qualification needs all of: same `packet_key`; lineage `PROVEN`; `canonical_chunk_id` not null; lineage `source_revision` equals the expected one; packet `workspace_revision_key` equals the expected one. Never substitute: same path, same content hash, same `packet_id`, latest chunk, nearest revision.

UUID policy: v5 for derived semantic identities under a frozen namespace; v7 for new durable events; v4 for random operational ids; no custom v8 layout without a proven need.

Live facts as of the 2026-09-26 census (re-measure before citing): 61,718 packets; 45,567 have no `workspace_revision_key`/`source_revision`; keys are `packet:<12hex>` (58,362), `ace:packet:*` (3,294), bare 16-hex (61), other (1); no `packet:<uuid>` keys yet.
