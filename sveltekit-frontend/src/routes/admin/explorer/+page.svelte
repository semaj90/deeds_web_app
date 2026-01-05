<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';

	interface RouteNode {
		id: string;
		path: string;
		type: 'page' | 'layout' | 'server' | 'api' | 'component';
		errors: number;
		complexity: number;
		dependencies: string[];
		exports: string[];
		imports: string[];
		lines: number;
		functions: string[];
		kb_vectors: number;
		last_modified: string;
	}

	interface KBEntry {
		file_path: string;
		content: string;
		embedding: number[];
		tags: string[];
		score: number;
	}

	const routes = writable<RouteNode[]>([]);
	const selectedRoute = writable<RouteNode | null>(null);
	const kbEntries = writable<KBEntry[]>([]);
	const viewMode = writable<'tree' | 'graph' | 'list'>('tree');
	const filterType = writable<string>('all');
	const loading = writable(true);
	const agentStatus = writable<{ active: boolean; current_file: string; progress: number }>({
		active: false,
		current_file: '',
		progress: 0
	});

	let searchQuery = '';
	let expandedPaths = new Set<string>();

	onMount(async () => {
		await loadRoutes();
		startSSE();
	});

	async function loadRoutes() {
		try {
			const response = await fetch('/api/admin/routes');
			const data = await response.json();
			routes.set(data.routes);
			loading.set(false);
		} catch (error) {
			console.error('Failed to load routes:', error);
			loading.set(false);
		}
	}

	function startSSE() {
		const eventSource = new EventSource('/api/admin/routes/stream');

		eventSource.addEventListener('route_updated', (event) => {
			const update = JSON.parse(event.data);
			routes.update(r => {
				const route = r.find(rt => rt.id === update.id);
				if (route) {
					Object.assign(route, update);
				}
				return r;
			});
		});

		eventSource.addEventListener('agent_progress', (event) => {
			const data = JSON.parse(event.data);
			agentStatus.set(data);
		});

		eventSource.addEventListener('kb_synced', (event) => {
			const data = JSON.parse(event.data);
			routes.update(r => {
				const route = r.find(rt => rt.path === data.file_path);
				if (route) {
					route.kb_vectors = data.vector_count;
				}
				return r;
			});
		});

		return () => eventSource.close();
	}

	async function selectRoute(route: RouteNode) {
		selectedRoute.set(route);

		// Load KB entries for this route
		const response = await fetch(`/api/admin/knowledge?file=${encodeURIComponent(route.path)}`);
		const data = await response.json();
		kbEntries.set(data.entries || []);
	}

	async function fixWithAgent(route: RouteNode) {
		try {
			const response = await fetch('/api/admin/agent/fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					file_path: route.path,
					error_count: route.errors
				})
			});

			const data = await response.json();
			if (data.success) {
				alert(`Agent started fixing ${route.path}`);
			}
		} catch (error) {
			console.error('Failed to start agent:', error);
		}
	}

	function toggleExpanded(path: string) {
		if (expandedPaths.has(path)) {
			expandedPaths.delete(path);
		} else {
			expandedPaths.add(path);
		}
		expandedPaths = expandedPaths; // Trigger reactivity
	}

	function buildTree(routes: RouteNode[]) {
		const tree: any = {};

		routes.forEach(route => {
			const parts = route.path.split('/');
			let current = tree;

			parts.forEach((part, idx) => {
				if (!part) return;

				if (!current[part]) {
					current[part] = {
						name: part,
						path: parts.slice(0, idx + 1).join('/'), children: {},
						routes: []
					};
				}

				if (idx === parts.length - 1) {
					current[part].routes.push(route);
				} else {
					current = current[part].children;
				}
			});
		});

		return tree;
	}

	const filteredRoutes = $derived($routes.filter(route => {
		if ($filterType !== 'all' && route.type !== $filterType) return false;
		if (searchQuery && !route.path.toLowerCase().includes(searchQuery.toLowerCase())) return false;
		return true;
	}));

	const tree = $derived(buildTree(filteredRoutes));
</script>

<div class="route-explorer">
	<!-- Header -->
	<div class="header">
		<h1>🗺️ Route Explorer & Agent Control</h1>
		<div class="agent-status" class:active={$agentStatus.active}>
			{#if $agentStatus.active}
				<span class="pulse">🤖</span>
				<span>Fixing: {$agentStatus.current_file}</span>
				<span class="progress">{$agentStatus.progress}%</span>
			{:else}
				<span>Agent Idle</span>
			{/if}
		</div>
	</div>

	<!-- Controls -->
	<div class="controls">
		<input
			type="text"
			placeholder="Search routes..."
			bind:value={searchQuery}
			class="search-input"
		/>

		<select bind:value={$filterType} class="filter-select">
			<option value="all">All Types</option>
			<option value="page">Pages</option>
			<option value="layout">Layouts</option>
			<option value="server">Server</option>
			<option value="api">API</option>
			<option value="component">Components</option>
		</select>

		<div class="view-modes">
			<button
				class:active={$viewMode === 'tree'}
				onclick={() => viewMode.set('tree')}
			>
				📁 Tree
			</button>
			<button
				class:active={$viewMode === 'list'}
				onclick={() => viewMode.set('list')}
			>
				📋 List
			</button>
		</div>

		<div class="stats">
			<span>{$routes.length} routes</span>
			<span>{$routes.reduce((sum, r) => sum + r.errors, 0)} errors</span>
			<span>{$routes.reduce((sum, r) => sum + r.kb_vectors, 0)} KB vectors</span>
		</div>
	</div>

	<!-- Main Content -->
	<div class="content">
		<!-- Left Panel: Route Tree/List -->
		<div class="routes-panel">
			{#if $loading}
				<div class="loading">Loading routes...</div>
			{:else if $viewMode === 'tree'}
				<div class="tree-view">
					{#each Object.values(tree) as node}
						{@render TreeNode(node, expandedPaths, toggleExpanded, selectRoute, $selectedRoute?.path)}
					{/each}
				</div>
			{:else}
				<div class="list-view">
					{#each filteredRoutes as route}
						<div
							class="route-item"
							class:selected={$selectedRoute?.id === route.id}
							class:has-errors={route.errors > 0}
							onclick={() => selectRoute(route)}
						>
							<div class="route-icon">{route.type === 'page' ? '📄' : route.type === 'api' ? '🔌' : '⚙️'}</div>
							<div class="route-info">
								<div class="route-path">{route.path}</div>
								<div class="route-meta">
									{route.lines} lines · {route.functions.length} functions
									{#if route.errors > 0}
										<span class="error-badge">{route.errors} errors</span>
									{/if}
									{#if route.kb_vectors > 0}
										<span class="kb-badge">{route.kb_vectors} KB</span>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Right Panel: Details & KB -->
		{#if $selectedRoute}
			<div class="details-panel">
				<div class="details-header">
					<h2>{$selectedRoute.path}</h2>
					<button class="fix-button" onclick={() => fixWithAgent($selectedRoute)}>
						🤖 Fix with Agent
					</button>
				</div>

				<!-- Metrics -->
				<div class="metrics-grid">
					<div class="metric">
						<span class="metric-label">Type</span>
						<span class="metric-value">{$selectedRoute.type}</span>
					</div>
					<div class="metric">
						<span class="metric-label">Errors</span>
						<span class="metric-value error" class:high={$selectedRoute.errors > 10}>
							{$selectedRoute.errors}
						</span>
					</div>
					<div class="metric">
						<span class="metric-label">Complexity</span>
						<span class="metric-value">{($selectedRoute.complexity * 100).toFixed(1)}%</span>
					</div>
					<div class="metric">
						<span class="metric-label">Lines</span>
						<span class="metric-value">{$selectedRoute.lines}</span>
					</div>
					<div class="metric">
						<span class="metric-label">Functions</span>
						<span class="metric-value">{$selectedRoute.functions.length}</span>
					</div>
					<div class="metric">
						<span class="metric-label">KB Vectors</span>
						<span class="metric-value kb">{$selectedRoute.kb_vectors}</span>
					</div>
				</div>

				<!-- Functions -->
				{#if $selectedRoute.functions.length > 0}
					<div class="section">
						<h3>Functions ({$selectedRoute.functions.length})</h3>
						<div class="function-list">
							{#each $selectedRoute.functions as func}
								<div class="function-item">{func}</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Dependencies -->
				{#if $selectedRoute.dependencies.length > 0}
					<div class="section">
						<h3>Dependencies ({$selectedRoute.dependencies.length})</h3>
						<div class="dependency-list">
							{#each $selectedRoute.dependencies as dep}
								<div class="dependency-item">{dep}</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Knowledge Base Entries -->
				{#if $kbEntries.length > 0}
					<div class="section">
						<h3>Knowledge Base ({$kbEntries.length} entries)</h3>
						<div class="kb-entries">
							{#each $kbEntries as entry}
								<div class="kb-entry">
									<div class="kb-score">{(entry.score * 100).toFixed(1)}%</div>
									<div class="kb-content">{entry.content.slice(0, 200)}...</div>
									<div class="kb-tags">
										{#each entry.tags as tag}
											<span class="tag">{tag}</span>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{:else}
			<div class="empty-state">
				<div class="empty-icon">📂</div>
				<p>Select a route to view details</p>
			</div>
		{/if}
	</div>
</div>

{#snippet TreeNode(node: any, expandedPaths: Set<string>, toggleExpanded: (path: string) => void, selectRoute: (route: RouteNode) => void, selectedPath?: string)}
	{@const isExpanded = expandedPaths.has(node.path)}
	{@const hasChildren = Object.keys(node.children).length > 0}
	{@const hasRoutes = node.routes.length > 0}

	<div class="tree-node">
		<div
			class="tree-node-header"
			onclick={() => hasChildren && toggleExpanded(node.path)}
		>
			{#if hasChildren}
				<span class="tree-icon">{isExpanded ? '📂' : '📁'}</span>
			{:else}
				<span class="tree-icon">📄</span>
			{/if}
			<span class="tree-label">{node.name}</span>
		</div>

		{#if isExpanded}
			<div class="tree-children">
				{#each Object.values(node.children) as child}
					{@render TreeNode(child, expandedPaths, toggleExpanded, selectRoute, selectedPath)}
				{/each}

				{#each node.routes as route}
					<div
						class="tree-route"
						class:selected={selectedPath === route.path}
						class:has-errors={route.errors > 0}
						onclick={() => selectRoute(route)}
					>
						<span class="route-icon">{route.type === 'page' ? '📄' : '⚙️'}</span>
						<span class="route-name">{route.path.split('/').pop()}</span>
						{#if route.errors > 0}
							<span class="route-error-badge">{route.errors}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<style>
	:global(body) {
		margin: 0;
		font-family: 'Inter', system-ui, sans-serif;
		background: #0f172a;
		color: #e2e8f0;
	}

	.route-explorer {
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.header {
		padding: 1rem 2rem;
		background: rgba(15, 23, 42, 0.95);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.header h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.agent-status {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 1rem;
		background: rgba(30, 41, 59, 0.5);
		border-radius: 0.5rem;
		font-size: 0.875rem;
	}

	.agent-status.active {
		background: rgba(59, 130, 246, 0.2);
		border: 1px solid rgba(59, 130, 246, 0.3);
	}

	.pulse {
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.progress {
		color: #3b82f6;
		font-weight: 600;
	}

	.controls {
		padding: 1rem 2rem;
		background: rgba(15, 23, 42, 0.6);
		display: flex;
		gap: 1rem;
		align-items: center;
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
	}

	.search-input {
		flex: 1;
		padding: 0.5rem 1rem;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 0.5rem;
		color: #e2e8f0;
		font-size: 0.875rem;
	}

	.filter-select {
		padding: 0.5rem 1rem;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 0.5rem;
		color: #e2e8f0;
	}

	.view-modes {
		display: flex;
		gap: 0.5rem;
	}

	.view-modes button {
		padding: 0.5rem 1rem;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 0.5rem;
		color: #94a3b8;
		cursor: pointer;
		transition: all 0.2s;
	}

	.view-modes button.active {
		background: rgba(59, 130, 246, 0.2);
		border-color: rgba(59, 130, 246, 0.3);
		color: #3b82f6;
	}

	.stats {
		display: flex;
		gap: 2rem;
		font-size: 0.875rem;
		color: #94a3b8;
		margin-left: auto;
	}

	.content {
		flex: 1;
		display: grid;
		grid-template-columns: 400px 1fr;
		overflow: hidden;
	}

	.routes-panel {
		background: rgba(15, 23, 42, 0.5);
		border-right: 1px solid rgba(148, 163, 184, 0.1);
		overflow-y: auto;
	}

	.list-view {
		padding: 1rem;
	}

	.route-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem;
		background: rgba(30, 41, 59, 0.5);
		border-radius: 0.5rem;
		margin-bottom: 0.5rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.route-item:hover {
		background: rgba(30, 41, 59, 0.8);
	}

	.route-item.selected {
		background: rgba(59, 130, 246, 0.2);
		border: 1px solid rgba(59, 130, 246, 0.3);
	}

	.route-item.has-errors {
		border-left: 3px solid #ef4444;
	}

	.route-icon {
		font-size: 1.5rem;
	}

	.route-info {
		flex: 1;
	}

	.route-path {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.route-meta {
		font-size: 0.75rem;
		color: #94a3b8;
		margin-top: 0.25rem;
	}

	.error-badge {
		padding: 0.125rem 0.5rem;
		background: rgba(239, 68, 68, 0.2);
		border-radius: 9999px;
		color: #fca5a5;
		font-weight: 600;
	}

	.kb-badge {
		padding: 0.125rem 0.5rem;
		background: rgba(59, 130, 246, 0.2);
		border-radius: 9999px;
		color: #93c5fd;
	}

	.details-panel {
		overflow-y: auto;
		padding: 2rem;
	}

	.details-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.details-header h2 {
		margin: 0;
		font-size: 1.25rem;
		word-break: break-all;
	}

	.fix-button {
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
		border: none;
		border-radius: 0.5rem;
		color: white;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.2s;
	}

	.fix-button:hover {
		transform: scale(1.05);
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.metric {
		padding: 1rem;
		background: rgba(30, 41, 59, 0.5);
		border-radius: 0.5rem;
	}

	.metric-label {
		display: block;
		font-size: 0.75rem;
		color: #94a3b8;
		margin-bottom: 0.5rem;
	}

	.metric-value {
		font-size: 1.5rem;
		font-weight: 600;
	}

	.metric-value.error {
		color: #f97316;
	}

	.metric-value.error.high {
		color: #ef4444;
	}

	.metric-value.kb {
		color: #3b82f6;
	}

	.section {
		margin-bottom: 2rem;
	}

	.section h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		color: #94a3b8;
	}

	.function-list, .dependency-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.function-item, .dependency-item {
		padding: 0.5rem;
		background: rgba(30, 41, 59, 0.5);
		border-radius: 0.25rem;
		font-size: 0.875rem;
		font-family: 'Fira Code', monospace;
	}

	.kb-entries {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.kb-entry {
		padding: 1rem;
		background: rgba(30, 41, 59, 0.5);
		border-radius: 0.5rem;
	}

	.kb-score {
		font-weight: 600;
		color: #3b82f6;
		margin-bottom: 0.5rem;
	}

	.kb-content {
		font-size: 0.875rem;
		color: #cbd5e1;
		margin-bottom: 0.5rem;
	}

	.kb-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tag {
		padding: 0.25rem 0.5rem;
		background: rgba(59, 130, 246, 0.2);
		border: 1px solid rgba(59, 130, 246, 0.3);
		border-radius: 0.25rem;
		font-size: 0.75rem;
		color: #93c5fd;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #64748b;
	}

	.empty-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.loading {
		padding: 2rem;
		text-align: center;
		color: #64748b;
	}
</style>
