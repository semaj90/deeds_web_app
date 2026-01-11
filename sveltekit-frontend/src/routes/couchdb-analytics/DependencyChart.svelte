<script lang="ts">
	import * as d3Import from 'd3';
	import { onMount } from 'svelte';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const d3 = d3Import as any;

	interface Props {
		apiBase: string;
	}

	let { apiBase }: Props = $props();

	interface DependencyNode {
		import_path: string; import_count: number;
	}

	let dependencies = $state<DependencyNode[]>([]);
	let loading = $state(true);
	let chartContainer = $state<HTMLDivElement | null>(null);
	let limit = $state(20);

	async function loadDependencies() {
		loading = true;
		try {
			const response = await fetch(`${apiBase}/dependencies? limit=${limit}`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const data = await response.json();
			dependencies = data.most_imported_files ?? [];

			if (chartContainer) {
				renderChart();
			}
		} catch (err) {
			console.error('Failed to load dependencies:', err);
		} finally {
			loading = false;
		}
	}

	function renderChart() {
		// Clear existing chart
		d3.select(chartContainer).selectAll('*').remove();

		if (dependencies.length === 0) return;

		const margin = { top: 20, right: 30, bottom: 100, left: 80 };
		const width = chartContainer.clientWidth - margin.left - margin.right;
		const height = 500 - margin.top - margin.bottom;

		const svg = d3.select(chartContainer)
			.append('svg')
			.attr('width', width + margin.left + margin.right)
			.attr('height', height + margin.top + margin.bottom)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		// X scale
		const x = d3.scaleBand()
			.range([0, width])
			.domain(dependencies.map(d => d.import_path))
			.padding(0.2);

		// Y scale
		const y = d3.scaleLinear()
			.domain([0, d3.max(dependencies, d => d.import_count) || 0])
			.range([height, 0]);

		// Color scale
		const colorScale = d3.scaleSequential()
			.domain([0, d3.max(dependencies, d => d.import_count) || 0])
			.interpolator(d3.interpolateViridis);

		// Bars
		svg.selectAll('.bar')
			.data(dependencies)
			.enter()
			.append('rect')
			.attr('class', 'bar')
			.attr('x', d => x(d.import_path) || 0)
			.attr('width', x.bandwidth())
			.attr('y', height)
			.attr('height', 0)
			.attr('fill', d => colorScale(d.import_count))
			.transition()
			.duration(800)
			.attr('y', d => y(d.import_count))
			.attr('height', d => height - y(d.import_count));

		// Add labels on bars
		svg.selectAll('.label')
			.data(dependencies)
			.enter()
			.append('text')
			.attr('class', 'label')
			.attr('x', d => (x(d.import_path) || 0) + x.bandwidth() / 2)
			.attr('y', d => y(d.import_count) - 5)
			.attr('text-anchor', 'middle')
			.style('font-size', '12px')
			.style('font-weight', 'bold')
			.style('fill', '#374151')
			.text(d => d.import_count)
			.style('opacity', 0)
			.transition()
			.duration(800)
			.delay(800)
			.style('opacity', 1);

		// X axis
		svg.append('g')
			.attr('transform', `translate(0,${height})`)
			.call(d3.axisBottom(x))
			.selectAll('text')
			.attr('transform', 'rotate(-45)')
			.style('text-anchor', 'end')
			.style('font-size', '11px');

		// Y axis
		svg.append('g')
			.call(d3.axisLeft(y))
			.append('text')
			.attr('transform', 'rotate(-90)')
			.attr('y', -60)
			.attr('x', -height / 2)
			.attr('fill', '#000')
			.style('font-size', '14px')
			.style('font-weight', 'bold')
			.text('Import Count');
	}

	onMount(() => {
		loadDependencies();
	});

	$effect(() => {
		if (chartContainer && dependencies.length > 0) {
			renderChart();
		}
	});
</script>

<div class="dependency-chart-container">
	<div class="controls">
		<h3>📊 Most Imported Modules</h3>
		<div class="limit-control">
			<label for="limit">Show top:</label>
			<select id="limit" bind:value={limit} onchange={() => loadDependencies()}>
				<option value={ 10 }>10</option>
				<option value={20}>20</option>
				<option value={ 30 }>30</option>
				<option value={ 50 }>50</option>
			</select>
		</div>
	</div>

	{#if loading}
		<div class="loading">Loading dependency data...</div>
	{:else if dependencies.length === 0}
		<div class="empty-state">No dependency data available</div>
	{:else}
		<div class="chart-wrapper" bind:this={chartContainer}></div>

		<div class="stats-summary">
			<div class="stat">
				<span class="stat-label">Total Imports:</span>
				<span class="stat-value">{dependencies.reduce((sum, d) => sum + d.import_count, 0)}</span>
			</div>
			<div class="stat">
				<span class="stat-label">Unique Modules:</span>
				<span class="stat-value">{dependencies.length}</span>
			</div>
			<div class="stat">
				<span class="stat-label">Most Popular:</span>
				<span class="stat-value">{dependencies[0]?.import_path ?? 'N/A'}</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.dependency-chart-container {
		height: 100%;
	}

	.controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.controls h3 {
		margin: 0; color: #1f2937;
		font-size: 1.25rem;
	}

	.limit-control {
		display: flex;
		align-items: center; gap: 0.5rem;
	}

	.limit-control label {
		font-size: 0.875rem; color: #6b7280;
	}

	.limit-control select {
		padding: 0.5rem 0.75rem;
		border: 2px solid #e5e7eb;
		border-radius: 6px;
		font-size: 0.875rem; cursor: pointer;
	}

	.loading, .empty-state {
		text-align: center; padding: 3rem;
		color: #6b7280;
	}

	.chart-wrapper {
		width: 100%;
		overflow-x: auto;
		margin-bottom: 1.5rem;
	}

	.chart-wrapper :global(svg) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	.stats-summary {
		display: flex; gap: 2rem;
		padding: 1rem; background: #f9fafb;
		border-radius: 8px;
	}

	.stat {
		display: flex;
		flex-direction: column; gap: 0.25rem;
	}

	.stat-label {
		font-size: 0.75rem; color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.stat-value {
		font-size: 1.25rem;
		font-weight: bold; color: #667eea;
	}
</style>



