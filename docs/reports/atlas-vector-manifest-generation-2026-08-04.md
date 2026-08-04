# Immutable Qdrant↔Postgres Vector Manifest — Generated
**Status**: GATE PASS | **Date**: 2026-08-04 | **Session**: 188E

---

## TL;DR

Generated the immutable, content-addressed identity manifest for all 52,380 points in `codebase_chunks_768_v2`, required before cuVS clustering or GPU top-k results can be joined back safely to canonical identity. All 52,380 rows accounted for, 0 identity mismatches, 0 missing `postgres_id`. `packet_key` is recorded as `null` on every row by design — the existing corpus was proven unreliable (see `packet-key-grain-audit-2026-08-04.md`) and backfilling it here would have re-introduced exactly the problem that audit blocked.

## Manifest

| | |
|---|---|
| `manifest_id` | `sha256:3a2c10cfa4420cd7f00ec45b6a8a8560e47d8cd69597acae93754f11dd097540` |
| `manifest_version` | `atlas.vector.manifest.v1` |
| Collection | `codebase_chunks_768_v2` |
| Row count | 52,380 (matches declared `points_count` exactly) |
| Sort key | `postgres_id` (deterministic) |
| Vector schema | 3 named vectors — `content`, `error`, `signature`, all 768-dim, cosine |
| File | `docs/reports/atlas-vector-manifest-v1-2026-08-04.json` (21 MB — **not committed to git**, regeneratable via script, see below) |

## Gate

| Check | Result |
|---|---|
| declared vs fetched count match | ✅ 52,380 == 52,380 |
| missing `postgres_id` | ✅ 0 |
| `postgres_id` ≠ live Qdrant point id | ✅ 0 mismatches |
| missing `source_ref` | ✅ 0 |
| missing `content_hash` | ⚠️ 6,908 (13.2%) — **consistent** with the empty-`content_hash` finding in `packet-key-grain-audit-2026-08-04.md` (6,945/52,417 Postgres rows, 13.3%); cross-check confirms the two audits agree |
| `packet_key` collisions | N/A — all null by design |
| **RESULT** | **PASS** |

## packet_key status: intentionally null

Per `packet-key-grain-audit-2026-08-04.md`, the existing `metadata->>'packet_key'` corpus is not usable ground truth (90.5% are `qdrant_id` passthrough, 9.5% are content hashes colliding on the same duplicate-row defect fixed in `canonical-join-missing-root-cause-2026-08-04.md`). Copying that corpus into the manifest would launder an unreliable value into an "immutable" artifact. Every row's `packet_key` is `null` until the grain decision is made and a real derivation runs.

## Not verified exhaustively (explicit scope boundary)

- **Vector dimension/finiteness** was verified on the 1,000-row sample in `qdrant-postgres-identity-reconciliation-2026-08-04.json` (768-dim 100%, finite 100%, PROMOTION_GATE PASS), not re-fetched for all 52,380 rows × 3 named vectors (~450 MB) here — that would add no new identity information over the sample. A full exhaustive vector audit remains a separate, explicitly deferred task if ever needed.
- `content_hash` presence was checked structurally, not recomputed against actual chunk content.

## Why not committed to git

The raw manifest is 21 MB — regeneratable deterministically from live Qdrant + Postgres state via `scripts/atlas/generate-vector-manifest.mjs`, and its `manifest_id` (content hash of the row array) is the durable integrity anchor, not the file itself. Added to `.gitignore`. Re-run the script to regenerate; the `manifest_id` will match iff nothing changed upstream.

## Next (per the ordered execution list)

1. ~~Audit packet_key grain~~ ✅ FAIL — corpus unusable
2. ~~Resolve canonical_join_missing~~ ✅ Fixed + hardened
3. ~~Generate immutable manifest~~ ✅ This report
4. 10-point packet_key repair fixture — **still blocked** on the grain decision (unchanged)
5. Representation producer/version ownership registry — not started
6. LDR MCP attach — not started
