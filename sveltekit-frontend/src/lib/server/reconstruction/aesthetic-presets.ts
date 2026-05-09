/**
 * aesthetic-presets.ts
 *
 * Render parameter table for the three SceneIntent aesthetic presets:
 *   ps1    — sharp pixelation, vertex jitter, affine texture warp, 16-bit palette
 *   n64    — softer pixelation, mild bilinear, brighter palette, slight CRT bow
 *   modern-low-poly — clean lambert/toon, no jitter, full filtering, dim CRT
 *
 * Read by:
 *   - the WebGPU canvas (uniform buffer for ps1-postprocess.wgsl)
 *   - the Blender Python preamble (scripts/reconstruction/ps1-blender-preamble.py)
 *   - any future render worker that needs deterministic visual parameters
 *
 * Does NOT modify scene-compiler.ts — preserves the byte-identical Phase 0B
 * hash (2240019055...). The compiler still emits aesthetic-agnostic Blender
 * Python; the preamble + post-process are applied on top per render request.
 *
 * The preset config IS deterministic (frozen as `as const`) so two scenes
 * tagged `aesthetic: 'ps1'` produce the same render-time parameters every
 * run — load-bearing for legal/audit reproducibility.
 */
import { z } from 'zod';
import {
  AESTHETIC_PRESETS,
  type SceneIntent,
} from './crime-scene-schema.js';

// ─── Zod schema (so consumers can validate config from disk if they want) ─

export const AestheticPresetSchema = z.object({
  /** Aesthetic key — must match SceneIntent.aesthetic. */
  preset: z.enum(AESTHETIC_PRESETS),

  /** Internal render resolution (low for ps1, midline for n64). The scene is
   *  rendered at this resolution and then nearest-upscaled to display size,
   *  which is what produces the chunky-pixel look. */
  internal_resolution: z.tuple([z.number().int().positive(), z.number().int().positive()]),

  /** 'nearest' for chunky PS1, 'linear' for blurrier N64, 'mipmap-linear' for modern. */
  texture_filter: z.enum(['nearest', 'linear', 'mipmap-linear']),

  /** Vertex jitter intensity (snap world-space-projected vertex coords to an
   *  integer grid in clip space). 0.0 = none. PS1 hardware was ~0.4. */
  vertex_jitter: z.number().min(0).max(1),

  /** Disable perspective-correct texture mapping → affine warp (PS1 hallmark).
   *  WebGPU emulates by interpolating UV linearly in clip space. */
  affine_texture_warp: z.boolean(),

  /** Palette quantization — bit-depth per channel. 8 = 256 levels (modern),
   *  5 = 32 levels (PS1-like banding), 4 = 16 levels (heavy banding). */
  palette_bits_per_channel: z.number().int().min(1).max(8),

  /** Whether to apply the existing CRT post-process (scanlines + barrel). */
  crt_postprocess: z.boolean(),

  /** CRT post-process intensities — only consulted when crt_postprocess=true. */
  crt: z.object({
    scanline_intensity:    z.number().min(0).max(1),
    curvature:             z.number().min(0).max(0.5),
    vignette_strength:     z.number().min(0).max(1),
    chromatic_aberration:  z.number().min(0).max(0.01),
    noise_amount:          z.number().min(0).max(0.2),
  }),

  /** Blender render settings — consumed by the Python preamble. */
  blender: z.object({
    /** Output resolution (often higher than internal_resolution; we render
     *  internal_resolution and Blender compositor upscales with a Pixelate
     *  node so the upload is roughly the displayed size). */
    output_resolution: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    fps:               z.number().int().positive(),
    samples:           z.number().int().positive(),     // Cycles samples — keep small for PS1, model is forgiving
    use_eevee:         z.boolean(),                     // EEVEE is fine for stylized output
    pixelate_node:     z.boolean(),                     // Add a Pixelate compositor node
    color_management:  z.enum(['Standard', 'Filmic', 'Raw']),
  }),
});
export type AestheticPreset = z.infer<typeof AestheticPresetSchema>;

// ─── The three frozen presets ──────────────────────────────────────────────

export const AESTHETIC_PRESET_TABLE: Readonly<Record<typeof AESTHETIC_PRESETS[number], AestheticPreset>> = Object.freeze({
  ps1: {
    preset:                   'ps1',
    internal_resolution:      [320, 240],
    texture_filter:           'nearest',
    vertex_jitter:            0.4,
    affine_texture_warp:      true,
    palette_bits_per_channel: 5,
    crt_postprocess:          true,
    crt: {
      scanline_intensity:   0.45,
      curvature:            0.10,
      vignette_strength:    0.45,
      chromatic_aberration: 0.0025,
      noise_amount:         0.06,
    },
    blender: {
      output_resolution: [640, 480],
      fps:               24,
      samples:           32,
      use_eevee:         true,
      pixelate_node:     true,
      color_management:  'Standard',
    },
  },
  n64: {
    preset:                   'n64',
    internal_resolution:      [640, 480],
    texture_filter:           'linear',
    vertex_jitter:            0.10,
    affine_texture_warp:      false,
    palette_bits_per_channel: 6,
    crt_postprocess:          true,
    crt: {
      scanline_intensity:   0.30,
      curvature:            0.12,
      vignette_strength:    0.35,
      chromatic_aberration: 0.0015,
      noise_amount:         0.04,
    },
    blender: {
      output_resolution: [960, 720],
      fps:               30,
      samples:           48,
      use_eevee:         true,
      pixelate_node:     true,
      color_management:  'Standard',
    },
  },
  'modern-low-poly': {
    preset:                   'modern-low-poly',
    internal_resolution:      [1280, 720],
    texture_filter:           'mipmap-linear',
    vertex_jitter:            0.0,
    affine_texture_warp:      false,
    palette_bits_per_channel: 8,
    crt_postprocess:          false,
    crt: {
      scanline_intensity:   0.0,
      curvature:            0.0,
      vignette_strength:    0.15,
      chromatic_aberration: 0.0,
      noise_amount:         0.0,
    },
    blender: {
      output_resolution: [1920, 1080],
      fps:               30,
      samples:           64,
      use_eevee:         false,
      pixelate_node:     false,
      color_management:  'Filmic',
    },
  },
});

/** Return the preset for a SceneIntent, defaulting to 'ps1' if the field is
 *  somehow missing (Zod normally forbids that, but defensive). */
export function presetForSceneIntent(intent: SceneIntent): AestheticPreset {
  const key = intent.aesthetic ?? 'ps1';
  return AESTHETIC_PRESET_TABLE[key];
}

/** Convenience: look up by string key (e.g. CLI arg). Throws on unknown. */
export function presetByName(name: string): AestheticPreset {
  if (!(name in AESTHETIC_PRESET_TABLE)) {
    throw new Error(
      `Unknown aesthetic preset '${name}'. Allowed: ${Object.keys(AESTHETIC_PRESET_TABLE).join(', ')}`,
    );
  }
  return AESTHETIC_PRESET_TABLE[name as keyof typeof AESTHETIC_PRESET_TABLE];
}

/** Pack the WebGPU-relevant fields into a flat float buffer the canvas can
 *  upload as a uniform. Fixed layout — versioned by the array length. */
export function presetToUniformBuffer(p: AestheticPreset): Float32Array {
  return new Float32Array([
    p.internal_resolution[0],
    p.internal_resolution[1],
    p.vertex_jitter,
    p.affine_texture_warp ? 1.0 : 0.0,
    p.palette_bits_per_channel,
    p.crt_postprocess ? 1.0 : 0.0,
    p.crt.scanline_intensity,
    p.crt.curvature,
    p.crt.vignette_strength,
    p.crt.chromatic_aberration,
    p.crt.noise_amount,
    // Padding to vec4 boundary for std140-friendly upload.
    0.0,
  ]);
}
