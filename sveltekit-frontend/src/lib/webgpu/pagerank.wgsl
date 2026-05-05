// WebGPU PageRank — power-iteration (sparse CSR format)
//
// Adjacency stored as Compressed Sparse Row (CSR):
//   col_indices[]  — destination node per edge
//   row_offsets[]  — row_offsets[i]..row_offsets[i+1] = edges from node i
//   n              — total node count
//   damping        — damping factor (0.85)
//
// Two ping-pong score buffers avoid read/write hazards.
// Each dispatch iteration: scores_in → scores_out.
// Host runs N iterations, reading final result from scores_out.
//
// Workgroup 256 → maps 1 thread per node. For n > 65536 increase dispatch x.

struct PageRankParams {
  n:       u32,   // node count
  damping: f32,   // typically 0.85
  _pad0:   u32,
  _pad1:   u32,
}

@group(0) @binding(0) var<uniform>           params:      PageRankParams;
@group(0) @binding(1) var<storage, read>     row_offsets: array<u32>;   // n+1 entries
@group(0) @binding(2) var<storage, read>     col_indices: array<u32>;   // edge list
@group(0) @binding(3) var<storage, read>     out_degree:  array<f32>;   // 1/degree per node (0 → dangling)
@group(0) @binding(4) var<storage, read>     scores_in:   array<f32>;   // current PR scores
@group(0) @binding(5) var<storage, read_write> scores_out: array<f32>;  // next PR scores

@compute @workgroup_size(256)
fn pagerank_iter(@builtin(global_invocation_id) gid: vec3<u32>) {
  let node = gid.x;
  if (node >= params.n) { return; }

  let n       = params.n;
  let d       = params.damping;
  let teleport = (1.0 - d) / f32(n);

  // Sum contribution from all in-neighbours.
  // CSR stores OUT-edges, so we need the transpose.
  // We pre-build the transposed CSR on the host: row_offsets/col_indices here
  // represent the TRANSPOSE graph (in-edges per node).
  var rank_sum = 0.0;
  let start = row_offsets[node];
  let end   = row_offsets[node + 1u];

  for (var e = start; e < end; e = e + 1u) {
    let src = col_indices[e];
    rank_sum = rank_sum + scores_in[src] * out_degree[src];
  }

  scores_out[node] = teleport + d * rank_sum;
}

// ── Dangling node redistribution pass ──────────────────────────────────────
// Nodes with out_degree == 0 donate rank uniformly.
// Host computes dangling_sum = sum(scores_in[i] for i where out_degree[i]==0)
// and passes it via a 1-float uniform. This kernel adds dangling/n to every node.

struct DanglingParams {
  n:           u32,
  dangling_sum: f32,
  _pad0:       u32,
  _pad1:       u32,
}

@group(0) @binding(0) var<uniform>            dparams: DanglingParams;
@group(0) @binding(1) var<storage, read_write> scores:  array<f32>;

@compute @workgroup_size(256)
fn add_dangling(@builtin(global_invocation_id) gid: vec3<u32>) {
  let node = gid.x;
  if (node >= dparams.n) { return; }
  scores[node] = scores[node] + dparams.dangling_sum / f32(dparams.n);
}

// ── L1-normalise pass ───────────────────────────────────────────────────────
// After all iterations, normalise so scores sum to 1.
// Host reads back scores, computes sum, uploads, dispatches this kernel.

struct NormParams {
  n:   u32,
  inv: f32,  // 1.0 / sum
  _p0: u32,
  _p1: u32,
}

@group(0) @binding(0) var<uniform>            nparams: NormParams;
@group(0) @binding(1) var<storage, read_write> scores:  array<f32>;

@compute @workgroup_size(256)
fn normalise(@builtin(global_invocation_id) gid: vec3<u32>) {
  let node = gid.x;
  if (node >= nparams.n) { return; }
  scores[node] = scores[node] * nparams.inv;
}
