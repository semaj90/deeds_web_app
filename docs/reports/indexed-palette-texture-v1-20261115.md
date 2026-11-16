# Indexed 4-bit texture palette reference — 2026-11-15

## Scope

Added the distinct 16-entry color table shown in the supplied screenshot, along with a bounded CPU codec for turning RGBA pixels into 4-bit palette indices and reconstructing RGBA pixels for a texture preview.

## Contract

- Module: `sveltekit-frontend/src/lib/splat/indexed-palette-texture-v1.ts`.
- Palette revision: `atlas-indexed-palette16-v1`; entry `0` is transparent and entries `1..15` are opaque render colors.
- Quantization: deterministic weighted RGB nearest-color selection; equal distances keep the lowest palette index.
- Packing: row-major, even pixel in low nibble, odd pixel in high nibble; 2 pixels per byte.
- Bounds: dimensions must be positive safe integers, exact RGBA byte length is required, and image size is capped at 4,194,304 pixels. The helper does not resize.
- Decoder validates revision, dimensions, pixel count, and packed byte count before producing a new RGBA array.
- The SPZ renderer's Primitive guide displays the 16 palette entries and format boundaries.
- The pre-case image-relief view has an on-demand local preview toggle. It quantizes the already-downscaled source canvas, expands the palette indices back to RGBA for a `CanvasTexture`, and can restore the original source texture. The source file bytes remain unchanged. If the user exports while the preview is selected, the GLB contains the expanded RGBA preview image, not the compact nibble buffer.

## Status

- **CREATED:** palette table, bounded quantizer, nibble packer, and decoder.
- **WIRED:** palette visualization and local image-relief preview use the codec. It is a reversible browser preview only; the packed 4-bit buffer is not persisted.
- **PROVEN:** no tests, Svelte check, browser preview, quantized artifact write, or readback were run. Static source review only.
- **DONE:** no. Durable derivative storage still needs a source-bound artifact manifest, output hash, and the existing derived-artifact owner. Original evidence remains unchanged.

## Separation

This is a pixel/texture palette. It is distinct from the scene material LUT, the NES/domain-routing LUT, camera-depth ordering, semantic embedding quantization, and the immutable source image.
