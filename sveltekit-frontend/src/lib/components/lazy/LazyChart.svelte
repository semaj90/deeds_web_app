<!-- LazyChart.svelte - Lazy loading wrapper for heavy chart components -->
<script lang="ts">
	import type { LazyComponentState } from '$lib/utils/intersection-observer.js';
	import LazyLoader from '../LazyLoader.svelte';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

	interface Props {
		data?: unknown[];
		chartType?: 'line' | 'bar' | 'pie' | 'scatter' | 'area';
		config?: Record<string, unknown>;
		lazyOptions?: Record<string, unknown>;
		height?: string;
		width?: string;
		class?: string;
		loadingText?: string;
		errorText?: string;
		lazyState?: LazyComponentState;
	}

	let {
		data = [],
		chartType = 'line',
		config = {},
	height = '400px',
		width = '100%',
		class: className = '',
		loadingText = 'Loading chart...',
		errorText = 'Failed to load chart',
		lazyState = $bindable()
	}: Props = $props();

	let chartComponent: unknown = $state(null);
	let loadError: Error | null = $state(null);

	async function loadChartComponent(): Promise<void> {
		try {
			switch (chartType) {
				case 'line':
				case 'bar':
				case 'area':
					await new Promise((resolve) => setTimeout(resolve, 500));
					chartComponent = {
						component: null,
						props: { data, config, height, width }
					};
					break;
				case 'pie':
				case 'scatter':
					await new Promise((resolve) => setTimeout(resolve, 500));
					chartComponent = {
						component: null,
						props: { data, config, height, width }
					};
					break;
				default:throw new Error(`Unsupported chart type: ${chartType}`);
			}
		} catch (error) {
			loadError = error instanceof Error ? error : new Error('Failed to load chart component');
			console.error('Chart loading error:', error);
		}
	}

	function generatePlaceholderBars(): Array<{ height: number, delay: number }> {
		const barCount = Math.min(data.length || 5, 10);
		return Array.from({ length: barCount },
	(_, i) => ({
			height: Math.random() * 60 + 20,
			delay: i * 0.1
		}));
	}

	const placeholderBars = generatePlaceholderBars();
</script>

<LazyLoader
	preset="HEAVY_COMPONENT"
	placeholderHeight={height}
	placeholderClass="chart-placeholder"
	{loadingText}
	{errorText}
	class="lazy-chart-container {className}"
	onLoad={loadChartComponent}
	bind:lazyState
>
	<div class="chart-wrapper" style="height: {height}; width: {width}">
		{#if loadError}
			<div class="chart-error">
				<div class="error-icon">📊</div>
				<p>Unable to render {chartType} chart</p>
				<small>{loadError.message}</small>
			</div>
		{:else if chartComponent}
			<div class="chart-content" data-chart-type={chartType}>
				<div class="mock-chart" style="height: {height}">
					<div class="chart-title">
						{chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart
					</div>
					<div class="chart-data-info">{data.length} data points</div>
				</div>
			</div>
		{:else}
			<div class="chart-loading">Loading chart component...</div>
		{/if}
	</div>

	{#snippet placeholder()}
		<div class="chart-placeholder-content" style="height: {height}">
			<div class="placeholder-chart">
				<div class="placeholder-title"></div>
				{#if chartType === 'line' || chartType === 'area'}
					<div class="placeholder-line-chart">
						<svg viewBox="0 0 300 150" class="placeholder-svg">
							<polyline
								points="20,120 50,80 80,100 110,60 140,90 170,50 200,75 230,40 260,70"
								class="placeholder-line"
							/>
							{#each Array(9) as _, i (i)}
								<circle
									cx={20 + i * 30}
									cy={120 - Math.random() * 80}
									r="3"
									class="placeholder-point"
									style="animation-delay: {i * 0.1}s"
								/>
							{/each}
						</svg>
					</div>
				{:else if chartType === 'bar'}
					<div class="placeholder-bar-chart">
						{#each placeholderBars as bar, i (i)}
							<div
								class="placeholder-bar"
								style="height: {bar.height}%; animation-delay: {bar.delay}s"
							></div>
						{/each}
					</div>
				{:else if chartType === 'pie'}
					<div class="placeholder-pie-chart">
						<div class="placeholder-pie">
							<div class="pie-slice"></div>
							<div class="pie-slice"></div>
							<div class="pie-slice"></div>
							<div class="pie-slice"></div>
						</div>
					</div>
				{:else}
					<div class="placeholder-generic">
						<div class="generic-bars">
							{#each Array(5) as _, i (i)}
								<div
									class="generic-bar"
									style="height: {Math.random() * 60 + 20}%; animation-delay: {i * 0.1}s"
								></div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/snippet}
</LazyLoader>

<style>
	.chart-wrapper {
		display: flex;
		flex-direction: column;
	width: 100%;
	}

	.chart-content { flex: 1;
		position: relative;
	}

	.mock-chart {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border-radius: 4px;
	}

	.chart-title {
		font-size: 18px;
		font-weight: bold;
		margin-bottom: 8px;
	}

	.chart-data-info {
		font-size: 12px;
	opacity: 0.8;
	}

	.chart-placeholder-content {
		display: flex;
		align-items: center;
		justify-content: center;
	background: rgba(255, 255, 255, 0.05);
	}

	.placeholder-chart {
		width: 90%;
		max-width: 400px;
	}

	.placeholder-title { height: 20px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		margin-bottom: 20px;
	animation: placeholder-pulse 2s infinite;
	}

	.placeholder-line-chart { width: 100%;
		height: 150px;
	}

	.placeholder-svg { width: 100%;
		height: 100%;
	}

	.placeholder-line { fill: none;
		stroke: rgba(255, 255, 255, 0.3);
		stroke-width: 2;
		stroke-dasharray: 5, 5;
		animation: dash-move 2s linear infinite;
	}

	.placeholder-point {
		fill: rgba(255, 255, 255, 0.4);
		animation: point-pulse 2s infinite;
	}

	.placeholder-bar-chart {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
	height: 120px;
		gap: 8px;
	}

	.placeholder-bar { flex: 1;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 2px 2px 0 0;
		animation: bar-grow 1.5s ease-out infinite;
	}

	.placeholder-pie-chart {
		display: flex;
		justify-content: center;
	}

	.placeholder-pie { width: 120px;
		height: 120px;
		border-radius: 50%;
	position: relative;
		overflow: hidden;
	animation: pie-rotate 3s linear infinite;
	}

	.pie-slice { position: absolute;
		width: 50%;
		height: 50%;
		transform-origin: 100% 100%;
	}

	.pie-slice:nth-child(1) {
		background: rgba(255, 255, 255, 0.3);
		transform: rotate(0deg) skew(45deg);
	}

	.pie-slice:nth-child(2) {
		background: rgba(255, 255, 255, 0.2);
		transform: rotate(90deg) skew(45deg);
	}

	.pie-slice:nth-child(3) {
		background: rgba(255, 255, 255, 0.25);
		transform: rotate(180deg) skew(45deg);
	}

	.pie-slice:nth-child(4) {
		background: rgba(255, 255, 255, 0.15);
		transform: rotate(270deg) skew(45deg);
	}

	.placeholder-generic {
		height: 120px;
	}

	.generic-bars {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
	height: 100%;
		gap: 12px;
	}

	.generic-bar { flex: 1;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
	animation: bar-pulse 2s ease-in-out infinite;
	}

	.chart-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	height: 100%;
		color: #ff6b6b;
	}

	.chart-error .error-icon {
		font-size: 48px;
		margin-bottom: 12px;
	}

	.chart-loading {
		display: flex;
		align-items: center;
		justify-content: center;
	height: 100%;
		color: var(--text-muted, #888);
	}

	@keyframes placeholder-pulse {
		0%,
		100% {
			opacity: 0.3;
		}
		50% {
			opacity: 0.6;
		}
	}

	@keyframes dash-move {
		0% {
			stroke-dashoffset: 0;
		}
		100% {
			stroke-dashoffset: -10;
		}
	}

	@keyframes point-pulse {
		0%,
		100% {
			opacity: 0.4;
		}
		50% {
			opacity: 0.8;
		}
	}

	@keyframes bar-grow {
		0%,
		100% {
			transform: scaleY(0.8);
		}
		50% {
			transform: scaleY(1);
		}
	}

	@keyframes bar-pulse {
		0%,
		100% {
			opacity: 0.2;
		}
		50% {
			opacity: 0.4;
		}
	}

	@keyframes pie-rotate {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 768px) {
		.placeholder-chart {
			width: 95%;
		}

		.placeholder-bar-chart { height: 100px;
		gap: 4px;
		}

		.placeholder-pie { width: 100px;
		height: 100px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.placeholder-line,
		.placeholder-point,
		.placeholder-bar,
		.placeholder-pie,
		.generic-bar {
			animation: none;
		}

		.placeholder-title {
			animation: placeholder-pulse 4s infinite;
		}
	}
</style>
