// Parent Atlas WebGPU decision-function references.
// Browser/WebGPU is a visualization/lightweight executor only; it is not the
// canonical training, retrieval, or workflow owner.

struct Params {
  n: u32,
  alpha: f32,
  beta: f32,
  pad: f32,
}

@group(0) @binding(0) var<storage, read> input_values: array<f32>;
@group(0) @binding(1) var<storage, read_write> output_values: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

fn sigmoid_scalar(x: f32) -> f32 {
  return 1.0 / (1.0 + exp(-x));
}

fn lerp_clamped(a: f32, b: f32, t: f32) -> f32 {
  let u = clamp(t, 0.0, 1.0);
  return a + (b - a) * u;
}

@compute @workgroup_size(256)
fn sigmoid_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.n) { return; }
  output_values[i] = sigmoid_scalar(input_values[i]);
}

@compute @workgroup_size(256)
fn interpolation_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.n) { return; }
  output_values[i] = lerp_clamped(input_values[i], params.beta, params.alpha);
}

// TODO(WEBGPU-SOFTMAX): stable softmax requires a reduction for max and sum.
// Implement it as explicit multi-pass workgroup reductions and compare against
// the TypeScript/PyTorch reference before promotion.
//
// TODO(WEBGPU-SPARSEMAX): implement sort/threshold only when browser-side sparse
// visualization/classification materially benefits; it is not required for the
// canonical server pipeline.
//
// TODO(WEBGPU-SQUAREMAX): experimental only. Any attention use requires a
// model-specific retraining/quality receipt; do not substitute it into pretrained
// attention merely because the shader is cheaper than exp().
