## Context

Parent Atlas already has a SvelteKit error-agent route, a Python LangGraph synthesis sidecar, and a read-only OpenSpec execution controller. The missing boundary is governance: the route must select only current actionable work, constrain the completion envelope, run only server-owned smoke profiles, and emit receipts without becoming an authority for task ledgers or canonical data.

## Goals / Non-Goals

**Goals:**

- Keep SvelteKit responsible for authenticated selection, envelope validation, smoke allowlisting, and controller reconciliation.
- Keep LangGraph responsible for classify → minimal repair plan → smoke/result sequencing.
- Keep OpenSpec reports and PostgreSQL lineage gates authoritative.
- Keep OpenWiki/OKF claims derived, revision-qualified, and read-only.
- Distinguish CREATED, WIRED, PROVEN, and DONE in receipts.

**Non-Goals:**

- No task checkbox mutation, automatic merge, migration, packet/vector/cache promotion, or Graphify refresh.
- No second tournament implementation or LangGraph-owned persistence schema.
- No OpenWiki runtime dependency in the first tranche.

## Decisions

1. **SvelteKit is the control boundary.** The API reads the full execution-controller population, validates authenticated identity and the selected completion envelope, and rejects authority-gated tasks. The capped actionable sample is navigation-only.
2. **Smoke execution is allowlisted.** A request may name a task, but it cannot provide an arbitrary shell command. The server-owned smoke profile supplies the command and expected receipt shape.
3. **LangGraph is an adapter, not an authority.** It may synthesize a repair plan and execute a bounded smoke, but it cannot write canonical stores or alter OpenSpec ledgers. `thread_id` is workflow state only.
4. **Claims remain derived.** The grounded-knowledge owner validates OKF claims against source/workspace revisions, evidence checksums, and producer revisions. Stale or unresolved claims remain non-canonical.
5. **Completion is receipt-based.** A task reaches DONE only after the required proof and reconciliation gates are current; code existence alone is CREATED, and a route call alone is WIRED.

## Risks / Trade-offs

- [Risk] A controller report can become stale during a request → bind selection to the report checksum and re-run reconciliation after smoke.
- [Risk] A smoke can succeed while canonical authority remains blocked → return `REVIEW_REQUIRED` unless the refreshed controller reports `PROVEN_CURRENT`.
- [Risk] LangGraph or Qdrant projection failures can appear as synthesis failures → keep projection reads fail-soft and surface degraded evidence in logs/receipts.
- [Risk] A future worker could accidentally broaden scope → preserve the envelope checksum, retry fingerprint, and no-new-owner budget at the queue boundary.

## Migration Plan

1. Run the controller, blocker, and OKF freshness audits.
2. Select one ACTIONABLE task using the full controller report.
3. Execute its server-owned read-only smoke and emit a GAN receipt.
4. Reconcile against a refreshed report; do not mutate tasks or canonical stores.
5. Design a worker/queue boundary separately before any tournament or long-running repair execution.

Rollback is limited to disabling the route integration or smoke profile. No database or task-ledger rollback is required because this tranche performs no durable mutation.

## Open Questions

- Which operator-owned receipt will admit the current source/workspace lineage?
- Which existing worker/queue should host future isolated tournament candidates?
- When should Drizzle-owned receipt history be introduced without duplicating LangGraph checkpoint ownership?
