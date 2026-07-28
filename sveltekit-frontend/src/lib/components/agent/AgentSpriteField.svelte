<script lang="ts">
	import { onMount } from 'svelte';
	import { clamp01, interpolateAgentVisualState } from '$lib/utils/agent-visual-state.js';
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
	let ctx: CanvasRenderingContext2D | null = null;
	let dpr = 1;

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

	function resizeCanvas() {
		if (!canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
		canvasEl.width = Math.max(1, Math.floor((rect.width || width) * dpr));
		canvasEl.height = Math.max(1, Math.floor((rect.height || height) * dpr));
	}

	function drawSprite(x: number, y: number, size: number, fill: string, label: string, progress: number, state: AgentVisualState) {
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

	function render() {
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
			frameId = requestAnimationFrame(render);
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
			const previous = {
				...state,
				x: state.previousX,
				y: state.previousY,
			};
			const alpha = clamp01((now - state.updatedAtMs) / 220);
			const frame = interpolateAgentVisualState(previous, state, alpha);
			const fill = stateColors[state.state] ?? palette[index % palette.length];
			const label = `${state.agentId}${state.progress ? ` · ${Math.round(state.progress)}%` : ''}`;
			drawSprite(
				centerX + frame.interpolatedX,
				centerY + frame.interpolatedY,
				baseSize,
				fill,
				label,
				state.progress,
				state,
			);
		});

		frameId = requestAnimationFrame(render);
	}

	onMount(() => {
		if (!canvasEl) return;
		const observer = new ResizeObserver(() => resizeCanvas());
		observer.observe(canvasEl);
		resizeCanvas();
		ctx = canvasEl.getContext('2d');
		frameId = requestAnimationFrame(render);

		return () => {
			observer.disconnect();
			if (frameId) cancelAnimationFrame(frameId);
		};
	});
</script>

<canvas bind:this={canvasEl} class="agent-sprite-field" style={`width:${width}px;height:${height}px;`}></canvas>

<style>
	.agent-sprite-field {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: 16px;
		background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 1));
		border: 1px solid rgba(148, 163, 184, 0.18);
	}
</style>
