// ═══════════════════════════════════════════════════════════════════════════
// Evidence Board Particle System — WGSL Compute + Render Shaders
// NES-inspired ambient particles for the detective evidence board
//
// Architecture: Compute shader updates positions → Vertex/Fragment renders
// Targets RTX 3060 Ti: 256-wide workgroups (8 warps × 32 threads)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Shared Types ─────────────────────────────────────────────────────────

struct Particle {
  pos: vec2<f32>,      // screen position (0..1 normalized)
  vel: vec2<f32>,      // velocity
  life: f32,           // 0.0 = dead, 1.0 = fresh
  max_life: f32,       // original lifetime
  size: f32,           // pixel radius
  kind: u32,           // 0=dust, 1=spark, 2=connection-glow, 3=highlight
}

struct SimParams {
  delta_time: f32,
  time: f32,
  particle_count: u32,
  gravity: f32,
  wind_x: f32,
  wind_y: f32,
  damping: f32,
  turbulence: f32,
  // Evidence board interaction
  mouse_x: f32,
  mouse_y: f32,
  mouse_active: u32,   // 1 if dragging evidence
  board_zoom: f32,
}

// ─── Compute Shader: Particle Update ──────────────────────────────────────

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> sim: SimParams;

// Simple hash for pseudo-random (no texture sampling needed)
fn hash(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453123);
}

fn hash2(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(
    fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453),
    fract(sin(dot(p, vec2<f32>(269.5, 183.3))) * 43758.5453)
  );
}

@compute @workgroup_size(256)
fn update_particles(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= sim.particle_count) { return; }

  var p = particles[idx];

  // Decrease life
  p.life -= sim.delta_time / p.max_life;

  if (p.life <= 0.0) {
    // Respawn — use index + time for deterministic randomness
    let seed = f32(idx) + sim.time * 7.31;
    let h = hash2(vec2<f32>(seed, seed * 0.7));

    p.pos = vec2<f32>(h.x, h.y);
    p.vel = vec2<f32>(
      (hash(seed + 1.0) - 0.5) * 0.02,
      (hash(seed + 2.0) - 0.5) * 0.02
    );
    p.life = 1.0;
    p.max_life = 3.0 + hash(seed + 3.0) * 7.0; // 3-10 seconds
    p.size = 1.0 + hash(seed + 4.0) * 3.0;       // 1-4 px
    p.kind = u32(hash(seed + 5.0) * 4.0);         // 0-3
  } else {
    // Physics update
    let wind = vec2<f32>(sim.wind_x, sim.wind_y);

    // Turbulence — low-frequency noise via sine waves
    let turb = vec2<f32>(
      sin(p.pos.y * 6.28 + sim.time * 0.5) * sim.turbulence,
      cos(p.pos.x * 6.28 + sim.time * 0.3) * sim.turbulence
    );

    p.vel += (wind + turb) * sim.delta_time;
    p.vel.y += sim.gravity * sim.delta_time;
    p.vel *= sim.damping;

    // Mouse repulsion (when dragging evidence)
    if (sim.mouse_active == 1u) {
      let to_mouse = p.pos - vec2<f32>(sim.mouse_x, sim.mouse_y);
      let dist = length(to_mouse);
      if (dist < 0.15 && dist > 0.001) {
        let repel = normalize(to_mouse) * (0.15 - dist) * 2.0 * sim.delta_time;
        p.vel += repel;
      }
    }

    p.pos += p.vel * sim.delta_time;

    // Wrap around edges
    p.pos = fract(p.pos + vec2<f32>(1.0, 1.0));
  }

  particles[idx] = p;
}

// ─── Vertex Shader: Billboard Quads ───────────────────────────────────────

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) life: f32,
  @location(2) kind: f32,
  @location(3) size: f32,
}

struct RenderParams {
  viewport: vec2<f32>,   // canvas width, height
  board_offset: vec2<f32>, // pan offset
  zoom: f32,
  time: f32,
  _pad: vec2<f32>,
}

@group(0) @binding(0) var<storage, read> render_particles: array<Particle>;
@group(0) @binding(1) var<uniform> render: RenderParams;

// Each particle is a quad (2 triangles, 6 vertices)
// vertex_index 0-5 maps to quad corners
@vertex
fn vs_main(
  @builtin(vertex_index) vid: u32,
  @builtin(instance_index) iid: u32,
) -> VertexOutput {
  var out: VertexOutput;

  let p = render_particles[iid];

  // Quad vertex positions (2 triangles)
  var corner: vec2<f32>;
  switch (vid % 6u) {
    case 0u: { corner = vec2<f32>(-1.0, -1.0); }
    case 1u: { corner = vec2<f32>( 1.0, -1.0); }
    case 2u: { corner = vec2<f32>(-1.0,  1.0); }
    case 3u: { corner = vec2<f32>( 1.0, -1.0); }
    case 4u: { corner = vec2<f32>( 1.0,  1.0); }
    case 5u: { corner = vec2<f32>(-1.0,  1.0); }
    default: { corner = vec2<f32>(0.0, 0.0); }
  }

  // Scale by particle size (in pixels → NDC)
  let pixel_size = p.size / render.viewport;
  let world_pos = p.pos * 2.0 - 1.0; // 0..1 → -1..1 NDC

  out.position = vec4<f32>(
    world_pos + corner * pixel_size * 4.0,
    0.0,
    1.0
  );
  out.uv = corner * 0.5 + 0.5;
  out.life = p.life;
  out.kind = f32(p.kind);
  out.size = p.size;

  return out;
}

// ─── Fragment Shader: Particle Rendering ──────────────────────────────────

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Circular particle with soft edge
  let dist = length(in.uv - vec2<f32>(0.5, 0.5)) * 2.0;
  if (dist > 1.0) { discard; }

  let soft_edge = 1.0 - smoothstep(0.6, 1.0, dist);
  let fade = in.life * soft_edge;

  // Color by particle kind
  var color: vec3<f32>;
  let kind = u32(in.kind);

  switch (kind) {
    // Dust — warm amber (NES palette)
    case 0u: { color = vec3<f32>(0.96, 0.82, 0.55); }
    // Spark — electric cyan
    case 1u: { color = vec3<f32>(0.2, 0.9, 0.95); }
    // Connection glow — evidence red
    case 2u: { color = vec3<f32>(0.95, 0.3, 0.3); }
    // Highlight — legal gold
    case 3u: { color = vec3<f32>(1.0, 0.85, 0.3); }
    default: { color = vec3<f32>(0.8, 0.8, 0.8); }
  }

  // Pulsing glow for sparks
  if (kind == 1u) {
    let pulse = sin(in.life * 12.56) * 0.3 + 0.7;
    color *= pulse;
  }

  return vec4<f32>(color, fade * 0.6);
}
