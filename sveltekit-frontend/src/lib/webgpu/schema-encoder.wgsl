struct DocFeatures {
  trust_tier: f32,
  som_cluster: f32,
  karpathy_blend: f32,
  pagerank: f32,
  risk_score: f32,
};

@group(0) @binding(0) var<storage, read> docs: array<DocFeatures>;
@group(0) @binding(1) var<storage, read_write> scores: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let row = global_id.x;
  if (row >= arrayLength(&docs)) {
    return;
  }
  let doc = docs[row];
  scores[row] = (doc.trust_tier * 0.3) + (doc.karpathy_blend * 0.5) + ((1.0 - doc.risk_score) * 0.2);
}
