# Proposal: CUTILE-ACE-01 LEVEL 3 -- proven via the Python cuda.tile API

## What

Complete `CUTILE-ACE-01`'s LEVEL 3 gate: a fused `GlyphScoreV1` + `ResidencySortKeyV1` cuTile
challenger kernel, exact-match-proven against the same CPU oracles LEVEL 1/2 used, on real Ampere
hardware (RTX 3060 Ti, sm_86).

## Why

The same-day change `parent-atlas-cutile-ace-level3` (archived) attempted this via the raw C++
`cuda_tile.h` header in WSL2's `atlas-rapids-cu13` conda environment and hit a genuine cross-version
toolchain skew: that environment's CUDA 13.3 header/frontend paired with the only available
`tileiras` backend compiler (CUDA 13.2, from the separate `atlas-cutile-cu132` pip venv) could not
interoperate -- root-caused all the way to an incompatible `.tilebc` intermediate-bytecode
architecture encoding, not merely a CLI flag mismatch.

That attempt's own "not attempted" list flagged installing a matched-version `tileiras` as the
next step. Before pursuing that, a simpler alternative was checked: `atlas-cutile-cu132`'s own venv
ships not just C++ headers/binaries but a **Python** `cuda.tile` package (`cuda_tile==1.5.0`) with
its own internally-matched `nvcc`/`tileiras` pair (no cross-environment mixing required). A minimal
elementwise-add smoke test confirmed this path works end-to-end on this host's Ampere GPU before
porting the real kernel.

## Result

**DRY_RUN_PROVEN.** The fused kernel (`native/cutile-ace-level3/glyph_fused_tile.py`) exactly
matches the CPU oracle at all 3 tested fixture sizes (256, 1000, 4000), running for real via
`cuda.tile`'s `@ct.kernel`/`ct.launch` API on this host's RTX 3060 Ti. Full detail:
`docs/reports/cutile-ace-level3-results.json`.

Three real, distinct API-usage errors were found and fixed via actual compiler/runtime
diagnostics while porting (not guessed) -- see `tasks.md` for the full list: `bid()`'s axis
argument, `store()`'s positional argument order, and a real backend codegen limitation rejecting
unsigned floor-division with a "negative_inf rounding mode" error (worked around by dividing as
signed int32, since all operands here are non-negative so the result is identical).

This supersedes `parent-atlas-cutile-ace-level3` (the C++ attempt) for the purpose of the
`CUTILE-ACE-01` LEVEL 3 gate -- **that earlier change's finding is NOT retracted or edited**; it
remains an accurate record of a genuine, still-unresolved C++-toolchain version-skew problem in
this environment. This change simply shows the gate can be met via a different, working API
surface in the same overall proving-ground effort.

## Non-goals

- Fixing the C++ (`cuda_tile.h`) toolchain skew -- not resolved, superseded by using Python instead.
- Latency/throughput comparison of the fused LEVEL 3 kernel against LEVEL 2's two separate kernel
  launches -- this proves fusion **correctness**, not a fusion **performance** win. Those are
  separate, unproven claims.
- Wiring this kernel into any production BitFrost/ACE residency path -- stays a proving-ground
  artifact per `parent-atlas-gpu-mini-fabric-01`'s own scope.
