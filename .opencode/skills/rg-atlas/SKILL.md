---
name: rg-atlas
description: Exact repo search and compact extraction lane for sourceRef-backed answers.
license: MIT
compatibility: opencode
metadata:
  workflow: retrieval
  audience: coding-agent
---
## What I do
- Run `rg` first for exact recall.
- Compact matches into file, symbol, and API summaries.
- Prefer sourceRefs over paraphrase.
- Keep output short and structured.

## When to use me
Use this when you need to find the controlling code path, identify where a symbol or behavior comes from, or answer from exact repo evidence.

## Output rules
- Return the smallest useful set of matches.
- Include only verified paths and snippets.
- If evidence is weak, say so and stop.
