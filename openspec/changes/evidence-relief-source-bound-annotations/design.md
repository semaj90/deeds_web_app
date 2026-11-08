## Context

The evidence modal and shared relief renderer are being aligned. Existing evidence rows use legacy `minio://` identifiers while the configured signed S3 client accesses SeaweedFS. A live read-only upscale route integration has verified one authorized image against PostgreSQL, SeaweedFS object bytes, and Sharp; it did not exercise browser rendering or persistence. The depth-map route previously verified a recorded SHA-256 only when present, allowing legacy unverified bytes; this work now requires a valid depth digest and manifest dimensions before serving the artifact. Existing `canvas_annotations` is generic canvas JSON and is not a safe substitute for image/depth-bound markers.

Constraints: PostgreSQL remains canonical; SeaweedFS stores source and derived bytes; Redis is only a disposable cache. No live schema migration, evidence rewrite, depth generation, object write, or service lifecycle operation is included without a separately authorized gate.

## Goals / Non-Goals

**Goals:**
- Bind each usable depth artifact to evidence identity, source SHA-256 and revision, exact source frame, source dimensions, depth SHA-256 and dimensions, and depth-model revision.
- Persist marker anchors as normalized source-image UV coordinates, with source/depth binding, authorization, optimistic concurrency, idempotency, and audit metadata.
- Exercise actual PostgreSQL and SeaweedFS read/write/readback only in an explicitly disposable environment, then test actual browser marker placement and reload behavior.
- Preserve the existing modal, renderer, fallback labels, and annotations when the binding is absent or invalid; fail closed rather than infer that unrelated depth belongs to the image.

**Non-Goals:**
- Creating a second renderer, depth API, object store, vector database, or canonical identity system.
- Generating a real depth map or writing to the user's live evidence bucket/database as part of implementation.
- Promoting brightness-derived previews to measured depth, claiming complete/watertight 3D, or requiring hardware WebGPU for the WebGL2 contract.
- Timeline/animation export or broad evidence URI migration.

## Decisions

1. **Use immutable artifact metadata plus byte verification.** The authorized depth read requires the producer's `depthSha256`, `width`, and `height`, hashes the retrieved depth bytes, and validates PNG header dimensions before serving. The viewer also checks exact dimensions against the fetched source image. Legacy `minio://` URI naming remains accepted, but legacy artifacts without digest/dimensions fail closed and render through the labeled preview fallback. Alternative considered: trust object key or optional digest; rejected because metadata can be stale or point to replaced bytes.

2. **Anchor markers in source UV space.** Persist `u,v` in `[0,1]`, not triangle indices or world coordinates. Resolve/project through the active displaced geometry for picking, rendering, and LOD changes. Alternative considered: persist world-space positions; rejected because geometry strength, camera, and LOD would invalidate them.

3. **Use one canonical annotation owner in PostgreSQL.** Add a narrowly scoped versioned relief-annotation record/table only after the schema owner and existing migration conventions are confirmed. Use evidence ID, source digest/revision, depth artifact digest/revision, and case ID as binding fields; include actor and timestamps. Use a revision/ETag compare-and-swap for updates and an idempotency key for retries. Do not overload generic `canvas_annotations` unless inspection proves it can enforce the same invariants without breaking other canvas users.

4. **Authorize every read and write against current case membership.** Resolve evidence and case permissions before returning markers or artifact bytes. A stale source or depth binding returns a stable conflict/unavailable response and never silently rebinds markers.

5. **Prove with live dependencies, but isolate mutations.** Unit tests may cover pure hash/UV logic. Contract tests must not mock PostgreSQL or SeaweedFS for the end-to-end gate: use a disposable PostgreSQL database and isolated test bucket/prefix, upload a synthetic source and depth pair, perform authorized save/readback, and clean up only those test-owned records/objects. Live user data remains read-only. Browser tests use the actual running app and authenticated disposable fixture; no in-page fetch replacement for the asserted requests.

6. **Reuse installed packages.** Existing Drizzle, PostgreSQL driver, AWS S3-compatible client, Sharp, Vitest, and Playwright are sufficient. Add no dependency unless a tested capability is demonstrably absent.

## Risks / Trade-offs

- **Hashing/decoding adds read cost** → bound artifact size and dimensions; hash the same bytes being decoded; cache only by immutable verified digest and authorization scope.
- **Schema/migration drift** → generate and review SQL, verify it is represented in the correct Drizzle config/journal, rehearse against disposable PostgreSQL 18, compare catalog/readback, and require separate approval before live application.
- **Concurrent editors can conflict** → use explicit expected revision and return a conflict with current revision; never last-write-wins silently.
- **Browser E2E can be unavailable when the dev service is down** → record BLOCKED, do not restart human-controlled services or convert mocked tests into an E2E pass.
- **Legacy `minio://` naming may confuse storage ownership** → preserve compatibility at the resolver boundary; do not rewrite existing rows as part of this change.

## Migration Plan

1. Implement and validate pure manifest, hashing, authorization, and UV contracts.
2. Generate a reviewed migration and rehearse it on a disposable PostgreSQL 18 database; verify catalog, constraints, and exact writer/readback tuple.
3. Run isolated real-dependency API integration using a unique test prefix/database, with cleanup restricted to artifacts created by that test.
4. Run authenticated browser E2E for open, render, place/move/delete, save, close/reopen, conflict, invalid binding, and resource cleanup.
5. Request separate operator approval for production migration or any production depth/object writes. Roll back by disabling the new routes/UI and applying a reviewed reverse migration only if no canonical annotations were written; otherwise retain data and use a forward repair.

## Open Questions

- Which current route is the canonical source for the relief modal's authorized depth artifact, and what is its exact manifest schema?
- Which existing case-membership helper should own the marker endpoint authorization check?
- Is the disposable PostgreSQL and isolated SeaweedFS test target already provisioned, or must implementation remain blocked before live-dependency mutation tests?
- Should annotations be case-wide evidence annotations or explicitly canvas/session scoped? The proposed source-bound identity is independent of canvas layout, but UI ownership needs confirmation from current code.
