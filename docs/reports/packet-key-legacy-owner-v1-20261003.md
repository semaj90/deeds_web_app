# Legacy packet-key owner hardening

- `scripts/atlas/lib/canonical-source-ref.mjs` now exports `legacyPacketKeyFromSourceRef`, the exact live compatibility formula: `packet:` + the first 12 SHA-256 hex characters of the supplied UTF-8 `source_ref`, without path/case normalization. `upsert-whole-codebase-atlas-packets.mjs`, `backfill-summary-layers-from-chunks.mjs`, and `register-orphaned-chunks.mjs` call this builder; the orphan-registration candidate batch also fails on duplicate truncated keys.
- Writer roles are distinct: `upsert-whole-codebase-atlas-packets.mjs` remains quarantined by its early `--apply` refusal; `register-orphaned-chunks.mjs` is an existing apply-capable legacy writer guarded by its current admission inputs. Both packet insert paths in the latter no longer use `ON CONFLICT (packet_key) DO NOTHING`; uniqueness conflicts fail the insert and are reported as failures. No write path was run.
- `packet-key-legacy-alias-v1.ts` separately reproduces the legacy formula for compatibility alias construction; it does not write or mint canonical packet rows. V2 remains the distinct canonical identity path, with legacy keys treated as aliases.
- Focused pure tests cover formula compatibility, empty input, existing-source match/mismatch, invalid key input, and duplicate candidate-key collision handling. Tests: `canonical-source-ref.test.mjs` 3/3, `packet-key-dominant-scheme.spec.ts` and `compute-packet-key-containment.spec.ts` 9/9; both modified writers pass `node --check` and `git diff --check`.
- Proof level: `WIRED`; `NOT_PROVEN` for current live corpus collision absence and historical silent-drop absence. The previous report's uniqueness constraint is not collision evidence. No DB writes, writer activation, or live full-corpus reconciliation occurred.
- Proof level: `WIRED`; `NOT_PROVEN` for live collision absence, complete writer census, and historical silent-drop absence. No database writes, writer activation, or live full-corpus reconciliation occurred. Next gate: fresh read-only source-ref population reconciliation plus independent packet-key/source-ref readback. `titleId` remains a catalog coordinate and is not packet identity.

## Skill execution fields

- `likely_cause`: Multiple legacy packet writers duplicated the short-hash formula and conflict-ignore behavior could hide key collisions.
- `evidence`: `scripts/atlas/lib/canonical-source-ref.mjs`; `scripts/atlas/register-orphaned-chunks.mjs`; `scripts/atlas/upsert-whole-codebase-atlas-packets.mjs`; `scripts/atlas/backfill-summary-layers-from-chunks.mjs`; `docs/reports/packet-key-single-owner-convergence-v2-addendum.json`.
- `patch_targets`: `scripts/atlas/lib/canonical-source-ref.mjs`; `scripts/atlas/lib/canonical-source-ref.test.mjs`; `scripts/atlas/register-orphaned-chunks.mjs`; `scripts/atlas/upsert-whole-codebase-atlas-packets.mjs`; `scripts/atlas/backfill-summary-layers-from-chunks.mjs`.
- `safe_next_command`: `node --test scripts/atlas/lib/canonical-source-ref.test.mjs`.
- `smoke_command`: `node --check scripts/atlas/register-orphaned-chunks.mjs; node --check scripts/atlas/upsert-whole-codebase-atlas-packets.mjs; node --check scripts/atlas/backfill-summary-layers-from-chunks.mjs; node --test scripts/atlas/lib/canonical-source-ref.test.mjs`.
- `report_path`: `docs/reports/packet-key-legacy-owner-v1-20261003.md`.
