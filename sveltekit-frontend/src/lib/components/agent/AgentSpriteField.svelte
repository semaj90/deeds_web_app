<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { configureCanvas, initWebGPU } from '$lib/webgpu/init.js';
	import {
		clamp01,
		interpolateAgentVisualState,
		packAgentVisualInstances,
	} from '$lib/utils/agent-visual-state.js';
	import type { AgentVisualState } from '$lib/types/agent.js';

	interface Props {
		states?: AgentVisualState[];
		width?: number;
		height?: number;
		showLabels?: boolean;
		showProgress?: boolean;
	}

	let {
		states = [],
		width = 720,
		height = 360,
		showLabels = true,
		showProgress = true,
	}: Props = $props();

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let frameId = 0;
	let backend = $state<'webgpu' | 'canvas2d' | 'none'>('none');
	let dpr = 1;
	let ctx: CanvasRenderingContext2D | null = null;

	let gpuDevice: GPUDevice | null = null;
	let gpuContext: GPUCanvasContext | null = null;
	let gpuPipeline: GPURenderPipeline | null = null;
	let gpuBindGroup: GPUBindGroup | null = null;
	let gpuCornerBuffer: GPUBuffer | null = null;
	let gpuInstanceBuffer: GPUBuffer | null = null;
	let gpuFrameBuffer: GPUBuffer | null = null;
	let gpuBufferCapacity = 0;

	const palette = ['#8dd3c7', '#80b1d3', '#fdb462', '#fb8072', '#b3de69', '#fccde5', '#d9d9d9'];
	const stateColors: Record<AgentVisualState['state'], string> = {
		IDLE: '#64748b',
		SEARCHING: '#38bdf8',
		ANALYZING: '#a78bfa',
		EDITING: '#f59e0b',
		TESTING: '#22c55e',
		BLOCKED: '#ef4444',
		DONE: '#10b981',
	};

	const GPU_SHADER = /* wgsl */ `
struct FrameUniforms {
	canvasSize: vec2f,
	padding: vec2f,
}

struct VSOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
	@location(1) metrics: vec4f,
	@location(2) ids: vec2f,
}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;

fn stateColor(code: u32) -> vec3f {
	switch (code) {
		case 1u: { return vec3f(0.22, 0.74, 0.95); }
		case 2u: { return vec3f(0.65, 0.55, 0.97); }
		case 3u: { return vec3f(0.96, 0.66, 0.15); }
		case 4u: { return vec3f(0.15, 0.78, 0.38); }
		case 5u: { return vec3f(0.93, 0.27, 0.27); }
		case 6u: { return vec3f(0.05, 0.75, 0.52); }
		default: { return vec3f(0.42, 0.47, 0.55); }
	}
}

@vertex
fn vs_main(
	@location(0) corner: vec2f,
	@location(1) currentPos: vec2f,
	@location(2) previousPos: vec2f,
	@location(3) metrics: vec4f,
	@location(4) cluster: vec2f,
	@location(5) ids: vec2f,
	@location(6) ageMs: f32,
) -> VSOut {
	var out: VSOut;
	let alpha = clamp(ageMs / 220.0, 0.0, 1.0);
	let interpolated = mix(previousPos, currentPos, alpha);
	let size = 18.0 + metrics.y * 18.0 + cluster.y * 0.15;
	let pixel = interpolated + corner * vec2f(size, size);
	let ndc = vec2f(
		(pixel.x / frame.canvasSize.x) * 2.0 - 1.0,
		1.0 - (pixel.y / frame.canvasSize.y) * 2.0
	);
	out.position = vec4f(ndc, 0.0, 1.0);
	out.uv = corner * 0.5 + 0.5;
	out.metrics = metrics;
	out.ids = ids;
	return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
	let stateCode = u32(in.ids.y);
	let color = stateColor(stateCode);
	let borderDist = distance(in.uv, vec2f(0.5, 0.5));
	let outer = 1.0 - smoothstep(0.52, 0.58, borderDist);
	if (outer <= 0.01) {
		discard;
	}

	let fill = vec3f(0.04, 0.07, 0.12);
	let accent = mix(fill, color, 0.72);
	let progress = clamp(in.metrics.x / 100.0, 0.0, 1.0);
	let barMask = select(0.0, 1.0, in.uv.y > 0.78 && in.uv.y < 0.90 && in.uv.x <= progress);
	let barBg = select(0.0, 1.0, in.uv.y > 0.78 && in.uv.y < 0.90);
	let glow = clamp(in.metrics.z * 0.35 + in.metrics.w * 0.15, 0.0, 0.4);
	let body = mix(fill, accent, 0.86) + glow;
	let finalColor = mix(body, vec3f(0.94, 0.97, 1.0), barMask);
	let final = mix(finalColor, vec3f(0.08, 0.1, 0.15), 1.0 - outer);
	return vec4f(final + barBg * vec3f(0.02, 0.02, 0.02), outer);
}
`;

	function resizeCanvas() {
		if (!canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
		canvasEl.width = Math.max(1, Math.floor((rect.width || width) * dpr));
		canvasEl.height = Math.max(1, Math.floor((rect.height || height) * dpr));

		if (gpuDevice && gpuFrameBuffer && gpuContext) {
			gpuDevice.queue.writeBuffer(
				gpuFrameBuffer,
				0,
				new Float32Array([canvasEl.width, canvasEl.height, 0, 0]),
			);
		}
	}

	function roundRect(
		context: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		r: number,
	) {
		context.beginPath();
		context.moveTo(x + r, y);
		context.arcTo(x + w, y, x + w, y + h, r);
		context.arcTo(x + w, y + h, x, y + h, r);
		context.arcTo(x, y + h, x, y, r);
		context.arcTo(x, y, x + w, y, r);
		context.closePath();
	}

	function drawCanvasSprite(
		x: number,
		y: number,
		size: number,
		fill: string,
		label: string,
		progress: number,
		state: AgentVisualState,
	) {
		if (!ctx) return;
		const px = x * dpr;
		const py = y * dpr;
		const scaled = size * dpr;
		const half = scaled / 2;

		ctx.save();
		ctx.translate(px, py);
		ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
		ctx.strokeStyle = fill;
		ctx.lineWidth = 2 * dpr;
		roundRect(ctx, -half, -half, scaled, scaled, 8 * dpr);
		ctx.fill();
		ctx.stroke();

		const barW = scaled * 0.82;
		const barH = 6 * dpr;
		const barX = -barW / 2;
		const barY = half + 10 * dpr;

		if (showProgress) {
			ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
			roundRect(ctx, barX, barY, barW, barH, 4 * dpr);
			ctx.fill();
			ctx.fillStyle = fill;
			roundRect(ctx, barX, barY, barW * clamp01(progress / 100), barH, 4 * dpr);
			ctx.fill();
		}

		const code = state.state.charCodeAt(0) % 6;
		ctx.fillStyle = palette[code] ?? fill;
		ctx.globalAlpha = 0.9;
		for (let row = -1; row <= 1; row++) {
			for (let col = -1; col <= 1; col++) {
				if (Math.abs(row) + Math.abs(col) > 1) continue;
				const dx = col * 5 * dpr;
				const dy = row * 5 * dpr;
				ctx.fillRect(dx - 2 * dpr, dy - 2 * dpr, 4 * dpr, 4 * dpr);
			}
		}
		ctx.globalAlpha = 1;

		if (showLabels) {
			ctx.fillStyle = '#e2e8f0';
			ctx.font = `${11 * dpr}px ui-sans-serif, system-ui, sans-serif`;
			ctx.textAlign = 'center';
			ctx.fillText(label, 0, half + 28 * dpr);
		}

		ctx.restore();
	}

	function renderCanvas() {
		if (!ctx || !canvasEl) return;
		const widthPx = canvasEl.width;
		const heightPx = canvasEl.height;
		ctx.clearRect(0, 0, widthPx, heightPx);
		ctx.fillStyle = 'rgba(2, 6, 23, 0.98)';
		ctx.fillRect(0, 0, widthPx, heightPx);

		if (states.length === 0) {
			ctx.fillStyle = '#94a3b8';
			ctx.font = `${14 * dpr}px ui-sans-serif, system-ui, sans-serif`;
			ctx.textAlign = 'center';
			ctx.fillText('No agent states yet', widthPx / 2, heightPx / 2);
			frameId = requestAnimationFrame(renderCanvas);
			return;
		}

		const now = performance.now();
		const columns = Math.max(1, Math.ceil(Math.sqrt(states.length)));
		const rows = Math.max(1, Math.ceil(states.length / columns));
		const cellW = widthPx / columns;
		const cellH = heightPx / rows;
		const baseSize = Math.min(cellW, cellH) * 0.56;

		states.forEach((state, index) => {
			const column = index % columns;
			const row = Math.floor(index / columns);
			const centerX = cellW * column + cellW / 2;
			const centerY = cellH * row + cellH / 2;
			const previous = { ...state, x: state.previousX, y: state.previousY };
			const alpha = clamp01((now - state.updatedAtMs) / 220);
			const frame = interpolateAgentVisualState(previous, state, alpha);
			const fill = stateColors[state.state] ?? palette[index % palette.length];
			const label = `${state.agentId}${state.progress ? ` · ${Math.round(state.progress)}%` : ''}`;
			drawCanvasSprite(
				centerX + frame.interpolatedX,
				centerY + frame.interpolatedY,
				baseSize,
				fill,
				label,
				state.progress,
				state,
			);
		});

		frameId = requestAnimationFrame(renderCanvas);
	}

	function ensureGpuBuffer(sizeBytes: number) {
		if (!gpuDevice) return null;
		if (gpuInstanceBuffer && gpuBufferCapacity >= sizeBytes) return gpuInstanceBuffer;
		gpuInstanceBuffer?.destroy?.();
		gpuBufferCapacity = Math.max(sizeBytes, 1024);
		gpuInstanceBuffer = gpuDevice.createBuffer({
			label: 'agent_visual_instances',
			size: gpuBufferCapacity,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		return gpuInstanceBuffer;
	}

	function renderWebGPU() {
		if (!gpuDevice || !gpuContext || !gpuPipeline || !gpuBindGroup || !gpuCornerBuffer || !gpuFrameBuffer || !canvasEl) {
			return;
		}

		const now = performance.now();
		const instances = states.map((state) => {
			const alpha = clamp01((now - state.updatedAtMs) / 220);
			const previous = { ...state, x: state.previousX, y: state.previousY };
			return interpolateAgentVisualState(previous, state, alpha);
		});
		const packed = packAgentVisualInstances(instances);
		const instanceBuffer = ensureGpuBuffer(packed.byteLength);
		if (!instanceBuffer) return;

		gpuDevice.queue.writeBuffer(instanceBuffer, 0, packed.buffer as ArrayBuffer, packed.byteOffset, packed.byteLength);
		gpuDevice.queue.writeBuffer(
			gpuFrameBuffer,
			0,
			new Float32Array([canvasEl.width, canvasEl.height, 0, 0]),
		);

		const encoder = gpuDevice.createCommandEncoder({ label: 'agent_sprite_field_frame' });
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: gpuContext.getCurrentTexture().createView(),
					clearValue: { r: 0.01, g: 0.03, b: 0.06, a: 1 },
					loadOp: 'clear',
					storeOp: 'store',
				},
			],
		});

		pass.setPipeline(gpuPipeline);
		pass.setBindGroup(0, gpuBindGroup);
		pass.setVertexBuffer(0, gpuCornerBuffer);
		pass.setVertexBuffer(1, instanceBuffer);
		pass.draw(6, states.length);
		pass.end();
		gpuDevice.queue.submit([encoder.finish()]);
		frameId = requestAnimationFrame(renderWebGPU);
	}

	async function initWebGPUPath(): Promise<boolean> {
		if (!browser || !canvasEl || !navigator.gpu) return false;

		const webgpu = await initWebGPU({ powerPreference: 'high-performance' });
		if (!webgpu) return false;

		const context = configureCanvas(canvasEl, webgpu);
		if (!context) return false;

		gpuDevice = webgpu.device;
		gpuContext = context;

		const shader = gpuDevice.createShaderModule({ code: GPU_SHADER });
		const vertexBuffers: GPUVertexBufferLayout[] = [
			{
				arrayStride: 8,
				stepMode: 'vertex',
				attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
			},
			{
				arrayStride: 13 * 4,
				stepMode: 'instance',
				attributes: [
					{ shaderLocation: 1, offset: 0, format: 'float32x2' },
					{ shaderLocation: 2, offset: 8, format: 'float32x2' },
					{ shaderLocation: 3, offset: 16, format: 'float32x4' },
					{ shaderLocation: 4, offset: 32, format: 'float32x2' },
					{ shaderLocation: 5, offset: 40, format: 'float32x2' },
					{ shaderLocation: 6, offset: 48, format: 'float32' },
				],
			},
		];

		gpuPipeline = gpuDevice.createRenderPipeline({
			layout: 'auto',
			vertex: {
				module: shader,
				entryPoint: 'vs_main',
				buffers: vertexBuffers,
			},
			fragment: {
				module: shader,
				entryPoint: 'fs_main',
				targets: [
					{
						format: webgpu.format,
						blend: {
							color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
							alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
						},
					},
				],
			},
			primitive: { topology: 'triangle-list' },
		});

		const corners = new Float32Array([
			-1, -1,
			 1, -1,
			-1,  1,
			 1, -1,
			 1,  1,
			-1,  1,
		]);
		gpuCornerBuffer = gpuDevice.createBuffer({
			label: 'agent_sprite_corners',
			size: corners.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		gpuDevice.queue.writeBuffer(gpuCornerBuffer, 0, corners);

		gpuFrameBuffer = gpuDevice.createBuffer({
			label: 'agent_sprite_frame',
			size: 16,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		gpuDevice.queue.writeBuffer(
			gpuFrameBuffer,
			0,
			new Float32Array([canvasEl.width, canvasEl.height, 0, 0]),
		);

		gpuBindGroup = gpuDevice.createBindGroup({
			layout: gpuPipeline.getBindGroupLayout(0) as unknown as GPUBindGroupLayout,
			entries: [{ binding: 0, resource: { buffer: gpuFrameBuffer } }],
		});

		backend = 'webgpu';
		return true;
	}

	onMount(() => {
		if (!canvasEl) return;

		const observer = new ResizeObserver(() => resizeCanvas());
		observer.observe(canvasEl);
		resizeCanvas();

		let cancelled = false;

		(async () => {
			const usedWebGPU = await initWebGPUPath();
			if (cancelled) return;
			if (usedWebGPU) {
				frameId = requestAnimationFrame(renderWebGPU);
				return;
			}

			backend = 'canvas2d';
			ctx = canvasEl?.getContext('2d') ?? null;
			frameId = requestAnimationFrame(renderCanvas);
		})();

		return () => {
			cancelled = true;
			observer.disconnect();
			if (frameId) cancelAnimationFrame(frameId);
			gpuCornerBuffer?.destroy?.();
			gpuInstanceBuffer?.destroy?.();
			gpuFrameBuffer?.destroy?.();
		};
	});
</script>

<div class="agent-sprite-shell">
	<canvas
		bind:this={canvasEl}
		class="agent-sprite-field"
		style={`width:${width}px;height:${height}px;`}
	></canvas>
	<div class="agent-sprite-status">{backend === 'webgpu' ? 'WebGPU instance buffer' : 'Canvas fallback'}</div>
</div>

<style>
	.agent-sprite-shell {
		display: grid;
		gap: 0.5rem;
	}

	.agent-sprite-field {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: 16px;
		background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 1));
		border: 1px solid rgba(148, 163, 184, 0.18);
	}

	.agent-sprite-status {
		font-size: 0.75rem;
		line-height: 1rem;
		color: rgba(148, 163, 184, 0.9);
	}
</style>
