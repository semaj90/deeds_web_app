# Runtime Cache Promotion Plan

**Status**: ACTIVE  
**Updated**: July 10, 2026  
**Scope**: runtime cache semantics, SOM-local lookup, LOD manifest emission, and cache promotion policy

---

## Goal

Prove the runtime cache behaves as a deterministic promotion pipeline:

`stable input -> stable cache key -> validation -> exact SOM lookup -> winner promotion -> hot cache`

The cache layer should distinguish:

- exact hits
- near hits
- rejected candidates
- warm metadata
- hot materialized packets

---

## Current Test Contract

The end-to-end smoke test should cover these distinctions:

- stable `POST` input produces a stable cache key
- health check reports ready without mutating hit counters
- missing key returns `404`, not backend unavailable
- Valkey outage returns `503` and network fallback succeeds
- exact SOM cell returns cached manifests
- neighbor SOM cell is marked as non-exact
- winner passes identity and source-ref validation
- winner is promoted to hot cache
- near winner is stored as warm metadata only
- rejected candidate is not written to hot cache
- `LOD0` is returned before `LOD2` materialization
- synthesis manifest stays within token budget

---

## Recommended Code Slice

Implement these together so the contract stays coherent:

- `src/lib/runtime-cache/contracts.ts`
- `src/lib/runtime-cache/som-neighbor-lookup.ts`
- `src/lib/server/atlas/packet-lod-manifest.ts`
- `src/lib/server/atlas/retrieval-promotion-policy.ts`
- `tests/integration/runtime-cache-promotion.test.ts`

---

## Execution Order

1. Lock health endpoint semantics.
2. Add exact-cell and radius-1 SOM lookup.
3. Emit validated `LOD0` / `LOD1` manifests.
4. Add promotion decision records.
5. Add telemetry for every cache layer.
6. Run the end-to-end smoke test.
7. Only then add logistic/XGBoost promotion learning.

---

## Layer Semantics

### Hot

- `Json` input -> `MsgPack` envelope -> `mmap` registry -> Valkey hot key

### Warm

- near-hit manifests
- exact validation evidence
- candidate metadata for later promotion

### Cold

- rejected candidates
- archive outputs
- offline analysis artifacts

---

## Promotion Rule

Do not promote on cosine alone.

Use this order:

`dense candidate -> SOM locality -> identity/source_ref validation -> token budget check -> hot promotion`

Promotion must reject:

- stale identity
- source-ref mismatch
- token budget overflow
- non-exact neighbor candidates

---

## Role Split

- HMM/Viterbi selects workflow state.
- Qdrant/TurboVec retrieves packets.
- Logistic regression/XGBoost ranks candidates.
- SOM/centroids narrow locality.
- BitFrost manages token-budgeted context.
- LOD controls packet load depth.
- JSON Schema validates every boundary.
- Postgres remains canonical truth.

---

## TODO Recommendations

### P0 — contract

- [ ] Freeze cache-key derivation for stable POST input
- [ ] Make health checks side-effect free
- [ ] Return `404` for missing cache keys
- [ ] Return `503` only when backend or cache layer is actually unavailable

### P1 — SOM lookup

- [ ] Implement exact SOM cell lookup
- [ ] Implement radius-1 neighbor lookup
- [ ] Mark neighbor hits as non-exact
- [ ] Preserve exact-hit vs near-hit metadata

### P2 — manifests

- [ ] Emit `LOD0` manifests before deeper materialization
- [ ] Emit `LOD1` manifests for warm metadata
- [ ] Keep token budgets bounded

### P3 — promotion

- [ ] Add decision records for promoted vs rejected candidates
- [ ] Promote only validated winners to hot cache
- [ ] Keep rejected candidates out of the hot lane

### P4 — learning later

- [ ] Add logistic/XGBoost promotion learning only after the smoke test passes
- [ ] Keep learned promotion separate from canonical cache rules

---

## Smoke Test

The test file should assert the full contract:

- stable cache keys
- exact vs neighbor SOM semantics
- winner validation
- promotion records
- fallback behavior
- token budget enforcement

Suggested location:

- `tests/integration/runtime-cache-promotion.test.ts`

---

## Notes

This plan is intentionally narrower than the broader retrieval stack.

It exists to stop cache behavior from drifting while the ranking and topology layers keep evolving.
