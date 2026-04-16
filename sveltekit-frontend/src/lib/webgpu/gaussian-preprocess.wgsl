// ═══════════════════════════════════════════════════════════════════════════
// Gaussian Splatting — Preprocess Compute Shader
// Projects 3D Gaussians to screen-space 2D ellipses.
//
// Pipeline stage 1 of 3: Preprocess → Sort → Rasterize
// Input:  raw .splat buffer (32B per Gaussian from _export_splat_bytes)
// Output: SortKey buffer (depth keys for radix sort)
//         Splat2D buffer  (projected screen ellipses for rasterization)
//
// RTX 3060 Ti target: 256-wide workgroups (8 warps × 32 threads)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Input: raw .splat format (antimatter15, 32B per Gaussian) ────────────
// [0:12]  x,y,z float32    [12:24] sx,sy,sz float32
// [24:28] r,g,b,a uint8    [28:32] qw,qx,qy,qz uint8 mapped [-1,1]→[0,255]
struct RawSplat {
    px: f32,  py: f32,  pz: f32,   // world position
    sx: f32,  sy: f32,  sz: f32,   // scale
    rgba: u32,                      // packed r,g,b,a uint8
    rot:  u32,                      // packed qw,qx,qy,qz uint8
}

// ─── Output: 2D projected Gaussian (tile-ready) ───────────────────────────
struct Splat2D {
    cx:       f32,   // screen centre x (NDC)
    cy:       f32,   // screen centre y (NDC)
    cov_a:    f32,   // 2D cov upper-left  [0,0]
    cov_b:    f32,   // 2D cov upper-right [0,1]
    cov_c:    f32,   // 2D cov lower-right [1,1]
    r:        f32,
    g:        f32,
    b:        f32,
    alpha:    f32,
    depth:    f32,   // clip-space z for sorting
    tile_min: u32,   // packed tile range (lo 16 = minX, hi 16 = minY)
    tile_max: u32,   // packed tile range (lo 16 = maxX, hi 16 = maxY)
}

// ─── Depth sort key (u64 emulated as two u32) ─────────────────────────────
struct SortKey {
    key_hi: u32,   // tile_id (higher bits — sorts by tile first)
    key_lo: u32,   // depth   (lower  bits — sorts front-to-back within tile)
    idx:    u32,   // original Gaussian index
    _pad:   u32,
}

// ─── Uniforms ─────────────────────────────────────────────────────────────
struct Camera {
    view:      mat4x4<f32>,
    proj:      mat4x4<f32>,
    width:     u32,
    height:    u32,
    tile_w:    u32,   // ceil(width  / TILE_SIZE)
    tile_h:    u32,   // ceil(height / TILE_SIZE)
    near:      f32,
    far:       f32,
    _pad0:     f32,
    _pad1:     f32,
}

@group(0) @binding(0) var<storage, read>       raw_splats:  array<RawSplat>;
@group(0) @binding(1) var<storage, read_write> splats_2d:   array<Splat2D>;
@group(0) @binding(2) var<storage, read_write> sort_keys:   array<SortKey>;
@group(0) @binding(3) var<storage, read_write> visible_count: atomic<u32>;
@group(0) @binding(4) var<uniform>             camera:      Camera;

const TILE_SIZE: u32  = 16u;
const EPS:       f32  = 1e-6;

// ─── Helpers ──────────────────────────────────────────────────────────────

fn unpack_uint8_float(packed: u32, byte_idx: u32) -> f32 {
    return f32((packed >> (byte_idx * 8u)) & 0xFFu);
}

fn uint8_to_quat(packed: u32) -> vec4<f32> {
    // Maps [0,255] → [-1,1] then normalises
    let qw = (unpack_uint8_float(packed, 0u) / 127.5) - 1.0;
    let qx = (unpack_uint8_float(packed, 1u) / 127.5) - 1.0;
    let qy = (unpack_uint8_float(packed, 2u) / 127.5) - 1.0;
    let qz = (unpack_uint8_float(packed, 3u) / 127.5) - 1.0;
    let n  = max(sqrt(qw*qw + qx*qx + qy*qy + qz*qz), EPS);
    return vec4<f32>(qw/n, qx/n, qy/n, qz/n);
}

fn quat_to_mat3(q: vec4<f32>) -> mat3x3<f32> {
    let qw = q.x; let qx = q.y; let qy = q.z; let qz = q.w;
    return mat3x3<f32>(
        vec3<f32>(1.0 - 2.0*(qy*qy + qz*qz),       2.0*(qx*qy + qw*qz),       2.0*(qx*qz - qw*qy)),
        vec3<f32>(      2.0*(qx*qy - qw*qz), 1.0 - 2.0*(qx*qx + qz*qz),       2.0*(qy*qz + qw*qx)),
        vec3<f32>(      2.0*(qx*qz + qw*qy),       2.0*(qy*qz - qw*qx), 1.0 - 2.0*(qx*qx + qy*qy)),
    );
}

// Compute 3D covariance matrix Σ = R S S^T R^T
fn compute_cov3d(scale: vec3<f32>, rot: mat3x3<f32>) -> array<f32, 6> {
    // Scaled rotation M = R * diag(s)
    let m0 = rot[0] * scale.x;
    let m1 = rot[1] * scale.y;
    let m2 = rot[2] * scale.z;
    // Σ = M * M^T (upper triangle)
    var cov: array<f32, 6>;
    cov[0] = dot(m0, m0);   // [0,0]
    cov[1] = dot(m0, m1);   // [0,1]
    cov[2] = dot(m0, m2);   // [0,2]
    cov[3] = dot(m1, m1);   // [1,1]
    cov[4] = dot(m1, m2);   // [1,2]
    cov[5] = dot(m2, m2);   // [2,2]
    return cov;
}

// Project 3D covariance to 2D screen covariance via EWA splatting Jacobian.
// Returns upper triangle (a, b, c) of the 2×2 screen covariance.
fn project_cov3d_to_2d(
    pos_view: vec3<f32>,
    cov3d:    array<f32, 6>,
    fx: f32, fy: f32,
) -> vec3<f32> {
    let t  = pos_view;
    let iz = 1.0 / max(abs(t.z), EPS);
    let iz2 = iz * iz;

    // Jacobian J of affine approximation of perspective projection
    let J = mat3x3<f32>(
        vec3<f32>(fx * iz,     0.0,       -fx * t.x * iz2),
        vec3<f32>(0.0,         fy * iz,   -fy * t.y * iz2),
        vec3<f32>(0.0,         0.0,        0.0),
    );

    // W = J * V (view rotation upper 3×3, approximated as identity for small rotations)
    // Full: W = J * view_rot, simplified here for performance
    let W = J;

    // Σ' = W * Σ * W^T (2×2 screen covariance from 3×3 world)
    let cov_mat = mat3x3<f32>(
        vec3<f32>(cov3d[0], cov3d[1], cov3d[2]),
        vec3<f32>(cov3d[1], cov3d[3], cov3d[4]),
        vec3<f32>(cov3d[2], cov3d[4], cov3d[5]),
    );
    let T   = W * cov_mat;
    let cov = T * transpose(W);

    // Return upper triangle + low-pass filter (adds 0.3 to diagonal to prevent degenerate splats)
    return vec3<f32>(cov[0][0] + 0.3, cov[0][1], cov[1][1] + 0.3);
}

// Bounding box of the 2D Gaussian at 3σ radius, in tile coordinates.
fn gaussian_tile_bbox(
    cx: f32, cy: f32,
    cov_a: f32, cov_b: f32, cov_c: f32,
    width: u32, height: u32,
    tile_w: u32, tile_h: u32,
) -> vec4<u32> {
    // Eigenvalue-based radius: λ = (a+c)/2 ± sqrt(((a-c)/2)^2 + b^2)
    let mid   = 0.5 * (cov_a + cov_c);
    let disc  = max(0.0, mid*mid - (cov_a*cov_c - cov_b*cov_b));
    let sqrtd = sqrt(disc);
    let r     = ceil(3.0 * sqrt(max(mid + sqrtd, mid - sqrtd)));

    let hw = f32(width)  * 0.5;
    let hh = f32(height) * 0.5;

    // NDC → pixel
    let px = (cx + 1.0) * hw;
    let py = (cy + 1.0) * hh;

    let tile_min_x = u32(max(0.0, floor((px - r) / f32(TILE_SIZE))));
    let tile_min_y = u32(max(0.0, floor((py - r) / f32(TILE_SIZE))));
    let tile_max_x = min(tile_w, u32(ceil((px + r) / f32(TILE_SIZE))));
    let tile_max_y = min(tile_h, u32(ceil((py + r) / f32(TILE_SIZE))));

    return vec4<u32>(tile_min_x, tile_min_y, tile_max_x, tile_max_y);
}

// ─── Main compute kernel ──────────────────────────────────────────────────

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= arrayLength(&raw_splats)) { return; }

    let s = raw_splats[idx];

    // ── 1. Transform to view/clip space ──────────────────────────────────
    let pos_world = vec4<f32>(s.px, s.py, s.pz, 1.0);
    let pos_view  = camera.view * pos_world;
    let pos_clip  = camera.proj * pos_view;

    // Frustum cull (near/far + behind camera)
    if (pos_view.z >= -camera.near || pos_view.z <= -camera.far) { return; }

    let w_inv = 1.0 / max(abs(pos_clip.w), EPS);
    let ndc_x = pos_clip.x * w_inv;
    let ndc_y = pos_clip.y * w_inv;
    let depth  = pos_clip.z * w_inv;

    // Loose frustum cull on NDC (allow splats whose center is 1.3× outside)
    if (ndc_x < -1.3 || ndc_x > 1.3 || ndc_y < -1.3 || ndc_y > 1.3) { return; }

    // ── 2. Decode rotation + build 3D covariance ─────────────────────────
    let q       = uint8_to_quat(s.rot);
    let rot_mat = quat_to_mat3(q);
    let scale   = vec3<f32>(s.sx, s.sy, s.sz);
    let cov3d   = compute_cov3d(scale, rot_mat);

    // ── 3. Project to 2D screen covariance ───────────────────────────────
    let fw   = f32(camera.width);
    let fh   = f32(camera.height);
    // Recover focal lengths from projection matrix: fx = proj[0][0] * W/2
    let fx   = camera.proj[0][0] * fw * 0.5;
    let fy   = camera.proj[1][1] * fh * 0.5;
    let cov2 = project_cov3d_to_2d(pos_view.xyz, cov3d, fx, fy);

    // ── 4. Tile bounding box ──────────────────────────────────────────────
    let bbox = gaussian_tile_bbox(
        ndc_x, ndc_y, cov2.x, cov2.y, cov2.z,
        camera.width, camera.height, camera.tile_w, camera.tile_h,
    );
    if (bbox.z <= bbox.x || bbox.w <= bbox.y) { return; } // zero-area bbox

    // ── 5. Decode colour ──────────────────────────────────────────────────
    let r = unpack_uint8_float(s.rgba, 0u) / 255.0;
    let g = unpack_uint8_float(s.rgba, 1u) / 255.0;
    let b = unpack_uint8_float(s.rgba, 2u) / 255.0;
    let a = unpack_uint8_float(s.rgba, 3u) / 255.0;

    // ── 6. Write outputs ──────────────────────────────────────────────────
    let out_idx = atomicAdd(&visible_count, 1u);

    splats_2d[out_idx] = Splat2D(
        ndc_x, ndc_y,
        cov2.x, cov2.y, cov2.z,
        r, g, b, a,
        depth,
        bbox.x | (bbox.y << 16u),
        bbox.z | (bbox.w << 16u),
    );

    // Emit one sort key per tile the splat covers
    // (tile_id encoded as y*tile_w + x, depth in low bits for front-to-back)
    let depth_key = u32(clamp(depth, 0.0, 1.0) * f32(0xFFFFFFFFu));
    for (var ty = bbox.y; ty < bbox.w; ty++) {
        for (var tx = bbox.x; tx < bbox.z; tx++) {
            let tile_id  = ty * camera.tile_w + tx;
            let key_idx  = atomicAdd(&visible_count, 0u); // read current count as slot hint
            sort_keys[out_idx] = SortKey(tile_id, depth_key, out_idx, 0u);
        }
    }
}
