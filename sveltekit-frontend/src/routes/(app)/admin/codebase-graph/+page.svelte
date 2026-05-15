<script lang="ts">
	import RouteGraph from '$lib/components/codebase/RouteGraph.svelte';
	import CodeEvidenceBoard from '$lib/components/codebase/CodeEvidenceBoard.svelte';
	import NodeDetailPanel from '$lib/components/codebase/NodeDetailPanel.svelte';
	import GraphExport from '$lib/components/codebase/GraphExport.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface GraphNode {
		id: string;
		label: string;
		type: 'route' | 'component' | 'store' | 'service' | 'api' | 'util';
		errorCount: number;
		filePath: string;
		cluster?: string;
		imports?: string[];
		exports?: string[];
		functions?: string[];
		lineCount?: number;
		fileSize?: number;
		complexity?: number;
		classCount?: number;
		importCount?: number;
		exportCount?: number;
	}

	interface GraphEdge {
		source: string;
		target: string;
		type: 'import' | 'export' | 'dependency';
	}

	interface GraphMetadata {
		totalNodes: number;
		totalEdges: number;
		nodesWithErrors: number;
		scanTimeMs: number;
		maxFiles: number;
		generatedAt: string;
	}

	// ── View Mode ──────────────────────────────────────────────
	type ViewMode = 'graph' | 'evidence' | 'analysis';

	let viewMode = $state<ViewMode>('graph');
	let nodes = $state<GraphNode[]>([]);
	let edges = $state<GraphEdge[]>([]);
	let metadata = $state<GraphMetadata | null>(null);
	let selectedNode = $state<GraphNode | null>(null);
	let hoveredNode = $state<GraphNode | null>(null);
	let loading = $state(true);
	let error = $state('');
	let maxFiles = $state(200);
	let filterDir = $state('');
	let filterType = $state<string>('all');
	let searchQuery = $state('');

	// Filtered nodes/edges for display
	let filteredNodes = $derived.by(() => {
		let result = nodes;
		if (filterType !== 'all') {
			result = result.filter(n => n.type === filterType);
		}
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			result = result.filter(n =>
				n.label.toLowerCase().includes(q) ||
				n.filePath.toLowerCase().includes(q) ||
				(n.cluster?.toLowerCase().includes(q) ?? false)
			);
		}
		return result;
	});

	let filteredEdges = $derived.by(() => {
		const nodeIds = new Set(filteredNodes.map(n => n.id));
		return edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
	});

	// Stats
	let stats = $derived.by(() => {
		const typeGroups = new Map<string, number>();
		for (const n of nodes) {
			typeGroups.set(n.type, (typeGroups.get(n.type) || 0) + 1);
		}
		return {
			totalNodes: nodes.length,
			totalEdges: edges.length,
			withErrors: nodes.filter(n => n.errorCount > 0).length,
			types: Object.fromEntries(typeGroups)
		};
	});

	// Analysis mode stats
	let analysisStats = $derived.by(() => {
		if (nodes.length === 0) return null;
		const complexFiles = nodes.filter(n => (n.complexity ?? 0) > 20).sort((a, b) => (b.complexity ?? 0) - (a.complexity ?? 0));
		const coupledFiles = nodes.filter(n => (n.importCount ?? 0) > 15).sort((a, b) => (b.importCount ?? 0) - (a.importCount ?? 0));
		const largeFiles = nodes.filter(n => (n.lineCount ?? 0) > 300).sort((a, b) => (b.lineCount ?? 0) - (a.lineCount ?? 0));
		const totalLines = nodes.reduce((s, n) => s + (n.lineCount ?? 0), 0);
		const totalSize = nodes.reduce((s, n) => s + (n.fileSize ?? 0), 0);
		const avgComplexity = nodes.length > 0
			? nodes.reduce((s, n) => s + (n.complexity ?? 0), 0) / nodes.length
			: 0;

		return { complexFiles, coupledFiles, largeFiles, totalLines, totalSize, avgComplexity };
	});

	async function fetchGraph() {
		loading = true;
		error = '';
		try {
			const params = new URLSearchParams();
			params.set('maxFiles', String(maxFiles));
			if (filterDir) params.set('dir', filterDir);

			const res = await fetch(`/api/codebase-index/graph?${params}`);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error || `HTTP ${res.status}`);
			}
			const data = await res.json();
			nodes = data.nodes || [];
			edges = data.edges || [];
			metadata = data.metadata || null;
		} catch (e) {
			error = String(e);
			console.error('Failed to fetch graph:', e);
		} finally {
			loading = false;
		}
	}

	function handleNodeClick(node: GraphNode) {
		selectedNode = selectedNode?.id === node.id ? null : node;
	}

	function handleNodeHover(node: GraphNode | null) {
		hoveredNode = node;
	}

	function handleViewFile(filePath: string) {
		window.open(`vscode://file/${filePath}`, '_blank');
	}

	// Scan presets
	const PRESETS = [
		{ label: 'Full Scan', dir: '', max: 200 },
		{ label: 'API Routes', dir: 'routes/api', max: 300 },
		{ label: 'App Pages', dir: 'routes/(app)', max: 200 },
		{ label: 'Components', dir: 'lib/components', max: 200 },
		{ label: 'Server Lib', dir: 'lib/server', max: 300 },
		{ label: 'AI Pipeline', dir: 'lib/ai', max: 100 },
	];

	function applyPreset(preset: typeof PRESETS[number]) {
		filterDir = preset.dir;
		maxFiles = preset.max;
		fetchGraph();
	}

	// Mode config
	const modes: { id: ViewMode; label: string; icon: string; desc: string }[] = [
		{ id: 'graph', label: 'Graph', icon: 'git-branch', desc: 'Force-directed D3 graph' },
		{ id: 'evidence', label: 'Evidence', icon: 'layout-grid', desc: 'Evidence board view' },
		{ id: 'analysis', label: 'Analysis', icon: 'bar-chart-3', desc: 'Codebase health metrics' },
	];

	// Load on mount
	$effect(() => {
		fetchGraph();
	});
</script>

<div class="ast-graph-page">
	<!-- Header -->
	<header class="page-header">
		<div class="header-left">
			<Icon name="git-branch" class="h-6 w-6" />
			<div>
				<h1>Codebase Intelligence</h1>
				<p class="subtitle">AST analysis + AI insights + evidence board visualization</p>
			</div>
		</div>
		<div class="header-actions">
			<Button onclick={fetchGraph} disabled={loading}>
				{#if loading}
					Scanning...
				{:else}
					<Icon name="refresh-cw" class="h-4 w-4" /> Rescan
				{/if}
			</Button>
			{#if nodes.length > 0}
				<GraphExport {nodes} {edges} />
			{/if}
		</div>
	</header>

	<!-- Mode Switcher -->
	<div class="mode-switcher">
		{#each modes as mode}
			<button
				class="mode-btn"
				class:active={viewMode === mode.id}
				onclick={() => viewMode = mode.id}
				title={mode.desc}
			>
				<Icon name={mode.icon} class="h-4 w-4" />
				<span>{mode.label}</span>
			</button>
		{/each}
	</div>

	<!-- Toolbar -->
	<div class="toolbar">
		<!-- Presets -->
		<div class="presets">
			{#each PRESETS as preset}
				<button
					class="preset-btn"
					class:active={filterDir === preset.dir}
					onclick={() => applyPreset(preset)}
				>
					{preset.label}
				</button>
			{/each}
		</div>

		<!-- Filters -->
		<div class="filters">
			<input
				type="text"
				placeholder="Search nodes..."
				bind:value={searchQuery}
				class="search-input"
			/>
			<select bind:value={filterType} class="type-filter">
				<option value="all">All Types</option>
				<option value="route">Routes</option>
				<option value="component">Components</option>
				<option value="store">Stores</option>
				<option value="service">Services</option>
				<option value="api">API</option>
				<option value="util">Utils</option>
			</select>
			<label class="max-label">
				Max Files:
				<input type="number" bind:value={maxFiles} min={50} max={500} step={50} class="max-input" />
			</label>
		</div>
	</div>

	<!-- Stats Bar -->
	{#if metadata}
		<div class="stats-bar">
			<div class="stat">
				<span class="stat-value">{stats.totalNodes}</span>
				<span class="stat-label">Nodes</span>
			</div>
			<div class="stat">
				<span class="stat-value">{stats.totalEdges}</span>
				<span class="stat-label">Edges</span>
			</div>
			<div class="stat">
				<span class="stat-value">{stats.withErrors}</span>
				<span class="stat-label">With Errors</span>
			</div>
			{#each Object.entries(stats.types) as [type, count]}
				<div class="stat type-stat">
					<span class="stat-value">{count}</span>
					<span class="stat-label">{type}</span>
				</div>
			{/each}
			<div class="stat scan-time">
				<span class="stat-value">{metadata.scanTimeMs}ms</span>
				<span class="stat-label">Scan Time</span>
			</div>
		</div>
	{/if}

	<!-- Error display -->
	{#if error}
		<div class="error-banner">
			<Icon name="triangle-alert" class="h-4 w-4" />
			<span>{error}</span>
			<button onclick={() => (error = '')}>Dismiss</button>
		</div>
	{/if}

	<!-- Main content -->
	<div class="graph-layout">
		<div class="graph-main">
			{#if loading}
				<div class="loading-state">
					<div class="spinner"></div>
					<p>Scanning {maxFiles} files with ts-morph...</p>
				</div>
			{:else if filteredNodes.length === 0}
				<div class="empty-state">
					<Icon name="git-branch" class="h-12 w-12 opacity-30" />
					<p>No nodes found</p>
					<span>Try adjusting filters or scanning a different directory</span>
				</div>

			{:else if viewMode === 'graph'}
				<!-- D3 Force-Directed Graph -->
				<RouteGraph
					nodes={filteredNodes}
					edges={filteredEdges}
					selectedNode={selectedNode?.id ?? null}
					onNodeClick={handleNodeClick}
					onNodeHover={handleNodeHover}
					width={1200}
					height={700}
				/>

			{:else if viewMode === 'evidence'}
				<!-- Evidence Board Style -->
				<CodeEvidenceBoard
					nodes={filteredNodes}
					edges={filteredEdges}
					onNodeClick={handleNodeClick}
				/>

			{:else if viewMode === 'analysis'}
				<!-- Analysis Dashboard -->
				<div class="analysis-dashboard">
					{#if analysisStats}
						<!-- Overview cards -->
						<div class="analysis-overview">
							<div class="overview-card">
								<span class="overview-value">{analysisStats.totalLines.toLocaleString()}</span>
								<span class="overview-label">Total Lines</span>
							</div>
							<div class="overview-card">
								<span class="overview-value">{(analysisStats.totalSize / 1024).toFixed(0)}KB</span>
								<span class="overview-label">Total Size</span>
							</div>
							<div class="overview-card">
								<span class="overview-value">{analysisStats.avgComplexity.toFixed(1)}</span>
								<span class="overview-label">Avg Branches</span>
							</div>
							<div class="overview-card">
								<span class="overview-value">{filteredNodes.length}</span>
								<span class="overview-label">Files Scanned</span>
							</div>
						</div>

						<!-- Hot spots -->
						<div class="analysis-columns">
							<!-- Complex files -->
							<div class="analysis-column">
								<h3 class="column-title">
									<Icon name="flame" class="h-4 w-4" />
									High Complexity ({analysisStats.complexFiles.length})
								</h3>
								{#each analysisStats.complexFiles.slice(0, 10) as file}
									<button class="hotspot-item" onclick={() => handleNodeClick(file)}>
										<span class="hotspot-name">{file.label}</span>
										<span class="hotspot-badge danger">{file.complexity} branches</span>
									</button>
								{/each}
								{#if analysisStats.complexFiles.length === 0}
									<div class="hotspot-empty">No high-complexity files</div>
								{/if}
							</div>

							<!-- Coupled files -->
							<div class="analysis-column">
								<h3 class="column-title">
									<Icon name="link" class="h-4 w-4" />
									High Coupling ({analysisStats.coupledFiles.length})
								</h3>
								{#each analysisStats.coupledFiles.slice(0, 10) as file}
									<button class="hotspot-item" onclick={() => handleNodeClick(file)}>
										<span class="hotspot-name">{file.label}</span>
										<span class="hotspot-badge warning">{file.importCount} imports</span>
									</button>
								{/each}
								{#if analysisStats.coupledFiles.length === 0}
									<div class="hotspot-empty">No high-coupling files</div>
								{/if}
							</div>

							<!-- Large files -->
							<div class="analysis-column">
								<h3 class="column-title">
									<Icon name="file-text" class="h-4 w-4" />
									Large Files ({analysisStats.largeFiles.length})
								</h3>
								{#each analysisStats.largeFiles.slice(0, 10) as file}
									<button class="hotspot-item" onclick={() => handleNodeClick(file)}>
										<span class="hotspot-name">{file.label}</span>
										<span class="hotspot-badge info">{file.lineCount} lines</span>
									</button>
								{/each}
								{#if analysisStats.largeFiles.length === 0}
									<div class="hotspot-empty">No large files</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Side panel -->
		<div class="side-panel" class:visible={selectedNode !== null}>
			<NodeDetailPanel
				node={selectedNode}
				onClose={() => (selectedNode = null)}
				onViewFile={handleViewFile}
			/>
		</div>
	</div>

	<!-- Hovered node tooltip -->
	{#if hoveredNode && !selectedNode && viewMode === 'graph'}
		<div class="hover-tooltip">
			<strong>{hoveredNode.label}</strong>
			<span class="tooltip-type">{hoveredNode.type}</span>
			{#if hoveredNode.lineCount}
				<span class="tooltip-stat">{hoveredNode.lineCount}L</span>
			{/if}
			{#if hoveredNode.errorCount > 0}
				<span class="tooltip-errors">{hoveredNode.errorCount} errors</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.ast-graph-page {
		min-height: 100vh;
		background: var(--t-bg, #0f0f1a);
		color: var(--t-text, #e0e0e0);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.header-left h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0;
	}

	.subtitle {
		font-size: 0.8rem;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.5));
		margin: 0;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	/* Mode Switcher */
	.mode-switcher {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		background: var(--t-panel, rgba(255, 255, 255, 0.03));
		border: 1px solid var(--t-border, rgba(255, 255, 255, 0.08));
		border-radius: 10px;
		width: fit-content;
	}

	.mode-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.5));
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.mode-btn:hover {
		color: var(--t-text, rgba(255, 255, 255, 0.8));
		background: color-mix(in srgb, var(--t-text, white) 4%, transparent);
	}

	.mode-btn.active {
		background: color-mix(in srgb, var(--t-accent, #00d4ff) 10%, transparent);
		border-color: color-mix(in srgb, var(--t-accent, #00d4ff) 30%, transparent);
		color: var(--t-accent, #00d4ff);
		box-shadow: 0 0 8px color-mix(in srgb, var(--t-accent, #00d4ff) 10%, transparent);
	}

	/* Toolbar */
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
		padding: 0.75rem 1rem;
		background: var(--t-panel, rgba(255, 255, 255, 0.03));
		border: 1px solid var(--t-border, rgba(255, 255, 255, 0.1));
		border-radius: 8px;
	}

	.presets {
		display: flex;
		gap: 0.25rem;
	}

	.preset-btn {
		padding: 0.35rem 0.75rem;
		background: color-mix(in srgb, var(--t-text, white) 5%, transparent);
		border: 1px solid var(--t-border, rgba(255, 255, 255, 0.1));
		border-radius: 6px;
		color: var(--t-text, rgba(255, 255, 255, 0.7));
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.preset-btn:hover {
		background: color-mix(in srgb, var(--t-accent, #00d4ff) 10%, transparent);
		border-color: color-mix(in srgb, var(--t-accent, #00d4ff) 30%, transparent);
	}

	.preset-btn.active {
		background: color-mix(in srgb, var(--t-accent, #00d4ff) 15%, transparent);
		border-color: color-mix(in srgb, var(--t-accent, #00d4ff) 50%, transparent);
		color: var(--t-accent, #00d4ff);
	}

	.filters {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-left: auto;
	}

	.search-input,
	.type-filter,
	.max-input {
		padding: 0.35rem 0.5rem;
		background: var(--t-panel, rgba(0, 0, 0, 0.3));
		border: 1px solid var(--t-border, rgba(255, 255, 255, 0.15));
		border-radius: 6px;
		color: var(--t-text, white);
		font-size: 0.8rem;
	}

	.search-input { width: 180px; }
	.max-input { width: 70px; }
	.max-label {
		font-size: 0.75rem;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.5));
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	/* Stats */
	.stats-bar {
		display: flex;
		gap: 1.5rem;
		padding: 0.5rem 1rem;
		background: var(--t-panel, rgba(0, 0, 0, 0.2));
		border-radius: 8px;
		overflow-x: auto;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
	}

	.stat-value {
		font-size: 1.1rem;
		font-weight: 600;
		font-family: 'JetBrains Mono', monospace;
	}

	.stat-label {
		font-size: 0.65rem;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.4));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.type-stat .stat-value { font-size: 0.9rem; }
	.scan-time .stat-value { color: #22c55e; }

	/* Error */
	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--t-danger, #ef4444) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--t-danger, #ef4444) 30%, transparent);
		border-radius: 8px;
		color: var(--t-danger, #f87171);
		font-size: 0.85rem;
	}

	.error-banner button {
		margin-left: auto;
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--t-danger, #ef4444) 30%, transparent);
		color: var(--t-danger, #f87171);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.75rem;
	}

	/* Graph layout */
	.graph-layout {
		display: flex;
		gap: 1rem;
		flex: 1;
		min-height: 700px;
	}

	.graph-main {
		flex: 1;
		border: 1px solid var(--t-border, rgba(255, 255, 255, 0.1));
		border-radius: 12px;
		overflow: hidden;
		position: relative;
	}

	.side-panel {
		width: 0;
		overflow: hidden;
		transition: width 0.2s ease;
	}

	.side-panel.visible {
		width: 360px;
	}

	/* Loading / empty */
	.loading-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 1rem;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.5));
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid var(--t-border, rgba(255, 255, 255, 0.1));
		border-top-color: var(--t-accent, #00d4ff);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.empty-state span {
		font-size: 0.8rem;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.3));
		opacity: 0.7;
	}

	/* Hover tooltip */
	.hover-tooltip {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: var(--t-panel, rgba(0, 0, 0, 0.9));
		border: 1px solid var(--t-border, rgba(255, 255, 255, 0.2));
		border-radius: 8px;
		z-index: 50;
		font-size: 0.85rem;
	}

	.tooltip-type {
		padding: 0.1rem 0.4rem;
		background: color-mix(in srgb, var(--t-text, white) 10%, transparent);
		border-radius: 4px;
		font-size: 0.7rem;
		text-transform: uppercase;
	}

	.tooltip-stat {
		font-size: 0.7rem;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.4));
		font-family: 'JetBrains Mono', monospace;
	}

	.tooltip-errors {
		color: var(--t-danger, #f87171);
		font-size: 0.75rem;
	}

	/* ═══ ANALYSIS DASHBOARD ═══════════════════════════════════════ */
	.analysis-dashboard {
		padding: 1.5rem;
		height: 100%;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		background: var(--t-panel, rgba(0, 0, 0, 0.2));
	}

	.analysis-overview {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
	}

	.overview-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 1rem;
		background: color-mix(in srgb, var(--t-text, white) 3%, transparent);
		border: 1px solid var(--t-border, rgba(255, 255, 255, 0.08));
		border-radius: 10px;
	}

	.overview-value {
		font-size: 1.5rem;
		font-weight: 700;
		font-family: 'JetBrains Mono', monospace;
		color: var(--t-accent, #00d4ff);
	}

	.overview-label {
		font-size: 0.7rem;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.4));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.analysis-columns {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}

	.analysis-column {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		background: color-mix(in srgb, var(--t-text, white) 2%, transparent);
		border: 1px solid var(--t-border, rgba(255, 255, 255, 0.06));
		border-radius: 10px;
		padding: 1rem;
	}

	.column-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--t-text, rgba(255, 255, 255, 0.7));
		margin: 0 0 0.5rem 0;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--t-border, rgba(255, 255, 255, 0.06));
	}

	.hotspot-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.45rem 0.5rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.12s;
		text-align: left;
		color: inherit;
		width: 100%;
	}

	.hotspot-item:hover {
		background: color-mix(in srgb, var(--t-text, white) 4%, transparent);
		border-color: var(--t-border, rgba(255, 255, 255, 0.1));
	}

	.hotspot-name {
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--t-text, rgba(255, 255, 255, 0.8));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}

	.hotspot-badge {
		font-size: 0.6rem;
		font-family: 'JetBrains Mono', monospace;
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.hotspot-badge.danger {
		color: var(--t-danger, #f87171);
		background: color-mix(in srgb, var(--t-danger, #ef4444) 12%, transparent);
	}

	.hotspot-badge.warning {
		color: var(--t-warning, #fbbf24);
		background: color-mix(in srgb, var(--t-warning, #fbbf24) 12%, transparent);
	}

	.hotspot-badge.info {
		color: var(--t-info, #60a5fa);
		background: color-mix(in srgb, var(--t-info, #60a5fa) 12%, transparent);
	}

	.hotspot-empty {
		font-size: 0.75rem;
		color: var(--t-text-muted, rgba(255, 255, 255, 0.25));
		padding: 1rem;
		text-align: center;
	}
</style>
