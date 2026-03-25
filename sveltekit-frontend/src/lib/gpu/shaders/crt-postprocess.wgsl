// ═══════════════════════════════════════════════════════════════════════════
// CRT Post-Process Shader — NES/Retro Detective Board Aesthetic
//
// Full-screen quad fragment shader with:
//   - Scanlines (authentic NTSC 240p look)
//   - CRT barrel distortion (curved screen)
//   - Phosphor glow (RGB subpixel simulation)
//   - Vignette (darker corners)
//   - Chromatic aberration (slight RGB offset)
//   - Static noise overlay (investigation atmosphere)
//   - Screen flicker (subtle)
//
// Wired as a post-process pass on the evidence board canvas.
// ═══════════════════════════════════════════════════════════════════════════

struct CRTParams {
  resolution: vec2<f32>,    // canvas pixel dimensions
  time: f32,
  scanline_intensity: f32,  // 0.0 = off, 1.0 = full retro
  curvature: f32,           // barrel distortion strength (0.0-0.5)
  vignette_strength: f32,   // 0.0-1.0
  noise_intensity: f32,     // static noise
  chromatic_aberration: f32, // RGB offset in pixels
  glow_strength: f32,       // phosphor glow
  flicker: f32,             // screen flicker amount
  brightness: f32,          // overall brightness multiplier
  _pad: f32,
}

@group(0) @binding(0) var scene_texture: texture_2d<f32>;
@group(0) @binding(1) var scene_sampler: sampler;
@group(0) @binding(2) var<uniform> crt: CRTParams;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

// Full-screen triangle (3 vertices, no vertex buffer needed)
@vertex
fn vs_fullscreen(@builtin(vertex_index) vid: u32) -> VertexOutput {
  var out: VertexOutput;
  // Oversized triangle that covers the entire screen
  let x = f32(i32(vid & 1u)) * 4.0 - 1.0;
  let y = f32(i32(vid >> 1u)) * 4.0 - 1.0;
  out.position = vec4<f32>(x, y, 0.0, 1.0);
  out.uv = vec2<f32>(x * 0.5 + 0.5, 1.0 - (y * 0.5 + 0.5));
  return out;
}

// ─── Utility Functions ────────────────────────────────────────────────────

fn hash_noise(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

// CRT barrel distortion
fn barrel_distort(uv: vec2<f32>, amount: f32) -> vec2<f32> {
  let centered = uv * 2.0 - 1.0;
  let r2 = dot(centered, centered);
  let distorted = centered * (1.0 + amount * r2);
  return distorted * 0.5 + 0.5;
}

// ─── Fragment Shader ──────────────────────────────────────────────────────

@fragment
fn fs_crt(in: VertexOutput) -> @location(0) vec4<f32> {
  let uv = in.uv;

  // 1. Barrel distortion (curved CRT screen)
  let curved_uv = barrel_distort(uv, crt.curvature);

  // Discard pixels outside the curved screen
  if (curved_uv.x < 0.0 || curved_uv.x > 1.0 ||
      curved_uv.y < 0.0 || curved_uv.y > 1.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  // 2. Chromatic aberration (RGB channel offset)
  let ca_offset = crt.chromatic_aberration / crt.resolution.x;
  let r = textureSample(scene_texture, scene_sampler,
    curved_uv + vec2<f32>(ca_offset, 0.0)).r;
  let g = textureSample(scene_texture, scene_sampler, curved_uv).g;
  let b = textureSample(scene_texture, scene_sampler,
    curved_uv - vec2<f32>(ca_offset, 0.0)).b;
  var color = vec3<f32>(r, g, b);

  // 3. Phosphor glow (RGB subpixel pattern)
  let pixel_y = curved_uv.y * crt.resolution.y;
  let subpixel = u32(curved_uv.x * crt.resolution.x * 3.0) % 3u;
  var phosphor = vec3<f32>(0.8, 0.8, 0.8);
  if (crt.glow_strength > 0.0) {
    switch (subpixel) {
      case 0u: { phosphor = vec3<f32>(1.0, 0.7, 0.7); }
      case 1u: { phosphor = vec3<f32>(0.7, 1.0, 0.7); }
      case 2u: { phosphor = vec3<f32>(0.7, 0.7, 1.0); }
      default: { phosphor = vec3<f32>(0.8, 0.8, 0.8); }
    }
    color = mix(color, color * phosphor, crt.glow_strength);
  }

  // 4. Scanlines (NTSC 240p authentic)
  let scanline_y = floor(pixel_y);
  let scanline = sin(scanline_y * 3.14159) * 0.5 + 0.5;
  let scanline_dark = 1.0 - crt.scanline_intensity * (1.0 - scanline) * 0.4;
  color *= scanline_dark;

  // 5. Vignette (darker corners — CRT phosphor falloff)
  let vig_uv = uv * 2.0 - 1.0;
  let vig_dist = dot(vig_uv, vig_uv);
  let vignette = 1.0 - vig_dist * crt.vignette_strength;
  color *= clamp(vignette, 0.3, 1.0);

  // 6. Static noise (investigation atmosphere)
  let noise_seed = vec2<f32>(
    curved_uv.x * crt.resolution.x + crt.time * 100.0,
    curved_uv.y * crt.resolution.y + crt.time * 73.0
  );
  let noise = hash_noise(noise_seed);
  color += (noise - 0.5) * crt.noise_intensity * 0.1;

  // 7. Screen flicker (subtle CRT power fluctuation)
  let flicker = 1.0 - crt.flicker * sin(crt.time * 8.0) * 0.02;
  color *= flicker;

  // 8. Brightness
  color *= crt.brightness;

  // Clamp final output
  color = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));

  return vec4<f32>(color, 1.0);
}