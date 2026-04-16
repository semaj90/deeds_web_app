// ═══════════════════════════════════════════════════════════════════════════
// Crime Scene 3D Reconstruction — WGSL Shaders
// Renders: point clouds (depth), OBJ meshes, video frame texture
//
// RTX 3060 Ti target: 256-wide compute workgroups (8 warps × 32 threads)
// Coordinate system: right-handed, +Y up, -Z into screen
// ═══════════════════════════════════════════════════════════════════════════


// ─── Shared Camera Uniform ────────────────────────────────────────────────

struct Camera {
  view_proj:  mat4x4<f32>,  // view × projection (pre-multiplied)
  view:       mat4x4<f32>,  // view matrix (for normal transform)
  position:   vec4<f32>,    // world-space eye position
  near:       f32,
  far:        f32,
  point_size: f32,          // pixel size for point cloud
  time:       f32,          // elapsed seconds (animation)
}


// ─── PASS 1: Point Cloud ──────────────────────────────────────────────────
// Renders depth-reconstructed points as GPU-instanced billboard discs.
// Each point: position (xyz) + color (rgb packed as u32).

struct Point {
  position: vec3<f32>,
  _pad:     f32,
  color:    vec4<f32>,   // r,g,b,confidence
}

@group(0) @binding(0) var<uniform>          cam:    Camera;
@group(0) @binding(1) var<storage, read>    points: array<Point>;

struct PtVOut {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0)       color:    vec4<f32>,
  @location(1)       uv:       vec2<f32>,
  @location(2)       depth:    f32,
}

// Billboard quad: 6 vertices per point (2 triangles)
@vertex
fn vs_pointcloud(
  @builtin(vertex_index)   vid: u32,
  @builtin(instance_index) iid: u32,
) -> PtVOut {
  var out: PtVOut;
  let p = points[iid];

  // Corner offsets in clip space (screen-aligned billboard)
  var corner: vec2<f32>;
  switch (vid % 6u) {
    case 0u: { corner = vec2(-1.0, -1.0); }
    case 1u: { corner = vec2( 1.0, -1.0); }
    case 2u: { corner = vec2(-1.0,  1.0); }
    case 3u: { corner = vec2( 1.0, -1.0); }
    case 4u: { corner = vec2( 1.0,  1.0); }
    case 5u: { corner = vec2(-1.0,  1.0); }
    default: { corner = vec2( 0.0,  0.0); }
  }

  let clip      = cam.view_proj * vec4(p.position, 1.0);
  let w         = max(clip.w, 0.0001);
  // Pixel-size billboard offset in NDC
  let px_offset = corner * (cam.point_size / 1024.0) * w;

  out.clip_pos = vec4(clip.xy + px_offset, clip.zw);
  out.color    = p.color;
  out.uv       = corner * 0.5 + 0.5;
  out.depth    = clip.z / w;

  return out;
}

@fragment
fn fs_pointcloud(in: PtVOut) -> @location(0) vec4<f32> {
  // Circular disc with soft edge (discard corners of billboard quad)
  let dist = length(in.uv - 0.5) * 2.0;
  if (dist > 1.0) { discard; }

  let alpha = in.color.a * (1.0 - smoothstep(0.5, 1.0, dist));

  // Depth-based fog: points farther away fade slightly
  let fog = 1.0 - saturate((in.depth - 0.95) * 20.0);

  return vec4(in.color.rgb * fog, alpha);
}


// ─── PASS 2: OBJ Mesh ────────────────────────────────────────────────────
// Phong-lit triangulated mesh. Vertex buffer: pos(xyz) + normal(xyz) + uv(xy).

struct MeshUniform {
  model:          mat4x4<f32>,
  normal_mat:     mat4x4<f32>,  // transpose(inverse(model))
  base_color:     vec4<f32>,
  light_dir:      vec4<f32>,    // world-space directional light (normalized)
  ambient:        f32,
  diffuse:        f32,
  specular:       f32,
  shininess:      f32,
  // Animation
  anim_translate: vec4<f32>,    // applied on top of model matrix each frame
  anim_rotate_y:  f32,          // radians
  _pad:           vec3<f32>,
}

struct MeshVIn {
  @location(0) position: vec3<f32>,
  @location(1) normal:   vec3<f32>,
  @location(2) uv:       vec2<f32>,
}

struct MeshVOut {
  @builtin(position) clip_pos:    vec4<f32>,
  @location(0)       world_pos:   vec3<f32>,
  @location(1)       world_norm:  vec3<f32>,
  @location(2)       uv:          vec2<f32>,
}

@group(0) @binding(0) var<uniform> cam_mesh:  Camera;
@group(1) @binding(0) var<uniform> mesh_u:    MeshUniform;
@group(1) @binding(1) var mesh_tex:           texture_2d<f32>;
@group(1) @binding(2) var mesh_sampler:       sampler;

fn rot_y(a: f32) -> mat3x3<f32> {
  let c = cos(a); let s = sin(a);
  return mat3x3(
    vec3( c, 0.0, s),
    vec3(0.0, 1.0, 0.0),
    vec3(-s, 0.0, c)
  );
}

@vertex
fn vs_mesh(in: MeshVIn) -> MeshVOut {
  var out: MeshVOut;

  // Apply animation rotation + translation on top of model matrix
  let rot   = rot_y(mesh_u.anim_rotate_y);
  let world = (mesh_u.model * vec4(in.position, 1.0)).xyz;
  let anim_world = rot * world + mesh_u.anim_translate.xyz;

  out.clip_pos   = cam_mesh.view_proj * vec4(anim_world, 1.0);
  out.world_pos  = anim_world;
  out.world_norm = normalize((mesh_u.normal_mat * vec4(rot * in.normal, 0.0)).xyz);
  out.uv         = in.uv;

  return out;
}

@fragment
fn fs_mesh(in: MeshVOut) -> @location(0) vec4<f32> {
  let tex_color = textureSample(mesh_tex, mesh_sampler, in.uv);
  let base      = tex_color.rgb * mesh_u.base_color.rgb;

  let N    = normalize(in.world_norm);
  let L    = normalize(-mesh_u.light_dir.xyz);
  let V    = normalize(cam_mesh.position.xyz - in.world_pos);
  let H    = normalize(L + V);

  let diff = max(dot(N, L), 0.0);
  let spec = pow(max(dot(N, H), 0.0), mesh_u.shininess);

  let color = base * (mesh_u.ambient + mesh_u.diffuse * diff)
              + vec3(1.0) * mesh_u.specular * spec;

  return vec4(color, tex_color.a * mesh_u.base_color.a);
}


// ─── PASS 3: Video Frame Quad ─────────────────────────────────────────────
// Renders the reconstructed video as a flat billboard in world space.
// Use as: background screen, evidence monitor, or scene backdrop.

struct QuadUniform {
  transform:  mat4x4<f32>,  // position + scale in world space
  opacity:    f32,
  _pad:       vec3<f32>,
}

@group(0) @binding(0) var<uniform>  cam_quad:     Camera;
@group(1) @binding(0) var<uniform>  quad_u:       QuadUniform;
@group(1) @binding(1) var           video_tex:    texture_2d<f32>;
@group(1) @binding(2) var           video_samp:   sampler;

struct QuadVOut {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0)       uv:       vec2<f32>,
}

// Full-screen-aligned quad: 6 vertices (2 triangles)
@vertex
fn vs_video_quad(@builtin(vertex_index) vid: u32) -> QuadVOut {
  var out: QuadVOut;

  var positions = array<vec2<f32>, 6>(
    vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
    vec2( 1.0, -1.0), vec2(1.0,  1.0), vec2(-1.0, 1.0),
  );
  var uvs = array<vec2<f32>, 6>(
    vec2(0.0, 1.0), vec2(1.0, 1.0), vec2(0.0, 0.0),
    vec2(1.0, 1.0), vec2(1.0, 0.0), vec2(0.0, 0.0),
  );

  let local = vec4(positions[vid], 0.0, 1.0);
  out.clip_pos = cam_quad.view_proj * quad_u.transform * local;
  out.uv       = uvs[vid];

  return out;
}

@fragment
fn fs_video_quad(in: QuadVOut) -> @location(0) vec4<f32> {
  let col = textureSample(video_tex, video_samp, in.uv);
  return vec4(col.rgb, col.a * quad_u.opacity);
}


// ─── COMPUTE: Point Cloud Upload ──────────────────────────────────────────
// Converts raw depth map (u8 greyscale) + image (rgba) → Point array.
// One thread per pixel, 256-wide workgroups → RTX 3060 Ti 8-warp alignment.

struct DepthParams {
  width:      u32,
  height:     u32,
  max_depth:  f32,   // metres, maps depth=255 → this value
  fov_rad:    f32,   // horizontal field-of-view in radians (default π/3 = 60°)
  step:       u32,   // subsample: process every Nth pixel (1=all, 4=quarter)
  out_count:  atomic<u32>,
  _pad:       vec2<u32>,
}

@group(0) @binding(0) var<storage, read>       depth_map:   array<u32>;  // packed u8×4 RGBA
@group(0) @binding(1) var<storage, read>       image_map:   array<u32>;  // packed RGBA u8×4
@group(0) @binding(2) var<storage, read_write> out_points:  array<Point>;
@group(0) @binding(3) var<storage, read_write> depth_params: DepthParams;

@compute @workgroup_size(256)
fn cs_depth_to_points(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = depth_params.width * depth_params.height;
  let strided = idx * depth_params.step;
  if (strided >= total) { return; }

  let px = strided % depth_params.width;
  let py = strided / depth_params.width;

  // Unpack depth (R channel of greyscale RGBA)
  let d_packed = depth_map[strided];
  let d = f32(d_packed & 0xFFu) / 255.0 * depth_params.max_depth;
  if (d < 0.01) { return; }

  // Pinhole back-projection
  let fx = f32(depth_params.width) / (2.0 * tan(depth_params.fov_rad * 0.5));
  let fy = fx;
  let cx = f32(depth_params.width)  * 0.5;
  let cy = f32(depth_params.height) * 0.5;

  let x = (f32(px) - cx) / fx * d;
  let y = -(f32(py) - cy) / fy * d;  // flip Y
  let z = -d;                          // -Z into scene

  // Unpack image color
  let c_packed = image_map[strided];
  let r = f32((c_packed      ) & 0xFFu) / 255.0;
  let g = f32((c_packed >>  8u) & 0xFFu) / 255.0;
  let b = f32((c_packed >> 16u) & 0xFFu) / 255.0;

  let out_idx = atomicAdd(&depth_params.out_count, 1u);
  if (out_idx < arrayLength(&out_points)) {
    out_points[out_idx] = Point(
      vec3(x, y, z), 0.0,
      vec4(r, g, b, 1.0)
    );
  }
}
