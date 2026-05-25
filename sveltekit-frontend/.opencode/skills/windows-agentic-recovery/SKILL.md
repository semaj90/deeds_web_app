---
name: windows-agentic-recovery
description: Windows 10 PowerShell recovery doctrine for OpenCode workspace validation, sidecar checks, semantic indexing, and turn-based agent handoffs
---

# Windows Agentic Recovery Skill

Use this when the workspace needs deterministic recovery, validation, or safe handoff between agents.

## Core rules

- Use PowerShell-compatible commands.
- Prefer `rg --files -uu` for filenames.
- Prefer `rg -n -uu` for content.
- Never use guessed paths.
- Never claim a sidecar is healthy without command output.
- Never claim indexing succeeded without an artifact, DB row count, or smoke result.
- Retry missing-description tool errors once with a description.
- Write compact JSON logs into `memory/agent-runs/`.

## Discovery sequence

1. Validate config files.
2. Discover available scripts.
3. Check sidecars only if config or scripts mention them.
4. Run the smallest smoke test that proves the lane.
5. Record the result in `memory/agent-runs/latest-workspace-ready.json`.

## Search discipline

```powershell
rg --files -uu | rg "opencode|package.json|docker-compose|compose|\.env|drizzle|qdrant|redis|ollama|turbo|duckdb|graph|atlas|ace|mcp"
rg -n -uu "atlas|graph:exports|qdrant|redis|postgres|pgvector|duckdb|ollama|turboquant|rotorquant|TRACE|MCP|index|embedding|drizzle" .
jq empty opencode.json
```

## Supported handoff patterns

### 1. Code review workflow

Use this when an implementation needs review after build:

```ts
session({
  mode: "message",
  agent: "review",
  text: "Review this authentication implementation for security issues",
})

session({
  mode: "message",
  agent: "plan",
  text: "Design our rate limiting system based on this research",
})
```

### 2. Research -> plan -> implement

Use clean session starts when each phase should begin with a fresh context:

```ts
session({
  mode: "new",
  agent: "researcher",
  text: "Research best practices for API rate limiting in 2025",
})

session({
  mode: "new",
  agent: "plan",
  text: "Design a rate limiting system based on the research",
})

session({
  mode: "new",
  agent: "build",
  text: "Implement the rate limiting system per the plan",
})
```

### 3. Long conversation compression

Use `compact` when the current thread needs to shrink before a handoff:

```ts
session({
  mode: "compact",
  agent: "plan",
  text: "Review the overall architecture we've built so far",
})
```

### 4. Parallel architectural exploration

Use `fork` for design comparison, not for parallel implementation:

```ts
session({
  mode: "fork",
  agent: "plan",
  text: "Design this as a microservices architecture",
})

session({
  mode: "fork",
  agent: "plan",
  text: "Design this as a modular monolith",
})

session({
  mode: "fork",
  agent: "plan",
  text: "Design this as a serverless architecture",
})
```

## Output contract

Always write:

- `memory/agent-runs/latest-workspace-ready.json`

Include:

- `confirmed_paths`
- `detected_sidecars`
- `missing_sidecars`
- `scripts_found`
- `tests_run`
- `indexing_status`
- `files_changed`
- `blockers`
- `next_actions`

## Feature-ready means

- app starts
- DB reachable
- sidecars either healthy or explicitly skipped
- codebase index created or updated
- graph export works
- smoke test passes
- latest JSON run log exists

