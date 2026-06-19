# OpenCode Task State

## Summary

- generatedAt: 2026-06-19T04:03:40.376Z
- recommendationEvents: 300
- taskEvents: 27
- taskCount: 17
- openTaskCount: 8
- archivedTaskCount: 0

## Active Lane

- [HIGH] Historical concept evidence spine backfill (TODO)
  - command: `npm run atlas:concept-evidence:backfill`
  - source: `concept-evidence-spine-backfill`

## Open Tasks

- [HIGH] Historical concept evidence spine backfill (TODO)
  - command: `npm run atlas:concept-evidence:backfill`
  - source: `concept-evidence-spine-backfill`
  - seen_count: 1
- [HIGH] route_runtime_packets materialization (TODO)
  - command: `npm run atlas:route-runtime-packets:materialize:apply`
  - source: `route-runtime-packets-materialization`
  - seen_count: 4
- [HIGH] atlas_feature_map parent join repair (TODO)
  - command: `npm run atlas:feature-parent-join`
  - source: `feature-parent-join-repair`
  - seen_count: 4
- [HIGH] Higher-hop coverage repair (TODO)
  - command: `npm run atlas:higher-hop:coverage`
  - source: `higher-hop-coverage-repair`
  - seen_count: 5
- [HIGH] Phase 3D retrieval telemetry (IN_PROGRESS)
  - command: `npm run atlas:phase3d:telemetry-summary`
  - source: `phase-3d-retrieval-telemetry`
  - seen_count: 3
- [HIGH] 4 circular dependency chains of 3+ files (TODO)
  - source: `4_circular_dependency_chains_of_3_files`
  - seen_count: 24
- [MEDIUM] Command Mapping -> MCP allowlist (TODO)
  - command: `npm run opencode:tasks:refresh`
  - source: `command-mapping-mcp-allowlist`
  - seen_count: 24
- [LOW] Synthetic Evidence concept cards (TODO)
  - command: `npm run opencode:tasks:refresh`
  - source: `synthetic-evidence-concept-cards`
  - seen_count: 24

## Paths

- recommendation events: `.opencode\recommendations\recommendation-events.jsonl`
- task events: `.opencode\tasks\task-events.jsonl`
- task state: `.opencode\tasks\task-state.json`
- startup context: `.opencode\startup-context.json`