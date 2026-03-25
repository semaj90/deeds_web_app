<script lang="ts">
	import { browser } from '$app/environment';

	// ─── Props ────────────────────────────────────────────────────────────
	interface Props {
		/** Number of ambient particles */
		particleCount?: number;
		/** Enable CRT scanline post-process */
		crtEnabled?: boolean;
		/** CRT effect intensity 0.0-1.0 */
		crtIntensity?: number;
		/** Enable particle system */
		particlesEnabled?: boolean;
		/** Canvas dimensions (auto-resize if 0) */
		width?: number;
		height?: number;
		/** Board interaction state */
		mouseX?: number;
		mouseY?: number;
		isDragging?: boolean;
		boardZoom?: number;
	}

	let {
		particleCount = 2000,
		crtEnabled = true,
		crtIntensity = 0.6,
		particlesEnabled = true,
		width = 0,
		height = 0,
		mouseX = 0,
		mouseY = 0,
		isDragging = false,
		boardZoom = 1.0,
	}: Props = $props();

	// ─── State ────────────────────────────────────────────────────────────
	let canvas = $state<HTMLCanvasElement | null>(null);
	let gpuReady = $state(false);
	let backend = $state<'webgpu' | 'canvas2d' | 'none'>('none');
	let fps = $state(0);
	let frameCount = $state(0);

	// GPU handles (not reactive — internal refs)
	let device: GPUDevice | null = null;
	let context: GPUCanvasContext | null = null;
	let computePipeline: GPUComputePipeline | null = null;
	let renderPipeline: GPURenderPipeline | null = null;
	let particleBuffer: GPUBuffer | null = null;
	let simParamsBuffer: GPUBuffer | null = null;
	let renderParamsBuffer: GPUBuffer | null = null;
	let computeBindGroup: GPUBindGroup | null = null;
	let renderBindGroup: GPUBindGroup | null = null;
	let animFrame: number = 0;
	let lastTime = 0;
	let fpsAccum = 0;
	let fpsFrames = 0;

	// Particle data for CPU fallback
	interface CPUParticle {
		x: number; y: number;
		vx: number; vy: number;
		life: number; maxLife: number;
		size: number; kind: number;
	}
	let cpuParticles: CPUParticle[] = [];

	// ─── WGSL Shader Sources (inlined for single-file simplicity) ─────────

	const PARTICLE_COMPUTE_WGSL = `
struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  life: f32,
  max_life: f32,
  size: f32,
  kind: u32,
}

struct SimParams {
  delta_time: f32,
  time: f32,
  particle_count: u32,
  gravity: f32,
  wind_x: f32,
  wind_y: f32,
  damping: f32,
  turbulence: f32,
  mouse_x: f32,
  mouse_y: f32,
  mouse_active: u32,
  board_zoom: f32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> sim: SimParams;

fn hash(n: f32) -> f32 { return fract(sin(n) * 43758.5453123); }
fn hash2(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(
    fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453),
    fract(sin(dot(p, vec2<f32>(269.5, 183.3))) * 43758.5453)
  );
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= sim.particle_count) { return; }

  var p = particles[idx];
  p.life -= sim.delta_time / p.max_life;

  if (p.life <= 0.0) {
    let seed = f32(idx) + sim.time * 7.31;
    let h = hash2(vec2<f32>(seed, seed * 0.7));
    p.pos = vec2<f32>(h.x, h.y);
    p.vel = vec2<f32>((hash(seed + 1.0) - 0.5) * 0.02, (hash(seed + 2.0) - 0.5) * 0.02);
    p.life = 1.0;
    p.max_life = 3.0 + hash(seed + 3.0) * 7.0;
    p.size = 1.0 + hash(seed + 4.0) * 3.0;
    p.kind = u32(hash(seed + 5.0) * 4.0);
  } else {
    let wind = vec2<f32>(sim.wind_x, sim.wind_y);
    let turb = vec2<f32>(
      sin(p.pos.y * 6.28 + sim.time * 0.5) * sim.turbulence,
      cos(p.pos.x * 6.28 + sim.time * 0.3) * sim.turbulence
    );
    p.vel += (wind + turb) * sim.delta_time;
    p.vel.y += sim.gravity * sim.delta_time;
    p.vel *= sim.damping;

    if (sim.mouse_active == 1u) {
      let to_mouse = p.pos - vec2<f32>(sim.mouse_x, sim.mouse_y);
      let dist = length(to_mouse);
      if (dist < 0.15 && dist > 0.001) {
        p.vel += normalize(to_mouse) * (0.15 - dist) * 2.0 * sim.delta_time;
      }
    }

    p.pos += p.vel * sim.delta_time;
    p.pos = fract(p.pos + vec2<f32>(1.0, 1.0));
  }

  particles[idx] = p;
}`;

	const PARTICLE_RENDER_WGSL = `
struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  life: f32,
  max_life: f32,
  size: f32,
  kind: u32,
}

struct RenderParams {
  viewport: vec2<f32>,
  board_offset: vec2<f32>,
  zoom: f32,
  time: f32,
  _pad: vec2<f32>,
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> render: RenderParams;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) life: f32,
  @location(2) kind: f32,
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VertexOutput {
  var out: VertexOutput;
  let p = particles[iid];

  var corner: vec2<f32>;
  switch (vid % 6u) {
    case 0u: { corner = vec2<f32>(-1.0, -1.0); }
    case 1u: { corner = vec2<f32>( 1.0, -1.0); }
    case 2u: { corner = vec2<f32>(-1.0,  1.0); }
    case 3u: { corner = vec2<f32>( 1.0, -1.0); }
    case 4u: { corner = vec2<f32>( 1.0,  1.0); }
    case 5u: { corner = vec2<f32>(-1.0,  1.0); }
    default: { corner = vec2<f32>(0.0, 0.0); }
  }

  let pixel_size = p.size * 4.0 / render.viewport;
  let world_pos = p.pos * 2.0 - 1.0;

  out.position = vec4<f32>(world_pos + corner * pixel_size, 0.0, 1.0);
  out.uv = corner * 0.5 + 0.5;
  out.life = p.life;
  out.kind = f32(p.kind);
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let dist = length(in.uv - vec2<f32>(0.5, 0.5)) * 2.0;
  if (dist > 1.0) { discard; }

  let soft_edge = 1.0 - smoothstep(0.6, 1.0, dist);
  let fade = in.life * soft_edge;

  var color: vec3<f32>;
  let kind = u32(in.kind);
  switch (kind) {
    case 0u: { color = vec3<f32>(0.96, 0.82, 0.55); }
    case 1u: { color = vec3<f32>(0.2, 0.9, 0.95); }
    case 2u: { color = vec3<f32>(0.95, 0.3, 0.3); }
    case 3u: { color = vec3<f32>(1.0, 0.85, 0.3); }
    default: { color = vec3<f32>(0.8, 0.8, 0.8); }
  }

  if (kind == 1u) {
    let pulse = sin(in.life * 12.56) * 0.3 + 0.7;
    color *= pulse;
  }

  return vec4<f32>(color, fade * 0.5);
}`;

	// ─── WebGPU Initialization ────────────────────────────────────────────

	async function initWebGPU(): Promise<boolean> {
		if (!browser || !canvas) return false;

		const nav = navigator as any;
		if (!nav.gpu) {
			console.warn('[ParticleOverlay] WebGPU not available — falling back to Canvas2D');
			return false;
		}

		try {
			const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
			if (!adapter) return false;

			device = await adapter.requestDevice({
				requiredLimits: {
					maxStorageBufferBindingSize: 268435456,
					maxComputeWorkgroupSizeX: 256,
					maxComputeInvocationsPerWorkgroup: 256,
				}
			});

			context = canvas.getContext('webgpu') as GPUCanvasContext;
			const format = nav.gpu.getPreferredCanvasFormat();
			context.configure({
				device,
				format,
				alphaMode: 'premultiplied',
			});

			// Create particle buffer (32 bytes per particle — vec2+vec2+f32+f32+f32+u32)
			const particleByteSize = 32;
			particleBuffer = device.createBuffer({
				label: 'particles',
				size: particleCount * particleByteSize,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			});

			// Initialize particles with random data
			const initData = new Float32Array(particleCount * 8);
			for (let i = 0; i < particleCount; i++) {
				const off = i * 8;
				initData[off + 0] = Math.random();     // pos.x
				initData[off + 1] = Math.random();     // pos.y
				initData[off + 2] = (Math.random() - 0.5) * 0.02; // vel.x
				initData[off + 3] = (Math.random() - 0.5) * 0.02; // vel.y
				initData[off + 4] = Math.random();     // life
				initData[off + 5] = 3 + Math.random() * 7; // max_life
				initData[off + 6] = 1 + Math.random() * 3; // size
				// kind is u32 — write via Uint32Array view
			}
			const kindView = new Uint32Array(initData.buffer);
			for (let i = 0; i < particleCount; i++) {
				kindView[i * 8 + 7] = Math.floor(Math.random() * 4);
			}
			device.queue.writeBuffer(particleBuffer, 0, initData);

			// Sim params buffer (12 floats = 48 bytes)
			simParamsBuffer = device.createBuffer({
				label: 'sim_params',
				size: 48,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			});

			// Render params buffer (8 floats = 32 bytes)
			renderParamsBuffer = device.createBuffer({
				label: 'render_params',
				size: 32,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			});

			// ─── Compute pipeline ─────────────────────────────────────────
			const computeModule = device.createShaderModule({
				label: 'particle_compute',
				code: PARTICLE_COMPUTE_WGSL,
			});

			const computeBGL = device.createBindGroupLayout({
				entries: [
					{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
					{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
				],
			});

			computePipeline = device.createComputePipeline({
				label: 'particle_compute_pipeline',
				layout: device.createPipelineLayout({ bindGroupLayouts: [computeBGL] }),
				compute: { module: computeModule, entryPoint: 'main' },
			});

			computeBindGroup = device.createBindGroup({
				layout: computeBGL,
				entries: [
					{ binding: 0, resource: { buffer: particleBuffer } },
					{ binding: 1, resource: { buffer: simParamsBuffer } },
				],
			});

			// ─── Render pipeline ──────────────────────────────────────────
			const renderModule = device.createShaderModule({
				label: 'particle_render',
				code: PARTICLE_RENDER_WGSL,
			});

			const renderBGL = device.createBindGroupLayout({
				entries: [
					{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
					{ binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
				],
			});

			renderPipeline = device.createRenderPipeline({
				label: 'particle_render_pipeline',
				layout: device.createPipelineLayout({ bindGroupLayouts: [renderBGL] }),
				vertex: { module: renderModule, entryPoint: 'vs_main' },
				fragment: {
					module: renderModule,
					entryPoint: 'fs_main',
					targets: [{
						format,
						blend: {
							color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
							alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
						},
					}],
				},
				primitive: { topology: 'triangle-list' },
			});

			renderBindGroup = device.createBindGroup({
				layout: renderBGL,
				entries: [
					{ binding: 0, resource: { buffer: particleBuffer } },
					{ binding: 1, resource: { buffer: renderParamsBuffer } },
				],
			});

			return true;
		} catch (err) {
			console.warn('[ParticleOverlay] WebGPU init failed:', err);
			return false;
		}
	}

	// ─── GPU Render Loop ──────────────────────────────────────────────────

	function renderGPU(time: number) {
		if (!device || !context || !computePipeline || !renderPipeline) return;
		if (!computeBindGroup || !renderBindGroup || !simParamsBuffer || !renderParamsBuffer) return;

		const dt = lastTime ? (time - lastTime) / 1000 : 0.016;
		lastTime = time;

		// FPS counter
		fpsAccum += dt;
		fpsFrames++;
		if (fpsAccum >= 1.0) {
			fps = Math.round(fpsFrames / fpsAccum);
			fpsAccum = 0;
			fpsFrames = 0;
		}

		const w = canvas?.width ?? 800;
		const h = canvas?.height ?? 600;

		// Update sim params
		const simData = new Float32Array([
			dt,                       // delta_time
			time / 1000,              // time (seconds)
			particleCount,            // particle_count (as float, cast in shader)
			0.001,                    // gravity (very light downward drift)
			0.003,                    // wind_x (gentle rightward)
			0.0,                      // wind_y
			0.995,                    // damping
			0.008,                    // turbulence
			mouseX / w,               // mouse_x normalized
			mouseY / h,               // mouse_y normalized
			isDragging ? 1 : 0,       // mouse_active
			boardZoom,                // board_zoom
		]);
		device.queue.writeBuffer(simParamsBuffer, 0, simData);

		// Update render params
		const renderData = new Float32Array([
			w, h,     // viewport
			0, 0,     // board_offset (TODO: wire pan)
			boardZoom, // zoom
			time / 1000, // time
			0, 0,     // _pad
		]);
		device.queue.writeBuffer(renderParamsBuffer, 0, renderData);

		// Encode commands
		const encoder = device.createCommandEncoder({ label: 'particle_frame' });

		// Compute pass — update particles
		const computePass = encoder.beginComputePass({ label: 'particle_sim' });
		computePass.setPipeline(computePipeline);
		computePass.setBindGroup(0, computeBindGroup);
		computePass.dispatchWorkgroups(Math.ceil(particleCount / 256));
		computePass.end();

		// Render pass — draw particles
		const textureView = context.getCurrentTexture().createView();
		const renderPass = encoder.beginRenderPass({
			colorAttachments: [{
				view: textureView,
				clearValue: { r: 0, g: 0, b: 0, a: 0 }, // transparent
				loadOp: 'clear',
				storeOp: 'store',
			}],
		});
		renderPass.setPipeline(renderPipeline);
		renderPass.setBindGroup(0, renderBindGroup);
		// 6 vertices per quad × particleCount instances
		renderPass.draw(6, particleCount);
		renderPass.end();

		device.queue.submit([encoder.finish()]);
		frameCount++;

		if (particlesEnabled) {
			animFrame = requestAnimationFrame(renderGPU);
		}
	}

	// ─── Canvas2D Fallback ────────────────────────────────────────────────

	function initCanvas2DFallback() {
		cpuParticles = Array.from({ length: Math.min(particleCount, 500) }, () => ({
			x: Math.random(),
			y: Math.random(),
			vx: (Math.random() - 0.5) * 0.02,
			vy: (Math.random() - 0.5) * 0.02,
			life: Math.random(),
			maxLife: 3 + Math.random() * 7,
			size: 1 + Math.random() * 3,
			kind: Math.floor(Math.random() * 4),
		}));
	}

	function renderCanvas2D(time: number) {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dt = lastTime ? (time - lastTime) / 1000 : 0.016;
		lastTime = time;
		const w = canvas.width;
		const h = canvas.height;

		ctx.clearRect(0, 0, w, h);

		const kindColors = [
			'rgba(245, 209, 140, ',  // dust — warm amber
			'rgba(51, 230, 242, ',   // spark — cyan
			'rgba(242, 77, 77, ',    // connection — red
			'rgba(255, 217, 77, ',   // highlight — gold
		];

		for (const p of cpuParticles) {
			p.life -= dt / p.maxLife;
			if (p.life <= 0) {
				p.x = Math.random(); p.y = Math.random();
				p.vx = (Math.random() - 0.5) * 0.02;
				p.vy = (Math.random() - 0.5) * 0.02;
				p.life = 1;
				p.maxLife = 3 + Math.random() * 7;
				p.size = 1 + Math.random() * 3;
				p.kind = Math.floor(Math.random() * 4);
				continue;
			}

			// Simple physics
			p.vx += 0.003 * dt; // wind
			p.vy += 0.001 * dt; // gravity
			p.vx *= 0.995; p.vy *= 0.995;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.x = ((p.x % 1) + 1) % 1;
			p.y = ((p.y % 1) + 1) % 1;

			const alpha = p.life * 0.5;
			const color = kindColors[p.kind] || kindColors[0];
			ctx.fillStyle = `${color}${alpha})`;
			ctx.beginPath();
			ctx.arc(p.x * w, p.y * h, p.size, 0, Math.PI * 2);
			ctx.fill();
		}

		// CRT scanline overlay (CSS fallback)
		if (crtEnabled) {
			ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
			for (let y = 0; y < h; y += 3) {
				ctx.fillRect(0, y, w, 1);
			}
		}

		if (particlesEnabled) {
			animFrame = requestAnimationFrame(renderCanvas2D);
		}
	}

	// ─── Lifecycle ────────────────────────────────────────────────────────

	$effect(() => {
		if (!browser || !canvas) return;

		// Auto-size canvas
		if (width === 0 || height === 0) {
			const parent = canvas.parentElement;
			if (parent) {
				canvas.width = parent.clientWidth;
				canvas.height = parent.clientHeight;
			}
		} else {
			canvas.width = width;
			canvas.height = height;
		}

		// Initialize
		(async () => {
			if (particlesEnabled) {
				const gpuOk = await initWebGPU();
				if (gpuOk) {
					gpuReady = true;
					backend = 'webgpu';
					animFrame = requestAnimationFrame(renderGPU);
				} else {
					backend = 'canvas2d';
					initCanvas2DFallback();
					animFrame = requestAnimationFrame(renderCanvas2D);
				}
			}
		})();

		return () => {
			if (animFrame) cancelAnimationFrame(animFrame);
			if (device) {
				particleBuffer?.destroy();
				simParamsBuffer?.destroy();
				renderParamsBuffer?.destroy();
				device.destroy();
				device = null;
			}
		};
	});

	// Handle resize
	$effect(() => {
		if (!browser || !canvas) return;
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				if (canvas) {
					canvas.width = entry.contentRect.width;
					canvas.height = entry.contentRect.height;
					if (context && device) {
						const nav = navigator as any;
						context.configure({
							device,
							format: nav.gpu.getPreferredCanvasFormat(),
							alphaMode: 'premultiplied',
						});
					}
				}
			}
		});
		if (canvas.parentElement) observer.observe(canvas.parentElement);
		return () => observer.disconnect();
	});
</script>

<div class="particle-overlay" class:crt-active={crtEnabled}>
	<canvas
		bind:this={canvas}
		class="particle-canvas"
	></canvas>

	{#if crtEnabled && crtIntensity > 0}
		<div class="crt-scanlines" style:opacity={crtIntensity * 0.4}></div>
		<div class="crt-vignette" style:opacity={crtIntensity * 0.6}></div>
	{/if}

	<!-- Debug badge -->
	{#if backend !== 'none'}
		<div class="gpu-badge">
			<span class="gpu-dot" class:active={gpuReady}></span>
			{backend === 'webgpu' ? 'GPU' : 'CPU'} | {fps} FPS | {particleCount} particles
		</div>
	{/if}
</div>

<style>
	.particle-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
		z-index: 1;
	}

	.particle-canvas {
		width: 100%;
		height: 100%;
		display: block;
	}

	/* CSS CRT Scanlines (overlay on top of canvas) */
	.crt-scanlines {
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			0deg,
			transparent,
			transparent 2px,
			rgba(0, 0, 0, 0.15) 2px,
			rgba(0, 0, 0, 0.15) 3px
		);
		pointer-events: none;
		mix-blend-mode: multiply;
	}

	.crt-vignette {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse at center,
			transparent 50%,
			rgba(0, 0, 0, 0.4) 100%
		);
		pointer-events: none;
	}

	/* GPU status badge */
	.gpu-badge {
		position: absolute;
		bottom: 8px;
		right: 8px;
		padding: 2px 8px;
		background: rgba(0, 0, 0, 0.7);
		color: rgba(255, 255, 255, 0.6);
		font-family: 'Courier New', monospace;
		font-size: 10px;
		border-radius: 3px;
		pointer-events: none;
		user-select: none;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.gpu-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #666;
	}

	.gpu-dot.active {
		background: #4ade80;
		box-shadow: 0 0 4px #4ade80;
	}

	/* CRT curvature effect via CSS (lightweight alternative to full shader) */
	.crt-active .particle-canvas {
		border-radius: 12px;
	}
</style>
