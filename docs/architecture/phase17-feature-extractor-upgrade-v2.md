# Phase 17 feature extraction: reconciled implementation plan

Status: existing derived-feature scaffold; live lineage and promotion blocked.

This replaces the attached Phase 17 proposal's greenfield assumptions. Phase 17 already has a Zod input/output contract, TypeScript extraction and metadata helpers, provider-admission types, and a Phase 18 consumer. It is not currently a Python/PyTorch feature extractor.

## Existing boundaries

- `phase17-schema.ts` defines the current proposal contract and provider admission. The output permits a null packet key for blocked proposals; the standalone `generatePacketKey()` helper is not used by the extractor as packet identity.
- `phase17-feature-extractor.ts` consumes reconciliation scores and emits derived features. `persistPhase17Output()` logs an intended write; the SQL execution is commented out.
- The extractor copies `packetKey` only from exactly one reconciliation packet matching `sourceRef`, `featureId`, and `aliasId`; empty or whitespace-padded keys are rejected. Missing or duplicate matches yield an unkeyed `pending` proposal, and persistence returns without writing pending or unkeyed outputs.
- On extraction failure, `defaultFeatures()` emits placeholder `0.5` scores with `validation_status: pending`. Those placeholders are diagnostic only and must not enter ranking or persistence as valid features.
- `phase17-advanced-features.ts` may obtain semantic data through the existing retrieval path; EmbeddingGemma `semantic_768` remains the embedding owner.
- SearchRuntime owns lane normalization and fusion. Phase 17 must preserve observed scores, including zero, and must not calculate a second weighted fusion score.
- Phase 18's current fallback is not a trained reranker and must not be described as one.

## Corrected gates

1. Extend the exact reconciliation-packet match with canonical request/workspace snapshot, CandidateOrdinalMap integrity, packet/source/chunk bindings, source and representation revisions, and evidence references. The current match is identity reuse only; it is not independent source or packet admission. Missing authority blocks promotion.
2. Define Phase 17 as an advisory derived-feature proposal, separate from canonical packet identity, ontology admission, or evidence admission. Do not serialize invented packet IDs, aliases, or defaults as authoritative values.
3. Preserve SearchRuntime's existing lane scores and fusion result. No fixed Qdrant/cluster/topological weights and no substitutes for absent lanes.
4. Keep semantic vectors owned by EmbeddingGemma `semantic_768`; Phase 17 may reference a qualified representation but must not mint or replace it.
5. Keep persistence disabled until the actual table contract, governed admission writer, source/revision predicates, affected-row checks, and independent readback are established. The pending-output guard is not an admission writer. No schema migration or upsert is authorized here.
6. Add focused CPU contract tests only after identity/schema changes are made. Treat them as fixture evidence; do not claim live retrieval, production ranking, or GPU proof.
7. Consider a PyTorch CPU/GPU implementation only as a separately measured executor after a frozen, qualified feature snapshot exists. GPU parity/resource admission remains independent.
8. Audit the Phase 18 consumer boundary: its `ExtractedFeatures` input type does not carry `validation_status`. Before wiring, require a valid status or use a proposal type that cannot represent fallback output as rankable input.

## Updated implementation order (2026-10-11)

The following code changes are present locally; the authored tests have not been run:

1. **Phase 17 identity guard:** reuse an exact-one packet from the reconciliation result
   (`sourceRef`, `featureId`, `aliasId`). Missing, duplicate, empty, or whitespace-padded keys
   remain unkeyed and pending; the intent-only persistence path rejects them. This is identity
   reuse, not independent source/packet admission.
2. **Phase 18 fail-closed boundary:** without a trained, revision-bound model, return
   `MODEL_UNAVAILABLE` with null scores; invalid/pending inputs return `BLOCKED_INPUT`. Preserve
   input order rather than sorting on nonexistent scores. No Phase 17-to-Phase 18 production
   caller has been established.
3. **Resume focused validation only when testing is authorized.** Verify the new negative identity
   cases and Phase 18 result union before considering integration.
4. **Establish one frozen, qualified candidate/feature snapshot** with canonical packet/source,
   workspace and representation revisions, ordinal-map integrity, and independently verified
   source evidence. If unavailable, stop; do not synthesize rows or revisions.
5. **Prove deterministic CPU behavior** against that same snapshot and SearchRuntime's existing
   ranking/fusion owner. Phase 17 features remain advisory and cannot add a second ranking vote.
6. **Evaluate PyTorch CPU only after the deterministic baseline.** GPU/cuGraph/cuVS/cuTile/SIMT
   parity is a later gate requiring the same immutable input, numerical tolerances, explicit
   resource admission, and executor receipts.
7. **Keep persistence and synthesis blocked** until a governed feature writer, independent
   readback, admitted ontology tuple where required, and ContextManifest owner/readback are proven.

Current status: identity and reranker fail-closed code plus fixture tests are authored locally;
validation is paused, production caller and qualified live snapshot are unproven, and no database,
cache, model, or GPU operation is authorized by this plan.

## Explicitly rejected from the attached proposal

- Hashing `sourceRef + featureId` into a new canonical `packet_key`.
- Fixed fusion weights such as 0.4/0.35/0.25.
- `0.5` fallback scores when a lane is absent, and synthetic default feature rows.
- Writing directly to `task_semantic_packets` or changing its schema based on this proposal.
- Treating cluster/topological signals as factual authority or evidence.

Primary implementation owner: `sveltekit-frontend/src/lib/server/ml/phase17-schema.ts` and `phase17-feature-extractor.ts`.

Evidence level: source inspection. No tests, database reads/writes, GPU execution, or service calls were performed for this reconciliation.
