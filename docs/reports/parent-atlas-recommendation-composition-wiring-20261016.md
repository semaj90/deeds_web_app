# Parent Atlas Recommendation Composition Wiring

Status: `ADVISORY_COMPOSITION_IMPLEMENTED; LIVE_CALLER_NOT_PROVEN`

## Implemented

- Added an explicit helper-to-candidate binding contract. A binding is accepted only when its helper catalog revision, canonical ID, packet key, source reference, source revision, workspace revision, and semantic revision exactly match a selected feature row.
- Added a read-only composition function that verifies the candidate ordinal map, selection, and checksummed feature-selection snapshot before joining low-rank helper scores to contextual feature scores.
- Kept recommendations advisory, capped by the existing four-proposal contract, and returned `canonicalAuthority=false` and `writesPerformed=false`.
- Removed the fallback representation label `semantic_768_v1`; candidates without a semantic revision, packet key, or evidence references are rejected.
- Added focused regression coverage for an exact binding, a source-revision mismatch, and a tampered feature-selection checksum.

## Validation

- Strict targeted TypeScript compilation passed for the composition, ranker, contracts, and focused specs.
- `git diff --check` passed for the recommendation source directory.
- Focused Vitest execution did not produce output and was stopped; runtime test status is unverified.
- No SearchRuntime production caller, real helper catalog, live ContextManifest readback, database/cache write, model execution, or training was established.

## Next Gate

Provide a versioned, reviewed helper catalog whose bindings refer to actual qualified candidates. Then add a caller that supplies the real SearchRuntime selection, verified feature-selection snapshot, and independently produced ContextManifest checksum. Keep the result advisory until evaluated on a frozen reviewed cohort. The owning OpenSpec ledger has a pending proof-receipt refresh guard, so this work did not append a task status there.

`canonicalAuthority=false`; `writesPerformed=false`.
