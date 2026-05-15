// Legal Document Processing Compute Shaders
// WebGPU WGSL kernels for evidence analysis and vector operations

// Vector normalization kernel
@group(0) @binding(0)
var<storage, read> input_vectors: array<f32>;

@group(0) @binding(1)
var<storage, read_write> output_vectors: array<f32>;

@group(0) @binding(2)
var<uniform> params: vec4<u32>; // x: vector_dim, y: batch_size

@compute @workgroup_size(256)
fn normalize_vectors(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let vector_idx = global_id.x / params.x;
    let element_idx = global_id.x % params.x;

    if (vector_idx >= params.y) {
        return;
    }

    let start_idx = vector_idx * params.x;
    var sum_sq = 0.0;

    // Calculate L2 norm
    for (var i = 0u; i < params.x; i = i + 1u) {
        let val = input_vectors[start_idx + i];
        sum_sq = sum_sq + val * val;
    }

    let norm = sqrt(sum_sq);
    if (norm > 0.0) {
        output_vectors[start_idx + element_idx] = input_vectors[start_idx + element_idx] / norm;
    } else {
        output_vectors[start_idx + element_idx] = 0.0;
    }
}

// Cosine similarity kernel
@group(1) @binding(0)
var<storage, read> query_vector: array<f32>;

@group(1) @binding(1)
var<storage, read> document_vectors: array<f32>;

@group(1) @binding(2)
var<storage, read_write> similarities: array<f32>;

@group(1) @binding(3)
var<uniform> similarity_params: vec4<u32>; // x: vector_dim, y: num_docs

@compute @workgroup_size(256)
fn cosine_similarity(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let doc_idx = global_id.x;

    if (doc_idx >= similarity_params.y) {
        return;
    }

    let doc_start = doc_idx * similarity_params.x;
    var dot_product = 0.0;
    var query_norm_sq = 0.0;
    var doc_norm_sq = 0.0;

    // Calculate dot product and norms
    for (var i = 0u; i < similarity_params.x; i = i + 1u) {
        let q_val = query_vector[i];
        let d_val = document_vectors[doc_start + i];

        dot_product = dot_product + q_val * d_val;
        query_norm_sq = query_norm_sq + q_val * q_val;
        doc_norm_sq = doc_norm_sq + d_val * d_val;
    }

    let query_norm = sqrt(query_norm_sq);
    let doc_norm = sqrt(doc_norm_sq);

    if (query_norm > 0.0 && doc_norm > 0.0) {
        similarities[doc_idx] = dot_product / (query_norm * doc_norm);
    } else {
        similarities[doc_idx] = 0.0;
    }
}

// Matrix multiplication kernel for transformer attention
@group(2) @binding(0)
var<storage, read> matrix_a: array<f32>;

@group(2) @binding(1)
var<storage, read> matrix_b: array<f32>;

@group(2) @binding(2)
var<storage, read_write> matrix_c: array<f32>;

@group(2) @binding(3)
var<uniform> matrix_dims: vec4<u32>; // x: M, y: K, z: N

@compute @workgroup_size(16, 16)
fn matrix_multiply(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let row = global_id.x;
    let col = global_id.y;

    if (row >= matrix_dims.x || col >= matrix_dims.z) {
        return;
    }

    var sum = 0.0;
    for (var k = 0u; k < matrix_dims.y; k = k + 1u) {
        let a_idx = row * matrix_dims.y + k;
        let b_idx = k * matrix_dims.z + col;
        sum = sum + matrix_a[a_idx] * matrix_b[b_idx];
    }

    let c_idx = row * matrix_dims.z + col;
    matrix_c[c_idx] = sum;
}

// Softmax kernel for transformer outputs
@group(3) @binding(0)
var<storage, read> input_logits: array<f32>;

@group(3) @binding(1)
var<storage, read_write> output_probs: array<f32>;

@group(3) @binding(2)
var<uniform> softmax_params: vec4<u32>; // x: seq_len, y: vocab_size

@compute @workgroup_size(256)
fn softmax(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let seq_idx = global_id.x / softmax_params.y;
    let vocab_idx = global_id.x % softmax_params.y;

    if (seq_idx >= softmax_params.x) {
        return;
    }

    let start_idx = seq_idx * softmax_params.y;

    // Find max value for numerical stability
    var max_val = -3.4028235e+38; // -FLT_MAX
    for (var i = 0u; i < softmax_params.y; i = i + 1u) {
        max_val = max(max_val, input_logits[start_idx + i]);
    }

    // Compute exp and sum
    var sum_exp = 0.0;
    for (var i = 0u; i < softmax_params.y; i = i + 1u) {
        let exp_val = exp(input_logits[start_idx + i] - max_val);
        output_probs[start_idx + i] = exp_val;
        sum_exp = sum_exp + exp_val;
    }

    // Normalize
    if (sum_exp > 0.0) {
        output_probs[start_idx + vocab_idx] = output_probs[start_idx + vocab_idx] / sum_exp;
    } else {
        output_probs[start_idx + vocab_idx] = 1.0 / f32(softmax_params.y);
    }
}

// Evidence clustering kernel using k-means
@group(4) @binding(0)
var<storage, read> embeddings: array<f32>;

@group(4) @binding(1)
var<storage, read> centroids: array<f32>;

@group(4) @binding(2)
var<storage, read_write> assignments: array<u32>;

@group(4) @binding(3)
var<storage, read_write> new_centroids: array<f32>;

@group(4) @binding(4)
var<storage, read_write> cluster_counts: array<u32>;

@group(4) @binding(5)
var<uniform> clustering_params: vec4<u32>; // x: num_vectors, y: vector_dim, z: num_clusters

@compute @workgroup_size(256)
fn kmeans_assignment(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let vector_idx = global_id.x;

    if (vector_idx >= clustering_params.x) {
        return;
    }

    let vector_start = vector_idx * clustering_params.y;
    var best_cluster = 0u;
    var best_distance = 3.4028235e+38; // FLT_MAX

    // Find closest centroid
    for (var c = 0u; c < clustering_params.z; c = c + 1u) {
        let centroid_start = c * clustering_params.y;
        var distance = 0.0;

        for (var d = 0u; d < clustering_params.y; d = d + 1u) {
            let diff = embeddings[vector_start + d] - centroids[centroid_start + d];
            distance = distance + diff * diff;
        }

        if (distance < best_distance) {
            best_distance = distance;
            best_cluster = c;
        }
    }

    assignments[vector_idx] = best_cluster;
}

@compute @workgroup_size(256)
fn kmeans_update_centroids(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let cluster_idx = global_id.x;

    if (cluster_idx >= clustering_params.z) {
        return;
    }

    let centroid_start = cluster_idx * clustering_params.y;
    var count = 0u;

    // Zero out new centroids
    for (var d = 0u; d < clustering_params.y; d = d + 1u) {
        new_centroids[centroid_start + d] = 0.0;
    }

    // Accumulate vectors for this cluster
    for (var v = 0u; v < clustering_params.x; v = v + 1u) {
        if (assignments[v] == cluster_idx) {
            let vector_start = v * clustering_params.y;
            for (var d = 0u; d < clustering_params.y; d = d + 1u) {
                new_centroids[centroid_start + d] = new_centroids[centroid_start + d] + embeddings[vector_start + d];
            }
            count = count + 1u;
        }
    }

    cluster_counts[cluster_idx] = count;

    // Average to get new centroid
    if (count > 0u) {
        for (var d = 0u; d < clustering_params.y; d = d + 1u) {
            new_centroids[centroid_start + d] = new_centroids[centroid_start + d] / f32(count);
        }
    }
}
