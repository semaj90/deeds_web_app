<script lang="ts">
	/**
	 * Route API Explorer - NES Edition
	 * Shows all 500+ route endpoints categorized by domain
	 */

	import type { RouteCategory, RouteEndpoint } from '$lib/server/api-metadata-extractor';

	let {
		categories = [],
		allEndpoints = [],
		onTestEndpoint = (endpoint: RouteEndpoint) => {}
	}: {
		categories: RouteCategory[];
		allEndpoints?: RouteEndpoint[];
		onTestEndpoint?: (endpoint: RouteEndpoint) => void;
	} = $props();

	// Build associated files lookup: route path → sibling files
	let associatedMap = $derived.by(() => {
		const byPath: Record<string, RouteEndpoint[]> = {};
		for (const ep of allEndpoints) {
			if (ep.type === 'archived') continue;
			if (!byPath[ep.path]) byPath[ep.path] = [];
			byPath[ep.path].push(ep);
		}
		return byPath;
	});

	let expandedCategories = $state(new Set<string>());
	let searchQuery = $state('');
	let filterMethod = $state<string>('all');
	let filterType = $state<'all' | 'api' | 'page' | 'page-server'>('all');

	function toggleCategory(category: string) {
		if (expandedCategories.has(category)) {
			expandedCategories.delete(category);
		} else {
			expandedCategories.add(category);
		}
		expandedCategories = expandedCategories; // Trigger reactivity
	}

	function expandAll() {
		expandedCategories = new Set(categories.map(c => c.name));
	}

	function collapseAll() {
		expandedCategories = new Set();
	}

	let filteredCategories = $derived.by(() => {
		let result = categories;

		// Filter by search query
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			result = categories.map(cat => ({
				...cat,
				endpoints: cat.endpoints.filter(e =>
					e.path.toLowerCase().includes(q) ||
					e.description?.toLowerCase().includes(q) ||
					e.category.toLowerCase().includes(q)
				)
			})).filter(cat => cat.endpoints.length > 0);
		}

		// Filter by HTTP method
		if (filterMethod !== 'all') {
			result = result.map(cat => ({
				...cat,
				endpoints: cat.endpoints.filter(e => e.methods.includes(filterMethod as any))
			})).filter(cat => cat.endpoints.length > 0);
		}

		// Filter by route type
		if (filterType !== 'all') {
			result = result.map(cat => ({
				...cat,
				endpoints: cat.endpoints.filter(e => e.type === filterType)
			})).filter(cat => cat.endpoints.length > 0);
		}

		return result;
	});

	let totalEndpoints = $derived(filteredCategories.reduce((sum, cat) => sum + cat.endpoints.length, 0));

	function getMethodColor(method: string): string {
		switch (method) {
			case 'GET': return '#33ff33';
			case 'POST': return '#ffff33';
			case 'PUT': return '#3399ff';
			case 'DELETE': return '#ff3333';
			case 'PATCH': return '#ff33ff';
			case 'load': return '#66aaff';
			case 'actions': return '#ff9933';
			default: return '#999';
		}
	}

	function getMethodIcon(method: string): string {
		switch (method) {
			case 'GET': return '⬇';
			case 'POST': return '⬆';
			case 'PUT': return '↻';
			case 'DELETE': return '✕';
			case 'PATCH': return '◐';
			case 'load': return '▶';
			case 'actions': return '⚡';
			default: return '•';
		}
	}
</script>

<div class="api-explorer">
	<!-- Header -->
	<div class="explorer-header">
		<div class="explorer-title">
			<span class="title-text">ROUTE EXPLORER</span>
			<span class="endpoint-count">{totalEndpoints} routes</span>
		</div>
		<div class="explorer-controls">
			<button class="control-btn" onclick={expandAll}>
				[+] EXPAND ALL
			</button>
			<button class="control-btn" onclick={collapseAll}>
				[-] COLLAPSE ALL
			</button>
		</div>
	</div>

	<!-- Search & Filter Bar -->
	<div class="filter-bar">
		<div class="search-box">
			<span class="search-prefix">&gt;</span>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="SEARCH ENDPOINTS..."
				class="search-input"
			/>
		</div>
		<select bind:value={filterMethod} class="method-filter">
			<option value="all">ALL METHODS</option>
			<option value="GET">GET</option>
			<option value="POST">POST</option>
			<option value="PUT">PUT</option>
			<option value="DELETE">DELETE</option>
			<option value="PATCH">PATCH</option>
			<option value="load">LOAD</option>
			<option value="actions">ACTIONS</option>
		</select>
		<select bind:value={filterType} class="type-filter">
			<option value="all">ALL TYPES</option>
			<option value="api">API</option>
			<option value="page">PAGES</option>
			<option value="page-server">SERVER</option>
		</select>
	</div>

	<!-- Category List -->
	<div class="category-list">
		{#if filteredCategories.length === 0}
			<div class="empty-state">
				<p>NO ENDPOINTS FOUND</p>
				<p class="hint">Try adjusting your filters</p>
			</div>
		{:else}
			{#each filteredCategories as category}
				<div class="category-section">
					<!-- Category Header -->
					<button
						class="category-header"
						onclick={() => toggleCategory(category.name)}
					>
						<span class="category-icon">
							{expandedCategories.has(category.name) ? '[-]' : '[+]'}
						</span>
						<span class="category-name">{category.name}</span>
						<span class="category-count">{category.endpoints.length} endpoints</span>
					</button>

					<!-- Category Endpoints -->
					{#if expandedCategories.has(category.name)}
						<div class="endpoint-list">
							{#each category.endpoints as endpoint}
								<div class="endpoint-row">
									<!-- Method Badges -->
									<div class="method-badges">
										{#if endpoint.methods.length > 0}
											{#each endpoint.methods as method}
												<span
													class="method-badge"
													style="color: {getMethodColor(method)}; border-color: {getMethodColor(method)}"
												>
													{getMethodIcon(method)} {method}
												</span>
											{/each}
										{:else}
											<span class="method-badge" style="color: #cc99ff; border-color: #cc99ff">
												◈ PAGE
											</span>
										{/if}
										{#if endpoint.type === 'page'}
											<span class="type-badge type-page">PAGE</span>
										{:else if endpoint.type === 'page-server'}
											<span class="type-badge type-server">SRV</span>
										{:else}
											<span class="type-badge type-api">API</span>
										{/if}
									</div>

									<!-- Endpoint Path -->
									<div class="endpoint-path">
										<span class="path-text">{endpoint.path}</span>
										{#if endpoint.hasAuth}
											<span class="auth-badge" title="Requires Authentication">🔒</span>
										{/if}
										{#if endpoint.responseType === 'text/event-stream'}
											<span class="sse-badge" title="Server-Sent Events">SSE</span>
										{/if}
									</div>

									<!-- Description -->
									{#if endpoint.description}
										<div class="endpoint-description">
											{endpoint.description}
										</div>
									{/if}

									<!-- File Path + Associated Files -->
									<div class="endpoint-file">
										<span class="file-icon">📄</span>
										<span class="file-path">{endpoint.filePath}</span>
										{#if endpoint.absolutePath}
											<a href="vscode://file/{endpoint.absolutePath}" class="editor-link" title="Open in VS Code">[EDIT]</a>
										{/if}
									</div>
									{#if associatedMap[endpoint.path]?.length > 1}
										<div class="sibling-files">
											<span class="sibling-label">ALSO:</span>
											{#each associatedMap[endpoint.path].filter(s => s.filePath !== endpoint.filePath) as sibling}
												<span class="sibling-chip" style="color: {sibling.type === 'api' ? '#33ff33' : sibling.type === 'page' ? '#cc99ff' : '#ff9933'}">
													{sibling.type === 'api' ? '+server.ts' : sibling.type === 'page' ? '+page.svelte' : '+page.server.ts'}
												</span>
											{/each}
										</div>
									{/if}

									<!-- Actions -->
									<div class="endpoint-actions">
										{#if endpoint.type === 'api'}
											<button
												class="action-btn test-btn"
												onclick={() => onTestEndpoint(endpoint)}
											>
												TEST
											</button>
										{:else}
											<a href={endpoint.path} class="action-btn visit-btn">VISIT</a>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	/* ── API Explorer Container ── */
	.api-explorer {
		background: #0c0c0c;
		border: 1px solid #3399ff;
		font-family: 'Courier New', 'Consolas', monospace;
		color: #33ff33;
	}

	/* ── Header ── */
	.explorer-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: #001a33;
		border-bottom: 1px solid #3399ff;
	}

	.explorer-title {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.title-text {
		font-weight: bold;
		font-size: 0.9rem;
		letter-spacing: 0.15em;
		color: #3399ff;
	}

	.endpoint-count {
		font-size: 0.75rem;
		color: #66aaff;
		background: rgba(51, 153, 255, 0.1);
		padding: 0.2rem 0.5rem;
		border: 1px solid #3399ff;
	}

	.explorer-controls {
		display: flex;
		gap: 0.5rem;
	}

	.control-btn {
		background: none;
		border: 1px solid #3399ff;
		color: #3399ff;
		font-family: inherit;
		font-size: 0.7rem;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
		letter-spacing: 0.05em;
	}

	.control-btn:hover {
		background: rgba(51, 153, 255, 0.2);
	}

	/* ── Filter Bar ── */
	.filter-bar {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: #111;
		border-bottom: 1px solid #1a3a5a;
		align-items: center;
		flex-wrap: wrap;
	}

	.search-box {
		display: flex;
		align-items: center;
		border: 1px solid #3399ff;
		padding: 0.3rem 0.5rem;
		flex: 1;
		min-width: 200px;
	}

	.search-prefix {
		color: #3399ff;
		margin-right: 0.5rem;
		font-weight: bold;
	}

	.search-input {
		background: transparent;
		border: none;
		color: #3399ff;
		font-family: inherit;
		font-size: 0.85rem;
		outline: none;
		width: 100%;
		letter-spacing: 0.05em;
	}

	.search-input::placeholder {
		color: #1a5a8a;
	}

	.method-filter,
	.type-filter {
		background: #0c0c0c;
		color: #3399ff;
		border: 1px solid #3399ff;
		padding: 0.3rem 0.5rem;
		font-family: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		letter-spacing: 0.05em;
	}

	.method-filter:focus,
	.type-filter:focus {
		outline: 1px solid #3399ff;
	}

	/* ── Category List ── */
	.category-list {
		max-height: 600px;
		overflow-y: auto;
	}

	.category-section {
		border-bottom: 1px solid #0a2a4a;
	}

	.category-section:last-child {
		border-bottom: none;
	}

	/* ── Category Header ── */
	.category-header {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1rem;
		background: #001a33;
		border: none;
		border-bottom: 1px solid #1a3a5a;
		color: #3399ff;
		font-family: inherit;
		font-size: 0.85rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s;
	}

	.category-header:hover {
		background: #002244;
	}

	.category-icon {
		font-weight: bold;
		flex-shrink: 0;
	}

	.category-name {
		flex: 1;
		font-weight: bold;
		letter-spacing: 0.1em;
	}

	.category-count {
		font-size: 0.7rem;
		color: #66aaff;
		flex-shrink: 0;
	}

	/* ── Endpoint List ── */
	.endpoint-list {
		display: flex;
		flex-direction: column;
	}

	.endpoint-row {
		padding: 0.75rem 1rem 0.75rem 2.5rem;
		border-bottom: 1px solid #0a1a2a;
		background: #0a0a0a;
	}

	.endpoint-row:hover {
		background: #0f1f2f;
	}

	.endpoint-row:last-child {
		border-bottom: none;
	}

	/* ── Method Badges ── */
	.method-badges {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
		flex-wrap: wrap;
	}

	.method-badge {
		font-size: 0.65rem;
		font-weight: bold;
		padding: 0.15rem 0.4rem;
		border: 1px solid;
		letter-spacing: 0.05em;
	}

	.type-badge {
		font-size: 0.55rem;
		font-weight: bold;
		padding: 0.1rem 0.35rem;
		letter-spacing: 0.08em;
		margin-left: 0.2rem;
	}

	.type-badge.type-page {
		color: #cc99ff;
		border: 1px solid #cc99ff;
		background: rgba(204, 153, 255, 0.1);
	}

	.type-badge.type-server {
		color: #ff9933;
		border: 1px solid #ff9933;
		background: rgba(255, 153, 51, 0.1);
	}

	.type-badge.type-api {
		color: #33ff33;
		border: 1px solid #33ff33;
		background: rgba(51, 255, 51, 0.05);
	}

	/* ── Endpoint Path ── */
	.endpoint-path {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
	}

	.path-text {
		font-size: 0.9rem;
		color: #55ff55;
		font-weight: bold;
	}

	.auth-badge {
		font-size: 0.7rem;
		flex-shrink: 0;
	}

	.sse-badge {
		font-size: 0.6rem;
		background: #ff33ff;
		color: #000;
		padding: 0.1rem 0.3rem;
		font-weight: bold;
		flex-shrink: 0;
	}

	/* ── Description ── */
	.endpoint-description {
		font-size: 0.75rem;
		color: #aaaaaa;
		margin-bottom: 0.4rem;
		line-height: 1.4;
	}

	/* ── File Path ── */
	.endpoint-file {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.65rem;
		color: #666;
		margin-bottom: 0.5rem;
	}

	.file-icon {
		flex-shrink: 0;
	}

	.file-path {
		font-family: 'Courier New', monospace;
	}

	.editor-link {
		color: #3399ff;
		text-decoration: none;
		font-size: 0.6rem;
		font-weight: bold;
		margin-left: 0.5rem;
		opacity: 0.5;
		transition: opacity 0.15s;
	}

	.editor-link:hover {
		opacity: 1;
		text-decoration: underline;
	}

	/* ── Sibling Files ── */
	.sibling-files {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.6rem;
		margin-bottom: 0.4rem;
		padding-left: 1.2rem;
	}

	.sibling-label {
		color: #664400;
		font-weight: bold;
	}

	.sibling-chip {
		padding: 0.05rem 0.3rem;
		border: 1px solid currentColor;
		font-weight: bold;
		letter-spacing: 0.05em;
		opacity: 0.7;
	}

	/* ── Actions ── */
	.endpoint-actions {
		display: flex;
		gap: 0.5rem;
	}

	.action-btn {
		background: none;
		border: 1px solid #3399ff;
		color: #3399ff;
		font-family: inherit;
		font-size: 0.65rem;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		letter-spacing: 0.1em;
		transition: all 0.15s;
		text-decoration: none;
		display: inline-block;
	}

	.action-btn:hover {
		background: #3399ff;
		color: #000;
	}

	.visit-btn {
		border-color: #33ff99;
		color: #33ff99;
	}

	.visit-btn:hover {
		background: #33ff99;
		color: #000;
	}

	/* ── Empty State ── */
	.empty-state {
		text-align: center;
		padding: 3rem;
		border: 1px dashed #1a3a5a;
		margin: 1rem;
	}

	.empty-state p {
		margin: 0.5rem 0;
	}

	.hint {
		color: #1a5a8a;
		font-size: 0.8rem;
	}

	/* ── Scrollbar ── */
	.category-list::-webkit-scrollbar {
		width: 8px;
	}

	.category-list::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.3);
	}

	.category-list::-webkit-scrollbar-thumb {
		background: #3399ff;
		border-radius: 4px;
	}
</style>
