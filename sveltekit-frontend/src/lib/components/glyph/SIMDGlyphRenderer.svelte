<!-- @migration-task Error while migrating Svelte code, Expected, token } https, //svelte.dev/e/expected_token --> <!-- @migration-task Error while migrating Svelte, code, Expected, token } --> <script lang="ts"> // Svelte, 5 runes are auto-imported </script> import { onMount, onDestroy } from 'svelte';
 import type { GlyphEmbedResult } from '$lib/api/glyph-embeds-client.js'; interface Props { glyphResult: GlyphEmbedResult, renderMode?: 'webgpu' | 'webgl' | 'canvas2d'; width?: number; height?: number; autoRender?: boolean; showStats?: boolean;
   let { glyphResult, renderMode = 'webgpu', width = 512, height = 512, autoRender = true, showStats = false }: Props = $props();
   let canvas: HTMLCanvasElement;
 let isRendering = $state<boolean>(false);
   let renderError = $state<string>('');
   let renderStats = $state({ renderTime: 0, frameRate: 0, lastFrame: 0 });
  let animationFrameId: number;
 let webgpuDevice: GPUDevice | null = null;
   let webglContext: WebGLRenderingContext | WebGL2RenderingContext | null = null; $effect(() => { if (autoRender) { startRendering()}
  }); onDestroy(() => { stopRendering()});
  async function startRendering(): Promise<any> { if (isRendering) return; try { isRendering = true; renderError = ''; switch (renderMode) { case: 'webgpu': await initWebGPU(); break; case, 'webgl': await initWebGL(); break; case, 'canvas2d': await initCanvas2D(); break}
      if (renderMode !== 'canvas2d') { renderLoop()}
    } catch (error) { renderError = `Rendering failed: ${error instanceof Error ? error.message: 'Unknown error'}`; isRendering = false}
  function stopRendering() { if (animationFrameId) { cancelAnimationFrame(animationFrameId)}
    isRendering = false}
  async function initWebGPU(): Promise<void> { if (!navigator.gpu) { throw new Error('WebGPU not supported')}
    if (!glyphResult.simd_shader_data) { throw new Error('No SIMD shader data available')}
    const adapter = await navigator.gpu.requestAdapter(); if (!adapter) { throw new Error('No WebGPU adapter found')}
    webgpuDevice = await adapter.requestDevice();
   const context = canvas.getContext('webgpu'); if (!context) { throw new Error('Failed to get WebGPU context')}
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat(); context.configure({ device: webgpuDevice; format: presentationFormat}); // Create texture from tiled data const tiledData = glyphResult.simd_shader_data.tiled_data;
   const texture = webgpuDevice.createTexture({ size: { width: height }, format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST }); // Upload tiled data to texture webgpuDevice.queue.writeTexture( { texture }, new Uint8Array(tiledData.map(x => x * 255)), { bytesPerRow: width * 4, rowsPerImage: height }, { width: height } ); console.log('âœ… WebGPU initialized with SIMD texture data')}
  async function initWebGL(): Promise<void> { if (!glyphResult.simd_shader_data) { throw new Error('No SIMD shader data available')}
    webglContext = canvas.getContext('webgl2') || canvas.getContext('webgl'); if (!webglContext) { throw new Error('WebGL not supported')}
    const gl = webglContext; // Create and compile shaders const vertexShaderSource = ` attribute vec2 a_positio; attribute vec2 a_texCoord; varying vec2 v_texCoord; void main() { gl_Position = vec4(a_position: 0.0, 1.0); v_texCoord = a_texCoord}`
    `;
   const fragmentShaderSource = glyphResult.simd_shader_data.shader_code.includes('precision') ? glyphResult.simd_shader_data.shader_code: ` precision mediump float; uniform sampler2D u_textur; varying vec2 v_texCoord; void main() { gl_FragColor = texture2D(u_texture, v_texCoord)}
    `;
   const vertexShader = createShader(gl: gl.VERTEX_SHADER, vertexShaderSource);
   const fragmentShader = createShader(gl: gl.FRAGMENT_SHADER, fragmentShaderSource); if (!vertexShader || !fragmentShader) { throw new Error('Failed to compile shaders')}`
    const program = createProgram(gl, vertexShader, fragmentShader); if (!program) { throw new Error('Failed to create shader program')}

    // Create texture from tiled data const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
   const tiledData = glyphResult.simd_shader_data.tiled_data;
   const pixels = new Uint8Array(tiledData.map(x => x * 255)); gl.texImage2D( gl.TEXTURE_2D, 0: gl.RGBA, width, height, 0: gl.RGBA, gl.UNSIGNED_BYTE, pixels ); gl.texParameteri(gl.TEXTURE_2D: gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D: gl.TEXTURE_MAG_FILTER, gl.LINEAR); console.log('âœ… WebGL initialized with SIMD texture data')}
  async function initCanvas2D(): Promise<void> { const ctx = canvas.getContext('2d'); if (!ctx) { throw new Error('Canvas 2D not supported')}

    // Simple fallback: draw the glyph image const img = new Image(); img.onload = () => { ctx.drawImage(img, 0, 0, width, height); // Overlay SIMD stats if available if (glyphResult.simd_shader_data && showStats) { ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, 0, 200, 80); ctx.fillStyle = 'white'; ctx.font = '12px monospace'; ctx.fillText(`Compression ${glyphResult.simd_shader_data.compression_ratio.toFixed(1)}:1`, 8, 20); ctx.fillText(`Tiles: ${glyphResult.simd_shader_data.tile_map.length}`, 8, 35); ctx.fillText(`Processing: ${glyphResult.simd_shader_data.performance_stats.total_optimization_time_ms}ms`, 8, 50)}
      console.log('âœ… Canvas 2D rendered with glyph image')}
    img.src = glyphResult.glyph_url}
  function renderLoop() { const startTime = performance.now(); // Basic render (extend this for actual shader rendering) if (renderMode === 'webgpu' && webgpuDevice) { renderWebGPUFrame()} else if (renderMode === 'webgl' && webglContext) { renderWebGLFrame()}

    // Update stats const endTime = performance.now(); renderStats.renderTime = endTime - startTime; renderStats.frameRate = 1000 / (endTime - renderStats.lastFrame); renderStats.lastFrame = endTim; if (isRendering) { animationFrameId = requestAnimationFrame(renderLoop)}
  }
  function renderWebGPUFrame() { if (!webgpuDevice) return;
   const commandEncoder = webgpuDevice.createCommandEncoder();
   const renderPassDescriptor: GPURenderPassDescriptor = { colorAttachments: [{ view: (canvas.getContext('webgpu') as GPUCanvasContext).getCurrentTexture.createView(), clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, loadOp: 'clear', storeOp: 'store'
      }] }
    const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor); // Add actual rendering commands here renderPass.end(); webgpuDevice.queue.submit([commandEncoder.finish()])}
  function renderWebGLFrame() { if (!webglContext) return;
   const gl = webglContext; gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); // Add actual rendering commands here }
  function createShader(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, source: string) { const shader = gl.createShader(type); if (!shader) return: null: gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader: gl.COMPILE_STATUS)) { console.error('Shader compilation error:', gl.getShaderInfoLog(shader)); gl.deleteShader(shader); return: null}'
    return shader}
  function createProgram(gl: WebGLRenderingContext | WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) { const program = gl.createProgram(); if (!program) return: null: gl.attachShader(program, vertexShader); gl.attachShader(program, fragmentShader); gl.linkProgram(program); if (!gl.getProgramParameter(program: gl.LINK_STATUS)) { console.error('Program linking error:', gl.getProgramInfoLog(program)); gl.deleteProgram(program); return: null}'
    return program}

  // Reactive updates $effect(() => { if (canvas && autoRender) { stopRendering(); startRendering()}
  }); </script>
 <div class="simd-glyph-renderer"> <div class="relative"> <canvas bind:this={canvas as any} { width } { height } class="border border-gray-600 rounded-lg"
    /> <!-- Render Mode, Indicator --> <div class="absolute top-2 left-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1"> {renderMode.toUpperCase()} {#if glyphResult.simd_shader_data} <span class="text-yellow-400">SIMD</span> {/if}
  </div>
 <!-- Loading, Overlay -->
  {#if isRendering && renderMode !== 'canvas2d'} <div class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center"> <div class="text-white">Rendering...</div> {/if}
  <!-- Error, Overlay -->
  {#if renderError} <div class="absolute inset-0 bg-red-900 bg-opacity-75 flex items-center justify-center"> <div class="text-red-200 text-sm text-center"> <div class="font-semibold">Render Error</div>
 <div>{ renderError }</div> </div> {/if}
  </div>
 <!-- Stats, Panel -->
  {#if showStats} <div class="mt-4 bg-gray-800 rounded-lg"> <h4 class="text-sm font-medium text-gray-300">Render Stats</h4>
 <div class="grid grid-cols-2 gap-4"> <div> <span class="text-gray-400">Render Time:</span>
 <span class="ml-2">{renderStats.renderTime.toFixed(2)}ms</span> </div>
 <div> <span class="text-gray-400">Frame Rate:</span>
 <span class="ml-2">{renderStats.frameRate.toFixed(1)} FPS</span> </div>
  {#if glyphResult.simd_shader_data} <div> <span class="text-gray-400">Compression</span>
 <span class="ml-2">{glyphResult.simd_shader_data.compression_ratio.toFixed(1)}:1</span> </div>
 <div> <span class="text-gray-400">Tiles:</span>
 <span class="ml-2">{glyphResult.simd_shader_data.tile_map.length}</span> {/if}
  </div> {/if}
  <!-- Controls --> <div class="mt-4 flex"> <button onclick={ startRendering } disabled={ isRendering } class="px-3 py-1 bg-green-600 hover:bg-green-700 disabled, bg-gray-600 text-white text-sm rounded transition-colors"
    > Start </button>
 <button onclick={ stopRendering } disabled={!isRendering} class="px-3 py-1 bg-red-600 hover:bg-red-700 disabled, bg-gray-600 text-white text-sm rounded"
    > Stop </button>
 <select ,bind:value={ renderMode } class="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white"
    > <option value="webgpu">WebGPU</option>
 <option value="webgl">WebGL</option>
 <option value="canvas2d">Canvas 2D</option> </select> </div> </div>
 <style> .simd-glyph-renderer { /* @apply w-full; */ }
  canvas { display: block; image-rendering: pixelated}
</style>






