---
name: trace-mcp-tooling
description: Use TRACE and sidecar MCP tools safely with compact, sourceRef-grounded outputs.
license: MIT
compatibility: opencode
metadata:
  origin: claude-skill-mirror
  workflow: trace-mcp
---
## What I do
- Route retrieval through TRACE first.
- Call TurboVec, Engram, and LangExtract only when needed.
- Keep responses sourceRef-backed and compact.

## When to use me
Use this for MCP-backed code retrieval and tool-call orchestration.

## Guardrails
- No hidden reasoning persistence.
- No direct infra mutation.
- Stop with insufficiency when tools return weak evidence.
