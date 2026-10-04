# ANALYSIS-ORDINAL-MAP-01 owner compatibility census

Status: `BLOCKED_OWNER_CONTRACT_MISMATCH`; read-only source review, no ordinal map materialized.

The existing `materializeCandidateOrdinalMap` owner is `sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts`. Its rows are `CanonicalCandidateV1`, with packet/tree-node/symbol-version identity and packet retrieval representation bindings. Its integrity contract requires a strong canonical candidate identity unless the row is marked degraded. That is not the OpenSpec task universe: TaskCards are keyed by `stableKey`/declared task identity and task-block revision, not packet identity.

Reusing it by mapping task keys into `canonicalId` and setting `degradedIdentity=true` would misstate the identity contract; fabricating packet/tree/symbol fields is prohibited. The map also has no task-revision field in its row schema. The ordinal-map checksum is correct for its declared packet candidate snapshot but does not, by itself, establish task-universe revision semantics.

No code-chunk ordinal or packet identity was reused, and no second ordinal allocator was created. Next safe gate: extend the existing canonical ordinal owner with an explicitly typed task-universe variant (or a generic, discriminated universe contract) while preserving the packet variant and consumers; then prove deterministic task identity ordering, row task revisions, population/source revisions, checksum, and independent readback on a bounded fixture.

`canonicalAuthority=false`; `writesPerformed=false`.
