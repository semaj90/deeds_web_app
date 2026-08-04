# Packet-Key Grain Audit — READ-ONLY (no derivation run, no mutation)
**Status**: PROMOTION_GATE FAIL | **Date**: 2026-08-04 | **Session**: 188D | **JSON**: [packet-key-grain-audit-2026-08-04.json](packet-key-grain-audit-2026-08-04.json)

---

## TL;DR

The existing 14,643 populated `packet_key` values **cannot serve as ground truth** for a derivation formula. 90.5% of them are `qdrant_id` copied into a different field name — not an independently derived identity — and they don't match `atlas_packets` by any key. The other 9.5% are `sha256:` content hashes whose collisions trace to the same duplicate-row re-indexing defect just fixed in `hydrate-candidates.ts`. **Recommendation: do not backfill the missing 37,774 rows yet.** Fix upstream duplicate-row insertion first, then make packet grain (file/chunk/symbol) an explicit architectural decision — it is not inferable from this data.

## Corpus

| | |
|---|---|
| Total `codebase_chunk_index` rows | 52,417 |
| Rows with `metadata->>'packet_key'` | 14,643 (27.9%) |
| Distinct key values | 14,549 |

## Lane classification

| Lane | Count | % of populated | Finding |
|---|---|---|---|
| UUID = `qdrant_id` passthrough | 13,251 | 90.5% | **Not a derived identity.** `metadata->>'packet_key' = qdrant_id::text` for all of these — the field was populated by copying `qdrant_id`, not computing a packet identity |
| `sha256:<hex>` content hash | 1,392 | 9.5% | Plausible content-addressed grain, but entangled with duplicate rows |
| Other format | 0 | 0% | — |

## Cross-reference (is either lane a real canonical identity?)

| Check | Matches |
|---|---|
| `packet_key` UUID lane vs `atlas_packets.packet_key` | **0** |
| `packet_key` UUID lane vs `atlas_packets.packet_id` | **0** |
| `packet_key` UUID lane vs another chunk row's `id` | **0** |
| `packet_key` UUID lane vs own row's `qdrant_id` | **13,251 / 13,251** |

The UUID lane matches exactly one thing: the row's own `qdrant_id`. It does not resolve to `atlas_packets` — the table whose name implies it should be the canonical packet registry — by any key tried.

## Collisions

`MULTI_ROW_SAME_KEY`: **59** distinct keys shared by more than one row (top collision: 9 rows share one `sha256:` key). Sampled: colliding rows share `source_ref` and have **empty `content_hash`** — the exact signature of the duplicate-row re-indexing defect documented in `canonical-join-missing-root-cause-2026-08-04.md` (e.g. `schema-postgres.ts` has 369 duplicate rows). This is not a derivation-formula bug; it's the same upstream data-quality issue surfacing here too. 6,945/52,417 rows (13.3%) have empty `content_hash` overall.

## Required metrics (as specified)

| Metric | Value |
|---|---|
| EXISTING_KEY_MATCH_RATE | **NOT_COMPUTABLE** — no formula was run; the dominant lane isn't an independent identity to validate against |
| DERIVATION_COLLISIONS | NOT_APPLICABLE — no candidate derivation attempted (see recommendation) |
| MULTI_ROW_SAME_KEY | 59 |
| MULTI_KEY_SAME_LOGICAL_PACKET | NOT_PROVEN — no proven logical-packet definition exists yet to test against |
| UNRESOLVED_INPUT_FIELDS | `repository_id` (not in schema), `workspace_revision` (present, 0% populated on chunk rows — matches session-183/188 finding), chunk ordinal/exact span (not columns) |

## Promotion gate: **FAIL**

```
collision_count == 0        FAIL (59)
non_deterministic_keys == 0 NOT_PROVEN
grain_alignment == PASS     FAIL (no grain decision made)
```

**Do not proceed to packet_key backfill from this corpus.**

## Recommendation

1. **Do not backfill** the 37,774 missing rows from either existing lane — the UUID lane adds no information beyond `qdrant_id`, and the `sha256` lane is entangled with unresolved duplicate rows.
2. **Fix duplicate-row insertion upstream** (same defect class as `canonical_join_missing`) before any content-hash-based key can be trusted to mean "one packet."
3. **Make packet grain an explicit decision**, not an inference from this data: FILE vs CHUNK vs SYMBOL vs FEATURE vs REPRESENTATION vs SOURCE_OCCURRENCE. The conceptual form proposed (`packet:v2:sha256(repository_id, source_ref, source_content_hash, identity_kind, identity_component)`) is sound in shape but the operator must choose `identity_kind` semantics before any hashing runs.
4. Once grain is decided and duplicates are fixed, re-run this same read-only audit — the `sha256` lane may then become a legitimate seed, and a real `EXISTING_KEY_MATCH_RATE` becomes computable.

Script kept at `scripts/atlas/packet-key-grain-audit.mjs` for re-runs after upstream fixes land.
