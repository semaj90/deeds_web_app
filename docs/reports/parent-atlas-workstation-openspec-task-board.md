# Parent Atlas Workstation OpenSpec Task Board

**Generated:** 2026-07-23  
**Repository:** `C:/Users/james/Videos/deeds-web-app`  
**Authority model:** state-based gates are authoritative; percentages are roadmap estimates only.

## Current Snapshot

| Area | State | Roadmap | Notes |
|---|---|---:|---|
| Instruction authority reconciliation | FIXTURE_PROVEN | 100 | Repo instruction drift classified and documented. |
| Runtime profile and health gating | RUNTIME_PROVEN | 92 | Profile-aware health routes are wired and validated locally. |
| Graph authority foundation | FIXTURE_PROVEN | 74 | Fixture parity and contract repair are in place; live persistence remains pending. |
| Graph snapshot persistence | NOT_IMPLEMENTED | 0 | Canonical immutable snapshot tables/materializer still missing. |
| Persisted live NetworkX/GDS parity | NOT_RUN | 0 | Blocked by snapshot persistence. |
| Bounded traversal | NOT_IMPLEMENTED | 0 | Needs snapshot-aware request/response contract. |
| Worktree lease orchestration | IMPLEMENTED | 58 | Durable worktree lease adapter exists; needs more workflow coverage. |
| Agentic error-resolution loop | LIVE_PARTIAL | 62 | Durable run loop is present but not yet closed by full evidence gates. |
| Package ownership enforcement | BLOCKED | 35 | Mirror/authority boundaries still need a machine-enforced check. |
| Graphify stage 4-5 execution | IN_PROGRESS | 28 | Stage 4 is running; 4b and 5 are blocked on its output. |

## Phase Board

### Phase 0 to 10

1. `0 Runtime Workstation and Service Routing`
   - State: `RUNTIME_PROVEN`
   - Roadmap: `80`
   - Exit gate: service manifest, profile resolution, route evidence, startup/shutdown idempotence.

2. `1 Canonical Identity and Data`
   - State: `LIVE_PARTIAL`
   - Roadmap: `86`
   - Exit gate: graph resolution issues ledger, full corpus node-key coverage, edge endpoint coverage.

3. `2 Graph Authority Foundation`
   - State: `FIXTURE_PROVEN`
   - Roadmap: `74`
   - Exit gate: immutable PostgreSQL snapshot persistence and live parity proof.

4. `3 Retrieval and Ranking`
   - State: `LIVE_PARTIAL`
   - Roadmap: `76`
   - Exit gate: bounded traversal, graph-aware rerank canary, snapshot-aware candidate routing.

5. `4 Agentic Error Fixing`
   - State: `LIVE_PARTIAL`
   - Roadmap: `62`
   - Exit gate: durable issue run loop, independent validation, rollback proof.

6. `5 Package Ownership and Release Boundaries`
   - State: `BLOCKED`
   - Roadmap: `35`
   - Exit gate: one owner per module path, zero divergent mirrors, CI boundary verifier.

7. `6 Immutable Graph Snapshot Materializer`
   - State: `NOT_IMPLEMENTED`
   - Roadmap: `0`
   - Exit gate: deterministic snapshot manifest, topology hash stability, exclusion accounting.

8. `7 Persisted Live PageRank Parity`
   - State: `NOT_RUN`
   - Roadmap: `0`
   - Exit gate: NetworkX/GDS parity on the same snapshot, no production mutation.

9. `8 Bounded Graph Traversal`
   - State: `NOT_IMPLEMENTED`
   - Roadmap: `0`
   - Exit gate: hop bounds, fanout bounds, canonical identity resolution, explicit truncation.

10. `9 Durable Error Resolution Run`
    - State: `LIVE_PARTIAL`
    - Roadmap: `62`
    - Exit gate: schema-valid issues, scoped patches, independent validator, rollback artifact.

11. `10 Release Hardening`
    - State: `NOT_RUN`
    - Roadmap: `0`
    - Exit gate: backup/restore, package boundary enforcement, mutation witnesses, release manifest.

## Current Blockers

- Immutable graph snapshot persistence is missing.
- Persisted live NetworkX/GDS parity is not yet proven.
- Bounded traversal is still a design task, not a live gate.
- Error-resolution runs need a closed evidence loop.
- Package ownership still needs a machine-enforced boundary check.

## Immediate Next Steps

1. Materialize the immutable graph snapshot from canonical Postgres identities.
2. Run NetworkX/GDS parity on that snapshot only.
3. Add snapshot-aware bounded traversal.
4. Close the error-resolution run loop with independent validation.
5. Add the package boundary verifier and mirror inventory check.

## Notes

- Stage 4 is currently running and has produced partial progress, but the required output file is not yet present.
- Stage 4b and Stage 5 remain blocked by Stage 4 output.
- The task board is tracking state, not authorizing promotion.
