# Temporal Recommendation Outcome Receipt Addendum

Status: **IMPLEMENTED_UNPROVEN**

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
