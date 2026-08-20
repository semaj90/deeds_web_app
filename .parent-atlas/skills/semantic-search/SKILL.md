---
name: semantic-search
description: Retrieve revision-qualified semantic candidates through the Parent Atlas host bridge. Use for semantic candidate discovery before graph expansion, exact promotion, or claim verification. Never writes canonical state.
---

# Semantic Search

Use the Python-backed `semantic_search` package from the persistent Atlas IPython kernel.

```python
semantic = await semantic_search(query, k=256)
```

The skill does **not** call Qdrant/cuVS directly. It submits a typed `RETRIEVE` request to the authoritative TypeScript Parent Atlas host, which owns revisions, resource budgets, executor selection, exact-promotion policy, and receipts.

Expected result shape is a host-issued `CandidateSetV1`-compatible mapping.

## Rules

- Semantic search is one logical evidence lane regardless of executor.
- `semantic_768` remains the exact semantic authority unless the host explicitly revises that contract.
- `latent_128` / `latent_64` may guide routing but may not silently remove candidates before an exact boundary.
- Never perform repository writes, canonical DB writes, materialization, or mutation authorization.
- Preserve `workspaceRevision`, representation revisions, canonical IDs, and evidence refs returned by the host.
