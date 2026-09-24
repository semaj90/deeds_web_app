## 1. Scoping (must happen before any code)

- [ ] 1.1 Decide the exact `QdrantStructuralPayloadV1` field list — what subset of
      `AstGrepObservationV1` actually gets projected (node kind, symbol name, import/call edges,
      something narrower). This is a design decision, not a script.
- [x] 1.2 Check `openspec/specs/*` for any existing capability this would modify rather than add
      to — the proposal currently assumes none exists; verify before treating that as final.
      **Checked 2026-09-24 (read-only):** no existing spec defines a structural-payload capability
      (root `openspec/specs/`: feature-evidence-graph, feature-registry, graph-node-identity,
      retrieval-reconciliation, feature-state, kanban-materializer, repository-evidence-ingestion;
      `sveltekit-frontend/openspec/specs/` has none either), so `atlas-qdrant-structural-payload`
      is an ADD, not a MODIFY. It is, however, CONSTRAINED by
      `atlas-retrieval-reconciliation` "Dense/vector projection": every point SHALL carry
      canonical identity + projection revision, and a projection SHALL reuse the existing
      `qdrant_id` / never create a second point identity — consistent with a `setPayload`-only
      writer. Two conflicts to resolve under 1.1, not here: (a) `projection_revision` is absent from
      `src/lib/server/atlas/qdrant-collection-contracts.ts` (see graphify-recovery-proof-ladder
      L524 note), so the spec's projection-revision requirement is not yet met by the contract;
      (b) that spec names `codebase_chunk_index.content_embedding_768` as the canonical content
      vector, while root `CLAUDE.md` (2026-08-29/30) says `content_embedding` (55,169 rows) is
      canonical and `content_embedding_768` is a smaller separate column — a spec/doc contradiction
      to reconcile separately.
- [x] 1.3 Confirm join key — **resolved 2026-09-12**. Practical join key is `source_ref`
      (`canonical_source_ref` in Qdrant payloads, ~96.4% of points per `canonicalIdFieldBreakdown`
      in `docs/reports/semantic-corpus-admission-v1.json`), matched against
      `atlas_observation_records.source_ref`. Not applicable in practice yet — see 1.4, the table
      has zero rows to join against.
- [x] 1.4 (new, added 2026-09-12) **Decide: persist AST observations to Postgres first, or compute
      on-demand at enrichment-write time?** Read-only measurement
      (`scripts/atlas/dryrun-structural-payload-join-hitrate-v1.mjs`,
      `docs/reports/structural-payload-join-hitrate-dryrun-v1.json`) found
      `atlas_observation_records` — the intended persisted store for `AstGrepObservationV1`
      (`drizzle/manual/20260819_atlas_observation_feature_rows_v1.sql`) — **does not exist in the
      live schema**. Zero rows exist to join against; the "existing structural evidence" this
      proposal's Why section originally assumed is not actually materialized anywhere durable.
      Two real options, neither decided:
      (a) apply the pending migration + add a Graphify persistence step first (bigger, but reusable
          beyond this one enrichment), or
      (b) compute `AstGrepObservationV1` on-demand per point at enrichment-write time with no
          Postgres persistence (narrower, but redoes the AST parse work with no reuse/cache).
      This is a genuine architecture decision requiring human sign-off, not resolvable by more
      measurement — blocks 1.1 (field list can't be finalized without knowing whether fields come
      from a queryable table or an on-demand computation) and all of section 3.
- [x] 1.5 (new, added 2026-09-12) **This same decision surfaced independently from a different
      angle**: `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md`'s
      `SYMBOL-REPRESENTATION-REGISTRY-RECONCILIATION-01` found THREE uncoordinated
      symbol/representation registries (`graphify_symbols` empty, `atlas_symbol_registry`/
      `atlas_symbol_versions` populated but revision-unbound to the current admission, pending
      `atlas_representations` unapplied) while investigating the `SYMBOLS_RESOLVED` promotion gate.
      Whichever registry wins that reconciliation is very likely the same one that should own
      `atlas_observation_records` here too — do not decide 1.4 in isolation from that finding.

## 2. Measurement (read-only, before any write)

- [x] 2.1 Read-only script: `scripts/atlas/dryrun-structural-payload-join-hitrate-v1.mjs` —
      **result: `NO_STRUCTURAL_EVIDENCE_TO_JOIN`**, join-hit-rate is 0% because there is nothing to
      join against yet (see 1.4). Not a script bug — confirmed via live
      `information_schema.tables` check that `atlas_observation_records` genuinely does not exist.
- [x] 2.2 Confirmed independent of `QDRANT-LEGACY-PAYLOAD-BACKFILL-01`'s workspace_revision gap —
      no shared precondition. This proposal is now blocked on its own, separate issue (1.4), not on
      that gate.

## 3. Implementation (not started — blocked on section 1 decisions)

- [ ] 3.1 Build the `setPayload` writer once 1.1-1.3 are answered.
- [ ] 3.2 Explicit human sign-off gate before any live `setPayload` call, same as
      `QDRANT-LEGACY-PAYLOAD-BACKFILL-01`.

## 4. Read-side (deferred, separate decision)

- [ ] 4.1 Decide whether/how `buildCodebaseQdrantFilter` gains structural filter fields — not
      committed as part of this change, tracked here only so it isn't forgotten.

## 2026-09-12 Read-only owner reconciliation

- [x] Re-ran the Qdrant collection-role audit: `48` collections, `1,268`
      discovered consumers, `140` snapshot files, and zero role violations.
- [x] Confirmed the declared semantic projection remains
      `codebase_chunks_768` / `content`; no automatic promotion of v2,
      legacy 384, latent, topology, or taxonomy surfaces occurred.
- [x] Confirmed storage pressure is dominated by retained snapshots
      (`24.97 GiB`) rather than active collection storage (`2.77 GiB`).
- [x] Preserved all collections and snapshots; this pass performed no cleanup,
      deletion, payload mutation, reindex, or projection repair.
- [ ] Keep structural payload enrichment blocked until a durable,
      revision-qualified AST observation owner is selected. The current
      join-hitrate proof remains `NO_STRUCTURAL_EVIDENCE_TO_JOIN` because
      `atlas_observation_records` is absent from the live schema.

Evidence: `docs/reports/qdrant-collection-roles-v1.json` and
`docs/reports/structural-payload-join-hitrate-dryrun-v1.json`.
Status: `QDRANT_COLLECTION_ROLES_PROVEN`; authority remains unchanged and
`writesPerformed=false`.
### QDRANT-COLLECTION-ROLE-RECHECK-2026-09-12

- [x] Re-ran the read-only Qdrant collection-role audit.
- [x] Confirmed `48` collections, `140` snapshot files, `2.77 GiB` active
      collection storage, and `24.97 GiB` retained snapshot storage.
- [x] Confirmed zero declared role violations.
- [ ] Reconcile the audit's `0` discovered consumers with the repository
      consumer census before any collection retirement or payload change.

Evidence: `docs/reports/qdrant-collection-roles-v1.json`.
Status: `QDRANT_COLLECTION_ROLES_PROVEN_CONSUMER_CENSUS_OPEN`;
authority=false; writesPerformed=false.

### QDRANT-COLLECTION-ROLE-RECHECK-2026-09-12-R2

- [x] Re-ran the read-only collection-role and storage census.
- [x] Confirmed `48` collections, `140` snapshot files, `2.77 GiB` active
      collection storage, and `24.97 GiB` retained snapshots.
- [x] Confirmed zero role violations and no collection retirement or payload
      mutation.
- [ ] The report still finds `0` repository consumers, so consumer discovery
      coverage must be reconciled before any cleanup or projection change.

Evidence: `docs/reports/qdrant-collection-roles-v1.json`.
Status: `QDRANT_COLLECTION_ROLES_PROVEN_CONSUMER_CENSUS_OPEN`;
authority=false; writesPerformed=false.
