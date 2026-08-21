# Temporal Recommendation Outcome Receipt Addendum

Status: **PARTIAL_PROVEN** (all 12 numbered proof gates verified live 2026-08-21 — ACT-REC-OUT-01..04, PG-01..04, DAG-01/03/04 in full and DAG-02 partially, per its own caveat above. Status stays PARTIAL_PROVEN rather than a plain PROVEN because DAG-02's "selected edge reaches terminal failure" clause and the shared K1-seeded-not-forced-live caveat are real, disclosed gaps, not administrative loose ends — see "Evidence log" below)

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

- [x] **ACT-REC-OUT-01** Parent Atlas package build succeeds with outcome runtime/repository exports. Verified 2026-08-21 (next session): `tsc -p tsconfig.json` on `packages/parent-atlas` emits `dist/core/temporal-recommendation-outcome-runtime.js` and `dist/core/temporal-recommendation-outcome-postgres-repository.js` with both exports present. (Pre-existing, unrelated `.spec.ts` type errors in `temporal-action-alternative-runtime.spec.ts`/`temporal-action-workflow-adapter.spec.ts` — readonly-tuple-vs-mutable-array fixture typing — do not block emit; `noEmitOnError` is not set.)
- [x] **ACT-REC-OUT-02** Receipt builder proves selected action/execution-key binding and rejects drift. Verified: `src/core/temporal-recommendation-outcome-runtime.spec.ts` — 4/4 pass.
- [x] **ACT-REC-OUT-03** Successful downstream evaluation can persist with `outcome=null`; no fabricated `SUCCESS_EXACT`. Verified: same spec file, covered by its "binds downstream success without inventing outcome" case.
- [x] **ACT-REC-OUT-04** Receipt-backed negative example with authoritative failure outcome is admitted. Verified: same spec file's negative-outcome case, plus live PG-04 below.
- [x] **ACT-REC-OUT-PG-01** Apply `20260821_atlas_recommendation_outcome_receipts.sql` (and its sibling `20260821_atlas_agent_action_events.sql`) in the intended DB. **Correction on environment claim**: this repo has no isolated non-production Postgres — the only instance available is the shared local-dev `legal-ai-postgres` container (host port 5434) that also holds the 58K+ row `atlas_packets`/`codebase_chunk_index` tables. Applied there 2026-08-21 (next session). Both migrations are pure `CREATE TABLE/INDEX IF NOT EXISTS` — verified neither table existed beforehand (`\dt` returned no match for either name) and no existing table/column was touched.
- [x] **ACT-REC-OUT-PG-02** Append/readback/checksum proof succeeds. Verified live (not mocked) 2026-08-21: `packages/parent-atlas/scripts/prove-recommendation-outcome-postgres-live.mjs` against the real `atlas_recommendation_outcome_receipts` table — `pg01_append: {inserted:true, checksumMatch:true}`. (Note: `temporal-recommendation-outcome-postgres-repository.spec.ts` itself still only exercises a fully mocked `db.query` stub, not a real connection — this new script is what closes the "non-production DB proof" gap the mock could not.)
- [x] **ACT-REC-OUT-PG-03** Duplicate identical receipt checksum is idempotent. Verified live: `pg02_duplicate_idempotent: {inserted:false, sameChecksum:true}` (second `append()` call hit `ON CONFLICT (receipt_checksum) DO NOTHING`, `rowCount:0`, readback still matched).
- [x] **ACT-REC-OUT-PG-04** Tampered receipt JSON is rejected on readback. Verified live: manually mutated `receipt_json.downstream_success` in-place via `UPDATE ... jsonb_set(...)`, then `listByRecommendationId()` threw `RECOMMENDATION_OUTCOME_CHECKSUM_READBACK_MISMATCH:<recommendation_id>` as designed (fail-closed, not silently accepted). Row was repaired back before proceeding so PG-04 negative-outcome insert started from a clean state. Test rows (2, one positive/one negative outcome for a throwaway `recommendation_id`) were `DELETE`d at the end of the run — table is empty again, no pollution left in the shared instance.
- [x] **ACT-REC-OUT-DAG-01** Exact known failure selects a different edge, selected edge succeeds, and one downstream-success receipt is persisted. Verified live 2026-08-21: `src/lib/server/atlas/temporal/temporal-recommendation-outcome-dag.integration.spec.ts`, test "DAG-01/DAG-04". K1's FINALIZED/`TOOL_ERROR` history is seeded via the real `buildAgentActionEvent()` + `createTemporalActionPostgresRepository(pool).append()` (see caveat below — this is the one piece not forced live). Everything downstream is real: `executeTool(k1Call, ctx)` triggers the actual `applyTemporalBoundary` → real `decideTemporalToolExecutionFromPostgres` (reads the seeded row from Postgres) → real `disposition: 'SELECT_ALTERNATIVE'` → real `selectTemporalAlternativeToolFromPostgres` → real recursive dispatch to K2 (`rg_search`, genuinely runs ripgrep over `src/lib/server/atlas/temporal`, returns 5 real matches) → real `persistTemporalRecommendationOutcomeFromPostgres` insert.
- [x] **ACT-REC-OUT-DAG-02 (partial)** Selected edge reaches terminal failure and one downstream-failure receipt is persisted. Verified the persistence half live: same file, test "DAG-02" takes the real `TemporalAlternativeBoundaryResultV1` produced by an actual `selectTemporalAlternativeToolFromPostgres` call and persists it with `downstream_success:false, outcome:'TEST_FAILED'` — proving the negative path accepts a genuine (not hand-built) selection object and round-trips correctly. **Still not fully proven**: K2's own real dispatch (`rg_search`) succeeded in this scenario too, same as DAG-01 — making live external tool infrastructure fail deterministically on command isn't practical in this environment, so "the selected edge itself reaches terminal failure" is asserted by the test author's choice of `downstream_success:false`, not observed from a genuinely failing K2 execution. Recorded honestly rather than upgraded to a full pass.
- [x] **ACT-REC-OUT-DAG-03** With `persist_outcome_receipt=false`, no recommendation-outcome DB write is attempted. Verified live: same file, test "DAG-03" runs the actual `runAgentDAG()` LangGraph `StateGraph` (real `synthesizeNode` → `evaluateExecution` → `finalizeSuccessNode`) end to end with `plan.persist_outcome_receipt=false`, then queries Postgres directly for `recommendation_id` and confirms `count=0`. This is the one gate that could only be proven by running the actual private `persistTemporalRecommendationOutcomeIfEnabled()` guard inside `langgraph-dag.ts` (not exported, unreachable except via the real DAG), so the full StateGraph — including its Redis cache writes and learning-loop reinforcement calls — was exercised for real, not stubbed.
- [x] **ACT-REC-OUT-DAG-04** The same selected execution key is preserved from recommendation through selection, DRY gate, execution and outcome receipt. Verified live: same file, test "DAG-01/DAG-04" asserts `selection.package_selection.recommendation.candidates[0].execution_key === selection.selected_execution_key === outcomeBoundary.receipt.resulting_execution_key === k2ExecutionKey` (computed independently via `buildActionExecutionKey()` from K2's own descriptor) — one identity value confirmed unchanged across all four stages.

**Caveat that applies to DAG-01/02/03/04 alike**: none of these force K1's *first* real dispatch to fail live. A live external service (Qdrant, a Go retrieval service, Neo4j) cannot be made to fail deterministically on command without becoming flaky, so K1's `FINALIZED`/`TOOL_ERROR` history is seeded directly into the real ledger via the same `buildAgentActionEvent()` + repository `append()` path a genuine failed execution would have used. Everything from that point forward — the DRY-gate decision, the alternative selection, K2's real dispatch, and the receipt persistence — runs through unmocked production code and a real Postgres round trip. This is recorded as the honest scope of what "live" means here, not glossed over as a full end-to-end failure-injection test.

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

## Evidence log continued — DAG-level live proof (2026-08-21, same session)

Built and ran `sveltekit-frontend/src/lib/server/atlas/temporal/temporal-recommendation-outcome-dag.integration.spec.ts` — the harness the prior entry in this log said didn't exist yet. It seeds K1's `FINALIZED`/`TOOL_ERROR` history via the real `buildAgentActionEvent()`/repository `append()` path (see the DAG-01/02/03/04 caveat above for why K1 itself isn't forced live), then drives everything downstream through unmocked production code and a real Postgres round trip:

```
sveltekit-frontend$ node_modules/.bin/vitest run src/lib/server/atlas/temporal/temporal-recommendation-outcome-dag.integration.spec.ts
  -> attempt 1: SASL "client password must be a string" — $lib/server/db/client.js reads ENV.DATABASE_URL
     at top-level `new Pool(...)`; vitest does not auto-load .env/.env.local into
     process.env the way `vite dev`/`vite build` do. Fixed by loading dotenv with a
     top-level `await` (both .env and .env.local, override:false) before dynamically
     importing '$lib/server/db/client.js' for `pool` — same class of fix as the three
     standalone-script env-ordering bugs found earlier this session, just inside a
     vitest file instead of a plain .mts script.
  -> attempt 2: DAG-01 timed out at the 30s default (cold dynamic import of
     mcp-tool-dispatch.js pulls in several other service clients — Redis, Qdrant,
     Neo4j — at module-evaluation time even though this proof only exercises the
     self-contained rg_search path); DAG-02/DAG-03 failed with
     "duplicate key value violates unique constraint atlas_agent_action_events_ledger_sequence_key"
     because that column is UNIQUE across the whole table (not scoped per
     workflow_id) and all three scenarios hardcoded ledger_sequence=1 within the
     same process/run. Fixed: vi.setConfig({testTimeout: 90_000}) and a shared
     Date.now()-seeded incrementing counter for ledger_sequence across scenarios.
  -> attempt 3 (and a repeat run immediately after): 3/3 tests passed both times,
     ~11s and ~12s respectively. Real stderr noise present but non-fatal and
     pre-existing: reinforceEngramPath/logSynthesisRun both hit
     "relation memory_registry/synthesis_logs does not exist" — those tables
     genuinely don't exist in this DB; both call sites already degrade gracefully
     (caught, logged, do not fail the DAG run) — unrelated to this tranche, not
     fixed here, noted for whoever eventually backfills those tables.
  -> post-run verification (docker exec psql): 0 rows in atlas_agent_action_events
     WHERE workflow_id LIKE 'wf:dag-live-proof%', 0 rows in
     atlas_recommendation_outcome_receipts — afterAll cleanup left the shared
     instance exactly as it found it, both times.
```

## What remains genuinely open

All 12 numbered proof gates now have live evidence. What's left is narrower and explicitly scoped, not a status gap:

1. **DAG-02's failure-injection gap** (see its own bullet above): no test in this repo makes a real external tool call fail deterministically without flakiness. Closing this fully would mean either (a) accepting a controlled amount of flakiness in CI, or (b) adding a genuine fault-injection seam to one real tool dispatch function — a design decision for whoever owns `mcp-tool-dispatch.js`, not something to bolt on unilaterally here.
2. **The shared K1-seeded-not-forced-live caveat**: every DAG gate proves "given a real finalized failure in the ledger, does the real chain work", not "does K1's own first dispatch attempt fail on this run". Fully closing that would need the same fault-injection seam as point 1.
3. **Runtime enrollment**: `persist_outcome_receipt` still defaults to `false` in `TemporalAlternativePlanV1`, and no real caller sets it to `true` outside this test file. Wiring an actual production workflow to opt in is a separate, deliberate product decision — not something this verification pass should silently flip.

## No promotion in this tranche

No production Qdrant/Valkey/Neo4j mutation, SearchRuntime ranking change, canonical write outside the two new append-only tables above (both left empty after every run in this log), generic agent enrollment, ACE policy update, model training, GPU scheduling change, merge, or push is claimed or was performed. `persist_outcome_receipt` still defaults to `false` in `TemporalAlternativePlanV1` — nothing in this verification pass changed that default or enrolled any live workflow producer. The DAG-03 test explicitly proves the `false` default still results in zero writes through the real code path.
