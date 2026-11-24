<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { WebGPUAutoencoder } from '$lib/webgpu/webgpu-autoencoder';
  import {
    createHypergraphVertexWorker,
    streamHypergraphVerticesToWorker,
  } from '$lib/gpu/hypergraph-vertex-client';
  import { WGSL_UNIFORM_ALIGNMENT } from '$lib/gpu/arpc-envelope-v1';

  interface Node {
    id: string;
    label: string;
    x: number;
    y: number;
    z: number;
    w: number; // 4th dimension for color/size/time
    color: [number, number, number, number];
  }

  let {
    nodes = [],
    width = 800,
    height = 600,
    charProgress = 1.0,
    vertexStreamPayload = null,
    onSelectNode = () => {},
  } = $props<{
    nodes: Node[];
    width?: number;
    height?: number;
    charProgress?: number;
    vertexStreamPayload?: ArrayBuffer | null;
    onSelectNode?: (node: Node) => void;
  }>();

  let canvas: HTMLCanvasElement;
  let device: GPUDevice;
  let context: GPUCanvasContext;
  let pipeline: GPURenderPipeline;
  let vertexBuffer: GPUBuffer;
  let uniformBuffer: GPUBuffer;
  let vertexWorker: Worker | null = null;
  let activeVertexCount = 0;

  let animationFrame: number;
  let rotation = { x: 0, y: 0 };
  let zoom = 1.0;

  // Shaders (80B Uniforms = 16-byte aligned: 64B mat4x4 + 4B pointSize + 4B charProgress + 8B pad)
  const UNIFORM_BUFFER_BYTES = 80;
  const vertexShader = `
    struct Uniforms {
      matrix: mat4x4<f32>,
      pointSize: f32,
      charProgress: f32,
    };
    @group(0) @binding(0) var<uniform> uniforms: Uniforms;

    struct VertexOutput {
      @builtin(position) position: vec4<f32>,
      @location(0) color: vec4<f32>,
    };

    @vertex
    fn main(@location(0) pos: vec4<f32>, @location(1) color: vec4<f32>) -> VertexOutput {
      var output: VertexOutput;
      output.position = uniforms.matrix * vec4<f32>(pos.xyz, 1.0);
      output.color = vec4<f32>(color.rgb, color.a * clamp(uniforms.charProgress, 0.0, 1.0));
      return output;
    }
  `;

  const fragmentShader = `
    @fragment
    fn main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
      return color;
    }
  `;

  onMount(async () => {
    if (!navigator.gpu) return;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    device = await adapter.requestDevice();
    context = canvas.getContext('webgpu')!;

    const format = navigator.gpu.getPreferredCanvasFormat() as GPUTextureFormat;
    context.configure({ device, format, alphaMode: 'premultiplied' });

    const vertexModule = device.createShaderModule({ code: vertexShader });
    const fragmentModule = device.createShaderModule({ code: fragmentShader });

    pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
        buffers: [{
          arrayStride: 32, // 4 floats pos + 4 floats color
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x4' },
            { shaderLocation: 1, offset: 16, format: 'float32x4' },
          ],
        }],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'main',
        targets: [{ format }],
      },
      primitive: { topology: 'point-list' },
    });

    if (vertexStreamPayload && typeof Worker !== 'undefined') {
      vertexWorker = createHypergraphVertexWorker();
      const unpacked = await streamHypergraphVerticesToWorker(vertexWorker, vertexStreamPayload);
      uploadUnpackedVertices(unpacked.positions, unpacked.manifoldWeights, unpacked.charProgress, unpacked.vertexCount);
    } else {
      updateBuffers();
    }
    render();
  });

  onDestroy(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    vertexWorker?.terminate();
  });

  function ensureUniformBuffer() {
    if (!uniformBuffer) {
      const alignedSize = Math.ceil(UNIFORM_BUFFER_BYTES / WGSL_UNIFORM_ALIGNMENT) * WGSL_UNIFORM_ALIGNMENT;
      uniformBuffer = device.createBuffer({
        size: alignedSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
  }

  function uploadUnpackedVertices(
    positions: Float32Array,
    weights: Float32Array,
    progress: Float32Array,
    count: number
  ) {
    if (!device || count === 0) return;
    activeVertexCount = count;
    const data = new Float32Array(count * 8);
    for (let i = 0; i < count; i++) {
      const idx = i * 8;
      data[idx] = positions[i * 3 + 0];
      data[idx + 1] = positions[i * 3 + 1];
      data[idx + 2] = positions[i * 3 + 2];
      data[idx + 3] = weights[i];
      data[idx + 4] = 0.25;
      data[idx + 5] = 0.85;
      data[idx + 6] = 0.65;
      data[idx + 7] = progress[i];
    }
    if (vertexBuffer) vertexBuffer.destroy();
    vertexBuffer = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(vertexBuffer.getMappedRange()).set(data);
    vertexBuffer.unmap();
    ensureUniformBuffer();
  }

  function updateBuffers() {
    if (!device || nodes.length === 0) return;
    activeVertexCount = nodes.length;

    const data = new Float32Array(nodes.length * 8);
    nodes.forEach((node, i) => {
      const idx = i * 8;
      data[idx] = node.x;
      data[idx + 1] = node.y;
      data[idx + 2] = node.z;
      data[idx + 3] = node.w;
      data[idx + 4] = node.color[0];
      data[idx + 5] = node.color[1];
      data[idx + 6] = node.color[2];
      data[idx + 7] = node.color[3];
    });

    if (vertexBuffer) vertexBuffer.destroy();
    vertexBuffer = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(vertexBuffer.getMappedRange()).set(data);
    vertexBuffer.unmap();
    ensureUniformBuffer();
  }

  function render() {
    if (!device || !pipeline || !vertexBuffer) return;

    const uniformFloats = new Float32Array(UNIFORM_BUFFER_BYTES / 4);
    uniformFloats[0] = zoom;
    uniformFloats[5] = zoom;
    uniformFloats[10] = zoom;
    uniformFloats[15] = 1.0;
    uniformFloats[16] = 4.0; // pointSize
    uniformFloats[17] = Math.max(0, Math.min(1, charProgress));

    device.queue.writeBuffer(uniformBuffer, 0, uniformFloats);
    device.queue.writeBuffer(uniformBuffer, 64, new Float32Array([10.0])); // pointSize

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.05, g: 0.05, b: 0.05, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0) as GPUBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.draw(activeVertexCount || nodes.length);
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
    animationFrame = requestAnimationFrame(render);
  }

  $effect(() => {
    updateBuffers();
  });
</script>

<div class="webgpu-container" style:width="{width}px" style:height="{height}px">
  <canvas bind:this={canvas} {width} {height}></canvas>
  <div class="overlay">
    <div class="stats">Nodes: {nodes.length}</div>
    <div class="controls">
      <button onclick={() => zoom *= 1.1}>+</button>
      <button onclick={() => zoom /= 1.1}>-</button>
    </div>
  </div>
</div>

<style>
  .webgpu-container {
    position: relative;
    border: 1px solid #333;
    background: #000;
    border-radius: 8px;
    overflow: hidden;
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
  .overlay {
    position: absolute;
    top: 10px;
    left: 10px;
    pointer-events: none;
    color: #0f0;
    font-family: monospace;
    font-size: 12px;
  }
  .controls {
    position: absolute;
    bottom: 10px;
    right: 10px;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  button {
    background: rgba(0,0,0,0.5);
    color: #fff;
    border: 1px solid #555;
    padding: 5px 10px;
    cursor: pointer;
  }
</style>
