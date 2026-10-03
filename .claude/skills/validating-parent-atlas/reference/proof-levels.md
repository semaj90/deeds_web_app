# Proof levels

| Level | Meaning | Example |
|---|---|---|
| STATIC | Read from code or docs; nothing executed | "the validator regex is `^[a-z0-9/_\-.]+\.(ts\|tsx)$`" |
| WIRED | Executes, but result shape only or an empty input | old `test-gan-audit-integration.mts` (7/7, Processed 0) |
| FIXTURE_PROVEN | Deterministic fixtures: gates reject bad states, accept controls, and the gate can fail | `prove-gan-adversarial-v1.mts` |
| LIVE_READ_ONLY | Ran against real data in a READ ONLY snapshot, no writes | `prove-gan-audit-readonly-v1.mts` |
| LIVE_MUTATING | Wrote to a datastore; needs explicit operator approval, rollback path, readback | none yet |
| PROVEN | Identity + lineage + projection + side-effect evidence agree on real data, with revision-qualified coordinates | not reached for the whole system |
| BLOCKED | A precondition failed; say which one | structural lane: `CHUNK_REVISION_QUALIFICATION_MISSING` |

Rules:
- Overall status is the worst lane. A lane that was not run is NOT_EXERCISED, never PROVEN.
- Null is not zero; an unavailable value is never reported as 0.
- Live counts describe the data, not the gate: 56,724 validator rejections is a finding about the validator's rule set, not proof the packets are bad.
- Receipts are immutable evidence. A failed run stays; a new run gets a new file.
