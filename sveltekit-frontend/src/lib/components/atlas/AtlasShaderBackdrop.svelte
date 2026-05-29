<script lang="ts">
	/**
	 * AtlasShaderBackdrop — decorative background renderer.
	 *
	 * Tries WebGPU first; falls back silently to an animated Canvas 2D
	 * "scanline drift" pattern that has zero performance impact on card data.
	 */

	let canvasEl = $state<HTMLCanvasElement | undefined>();
	let animFrameId = $state(0);

	// ── Canvas 2D fallback ─────────────────────────────────────────────────────
	function startCanvas2D(canvas: HTMLCanvasElement) {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		let t = 0;

		function resize() {
			canvas.width = canvas.offsetWidth;
			canvas.height = canvas.offsetHeight;
		}

		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(canvas);

		function draw() {
			const { width, height } = canvas;
			ctx.clearRect(0, 0, width, height);

			// Dark base
			ctx.fillStyle = '#050d1a';
			ctx.fillRect(0, 0, width, height);

			// Scanlines
			ctx.fillStyle = 'rgba(0, 255, 128, 0.018)';
			for (let y = 0; y < height; y += 4) {
				ctx.fillRect(0, y, width, 2);
			}

			// Subtle diagonal grid drift
			const spacing = 60;
			ctx.strokeStyle = 'rgba(74, 222, 128, 0.04)';
			ctx.lineWidth = 1;
			const offset = (t * 0.3) % spacing;
			for (let x = -spacing + offset; x < width + spacing; x += spacing) {
				ctx.beginPath();
				ctx.moveTo(x, 0);
				ctx.lineTo(x + height * 0.2, height);
				ctx.stroke();
			}

			// Slow vertical glow bar
			const barX = ((Math.sin(t * 0.001) + 1) / 2) * width;
			const grad = ctx.createLinearGradient(barX - 80, 0, barX + 80, 0);
			grad.addColorStop(0, 'rgba(74, 222, 128, 0)');
			grad.addColorStop(0.5, 'rgba(74, 222, 128, 0.04)');
			grad.addColorStop(1, 'rgba(74, 222, 128, 0)');
			ctx.fillStyle = grad;
			ctx.fillRect(barX - 80, 0, 160, height);

			t++;
			animFrameId = requestAnimationFrame(draw);
		}

		animFrameId = requestAnimationFrame(draw);

		return () => {
			ro.disconnect();
			cancelAnimationFrame(animFrameId);
		};
	}

	// ── WebGPU (best-effort, decoration only) ──────────────────────────────────
	async function tryWebGPU(canvas: HTMLCanvasElement): Promise<boolean> {
		try {
			if (!navigator.gpu) return false;
			const adapter = await navigator.gpu.requestAdapter();
			if (!adapter) return false;
			const device = await adapter.requestDevice();
			const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null;
			if (!ctx) return false;

			const format = navigator.gpu.getPreferredCanvasFormat() as GPUTextureFormat;
			ctx.configure({ device, format, alphaMode: 'opaque' });

			// Minimal fullscreen triangle shader — NES phosphor green tint
			const shader = device.createShaderModule({
				code: /* wgsl */ `
					@vertex
					fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
						var pos = array<vec2f,3>(
							vec2f(-1.0,-1.0), vec2f(3.0,-1.0), vec2f(-1.0, 3.0)
						);
						return vec4f(pos[i], 0.0, 1.0);
					}

					@group(0) @binding(0) var<uniform> time: f32;

					@fragment
					fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
						let uv = pos.xy / vec2f(f32(1280), f32(720));
						let scan = step(0.5, fract(uv.y * 180.0));
						let drift = sin(uv.x * 8.0 + time * 0.5) * 0.5 + 0.5;
						let base = vec3f(0.02, 0.06, 0.04);
						let glow = vec3f(0.0, 0.12, 0.05) * drift * scan;
						return vec4f(base + glow, 1.0);
					}
				`
			});

			const uniformBuf = device.createBuffer({
				size: 4,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
			});

			const pipeline = device.createRenderPipeline({
				layout: 'auto',
				vertex: { module: shader, entryPoint: 'vs' },
				fragment: {
					module: shader,
					entryPoint: 'fs',
					targets: [{ format }] as GPUColorTargetState[]
				},
				primitive: { topology: 'triangle-list' }
			});

			const bindGroup = device.createBindGroup({
				layout: pipeline.getBindGroupLayout(0) as GPUBindGroupLayout,
				entries: [{ binding: 0, resource: { buffer: uniformBuf } }]
			});

			let t = 0;

			function frame() {
				t += 0.016;
				device.queue.writeBuffer(uniformBuf, 0, new Float32Array([t]));

				const encoder = device.createCommandEncoder();
				const pass = encoder.beginRenderPass({
					colorAttachments: [{
						view: ctx!.getCurrentTexture().createView(),
						clearValue: { r: 0.02, g: 0.06, b: 0.04, a: 1 },
						loadOp: 'clear',
						storeOp: 'store'
					}]
				});
				pass.setPipeline(pipeline);
				pass.setBindGroup(0, bindGroup);
				pass.draw(3);
				pass.end();
				device.queue.submit([encoder.finish()]);
				animFrameId = requestAnimationFrame(frame);
			}

			animFrameId = requestAnimationFrame(frame);
			return true;
		} catch {
			return false;
		}
	}

	// ── Lifecycle ──────────────────────────────────────────────────────────────
	$effect(() => {
		const canvas = canvasEl;
		if (!canvas) return;

		let cleanup: (() => void) | undefined;

		tryWebGPU(canvas).then((used) => {
			if (!used) {
				cleanup = startCanvas2D(canvas);
			}
		});

		return () => {
			cancelAnimationFrame(animFrameId);
			cleanup?.();
		};
	});
</script>

<canvas
	bind:this={canvasEl}
	class="shader-backdrop"
	aria-hidden="true"
></canvas>

<style>
	.shader-backdrop {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
		pointer-events: none;
		display: block;
	}
</style>
