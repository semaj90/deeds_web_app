## 1. Reconcile Existing Owners

- [ ] 1.1 Inventory the live retrieval receipt, canonical candidate resolver, ContextManifest assembler, and exact tokenizer call; record source paths, callers, and revision fields without creating a parallel owner.
- [ ] 1.2 Cross-link this change to `atlas-feature-intelligence` FI-ONTO-04/FI-ONTO-06, `atlas-retrieval-reconciliation`, and `parent-atlas-adaptive-backprop-hll-monitoring`; identify prerequisites that remain open and leave their task ledgers unchanged.
- [ ] 1.3 Confirm privacy, retention, and any approved telemetry persistence owner; keep implementation report-only while any owner or policy is unresolved.

## 2. Define and Test the Observation Contract

- [ ] 2.1 Implement a typed retrieval-demand observation using existing packet/chunk identity and applicable source, workspace, retrieval-policy, and evidence revisions; represent missing lineage as unresolved/degraded.
- [ ] 2.2 Add fixture tests for observed, selected, cited, unavailable, and unresolved results, including identity/revision mismatch rejection.
- [ ] 2.3 Bind exact token counts to the active tokenizer/model artifact revision and input scope; test unavailable-tokenizer and explicitly approximate fallback states.
- [ ] 2.4 Represent optional HLL output as scoped approximate telemetry only; test that it cannot substitute for exact counts, identity, eligibility, ranking, eviction, or promotion.

## 3. Produce a Bounded Read-Only Report

- [ ] 3.1 Build a bounded adapter from the verified retrieval/ContextManifest receipt owner; do not reconstruct observations from Docker logs or synthetic candidate identities.
- [ ] 3.2 Emit a checksummed report with observation scope, tokenizer identity/counts, backend degradation, and `writesPerformed: false`; omit raw prompts and retrieved source text.
- [ ] 3.3 Add negative tests for absent source revision, unavailable backend, stale tokenizer revision, malformed evidence binding, and attempted HLL authority use.
- [ ] 3.4 Verify the report against one authorized fixture/read-only snapshot and independently compare identity, revision, and tokenizer-count fields with their source owners.

## 4. Gate Any Further Integration

- [ ] 4.1 Review report usefulness, privacy/retention, and measured volume with the owners before proposing persistent telemetry or MCP/ACP exposure.
- [ ] 4.2 If a persistent or externally callable path is approved, create a separate reviewed task/change naming its canonical owner, authorization, idempotency, boundedness, and independent readback; do not infer write permission from this report-only change.
- [ ] 4.3 Benchmark any HLL, TurboVec, nibble, SIMDJSON/AVX2, Zstd, or ranking optimization against this qualified measurement baseline before proposing implementation.
