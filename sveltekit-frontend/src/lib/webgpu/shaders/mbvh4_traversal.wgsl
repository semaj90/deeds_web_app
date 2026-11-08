// sveltekit-frontend/src/lib/webgpu/shaders/mbvh4_traversal.wgsl
//
// 4-Wide Quad BVH (QBVH / MBVH4) Struct-of-Arrays (SoA) Slab Intersection
// and Stackless Nibble-Bitmask Traversal Kernel for:
//   1. 3D Courtroom ray-picking & frustum/occlusion culling (courtroom-scene.svelte.ts)
//   2. N64 4KB Texture LOD page promotion (N64TextureLODSystem.ts)
//
// Memory alignment:
//   Each MBVH4Node occupies exactly 128 bytes (32 x 4B = two 64-byte GPU cache lines).

struct MBVH4Node {
    // 6 x vec4<f32> = 96 bytes (SoA transposed AABB bounds for 4 children)
    bmin_x: vec4<f32>,
    bmax_x: vec4<f32>,
    bmin_y: vec4<f32>,
    bmax_y: vec4<f32>,
    bmin_z: vec4<f32>,
    bmax_z: vec4<f32>,
    // 4 child indices (< 0 indicates leaf/primitive index ~child_id, >= 0 indicates internal node)
    child_indices: vec4<i32>,
    // Parent index + 4-bit active child mask + LOD level + bitmask metadata (16 bytes)
    // meta.x = parent_idx, meta.y = valid_child_mask (bits 0..3), meta.z = lod_tier, meta.w = flags
    meta: vec4<u32>,
};

struct RayQuery {
    origin: vec3<f32>,
    t_min: f32,
    inv_dir: vec3<f32>,
    t_max: f32,
};

struct RayHitResult {
    hit_leaf_id: i32,
    closest_t: f32,
    promoted_lod_tier: u32,
    nodes_visited: u32,
};

struct HitMask4 {
    mask: u32,          // 4-bit bitmask (bits 0..3) of hit children
    t_enter: vec4<f32>, // Distance to each hit child for front-to-back sorting
};

@group(0) @binding(0) var<storage, read> mbvh_nodes: array<MBVH4Node>;
@group(0) @binding(1) var<storage, read> rays: array<RayQuery>;
@group(0) @binding(2) var<storage, read_write> results: array<RayHitResult>;

fn stack_mask(stack: vec2<u32>, depth: u32) -> u32 {
    if (depth < 8u) { return (stack.x >> (depth * 4u)) & 0xFu; }
    return (stack.y >> ((depth - 8u) * 4u)) & 0xFu;
}

fn stack_set(stack_in: vec2<u32>, depth: u32, mask: u32) -> vec2<u32> {
    var stack = stack_in;
    if (depth < 8u) {
        let shift = depth * 4u;
        stack.x = (stack.x & ~(0xFu << shift)) | ((mask & 0xFu) << shift);
    } else {
        let shift = (depth - 8u) * 4u;
        stack.y = (stack.y & ~(0xFu << shift)) | ((mask & 0xFu) << shift);
    }
    return stack;
}

fn stack_top_depth(stack: vec2<u32>) -> i32 {
    if (stack.y != 0u) { return 8 + i32(firstLeadingBit(stack.y) / 4u); }
    if (stack.x != 0u) { return i32(firstLeadingBit(stack.x) / 4u); }
    return -1;
}

fn intersect_mbvh4_node(
    node: MBVH4Node,
    ray_origin: vec3<f32>,
    ray_inv_dir: vec3<f32>,
    t_min: f32,
    t_max: f32
) -> HitMask4 {
    let tx0 = (node.bmin_x - vec4<f32>(ray_origin.x)) * ray_inv_dir.x;
    let tx1 = (node.bmax_x - vec4<f32>(ray_origin.x)) * ray_inv_dir.x;
    let ty0 = (node.bmin_y - vec4<f32>(ray_origin.y)) * ray_inv_dir.y;
    let ty1 = (node.bmax_y - vec4<f32>(ray_origin.y)) * ray_inv_dir.y;
    let tz0 = (node.bmin_z - vec4<f32>(ray_origin.z)) * ray_inv_dir.z;
    let tz1 = (node.bmax_z - vec4<f32>(ray_origin.z)) * ray_inv_dir.z;

    let t_enter = max(
        max(min(tx0, tx1), min(ty0, ty1)),
        max(min(tz0, tz1), vec4<f32>(t_min))
    );
    let t_exit = min(
        min(max(tx0, tx1), max(ty0, ty1)),
        min(max(tz0, tz1), vec4<f32>(t_max))
    );

    let hit_vec: vec4<bool> = t_enter <= t_exit;
    var raw_mask: u32 = 0u;
    if (hit_vec.x) { raw_mask |= 1u; }
    if (hit_vec.y) { raw_mask |= 2u; }
    if (hit_vec.z) { raw_mask |= 4u; }
    if (hit_vec.w) { raw_mask |= 8u; }

    // Mask out empty slots using node.meta.y (valid_child_mask)
    return HitMask4(raw_mask & node.meta.y, t_enter);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let ray_idx = gid.x;
    if (ray_idx >= arrayLength(&rays)) {
        return;
    }

    let ray = rays[ray_idx];
    var closest_t: f32 = ray.t_max;
    var best_leaf_id: i32 = -1;
    var best_lod_tier: u32 = 3u;
    var visited: u32 = 0u;

    // Stackless MBVH4 state machine (Zero per-thread array stack allocation)
    // Two u32 words pack sixteen 4-bit sibling masks (depths 0..15).
    var depth: u32 = 0u;
    var bitstack = vec2<u32>(0u, 0u);
    var node_idx: u32 = 0u;

    loop {
        visited += 1u;
        let node = mbvh_nodes[node_idx];
        let hit = intersect_mbvh4_node(node, ray.origin, ray.inv_dir, ray.t_min, closest_t);

        if (hit.mask != 0u) {
            let first_child_lane = firstTrailingBit(hit.mask);
            let remaining_siblings = hit.mask & (hit.mask - 1u);

            bitstack = stack_set(bitstack, depth, remaining_siblings);

            let next_id = node.child_indices[first_child_lane];
            if (next_id >= 0) {
                node_idx = u32(next_id);
                depth += 1u;
                continue;
            } else {
                let leaf_id = ~next_id;
                let lane_t = hit.t_enter[first_child_lane];
                if (lane_t <= closest_t) {
                    closest_t = lane_t;
                    best_leaf_id = leaf_id;
                    best_lod_tier = node.meta.z;
                }
            }
        }

        // Backtrack using bitstack alone (Zero shared/local memory reads for stack popping)
        var descended_to_internal: bool = false;
        loop {
            if (bitstack.x == 0u && bitstack.y == 0u) {
                break;
            }

            let target_depth = u32(stack_top_depth(bitstack));

            while (depth > target_depth) {
                node_idx = mbvh_nodes[node_idx].meta.x;
                depth -= 1u;
            }

            let level_mask = stack_mask(bitstack, depth);
            let sibling_lane = firstTrailingBit(level_mask);

            let cleared_level_mask = level_mask & (level_mask - 1u);
            bitstack = stack_set(bitstack, depth, cleared_level_mask);

            let parent_node = mbvh_nodes[node_idx];
            let sibling_id = parent_node.child_indices[sibling_lane];
            if (sibling_id >= 0) {
                node_idx = u32(sibling_id);
                depth += 1u;
                descended_to_internal = true;
                break;
            } else {
                // Re-verify leaf against tightened closest_t
                let sibling_hit = intersect_mbvh4_node(parent_node, ray.origin, ray.inv_dir, ray.t_min, closest_t);
                if ((sibling_hit.mask & (1u << sibling_lane)) != 0u) {
                    let lane_t = sibling_hit.t_enter[sibling_lane];
                    if (lane_t <= closest_t) {
                        closest_t = lane_t;
                        best_leaf_id = ~sibling_id;
                        best_lod_tier = parent_node.meta.z;
                    }
                }
            }
        }

        if (!descended_to_internal && bitstack.x == 0u && bitstack.y == 0u) {
            break;
        }
    }

    results[ray_idx] = RayHitResult(best_leaf_id, closest_t, best_lod_tier, visited);
}
