import os

files_to_fix = {
    "sveltekit-frontend/src/routes/couchdb-analytics/DependencyChart.svelte": r"""<script lang="ts">
	import * as d3Import from 'd3';
	import { onMount } from 'svelte';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const d3 = d3Import as any;

	interface Props {
		apiBase: string;
	}

	let { apiBase }: Props = $props();

	interface DependencyNode {
		import_path: string;
		import_count: number;
	}

	let dependencies = $state<DependencyNode[]>([]);
	let loading = $state(true);
	let chartContainer = $state<HTMLDivElement | null>(null);
	let limit = $state(20);

	async function loadDependencies() {
		loading = true;
		try {
			const response = await fetch(`${apiBase}/dependencies?limit=${limit}`);
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
		margin: 0;
		color: #1f2937;
		font-size: 1.25rem;
	}

	.limit-control {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.limit-control label {
		font-size: 0.875rem;
		color: #6b7280;
	}

	.limit-control select {
		padding: 0.5rem 0.75rem;
		border: 2px solid #e5e7eb;
		border-radius: 6px;
		font-size: 0.875rem;
		cursor: pointer;
	}

	.loading, .empty-state {
		text-align: center;
		padding: 3rem;
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
		display: flex;
		gap: 2rem;
		padding: 1rem;
		background: #f9fafb;
		border-radius: 8px;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.stat-value {
		font-size: 1.25rem;
		font-weight: bold;
		color: #667eea;
	}
</style>""",

    "sveltekit-frontend/src/routes/couchdb-analytics/ErrorPropagationGraph.svelte": r"""<script lang="ts">
	import * as d3Import from 'd3';
	import { onMount } from 'svelte';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const d3 = d3Import as any;

	interface Props {
		apiBase: string;
	}

	let { apiBase }: Props = $props();

	interface ErrorNode {
		file_path: string;
		error_count: number;
		imports: string[];
	}

	let errorFiles = $state<ErrorNode[]>([]);
	let loading = $state(true);
	let graphContainer = $state<HTMLDivElement | null>(null);
	let selectedNode = $state<ErrorNode | null>(null);

	async function loadErrorPropagation() {
		loading = true;
		try {
			const response = await fetch(`${apiBase}/error-propagation?limit=15`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const data = await response.json();
			errorFiles = data.error_files ?? [];

			if (graphContainer) {
				renderGraph();
			}
		} catch (err) {
			console.error('Failed to load error propagation:', err);
		} finally {
			loading = false;
		}
	}

	function renderGraph() {
		// Clear existing graph
		d3.select(graphContainer).selectAll('*').remove();

		if (errorFiles.length === 0) return;

		const width = graphContainer.clientWidth;
		const height = 600;

		// Create nodes and links
		const nodes = errorFiles.map(f => ({
			id: f.file_path,
			error_count: f.error_count,
			imports: f.imports
		}));

		const links: Array<{source: string, target: string}> = [];
		errorFiles.forEach(file => {
			file.imports.forEach(imp => {
				// Only create link if both files have errors
				if (errorFiles.some(f => f.file_path === imp)) {
					links.push({ source: file.file_path, target: imp });
				}
			});
		});

		const svg = d3.select(graphContainer)
			.append('svg')
			.attr('width', width)
			.attr('height', height);

		// Create force simulation
		const simulation = d3.forceSimulation(nodes as any)
			.force('link', d3.forceLink(links).id((d: any) => d.id).distance(100))
			.force('charge', d3.forceManyBody().strength(-300))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide().radius(40));

		// Create links
		const link = svg.append('g')
			.selectAll('line')
			.data(links)
			.enter()
			.append('line')
			.attr('stroke', '#cbd5e1')
			.attr('stroke-width', 2)
			.attr('marker-end', 'url(#arrowhead)');

		// Add arrow marker
		svg.append('defs').append('marker')
			.attr('id', 'arrowhead')
			.attr('viewBox', '-0 -5 10 10')
			.attr('refX', 25)
			.attr('refY', 0)
			.attr('orient', 'auto')
			.attr('markerWidth', 6)
			.attr('markerHeight', 6)
			.append('svg:path')
			.attr('d', 'M 0,-5 L 10 ,0 L 0,5')
			.attr('fill', '#cbd5e1');

		// Create nodes
		const node = svg.append('g')
			.selectAll('g')
			.data(nodes)
			.enter()
			.append('g')
			.call((d3 as any).drag()
				.on('start', dragstarted)
				.on('drag', dragged)
				.on('end', dragended)
			);

		// Node circles
		const colorScale = d3.scaleSequential()
			.domain([0, d3.max(nodes, (d: any) => d.error_count) || 0])
			.interpolator(d3.interpolateRdYlGn).range([1, 0] as any);

		node.append('circle')
			.attr('r', (d: any) => 10 + Math.sqrt(d.error_count) * 3)
			.attr('fill', (d: any) => colorScale(d.error_count))
			.attr('stroke', '#fff')
			.attr('stroke-width', 2)
			.style('cursor', 'pointer')
			.on('click', (event: any, d: any) => {
				selectedNode = errorFiles.find(f => f.file_path === d.id) || null;
			});

		node.append('text')
			.text((d: any) => d.id.split('/').pop() || d.id)
			.attr('x', 0)
			.attr('y', -20)
			.attr('text-anchor', 'middle')
			.style('font-size', '10px')
			.style('font-weight', 'bold')
			.style('fill', '#374151')
			.style('pointer-events', 'none');

		// Error count badges
		node.append('text')
			.text((d: any) => d.error_count)
			.attr('x', 0)
			.attr('y', 4)
			.attr('text-anchor', 'middle')
			.style('font-size', '12px')
			.style('font-weight', 'bold')
			.style('fill', '#fff')
			.style('pointer-events', 'none');

		// Update positions on tick
		simulation.on('tick', () => {
			link
				.attr('x1', (d: any) => d.source.x)
				.attr('y1', (d: any) => d.source.y)
				.attr('x2', (d: any) => d.target.x)
				.attr('y2', (d: any) => d.target.y);

			node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
		});

		function dragstarted(event: any) {
			if (!event.active) simulation.alphaTarget(0.3).restart();
			event.subject.fx = event.subject.x;
			event.subject.fy = event.subject.y;
		}

		function dragged(event: any) {
			event.subject.fx = event.x;
			event.subject.fy = event.y;
		}

		function dragended(event: any) {
			if (!event.active) simulation.alphaTarget(0);
			event.subject.fx = null;
			event.subject.fy = null;
		}
	}

	onMount(() => {
		loadErrorPropagation();
	});

	$effect(() => {
		if (graphContainer && errorFiles.length > 0) {
			renderGraph();
		}
	});
</script>

<div class="error-propagation-container">
	<div class="header">
		<h3>⚠️ Error Propagation Graph</h3>
		<p class="description">Files with errors and their import relationships</p>
	</div>

	{#if loading}
		<div class="loading">Loading error propagation data...</div>
	{:else if errorFiles.length === 0}
		<div class="empty-state">
			<p>✅ No error propagation detected!</p>
			<p class="hint">All files are error-free</p>
		</div>
	{:else}
		<div class="content-grid">
			<div class="graph-panel">
				<div class="legend">
					<div class="legend-item">
						<div class="legend-color" style="background: #dc2626;"></div>
						<span>High Errors</span>
					</div>
					<div class="legend-item">
						<div class="legend-color" style="background: #f59e0b;"></div>
						<span>Medium Errors</span>
					</div>
					<div class="legend-item">
						<div class="legend-color" style="background: #10b981;"></div>
						<span>Low Errors</span>
					</div>
				</div>
				<div class="graph-wrapper" bind:this={graphContainer}></div>
			</div>

			{#if selectedNode}
				<div class="detail-panel">
					<div class="panel-header">
						<h4>📄 File Details</h4>
						<button class="close-btn" onclick={() => selectedNode = null}>✕</button>
					</div>
					<div class="panel-body">
						<div class="detail-item">
							<span class="label">Path:</span>
							<span class="value">{selectedNode.file_path}</span>
						</div>
						<div class="detail-item">
							<span class="label">Errors:</span>
							<span class="value error-badge">{selectedNode.error_count}</span>
						</div>
						<div class="detail-item">
							<span class="label">Imports:</span>
							<div class="imports-list">
								{#if selectedNode.imports.length === 0}
									<span class="no-imports">No imports</span>
								{:else}
									{#each selectedNode.imports.slice(0, 10) as imp}
										<div class="import-item">{ imp }</div>
									{/each}
									{#if selectedNode.imports.length > 10}
										<div class="import-item more">+{selectedNode.imports.length - 10} more</div>
									{/if}
								{/if}
							</div>
						</div>
					</div>
				</div>
			{:else}
				<div class="info-panel">
					<div class="icon">👆</div>
					<p>Click on a node to view details</p>
					<p class="hint">Drag nodes to rearrange the graph</p>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.error-propagation-container {
		height: 100%;
	}

	.header {
		margin-bottom: 1.5rem;
	}

	.header h3 {
		margin: 0 0 0.5rem 0;
		color: #1f2937;
		font-size: 1.25rem;
	}

	.description {
		margin: 0;
		color: #6b7280;
		font-size: 0.875rem;
	}

	.loading, .empty-state {
		text-align: center;
		padding: 3rem;
		color: #6b7280;
	}

	.empty-state .hint {
		margin-top: 0.5rem;
		font-size: 0.875rem;
	}

	.content-grid {
		display: grid;
		grid-template-columns: 1fr 300px;
		gap: 1.5rem;
		height: calc(100% - 80px);
	}

	.graph-panel {
		position: relative;
	}

	.legend {
		position: absolute;
		top: 10px;
		right: 10px;
		background: white;
		padding: 0.75rem;
		border-radius: 8px;
		border: 2px solid #e5e7eb;
		z-index: 10;
		display: flex;
		gap: 1rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
	}

	.legend-color {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}

	.graph-wrapper {
		width: 100%;
		height: 600px;
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		overflow: hidden;
		background: #f9fafb;
	}

	.detail-panel, .info-panel {
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		overflow: hidden;
	}

	.panel-header {
		background: #f9fafb;
		padding: 1rem;
		border-bottom: 2px solid #e5e7eb;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.panel-header h4 {
		margin: 0;
		font-size: 1rem;
		color: #1f2937;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.25rem;
		cursor: pointer;
		color: #6b7280;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
	}

	.close-btn:hover {
		background: #e5e7eb;
	}

	.panel-body {
		padding: 1rem;
	}

	.detail-item {
		margin-bottom: 1rem;
	}

	.detail-item .label {
		display: block;
		font-size: 0.75rem;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 0.25rem;
	}

	.detail-item .value {
		display: block;
		font-size: 0.875rem;
		color: #1f2937;
		word-break: break-all;
	}

	.error-badge {
		display: inline-block;
		background: #dc2626;
		color: white;
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-weight: bold;
	}

	.imports-list {
		max-height: 300px;
		overflow-y: auto;
	}

	.import-item {
		padding: 0.5rem;
		background: #f9fafb;
		border-radius: 4px;
		font-size: 0.75rem;
		font-family: monospace;
		margin-bottom: 0.25rem;
	}

	.import-item.more {
		background: #e5e7eb;
		text-align: center;
		font-family: inherit;
		color: #6b7280;
	}

	.no-imports {
		color: #9ca3af;
		font-size: 0.875rem;
		font-style: italic;
	}

	.info-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		text-align: center;
		color: #6b7280;
	}

	.info-panel .icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.info-panel .hint {
		margin-top: 0.5rem;
		font-size: 0.75rem;
	}
</style>""",

    "sveltekit-frontend/src/routes/odin/+page.server.ts": r"""import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // 1. Lucia v3 Session Check
  // Note: For Phase 72 testing, we might be bypassing auth.
  // If locals.user is null, we redirect.
  // if (!locals.user) {
  // 	throw redirect(302, '/login');
  // }

  // 2. Fetch Data (Direct DB or via Service)
  // We fetch high-priority errors to display on the dashboard
  const stats: Array<{ error_code: string; message: string; count: number }> = [];

  // Mock user for consistent UI if auth is bypassed
  const user = locals?.user || {
    id: 'mock-user-id',
    username: 'Investigator_Vance',
    role: 'ADMIN'
  };

  return {
    user,
    caseId: 'ODIN-8842-XC',
    stats
  };
};
""",

    "sveltekit-frontend/src/routes/odin/+page.svelte": r"""<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { PageData } from './$types';

  // Svelte 5 Props (Runes)
  let { data }: { data: PageData } = $props();

  // Svelte 5 State (Runes)
  let activeTab = $state('overview');
  let isScanning = $state(false);
  let uploadFiles = $state<FileList | null>(null);
  let processingLog = $state<string[]>([]);
  let processingStatus = $state<'idle' | 'uploading' | 'processing' | 'complete'>('idle');

  // Svelte 5 Derived State
  // Using simple derivation here
  let userName = $derived(data.user?.username?.toUpperCase() ?? 'UNKNOWN');

  function runScan() {
    isScanning = true;
    setTimeout(() => isScanning = false, 2000);
  }

  async function handleUpload(e: Event) {
    e.preventDefault();
    if (!uploadFiles || uploadFiles.length === 0) return;

    processingStatus = 'uploading';
    processingLog = [...processingLog, '> INITIATING SECURE UPLOAD PROTOCOL...'];

    const formData = new FormData();
    for (let i = 0; i < uploadFiles.length; i++) {
      formData.append('files', uploadFiles[i]);
      processingLog = [...processingLog, `> BUFFERING: ${uploadFiles[i].name.toUpperCase()}...`];
    }

    try {
      // Simulate processing steps for UI demo
      await new Promise(r => setTimeout(r, 1000));
      processingStatus = 'processing';

      processingLog = [...processingLog, '> UPLOAD COMPLETE. ENGAGING DOCLING-258M...'];
      await new Promise(r => setTimeout(r, 1500));

      processingLog = [...processingLog, '> OCR/VLM EXTRACTION SUCCESSFUL.'];
      processingLog = [...processingLog, '> DETECTING LANGUAGE (LANGEXTRACT)... EN-US DETECTED.'];
      await new Promise(r => setTimeout(r, 1000));

      processingLog = [...processingLog, '> CHUNKING & STREAMING TO VECTOR INDEX...'];
      processingLog = [...processingLog, '> CALCULATING COSINE RANKINGS...'];
      await new Promise(r => setTimeout(r, 1000));

      processingLog = [...processingLog, '> GENERATING TOPOLOGICAL TOPIC MAP...'];
      processingLog = [...processingLog, '> BATCHING TO GEMMA3-LEGAL...'];

      processingStatus = 'complete';
      processingLog = [...processingLog, '> INGESTION SEQUENCE COMPLETE. ARTIFACTS INDEXED.'];

      // In a real implementation, we would fetch('/api/ingest', { method: 'POST', body: formData })
    } catch (err) {
      processingLog = [...processingLog, `> ERROR: ${ err }`];
      processingStatus = 'idle';
    }
  }
</script>

<!-- "Project Odin" / NES Command Center Layout -->
<div class="screen-nes h-screen overflow-hidden">

  <!-- HEADER -->
  <header class="screen-nes-header border-b-4 border-nes-border pb-4">
    <div>
      <h1 class="screen-nes-title text-nes-accent2">PROJECT: ODIN</h1>
      <div class="screen-nes-subtitle">SUBJECT #8842-XC // {userName}</div>
    </div>

    <!-- NES Status Indicators -->
    <div class="flex gap-4">
      <div class="nes-status text-nes-success">
        <div class="nes-status-dot nes-status-online"></div> SYSTEM ONLINE
      </div>
      <div class="nes-badge-ace">SECURE CONNECTION</div>
    </div>
  </header>

  <!-- MAIN GRID LAYOUT -->
  <main class="grid grid-cols-12 gap-4 h-full pt-4">

    <!-- LEFT SIDEBAR (Subject Profile) -->
    <aside class="col-span-3 flex flex-col gap-4">
      <div class="nes-panel p-0">
        <div class="nes-panel-header">
          <span>ID</span>
          <span>SUBJ_PROFILE</span>
          <span>V1.2</span>
          <span>[X]</span>
        </div>
        <div class="p-4 flex flex-col items-center gap-4">
          <div class="w-32 h-32 border-2 border-nes-muted bg-black/50 flex items-center justify-center">
            <span class="text-4xl">👤</span>
          </div>
          <div class="w-full space-y-2">
            <div class="nes-row px-0 py-1 grid-cols-[1fr_auto]">
              <span class="text-nes-muted">THREAT LVL</span>
              <span class="text-nes-danger animate-pulse">CRITICAL</span>
            </div>
            <div class="nes-row px-0 py-1 grid-cols-[1fr_auto]">
              <span class="text-nes-muted">CLEARANCE</span>
              <span class="text-nes-accent">LEVEL 5</span>
            </div>
            <div class="nes-row px-0 py-1 grid-cols-[1fr_auto]">
              <span class="text-nes-muted">ROLE</span>
              <span class="text-nes-text">{data.user?.role ?? 'INVESTIGATOR'}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <button
        class="nes-btn nes-btn-primary w-full"
        onclick={runScan}
        disabled={isScanning}
      >
        {isScanning ? 'SCANNING...' : 'INITIATE DEEP SCAN'}
      </button>

      <div class="nes-panel p-4 flex-1">
        <div class="text-[10px] text-nes-muted mb-2">SCAN LOGS</div>
        <div class="font-mono text-[9px] text-nes-success space-y-1">
          <div>> CONNECTING TO GRID... OK</div>
          <div>> VERIFYING HASH... OK</div>
          <div>> LOADING MODULES... 100%</div>
          {#if isScanning}
            <div in:fade>> ENCRYPTING DATA STREAM...</div>
            <div in:fade class="animate-pulse">> UPLOADING TO AI CORE...</div>
          {/if}
          {#each processingLog as log}
            <div in:fade>{log}</div>
          {/each}
        </div>
      </div>
    </aside>

    <!-- CENTER DASHBOARD (Evidence Board) -->
    <section class="col-span-9 flex flex-col gap-4">

      <!-- TABS (UnoCSS Grid) -->
      <div class="grid grid-cols-5 gap-2">
        {#each ['overview', 'evidence', 'intercepts', 'terminal', 'ingest'] as tab}
          <button
            class="nes-btn {activeTab === tab ? 'nes-btn-primary' : 'nes-btn-ghost'} uppercase"
            onclick={() => activeTab = tab}
          >
            { tab }
          </button>
        {/each}
      </div>

      <!-- DATA GRID (SSR Data) -->
      <div class="nes-panel flex-1 flex flex-col">
        {#if activeTab === 'ingest'}
          <div class="nes-panel-header bg-nes-accent2/10 text-nes-accent2">
            <span>SECURE INGESTION PROTOCOL</span>
            <span>DOCLING-258M</span>
            <span>GEMMA3-LEGAL</span>
          </div>

          <div class="p-8 flex flex-col gap-8 h-full">
            <!-- Upload Zone -->
            <div class="border-4 border-dashed border-nes-muted rounded-lg p-12 flex flex-col items-center justify-center gap-4 hover:border-nes-accent transition-colors bg-black/20">
              <span class="text-6xl">📂</span>
              <div class="text-center">
                <h3 class="text-xl text-nes-text mb-2">DROP CLASSIFIED MATERIALS HERE</h3>
                <p class="text-nes-muted text-sm">SUPPORTED: PDF: DOCX, MP3: PNG, JPG</p>
              </div>
              <input
                type="file"
                multiple
                class="hidden"
                id="file-upload"
                onchange={(e) => uploadFiles = (e.target as HTMLInputElement).files}
              />
              <label for="file-upload" class="nes-btn nes-btn-primary cursor-pointer">
                SELECT FILES
              </label>
              {#if uploadFiles && uploadFiles.length > 0}
                <div class="text-nes-success mt-4">
                  SELECTED {uploadFiles.length} FILES
                </div>
              {/if}
            </div>

            <!-- Pipeline Configuration -->
            <div class="grid grid-cols-2 gap-8">
              <div class="space-y-4">
                <h4 class="text-nes-accent border-b-2 border-nes-accent pb-2">PIPELINE CONFIGURATION</h4>

                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="w-6 h-6 border-2 border-nes-text flex items-center justify-center group-hover:border-nes-accent">
                    <div class="w-3 h-3 bg-nes-accent"></div>
                  </div>
                  <span class="text-nes-text">ENABLE DOCLING-258M (OCR/VLM)</span>
                </label>

                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="w-6 h-6 border-2 border-nes-text flex items-center justify-center group-hover:border-nes-accent">
                    <div class="w-3 h-3 bg-nes-accent"></div>
                  </div>
                  <span class="text-nes-text">LANGEXTRACT + TRANSLATION</span>
                </label>

                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="w-6 h-6 border-2 border-nes-text flex items-center justify-center group-hover:border-nes-accent">
                    <div class="w-3 h-3 bg-nes-accent"></div>
                  </div>
                  <span class="text-nes-text">WHISPER AUDIO TRANSCRIPTION</span>
                </label>
              </div>

              <div class="space-y-4">
                <h4 class="text-nes-accent border-b-2 border-nes-accent pb-2">INDEXING STRATEGY</h4>

                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="w-6 h-6 border-2 border-nes-text flex items-center justify-center group-hover:border-nes-accent">
                    <div class="w-3 h-3 bg-nes-accent"></div>
                  </div>
                  <span class="text-nes-text">COSINE RANKING + DEDUPLICATION</span>
                </label>

                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="w-6 h-6 border-2 border-nes-text flex items-center justify-center group-hover:border-nes-accent">
                    <div class="w-3 h-3 bg-nes-accent"></div>
                  </div>
                  <span class="text-nes-text">TOPOLOGICAL TOPIC MAPPING</span>
                </label>

                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="w-6 h-6 border-2 border-nes-text flex items-center justify-center group-hover:border-nes-accent">
                    <div class="w-3 h-3 bg-nes-accent"></div>
                  </div>
                  <span class="text-nes-text">ACE CONTEXTUAL RETRIEVAL</span>
                </label>
              </div>
            </div>

            <!-- Action Bar -->
            <div class="mt-auto flex justify-end">
              <button
                class="nes-btn nes-btn-success text-xl px-8 py-4"
                onclick={handleUpload}
                disabled={processingStatus !== 'idle' || !uploadFiles}
              >
                {processingStatus === 'idle' ? 'INITIATE INGESTION SEQUENCE' : 'PROCESSING...'}
              </button>
            </div>
          </div>

        {:else}
          <div class="nes-panel-header bg-nes-accent2/10 text-nes-accent2">
            <span>TIMESTAMP</span>
            <span>DATA_SOURCE (ERROR CODE)</span>
            <span>INTEGRITY</span>
            <span>STATUS</span>
          </div>

          <div class="nes-panel-body">
            {#if data.stats.length === 0}
              <div class="p-8 text-center text-nes-muted">NO ANOMALIES DETECTED. SYSTEM STABLE.</div>
            {:else}
              {#each data.stats as stat}
                <div class="nes-row group cursor-pointer hover:bg-white/5">
                  <span class="font-mono text-nes-muted">2025-12-24 04:20</span>
                  <span class="text-nes-text group-hover:text-nes-accent truncate pr-2">{stat.error_code}: {stat.message?.substring(0, 40)}...</span>
                  <div class="w-24">
                    <div class="nes-progress h-2">
                      <div class="nes-progress-bar w-[85%] bg-nes-warning"></div>
                    </div>
                  </div>
                  <span class="nes-badge-warning ml-auto">FLAGGED ({stat.count})</span>
                </div>
              {/each}
            {/if}
          </div>

          <div class="p-2 border-t-4 border-nes-border bg-nes-bg text-[10px] flex justify-between">
            <span>TOTAL RECORDS: {data.stats.length}</span>
            <span class="animate-pulse">LIVE FEED ACTIVE</span>
          </div>
        {/if}
      </div>
    </section>
  </main>
</div>
"""
}

def repair_files():
    base_dir = r"c:\Users\james\Videos\deeds-web-app"

    print(f"Starting repair of {len(files_to_fix)} files...")

    for relative_path, clean_content in files_to_fix.items():
        # Clean relative path to match OS
        full_path = os.path.join(base_dir, relative_path.replace("/", os.sep))

        try:
            # Create directory if it doesn't exist (just in case)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)

            with open(full_path, "w", encoding="utf-8") as f:
                f.write(clean_content)

            print(f"✅ Repaired: {relative_path}")

        except Exception as e:
            print(f"❌ Failed to repair {relative_path}: {e}")

if __name__ == "__main__":
    repair_files()
