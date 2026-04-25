/**
 * WebGPU Compute Kernels for Evidence Canvas
 * Force-directed graph layout, similarity computation, and graph analysis
 */

// ============================================================================
// Force-Directed Graph Layout Kernel
// ============================================================================

export const forceLayoutKernel = `
struct Node {
    position: vec2<f32>,
    velocity: vec2<f32>,
    mass: f32,
    fixed: u32,
};

struct Edge {
    source: u32,
    target: u32,
    strength: f32,
    length: f32,
};

struct Params {
    node_count: u32,
    edge_count: u32,
    delta_time: f32,
    repulsion_strength: f32,
    attraction_strength: f32,
    damping: f32,
    max_velocity: f32,
};

@group(0) @binding(0) var<storage, read_write> nodes: array<Node>;
@group(0) @binding(1) var<storage, read> edges: array<Edge>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let node_idx = global_id.x;
    if (node_idx >= params.node_count) {
        return;
    }

    var node = nodes[node_idx];
    if (node.fixed == 1u) {
        return;
    }

    var force = vec2<f32>(0.0, 0.0);

    // Calculate repulsive forces from all other nodes
    for (var i = 0u; i < params.node_count; i = i + 1u) {
        if (i == node_idx) {
            continue;
        }

        let other = nodes[i];
        let diff = node.position - other.position;
        let distance = length(diff);

        if (distance > 0.0) {
            let repulsive_force = params.repulsion_strength * node.mass * other.mass / (distance * distance);
            force = force + normalize(diff) * repulsive_force / distance;
        }
    }

    // Calculate attractive forces from connected edges
    for (var i = 0u; i < params.edge_count; i = i + 1u) {
        let edge = edges[i];

        var connected = false;
        if (edge.source == node_idx) {
            connected = true;
        }
        if (edge.target == node_idx) {
            connected = true;
        }

        if (connected) {
            let other_idx = select(edge.target, edge.source, edge.source == node_idx);
            let other = nodes[other_idx];
            let diff = other.position - node.position;
            let distance = length(diff);

            if (distance > 0.0) {
                let attractive_force = params.attraction_strength * edge.strength * (distance - edge.length) / distance;
                force = force + normalize(diff) * attractive_force;
            }
        }
    }

    // Apply force to velocity
    node.velocity = node.velocity + force * params.delta_time / node.mass;

    // Apply damping
    node.velocity = node.velocity * params.damping;

    // Limit velocity
    let speed = length(node.velocity);
    if (speed > params.max_velocity) {
        node.velocity = node.velocity * (params.max_velocity / speed);
    }

    // Update position
    node.position = node.position + node.velocity * params.delta_time;

    // Write back
    nodes[node_idx] = node;
}
`;

// ============================================================================
// Cosine Similarity Kernel (for case similarity analysis)
// ============================================================================

export const cosineSimilarityKernel = `
struct Params {
    vector_count: u32,
    vector_dim: u32,
};

@group(0) @binding(0) var<storage, read> vectors: array<f32>;
@group(0) @binding(1) var<storage, read_write> similarities: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    let j = global_id.y;

    if (i >= params.vector_count || j >= params.vector_count || i >= j) {
        return;
    }

    // Calculate dot product and magnitudes
    var dot_product = 0.0;
    var mag_i = 0.0;
    var mag_j = 0.0;

    for (var d = 0u; d < params.vector_dim; d = d + 1u) {
        let val_i = vectors[i * params.vector_dim + d];
        let val_j = vectors[j * params.vector_dim + d];

        dot_product = dot_product + val_i * val_j;
        mag_i = mag_i + val_i * val_i;
        mag_j = mag_j + val_j * val_j;
    }

    mag_i = sqrt(mag_i);
    mag_j = sqrt(mag_j);

    // Calculate cosine similarity
    var similarity = 0.0;
    if (mag_i > 0.0 && mag_j > 0.0) {
        similarity = dot_product / (mag_i * mag_j);
    }

    // Store symmetric matrix (upper triangle)
    similarities[i * params.vector_count + j] = similarity;
    similarities[j * params.vector_count + i] = similarity;
}
`;

// ============================================================================
// Parallel Reduction Kernel (for aggregating similarity scores)
// ============================================================================

export const reductionKernel = `
struct Params {
    size: u32,
};

@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>,
        @builtin(local_invocation_id) local_id: vec3<u32>,
        @builtin(workgroup_id) workgroup_id: vec3<u32>) {

    var sum = 0.0;

    // Load and sum elements for this workgroup
    for (var i = global_id.x; i < params.size; i = i + 256u * 256u) {
        sum = sum + input[i];
    }

    // Shared memory for workgroup reduction
    var shared: array<f32, 256>;
    shared[local_id.x] = sum;
    workgroupBarrier();

    // Parallel reduction in shared memory
    for (var stride = 128u; stride > 0u; stride = stride / 2u) {
        if (local_id.x < stride) {
            shared[local_id.x] = shared[local_id.x] + shared[local_id.x + stride];
        }
        workgroupBarrier();
    }

    // Write result for this workgroup
    if (local_id.x == 0u) {
        output[workgroup_id.x] = shared[0];
    }
}
`;

// ============================================================================
// Graph Highlighting Kernel (for visual emphasis of similar cases)
// ============================================================================

export const highlightKernel = `
struct Node {
    position: vec2<f32>,
    highlight: f32,
    cluster_id: u32,
};

struct Params {
    node_count: u32,
    threshold: f32,
};

@group(0) @binding(0) var<storage, read_write> nodes: array<Node>;
@group(0) @binding(1) var<storage, read> similarities: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let node_idx = global_id.x;
    if (node_idx >= params.node_count) {
        return;
    }

    var node = nodes[node_idx];
    var max_similarity = 0.0;
    var best_cluster = node.cluster_id;

    // Find most similar node above threshold
    for (var i = 0u; i < params.node_count; i = i + 1u) {
        if (i == node_idx) {
            continue;
        }

        let similarity = similarities[node_idx * params.node_count + i];
        if (similarity > params.threshold && similarity > max_similarity) {
            max_similarity = similarity;
            best_cluster = nodes[i].cluster_id;
        }
    }

    // Update highlight and cluster
    node.highlight = max_similarity;
    node.cluster_id = best_cluster;

    nodes[node_idx] = node;
}
`;

// ============================================================================
// Utility functions for kernel management
// ============================================================================

export function createForceLayoutPipeline(device: GPUDevice): GPUComputePipeline {
  const shader = device.createShaderModule({
    code: forceLayoutKernel,
    label: 'force-layout-shader'
  });

  return device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: shader,
      entryPoint: 'main'
    },
    label: 'force-layout-pipeline'
  });
}

export function createSimilarityPipeline(device: GPUDevice): GPUComputePipeline {
  const shader = device.createShaderModule({
    code: cosineSimilarityKernel,
    label: 'similarity-shader'
  });

  return device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: shader,
      entryPoint: 'main'
    },
    label: 'similarity-pipeline'
  });
}

export function createReductionPipeline(device: GPUDevice): GPUComputePipeline {
  const shader = device.createShaderModule({
    code: reductionKernel,
    label: 'reduction-shader'
  });

  return device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: shader,
      entryPoint: 'main'
    },
    label: 'reduction-pipeline'
  });
}

export function createHighlightPipeline(device: GPUDevice): GPUComputePipeline {
  const shader = device.createShaderModule({
    code: highlightKernel,
    label: 'highlight-shader'
  });

  return device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: shader,
      entryPoint: 'main'
    },
    label: 'highlight-pipeline'
  });
}