## Why

Added 2026-09-16 — this change previously had no `proposal.md` (flagged by the
`parent-atlas-openspec-tasks-audit-fabric` audit). This file summarizes intent from `tasks.md`'s
own GA0/Patch-B sections without changing any task or status recorded there.

This change builds the Graph Analysis Run/Promotion Contract: canonical types
(`GraphAlgorithm`, `GraphAnalysisRun`, `GraphMetricResult`, `CommunityAssignment`,
`CommunityTaxonomyRecord`, `FeatureRowV1`) plus a `GraphProjectionManifest` contract, backed by
Drizzle-persisted tables (`graph_analysis_runs`, `graph_node_metrics`,
`graph_community_assignments`, `graph_communities`). GA0 explicitly started by auditing existing
graph contracts before writing new ones — found `graph-contract.ts`, `pagerank-authority-contract.ts`,
and `pagerank-promotion-gate.ts` already in place, and flagged (without fixing, as out of scope for
that patch) that `PageRankRunSchema` is defined twice, differently, across two files — a
pre-existing duplication this change does not attempt to resolve.

## What Changes

See `tasks.md` for the full GA0/Patch-B and later task sequence. This proposal introduces no new
task.

## Capabilities

No new capability — this documents the existing graph analysis run/promotion contract work already
specified in `tasks.md`.
