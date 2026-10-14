# BitFrost Token FSM — Index and Findings

**Status**: contract-tested, not runtime-proven | **Date**: 2026-10-13 | **Tracking**: `openspec/changes/parent-atlas-tensor-residency-integration/tasks.md` (reopened item + 2026-10-13 section)

---

## TL;DR

The BitFrost token FSM is a logical candidate lifecycle with request leases and an atomic compile. It is contract-tested only. Physical GPU residency is not implemented: `gpuTileId` is a label. Two production callers are missing (lease holders and V2 verification). Tokenizer and cold/warm parity are not yet measured.

## Code

| Path | Role | Status |
|---|---|---|
| `sveltekit-frontend/src/lib/server/atlas/cache/bitfrost-token-fsm-v1.ts` | FSM class, leases, two-phase compile | Contract-tested |
| `sveltekit-frontend/src/lib/server/atlas/cache/bitfrost-token-fsm-v1.spec.ts` | FSM contract tests (22) | Passing |
| `sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.ts` | V2 selection checksums and verifier | Contract-tested |
| `sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.spec.ts` | V2 tests | Passing |
| `sveltekit-frontend/src/lib/server/atlas/context/fanout-context-compiler-v1.ts` | Separate fanout compiler | Not changed |

## Findings

| # | Finding | Evidence | Status |
|---|---|---|---|
| F1 | `RESIDENT` means "emitted in prompt", not "allocated in VRAM" | `compileFsmContextManifestV1` promotes on selection | Confirmed (design conflation) |
| F2 | `ADMITTED` description claims a pinned CPU buffer; no allocation exists | `BITFROST_STATE_MEANINGS_V1` text | Confirmed (documentation ahead of code) |
| F3 | `gpuTileId` is a synthesized label `tile-gpu-<ordinal>` | `promoteToResident`, line ~395 | Confirmed; FSM-08 open |
| F4 | Compiler is greedy first-fit over bundle order, not an optimal knapsack | compile selection loop | Confirmed; optimality not claimed |
| F5 | Stale revision could reach RESIDENT after admission | promotion had no current-revision check | Fixed: `FSM_REVISION_MISMATCH` on promote and at compile preflight |
| F6 | Compile budget and FSM ceiling were separate; a larger compile budget threw mid-compile | `FSM_TOKEN_BUDGET_EXCEEDED` at ordinal 3 | Fixed: both enforced in preflight |
| F7 | EVICTING/PURGED candidates aborted the whole compile | `FSM_COMPILER_ERROR` | Fixed: excluded as unselected |
| F8 | No in-flight reference ownership; eviction could free state under a running request | no lease API before this work | Fixed for lifecycle: leases, deferred purge |
| F9 | V2 `selectedOrdinalSetChecksum` was caller-supplied, not bound to the actual selection | `ContextManifestV2IdentityInput` | Fixed: compiler computes; verifier recomputes |
| F10 | V2 identity does not cover ordered selection | no ordered field before | Fixed: optional `orderedSelectionChecksum` (absent keeps old checksum) |
| F11 | `rollbackToAdmitted` bypasses the transition table | compensating step only | Accepted; documented; only the compile calls it |
| F12 | `EVICTING` → `RESIDENT` is a legal transition in the table | `LEGAL_FSM_TRANSITIONS` | Open question: re-promotion of evicted slots not yet justified |
| F13 | Slots keyed by bare ordinal; generation tracked in a side map | `generations`, `registerUnloaded` | Mitigated for leases; a slot-level generation field is not in the schema |
| F14 | Tokenizer label is unverified; no Ornith tokenizer revision exists in the repo | searched `src/` | Open: FSM-05 needs a live run |
| F15 | Pre-existing unused `maxSlots` field | IDE diagnostic | Not changed |

## Gates

| Gate | Status | Notes |
|---|---|---|
| FSM-01 invalid transitions | Partial | transition-table tests |
| FSM-02 stale revision | Contract-proven | F5 |
| FSM-03 in-flight leases | Contract-proven (lifecycle) | F8; no production caller |
| FSM-04 purged excluded | Proven for compile | F7 |
| FSM-05 tokenizer | NOT_RUN | F14 |
| FSM-06 cold/warm parity | NOT_PROVEN | logical replay only |
| FSM-07 ceilings / atomic compile | Contract-proven | F6; preflight mutates nothing |
| FSM-08 physical residency | NOT_PROVEN | F3 |
| FSM-09 V1→V2 identity | Contract-proven | F9, F10; reorder test is helper-level only |
| FSM-10 end-to-end receipt | NOT_RUN | needs one real retrieval result |

## Open decisions

| Decision | Options | Recommendation |
|---|---|---|
| `gpuTileId` (F3, FSM-08) | rename to logical label / build allocation receipt | rename now; receipt under `BITFROST-GPU-TILE-LIRS-01` |
| Lease holders (F8) | wire into chat and OpenAI-facade paths | wire after your go-ahead (live request path) |
| V2 verification (F9) | call verifier in an admission bridge | same owner decision as lease holders |
| Re-promotion (F12) | keep / forbid `EVICTING` → `RESIDENT` | forbid unless a use case needs it |

## Test gaps

- No real concurrent test; the compile has no `await` between check and commit, so the single JS thread protects it.
- FSM-09C compares checksums at helper level only; the bundle is always sorted by ordinal, so the compiler cannot produce a reordered selection.
- The revision race test uses a purge as the state change, because no API changes a source revision.

## Verification

| Check | Result |
|---|---|
| Five focused suites | 35/35, vitest exit 0 (before label-only change) |
| FSM spec after tokenizer label change | 22/22, vitest exit 0 |
| `openspec validate parent-atlas-tensor-residency-integration --strict` | valid |
| `tsc` / `svelte-check` on changed files | not run |

## Next steps

- Run FSM-05 on `:8090` (read-only).
- Build the FSM-06 frozen fixture.
- Decide F3 and F12.
- Wire lease holders and V2 verification after approval.
