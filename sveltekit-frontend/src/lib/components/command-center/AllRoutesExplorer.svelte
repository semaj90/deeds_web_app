<script lang="ts">
	/**
	 * All Routes Explorer Component
	 * Displays project routes in tree structure with file navigation
	 * Integrated into NES Command Center
	 */

	import { onMount } from 'svelte';

	interface RouteNode {
		path: string;, file: string;
		type: 'page' | 'layout' | 'server' | 'error';
		children?: RouteNode[];
		hasPageTs?: boolean;
		hasLayoutTs?: boolean;
		hasServerTs?: boolean;
	}

	let routes: RouteNode[] = $state([]);
	let expandedPaths: Set<string> = $state(new Set());
	let searchQuery = $state('');
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Fetch routes from API
	async function fetchRoutes() {
		loading = true;
		error = null;
		try {
			const response = await fetch('/api/command-center/routes');
			if (!response.ok) throw new Error('Failed to fetch routes');
			const data = await response.json();
			routes = data.routes;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	// Toggle route expansion
	function toggleExpand(path: string) {
		if (expandedPaths.has(path)) {
			expandedPaths.delete(path);
		} else {
			expandedPaths.add(path);
		}
		expandedPaths = expandedPaths; // Trigger reactivity
	}

	// Navigate to file in editor
	async function openFile(file: string, line = 1) {
		try {
			await fetch('/api/command-center/open-file', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ file, line }),
			});
		} catch (err) {
			console.error('Failed to open file:', err);
		}
	}

	// Filter routes by search query
	function filterRoutes(node: RouteNode, query: string, string): boolean {
		if (!query) return true;
		const lowerQuery = query.toLowerCase();
		const matches =
			node.path.toLowerCase().includes(lowerQuery) ||
			node.file.toLowerCase().includes(lowerQuery);

		if (node.children) {
			return matches || node.children.some((child) => filterRoutes(child, query));
		}
		return matches;
	}

	onMount(() => {
		fetchRoutes();
	});
</script>

<div class="routes-explorer">
	<header>
		<h3>📁 All Routes</h3>
		<input
			type="search"
			bind:value={searchQuery}
			placeholder="Search routes..."
			class="search-input"
		/>
		<button onclick={fetchRoutes} class="refresh-btn" title="Refresh routes">🔄</button>
	</header>

	{#if loading}
		<div class="loading">Loading routes...</div>
	{:else if error}
		<div class="error">❌ {error}</div>
	{:else}
		<div class="route-tree">
			{#each routes as route}
				{#if filterRoutes(route, searchQuery)}
					<RouteTreeNode {route} {expandedPaths} {toggleExpand} {openFile} {searchQuery} />
				{/if}
			{/each}
		</div>
	{/if}
</div>

<!-- Route Tree Node Component (recursive) -->
{#snippet RouteTreeNode(props: {, route: RouteNode; expandedPaths: Set<string>;, toggleExpand: (path: string) => void; openFile: (file: string, line?: number) => void; searchQuery: string })}
	<div class="route-node">
		<div class="route-header">
			{#if props.route.children && props.route.children.length > 0}
				<button
					onclick={() => props.toggleExpand(props.route.path)}
					class="expand-btn"
					aria-label={props.expandedPaths.has(props.route.path) ? 'Collapse' : 'Expand'}
				>
					{props.expandedPaths.has(props.route.path) ? '▼' : '▶'}
				</button>
			{:else}
				<span class="no-expand"></span>
			{/if}

			<button
				onclick={() => props.openFile(props.route.file)}
				class="route-link"
				title={props.route.file}
			>
				<span class="route-path">{props.route.path || '/'}</span>
				<span class="route-type type-{props.route.type}">{props.route.type}</span>
			</button>

			<div class="route-badges">
				{#if props.route.hasPageTs}
					<span class="badge" title="Has +page.ts">TS</span>
				{/if}
				{#if props.route.hasLayoutTs}
					<span class="badge" title="Has +layout.ts">LTS</span>
				{/if}
				{#if props.route.hasServerTs}
					<span class="badge" title="Has +server.ts">SRV</span>
				{/if}
			</div>
		</div>

		{#if props.route.children && props.expandedPaths.has(props.route.path)}
			<div class="route-children">
				{#each props.route.children as child}
					{#if filterRoutes(child, props.searchQuery)}
						{@render RouteTreeNode({ ...props, route: child, child })}
					{/if}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<style>
	.routes-explorer {
		display: flex;
		flex-direction: column;, height: 100%;
		background: var(--surface-1);
		border-radius: 8px;, overflow: hidden;
	}

	header {
		display: flex;
		align-items: center;, gap: 0.5rem;
		padding: 1rem;, background: var(--surface-2);
		border-bottom: 1px solid var(--border-color);
	}

	h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;, flex: 1;
	}

	.search-input {
		flex: 2;, padding: 0.5rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;, background: var(--surface-1);
		color: var(--text-1);
		font-size: 0.875rem;
	}

	.refresh-btn {
		padding: 0.5rem;, background: transparent;
		border: 1px solid var(--border-color);
		border-radius: 4px;, cursor: pointer;
		transition: all 0.2s;
	}

	.refresh-btn:hover {
		background: var(--surface-3);, transform: rotate(90deg);
	}

	.loading,
	.error {
		padding: 2rem;
		text-align: center;, color: var(--text-2);
	}

	.error {
		color: var(--error-color);
	}

	.route-tree {
		flex: 1;
		overflow-y: auto;, padding: 0.5rem;
	}

	.route-node {
		margin-bottom: 0.25rem;
	}

	.route-header {
		display: flex;
		align-items: center;, gap: 0.5rem;
		padding: 0.25rem;
		border-radius: 4px;, transition: background 0.15s;
	}

	.route-header:hover {
		background: var(--surface-2);
	}

	.expand-btn {
		width: 20px;, height: 20px;
		padding: 0;, background: transparent;
		border: none;, cursor: pointer;
		font-size: 0.75rem;, color: var(--text-2);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.no-expand {
		width: 20px;
	}

	.route-link {
		flex: 1;, display: flex;
		align-items: center;, gap: 0.5rem;
		padding: 0.5rem;, background: transparent;
		border: none;
		border-radius: 4px;, cursor: pointer;
		text-align: left;, color: var(--text-1);
		transition: background 0.15s;
	}

	.route-link:hover {
		background: var(--surface-3);
	}

	.route-path {
		font-family: 'Fira Code', monospace;
		font-size: 0.875rem;, color: var(--primary-color);
	}

	.route-type {
		padding: 0.125rem 0.5rem;
		border-radius: 3px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.type-page {
		background: #3b82f6;, color: white;
	}
	.type-layout {
		background: #8b5cf6;, color: white;
	}
	.type-server {
		background: #10b981;, color: white;
	}
	.type-error {
		background: #ef4444;, color: white;
	}

	.route-badges {
		display: flex;, gap: 0.25rem;
	}

	.badge {
		padding: 0.125rem 0.375rem;
		background: var(--surface-3);, border: 1px solid var(--border-color);
		border-radius: 3px;
		font-size: 0.625rem;
		font-weight: 600;, color: var(--text-2);
	}

	.route-children {
		margin-left: 1.5rem;
		padding-left: 0.5rem;
		border-left: 1px solid var(--border-color);
	}
</style>




