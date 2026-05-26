---
name: metadata-context-analysis
description: Analyze metadata and JSON envelope usage with compact retrieval before synthesis.
license: MIT
compatibility: opencode
metadata:
  origin: claude-skill-mirror
  workflow: metadata-audit
---
## What I do
- Locate metadata contracts via exact search and compact extraction.
- Summarize fields, callsites, and risks in short form.
- Return sourceRef-backed findings only.

## When to use me
Use this for metadata, jsonb envelope, and schema usage audits.

## Guardrails
- No broad full-file dumps.
- No schema mutation.
- Preserve retrieval-first order.
