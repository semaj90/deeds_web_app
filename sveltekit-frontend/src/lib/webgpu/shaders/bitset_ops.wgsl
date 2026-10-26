/**
 * bitset_ops.wgsl — WebGPU Compute Shaders for Aligned Bitsets
 *
 * Accelerates 64-byte aligned bitset operations (popcount, batch bitwise AND,
 * and Jaccard similarity) using hardware-native WGSL `countOneBits` (POPCNT).
 *
 * Designed for Parent Atlas 64-byte cache-line aligned ATLASBIT buffers:
 * - Header: 64 bytes (16 x u32 words)
 * - Payload: contiguous u32 pairs representing uint64_t words
 */

struct BitsetParams {
  words_per_bitset: u32,      // Total u32 words per bitset payload
  num_candidates: u32,        // Number of candidates in batch
  header_offset_u32: u32,     // Header offset (default 16 for 64-byte header)
  active_bits: u32,           // Total active logical bits
};

@group(0) @binding(0) var<storage, read> query_buffer: array<u32>;
@group(0) @binding(1) var<storage, read> candidate_buffer: array<u32>;
@group(0) @binding(2) var<uniform> params: BitsetParams;
@group(0) @binding(3) var<storage, read_write> output_similarities: array<f32>;

const WORKGROUP_SIZE: u32 = 64u;

@compute @workgroup_size(64, 1, 1)
fn batch_jaccard(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let candidate_idx = global_id.x;
  if (candidate_idx >= params.num_candidates) {
    return;
  }

  let words_count = params.words_per_bitset;
  let q_offset = params.header_offset_u32;
  let c_offset = candidate_idx * (words_count + params.header_offset_u32) + params.header_offset_u32;

  var intersection_count: u32 = 0u;
  var union_count: u32 = 0u;

  for (var w: u32 = 0u; w < words_count; w = w + 1u) {
    let qw = query_buffer[q_offset + w];
    let cw = candidate_buffer[c_offset + w];

    let and_bits = qw & cw;
    let or_bits = qw | cw;

    intersection_count = intersection_count + countOneBits(and_bits);
    union_count = union_count + countOneBits(or_bits);
  }

  if (union_count == 0u) {
    output_similarities[candidate_idx] = 1.0;
  } else {
    output_similarities[candidate_idx] = f32(intersection_count) / f32(union_count);
  }
}

@group(0) @binding(0) var<storage, read> popcount_input: array<u32>;
@group(0) @binding(1) var<uniform> popcount_params: BitsetParams;
@group(0) @binding(2) var<storage, read_write> popcount_output: array<u32>;

@compute @workgroup_size(64, 1, 1)
fn batch_popcount(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let bitset_idx = global_id.x;
  if (bitset_idx >= popcount_params.num_candidates) {
    return;
  }

  let words_count = popcount_params.words_per_bitset;
  let offset = bitset_idx * (words_count + popcount_params.header_offset_u32) + popcount_params.header_offset_u32;

  var total_bits: u32 = 0u;
  for (var w: u32 = 0u; w < words_count; w = w + 1u) {
    total_bits = total_bits + countOneBits(popcount_input[offset + w]);
  }

  popcount_output[bitset_idx] = total_bits;
}
