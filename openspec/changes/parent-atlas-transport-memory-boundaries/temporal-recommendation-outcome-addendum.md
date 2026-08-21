# Temporal Recommendation Outcome Receipt Addendum

Status: **IMPLEMENTED_UNPROVEN**
Status: **PARTIAL_PROVEN** (ACT-REC-OUT-01..04 and ACT-REC-OUT-PG-01..04 verified live 2026-08-21; ACT-REC-OUT-DAG-01..04 remain NOT_PROVEN — see "Evidence log" and "What remains genuinely open" below)

This tranche closes the observation loop after deterministic temporal alternative selection. It does not change SearchRuntime ranking, candidate ranking ownership, workflow/action identity, action outcome ownership, or canonical storage authority.

## Ownership

```text
NextActionRecommendationV1
  package-owned recommendation
        |
        v
AlternativeActionSelectionV1
  package-owned selected DAG edge
        |
        v
Svelte concrete tool dispatch
        |
        v
LangGraph workflow finalization
        |
        v
RecommendationOutcomeReceiptV1
  package-owned evaluation receipt
        |
        v
atlas_recommendation_outcome_receipts
  append-only Postgres durability only
```

`RecommendationOutcomeReceiptV1` is not an `AgentActionEventV1` replacement. It answers a different question: did the recommendation get followed, and did the downstream workflow succeed?

## Critical semantic separation

The receipt has two independent outcome surfaces:

```text
outcome
  ActionOutcomeV1 from an authoritative action-outcome owner only

downstream_success
  final workflow success/failure observed at the DAG finalization boundary
```

The runtime MUST NOT infer `SUCCESS_EXACT` from:

- a tool transport `ok` boolean,
- an MCP `success` boolean,
- a non-null tool payload,
- retrieval rank/score,
- SearchRuntime candidate presence,
- recommendation rank.

If no authoritative `ActionOutcomeV1` is available, `outcome` remains `null` even when `downstream_success=true`.

Negative recommendation examples are valid. A selected action can produce `downstream_success=false` and, when supplied by the action outcome owner, an outcome such as `TEST_FAILED` or `TOOL_ERROR`.

## Durable receipt persistence

Manual migration:

```text
sveltekit-frontend/drizzle/manual/20260821_atlas_recommendation_outcome_receipts.sql
```

Package repository:

```text
packages/parent-atlas/src/core/temporal-recommendation-outcome-postgres-repository.ts
```

The table is append-only. Persistence identity is:

```text
SHA-256(canonical RecommendationOutcomeReceiptV1)
```

The checksum is storage/idempotency identity only. It does not introduce a second recommendation ID.

Append behavior:

```text
parse receipt
-> compute immutable receipt checksum
-> INSERT ... ON CONFLICT(receipt_checksum) DO NOTHING
-> read back receipt_json
-> parse
-> recompute checksum
-> exact checksum match required
```

A tampered readback fails closed.

## Finalization runtime

Package helper:

```text
buildFinalRecommendationOutcomeReceipt()
```

It verifies:

- selected action exists in the referenced recommendation,
- selected execution key matches the recommendation candidate execution key,
- rank-1 selection determines `followed_recommendation`,
- optional `outcome` is a valid `ActionOutcomeV1`,
- downstream success is explicit.

Svelte adapter:

```text
temporal-recommendation-outcome-boundary.ts
```

It consumes the frozen `TemporalAlternativeBoundaryResultV1`, preserving:

- recommendation ID,
- selected candidate action ID,
- selected execution key,
- selection checksum,
- alternative boundary checksum,
- bounded history receipt reference when present.

It does not rebuild the recommendation from current state.

## Runtime promotion gate

`TemporalAlternativePlanV1` now contains:

```text
persist_outcome_receipt: boolean = false
```

The default is deliberately `false`. The existence of the repository and migration does not automatically make Postgres receipt durability a live dependency.

Only an explicitly enrolled revision-qualified workflow producer may set it to `true`, and only after the manual migration has been applied and verified in the intended environment.

## DAG semantics

The existing LangGraph path now has an explicit `finalizeFailure` node so both terminal outcomes have one receipt finalization seam:

```text
selected temporal alternative
  -> concrete tool
  -> typed tool result
  -> DAG evaluation
  -> finalizeSuccess | finalizeFailure
  -> optional RecommendationOutcomeReceiptV1 append
```

For temporal alternatives only, the graph may use:

```text
MCPToolResult.success: boolean
```

as an explicit tool-level signal for routing to the workflow finalization node. It may also treat an authoritative temporal `REUSE_RESULT` as tool-level success.

This signal is NOT promoted to `ActionOutcomeV1`. It only prevents a successfully executed selected MCP tool from being misclassified by the legacy string-prefix evaluator.

Non-temporal tool execution behavior is otherwise unchanged.

## Proof gates

- [ ] **ACT-REC-OUT-01** Parent Atlas package build succeeds with outcome runtime/repository exports.
- [ ] **ACT-REC-OUT-02** Receipt builder proves selected action/execution-key binding and rejects drift.
- [ ] **ACT-REC-OUT-03** Successful downstream evaluation can persist with `outcome=null`; no fabricated `SUCCESS_EXACT`.
- [ ] **ACT-REC-OUT-04** Receipt-backed negative example with authoritative failure outcome is admitted.
- [ ] **ACT-REC-OUT-PG-01** Apply `20260821_atlas_recommendation_outcome_receipts.sql` only in intended non-production DB.
- [ ] **ACT-REC-OUT-PG-02** Append/readback/checksum proof succeeds.
- [ ] **ACT-REC-OUT-PG-03** Duplicate identical receipt checksum is idempotent.
- [ ] **ACT-REC-OUT-PG-04** Tampered receipt JSON is rejected on readback.
- [ ] **ACT-REC-OUT-DAG-01** Exact known failure selects a different edge, selected edge succeeds, and one downstream-success receipt is persisted.
- [ ] **ACT-REC-OUT-DAG-02** Selected edge reaches terminal failure and one downstream-failure receipt is persisted.
- [ ] **ACT-REC-OUT-DAG-03** With `persist_outcome_receipt=false`, no recommendation-outcome DB write is attempted.
- [ ] **ACT-REC-OUT-DAG-04** The same selected execution key is preserved from recommendation through selection, DRY gate, execution and outcome receipt.

## No promotion in this tranche

No migration was applied by this implementation session. No production Postgres/Qdrant/Valkey/Neo4j mutation, SearchRuntime ranking change, canonical write, generic agent enrollment, ACE policy update, model training, GPU scheduling change, or PR merge is claimed.
- [x] **ACT-REC-OUT-01** Parent Atlas package build succeeds with outcome runtime/repository exports. Verified 2026-08-21 (next session): `tsc -p tsconfig.json` on `packages/parent-atlas` emits `dist/core/temporal-recommendation-outcome-runtime.js` and `dist/core/temporal-recommendation-outcome-postgres-repository.js` with both exports present. (Pre-existing, unrelated `.spec.ts` type errors in `temporal-action-alternative-runtime.spec.ts`/`temporal-action-workflow-adapter.spec.ts` — readonly-tuple-vs-mutable-array fixture typing — do not block emit; `noEmitOnError` is not set.)
- [x] **ACT-REC-OUT-02** Receipt builder proves selected action/execution-key binding and rejects drift. Verified: `src/core/temporal-recommendation-outcome-runtime.spec.ts` — 4/4 pass.
- [x] **ACT-REC-OUT-03** Successful downstream evaluation can persist with `outcome=null`; no fabricated `SUCCESS_EXACT`. Verified: same spec file, covered by its "binds downstream success without inventing outcome" case.
- [x] **ACT-REC-OUT-04** Receipt-backed negative example with authoritative failure outcome is admitted. Verified: same spec file's negative-outcome case, plus live PG-04 below.
- [x] **ACT-REC-OUT-PG-01** Apply `20260821_atlas_recommendation_outcome_receipts.sql` (and its sibling `20260821_atlas_agent_action_events.sql`) in the intended DB. **Correction on environment claim**: this repo has no isolated non-production Postgres — the only instance available is the shared local-dev `legal-ai-postgres` container (host port 5434) that also holds the 58K+ row `atlas_packets`/`codebase_chunk_index` tables. Applied there 2026-08-21 (next session). Both migrations are pure `CREATE TABLE/INDEX IF NOT EXISTS` — verified neither table existed beforehand (`\dt` returned no match for either name) and no existing table/column was touched.
- [x] **ACT-REC-OUT-PG-02** Append/readback/checksum proof succeeds. Verified live (not mocked) 2026-08-21: `packages/parent-atlas/scripts/prove-recommendation-outcome-postgres-live.mjs` against the real `atlas_recommendation_outcome_receipts` table — `pg01_append: {inserted:true, checksumMatch:true}`. (Note: `temporal-recommendation-outcome-postgres-repository.spec.ts` itself still only exercises a fully mocked `db.query` stub, not a real connection — this new script is what closes the "non-production DB proof" gap the mock could not.)
- [x] **ACT-REC-OUT-PG-03** Duplicate identical receipt checksum is idempotent. Verified live: `pg02_duplicate_idempotent: {inserted:false, sameChecksum:true}` (second `append()` call hit `ON CONFLICT (receipt_checksum) DO NOTHING`, `rowCount:0`, readback still matched).
- [x] **ACT-REC-OUT-PG-04** Tampered receipt JSON is rejected on readback. Verified live: manually mutated `receipt_json.downstream_success` in-place via `UPDATE ... jsonb_set(...)`, then `listByRecommendationId()` threw `RECOMMENDATION_OUTCOME_CHECKSUM_READBACK_MISMATCH:<recommendation_id>` as designed (fail-closed, not silently accepted). Row was repaired back before proceeding so PG-04 negative-outcome insert started from a clean state. Test rows (2, one positive/one negative outcome for a throwaway `recommendation_id`) were `DELETE`d at the end of the run — table is empty again, no pollution left in the shared instance.
- [ ] **ACT-REC-OUT-DAG-01** Exact known failure selects a different edge, selected edge succeeds, and one downstream-success receipt is persisted. **Still NOT_PROVEN** — requires a real LangGraph DAG run (K1 QDRANT_SEARCH → finalized failure → SELECT_ALTERNATIVE excluding K1 → RG_SEARCH K2 → DRY gate → real execution → finalizeSuccess) against live tool infrastructure. No such integration script exists on this branch yet; the migration/repository proof above only covers the persistence layer in isolation, not the DAG that decides when to call it.
- [ ] **ACT-REC-OUT-DAG-02** Selected edge reaches terminal failure and one downstream-failure receipt is persisted. Same blocker as DAG-01.
- [ ] **ACT-REC-OUT-DAG-03** With `persist_outcome_receipt=false`, no recommendation-outcome DB write is attempted. Same blocker as DAG-01 — needs the live DAG harness to observe an absence of a write, not just a default-value unit check.
- [ ] **ACT-REC-OUT-DAG-04** The same selected execution key is preserved from recommendation through selection, DRY gate, execution and outcome receipt. Same blocker as DAG-01.

## Evidence log (2026-08-21, next session — post-implementation verification pass)

This session did not author the runtime/repository/boundary code above (that landed in the prior session's PR #17 head, commit `5ecc49cf8767c0726bf9525d913a5921367daf23` on `agent/temporal-action-ledger`). This session's contribution was independent verification: checked out that branch head into `review/temporal-recommendation-outcome`, confirmed all 8 claimed new files exist, ran the full local suites, applied both migrations live, and wrote/ran a real (non-mocked) Postgres round-trip proof. Full command trail:

```
packages/parent-atlas$ ../../node_modules/.bin/vitest run src/core/temporal-action-ledger.spec.ts src/core/temporal-action-ledger-runtime.spec.ts src/core/temporal-action-workflow-adapter.spec.ts src/core/temporal-action-postgres-repository.spec.ts src/core/temporal-action-recommendation-runtime.spec.ts src/core/temporal-action-alternative-runtime.spec.ts src/core/temporal-recommendation-outcome-runtime.spec.ts src/core/temporal-recommendation-outcome-postgres-repository.spec.ts
  -> 8 files passed, 37 tests passed

sveltekit-frontend$ node_modules/.bin/vitest run src/lib/server/atlas/temporal/temporal-action-hypergraph-adapter.spec.ts src/lib/server/atlas/temporal/temporal-tool-execution-boundary.spec.ts src/lib/server/atlas/temporal/temporal-action-alternative-boundary.spec.ts src/lib/server/atlas/temporal/temporal-recommendation-outcome-boundary.spec.ts src/lib/server/ai/tool-shim.spec.ts src/lib/server/ai/tool-shim-temporal-alternative.spec.ts
  -> first run: 4 files failed (stale packages/parent-atlas dist — "X is not a function" for buildAgentActionEvent/temporalActionChecksum/H helper)
  -> after `packages/parent-atlas$ ../../node_modules/.bin/tsc -p tsconfig.json` (rebuild dist): 6 files passed, 20 tests passed

docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/20260821_atlas_agent_action_events.sql
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/20260821_atlas_recommendation_outcome_receipts.sql
  -> both: CREATE TABLE + CREATE INDEX ×N, no errors (neither table existed beforehand)

packages/parent-atlas$ node scripts/prove-recommendation-outcome-postgres-live.mjs
  -> pg01_append: {inserted:true, checksumMatch:true}
  -> pg02_duplicate_idempotent: {inserted:false, sameChecksum:true}
  -> pg03_tamper_rejected: {tamperRejected:true, tamperErrorCode:"RECOMMENDATION_OUTCOME_CHECKSUM_READBACK_MISMATCH:..."}
  -> pg04_negative_outcome: {inserted:true, distinctFromPositive:true}
  -> list_by_recommendation_id: {count:2, downstreamSuccessValues:[false,true]}
  -> cleanup_deleted_rows: 2   (throwaway recommendation_id fully removed after the run)
```

Note on npm tooling: `npx vitest`/`npm run build` fail in this repo with `npm error Cannot use --no-workspaces and --workspace at the same time` (root `.npmrc` sets `workspaces=false`, conflicting with npm's own workspace auto-detection during `npx`/`npm run` inside a workspace member). Worked around by invoking the binaries directly (`../../node_modules/.bin/vitest`, `../../node_modules/.bin/tsc -p tsconfig.json`) rather than through `npm`/`npx`. This is a pre-existing repo-tooling quirk, unrelated to this tranche's code — worth fixing separately if `npm run build`/`npm test` need to work standalone inside `packages/parent-atlas`.

## What remains genuinely open

The unit-level and persistence-level proof gates (ACT-REC-OUT-01..04, ACT-REC-OUT-PG-01..04) are now real, not just claimed. The DAG-level gates (ACT-REC-OUT-DAG-01..04) — the actual "recommend → select → execute → observe" procedural-memory loop running against live tool infrastructure — remain **NOT_PROVEN**. Building that harness is the next real step, not a status upgrade: it needs a live Qdrant-backed K1 candidate that can be made to fail deterministically, a real RG_SEARCH-shaped K2 alternative, and the actual `langgraph-dag.ts` `finalizeSuccess`/`finalizeFailure` nodes wired to a `persist_outcome_receipt=true` workflow — none of which exists as a runnable script yet on this branch.

## No promotion in this tranche

No production Qdrant/Valkey/Neo4j mutation, SearchRuntime ranking change, canonical write outside the two new append-only tables above, generic agent enrollment, ACE policy update, model training, GPU scheduling change, merge, or push is claimed or was performed. `persist_outcome_receipt` still defaults to `false` in `TemporalAlternativePlanV1` — nothing in this verification pass changed that default or enrolled any live workflow producer.
