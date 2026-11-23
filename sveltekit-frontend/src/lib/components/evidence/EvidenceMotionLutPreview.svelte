<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		compactPackedMotionLodV1, readPackedVideoMotionLutV1, VIDEO_MOTION_COMPACT_LOD_V1,
		VIDEO_MOTION_GRAYSCALE_LUT_V1, VIDEO_MOTION_LUT_HEIGHT_V1, VIDEO_MOTION_LUT_WIDTH_V1,
		type PackedMotionLodV1,
	} from '$lib/shared/video-motion-lut-v1.js';
	import { n64TextureLOD } from '$lib/webgpu/N64TextureLODSystem.js';

	let {
		url,
		sourceRevision,
		analysisRevision,
		timestampMs,
		previousTimestampMs = undefined,
		motionScore
	}: {
		url: string;
		sourceRevision: string;
		analysisRevision: string;
		timestampMs: number;
		previousTimestampMs?: number | null;
		motionScore: number;
	} = $props();

	let canvas: HTMLCanvasElement;
	let gpuCanvas: HTMLCanvasElement;
	let webglCanvas: HTMLCanvasElement;
	let activeRenderer = $state<'webgpu' | 'webgl2' | 'canvas2d' | null>(null);
	let status = $state<'loading' | 'ready' | 'unavailable'>('loading');
	let fullDetail = $state(false);
	let gpuContext: GPUCanvasContext | null = null;
	let gpuPipeline: GPURenderPipeline | null = null;
	let gpuConfigured = false;
	let residentTextureId: string | null = null;
	let webglContext: WebGL2RenderingContext | null = null;
	let webglProgram: WebGLProgram | null = null;
	let webglVertexBuffer: WebGLBuffer | null = null;
	let webglHandlersInstalled = false;
	let lastWebglTile: PackedMotionLodV1 | null = null;
	let webglContextLost = false;

	function releaseResidentTexture(textureId = residentTextureId) {
		if (!textureId) return;
		n64TextureLOD.unregisterTexture(textureId);
		if (residentTextureId === textureId) residentTextureId = null;
	}

	function compileWebglShader(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
		const shader = gl.createShader(kind);
		if (!shader) throw new Error('WebGL2 shader allocation failed.');
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const error = gl.getShaderInfoLog(shader) ?? 'WebGL2 shader compilation failed.';
			gl.deleteShader(shader);
			throw new Error(error);
		}
		return shader;
	}

	function initializeWebgl2(): boolean {
		if (webglContext && webglProgram && webglVertexBuffer && !webglContextLost) return true;
		if (!webglCanvas) return false;
		const gl = webglCanvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
		if (!gl) return false;
		webglContext = gl;
		let vertex: WebGLShader | null = null;
		let fragment: WebGLShader | null = null;
		let program: WebGLProgram | null = null;
		let buffer: WebGLBuffer | null = null;
		try {
			vertex = compileWebglShader(gl, gl.VERTEX_SHADER, `#version 300 es
				in vec2 position;
				void main() { gl_Position = vec4(position, 0.0, 1.0); }
			`);
			fragment = compileWebglShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
				precision highp float;
				precision highp int;
				precision highp usampler2D;
				uniform highp usampler2D packedMotion;
				uniform ivec2 packedSize;
				const int motionLut[16] = int[16](${VIDEO_MOTION_GRAYSCALE_LUT_V1.join(', ')});
				out vec4 outColor;
				void main() {
					int x = clamp(int(gl_FragCoord.x), 0, 63);
					int y = clamp(127 - int(gl_FragCoord.y), 0, 127);
					int sourceX = min((x * packedSize.x * 2) / 64, packedSize.x * 2 - 1);
					int sourceY = min((y * packedSize.y) / 128, packedSize.y - 1);
					uint packed = texelFetch(packedMotion, ivec2(sourceX / 2, sourceY), 0).r;
					uint index = (sourceX & 1) == 0 ? (packed & 15u) : (packed >> 4u);
					float value = float(motionLut[index]) / 255.0;
					outColor = vec4(value, value, value, 1.0);
				}
			`);
			program = gl.createProgram();
			if (!program) throw new Error('WebGL2 program allocation failed.');
			gl.attachShader(program, vertex);
			gl.attachShader(program, fragment);
			gl.bindAttribLocation(program, 0, 'position');
			gl.linkProgram(program);
			gl.deleteShader(vertex);
			gl.deleteShader(fragment);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'WebGL2 program linking failed.');
			buffer = gl.createBuffer();
			if (!buffer) throw new Error('WebGL2 vertex buffer allocation failed.');
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
			gl.useProgram(program);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
			gl.uniform1i(gl.getUniformLocation(program, 'packedMotion'), 0);
			webglProgram = program;
			webglVertexBuffer = buffer;
			webglContextLost = false;
			if (!webglHandlersInstalled) {
				webglCanvas.addEventListener('webglcontextlost', (event) => {
					event.preventDefault();
					webglContextLost = true;
					webglProgram = null;
					webglVertexBuffer = null;
				});
				webglCanvas.addEventListener('webglcontextrestored', () => {
					webglContextLost = false;
					if (lastWebglTile) drawWebglMotionTile(lastWebglTile);
				});
				webglHandlersInstalled = true;
			}
			return true;
		} catch {
			if (vertex) gl.deleteShader(vertex);
			if (fragment) gl.deleteShader(fragment);
			if (program) gl.deleteProgram(program);
			if (buffer) gl.deleteBuffer(buffer);
			webglProgram = null;
			webglVertexBuffer = null;
			return false;
		}
	}

	function drawWebglMotionTile(level: PackedMotionLodV1): boolean {
		lastWebglTile = level;
		if (!initializeWebgl2() || !webglContext || !webglProgram || !webglVertexBuffer || !webglCanvas) return false;
		const gl = webglContext;
		const texture = gl.createTexture();
		if (!texture) return false;
		try {
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, level.width / 2, level.height, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, level.data);
			gl.useProgram(webglProgram);
			gl.bindBuffer(gl.ARRAY_BUFFER, webglVertexBuffer);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
			gl.uniform2i(gl.getUniformLocation(webglProgram, 'packedSize'), level.width / 2, level.height);
			gl.viewport(0, 0, webglCanvas.width, webglCanvas.height);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			return gl.getError() === gl.NO_ERROR;
		} catch {
			return false;
		} finally {
			gl.deleteTexture(texture);
		}
	}

	async function drawWebGpuMotionTile(cacheKey: string, lod: PackedMotionLodV1, signal: AbortSignal): Promise<boolean> {
		if (residentTextureId !== cacheKey) releaseResidentTexture();
		if (typeof navigator === 'undefined' || !navigator.gpu || !gpuCanvas) return false;
		if (!(await n64TextureLOD.initialize())) return false;
		if (signal.aborted) return false;
		const device = n64TextureLOD.getDevice();
		if (!device) return false;
		if (!n64TextureLOD.hasTexture(cacheKey)) {
			n64TextureLOD.registerTexture(cacheKey, cacheKey, [{
				level: lod.level,
				width: lod.width / 2,
				height: lod.height,
				format: 'r8uint' as const,
				data: lod.data.slice().buffer as ArrayBuffer,
			}]);
		}
		residentTextureId = cacheKey;
		const texture = await n64TextureLOD.requestTexture(cacheKey, lod.level);
		if (!texture || signal.aborted) {
			// A newer frame may now own the component's resident texture. Release only
			// this stale request's cache entry; never evict the newer revision's tile.
			releaseResidentTexture(cacheKey);
			return false;
		}

		gpuContext ??= gpuCanvas.getContext('webgpu') as GPUCanvasContext | null;
		if (!gpuContext) {
			releaseResidentTexture(cacheKey);
			return false;
		}
		const format = navigator.gpu.getPreferredCanvasFormat() as GPUTextureFormat;
		if (!gpuConfigured) {
			gpuContext.configure({ device, format, alphaMode: 'opaque' });
			gpuConfigured = true;
		}
		gpuPipeline ??= device.createRenderPipeline({
			layout: 'auto',
			vertex: {
				module: device.createShaderModule({ code: `
					@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
						var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
						return vec4f(p[i], 0.0, 1.0);
					}
				` }),
				entryPoint: 'vs',
			},
			fragment: {
				module: device.createShaderModule({ code: `
					const motionLut = array<u32, 16>(${VIDEO_MOTION_GRAYSCALE_LUT_V1.map((value) => `${value}u`).join(', ')});
					@group(0) @binding(0) var motion: texture_2d<u32>;
					@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
						let dims = textureDimensions(motion);
						let imageWidth = dims.x * 2u;
						let x = min(u32(p.x * f32(imageWidth) / 64.0), imageWidth - 1u);
						let y = min(u32(p.y * f32(dims.y) / 128.0), dims.y - 1u);
						let packed = textureLoad(motion, vec2i(i32(x / 2u), i32(y)), 0).r;
						let index = select(packed & 15u, packed >> 4u, (x & 1u) == 1u);
						let value = f32(motionLut[index]) / 255.0;
						return vec4f(value, value, value, 1.0);
					}
				` }),
				entryPoint: 'fs',
				targets: [{ format }],
			},
		});
		const bindGroup = device.createBindGroup({
			layout: gpuPipeline.getBindGroupLayout(0),
			entries: [{ binding: 0, resource: texture.createView() }],
		});
		const encoder = device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			colorAttachments: [{ view: gpuContext.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
		});
		pass.setPipeline(gpuPipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(3);
		pass.end();
		device.queue.submit([encoder.finish()]);
		return true;
	}

	onDestroy(() => {
		releaseResidentTexture();
		gpuContext?.unconfigure();
		if (webglContext && !webglContextLost) {
			if (webglProgram) webglContext.deleteProgram(webglProgram);
			if (webglVertexBuffer) webglContext.deleteBuffer(webglVertexBuffer);
			webglContext.getExtension('WEBGL_lose_context')?.loseContext();
		}
		webglProgram = null;
		webglVertexBuffer = null;
		lastWebglTile = null;
		webglContext = null;
	});

	$effect(() => {
		const requestUrl = url;
		const expectedSource = sourceRevision;
		const expectedAnalysis = analysisRevision;
		const expectedTimestamp = timestampMs;
		const wantsFullDetail = fullDetail;
		const controller = new AbortController();
		// Release the prior frame's GPU allocation as soon as evidence/analysis scope
		// changes, rather than retaining stale pixels while the next artifact loads.
		releaseResidentTexture();
		lastWebglTile = null;
		status = 'loading';
		activeRenderer = null;

		void (async () => {
			try {
				const request = new URL(requestUrl, window.location.href);
				if (request.origin !== window.location.origin) throw new Error('Motion preview must be same-origin.');
				if (wantsFullDetail) request.searchParams.delete('lod');
				else request.searchParams.set('lod', VIDEO_MOTION_COMPACT_LOD_V1.token);
				const response = await fetch(request, { cache: 'no-store', signal: controller.signal });
				if (!response.ok ||
					response.headers.get('X-Source-Revision') !== expectedSource ||
					response.headers.get('X-Analysis-Revision') !== expectedAnalysis ||
					response.headers.get('X-Frame-Timestamp-Ms') !== String(expectedTimestamp)) {
					throw new Error('Motion preview revision did not match this frame.');
				}
				const lod = VIDEO_MOTION_COMPACT_LOD_V1;
				const responseLod = response.headers.get('X-Motion-LOD');
				if (responseLod !== null && (wantsFullDetail || responseLod !== lod.token ||
					response.headers.get('Content-Type') !== lod.contentType)) {
					throw new Error('Unexpected motion preview detail.');
				}
				const bytes = new Uint8Array(await response.arrayBuffer());
				let tile: PackedMotionLodV1;
				if (responseLod === lod.token) {
					if (bytes.byteLength !== lod.byteLength) throw new Error('Invalid packed motion preview length.');
					tile = { level: lod.level, width: lod.width, height: lod.height, data: bytes };
				} else {
					const canonical = readPackedVideoMotionLutV1(bytes);
					tile = wantsFullDetail ? canonical : compactPackedMotionLodV1(canonical);
				}
				if (controller.signal.aborted || !canvas) return;
				// Each load owns its registration: two viewers (or an A→B→A reload)
				// must not release a newer viewer's texture when an older request ends.
				const cacheKey = `${requestUrl}|${expectedSource}|${expectedAnalysis}|${crypto.randomUUID()}`;
				const renderedOnGpu = await drawWebGpuMotionTile(cacheKey, tile, controller.signal).catch(() => false);
				if (controller.signal.aborted) return;
				if (renderedOnGpu) {
					activeRenderer = 'webgpu';
					status = 'ready';
					return;
				}
				releaseResidentTexture();
				if (drawWebglMotionTile(tile)) {
					activeRenderer = 'webgl2';
					status = 'ready';
					return;
				}
				const context = canvas.getContext('2d', { alpha: false });
				if (!context) throw new Error('Canvas is unavailable.');
				const image = context.createImageData(canvas.width, canvas.height);
				for (let y = 0; y < canvas.height; y++) {
					const sourceRow = Math.floor(y * tile.height / canvas.height) * tile.width;
					for (let x = 0; x < canvas.width; x++) {
						const pixel = sourceRow + Math.floor(x * tile.width / canvas.width);
						const packed = tile.data[pixel >>> 1]!;
						const index = pixel & 1 ? packed >>> 4 : packed & 15;
						const intensity = VIDEO_MOTION_GRAYSCALE_LUT_V1[index]!;
						const offset = (y * canvas.width + x) * 4;
						image.data[offset] = intensity;
						image.data[offset + 1] = intensity;
						image.data[offset + 2] = intensity;
						image.data[offset + 3] = 255;
					}
				}
				context.putImageData(image, 0, 0);
				activeRenderer = 'canvas2d';
				status = 'ready';
			} catch {
				if (!controller.signal.aborted) {
					releaseResidentTexture();
					status = 'unavailable';
				}
			}
		})();

		return () => controller.abort();
	});
</script>

<figure class="motion-preview" aria-label="Low-resolution frame-to-frame motion cue" data-renderer={activeRenderer ?? 'loading'}>
	<canvas class:hidden={activeRenderer !== 'canvas2d'} bind:this={canvas} width={VIDEO_MOTION_LUT_WIDTH_V1} height={VIDEO_MOTION_LUT_HEIGHT_V1} aria-label="Quantized grayscale frame difference; not a pose or event finding"></canvas>
	<canvas class:hidden={activeRenderer !== 'webgpu'} bind:this={gpuCanvas} width={VIDEO_MOTION_LUT_WIDTH_V1} height={VIDEO_MOTION_LUT_HEIGHT_V1} aria-label="WebGPU packed motion tile; not a pose or event finding"></canvas>
	<canvas class:hidden={activeRenderer !== 'webgl2'} bind:this={webglCanvas} width={VIDEO_MOTION_LUT_WIDTH_V1} height={VIDEO_MOTION_LUT_HEIGHT_V1} aria-label="WebGL2 packed motion tile; not a pose or event finding"></canvas>
	<figcaption>
		<strong>Motion cue</strong>
		<span>{status === 'ready' ? previousTimestampMs === null ? 'First sample: no comparison frame' : `Difference intensity: ${Math.round(motionScore * 100)}%${typeof previousTimestampMs === 'number' ? ` · compared with ${(previousTimestampMs / 1000).toFixed(2)}s` : ' · comparison time unavailable'}` : status === 'loading' ? 'Loading revision-bound tile…' : 'Preview unavailable'}</span>
		<span>Visual cue for review; camera movement and lighting can affect it.</span>
		<button type="button" aria-pressed={fullDetail} onclick={() => (fullDetail = !fullDetail)}>Full motion detail</button>
	</figcaption>
</figure>

<style>
	.motion-preview { display: grid; grid-template-columns: 3rem minmax(0, 1fr); align-items: center; gap: 0.55rem; margin: 0; min-width: 9rem; }
	canvas { display: block; width: 3rem; height: 5rem; image-rendering: pixelated; background: #111; border: 1px solid var(--border, #555); }
	canvas.hidden { display: none; }
	figcaption { display: grid; gap: 0.15rem; font-size: 0.72rem; line-height: 1.2; }
	figcaption span { opacity: 0.75; }
</style>
