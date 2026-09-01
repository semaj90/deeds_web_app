## 1. Pre-flight (call-site audit before any schema edit)

- [x] 1.1 `rg -n "PrefillContentIdentityV1|buildPrefillContentIdentityV1|prefill-content-identity.v1"` across `src/`, `scripts/`, and `python/` to enumerate every caller that will break when the `.strict()` schema gains 4 required-shape fields
      **Result**: 3 files match in `src/lib/server/atlas/prefill/`: `prefill-contracts-v1.ts` (the
      schema itself), `prefill-contracts-v1.spec.ts` (one call site, in `describe('compiled prefill
      identity')`), and `decoder-qualified-prefill-identity-v1.ts` (comment-only reference — it
      composes on `basePrefillIdentityChecksum`, a checksum string, and never imports or constructs
      `PrefillContentIdentityV1`, so it is unaffected). Zero matches in `scripts/` or `python/`.
      Exactly one real call site to update: the spec file.
- [x] 1.2 Decide, per caller found in 1.1, whether the 4 new fields are optional or required at that call site, and record the answer in this file before editing the schema
      **Decision**: all 4 new fields are required non-nullable strings (no optional/nullable variant),
      consistent with the existing required-revision fields on this schema (`modelRevision`,
      `tokenizerRevision`, `promptTemplateRevision`, `instructionRevision` — only `adapterRevision` is
      nullable, because "no adapter" is a real state; there is no equivalent "no ACE policy" state).
      Types: `acePolicyRevision: revision`, `bitfrostRevision: revision`,
      `residencyPlanChecksum: sha256HexSchema` (checksum, not a free-form revision string),
      `gpuExecutionIdentity: revision`. The one real call site (`prefill-contracts-v1.spec.ts`) is
      updated in task 4.3 to pass all four.

## 2. Contract module: PacketGlyphV1 + ResidencySortKeyV1

- [x] 2.1 Create `PacketGlyphV1Schema` (Zod `.strict()`) with the 8 fields and numeric bounds from `specs/ace-bitfrost-residency-glyph/spec.md`
      **Landed**: `src/lib/server/atlas/residency/packet-glyph-v1.ts`
- [x] 2.2 Create `ResidencySortKeyV1Schema` (Zod `.strict()`) with the 5 fields from `specs/ace-bitfrost-residency-glyph/spec.md`, verifying no `packetKey`/`sourceRef` field is present
      **Landed**: same file — no identity field present, verified by a dedicated rejection test
- [x] 2.3 Add unit tests: valid glyph parses, out-of-range field rejected, unknown field rejected, sort key never carries identity
      **Landed**: `src/lib/server/atlas/residency/packet-glyph-v1.spec.ts` (6 tests)
- [x] 2.4 Write the GPU primitive ownership table (CUB/cuTile/cuBLASLt/cuGraph/cuVS/ACE-BitFrost/SOM) as a doc comment or adjacent markdown in the same module
      **Landed**: doc comment at top of `packet-glyph-v1.ts`

## 3. Contract module: SomCoordinateV1

- [x] 3.1 Create `SomCoordinateV1Schema` (Zod `.strict()`) with `representationRevision`, `somRevision`, `x`, `y`, `z`, `quantizationError` per `specs/parent-atlas-som-topology-coordinate/spec.md`
      **Landed**: `src/lib/server/atlas/residency/som-coordinate-v1.ts`
- [x] 3.2 Add unit tests: independent revision axes, rejection without `quantizationError`
      **Landed**: `src/lib/server/atlas/residency/som-coordinate-v1.spec.ts` (3 tests; also covers non-finite rejection)
- [x] 3.3 Add a doc comment stating the BMU-neighbor-prefetch-only usage restriction (no retrieval ranking, no visualization-as-truth)
      **Landed**: doc comment at top of `som-coordinate-v1.ts`

## 4. Extend PrefillReceiptV1

- [x] 4.1 Add `acePolicyRevision`, `bitfrostRevision`, `residencyPlanChecksum`, `gpuExecutionIdentity` to `PrefillContentIdentityV1Schema` in `src/lib/server/atlas/prefill/prefill-contracts-v1.ts`
      **Landed**: 4 fields added, `.strict()` preserved
- [x] 4.2 Update `buildPrefillContentIdentityV1()` signature/callers per the decisions recorded in task 1.2
      **Landed**: signature updates automatically via `Omit<PrefillContentIdentityV1, 'schema' | 'checksumSha256'>` — no separate edit needed
- [x] 4.3 Update `prefill-contracts-v1.spec.ts` to cover the 4 new fields (required/valid, missing/rejected)
      **Landed**: existing call site updated + new `it('rejects prefill content identity missing the ACE/BitFrost boundary fields', ...)` test added
- [x] 4.4 Re-run existing prefill contract tests to confirm the checksum-of-canonical-payload behavior still holds with the extended shape
      **Verified**: `npx vitest run src/lib/server/atlas/prefill/prefill-contracts-v1.spec.ts` → 4/4 passed

## 5. ACE-RADIX-01 fixture

- [x] 5.1 Build a seeded, deterministic `PacketGlyphV1` fixture generator for N ∈ {256, 1000, 4000, 16000, 64000}
      **Landed**: `scripts/atlas/ace-radix-01/fixture-v1.mjs` (mulberry32 PRNG, seed = sha256("ace-radix-01:"+N)). Fixtures written to `scripts/atlas/ace-radix-01/fixtures/packed-keys-n{N}.bin`.
- [x] 5.2 Add a regression test asserting byte-identical regeneration at fixed seed + N
      **Landed**: `scripts/atlas/ace-radix-01/fixture-v1.test.mjs` — `node scripts/atlas/ace-radix-01/fixture-v1.test.mjs` → 5/5 checks passed
- [x] 5.3 Document the fixture's exact seeding/generation algorithm in the harness README or module doc comment (must be reproducible without re-reading this change's history)
      **Landed**: full algorithm + packed-key derivation documented in the module doc comment at the top of `fixture-v1.mjs`

## 6. ACE-RADIX-01 benchmark harness

- [x] 6.1 Implement CPU `std::sort` reference ordering over `ResidencySortKeyV1`-derived packed keys
      **Landed**: `native/ace-radix-01/radix_bench.cu` (`std::sort` on `uint64_t` packed keys)
- [x] 6.2 Implement/wire CUB radix sort oracle path (native binding, scoped only to this benchmark harness per design.md Non-Goals)
      **Landed**: same file, `cub::DeviceRadixSort::SortKeys` against CUDA 13.0's bundled CCCL headers (`include/cccl/cub`). Compiled standalone via `nvcc` (MSVC 14.40 host compiler) — deliberately isolated from `simd-bridge/cpp/binding.cc` (documented corruption/fragility history in root CLAUDE.md) and from any CMake/node-gyp target. Verified real: `native/ace-radix-01/radix_bench.exe` built and ran successfully against an RTX 3060 Ti (CUDA 13.0.48, driver 580.88, sm_86).
- [ ] 6.3 Implement/wire cuTile challenger path with identical permutation + group boundary output contract
      **NOT_PROVEN / ENVIRONMENT_BLOCKED**: verified live on this build host that CUDA 13.0's toolkit ships only `include/crt/cuda_tile.h`, a bare compiler-intrinsic declaration (`namespace cuda::cutile { void __tile_builtin__ print(...); }`) — no usable host-side cuTile programming API to write a real kernel against. This matches root CLAUDE.md's own prior finding that cuTile went stable on Ampere only at CUDA 13.2. Per this repo's evidence rules (never fabricate benchmark results), this task is left unchecked rather than faked. Re-attempt on a CUDA 13.2+ host/toolkit.
- [x] 6.4 Implement the exact-ordering-match comparator (bit-for-bit key equality, `projectionOrdinal` stable tie-break) as the sole pass/fail gate
      **Landed**: `radix_bench.cu` compares `cubSorted == cpuSorted` (full `std::vector<uint64_t>` equality — the packed key already encodes `projectionOrdinal` in its low 32 bits, so equal packed keys imply equal tie-break too)
- [x] 6.5 Instrument and record (non-gating) metrics: total latency, kernel latency, H2D/D2H bytes moved, cache-hit lift, coalescing/materialization lift
      **Landed (partial, honestly scoped)**: total/kernel/H2D/D2H latency and bytes-moved are real, measured via `cudaEvent` timers (see `docs/reports/ace-radix-01-results.json`). Cache-hit lift and coalescing/materialization lift are BitFrost-production-integration metrics that cannot be measured by a standalone sort-only benchmark with no cache to hit — correctly out of scope for this contracts-and-proof-gate change per design.md's Non-Goals ("No BitFrost production wiring in this change"), not a gap in this task.
- [x] 6.6 Run the full harness across all 5 fixture sizes and record a results artifact (e.g. `docs/reports/ace-radix-01-results.json`) with per-N PASS/NOT_PROVEN verdicts using this repo's enforced status language (never "production-ready" from this alone)
      **Landed**: `docs/reports/ace-radix-01-results.json` — `cubMatchesCpuExactly: true` and `determinismVerdict: "PASS"` at all 5 N (256/1000/4000/16000/64000). `overallVerdict: "DRY_RUN_PROVEN"` for the CUB-oracle half only; cuTile half is `ENVIRONMENT_BLOCKED`; full `ACE-RADIX-01` (both CUB and cuTile matching) remains `NOT_PROVEN` until re-run on CUDA 13.2+.

## 7. Verification

- [x] 7.1 `npm run check` (or the narrowest relevant TypeScript check) on the new/edited contract files
- [x] 7.2 Run new unit tests from sections 2–5
- [x] 7.3 Confirm `openspec validate parent-atlas-ace-radix-residency --strict` passes before marking this change ready to archive
- [x] 7.4 Update root `CLAUDE.md` with a summary section reflecting the finalized contracts and ownership boundaries (done in the parent conversation turn, cross-check it matches what actually landed)
      **Follow-up needed**: the existing CLAUDE.md section (written before section 6 ran) still frames `ACE-RADIX-01` as fully prospective. It needs a short update recording that the CUB-vs-CPU determinism half is now `DRY_RUN_PROVEN` on this host and that cuTile is `ENVIRONMENT_BLOCKED` pending a CUDA 13.2+ host — see the parent conversation turn for that edit.
