# Tasks: temporal retrieval + context fabric (docs only)

Status vocabulary per root CLAUDE.md. Nothing here writes code, schema, or data.

## 1. Reuse and ownership
- [x] TRCF-01 Reuse audit done 2026-09-20 (see proposal.md table): 4 cited owners exist; `DocumentObservationV1`, `RunManifestV1`, `SourceRevisionDeltaV1`, `TemporalDocumentIndexV1` already exist in `temporal-indexing-fabric.ts`.
- [ ] TRCF-01A Decide owner per duplicated contract (SourceArtifact, SourceCoordinateMap, KnowledgeClaim); record classification (CANONICAL_OWNER / COMPATIBILITY). Operator decision.
- [ ] TRCF-01B Define claim-state mapping: VERIFIED=CURRENT, STALE=STALE_EVIDENCE, CONFLICTED=CONTRADICTED, RETRACTED=SUPERSEDED (needs edge), UNRESOLVED=UNVERIFIED. No third vocabulary.
- [ ] TRCF-OWNER-01..06 (operator review 2026-09-20, recommendation adopted: standalone `source-artifact-v1.ts`, `source-coordinate-map-v1.ts`, `knowledge/knowledge-claim-v1.ts` are CANONICAL; the copies inside `temporal-indexing-fabric.ts` become compatibility adapters). Order: 01 inventory imports of both definitions; 02 freeze the standalone schemas; 03 make the fabric import/re-export them; 04 map claim states CURRENT->VERIFIED, STALE_EVIDENCE->STALE, CONTRADICTED->CONFLICTED, SUPERSEDED->RETRACTED, UNVERIFIED->UNRESOLVED; 05 prove no caller behavior changed (`test/temporal-indexing-fabric.test.mjs`, `temporal-supersession-fabric-v1.test.ts`); 06 archive/deprecate the compatibility declarations. Second review pass adds: prove field-level compatibility between the two definitions as its own step BEFORE freezing (so 02 = field-level compat proof, 03 = freeze, 04 = legacy claim-state adapter, 05 = replace duplicates with imports/re-exports, 06 = focused tests + strict validation), and the adapter must preserve the original legacy state in compatibility provenance rather than silently rewriting historical receipts. Do not delete the fabric copies until every import has moved and parity tests pass. TRCF-OWNER-01 INVENTORY DONE 2026-09-20 (read-only grep of packages/, sveltekit-frontend/src, scripts/): standalone owners are imported by `core/knowledge/index.ts`, `knowledge-claim-mutation-v1.ts`, `knowledge-claim-preflight-v1.ts`, `knowledge-claim-reconciliation-v1.ts`, `packages/parent-atlas/test/source-artifact-v1.test.mjs`, `sveltekit-frontend/.../source-coordinate-map-v1.spec.ts` and `scripts/atlas/prove-dir-index-01-source-identity-v1.mjs`. The fabric copies (`temporal-indexing-fabric.ts`) are imported ONLY by `packages/parent-atlas/src/index.ts` (`export *`), `test/temporal-indexing-fabric.test.mjs` and `scripts/atlas/prove-temporal-document-claim-fabric-v1.mjs`; no production module uses them. The fabric-only claim states (CURRENT / STALE_EVIDENCE / CONTRADICTED / SUPERSEDED / UNVERIFIED) are used by no other module (other files with CURRENT/SUPERSEDED belong to unrelated contracts: knowledge-page-v1, graph-snapshot-v2, temporal-action-ledger, ontology-hyperedge-synthesis). Consequence: replacing the fabric duplicates with imports/re-exports (steps 03-05) only touches the fabric file, its test and its proof script, plus the package-index `export *` which must be checked for name collisions. Kept separate from the semantic-recipe decision; implement only the four missing contracts (TRCF-03..06) after this.
- [ ] TRCF-01C Note that owner A files are not exported from the package index; fabric file is (`export *`); check for name collisions before any consolidation.

## 2. Missing contracts (design only)
- [ ] TRCF-03 `TemporalSourceEdgeV1`: PREDECESSOR_OF / SUPERSEDES / MOVED_FROM / GENERATED_FROM / INVALIDATES, keyed (source_ref, source_revision) both ends; reconcile with `SourceRevisionDeltaV1` (MOVED already there).
- [ ] TRCF-04 `TemporalQueryPlanV1`: intents CURRENT, AT_REVISION, DIFF, EVOLUTION, FIRST_INTRODUCED, LAST_CHANGED, REGRESSION, STALE_DOCS.
- [ ] TRCF-05 `TemporalEvidenceBundleV1`: observations + claims + edges for one plan, checksummed, `canonicalAuthority:false`.
- [ ] TRCF-06 `DiagnosticIncidentV1`: multi-file repair grouping (TS/TEST/LINT/RUNTIME/DATABASE/RETRIEVAL/LINEAGE), status OPEN..REGRESSED.
- [ ] TRCF-07 RunManifestV1 lifecycle only: `.tmp/atlas/runs/<runId>/` layout and promotion rule (.tmp -> validated receipt -> docs/reports / Postgres registry / OKF). Contract already exists.

## 3. Rules and mapping
- [ ] TRCF-09 Claim invalidation rules: unchanged evidence keeps state; evidence revision changed -> STALE; contradiction -> CONFLICTED; replaced -> RETRACTED + SUPERSEDES edge; unresolvable -> UNRESOLVED.
- [ ] TRCF-08 Physical index map: revision B-tree + claim-state B-tree + tsvector GIN + tags GIN (bitmap AND/OR, planner-chosen); pg_trgm; pgvector exact oracle / HNSW primary / IVFFlat challenger; test `hnsw.iterative_scan` for revision-filtered ANN.
- [ ] TRCF-10 Graphify relations: SUPPORTED_BY, SUPERSEDES, INVALIDATES, GENERATED_FROM, DIAGNOSES, FIXED_BY, VERIFIED_BY (projection only).
- [ ] TRCF-11 OpenWiki/OKF as projection consumer of claims (workspaceRevision, claimSetChecksum, sourceRevisionSetChecksum, verifiedAt, staleAfter).
- [ ] TRCF-12 Experience -> claim/wiki -> skill promotion (TaskAttemptReceipt -> KnowledgeClaim -> `.claude/skills`), gated on validated receipts.
- [ ] TRCF-13 Temporal evidence feeds `CandidateFeatureSnapshotV1` rows; reuse it and `CandidateOrdinalMapV1`, do not redesign.
- [ ] TRCF-14 BitFrost boundary: cache ContextManifest/ACE products only, never source authority.
- [ ] TRCF-15 Studio temporal-search diagnostics.

## 4. Dependencies
- Blocked on CURRENT_SOURCE_AUTHORITY_PROVEN for any admission of revision-qualified rows.
- DIM-08 (219k embedding backfill) remains HOLD; SourceArtifactV1 becomes the per-row qualification envelope (sourceRef, sourceRevision, workspaceRevision, contentHash) for SEM768-GATE-08.
