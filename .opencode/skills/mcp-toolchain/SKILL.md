---
name: mcp-toolchain
description: Run the four-server MCP retrieval chain and produce compact sourceRef-backed output.
license: MIT
compatibility: opencode
metadata:
  workflow: mcp-retrieval
  style: vercel-ai-tool-loop
---
## What I do
- Query TRACE first for exact context.
- Rerank with TurboVec.
- Add short memory from Engram.
- Compact the final packet with LangExtract.

## When to use me
Use this for codebase questions where exact grounding matters and you want the shortest valid answer with source refs.

## Guardrails
- No file edits.
- No hidden reasoning output.
- Stop early when evidence is insufficient.
