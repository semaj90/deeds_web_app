struct Instance {
  position : vec2<f32>,
  authority : f32,
  entropyUtility : f32,
};

@group(0) @binding(0) var<storage, read> instances : array<Instance>;

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) intensity : f32,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex : u32, @builtin(instance_index) instanceIndex : u32) -> VSOut {
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(-0.01, -0.01), vec2<f32>(0.01, -0.01), vec2<f32>(0.01, 0.01),
    vec2<f32>(-0.01, -0.01), vec2<f32>(0.01, 0.01), vec2<f32>(-0.01, 0.01)
  );
  let item = instances[instanceIndex];
  var out : VSOut;
  out.position = vec4<f32>(item.position + corners[vertexIndex], 0.0, 1.0);
  out.intensity = clamp(0.5 * item.authority + 0.5 * item.entropyUtility, 0.0, 1.0);
  return out;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  let v = in.intensity;
  return vec4<f32>(v, v, v, 1.0);
}
