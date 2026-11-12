# Tasks: NES LUT single owner (Track A)

Scope: one owner for the domain-to-byte palette used by the AST router, the ACE compiler, and the Node palette.
Status vocabulary: CREATED / WIRED / DRY_RUN_PROVEN / APPLY_PROVEN / NOT_PROVEN / BLOCKED. Nothing here is done from aspiration.

## Audit baseline (2026-10-23, read-only)

| Owner | Role | Field | Current values |
|---|---|---|---|
| `scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs` (`NES_LUT_DOMAIN_PALETTE`) | Palette definition owner | `lutByte`, `nesHex` | 10 domains; `lutByte` 0x01–0x0A, `general` = 0x0A; zero reserved |
| `python/atlas_compute/ast_chunk_routing_helpers.py` (`NES_DOMAIN_LUT`) | AST router | `lut_byte` | `auth`..`ml` = 0x01–0x09, `svelte5_runes` = 0x2A, `unresolved` = 0x00 |
| `python/parent_atlas_learning/ace_compiler.py` (`NES_LUT_PALETTES`) | Duplicate owner | `byte` (= NES hex) | 10 domains; agrees with the .mjs on 2 of 10 `nesHex` (`auth` 0x16, `ui` 0x2A) |

Historical collisions found and corrected:
- `general` and `UNRESOLVED` both used 0x00 (`.mjs` palette vs router); `general` is now 0x0A.
- `retrieval` is 0x21 in the .mjs and 0x1A in `ace_compiler.py`. Eight of ten hex values disagree.
- `ace_compiler.py` `byte` also feeds a Redis key, `bitfrost:centroid:lru:cuml-kmeans-k16-{byte}`, so changing it is a cache-key migration.

## Tasks

- [x] **NLUT-01 Decide the byte map.** `0x00` is unresolved only; `general` is `0x0A`. `svelte5_runes` is a `ui` sub-label: its domain byte is `0x02`, while its NES color remains `0x2A`.
- [x] **NLUT-02 Generate the canonical artifact.** The `.mjs` owner generates `scripts/atlas/data/nes-domain-palette-v1.json` with `lutByte`, `nesHex`, `label`, `priorWeight`, revision and a payload checksum. Current artifact checksum: `sha256:e1b8ccdc6661a3faed3316cf276f01dd16a1edf80a9aba2d465def40461b9b0f`.
- [x] **NLUT-03 Router reads the artifact.** Both AST router versions load the generated map. The Python fixture verifies unresolved `0x00` and rune `ui/0x02` plus separate `nes_hex=0x2A`.
- [x] **NLUT-04 ACE compiler reads the artifact.** ACE returns distinct `lut_byte` and `nes_hex`; OaK tuple uses the canonical NES color. Centroid keys are palette-revision-namespaced; existing Redis keys are not migrated or written.
- [x] **NLUT-05 Drift gate.** Node checks the generated artifact against the source owner; Python router/ACE tests consume that same artifact and assert expected values. Node 5/5 and focused Python 23/23 pass.
- [x] **NLUT-06 Descriptor encoding (MsgPack).** MsgPack carries only the descriptor: `(domain, lutByte, nesHex, uuidRef, tier flags)`. It never carries embeddings or matrices. Evidence: a size and shape test on the encoded descriptor, and no float arrays longer than 16 in the payload. Existing codec to check first: `sveltekit-frontend/src/lib/server/serialization/packet-msgpack-codec.ts`.
- [~] **NLUT-07 AVX2 LUT filtering (CPU only, challenger).** AVX2 byte filtering over `lutByte` lanes is a CPU optimization only. Evidence: output identical to the scalar path on a frozen fixture, with the scalar fallback exercised. No GPU claim. Owner for the AVX2 proof: `parent-atlas-retrieval-lod-algorithm-taxonomy` (CPU-AVX2-01).

## Out of scope

- Tricubic scoring and tiered residency: owned by the prefill DAG track (Phase 12 there).
- QLoRA adapters: gated by the tournament track.

## Integration boundary (2026-10-23)

This closes palette definition and local routing/ACE parameter emission only. It does not wire trusted workspace authority, admitted ContextManifest-to-agent execution, tournament packets, multi-hop graph authorization, or cache writes. MsgPack descriptor/ordinal-bitmap parity, AVX2 filtering and residency replay remain open under their existing owners.

## Re-verification (2026-11-08, piece 1 of the NES work)
- [x] Confirmed the single owner is in place: `scripts/atlas/build-nes-lut-palette-v1.mjs` generates `scripts/atlas/data/nes-domain-palette-v1.json`; `python/atlas_compute/nes_lut_palette.py` loads it with checksum and collision checks; `python/parent_atlas_learning/ace_compiler.py` and the AST router both read it.
- [x] Regenerating the artifact produced no git diff (byte-identical to the committed file).
- [x] Tests pass under `py -3.13` (torch 2.8.0+cu128): `test_nes_lut_palette_v1` 5/5, `test_ast_chunk_routing_helpers` 15/15, `test_ace_compiler` 5/5, `test_nes_lut_palette_v2_candidate` 2/2. Note: the default Python 3.14 lacks torch, so `atlas_compute` fails to import there; use `py -3.13`.
- [x] The "ACE palette disagrees with 8 of 10 domains" finding is STALE for the repo: `ace_compiler.py` no longer has its own table. It reads the artifact. The disagreement lives only in personal scratch notes, not in repo docs.
- [ ] Still open: NLUT-07 (AVX2 LUT filtering, challenger). NLUT-06 closed below.

## NLUT-06 closed (2026-11-08)
- [x] Owner: existing `sveltekit-frontend/src/lib/server/serialization/packet-msgpack-codec.ts`, extended with `encodeNesLutDescriptorToMsgpack` / `decodeNesLutDescriptorFromMsgpack` (schema `atlas.nes-lut-descriptor.v1`). Existing packet encodings are unchanged. No new codec file.
- [x] Descriptor carries only `(domain, lutByte, nesHex, uuidRef, tierFlags)`. Fail-closed validation with named error codes. `lutByte` 0x00 is valid and explicit.
- [x] Evidence: `src/lib/server/serialization/packet-msgpack-codec.nes-descriptor.spec.ts` 6/6 pass. Covers round-trip, `lutByte` vs `nesHex` kept distinct, size under 128 bytes, scalars only (no arrays, no non-integer numbers), invalid-field rejection, and schema mismatch. The existing `ace/packet-io.spec.ts` still passes 9/9 (15/15 total).
- [x] Mirror: no `packages/` copy of this codec exists, so no mirror was needed. Recorded here so it is not assumed.

## Test environment correction (2026-11-08)
- [x] The Python tests above were run under Windows `py -3.13`. The canonical torch environment is the WSL2 conda env `atlas-rapids-cu13`: `/home/james/miniforge3/envs/atlas-rapids-cu13/bin/python` (Python 3.14.6, torch 2.13.0+cu130, CUDA available). Rerun there:
  - palette 5/5, router 15/15, v2 candidate 2/2, ACE compiler 5/5 all pass.
- Run pattern: `MSYS_NO_PATHCONV=1 wsl -d Ubuntu --exec bash -lc "cd /mnt/c/Users/james/Videos/deeds-web-app/python && <py> -m unittest discover -s tests -p test_nes_lut_palette_v1.py"`.
- The default Windows Python 3.14 has no torch, so `atlas_compute` fails to import there. That is an environment gap, not a test failure.

## NLUT-07 harness parity (2026-11-08, PARTIAL)
- [x] Scalar oracle: `python/atlas_compute/nes_lut_filter_v1.py` (LSB-first 32-bit words; `0x00` is an ordinary byte, matches only if allowed; allow-list 1..16 unique bytes; fail-closed validation).
- [x] C++ header: `simd-bridge/cpp/nes_lut_filter.h` with scalar and AVX2 (`_mm256_cmpeq_epi8` + `_mm256_movemask_epi8`, one 32-byte block per word, scalar tail). Standalone; `binding.cc` and build files untouched.
- [x] Harness: `scripts/spatial/nes_lut_filter_cpp_check.cpp`, built with `scripts/dev/clang-vs.bat ... -mavx2` (clang, VS 2022 env).
- [x] Tests: `python/tests/test_nes_lut_filter_v1.py`: 5/5 pass under `py -3.13`, including the cross-check of SCALAR and AVX2 words against the oracle on a frozen fixture (n = 0, 1, 31, 32, 33, 63-65, 100, 257, 1000; 0x00 edge cases; 16-value allow-list).
- [ ] OPEN (owner `CPU-AVX2-01`): native addon dispatch evidence and runtime CPU-feature gating are not proven here. The harness is a standalone build, not the `tensorrt_bridge.node` path.
- No GPU claim.
- [x] NLUT-07 test run in the canonical torch env (2026-11-08): WSL2 Ubuntu, conda env `atlas-rapids-cu13` (`/home/james/miniforge3/envs/atlas-rapids-cu13/bin/python`, torch 2.13.0+cu130). `NES_LUT_FILTER_EXE` set to the Windows-built harness; 5/5 pass, including `CppCrossCheck` (not skipped). The default Windows Python 3.14 has no torch and fails at import; that is the environment, not the code.

## CONTINUATION 2026-11-09 — NLUT-07 standalone AVX2 evidence refresh

Canonical implementation and harness work remains in the monorepo. Fixed `TestResult.name` ownership in `simd-bridge/cpp/test_nes_lut_filter_avx2.cpp`; the previous `const char*` retained pointers to a reused stack label buffer, causing all ten frozen domain labels to display as `0x0A`. The receipt verifier now recompiles current sources, parses the actual harness output, records source/binary/output SHA-256 values, and labels the result `PASS_STANDALONE_HARNESS` with acceptance `PARTIAL`; timings are explicitly diagnostic-only. `node scripts/atlas/verify-nes-lut-filter-avx2-receipt-v1.mjs` passed 23/23 native cases on an AVX2 host, including forced-scalar dispatch, auto AVX2 selection, zero/out-of-range fail-closed cases, and 6,527-byte cohort cases. The separate `scripts/dev/clang-vs.bat` build plus `py -3.13 python/tests/test_nes_lut_filter_v1.py` passed 5/5 Python-to-C++ scalar/AVX2 bitmask parity tests. Receipt: `docs/reports/nes-lut-filter-avx2-parity-receipt-v1.json`.

This does **not** close CPU-AVX2-01: the standalone executable is compiled with `/arch:AVX2`, so it does not prove a portable baseline binary on a CPU/OS without AVX2 state support; the production `tensorrt_bridge.node` dispatch path and exact KNN numerical/order parity are also untested. No binding/build files, database, GPU runtime, or package implementation were changed.

## HANDOFF 2026-11-10 (no checkboxes changed)

- NLUT-07 stays `[~]` PARTIAL. Standalone harness evidence: `docs/reports/nes-lut-filter-avx2-parity-receipt-v1.json` (23/23 native cases; 5/5 Python-to-C++ parity).
- Still open, per the task text: CPU-AVX2-01 (owned by `parent-atlas-retrieval-lod-algorithm-taxonomy`). Gaps: a portable non-AVX2 baseline binary, the production `tensorrt_bridge.node` dispatch path, and exact KNN order parity.
- Closing the dispatch gap touches native build files, which are out of scope for quick-hit work; that needs a separate, explicitly scoped change.
- No code, build, or database changes were made in this handoff.
