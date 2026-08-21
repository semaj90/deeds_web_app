## 1. Branch merge audit

- [x] 1.1 Survey all 17 new remote branches against `origin/main`
- [x] 1.2 Determine which actually landed (PR #6, #7, #8 — 3 of 17)
- [x] 1.3 Resolve aug16 vs aug18 sequencing (divergent siblings, not sequential)
- [x] 1.4 Fast-forward local `main` to `origin/main` (stash/restore, 1 conflict resolved)

## 2. Merkle-identity-pack consolidation

- [x] 2.1 Compare every pack file against live codebase before importing
- [x] 2.2 Port genuine gaps (merkle hashing, graph-identity, identity-audit,
      kanban scoring, daily compiler) to `atlas/{merkle,identity,graph,daily}/`
- [x] 2.3 Verify zero duplicate envelope/contract owners created
      (`tsgo --noEmit` clean)
- [x] 2.4 Archive original stray pack with manifest entry
- [x] 2.5 **PROVEN** — confirmed all 8 pack TS source files accounted for.
      7 ported: `rfc9162-merkle.ts`, `node-sha256.ts`, `checkpoint-builder.ts`
      (adapted), `graph-identity.ts` → `graph-identity-contracts.ts`,
      `identity-audit.ts` → `graph-identity-audit.ts`, `kanban-contracts.ts`
      → `kanban-candidate-scoring.ts`, `parent-atlas-daily-compiler.ts`
      (adapted). 2 deliberately not ported: `events.ts`, `merkle.ts` —
      equivalents already existed in `event-fabric.ts`, confirmed by
      diffing field-by-field. Nothing left to pull from the archived pack
      on the TypeScript side.
- [x] 2.6 Wrote missing test coverage for the 3 previously-untested ported
      modules (`checkpoint-builder.spec.ts`, `graph-identity-audit.spec.ts`,
      `kanban-candidate-scoring.spec.ts`, `parent-atlas-daily-compiler.spec.ts`
      — 4 new spec files, `graph-identity-contracts.ts` is pure types, no
      test needed). **All 5 spec files pass: 19/19 tests.** Coverage
      includes: Merkle tree determinism/order-sensitivity/leaf-change
      detection, checkpoint-builder's empty-population refusal + payload
      shape conformance to the existing `CheckpointCommitPayloadV1` +
      Merkle-root determinism, graph-identity-audit's duplicate detection
      across all 5 tracked ID types + gate logic (including the
      never-auto-promote rule on `canonicalGraphSnapshotProven`), kanban
      priority formula + zero-division floor, and the daily compiler's
      strict port-call ordering + Merkle-root cross-check guard (the one
      hard-fail condition in the whole pipeline).
- [ ] 2.7 Reconcile the 3 SQL migration templates against the live schema
      (explicitly deferred — needs operator review per Drizzle Safety Rule)
- [x] 2.8 **APPLY_PROVEN** — `buildAnalyticsCheckpoint()` wired to a real
      caller and run against real infrastructure. Deliberately did NOT touch
      the gated `graphify:daily` chain (GPH-17 is `OWNER_SELECTION_BLOCKED`,
      and this repo has a hard rule against a second/parallel Graphify
      pipeline) and did NOT wire `runParentAtlasDailyCompiler` (its
      `compileGpuFeatures`/`deriveRecommendations` ports have zero real
      backing implementation anywhere in the repo yet — GPU/RAPIDS sidecar
      lane is 55% per workstation-todo; wiring it now would mean fabricated
      stub ports, defeating the purpose). Instead found and used the
      correct honest integration point via investigation: `event-fabric.ts`
      already defines `checkpointCommitEventSchema`/`CheckpointCommitEventV1`
      with zero live producers, but `event-fabric-analytics-projection.ts`'s
      `projectCheckpointCommit()` (dispatched from
      `emitEventFabricAnalyticsProjection()`) was ALREADY wired end-to-end
      to a real durable sink (`analytics-sink.ts`'s `emit()` — Postgres
      `analytics_events` table insert via Drizzle + Redis Streams `XADD`,
      confirmed real, not a mock, by reading the sink's own implementation)
      — just missing a producer. Wrote
      `sveltekit-frontend/scripts/atlas/merkle-checkpoint-demo.mts`, a
      standalone manually-invoked proof script (same class as the existing
      `pagerank-authority-demo.mts`, zero automation, zero `graphify:daily`
      contact): pulls the 10 most recent real rows from `analytics_events`,
      builds a real Merkle checkpoint over them via the ported
      `buildAnalyticsCheckpoint()`, validates the resulting envelope against
      the live `checkpointCommitEventSchema` (Zod), emits it through the
      already-wired projection path, and reads the new row back from
      Postgres to prove the write landed — not just that `emit()` was
      called (its contract is fire-and-forget with swallowed errors, so
      "called" is not evidence of "succeeded"). **Live run result,
      independently re-verified via a direct `docker exec ... psql` query
      bypassing the script's own self-report**: row
      `id=703eec9c-d659-4d93-b921-20cc68afb347`,
      `merkleRoot=51f5dddcb7c531254aa89afa7110b9be5418fd52693fd76aac0f325531d97ce0`
      confirmed present in `analytics_events`, hash matching the script's
      reported checkpoint exactly. One real bug hit and fixed along the
      way: the script hung indefinitely on exit (open `pg.Pool`/`ioredis`
      handles from the imported `$lib/server/db/client.js` /
      `redis.js` singletons kept the event loop alive past `main()`'s
      completion) — fixed with an explicit `process.exit()` in a `.finally()`,
      matching the pattern this repo's other standalone `.mts` scripts use
      (`pool.end()` calls). The one honest limitation, stated in the
      script's own output and its `persistLeafManifest` implementation: the
      Merkle leaf manifest ref is demo-scope only (no durable leaf-manifest
      table exists in this repo yet) — the checkpoint root and its
      real-infrastructure landing are proven; the per-leaf audit trail is
      not yet a durable artifact.

## 3. Top-level `src/` duplication cleanup

- [x] 3.1 Confirm root-level test dependents are dead (no CI, no test script,
      no cypress config)
- [x] 3.2 Triage all 54 filename collisions
- [x] 3.3a Archive + remove 16 confirmed pure stubs — **INITIALLY WRONG,
      CORRECTED SAME SESSION.** Verification only checked cross-tree
      importers (root `src/` vs `sveltekit-frontend/src/`), never checked
      whether other root-only files (no sveltekit-frontend counterpart)
      depend on the archived files internally. Root `src/` is an
      internally-coherent mini-package (own barrel `index.ts` files,
      enrichers/retrievers/rankers cross-importing each other), not
      scattered stray duplicates. `scripts/atlas/pagerank-authority-demo.mts`
      (real, manually-runnable) broke via its dependency on the archived
      `pagerank-authority-contract.ts`, which `pagerank-authority-builder.ts`
      (root-only, untouched) also depends on internally. 11 of 16 archived
      files had real internal root-`src/` dependents. All 16 restored;
      manifest updated with `restored` timestamps + corrected root-cause
      note, matching this repo's own `phase101-parent-atlas-packetizer.js`
      precedent.
- [x] 3.3b Restore all 16 files, verify presence + resolve the broken
      demo-script import chain
- [ ] 3.3c Before attempting any archival of root `src/` content again: map
      its FULL internal dependency graph (not just filename collisions with
      sveltekit-frontend) — grep every remaining root-`src/` file for
      internal imports of any candidate-for-archival file, including via
      barrel `index.ts` re-exports
- [ ] 3.3d Determine whether root `src/` as a whole is scaffold-for-future-integration
      or dead weight — this was never actually resolved, only the incorrect
      partial deletion was corrected
- [ ] 3.4 Reconcile ~12 `COMPETING_REAL` collisions (needs per-file decision,
      not mechanical):
  - [ ] `ace-materializer.ts`
  - [ ] `centroid-compression.ts`
  - [ ] `ace-packet-reader.ts` / `ace-packet-validator.ts` / `ace-packet-writer.ts`
        (check `ace-packet-store.ts` delegation target first)
  - [ ] `feature-tracking-layer.ts` (sveltekit-frontend's Drizzle version likely wins)
  - [ ] `cross_store_identity_verifier.ts`
  - [ ] `runtime-lease-manager.ts`
  - [ ] `domain-classifier.ts` (classifier/ variant only — indexing/ re-export already archived)
  - [ ] `synthesis-logs.ts` schema + `synthesis-logger.ts` — **live DB schema
        divergence, needs explicit migration review, do not touch blind**
- [ ] 3.5 Port `topology-ontology.ts`'s 4 missing array entries
      (`storage_boundary`, `inference_boundary`, `documents-atlas`, `observability`)
- [ ] 3.6 Read and classify the 15 remaining unread collisions
      (start with `learning-loop.ts` — size-reversal flag)

## 4. G11 localhost hardcoding hardening

- [x] 4.1 Classify all 61 flagged files (30 false positives, 31 real)
- [x] 4.2 Fix 19 files / 21 call sites (server ENV pattern + client PUBLIC_ pattern)
- [x] 4.3 Verify via `tsgo --noEmit` (clean on all touched files)

## 5. Deferred from the same `/deep-audit` pass (not started)

- [ ] 5.1 G4 — 38 real auth gaps on API routes (4 `api/admin/*` highest-risk)
- [ ] 5.2 G5 — 44 mutating routes without Zod body validation
- [ ] 5.3 G20 — 16 cyclic import pairs, not yet itemized
