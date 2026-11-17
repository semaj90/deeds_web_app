# Courtroom text analysis and ML passes

Moved 2026-11-16 from `courtroom-upload-story-pipeline`. Source: Sections 5 and 8 of courtroom-upload-story-pipeline (inverse retrieval, grounded cues, ranking tournament).
Shared evidence routes stay with their owners and are reached through `src/lib/courtroom/courtroom-api-allowlist-v1.ts`; this change adds no second API.

## 5. Inverse retrieval and grounded cues

- [x] CSP-50 Cosine top-k in the worker over cached vectors; tie-aware recall check against an exact scan. Built in `story/inverse-retrieval-v1.ts` (`exactScanTopK`, `rankChunksByCosine`, `evaluateTopKRecall`, `groundCuesWithInverseRetrieval`) with 6 passing tests in `inverse-retrieval-v1.spec.ts`.
- [x] CSP-51 `story/grounding-v1.ts` `validateGrounding(story, chunkIds)`: every `dialogue` cue needs a `requiredEvidence` that names an existing chunk id; reports `missing` and `unknownChunk` cue ids; non-dialogue cues ignored. Pure, engine untouched (3 tests). Not yet called by a story builder, since no builder exists yet (CSP-52).
- [x] CSP-52 Grounded story proposal builder and semantic checker. Deterministic template builder `buildGroundedProposal` and dual-gate `evaluateGrounding` (structural + semantic) fortified with `createRuleBasedSupportChecker` (negation and numeric contradiction invariant) and local-model (:8090) Ornith checker `createOrnithSupportChecker` / `evaluateGroundingAsync`. 12 passing tests in `proposal-v1.spec.ts`.
- [x] CSP-53 Persist uploaded items and chunk lineage to Postgres through the existing evidence route: LIVE_VERIFIED (2026-10-31). Catalog audit verified live Postgres 18 `evidence_vectors` (HNSW 768-D cosine) and `evidence_vector_projection_outbox`; `routes/(app)/evidence/+page.server.ts` fortified with canonical actor checks, case ACL guards (`assertActorOwnsCase`), atomic transactions with `analysisJobs`, and affected-row checks.
- [x] CSP-97 Gate C: Real upload end-to-end with Postgres readback. LIVE_VERIFIED (2026-10-31). Authenticated upload executed through `routes/(app)/evidence/+page.server.ts` storing to SeaweedFS bucket `legal-evidence` and atomically creating `evidence` (with `evidence_type = 'document'`) and `analysis_jobs` (`upload_pipeline` queued) verified in `evidence-live-upload-smoke.spec.ts`.


## 8. Ranking tournament (optional, separate)

- [x] CSP-80 Decide scope (decision 1). DECIDED (2026-10-31): Cue/evidence ranking tournament is challenger-only and formally scoped out of this change. It will be opened as an isolated change if pursued, requiring a reviewed gold set (floor: 200 rows, 30 per class), and is strictly excluded from `parent-atlas-gpu-sidecar-patch-tournament`.

