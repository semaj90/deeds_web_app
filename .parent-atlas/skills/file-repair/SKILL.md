---
name: file-repair
description: Propose evidence-backed file mutations through the Parent Atlas host bridge after validation failure or claim analysis. Returns AgenticFileMutationPlanV1 only; never writes files directly.
---

# File Repair

```python
repair = await file_repair(
    failure=validation_failure,
    claims=claims,
    target_path="src/...",
)
```

The package submits a typed `PROPOSE_PATCH` request to the authoritative Parent Atlas host.

## Rules

- Return an `AgenticFileMutationPlanV1` nomination only.
- Never write files, databases, graph state, or materialized artifacts directly.
- Every plan must preserve base revision/checksum identity and evidence refs.
- The TypeScript DAG owns revision CAS, exact-source promotion, mutation authorization, worktree/branch isolation, validation, rollback, and final materialization.
