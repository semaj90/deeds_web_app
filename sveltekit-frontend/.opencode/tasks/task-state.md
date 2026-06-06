# OpenCode Task State

## Summary

- generatedAt: 2026-06-06T06:21:32.816Z
- recommendationEvents: 26
- taskEvents: 10
- taskCount: 10
- openTaskCount: 10
- archivedTaskCount: 0

## Open Tasks

- [HIGH] 4 circular dependency chains of 3+ files (TODO)
  - source: `4_circular_dependency_chains_of_3_files`
  - seen_count: 1
- [HIGH] 27 API route handlers lack auth guards (TODO)
  - source: `27_api_route_handlers_lack_auth_guards`
  - seen_count: 1
- [HIGH] Disconnected graph neighborhood (TODO)
  - command: `npm run graph:refresh`
  - source: `graph:missing-neighborhood`
  - seen_count: 3
- [MEDIUM] Command Mapping -> MCP allowlist (TODO)
  - command: `npm run opencode:tasks:refresh`
  - source: `command-mapping-mcp-allowlist`
  - seen_count: 2
- [MEDIUM] Low context density retrieved (TODO)
  - command: `npm run graphify:semantic`
  - source: `retrieval:low-context-density`
  - seen_count: 3
- [MEDIUM] Feature ID derivation (TODO)
  - command: `npm run atlas:feature-lineage:fast`
  - source: `feature-id-derivation`
  - seen_count: 2
- [MEDIUM] SOM coordinate coverage (TODO)
  - command: `npm run atlas:som-coordinate:coverage`
  - source: `som-coordinate-coverage`
  - seen_count: 2
- [MEDIUM] task_semantic_packets manual SQL mirror drift (TODO)
  - command: `npm run atlas:postgres-contract-mirrors`
  - source: `task-semantic-packets-drift`
  - seen_count: 2

## Paths

- recommendation events: `.opencode\recommendations\recommendation-events.jsonl`
- task events: `.opencode\tasks\task-events.jsonl`
- task state: `.opencode\tasks\task-state.json`
- startup context: `.opencode\startup-context.json`