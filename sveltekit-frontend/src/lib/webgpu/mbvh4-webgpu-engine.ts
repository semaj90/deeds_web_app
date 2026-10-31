/**
 * mbvh4-webgpu-engine.ts
 *
 * WebGPU Hardware Accelerator for 4-Wide Quad BVH (MBVH4 / QBVH).
 * Dispatches parallel WGSL compute shaders for high-throughput ray-box slab intersection
 * and stackless nibble-bitmask hierarchy traversal.
 *
 * Backs:
 *   1. 3D Courtroom evidence & character picking (courtroom-scene.svelte.ts)
 *   2. N64 4KB Texture LOD promotion (N64TextureLODSystem.ts)
 *
 * Transparently falls back to CPU stackless bitstack traversal (traverseMbvh4Stackless)
 * when WebGPU is unavailable or execution occurs in a Node/SSR environment.
 */

import {
  MBVH4_NODE_STRIDE_BYTES,
  packMbvh4Nodes,
  traverseMbvh4Stackless,
  type MBVH4NodeInput,
  type Mbvh4TraversalResult,
  type Vec3,
} from './mbvh4-accelerator.js';
import { WebGPUInit } from './webgpu-init.js';

export interface RayQueryInput {
  origin: Vec3;
  tMin: number;
  dir: Vec3;
  tMax: number;
}

export interface Mbvh4GpuHitResult {
  hitLeafId: number;
  closestT: number;
  promotedLodTier: number;
  nodesVisited: number;
}

/**
 * Packs ray queries into std430 / WebGPU storage buffer format (32 bytes per ray):
 * [origin.x, origin.y, origin.z, tMin, invDir.x, invDir.y, invDir.z, tMax]
 */
export function packRayQueries(rays: readonly RayQueryInput[]): Float32Array {
  const numRays = rays.length;
  const out = new Float32Array(numRays * 8);

  for (let i = 0; i < numRays; i++) {
    const r = rays[i];
    const offset = i * 8;
    out[offset + 0] = r.origin[0];
    out[offset + 1] = r.origin[1];
    out[offset + 2] = r.origin[2];
    out[offset + 3] = r.tMin;

    out[offset + 4] = r.dir[0] !== 0 ? 1.0 / r.dir[0] : 1e30;
    out[offset + 5] = r.dir[1] !== 0 ? 1.0 / r.dir[1] : 1e30;
    out[offset + 6] = r.dir[2] !== 0 ? 1.0 / r.dir[2] : 1e30;
    out[offset + 7] = r.tMax;
  }

  return out;
}

/**
 * Executes batch MBVH4 traversal on CPU as reference and fallback.
 */
export function batchTraverseMbvh4Cpu(
  nodes: readonly MBVH4NodeInput[],
  rays: readonly RayQueryInput[]
): Mbvh4GpuHitResult[] {
  return rays.map((ray) => {
    const res: Mbvh4TraversalResult = traverseMbvh4Stackless(
      nodes,
      ray.origin,
      ray.dir,
      ray.tMin,
      ray.tMax
    );
    return {
      hitLeafId: res.hitLeafId,
      closestT: res.closestT,
      promotedLodTier: res.promotedLodTier,
      nodesVisited: res.nodesVisited,
    };
  });
}

const MBVH4_TRAVERSAL_WGSL = `
struct MBVH4Node {
    bmin_x: vec4<f32>,
    bmax_x: vec4<f32>,
    bmin_y: vec4<f32>,
    bmax_y: vec4<f32>,
    bmin_z: vec4<f32>,
    bmax_z: vec4<f32>,
    child_indices: vec4<i32>,
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
    mask: u32,
    t_enter: vec4<f32>,
};

@group(0) @binding(0) var<storage, read> mbvh_nodes: array<MBVH4Node>;
@group(0) @binding(1) var<storage, read> rays: array<RayQuery>;
@group(0) @binding(2) var<storage, read_write> results: array<RayHitResult>;

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

    var depth: u32 = 0u;
    var bitstack: u32 = 0u;
    var node_idx: u32 = 0u;

    loop {
        visited += 1u;
        let node = mbvh_nodes[node_idx];
        let hit = intersect_mbvh4_node(node, ray.origin, ray.inv_dir, ray.t_min, closest_t);

        if (hit.mask != 0u) {
            let first_child_lane = firstTrailingBit(hit.mask);
            let remaining_siblings = hit.mask & (hit.mask - 1u);

            let level_shift = depth * 4u;
            bitstack = (bitstack & ~(0xFu << level_shift)) | (remaining_siblings << level_shift);

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

        var descended_to_internal: bool = false;
        while (bitstack != 0u) {
            let highest_bit = firstLeadingBit(bitstack);
            let target_depth = highest_bit / 4u;

            while (depth > target_depth) {
                node_idx = mbvh_nodes[node_idx].meta.x;
                depth -= 1u;
            }

            let level_shift = depth * 4u;
            let level_mask = (bitstack >> level_shift) & 0xFu;
            let sibling_lane = firstTrailingBit(level_mask);

            let cleared_level_mask = level_mask & (level_mask - 1u);
            bitstack = (bitstack & ~(0xFu << level_shift)) | (cleared_level_mask << level_shift);

            let parent_node = mbvh_nodes[node_idx];
            let sibling_id = parent_node.child_indices[sibling_lane];
            if (sibling_id >= 0) {
                node_idx = u32(sibling_id);
                depth += 1u;
                descended_to_internal = true;
                break;
            } else {
                let sibling_hit = intersect_mbvh4_node(parent_node, ray.origin, ray.inv_dir, ray.t_min, closest_t);
                if ((sibling_hit.mask & (1u << sibling_lane)) != 0u) {
                    let leaf_id = ~sibling_id;
                    let lane_t = sibling_hit.t_enter[sibling_lane];
                    if (lane_t <= closest_t) {
                        closest_t = lane_t;
                        best_leaf_id = leaf_id;
                        best_lod_tier = parent_node.meta.z;
                    }
                }
            }
        }

        if (!descended_to_internal && bitstack == 0u) {
            break;
        }
    }

    results[ray_idx] = RayHitResult(best_leaf_id, closest_t, best_lod_tier, visited);
}
`;

export class Mbvh4WebGpuEngine {
  private static instance: Mbvh4WebGpuEngine | null = null;
  private device: GPUDevice | null = null;
  private isAvailable: boolean = false;
  private pipeline: GPUComputePipeline | null = null;

  private constructor() {}

  static getInstance(): Mbvh4WebGpuEngine {
    if (!Mbvh4WebGpuEngine.instance) {
      Mbvh4WebGpuEngine.instance = new Mbvh4WebGpuEngine();
    }
    return Mbvh4WebGpuEngine.instance;
  }

  async init(): Promise<boolean> {
    if (this.device) return true;

    try {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        this.isAvailable = false;
        return false;
      }

      const initSystem = WebGPUInit.getInstance();
      const capabilities = await initSystem.initialize();
      this.device = initSystem.getDevice();
      this.isAvailable = capabilities.hasWebGPU && this.device !== null;
      return this.isAvailable;
    } catch {
      this.isAvailable = false;
      return false;
    }
  }

  async traverseRays(
    nodes: readonly MBVH4NodeInput[],
    rays: readonly RayQueryInput[]
  ): Promise<Mbvh4GpuHitResult[]> {
    if (rays.length === 0 || nodes.length === 0) {
      return [];
    }

    const hasGpu = await this.init();
    if (!hasGpu || !this.device) {
      return batchTraverseMbvh4Cpu(nodes, rays);
    }

    try {
      return await this.dispatchWebGpu(nodes, rays);
    } catch (err) {
      console.warn('WebGPU MBVH4 dispatch failed, falling back to CPU:', err);
      return batchTraverseMbvh4Cpu(nodes, rays);
    }
  }

  private async dispatchWebGpu(
    nodes: readonly MBVH4NodeInput[],
    rays: readonly RayQueryInput[]
  ): Promise<Mbvh4GpuHitResult[]> {
    const device = this.device!;
    const numRays = rays.length;

    // 1. Pack nodes & rays into storage buffers
    const packedNodes = packMbvh4Nodes(nodes);
    const nodesGpuBuffer = device.createBuffer({
      size: packedNodes.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(nodesGpuBuffer, 0, packedNodes);

    const packedRays = packRayQueries(rays);
    const raysGpuBuffer = device.createBuffer({
      size: packedRays.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(raysGpuBuffer, 0, packedRays.buffer as ArrayBuffer);

    // 2. Results buffer (16 bytes per ray: hit_leaf_id, closest_t, promoted_lod_tier, nodes_visited)
    const resultByteLength = Math.max(16, numRays * 16);
    const resultsBuffer = device.createBuffer({
      size: resultByteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const stagingBuffer = device.createBuffer({
      size: resultByteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // 3. Compile pipeline (cached)
    if (!this.pipeline) {
      const shaderModule = device.createShaderModule({
        label: 'mbvh4_traversal_module',
        code: MBVH4_TRAVERSAL_WGSL,
      });
      this.pipeline = device.createComputePipeline({
        label: 'mbvh4_traversal_pipeline',
        layout: 'auto',
        compute: {
          module: shaderModule,
          entryPoint: 'main',
        },
      });
    }

    const bindGroup = device.createBindGroup({
      label: 'mbvh4_bind_group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: nodesGpuBuffer } },
        { binding: 1, resource: { buffer: raysGpuBuffer } },
        { binding: 2, resource: { buffer: resultsBuffer } },
      ],
    });

    // 4. Dispatch compute passes
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(numRays / 64));
    passEncoder.end();

    commandEncoder.copyBufferToBuffer(resultsBuffer, 0, stagingBuffer, 0, resultByteLength);
    device.queue.submit([commandEncoder.finish()]);

    // 5. Read back mapped results
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const copyArrayBuffer = stagingBuffer.getMappedRange().slice(0);
    stagingBuffer.unmap();

    nodesGpuBuffer.destroy();
    raysGpuBuffer.destroy();
    resultsBuffer.destroy();
    stagingBuffer.destroy();

    const intView = new Int32Array(copyArrayBuffer);
    const floatView = new Float32Array(copyArrayBuffer);
    const uintView = new Uint32Array(copyArrayBuffer);

    const hitResults: Mbvh4GpuHitResult[] = [];
    for (let i = 0; i < numRays; i++) {
      const offset = i * 4;
      hitResults.push({
        hitLeafId: intView[offset + 0],
        closestT: floatView[offset + 1],
        promotedLodTier: uintView[offset + 2],
        nodesVisited: uintView[offset + 3],
      });
    }

    return hitResults;
  }
}
