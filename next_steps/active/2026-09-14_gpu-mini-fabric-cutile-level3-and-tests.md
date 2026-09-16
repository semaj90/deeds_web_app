# GPU Mini-Fabric: CUTILE-ACE-01 LEVEL 3 + test coverage — 2026-09-14

**Status**: CUTILE-ACE-01 LEVEL 3 is now DONE (`DRY_RUN_PROVEN`, see below) — the one item this
doc originally flagged as the next session's open item is complete. All 3 GPU-primitive levels
(CUB oracle, unfused CUDA, fused cuTile) are now proven for this capability, the first time this
proving-ground has completed its full LEVEL 1→2→3 ladder.

## LEVEL 3 result (added same-day follow-up session)

Two stages, both worth knowing:

1. **C++ `cuda_tile.h` attempt** (WSL2 `atlas-rapids-cu13` env) — `BLOCKED_TOOLCHAIN_VERSION_SKEW`.
   The kernel (`native/cutile-ace-level3/glyph_fused_tile.cu`) compiles with zero frontend errors
   after fixing 6 real API-usage errors, but device-code generation is blocked: the only available
   `tileiras` backend (CUDA 13.2, from a separate venv) cannot process the `.tilebc` bytecode
   CUDA 13.3's frontend produces — a genuine IR-encoding version skew, not a flag issue. Full trail:
   `docs/reports/cutile-ace-level3-attempt-v1.json`.
2. **Python `cuda.tile` API** (same `atlas-cutile-cu132` venv, but its own Python package instead
   of the C++ header) — `DRY_RUN_PROVEN`. `native/cutile-ace-level3/glyph_fused_tile.py` exactly
   matches the CPU oracle at N=256/1000/4000 on this host's RTX 3060 Ti, after fixing 3 more real
   API errors (`bid()`'s axis arg, `store()`'s arg order, an unsigned-floordiv backend limitation).
   Full trail: `docs/reports/cutile-ace-level3-results.json`.

The Python result supersedes the C++ one for the LEVEL 3 gate but does not retract its finding —
the toolchain skew is real and still unfixed, just avoided rather than resolved. See root
`CLAUDE.md`'s "CUTILE-ACE-01 LEVEL 3 real result" section for the full writeup, and both archived
OpenSpec changes: `2026-09-14-parent-atlas-cutile-ace-level3` (blocked) and
`2026-09-14-parent-atlas-cutile-ace-level3-python` (proven).

## What's missing / not done (read this first)

1. ~~CUTILE-ACE-01 LEVEL 3~~ — **DONE**, see above.
2. **Python npm-script wiring** — `bitfrost_sim_01.py`/`som_cache_tournament_01.py` runners (and
   now `glyph_fused_tile.py`) have no `npm run` entry. Different invocation shape
   (`python -m atlas_compute...` / a WSL2-venv-activated `python`), deliberately not force-fit.
3. ~~CUDA boundary-value tests~~ — **DONE** (`CUTILE-ACE-BOUNDARY-01`, same-day follow-up): a
   26-glyph explicit boundary fixture now covers all-zero/all-max glyphs and per-field extremes,
   run through the CPU oracle, LEVEL 2 CUDA C++, and LEVEL 3 Python `cuda.tile` — all exact match.
   This also proved the LEVEL 3 signed-division workaround safe for the REAL field contract
   (`uint16`, max 65535 — far below `INT32_MAX`), not merely "non-negative" as the original comment
   claimed. See `docs/reports/cutile-ace-boundary-01-results.json`.
4. **No pytest coverage** for `bitfrost_sim_01.py`/`som_cache_tournament_01.py` themselves (the
   end-to-end runner scripts) — only their constituent modules (`atlas_ace_residency_v1.py`,
   `atlas_som_lite_v1.py`, `query_sequence_fixture.py`, `atlas_lod_ladder_v1.py`) have unit tests.
   21/21 existing tests pass; this is a coverage gap at the integration-script level, not a known bug.
5. **No latency/throughput comparison** for the fused LEVEL 3 kernel vs. LEVEL 2's two unfused
   kernels — only fusion correctness was proven, not a fusion performance benefit.
6. **The C++ toolchain version skew itself is unfixed** — installing a matched-version `tileiras`
   for CUDA 13.3 (or a matched-version header for CUDA 13.2) remains open, now lower priority since
   the Python path already meets the LEVEL 3 gate, and deliberately NOT being reopened per
   external-review guidance ("close audit complete, recheck only if a matching toolkit appears").

Nothing else is known-incomplete. All archived changes for this proving-ground
(`parent-atlas-bitfrost-sim-01`, `parent-atlas-som-cache-01`, `parent-atlas-bitfrost-l2-01`,
`parent-atlas-cutile-ace-level2`, `parent-atlas-cutile-ace-level3`,
`parent-atlas-cutile-ace-level3-python`, `parent-atlas-cutile-ace-boundary-01`) pass
`openspec validate --strict` with 0/0 remaining checkboxes.

## Ladder status frozen (per root CLAUDE.md, same-day follow-up; named by programming model, not language)

External review (same day) correctly flagged that naming the two LEVEL 3 attempts "Python" and
"C++" made it sound like two implementations of the same language-level choice. They are not —
`cuda.tile` (Python) and `cuda_tile.h` (C++, the blocked one) are genuinely different NVIDIA
programming models (**Tile** vs **SIMT**), and NVIDIA does not treat intra-kernel SIMT/Tile mixing
as supported (separate kernels can share buffers and a semantic contract, which is exactly what
LEVEL 2 and LEVEL 3 do here — that's not the same as one kernel being "SIMT-aware Tile code").
Corrected framing:

- LEVEL 1 — ORACLE (CPU/CUB, semantic reference): PROVEN
- LEVEL 2 — SIMT (CUDA C++, separate GlyphScore + ResidencySortKey kernels): DRY_RUN_PROVEN,
  including boundary-value coverage
- LEVEL 3 — TILE (Python `cuda.tile`, FUSED GlyphScore + ResidencySortKey kernel): DRY_RUN_PROVEN,
  including boundary-value coverage and a range-proven division workaround
- LEVEL 3 C++ IMPLEMENTATION (optional alternate frontend, `cuda_tile.h`): PROVEN_BLOCKED
  (`BLOCKED_TOOLCHAIN_VERSION_SKEW`) — not a peer level, not required for LEVEL 3 semantic
  completion, closed and not reopened

**Recommended next GPU-mini-fabric-01 work**: not further LEVEL 3 correctness work (that's done) —
optionally `CUTILE-ACE-PERF-01` (LEVEL 2 vs LEVEL 3 latency/throughput comparison — a slower but
correct LEVEL 3 result would still be useful; Level 3 is not required to win), then the remaining
npm-wiring/pytest-coverage housekeeping items above, then the next architectural layer (a
revision-qualified GPU tile/residency bridge — `GPU-TILE-DESCRIPTOR-01` →
`BITFROST-GPU-MEMORY-ADMISSION-01` → `BITFROST-GPU-RESIDENCY-01` → `PA-FEATURE-MEMORY-ROUTER-01`),
now that the executor ladder underneath it is proven.

## TL;DR

`parent-atlas-gpu-mini-fabric-01`'s full staged sequence is now complete: BITFROST-SIM-01 ✅,
SOM-CACHE-01 ✅, BITFROST-L2-01 ✅, CUTILE-ACE-01 LEVEL 1+2+3 ✅ (all archived 2026-09-14, LEVEL 3
in a same-day follow-up session via the Python `cuda.tile` API after the C++ header path hit a
real toolchain version skew). Test coverage gaps found post-archive were also closed (7 new
pytest tests).

## Finding: WSL2's CUDA 13.3 has a REAL cuTile API; Windows-native CUDA 13.0 does not

Verified live (2026-09-14), not assumed:
- **Windows-native** `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\include\crt\cuda_tile.h`
  — **60 lines**, a bare compiler-intrinsic stub (`__tile_builtin__` declarations only). This is
  what `ACE-RADIX-01`'s own finding (root CLAUDE.md) already established and is why LEVEL 3 has
  never been attempted on this dev host's native Windows toolchain.
- **WSL2 `atlas-rapids-cu13` conda env** (`/home/james/miniforge3/envs/atlas-rapids-cu13`) ships
  **CUDA 13.3** (via its own `nvcc`, confirmed via `nvcc --version` this session), and its
  `crt/cuda_tile.h` is **4,064 lines** — a genuine `cuda::tiles` C++20-concepts-based tile
  programming API (real class/function declarations, `__applicable_tile_hints__` attributes for
  both GCC and MSVC toolchains), not a stub — accessed via `#include <cuda_tile.h>` in a `.cu`
  file compiled with `-std=c++20`. **Correction (same-day follow-up session)**: a bare `import
  cutile` in `atlas-rapids-cu13` does fail, but that is the wrong package name/environment, not
  proof no Python cuTile exists anywhere in WSL2 — the separate `atlas-cutile-cu132` venv has a
  real, working, well-documented `import cuda.tile as ct` package (`cuda_tile==1.5.0`,
  decorator-based `@ct.kernel`/`ct.launch` API). This became the actual successful LEVEL 3 path —
  see the LEVEL 3 result section above.

**This was NOT known when root CLAUDE.md's ACE-RADIX-01 finding was written** — that finding only
checked the Windows-native toolchain. It is real evidence that `CUTILE-ACE-01`'s LEVEL 3 attempt
should target the WSL2 `atlas-rapids-cu13` environment, not the Windows-native one, contrary to
this repo's prior default assumption that native Windows CUDA 13.0 is where GPU proving-ground work
happens (per the `ACE-RADIX-01`/`BITFROST-L2-01`/`CUTILE-ACE-01`-LEVEL2 precedent, all built there).

## Next action: DONE — see "LEVEL 3 result" section above

The plan below is preserved for its historical value (it correctly anticipated the gate criterion
and the "don't trust a passing compile alone" caution, both of which held up), but every step was
executed in the same-day follow-up session:

1. ~~Port ... into a single fused `cuda::tiles`-based kernel~~ — done, twice: once in C++
   (`glyph_fused_tile.cu`, blocked at the backend), once in Python (`glyph_fused_tile.py`, proven).
2. ~~Compile with WSL2's own `nvcc`~~ — done; `g++` 13.3.0 confirmed available.
3. ~~Gate criterion: exact-match against the same CPU oracles~~ — done, all 3 fixture sizes exact.
4. ~~Do not treat a passing compile alone as proof~~ — heeded: the C++ path's passing *frontend*
   compile was explicitly NOT reported as a pass; only the Python path's actual GPU execution +
   exact-match output was.
5. ~~Record the real result in a fresh OpenSpec change~~ — done, two changes:
   `parent-atlas-cutile-ace-level3` (the blocked C++ attempt) and
   `parent-atlas-cutile-ace-level3-python` (the successful Python attempt).

## Test coverage gap closed this session (2026-09-14)

Found during a post-archive review: `python/tests/` only had `test_atlas_lod_ladder_v1.py` for the
entire `parent-atlas-bitfrost-sim-01` / `parent-atlas-som-cache-01` change pair, despite two real
bugs having been found and fixed in `atlas_ace_residency_v1.py` (an eviction-counting bug, a
`PYTHONHASHSEED` non-determinism bug) with zero regression-test protection.

**Added**:
- `python/tests/test_query_sequence_fixture.py` (4 tests — determinism, multiset equality, trace
  length, locality-vs-control divergence)
- `python/tests/test_atlas_ace_residency_v1.py` (6 tests — metric shape, an explicit eviction-
  counting regression test, an explicit hash-seed-tie-break regression test via source inspection,
  LRU/utility-score mode parity, backward-compatible `neighbor_provider=None` default, custom
  provider wiring)

- `python/tests/test_atlas_som_lite_v1.py` (5 tests — feature-vector determinism, and an explicit
  regression test for the distance-ranking capping fix: a hand-built tiny SOM where the OLD
  node_key-sorted behavior and the FIXED distance-ranked behavior would disagree, asserting the
  fixed ordering)

All 20 tests (12 new + 8 pre-existing) pass. **Still not covered**: `bitfrost_sim_01.py`/
`som_cache_tournament_01.py` (the runner scripts themselves — currently only exercised via their
own `__main__`/inline execution, no pytest wrapper, since they're integration-style end-to-end
scripts rather than unit-testable functions). Flagged, not done.

## Real gap found and fixed: LOD demotion was never triggered (2026-09-14, post-archive review)

`AtlasAceResidencyV1` only ever called `AtlasLodLadderV1.promote_one_rung()` — a node's LOD rung
grew monotonically and never shrank back down even after falling fully out of residency to COLD,
despite the `atlas-lod-promotion-ladder` spec's own name being "promotion AND demotion." **Fixed**:
added `demote_one_rung()` (symmetric method), wired into `_remove_from_tiers()` so full eviction
demotes the LOD rung one step. New regression test:
`test_atlas_ace_residency_v1.py::test_full_eviction_demotes_lod_rung`. Re-ran both the
`BITFROST-SIM-01` gate (`observed_lift` unchanged, `0.53425`) and the `SOM-CACHE-01` tournament
(`som_hit_rate` unchanged, `0.061`) — confirmed no behavioral regression, LOD rung and residency
tier are genuinely independent axes as designed. 21/21 tests pass.

## npm script discoverability — FIXED (2026-09-14, follow-up session)

Checked the actual convention first (not assumed): `grep -c '"atlas:' package.json` → 1031 existing
`atlas:*` scripts, but zero references anywhere to `native/`, `ace-radix-01`, `radix_bench`, or any
`gpu_mini_fabric` tooling — this gap predates this session and applies to the ENTIRE
`gpu-mini-fabric-01` family, not just this session's 4 new scripts. Added 5 entries to
`sveltekit-frontend/package.json` under the existing `atlas:gpu:*` neighborhood:
```
atlas:gpu-mini-fabric:ace-radix-01:fixtures
atlas:gpu-mini-fabric:ace-radix-01:test          (runs fixture-v1.test.mjs + glyph-score-v1.test.mjs)
atlas:gpu-mini-fabric:cutile-level2:write-fixtures
atlas:gpu-mini-fabric:cutile-level2:bench
atlas:gpu-mini-fabric:bitfrost-l2-01:bench
```
Verified live: `npm run atlas:gpu-mini-fabric:ace-radix-01:test` → all 8 checks pass.
**Not wired**: the Python `bitfrost_sim_01`/`som_cache_tournament_01` runners — different invocation
shape (`python -m atlas_compute...`, no PYTHONPATH wrapper convention established in this
package.json) — left as a separate, smaller follow-up rather than force-fitting them in.

## CUDA boundary-value tests — not pursued (recorded, low priority)

`glyph_kernels_bench.cu`'s exact-match tests only exercise the mulberry32-seeded random fixture,
not explicit boundary values (all-zero glyph, all-max-bit-width glyph). Not a known bug — the
formula is purely additive with no branching, so boundary behavior is very unlikely to diverge from
the random-fixture coverage — but an explicit boundary-value fixture would make that claim verified
rather than merely likely. Still not done — low priority given the formula's simplicity.

## Unrelated system checked and ruled out as irrelevant here

`packages/atlas-core/src/validation/gan-audit-integration.ts` (`GanAuditOrchestrator`,
`scripts/atlas/test-gan-audit-integration.mts`) is a separate TypeScript packet-validation
orchestrator (Postgres → Redis → NATS 5-step canonical flow, hard-fail/soft-warn packet structure
gates) — confirmed via `rg` to have no relationship to this session's Python/CUDA GPU proving-ground
work. Recorded here so a future search for "GAN validation" + "GPU proving ground" doesn't
re-investigate this dead end.
