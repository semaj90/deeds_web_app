# Parent Atlas Implementation Progress

Generated: 2026-07-23

## Decision

The Parent Atlas graph authority foundation is now reproducible at fixture
level and its V2 canonical persistence foundation is live-proven. Full-corpus
materialization, online traversal, graph retrieval fusion, and authority
promotion remain unstarted by design.

## Completed This Pass

| Area | State | Evidence |
|---|---|---|
| V2 graph schema | `LIVE_PROVEN` | Additive migration `0112_parent_atlas_graph_v2.sql` created canonical snapshot, node, edge, relation, issue, run, and score tables without touching legacy scores. |
| Immutable snapshots | `LIVE_PROVEN` | Database trigger rejects content changes after validation and terminal-state reversal. |
| Referential integrity | `LIVE_PROVEN` | Live smoke proved a graph edge cannot reference a missing canonical endpoint. |
| Resolution issues | `LIVE_PROVEN` | Idempotent V2 issue upsert increments occurrence count; unresolved identities have a durable ledger target. |
| Authority run safety | `LIVE_PROVEN` | A run requires a validated snapshot, a matching topology hash, and convergence. |
| Legacy score containment | `LIVE_PROVEN` | Before/after witness for `atlas_packets.pagerank_score`, `authority_score`, and `page_rank_score` was identical. |
| App-side V2 Drizzle schema | `IMPLEMENTED` | The SvelteKit DB layer now exposes the V2 graph snapshot, node, edge, issue, run, and score tables plus a thin repository wrapper. |
| Portable package boundary | `LIVE_PARTIAL` | `packages/atlas` is an npm workspace with two valid runtime exports; public Parent Atlas exports resolve and the boundary verifier dynamically imports both packages. |
| Package source tracking policy | `IMPLEMENTED` | `.gitignore` now exempts `packages/atlas` and `packages/parent-atlas`, including Parent Atlas `src/core`, from the broad NuGet package ignore rule. |

## Focused Evidence

```text
POSTGRES_GRAPH_PERSISTENCE_PROVEN       true
GRAPH_RESOLUTION_ISSUES_LEDGER_PROVEN   true
EDGE_ENDPOINT_FOREIGN_KEY_ENFORCED      true
VALIDATED_SNAPSHOT_IMMUTABLE            true
AUTHORITY_RUN_REQUIRES_VALIDATED_SNAPSHOT true
PRODUCTION_SCORE_UNCHANGED              true
PACKAGE_RUNTIME_IMPORTS                 true
```

Focused tests passed:

```text
packages/parent-atlas TypeScript compile
graph-snapshot-v2.test.mjs              2/2
contextual-tree-snapshot.test.mjs       4/4
verify-atlas-package-boundaries.mjs     runtime imports passed
smoke-parent-atlas-graph-v2.mjs         live database smoke passed
```

## Current Progression

| Roadmap phase | State | Roadmap estimate |
|---|---|---:|
| Baseline graph fixture foundation | `FIXTURE_PROVEN` | 76% |
| V2 PostgreSQL persistence foundation | `LIVE_PROVEN` | 80% |
| App-side V2 Drizzle integration | `IMPLEMENTED` | 81% |
| Package ownership runtime boundary | `LIVE_PARTIAL` | 80% |
| Full-corpus deterministic snapshot | `NOT_RUN` | 86% target |
| Persisted live NetworkX/GDS parity | `NOT_RUN` | 89% target |
| Bounded canonical traversal | `NOT_RUN` | 91% target |
| Go Retrieval graph RRF canary | `NOT_RUN` | 94% target |
| Durable agentic repair fixtures | `NOT_RUN` | 96% target |
| Live agentic repair canary | `NOT_RUN` | 98% target |
| Authority canary and rollback | `BLOCKED` | 99% target |

## Remaining Gates

1. Put `verify-atlas-package-boundaries.mjs` in CI and extend its declared
   owner list as shared helpers move out of scripts. The CI command is
   `node scripts/atlas/verify-atlas-package-boundaries.mjs`; no CI workflow
   exists yet.
2. Materialize one immutable full-corpus snapshot from an explicit PostgreSQL
   eligibility predicate, recording exclusions and unresolved identity issues.
3. Run and persist NetworkX and Neo4j GDS PageRank against that same snapshot.
4. Implement V2 bounded traversal before graph candidates or authority enter
   retrieval fusion.
5. Build the `ErrorResolutionIssue` lifecycle before expanding autonomous
   repair behavior.

## Promotion Rule

Do not enable `ATLAS_GRAPH_AUTHORITY_V2_PROMOTION_ENABLED`. V2 score rows are
empty after the smoke cleanup, there is no full-corpus parity artifact, and no
retrieval canary has evaluated authority as a bounded feature.
