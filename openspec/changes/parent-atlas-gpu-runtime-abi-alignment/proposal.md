## Why

Added 2026-09-16 — this change previously had no `proposal.md` (flagged by the
`parent-atlas-openspec-tasks-audit-fabric` audit). This file summarizes intent from `tasks.md`'s
own task list and re-verification pass without changing any task or status recorded there.

This change defines one Zod receipt (`GpuRuntimeAbiV1`) covering GPU, CUDA, framework, Node N-API,
LibTorch, cuTile, shared-memory, and checkpointing identity — keeping Node N-API stability
explicitly separate from LibTorch ABI stability, requiring real-target execution and numerical
parity before promotion, and permanently fixing `canonical_authority: false` on the receipt itself.
The receipt schema is done; the substance behind it (a native C ABI/N-API spectral/GEMM bridge, a
real captured RTX 3060 Ti cuTile-or-LibTorch receipt, and CPU/GPU spectral parity on the same
frozen ordinal map) was re-verified live on 2026-09-05 as **still not implemented/captured** — a
grep for the schema literal `atlas.gpu-runtime-abi.v1` across `docs/reports/` and `src/` finds only
the contract file and its own spec/fixture, zero real populated instances. Related-but-separate
work exists elsewhere: `docs/reports/spectral-rtx-alignment-sweep-20260823.md` is a substantial,
self-correcting live CPU/GPU spectral parity investigation on real RTX 3060 Ti hardware, but it is
not yet cross-referenced from this change.

## What Changes

See `tasks.md` for the receipt-schema tasks (done) and the three still-open implementation items
(native ABI bridge, real hardware receipt, CPU/GPU parity proof). This proposal introduces no new
task.

## Capabilities

No new capability — this documents the existing GPU runtime ABI alignment contract and its
still-open implementation gap, already specified in `tasks.md`.
