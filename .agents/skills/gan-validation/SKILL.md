---
name: gan-validation
description: Validate Parent Atlas and Phase 85 work by separating created, wired, proven, and done, then requiring replay, cache, provenance, and proof-gate evidence before promotion.
---

# GAN Validation

Use this skill when a task can be created, wired into a production path, and proven by tests or data, but those states are getting mixed together.

This is a proof and promotion skill, not an implementation skill.

## Core Status Model

- `CREATED`: the file, script, package, or contract exists.
- `WIRED`: production code or the main path calls it.
- `PROVEN`: tests, data, reports, or live evidence confirm it works.
- `DONE`: wired + proven + accepted.

Do not mark `DONE` for existence alone.

## Proof Rules

Require explicit evidence for each claim:

1. Exact command run.
2. Exact output observed.
3. Report or file path.
4. The feature, lane, or task being verified.

Accept only live evidence for `PROVEN`:

- dry-run and apply reports
- test output
- replay artifacts
- provenance trees
- benchmark summaries
- startup health reports

## What Counts As Canonical

- Postgres truth is canonical.
- Qdrant, Redis/Valkey, Neo4j, and TurboVec are mirrors or accelerators.
- Replay and provenance decide promotion, not file existence.
