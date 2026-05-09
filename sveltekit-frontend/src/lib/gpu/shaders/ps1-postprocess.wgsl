// ═══════════════════════════════════════════════════════════════════════════
// PS1 / N64 / modern-low-poly post-process — WGSL fragment pass
//
// Companion to `crt-postprocess.wgsl`. Applies the three "low-poly retro"
// effects that aren't already covered by the CRT shader:
//
//   1. Pixelation        — render at internal_resolution, nearest-upscale
//   2. Affine UV warp    — emulate PS1's no-perspective texture mapping
//   3. Palette quantize  — bit-depth reduction per channel (PS1 banding)
//
// Composes with `crt-postprocess.wgsl` — pipeline order is:
//   scene → ps1-postprocess (this file) → crt-postprocess → swap-chain
//
// Vertex jitter is NOT a post-process effect — it has to be applied in the
// vertex shader of the scene pass. This file does NOT do vertex jitter.
// See: `crime-scene.wgsl` vertex shaders for where to inject it (the
// preset's vertex_jitter param goes into the OBJ mesh vertex shader as a
// uniform; quantize gl_Position to integer pixels in clip space).
//
// All parameters come from the AestheticPreset uniform buffer packed by
// `presetToUniformBuffer()` in aesthetic-presets.ts. Fixed std140 layout:
//   vec2  internal_resolution    (slot 0,1)
//   float vertex_jitter          (slot 2)   — read by scene pass, not here
//   float affine_warp_enable     (slot 3)   — 1.0 = PS1, 0.0 = modern
//   float palette_bits           (slot 4)   — 8 = none, 5 = PS1
//   float crt_enable             (slot 5)   — 1.0 = chain CRT pass after
//   float scanline_intensity     (slot 6)   — read by CRT pass, not here
//   float curvature              (slot 7)   — read by CRT pass, not here
//   float vignette_strength      (slot 8)   — read by CRT pass, not here
//   float chromatic_aberration   (slot 9)   — read by CRT pass, not here
//   float noise_amount           (slot 10)  — read by CRT pass, not here
//   float _pad                   (slot 11)  — reserved
// ═══════════════════════════════════════════════════════════════════════════

struct AestheticPreset {
  internal_resolution:    vec2<f32>,
  vertex_jitter:          f32,
  affine_warp_enable:     f32,
  palette_bits:           f32,
  crt_enable:             f32,
  scanline_intensity:     f32,
  curvature:              f32,
  vignette_strength:      f32,
  chromatic_aberration:   f32,
  noise_amount:           f32,
  _pad:                   f32,
}

@group(0) @binding(0) var<uniform> preset:        AestheticPreset;
@group(0) @binding(1) var           scene_tex:    texture_2d<f32>;
@group(0) @binding(2) var           scene_smp:    sampler;

struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0)       uv:  vec2<f32>,
}

// Full-screen triangle vertex shader — matches the CRT shader's expectation.
@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VOut {
  // 3-vertex full-screen triangle, no buffer needed.
  let xs = array<f32, 3>(-1.0, 3.0, -1.0);
  let ys = array<f32, 3>(-1.0, -1.0, 3.0);
  let us = array<f32, 3>( 0.0, 2.0,  0.0);
  let vs = array<f32, 3>( 0.0, 0.0,  2.0);
  var out: VOut;
  out.pos = vec4<f32>(xs[vid], ys[vid], 0.0, 1.0);
  out.uv  = vec2<f32>(us[vid], vs[vid]);
  return out;
}

// Snap the UV to the internal_resolution grid → chunky pixelation.
fn pixelate_uv(uv: vec2<f32>, internal: vec2<f32>) -> vec2<f32> {
  let scaled = uv * internal;
  let snapped = floor(scaled);
  return (snapped + vec2<f32>(0.5, 0.5)) / internal;
}

// Quantize each colour channel to N levels (bit-depth reduction).
// bits = 8 → 256 levels (no change); bits = 5 → 32 levels (PS1 banding).
fn palette_quantize(color: vec3<f32>, bits: f32) -> vec3<f32> {
  let levels = pow(2.0, bits) - 1.0;
  return floor(color * levels + 0.5) / levels;
}

// Cheap affine-UV approximation: shift UVs slightly along the steepest
// derivative of the screen position. The real PS1 wobble lives in the
// vertex pipeline (no perspective correction on UVs), but this fragment
// pass produces a comparable visual when pixelation is also active.
// When affine_warp_enable < 0.5 this is a no-op.
fn affine_jitter(uv: vec2<f32>, enable: f32) -> vec2<f32> {
  let dx = dpdx(uv);
  let dy = dpdy(uv);
  let amount = 0.0035 * enable;
  return uv + amount * (dx + dy);
}

@fragment
fn fs_main(in: VOut) -> @location(0) vec4<f32> {
  // 1. Apply affine-warp-style jitter first so it interacts with pixelation.
  let warped_uv = affine_jitter(in.uv, preset.affine_warp_enable);

  // 2. Snap UV to the chunky internal grid.
  let pixel_uv = pixelate_uv(warped_uv, preset.internal_resolution);

  // 3. Sample with whatever filter the calling code bound to scene_smp;
  //    for ps1/n64 the binding should be a NEAREST sampler, for
  //    modern-low-poly a MIPMAP-LINEAR sampler.
  let base = textureSample(scene_tex, scene_smp, pixel_uv);

  // 4. Palette quantization.
  let quantized = palette_quantize(base.rgb, preset.palette_bits);

  return vec4<f32>(quantized, base.a);
}
