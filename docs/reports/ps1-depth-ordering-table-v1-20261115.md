# PS1-style depth ordering table reference — 2026-11-15

## Scope

Added the small deterministic render-reference structure proposed in the supplied Parent Atlas architecture note. It borrows the PS1 ordering-table scheduling idea; it does not emulate PS1 DMA, GP0 packets, or rasterization.

## Implementation

- Added `sveltekit-frontend/src/lib/spatial/depth-ordering-table-v1.ts`.
- Uses the existing `TRANSFORM_CAPACITY` (256) and allocates fixed typed-array storage for 64 bucket heads/tails, 256 `next` links, a 256-slot output permutation, and a 64-bin occupancy bitset.
- Input contract: exactly 256 `Float32` camera-forward distances and an 8-word `Uint32Array` mask using LSB0 slot bits. Near/far distances are explicit and finite. Active non-finite depths fail closed; behind-camera and out-of-range slots are omitted.
- Output order is far-to-near; ties in a bucket keep slot order. Returned indices are temporary render references and do not mutate scene nodes, transforms, source IDs, or evidence records.
- The existing `sceneFsmCache` owns the transform arena, but no canonical active/visibility mask owner was found. The ordering helper therefore receives a caller-provided mask and does not invent one.

## Status

- **CREATED:** bounded TypeScript ordering-table helper.
- **WIRED:** not wired to a live Three.js transparent pass or a visibility-mask producer.
- **PROVEN:** no unit tests, typecheck, benchmark, or browser render was run. Only source review was performed.
- **DONE:** no. Stable-sort reference comparison, boundary/bitset tests, transparent pass integration, and performance measurements remain open. Normal opaque rendering should continue using Three.js depth testing.

## Boundaries

The screenshot's 16-entry indexed-color table is a texture/pixel palette concept. It is distinct from this camera-depth ordering table and from Parent Atlas's routing taxonomy LUT. No indexed-texture quantizer or PS1 framebuffer emulation was added here.
