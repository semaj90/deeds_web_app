# Splat (SPZ) — calibration and loader

**TL;DR** Engine-agnostic code for Niantic SPZ v4 Gaussian splats. `spz-loader.ts` decodes a file into typed arrays and fails closed on anything it doesn't verify. `calibration.ts` maps splat coordinates into a calibrated scene in meters. Neither file imports Three.js, Babylon.js, or PlayCanvas. Renderer split (proposed, see root `CLAUDE.md`): Three.js is the primary evidence viewer and `three-calibrated-markers.ts` is its marker adapter; Babylon.js owns the courtroom. Rendering is not qualified yet (SCENE-08).

## Files

| File | Role |
|---|---|
| `spz-loader.ts` | SPZ v4 decoder (`parseSpz`, `sha256Hex`, `zstdWindowSize`) |
| `calibration.ts` | Two-anchor similarity transform, residual check, `markerDiameterM` |
| `three-calibrated-markers.ts` | Three.js adapter: calibrated frame group, metric markers |
| `fixtures/` | Official-encoder SPZ files and their expected decodes |
| `*.test.ts` | Vitest unit tests (38 passing) |

Server endpoint: `POST /api/splat/calibrate` (`src/routes/api/splat/calibrate/+server.ts`). It is stateless and writes nothing to the database.

## Decode contract

- **Input:** SPZ **v4** only, with `NGSP` magic and a 32-byte header. Six streams for SH degree ≥ 1, five for degree 0 (the official encoder omits the empty SH stream).
- **Output:** `positions`, `alphas` (logit), `colors` (SH DC), `scales` (log), `rotations` (xyzw), `sh` (coefficient-major, RGB interleaved). Coordinate system is always **RUB**, the reference default. The caller records this in the manifest.
- **Dependencies:** `fzstd@0.1.1` (MIT, decode-only ZSTD).

### Fail-closed error codes

| Code | Meaning |
|---|---|
| `SPZ_LEGACY_GZIP_UNSUPPORTED` | v1–3 gzip file (`1f 8b`) |
| `SPZ_BAD_MAGIC` / `SPZ_VERSION_UNSUPPORTED` | Not `NGSP`, or version ≠ 4 |
| `SPZ_EXTENSIONS_UNSUPPORTED` | Header flag `0x2`: extension records not parsed |
| `SPZ_STREAM_COUNT_UNEXPECTED` | Not 5 (degree 0) or 6 (degree ≥ 1) |
| `SPZ_STREAM_SIZE_MISMATCH` | TOC size ≠ size implied by `numPoints` and SH degree |
| `SPZ_ZSTD_DECODE_FAILED` | Corrupt or truncated ZSTD frame |
| `SPZ_ZSTD_WINDOW_TOO_LARGE` | Frame window > 2^25 bytes (fzstd limit) |
| `SPZ_TRAILING_BYTES`, `SPZ_TRUNCATED_*` | Length checks |
| `SPZ_TOO_MANY_POINTS` | Above the operator cap (default 5,000,000) |

The full list is in `spz-loader.ts`.

## Calibration

- `solveTwoAnchorTransform(a, b)`: scale from the distance ratio, yaw from the XZ direction, translation from anchor A.
- `calibrate(anchors, toleranceM)`: fits the first two anchors, then reports residuals for all anchors. PASS only when every residual is within tolerance.
- `markerDiameterM(realSizeM)`: markers are sized in meters of the real object, never in screen pixels.

## Provenance of fixtures

| File | Source |
|---|---|
| `niantic-official-degree{0,1,2,3,4}-*.spz` | `ply_to_spz` from nianticlabs/spz commit `11312e4ad836ed06e3da2f3d5b633688d17ebebb` (MIT) |
| `expected-degree{0..4}.json` | `spz_to_ply` output of the same files |

Regenerate all fixtures with `scripts/splat/generate-spz-fixtures.mjs`, which builds deterministic PLY inputs, runs the official `ply_to_spz` and `spz_to_ply`, and writes the expected JSON. Example: `node scripts/splat/generate-spz-fixtures.mjs --tools "C:\Users\james\Videos\spz-ref\build"`. The reference tools come from a clone at `C:\Users\james\Videos\spz-ref` (not tracked; about 62 MB).

## Verification status

| Gate | Status |
|---|---|
| SPZ-01 SH degrees 0–4, RGB order | Passes against official decode (3-point files) |
| SPZ-02 v4 header, TOC, little-endian | Passes on official files |
| SPZ-03 fail-closed cases | Passes (synthetic malformed inputs) |
| SPZ-04 real ZSTD frames | Passes on official frames (small files) |
| SPZ-05 official-encoder match | Partial: 3-point files only, larger files open |
| SPZ-06 bounded worker decode | Partial: 64 MiB compressed-input cap before hashing/decode; existing point/window limits; Vite worker factory and transferable-buffer client; fake-worker parity tests cover official SH 0–4 fixtures. No real browser Worker or peak-memory measurement yet. |
| SPZ-07 source admission | Partial: `GET /api/evidence/[id]/spz-source` checks owner/assigned-attorney case access before evidence lookup, reads only the canonical evidence bucket/key under a 64 MiB cap, verifies the stored SHA-256, and parses SPZ v4 with a 1.1M point cap. It reports `SOURCE_VERIFIED` only. Derived-scene manifest membership and source-to-derived lineage remain open. The pure helper's caller-supplied authorization boolean is still test-only and is not the production authority. |
| SPZ-08 browser loading, rendering, disposal | Partial: synthetic browser proof exists for worker decode, Three.js `GaussianSplat`, sampling controls and disposal on Chromium WebGL2 fallback. The case-linked `EvidenceSpzViewer` verifies authorized source bytes and hash, then supports case-scoped marker create/move/soft-delete bound to a hash-qualified scene key. Focused route tests and scoped Svelte check pass; scratch database transaction and case-asset browser proofs have not run. Immutable scene-manifest admission, calibrated coordinates, WebGPU hardware rendering, streamed SPZ LOD, device-loss recovery and performance remain unverified. |

Type check: `svelte-check` on this folder reports 0 errors. Its 3 warnings are in `SnesBookLoader.svelte`, outside this folder.

## Run

```bash
cd sveltekit-frontend
npx vitest run src/lib/splat/
```

## Known limits

- `fzstd` cannot decode windows over 2^25 bytes. The loader rejects them rather than decoding them incorrectly.
- Not checked on large files, degree 4 with many points, or real-world scenes.
- Only RUB output. Coordinate conversions are not implemented.
- The `samples/*.spz` files in the reference repo are legacy gzip (v1–3) and are rejected by design.

## Next

1. Larger official-encoder fixtures and measured memory limits (SPZ-05/06).
2. Add the server-owned source/evidence admission path before treating a scene as verified (SPZ-07).
3. Browser proof: real Worker, load, render, dispose, and hash readback (SPZ-08).
4. Decide whether a native `spz_bridge.node` is needed, based on file sizes.
