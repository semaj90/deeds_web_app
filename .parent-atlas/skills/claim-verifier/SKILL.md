---
name: claim-verifier
description: Evaluate nominated claims against revision-qualified Parent Atlas evidence through the host bridge. Returns ClaimNominationV1-style evidence judgments and never materializes truth directly.
---

# Claim Verifier

```python
claims = await claim_verifier(claim="...", evidence_refs=[...])
```

The package submits `VERIFY_CLAIM` to the authoritative TypeScript host.

## Rules

- Return supported / contradicted / insufficient-evidence nominations only.
- Every non-insufficient result requires evidence refs.
- Do not promote claims into canonical facts from Python.
- Do not execute mutation tools or write repositories/databases.
- Exact source and revision checks remain host responsibilities.
