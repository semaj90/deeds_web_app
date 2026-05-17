# WebGPU & WGSL Compute Shader Reference Manual

This specification manual details render pipelines, compute shaders, and bind group configurations in WebGPU and WebGPU Shading Language (WGSL), optimized for high-throughput browser GPU computation.

---

## 1. WebGPU Context and Device Initialization

WebGPU execution requires requesting the GPU adapter, obtaining the logical device, and configuring the canvas context.

```javascript
async function initWebGPU(canvas) {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not supported on this browser.");
  }

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: format,
    alphaMode: "opaque"
  });

  return { device, context, format };
}
```

---

## 2. Bind Groups and Layouts

Bind groups map external JavaScript CPU memory buffers directly to shader-accessible bindings on the GPU.

```javascript
// Define a Bind Group Layout
const bindGroupLayout = device.createBindGroupLayout({
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "read-only-storage" }
    },
    {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "storage" }
    }
  ]
});

// Create the Bind Group referencing active buffers
const bindGroup = device.createBindGroup({
  layout: bindGroupLayout,
  entries: [
    { binding: 0, resource: { buffer: inputBuffer } },
    { binding: 1, resource: { buffer: outputBuffer } }
  ]
});
```

---

## 3. WGSL Compute Shader Specification

WebGPU Shading Language (WGSL) defines GPGPU compute kernels that execute in parallel over three-dimensional workgroups.

```wgsl
@group(0) @binding(0) var inputData: array;
@group(0) @binding(1) var outputData: array;

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3) {
  let index = id.x;
  
  // Guard against out-of-bounds array indexing
  if (index >= arrayLength(&inputData)) {
    return;
  }
  
  // Compute kernel operation
  outputData[index] = inputData[index] * 2.0;
}
```