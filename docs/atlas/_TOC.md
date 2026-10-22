# Atlas custom helper TOC

**Status:** CREATED / WIRED / PROVEN per row. Nothing here is PROVEN unless its evidence column says so. Last update 2026-10-22.

Rule: every custom helper, script or contract we add is listed here with its owner, status, tests and receipt. Update this file in the same change that adds the helper.

## Offline pipeline and artifacts

| Helper | Path | What it does | Status | Tests / evidence |
|---|---|---|---|---|
| Arrow checksum gate | `scripts/atlas/lib/arrow-artifact-checksum-v1.mjs` | SHA-256 of whole artifact before any read | fixture-proven, not wired | `…-checksum-v1.test.mjs` 5/5 |
| Arrow admission gate | `scripts/atlas/lib/arrow-artifact-admission-v1.mjs` | checksum, schema, dtype, row range, source revision, finite values | fixture-proven, used only by replay | `…-admission-v1.test.mjs` 9/9 |
| Offline pipeline (M12) | `scripts/atlas/offline-execution-replay-v1.mts` | index → MapReduce → Arrow → admitted read-back → msgpack → ContextManifest → manifest. Writes only `.tmp/atlas/offline-pipeline/<run-id>/` | fixture PROVEN for the chain only | normal COMPLETED 6/6; `--corrupt` BLOCKED |

## Deep-audit telemetry (M10)

| Helper | Path | What it does | Status | Tests / evidence |
|---|---|---|---|---|
| Shared receipt contract | `scripts/atlas/lib/deep-audit-telemetry-receipt-v1.mts` | one Zod `strictObject` schema, `runTelemetryConsumer` | WIRED | boundary tests 13/13 |
| Receipt writer | `scripts/atlas/deep-audit-hll-telemetry-v1.mts` | exact-set distinct counts via `AtlasHllTelemetryClient`; exclusive create; validates its own output | WIRED, not PROVEN | writer run VALIDATED |
| Receipt consumer CLI | `scripts/atlas/deep-audit-telemetry-consumer-v1.mts` | validates named receipts; never picks by timestamp | WIRED | manual runs |
| Boundary tests | `scripts/atlas/lib/deep-audit-telemetry-receipt-v1.test.mts` | writer-to-consumer boundary | fixture-proven | 13/13 |

Legacy receipts `telemetry-2026-10-21-18a98f5a4d.json` and `telemetry-2026-10-22-5325902f29.json` fail the stricter contract. Kept, not edited.

## Context evidence (ENR-03)

| Helper | Path | What it does | Status | Tests / evidence |
|---|---|---|---|---|
| Evidence assembler | `sveltekit-frontend/src/lib/server/atlas/context/context-evidence-assembler-v1.ts` | pure: kind required, AST and edge identity, stale-join rejection, unresolved taxonomy reported separately, zero writes. Pre-existing prototype, extended | fixture-proven, no production caller | Vitest 15/15 |

## Sidecar fix (edit to existing code, not a new helper)

| Change | Path | What changed | Status | Evidence |
|---|---|---|---|---|
| Fail-closed unsupported language | `python/miniforge_nlp_sidecar_v2.py` `_native_ast_evidence` | unsupported language now returns `PARTIAL_AST_FAILED` with the reason, not `COMPLETE` | LIVE after `docker restart miniforge-nlp-sidecar` (2026-10-22) | live probe returns PARTIAL_AST_FAILED; regression test added to `python/test_miniforge_nlp_sidecar_v2_revision.py` |

The v1 file `python/miniforge_nlp_sidecar.py` has the same pattern and is not live. Not changed.

## Tooling and config

| Item | Path | What it does | Status |
|---|---|---|---|
| Golden breadth retrieval | `sveltekit-frontend/scripts/atlas/golden-breadth-retrieval-v1.mjs` | 50 golden queries across Svelte, TRACE and atlas-tools lanes; plan or live; writes receipts only | live run completed; results are status, not quality |
| Svelte MCP entry | `.opencode/opencode.jsonc` (`svelte`) | local stdio server via `cmd /c npx -y @sveltejs/mcp` | CREATED, not verified in OpenCode |
| Deep-audit tiers | `.claude/commands/deep-audit.md` | added ORG (G59–G62), ADV (G56–G58, not a GAN), parallel policy, telemetry recap | spec only; no executable runner |
| Data README | `data/atlas-ml/README.md` | what the DuckDB folder should hold; rules | gitignored |

## Openspec change

`sveltekit-frontend/openspec/changes/parent-atlas-capability-owner-matrix-v1/` — `tasks.md` (milestone records M3–M15, ENR, ENR-01) and `specs/`.
