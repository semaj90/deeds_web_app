---
name: ace-recovery
description: Deterministic recovery workflow for ACE, GraphRAG, Atlas, DuckDB, and OpenCode command failures
---

# ACE Recovery Skill

Rules:

- Never read guessed paths.
- Prefer `rg --files -uu` for filename discovery.
- Do not delegate when exact commands are provided.
- If a tool fails with missing description, retry once with a description.
- Log compact JSON to `memory/agent-runs/latest-recovery.json`.

Key fix: use template, not prompt, in command config. OpenCode config docs show custom commands under "command" using template, description, agent, and optional model.