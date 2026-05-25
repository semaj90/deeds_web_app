---
description: Run ACE fallback ladder recovery for deterministic graph and cache failures
agent: atlas-context
subtask: false
---

Run the deterministic recovery ladder.

Do not use the task tool.
Do not delegate.
Do not inspect hidden agents.
Do not read full files.

Use this recovery order:

1. exact file discovery
2. `rg` confirmed paths
3. Qdrant tag search
4. Redis semantic cache
5. LangExtract entities
6. did-you-mean cosine match
7. ACE packet
8. Gemma4 stream

If a tool call fails with `SchemaError(Missing key ["description"])`, retry once with a valid description and the exact command.

If exact match fails, carry this payload shape in the ACE packet:

```json
{
  "varianceRecovery": {
    "exactMatchFailed": true,
    "didYouMean": [],
    "qdrantTags": [],
    "langextractEntities": [],
    "semanticCacheHits": [],
    "nextSteps": []
  }
}
```

Return:

- `confirmed_paths`
- `files_changed`
- `recovery_ladder`
- `packet_shape`
- `next_exact_command`
