## Why

The relief viewer can display source imagery and derived depth, but the current path does not provide a durable, concurrency-safe annotation contract bound to verified source and depth bytes. A real SeaweedFS-backed upscale integration now proves the existing dependency path can be exercised without mocks; the next change should establish the annotation contract while keeping writes isolated until independently authorized.

## What Changes

- Define authorized retrieval and verification for a depth artifact bound to one evidence ID, source SHA-256/revision, dimensions, model revision, and depth SHA-256.
- Define durable relief annotations anchored in normalized source-image UV coordinates and bound to the exact source/depth revisions.
- Require optimistic concurrency, audit fields, idempotent save behavior, and fail-closed handling for stale, mismatched, unauthorized, or malformed requests.
- Keep the existing evidence modal and shared relief renderer; do not add a parallel viewer, storage service, vector store, or canonical identity.
- Add real-dependency integration and browser coverage; use a disposable PostgreSQL database for write/readback tests and do not apply a live migration as part of this proposal.

## Capabilities

### New Capabilities
- `evidence-relief-annotations`: Source/depth-verified relief rendering and durable, revision-bound marker editing.

### Modified Capabilities

## Impact

- SvelteKit evidence depth and relief-marker API routes, `Evidence3DModal.svelte`, and `DepthReliefViewer.svelte`.
- Drizzle schema and a reviewed migration, only after disposable-database rehearsal and catalog/journal verification.
- PostgreSQL and SeaweedFS for canonical annotation state and authenticated derived-artifact reads; Redis remains optional cache only.
- Vitest/API integration and Playwright browser tests using real configured dependencies where safely available. Existing installed dependencies should be reused; add no package unless a concrete missing requirement is demonstrated.
