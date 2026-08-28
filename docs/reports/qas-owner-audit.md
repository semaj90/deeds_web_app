# QAS Owner Audit

Generated: 2026-08-28T18:17:15.743Z

Status: **OWNER_AUDIT_PARTIAL**

Canonical QAS owner: `sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-sampler.ts`

## Owners
- **graphifyDaily** — WIRED — `scripts/startup/run-graphify-daily-startup.mjs`
- **qasSampler** — WIRED — `sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-sampler.ts`
- **somTopology** — EXISTS_UNPROVEN — `sveltekit-frontend/src/lib/server/retrieval/som-topology-prefilter.ts`
- **contextManifest** — EXISTS_ADOPTION_PENDING — `sveltekit-frontend/src/lib/server/ace/ace-context-manifest.ts`
- **exactCanonicalLookup** — EXISTS_PROMOTION_ADAPTER_PENDING — `sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts`
- **recommendationKanban** — EXISTS_LINKAGE_PENDING — `sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board-recommendations.ts`
- **aceBitfrost** — EXISTS_POLICY_PENDING — `sveltekit-frontend/src/lib/server/atlas/rlm/bitfrost-policy.ts`
- **qasCandidateInput** — MISSING — `docs/reports/atlas-qas-candidate-features.jsonl`
- **candidateFeatureMatrixProducer** — CALLER_FOUND_UNPROVEN — `sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts`
- **searchRuntimeQasCaller** — WIRED_READ_ONLY_CALLER — `sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-adapter.ts::searchWithQas`

## Remaining gates
- revision-qualified QAS candidate feature input
- live CandidateFeatureMatrixRowV1 producer invocation
- exact SearchRuntime promotion adapter and recall baseline
- SOM/domain route binding
- QAS receipt to existing Kanban recommendation linkage
- ContextManifest/ExecutionReceipt linkage

## Invariants
- QAS failure must not block Graphify truth
- approximate candidates remain APPROXIMATE_ONLY until exact promotion
- QAS does not add a retrieval lane or RRF vote
- bundle atlas/qas path is not a second owner
