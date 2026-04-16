// ═══════════════════════════════════════════════════════════════════════════
// Gaussian Splatting — Rasterize Compute Shader
// Tile-based alpha-compositing of depth-sorted 2D Gaussians.
//
// Pipeline stage 3 of 3: Preprocess → Sort → Rasterize
// Input:  Splat2D array (from preprocess), sorted by (tile_id, depth)
//         TileRange array (start/end index per tile)
// Output: RGBA texture (written via storageTexture)
//
// Each workgroup owns one tile (16×16 = 256 threads, one per pixel).
// Threads cooperate via workgroup shared memory to load Gaussian data once
// per tile, amortising the memory bandwidth across all pixels in the tile.
//
// RTX 3060 Ti: 256-thread workgroups fill one warp-group per SM block.
// ═══════════════════════════════════════════════════════════════════════════

struct Splat2D {
    cx:       f32,
    cy:       f32,
    cov_a:    f32,
    cov_b:    f32,
    cov_c:    f32,
    r:        f32,
    g:        f32,
    b:        f32,
    alpha:    f32,
    depth:    f32,
    tile_min: u32,
    tile_max: u32,
}

// Per-tile [start, end) index range into the sorted Splat2D array.
struct TileRange {
    start: u32,
    end:   u32,
}

struct RenderConfig {
    width:   u32,
    height:  u32,
    tile_w:  u32,
    tile_h:  u32,
}

@group(0) @binding(0) var<storage, read>       splats_sorted: array<Splat2D>;
@group(0) @binding(1) var<storage, read>       tile_ranges:   array<TileRange>;
@group(0) @binding(2) var<uniform>             config:        RenderConfig;
@group(0) @binding(3) var                      out_texture:   texture_storage_2d<rgba8unorm, write>;

const TILE_SIZE:       u32 = 16u;
const MAX_TILE_SPLATS: u32 = 64u;  // shared-memory batch size per tile pass
const ALPHA_SAT:       f32 = 0.9999; // stop compositing when accumulated alpha reaches this

// Shared memory: batch of Gaussian data loaded cooperatively
var<workgroup> sh_cx:    array<f32, MAX_TILE_SPLATS>;
var<workgroup> sh_cy:    array<f32, MAX_TILE_SPLATS>;
var<workgroup> sh_cov_a: array<f32, MAX_TILE_SPLATS>;
var<workgroup> sh_cov_b: array<f32, MAX_TILE_SPLATS>;
var<workgroup> sh_cov_c: array<f32, MAX_TILE_SPLATS>;
var<workgroup> sh_r:     array<f32, MAX_TILE_SPLATS>;
var<workgroup> sh_g:     array<f32, MAX_TILE_SPLATS>;
var<workgroup> sh_b:     array<f32, MAX_TILE_SPLATS>;
var<workgroup> sh_alpha: array<f32, MAX_TILE_SPLATS>;
var<workgroup> sh_done:  atomic<u32>;  // count of saturated threads

// ─── Evaluate 2D Gaussian at pixel offset (dx, dy) from centre ───────────
fn eval_gaussian_2d(
    dx: f32, dy: f32,
    cov_a: f32, cov_b: f32, cov_c: f32,
) -> f32 {
    // Invert 2×2 covariance: det = a*c - b^2
    let det = cov_a * cov_c - cov_b * cov_b;
    if (det < 1e-6) { return 0.0; }
    let inv_det = 1.0 / det;
    let ia =  cov_c * inv_det;
    let ib = -cov_b * inv_det;
    let ic =  cov_a * inv_det;
    // Mahalanobis distance squared
    let mah2 = dx*dx*ia + 2.0*dx*dy*ib + dy*dy*ic;
    return exp(-0.5 * mah2);
}

@compute @workgroup_size(TILE_SIZE, TILE_SIZE, 1)
fn main(
    @builtin(workgroup_id)           wgid:  vec3<u32>,
    @builtin(local_invocation_id)    lid:   vec3<u32>,
    @builtin(local_invocation_index) lidx:  u32,
) {
    let tile_x   = wgid.x;
    let tile_y   = wgid.y;
    let tile_idx = tile_y * config.tile_w + tile_x;

    // Pixel coordinate in screen space
    let px = tile_x * TILE_SIZE + lid.x;
    let py = tile_y * TILE_SIZE + lid.y;

    // Discard threads outside the render target
    let in_bounds = (px < config.width && py < config.height);

    // Centre of this pixel in NDC [-1, 1]
    let ndc_x = (f32(px) + 0.5) / f32(config.width)  * 2.0 - 1.0;
    let ndc_y = (f32(py) + 0.5) / f32(config.height) * 2.0 - 1.0;

    // Accumulated colour and alpha for this pixel
    var acc_r   = 0.0;
    var acc_g   = 0.0;
    var acc_b   = 0.0;
    var acc_a   = 0.0;   // transmittance = 1 - acc_a

    let range = tile_ranges[tile_idx];

    // Process Gaussians in batches to stay within shared memory limits
    var batch_start = range.start;
    while (batch_start < range.end && acc_a < ALPHA_SAT) {
        let batch_end = min(batch_start + MAX_TILE_SPLATS, range.end);
        let batch_n   = batch_end - batch_start;

        // ── Cooperative load into shared memory ──────────────────────────
        if (lidx < batch_n) {
            let s = splats_sorted[batch_start + lidx];
            sh_cx[lidx]    = s.cx;
            sh_cy[lidx]    = s.cy;
            sh_cov_a[lidx] = s.cov_a;
            sh_cov_b[lidx] = s.cov_b;
            sh_cov_c[lidx] = s.cov_c;
            sh_r[lidx]     = s.r;
            sh_g[lidx]     = s.g;
            sh_b[lidx]     = s.b;
            sh_alpha[lidx] = s.alpha;
        }
        workgroupBarrier();

        // ── Each thread composites its pixel against the loaded batch ─────
        if (in_bounds) {
            for (var i = 0u; i < batch_n && acc_a < ALPHA_SAT; i++) {
                let dx    = ndc_x - sh_cx[i];
                let dy    = ndc_y - sh_cy[i];
                let gauss = eval_gaussian_2d(dx, dy, sh_cov_a[i], sh_cov_b[i], sh_cov_c[i]);
                let alpha = sh_alpha[i] * gauss;
                if (alpha < 1.0 / 255.0) { continue; }

                // Front-to-back alpha compositing: C += (1-A) * α * c
                let t  = 1.0 - acc_a;
                acc_r += t * alpha * sh_r[i];
                acc_g += t * alpha * sh_g[i];
                acc_b += t * alpha * sh_b[i];
                acc_a += t * alpha;
            }
        }

        workgroupBarrier();
        batch_start = batch_end;
    }

    if (in_bounds) {
        // Background: white for forensic/legal context (matching light theme)
        let bg   = vec3<f32>(1.0, 1.0, 1.0);
        let t    = 1.0 - acc_a;
        let out  = vec4<f32>(
            acc_r + t * bg.r,
            acc_g + t * bg.g,
            acc_b + t * bg.b,
            1.0,
        );
        textureStore(out_texture, vec2<i32>(i32(px), i32(py)), out);
    }
}
