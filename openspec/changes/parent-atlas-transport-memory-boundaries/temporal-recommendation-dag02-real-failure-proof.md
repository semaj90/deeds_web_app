# Temporal Recommendation DAG-02 Real Failure Proof

Status: **SCRIPTED_UNPROVEN**

This proof closes only the remaining caveat in `temporal-recommendation-outcome-addendum.md`: the historical DAG-02 test persisted a valid negative recommendation outcome from a genuine selection object, but the selected K2 dispatch itself succeeded. The negative downstream result was supplied after execution rather than observed from a failing selected edge.

## Frozen proof

```text
K1 FINALIZED / TOOL_ERROR history
        ↓ real temporal ledger lookup
SELECT_ALTERNATIVE
        ↓
K2 = terminal("exit 37")
        ↓ real tool-shim dispatch exactly once
{ ok:false, tool:"terminal", ... }
        ↓
RecommendationOutcomeReceiptV1
  downstream_success = false
  outcome = null
        ↓
append + readback
```

`outcome=null` is required here. The shell transport failure is sufficient to prove the selected edge failed downstream, but it is not an authoritative `ActionOutcomeV1` owner and therefore MUST NOT be promoted to `TOOL_ERROR`, `TEST_FAILED`, or another typed action outcome.

## Exact acceptance gates

- **DAG-02R-01** K1 is present as an exact finalized known failure in the real temporal ledger.
- **DAG-02R-02** DRY policy returns `SELECT_ALTERNATIVE`; K1 is not dispatched again.
- **DAG-02R-03** K2 has a distinct `ActionExecutionKey` and passes its own temporal lookup.
- **DAG-02R-04** K2 is the real `terminal` dispatcher with command `exit 37`.
- **DAG-02R-05** `temporalPostDispatch` observes K2 exactly once.
- **DAG-02R-06** K2 returns `ok=false` from the real child process failure path.
- **DAG-02R-07** one `RecommendationOutcomeReceiptV1` is appended with `downstream_success=false`.
- **DAG-02R-08** receipt `outcome` remains null; no transport-to-action-outcome inference occurs.
- **DAG-02R-09** selected execution key is preserved into the persisted receipt.
- **DAG-02R-10** readback contains exactly one matching recommendation receipt.
- **DAG-02R-11** cleanup removes all proof rows.

## Database safety gate

This proof writes throwaway ledger/receipt rows and is therefore disabled unless all three are supplied:

```text
RUN_DB_INTEGRATION=1
ATLAS_TEMPORAL_DISPOSABLE_DB_PROOF=1
ATLAS_TEMPORAL_DISPOSABLE_DB_NAME=<explicit disposable database name>
```

The proof calls `TemporalProofDatabaseSafetyV1` before importing the DB client. It requires the database name in `DATABASE_URL` to match `ATLAS_TEMPORAL_DISPOSABLE_DB_NAME`. The known workstation proxy and canonical database identity are hard rejected even when all proof flags are set:

```text
postgresql://...@127.0.0.1:5434/...
postgresql://...@localhost:5434/...
        ↓
KNOWN_PROXY_TARGET_REJECTED

postgresql://...@<any-route>/legal_ai_db
        ↓
KNOWN_CANONICAL_DATABASE_REJECTED
```

After the DB client is loaded, but before the first append, the integration also executes:

```sql
SELECT current_database()
```

and requires the server-reported identity to equal both the expected disposable database name and the database name authorized by the URL guard. A mismatch fails before K1 is seeded.

This is a proof harness safety boundary, not a general deployment-role classifier.

## Workstation sequence

Pure safety guard only; no database access:

```powershell
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend
node_modules\.bin\vitest run `
  src/lib/server/atlas/temporal/temporal-proof-database-safety.spec.ts
```

On the known proxy, explicit proof flags must still fail before DB import:

```powershell
$env:RUN_DB_INTEGRATION='1'
$env:ATLAS_TEMPORAL_DISPOSABLE_DB_PROOF='1'
$env:ATLAS_TEMPORAL_DISPOSABLE_DB_NAME='atlas_temporal_proof'
node_modules\.bin\vitest run `
  src/lib/server/atlas/temporal/temporal-recommendation-dag02-real-failure.integration.spec.ts
```

Expected against `127.0.0.1:5434`:

```text
TEMPORAL_PROOF_DB_REJECTED:KNOWN_PROXY_TARGET_REJECTED
```

Only after `DATABASE_URL` points at an independently identified disposable Postgres containing the required temporal proof schema may the live proof run. The expected name must match that target explicitly:

```powershell
$env:DATABASE_URL='postgresql://...@127.0.0.1:55432/atlas_temporal_proof'
$env:RUN_DB_INTEGRATION='1'
$env:ATLAS_TEMPORAL_DISPOSABLE_DB_PROOF='1'
$env:ATLAS_TEMPORAL_DISPOSABLE_DB_NAME='atlas_temporal_proof'
node_modules\.bin\vitest run `
  src/lib/server/atlas/temporal/temporal-recommendation-dag02-real-failure.integration.spec.ts
```

## Non-goals

- no migration application
- no write to the 5434 proxy
- no write to `legal_ai_db` through any route
- no Qdrant/Neo4j/Valkey mutation
- no new recommendation policy
- no new retrieval/ranking subsystem
- no inference that recommendation selection itself means recommendation success
- no fabricated `ActionOutcomeV1`
