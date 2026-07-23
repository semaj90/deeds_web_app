# Parent Atlas Workstation To-Do 0-100

Generated: 2026-07-23

This is a roadmap checklist, not a release gate. Use the proof states from the
current audit reports for decisions.

## Current anchor

- `GRAPH_AUTHORITY_FOUNDATION`: `FIXTURE_PROVEN`
- `CONTEXTUAL_TREE_REPLAY`: `FIXTURE_PROVEN`
- `POSTGRES_GRAPH_PERSISTENCE`: `LIVE_PROVEN`
- `RESOLUTION_ISSUE_LEDGER`: `LIVE_PROVEN`
- `APP_SIDE_V2_DRIZZLE_INTEGRATION`: `IMPLEMENTED`
- `AGENT_OS_REGISTRY_TYPED_CONTRACT`: `IMPLEMENTED`
- `WORKTREE_LEASE_TYPED_CONTRACT`: `IMPLEMENTED`
- `WORKTREE_LEASE_ORCHESTRATION`: `FIXTURE_PROVEN`
- `GRAPH_SNAPSHOT_MATERIALIZER`: `FIXTURE_PROVEN`
- `PACKAGE_OWNERSHIP_RUNTIME_BOUNDARY`: `LIVE_PARTIAL`
- `FULL_CORPUS_GRAPH_SNAPSHOT`: `NOT_RUN`
- `PERSISTED_LIVE_PARITY`: `NOT_RUN`
- `BOUNDED_GRAPH_TRAVERSAL`: `NOT_RUN`
- `GRAPH_RRF_CANARY`: `NOT_RUN`
- `AGENTIC_ERROR_REPAIR`: `LIVE_PARTIAL`
- `AUTHORITY_PROMOTION`: `BLOCKED`

## 0-100 roadmap

### 0-10

- Freeze legacy graph-authority writes and keep V2 promotion disabled.
- Declare package ownership for `scripts/atlas`, `packages/atlas`, and `packages/parent-atlas`.
- Type the existing `task_registry` and `agent_os_events` tables in the app schema and keep the Kanban board report-driven.
- Add the typed `worktree_leases` contract next to the durable execution tables, not as a second orchestration store.
- Keep the boundary verifier as a reusable check, not a one-off smoke.

### 10-25

- Materialize immutable PostgreSQL graph snapshot tables and exclusions.
- Keep unresolved identities in a durable issue ledger instead of zero-scoring them.
- Make snapshot validation the only entry point for authority runs.

### 25-40

- Enforce package-boundary imports through CI.
- Remove divergent mirrors or convert them into explicit adapters.
- Keep shared helpers under one owner and make scripts import them.

### 40-55

- Build the deterministic full-corpus contextual-tree snapshot.
- Prove node, edge, identity, and topology hash stability.
- Record exclusions and unresolved identities in the snapshot manifest.

### 55-70

- Run persisted NetworkX and Neo4j GDS PageRank against the same snapshot.
- Keep the comparison live and auditable with before/after witnesses.
- Promote only after parity, coverage, and mutation witnesses hold.

### 70-80

- Replace the legacy multihop adapter with bounded snapshot-scoped traversal.
- Enforce canonical identity, hop limits, fan-out limits, and explicit truncation.
- Keep graph authority as a bounded prior, not a candidate generator.

### 80-88

- Enforce the retrieval registry for all online lanes.
- Run the graph RRF canary with exact, sparse, dense, and graph candidates.
- Keep graph authority influence capped and provenance-preserving.

### 88-94

- Build the durable ErrorResolutionIssue / error_resolution_runs model.
- Implement triage, retrieval, patch, and validation as bounded roles.
- Require rollback artifacts and independent validation before promotion.

### 94-98

- Run a supervised live error-resolution canary on low-risk failures.
- Prove baseline reproduction, scope authorization, and rollback.
- Stop if a patch touches unauthorized files or skips validation.

### 98-99

- Shadow compute authority promotion without changing production ordering.
- Pin snapshot, policy version, and canary traffic.
- Keep rollback immediate and auditable.

### 99-100

- Harden release: manifests, restore proof, service readiness, and kill switches.
- Freeze release evidence under a single immutable report path.
- Treat 100 as recoverable, repeatable, and auditable, not as "no work left."

## Exact task IDs located

- `2F1-1A1` through `2F1-1A5` from `sveltekit-frontend/openspec/changes/phase-2f1-real-evaluation-corpus/tasks.md`
- `P3G-ACP-AUDIT` and `P3G-QDRANT-BACKFILL` from `docs/reports/agent-task-claims.json`

## Current blockers

- Full-corpus graph snapshot materialization and replay
- Persisted live NetworkX/GDS parity
- Bounded graph traversal
- Retrieval registry enforcement across all lanes
- Closed-loop agentic repair with rollback proof
- Authority promotion remains blocked
