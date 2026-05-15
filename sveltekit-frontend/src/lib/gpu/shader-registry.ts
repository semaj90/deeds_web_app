/**
 * WGSL Shader Registry — shared shader source + metadata
 *
 * Plain .ts file importable by both server (status endpoints) and
 * client (gpu-compute-pipeline.ts). No $app/environment dependency.
 *
 * Shaders target WebGPU compute per W3C WebGPU Spec + WGSL Spec.
 * RTX 3060 Ti: 256-wide workgroups match 8 warps × 32 threads.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShaderSpec {
	/** Unique identifier */
	id: string;
	/** Human-readable name */
	name: string;
	/** Purpose description */
	description: string;
	/** Full WGSL source code */
	source: string;
	/** Workgroup size per dimension */
	workgroupSize: [number, number?, number?];
	/** Binding layout for the pipeline */
	bindings: ShaderBinding[];
	/** Target vector dimension (0 = variable) */
	vectorDim: number;
	/** CUDA kernel this mirrors (if any) */
	cudaMirror?: string;
	/** W3C spec reference */
	specRef?: string;
}

export interface ShaderBinding {
	/** @binding index */
	binding: number;
	/** Buffer type */
	type: 'uniform' | 'storage-read' | 'storage-read-write';
	/** Name in WGSL source */
	name: string;
	/** Data description */
	description: string;
}

// ─── Cosine Similarity ────────────────────────────────────────────────────────

/**
 * Cosine similarity kernel — mirrors rag_kernels.cu vectorized approach
 * Computes query · doc / (||query|| × ||doc||) for N documents in parallel
 *
 * W3C WGSL Spec § 12.3.5 (built-in functions: dot, length, normalize)
 * Workgroup size 256 matches RTX 3060 Ti warp scheduling (8 warps × 32)
 */
export const COSINE_SIMILARITY_WGSL = /* wgsl */ `
struct Params {
  dimension: u32,
  count: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> query: array<f32>;
@group(0) @binding(2) var<storage, read> documents: array<f32>;
@group(0) @binding(3) var<storage, read_write> results: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let doc_idx = gid.x;
  if (doc_idx >= params.count) { return; }

  let dim = params.dimension;
  let offset = doc_idx * dim;

  var dot_product: f32 = 0.0;
  var norm_q: f32 = 0.0;
  var norm_d: f32 = 0.0;

  // Unrolled 4-wide (mirrors rag_kernels.cu float4 pattern)
  let chunks = dim / 4u;
  for (var i: u32 = 0u; i < chunks; i = i + 1u) {
    let base = i * 4u;
    let q0 = query[base];
    let q1 = query[base + 1u];
    let q2 = query[base + 2u];
    let q3 = query[base + 3u];
    let d0 = documents[offset + base];
    let d1 = documents[offset + base + 1u];
    let d2 = documents[offset + base + 2u];
    let d3 = documents[offset + base + 3u];

    dot_product += q0 * d0 + q1 * d1 + q2 * d2 + q3 * d3;
    norm_q += q0 * q0 + q1 * q1 + q2 * q2 + q3 * q3;
    norm_d += d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3;
  }

  // Handle remainder
  for (var i = chunks * 4u; i < dim; i = i + 1u) {
    let q = query[i];
    let d = documents[offset + i];
    dot_product += q * d;
    norm_q += q * q;
    norm_d += d * d;
  }

  let denom = sqrt(norm_q) * sqrt(norm_d);
  results[doc_idx] = select(0.0, dot_product / denom, denom > 0.0);
}
`;

// ─── L2 Normalization ─────────────────────────────────────────────────────────

/**
 * L2 normalization kernel — normalize vectors in-place
 * Used after embedding generation for unit-vector search
 */
export const L2_NORMALIZE_WGSL = /* wgsl */ `
struct Params {
  dimension: u32,
  count: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> vectors: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let vec_idx = gid.x;
  if (vec_idx >= params.count) { return; }

  let dim = params.dimension;
  let offset = vec_idx * dim;

  var magnitude: f32 = 0.0;
  for (var i: u32 = 0u; i < dim; i = i + 1u) {
    let v = vectors[offset + i];
    magnitude += v * v;
  }
  magnitude = sqrt(magnitude);

  if (magnitude > 0.0) {
    for (var i: u32 = 0u; i < dim; i = i + 1u) {
      vectors[offset + i] = vectors[offset + i] / magnitude;
    }
  }
}
`;

// ─── Matrix Multiply ──────────────────────────────────────────────────────────

/**
 * Matrix multiply kernel — for batch embedding transforms
 * C = A × B where A is (M×K), B is (K×N)
 * 16×16 tiled workgroup for coalesced memory access
 */
export const MATMUL_WGSL = /* wgsl */ `
struct Params {
  M: u32,
  N: u32,
  K: u32,
  _pad: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> matA: array<f32>;
@group(0) @binding(2) var<storage, read> matB: array<f32>;
@group(0) @binding(3) var<storage, read_write> matC: array<f32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  let col = gid.y;
  if (row >= params.M || col >= params.N) { return; }

  var sum: f32 = 0.0;
  for (var k: u32 = 0u; k < params.K; k = k + 1u) {
    sum += matA[row * params.K + k] * matB[k * params.N + col];
  }
  matC[row * params.N + col] = sum;
}
`;

// ─── Cross-Attention Reranker ────────────────────────────────────────────────

/**
 * Cross-Attention Reranker kernel
 * Computes query-to-candidate attention scores for re-ranking.
 * Query is 768-dim, candidates are N × 768-dim.
 */
export const CROSS_ATTENTION_RERANK_WGSL = /* wgsl */ `
struct Params {
  dimension: u32,
  count: u32,
  scale: f32,
  _pad: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> query: array<f32>;
@group(0) @binding(2) var<storage, read> candidates: array<f32>;
@group(0) @binding(3) var<storage, read_write> scores: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.count) { return; }

  let dim = params.dimension;
  let offset = idx * dim;

  var dot: f32 = 0.0;
  for (var i: u32 = 0u; i < dim; i = i + 1u) {
    dot += query[i] * candidates[offset + i];
  }

  scores[idx] = dot * params.scale;
}
`;

// ─── Topological Manifold Filter ───────────────────────────────────────────

/**
 * Topological Manifold Filter kernel
 * Computes min-distance to a set of centroids for manifold projection.
 * Used to filter outliers and prioritize "on-manifold" retrieval hits.
 */
export const TOPOLOGICAL_FILTER_WGSL = /* wgsl */ `
struct Params {
  dimension: u32,
  candidateCount: u32,
  centroidCount: u32,
  threshold: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> candidates: array<f32>;
@group(0) @binding(2) var<storage, read> centroids: array<f32>;
@group(0) @binding(3) var<storage, read_write> distances: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.candidateCount) { return; }

  let dim = params.dimension;
  let candOffset = idx * dim;

  var min_dist: f32 = 1e10;

  for (var c: u32 = 0u; c < params.centroidCount; c = c + 1u) {
    let centOffset = c * dim;
    var dist: f32 = 0.0;
    for (var i: u32 = 0u; i < dim; i = i + 1u) {
      let diff = candidates[candOffset + i] - centroids[centOffset + i];
      dist += diff * diff;
    }
    min_dist = min(min_dist, dist);
  }

  distances[idx] = min_dist;
}
`;

// ─── Shader Registry ──────────────────────────────────────────────────────────

export const SHADER_REGISTRY: ShaderSpec[] = [
	{
		id: 'cosine_similarity',
		name: 'Cosine Similarity',
		description: 'Batch cosine similarity — query vs N document vectors (768-dim). 4-wide unrolled inner loop mirrors CUDA rag_kernels.cu float4 pattern.',
		source: COSINE_SIMILARITY_WGSL,
		workgroupSize: [256],
		bindings: [
			{ binding: 0, type: 'uniform', name: 'params', description: 'Params { dimension: u32, count: u32 }' },
			{ binding: 1, type: 'storage-read', name: 'query', description: 'Query embedding array<f32> (768 floats)' },
			{ binding: 2, type: 'storage-read', name: 'documents', description: 'Document embeddings array<f32> (N × 768 floats, flat)' },
			{ binding: 3, type: 'storage-read-write', name: 'results', description: 'Output similarities array<f32> (N floats)' }
		],
		vectorDim: 768,
		cudaMirror: 'deeds_labs/cuda-grpc-stubs/cuda/rag_kernels.cu',
		specRef: 'W3C WGSL Spec § 12.3.5'
	},
	{
		id: 'l2_normalize',
		name: 'L2 Normalization',
		description: 'In-place L2 normalization of embedding vectors. Produces unit vectors for cosine similarity search.',
		source: L2_NORMALIZE_WGSL,
		workgroupSize: [256],
		bindings: [
			{ binding: 0, type: 'uniform', name: 'params', description: 'Params { dimension: u32, count: u32 }' },
			{ binding: 1, type: 'storage-read-write', name: 'vectors', description: 'Vectors array<f32> (N × dim floats, normalized in-place)' }
		],
		vectorDim: 768,
		specRef: 'W3C WGSL Spec § 12.3.5'
	},
	{
		id: 'matmul',
		name: 'Matrix Multiply',
		description: 'General matrix multiply C = A × B for batch embedding transforms. 16×16 tiled workgroup for coalesced memory access.',
		source: MATMUL_WGSL,
		workgroupSize: [16, 16],
		bindings: [
			{ binding: 0, type: 'uniform', name: 'params', description: 'Params { M: u32, N: u32, K: u32, _pad: u32 }' },
			{ binding: 1, type: 'storage-read', name: 'matA', description: 'Matrix A array<f32> (M × K floats)' },
			{ binding: 2, type: 'storage-read', name: 'matB', description: 'Matrix B array<f32> (K × N floats)' },
			{ binding: 3, type: 'storage-read-write', name: 'matC', description: 'Output C array<f32> (M × N floats)' }
		],
		vectorDim: 0,
		specRef: 'W3C WebGPU Spec § 11.1'
	},
	{
		id: 'pagerank-iter',
		name: 'PageRank Power Iteration',
		description: 'WebGPU power-iteration PageRank on transposed CSR graph (1 dispatch = 1 iteration). Mirrors pytorch-graph.ts pageRankGPU() for browser-side codebase scoring.',
		source: `// See src/lib/webgpu/pagerank.wgsl — inlined in webgpu-pagerank.ts`,
		workgroupSize: [256],
		bindings: [
			{ binding: 0, type: 'uniform',           name: 'params',      description: 'PageRankParams { n: u32, damping: f32, _pad×2 }' },
			{ binding: 1, type: 'storage-read',      name: 'row_offsets', description: 'Transposed CSR row offsets (n+1 u32s)' },
			{ binding: 2, type: 'storage-read',      name: 'col_indices', description: 'Transposed CSR column indices (edge u32s)' },
			{ binding: 3, type: 'storage-read',      name: 'out_degree',  description: '1/out-degree per node (f32, 0 = dangling)' },
			{ binding: 4, type: 'storage-read',      name: 'scores_in',   description: 'Current PageRank scores (f32 × n)' },
			{ binding: 5, type: 'storage-read-write',name: 'scores_out',  description: 'Next PageRank scores (f32 × n)' },
		],
		vectorDim: 0,
		cudaMirror: 'pageRankGPU (pytorch-graph.ts)',
		specRef: 'W3C WebGPU Spec § 11.1'
	},
	{
		id: 'cross_attention_rerank',
		name: 'Cross-Attention Reranker',
		description: 'WebGPU-accelerated cross-attention scoring for retrieval re-ranking. Query (768d) vs N candidates.',
		source: CROSS_ATTENTION_RERANK_WGSL,
		workgroupSize: [256],
		bindings: [
			{ binding: 0, type: 'uniform', name: 'params', description: 'Params { dimension: u32, count: u32, scale: f32 }' },
			{ binding: 1, type: 'storage-read', name: 'query', description: 'Query embedding (768 floats)' },
			{ binding: 2, type: 'storage-read', name: 'candidates', description: 'Candidate embeddings (N × 768 floats)' },
			{ binding: 3, type: 'storage-read-write', name: 'scores', description: 'Output attention scores (N floats)' }
		],
		vectorDim: 768
	},
	{
		id: 'topological_filter',
		name: 'Topological Manifold Filter',
		description: 'High-speed topological distance filtering. Projects candidates onto a manifold defined by K-means centroids.',
		source: TOPOLOGICAL_FILTER_WGSL,
		workgroupSize: [256],
		bindings: [
			{ binding: 0, type: 'uniform', name: 'params', description: 'Params { dimension: u32, candidateCount: u32, centroidCount: u32, threshold: f32 }' },
			{ binding: 1, type: 'storage-read', name: 'candidates', description: 'Candidate embeddings (N × 768 floats)' },
			{ binding: 2, type: 'storage-read', name: 'centroids', description: 'Manifold centroids (K × 768 floats)' },
			{ binding: 3, type: 'storage-read-write', name: 'distances', description: 'Min-distance to manifold (N floats)' }
		],
		vectorDim: 768
	}
];

/** Get a shader spec by ID */
export function getShader(id: string): ShaderSpec | undefined {
	return SHADER_REGISTRY.find((s) => s.id === id);
}

/** Get all shader IDs */
export function getShaderIds(): string[] {
	return SHADER_REGISTRY.map((s) => s.id);
}
