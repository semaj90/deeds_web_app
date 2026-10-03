---
name: validating-parent-atlas
description: Audits Parent Atlas identity, lineage, semantic projections, runtime side effects, contract parity and adversarial probes. Use for GAN audits, packet validation, revision-qualified lineage proofs, retrieval or projection validation, and fail-closed gate reviews.
---

# Validating Parent Atlas

Deterministic logic lives in repo code; this skill only says which owner to run, what counts as proof, and when to stop.
Main repo first: `sveltekit-frontend/src` and `scripts/atlas` own contracts and gates; `packages/*` mirror them.

## Core rule

Never report PROVEN from any of these:
- a zero-row or empty-batch run (`Processed: 0` is not a pass)
- a mocked, injected-stub, or fallback client (the old orchestrator swallows DB errors into `[]`)
- assertions that only check result shape ("7/7" is WIRED, not PROVEN)
- latest-by-timestamp or glob-sorted artifact discovery; name the artifact by coordinate or path
- packet qualification standing in for chunk qualification
- Redis, Qdrant, graph or cache evidence standing in for Postgres authority

Agreement between two implementations is parity, not correctness. A LIVE_READ_ONLY proof needs all five: (1) real rows, (2) authoritative input, (3) the validator policy itself independently justified (a live inventory plus fixtures, not just a second copy of the rule), (4) the exact expected owner, (5) zero hidden fallback. Report `execution` (did the harness run correctly) separately from `validator` (is the rule trustworthy). Example: the legacy `source_ref` rule agreed perfectly between SQL and JS while wrongly rejecting 91.9% of real refs.

Say which level a run reached, and stop at that level: `STATIC` < `WIRED` < `LIVE_READ_ONLY` < `LIVE_MUTATING` < `PROVEN`, or `BLOCKED`. A blocked lane blocks promotion of what depends on it, even if the adversarial fixtures all pass. Details: `reference/proof-levels.md`.

## Four lanes

| Lane | Question | Owner to run |
|---|---|---|
| Authority | Are identity, revisions and artifact coordinates exact? | `scripts/atlas/prove-gan-audit-readonly-v1.mts`, `packages/atlas-core/src/identity/atlas-coordinate-v1.ts` (`reference/identity-and-lineage.md`) |
| Structural / Lineage | source -> packet -> chunk -> symbol current at the expected revisions, at the feature's grain? | `lineage-qualification-v2.ts`, `measure-mapreduce-chunk-readiness-v2.mts` (`reference/structural-lineage.md`) |
| Semantic / Projection | do embeddings, Qdrant and retrieval evidence match the representation revision? | not yet automated; report NOT_EXERCISED, never PROVEN (`reference/semantic-projection.md`) |
| Runtime / Side effects | Postgres-first ordering, dry-run guarantees, BitFrost coordinate isolation | ADV005/006/015 in `prove-gan-adversarial-v1.mts`; `READ ONLY` transaction in the live runner (`reference/runtime-side-effects.md`) |

Contracts: `scripts/atlas/export-contract-parity-v1.mts` + `python/atlas_contract_parity/run_parity.py` (Zod vs Pydantic, never "latest").

## Workflow

1. Adversarial fixtures (no DB): `npx tsx scripts/atlas/prove-gan-adversarial-v1.mts`. Passes only when every malicious fixture is rejected with the expected code, every control is accepted, and the gate's self-tests detect deliberately broken probes. See `reference/adversarial-probes.md`.
2. Live read-only census: `npx tsx scripts/atlas/prove-gan-audit-readonly-v1.mts --adversarial-receipt <named receipt>`. One `REPEATABLE READ READ ONLY` transaction, every row, no prefilter on the audited fields. DB failure or zero rows exits 2 with `GAN_LIVE_PACKET_PROOF_BLOCKED`.
3. Report per lane with a level, plus findings. Overall status is the worst lane, not the average. Counts of probes are not a score.

## Gotchas

- Package tests: root `.npmrc` sets `workspaces=false`, so `npx vitest` inside `packages/*` errors. Run `node ../../node_modules/vitest/vitest.mjs run <path>` from the package.
- `atlas_packets` has no `title`, `ganvalidated`, `ganvalidationerror` or `ganwarnings` column live; the GAN orchestrator's SQL assumes them.
- `atlas_packets.workspace_revision` is a legacy integer; use `workspace_revision_key`. Join on raw `source_ref`, not `canonical_source_ref`.
- The historical `source_ref` rule accepts only lowercase `.ts`/`.tsx`; it falsely rejects most real refs. Treat its hard-failure count as validator drift, not data quality, until replaced.
- Write receipts with exclusive-create; keep failed runs as history. Build new file text before opening a file for writing; untracked files have no git fallback.

Reference: `identity-and-lineage.md`, `structural-lineage.md`, `semantic-projection.md`, `runtime-side-effects.md`, `adversarial-probes.md`, `proof-levels.md`.
