---
type: project
title: Parent Atlas Retrieval Navigation
description: Evidence-first navigation from a user symptom to the responsible retrieval and context layer.
tags:
  - parent-atlas
  - retrieval
  - ace
  - provenance
  - karpathy
---

# Parent Atlas Retrieval Navigation

Use this page to orient an agent before it searches or edits the repository.
It is a curated navigation concept, not a replacement for runtime contracts or
the `.okf/` registry.

## Traversal order

1. Identify the likely layer: route, server module, worker, script, datastore,
   retrieval, cache, or documentation.
2. Start with exact references and revision-qualified identity.
3. Use additional hops only when the first result is ambiguous.
4. Prefer executable code, tests, and receipts over prose when they disagree.
5. Assemble bounded ACE context before model injection; never pass raw search
   results directly to a model.

## Ownership map

- PostgreSQL owns packet/chunk identity, source/workspace revisions, and
  canonical metadata.
- SearchRuntime owns lane normalization, same-lane deduplication, and the
  single production fusion/RRF result.
- Qdrant and GPU indexes are rebuildable projections and must join back through
  canonical identity; their local IDs are not identity.
- Tree-sitter, AST-grep, and the NLP sidecar provide structural and grounded
  observations, not canonical promotion.
- ACE selects bounded evidence and produces the ContextManifest consumed by
  synthesis or tool execution.

## Useful source references

- Legacy routing inventory: `../llm/karpathy_llmwiki.md`
- Repository context hub: `../llm/llm.md`
- Query routing: `sveltekit-frontend/src/lib/server/routing/query-router-4x4.ts`
- ACE assembly: `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`
- OKF registry: `../.okf/index.md`

## Evidence rule

Directory names, tags, cache keys, vector point order, and model-generated
labels are navigation hints only. A claim becomes actionable only after its
source reference, revision, and validation evidence are present.
