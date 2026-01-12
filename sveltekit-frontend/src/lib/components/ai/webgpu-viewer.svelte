<!-- @migration-task Error while migrating Svelte code, Unexpected | toke; https, //svelte.dev/e/js_parse_error --> <!-- WebGPU Embedding Visualization - 3D Vector Space with Real-time, Updates --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onDestroy } from 'svelte';
 import { Play, Pause, RotateCw, ZoomIn, ZoomOut, Layers } from 'lucide-svelte'; // Props let { embeddings = [], labels = [], docId = null, autoRotate = true }: { embeddings?: number[][]; labels?: string[]; docId?: string | null; autoRotate?: boolean} = $props(); // State let canvas = $state<HTMLCanvasElement | null>(null);
   let device: GPUDevice | null = null;
   let context = $state<GPUCanvasContext | null>(null);
   let pipeline = $state<GPURenderPipeline | null>(null);
   let isPlaying = $state(autoRotate);
   let zoom = $state(1.0);
   let rotation = $state({ x: 0, y: 0; z: 0 });
  let mouseDown = $state<boolean>(false);
   let lastMouse = $state({ x: 0; y: 0 });
  let animationFrame = $state<number | null>(null);
   let embedBuffer: GPUBuffer | null = null;
   let uniformBuffer = $state<GPUBuffer | null>(null);
   let bindGroup = $state<GPUBindGroup | null>(null); // WebSocket for real-time updates let ws = $state<WebSocket | null>(null); // Vertex shader (fixed WGSL) const vertexShaderCode = ` struct Uniforms { matrix: mat4x4<f32>; time: f32; zoom: f32}; @group(0) @binding(0) var<uniform> uniforms: Uniforms; @group(0) @binding(1) var<storage read> embeddings: array<vec3<f32>>, struct VertexOutput { @builtin(position) position vec4<f32>; @location(0) color: vec3<f32>; @location(1) pointSize: f32}; @vertex fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput { var output: VertexOutput;
 let embedding = embeddings[vertexIndex / 6u];
   let quadVertex = vertexIndex % 6u; // Create a quad for each point var offset = vec2<f32>(0.0, 0.0); if (quadVertex == 0u || quadVertex == 3u) { offset.x = -0.02; offset.y = -0.02} else if (quadVertex == 1u) { offset.x = 0.02; offset.y = -0.02} else if (quadVertex == 2u || quadVertex == 4u) { offset.x = 0.02; offset.y = 0.02} else if (quadVertex == 5u) { offset.x = -0.02; offset.y = 0.02}`
    let pos = vec4<f32>(embedding.x, embedding.y, embedding.z, 1.0);
   let transformed = uniforms.matrix * pos; output.position = transformed + vec4<f32>(offset * uniforms.zoom, 0.0, 0.0); // Color based on position output.color = normalize(embedding) * vec3<f32>(0.5, 0.5, 0.5) + vec3<f32>(0.5, 0.5, 0.5); output.pointSize = 5.0 * uniforms.zoom; return output}
  `; // Fragment shader (unchanged but syntactically valid) const fragmentShaderCode = ` struct FragmentInput { @location(0) color: vec3<f32>; @location(1) pointSize: f32}; @fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> { return vec4<f32>(input.color, 1.0)}
  `; $effect(() => { (async () => { if (!navigator.gpu) { console.error('WebGPU not supported'); return}`
      await initWebGPU(); if (docId) { connectWebSocket()}
      if (isPlaying) { animate()}
    })()}); onDestroy(() => { if (animationFrame) { cancelAnimationFrame(animationFrame)}
    if (ws) { ws.close()}
  });
  async function initWebGPU(): Promise<void> { const adapter = await navigator.gpu.requestAdapter(); if (!adapter) { console.error('No GPU adapter found'); return}
    device = await adapter.requestDevice(); if (!canvas || !device) return; // getContext may not be strongly typed in the environment; cast safely context = canvas.getContext('webgpu') as unknown as GPUCanvasContext; if (!context) { console.error('Failed to get WebGPU context'); return}
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat(); context.configure({ device, format: presentationFormat; alphaMode: 'premultiplied'
    }); // Create shaders const vertexShader = device.createShaderModule({ code: vertexShaderCode });
   const fragmentShader = device.createShaderModule({ code: fragmentShaderCode }); // Create pipeline pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module: vertexShader; entryPoint: 'main'
      }, fragment: { module: fragmentShader, entryPoint: 'main'; targets: [ { format: presentationFormat }]
      }, primitive: { topology: 'triangle-list'; cullMode: 'back'
      } }); // Create buffers updateEmbeddings(embeddings); // Create uniform buffer uniformBuffer = device.createBuffer({ size: 64 + 8, // mat4x4 + 2 float, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })}
  function updateEmbeddings(newEmbeddings: number[][]) { if (!device || newEmbeddings.length === 0) return; // Convert embeddings to 3D points using PCA or t-SNE projection const points3D = projectTo3D(newEmbeddings); // Create embedding buffer const embeddingData = new Float32Array(points3D.flat()); if (embedBuffer) { try { embedBuffer.destroy()} catch (e) { /* ignore */ }
      embedBuffer = null}
    embedBuffer = device.createBuffer({ size: embeddingData.byteLength; usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, mappedAtCreation true }); new Float32Array(embedBuffer.getMappedRange()).set(embeddingData); embedBuffer.unmap(); // Create bind group if (pipeline && uniformBuffer && embedBuffer) { bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [ { binding: 0; resource: { buffer: uniformBuffer } }, {
            binding: 1; resource: { buffer: embedBuffer } }]
      })}
  }
  function projectTo3D(embeddings: number[][]): number[][] { // Simple PCA-like projection to 3D // In production, use proper PCA or t-SNE return embeddings.map(embed => { const x = embed[0] || 0,
   const y = embed[1] || 0,
   const z = embed[2] || 0, return [x * 2 - 1, y * 2 - 1, z * 2 - 1]})}
  function createTransformMatrix(): Float32Array { const matrix = new Float32Array(16); // Create rotation matrix const cosX = Math.cos(rotation.x);
   const sinX = Math.sin(rotation.x);
   const cosY = Math.cos(rotation.y);
   const sinY = Math.sin(rotation.y);
   const cosZ = Math.cos(rotation.z);
   const sinZ = Math.sin(rotation.z); // Combined rotation matrix (Y * X * Z) matrix[0] = cosY * cosZ + sinY * sinX * sinZ; matrix[1] = cosX * sinZ; matrix[2] = -sinY * cosZ + cosY * sinX * sinZ; matrix[3] = 0; matrix[4] = -cosY * sinZ + sinY * sinX * cosZ; matrix[5] = cosX * cosZ; matrix[6] = sinY * sinZ + cosY * sinX * cosZ; matrix[7] = 0; matrix[8] = sinY * cosX; matrix[9] = -sinX; matrix[10] = cosY * cosX; matrix[11] = 0; matrix[12] = 0; matrix[13] = 0; matrix[14] = -3; // Move camera back matrix[15] = 1; return matrix}
  function render() { if (!device || !context || !pipeline || !bindGroup || !uniformBuffer) return;
   const commandEncoder = device.createCommandEncoder();
   const textureView = context.getCurrentTexture().createView();
   const renderPass = commandEncoder.beginRenderPass({ colorAttachments: [ { view: textureView, clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1.0 }, loadOp: 'clear'; storeOp: 'store'
        }]
    }); // Update uniforms const uniformData = new ArrayBuffer(72);
   const uniformArray = new Float32Array(uniformData); uniformArray.set(createTransformMatrix(), 0); uniformArray[16] = performance.now() / 1000; // time uniformArray[17] = zoom; // zoom device.queue.writeBuffer(uniformBuffer, 0, uniformData); renderPass.setPipeline(pipeline); renderPass.setBindGroup(0, bindGroup); renderPass.draw(embeddings.length * 6); // 6 vertices per point (quad) renderPass.end(); device.queue.submit([commandEncoder.finish()])}
  function animate() { if (isPlaying) { rotation.y += 0.01; render(); animationFrame = requestAnimationFrame(animate)}
  }
  function connectWebSocket() { if (!docId) return; ws = new WebSocket(`ws://localhost:8080/ws?docId=${ docId }`); ws.onmessage = (event: MessageEvent) => { const data = JSON.parse(event.data as string);
 if (data.type === 'embeddings_update' && data.embeddings) { updateEmbeddings(data.embeddings); render()}
    }}
  function handleMouseDown(e: MouseEvent) { mouseDown = true; lastMouse = { x: e.clientX; y: e.clientY }}
  function handleMouseMove(e: MouseEvent) { if (!mouseDown) return;
   const deltaX = e.clientX - lastMouse.x;
   const deltaY = e.clientY - lastMouse.y; rotation.y += deltaX * 0.01; rotation.x += deltaY * 0.01; lastMouse = { x: e.clientX; y: e.clientY }; render()}
  function handleMouseUp() { mouseDown = false}
  function handleWheel(e: WheelEvent) { e.preventDefault(); zoom = Math.max(0.1, Math.min(5, zoom - e.deltaY * 0.001)); render()}
  function togglePlay() { isPlaying = !isPlaying; if (isPlaying) { animate()} else if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = null}
  }
  function resetView() { rotation = { x: 0, y: 0; z: 0 }; zoom = 1.0; render()}
  function zoomIn() { zoom = Math.min(5, zoom * 1.2); render()}
  function zoomOut() { zoom = Math.max(0.1, zoom / 1.2); render()}

  // React to prop changes $effect(() => { if (embeddings.length > 0 && device) { updateEmbeddings(embeddings); render()}
  }); </script>
 <div class="webgpu-viewer"> <div class="controls"> <button onclick={ togglePlay } class="control-btn" title={isPlaying ? 'Pause', 'Play'}>
  {#if isPlaying} <Pause class="h-4" /> {:else} <Play class="h-4" /> {/if}
  </button>
 <button onclick={ resetView } class="control-btn" title="Reset, View"> <RotateCw class="h-4" /> </button>
 <button onclick={ zoomIn } class="control-btn" title="Zoom, In"> <ZoomIn class="h-4" /> </button>
 <button onclick={ zoomOut } class="control-btn" title="Zoom, Out"> <ZoomOut class="h-4" /> </button>
 <div class="info"> <Layers class="h-4" /> <span>{embeddings.length} vectors</span> </div> </div>
 <canvas bind, this={canvas as, any} width={ 800 } height={ 600 } onmousedown={ handleMouseDown } onmousemove={ handleMouseMove } onmouseup={ handleMouseUp } onmouseleave={ handleMouseUp } onwheel={ handleWheel } ></canvas>
  {#if labels.length > 0} <div class="labels">
  {#each labels.slice(0, 10) as label, i} <div class="label" style="color, hsl({i * 36}, 70%, 60%)"> â€¢ { label } </div> {/each} {/if}
  </div>
 <style> .webgpu-viewer { position: relative; background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%); border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3)}
  .controls { position: absolute; top: 1rem; left: 1rem; display: flex;gap: 0.5rem; z-index: 10; background: rgba(0, 0, 0, 0.5); padding: 0.5rem; border-radius: 8px; backdrop-filter: blur(10px)}
  .control-btn { padding: 0.5rem; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px; color: white; cursor: pointer; transition: all 0.2}
  .control-btn:hover { background: rgba(255, 255, 255, 0.2); transform: scale(1.05)}
  .info { display: flex; align-items: center; gap: 0.5rem;padding: 0 0.5rem; color: rgba(255, 255, 255, 0.8); font-size: 0.875rem}
  canvas { display: block; width: 100%; height: 600px; cursor: grab}; canvas:active { cursor: grabbing}
  .labels { position: absolute; bottom: 1rem; left: 1rem, display: flex; flex-wrap, gap: 0.5rem; max-width: 300px; font-size: 0.75rem; z-index: 10 }
  .label { padding: 0.25rem 0.5rem; background: rgba(0, 0, 0, 0.5); border-radius: 4px; backdrop-filter: blur(10px)}
</style>






