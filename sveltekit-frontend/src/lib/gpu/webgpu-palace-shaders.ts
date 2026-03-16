/**
 * WebGPU Memory Palace - WGSL Shaders
 * Rendering and compute shaders for 3D visualization
 */

/**
 * Room rendering vertex shader
 * Transforms room positions to clip space with perspective
 */
export const ROOM_VERTEX_WGSL = /* wgsl */ `
struct Uniforms {
  viewProjection: mat4x4<f32>,
  cameraPosition: vec3<f32>,
  _pad: f32,
}

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) roomPosition: vec3<f32>,
  @location(2) roomSize: vec3<f32>,
  @location(3) roomColor: vec4<f32>,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) color: vec4<f32>,
  @location(2) normal: vec3<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vertex_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;

  // Scale and position the room (cube)
  let worldPos = in.position * in.roomSize + in.roomPosition;
  out.clipPosition = uniforms.viewProjection * vec4<f32>(worldPos, 1.0);
  out.worldPosition = worldPos;
  out.color = in.roomColor;

  // Simple cube normal (normalized position vector)
  out.normal = normalize(in.position);

  return out;
}
`;

/**
 * Room rendering fragment shader
 * Applies simple directional lighting
 */
export const ROOM_FRAGMENT_WGSL = /* wgsl */ `
struct FragmentInput {
  @location(0) worldPosition: vec3<f32>,
  @location(1) color: vec4<f32>,
  @location(2) normal: vec3<f32>,
}

@fragment
fn fragment_main(in: FragmentInput) -> @location(0) vec4<f32> {
  // Directional light from top-right
  let lightDir = normalize(vec3<f32>(0.7, 1.0, 0.5));
  let ambient = 0.3;
  let diffuse = max(dot(in.normal, lightDir), 0.0);
  let lighting = ambient + diffuse * 0.7;

  return vec4<f32>(in.color.rgb * lighting, in.color.a);
}
`;

/**
 * Force-directed layout compute shader
 * Applies spring forces (attraction) + repulsion forces
 *
 * Workgroup size 64 (optimized for RTX 3060 Ti)
 */
export const FORCE_LAYOUT_WGSL = /* wgsl */ `
struct Room {
  position: vec3<f32>,
  velocity: vec3<f32>,
  mass: f32,
  _pad: f32,
}

struct Params {
  roomCount: u32,
  springConstant: f32,
  repulsionConstant: f32,
  damping: f32,
  deltaTime: f32,
  _pad: array<u32, 3>,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> rooms: array<Room>;
@group(0) @binding(2) var<storage, read> edges: array<vec2<u32>>;
@group(0) @binding(3) var<uniform> edgeCount: u32;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.roomCount) { return; }

  var force = vec3<f32>(0.0, 0.0, 0.0);
  let pos = rooms[idx].position;

  // Repulsion from all other rooms (inverse square law)
  for (var i: u32 = 0u; i < params.roomCount; i++) {
    if (i == idx) { continue; }

    let diff = pos - rooms[i].position;
    let dist = length(diff);
    if (dist > 0.1) {
      let repulsion = params.repulsionConstant / (dist * dist);
      force += normalize(diff) * repulsion;
    }
  }

  // Spring attraction for connected rooms (Hooke's law)
  for (var i: u32 = 0u; i < edgeCount; i++) {
    let edge = edges[i];
    if (edge.x == idx) {
      let diff = rooms[edge.y].position - pos;
      let dist = length(diff);
      let spring = params.springConstant * dist;
      force += normalize(diff) * spring;
    } else if (edge.y == idx) {
      let diff = rooms[edge.x].position - pos;
      let dist = length(diff);
      let spring = params.springConstant * dist;
      force += normalize(diff) * spring;
    }
  }

  // Update velocity with damping
  rooms[idx].velocity = rooms[idx].velocity * params.damping + force * params.deltaTime;

  // Update position
  rooms[idx].position = pos + rooms[idx].velocity * params.deltaTime;
}
`;
