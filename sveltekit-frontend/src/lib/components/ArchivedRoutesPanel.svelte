<script lang="ts">
	/**
	 * Archived Routes Panel - NES Edition
	 * Shows 253 archived endpoints from deeds_labs
	 */

	import type { RouteEndpoint } from '$lib/server/api-metadata-extractor';

	let {
		archived = []
	}: {
		archived: RouteEndpoint[];
	} = $props();

	let searchQuery = $state('');
	let sortBy = $state<'path' | 'category'>('category');

	let filteredArchived = $derived.by(() => {
		let result = archived;

		// Filter by search
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			result = result.filter(e =>
				e.path.toLowerCase().includes(q) ||
				e.category.toLowerCase().includes(q) ||
				e.filePath.toLowerCase().includes(q)
			);
		}

		// Sort
		if (sortBy === 'path') {
			result = [...result].sort((a, b) => a.path.localeCompare(b.path));
		} else {
			result = [...result].sort((a, b) => {
				const catCompare = a.category.localeCompare(b.category);
				if (catCompare !== 0) return catCompare;
				return a.path.localeCompare(b.path);
			});
		}

		return result;
	});

	let groupedArchived = $derived.by(() => {
		const groups = new Map<string, RouteEndpoint[]>();

		for (const endpoint of filteredArchived) {
			const key = sortBy === 'category' ? endpoint.category : endpoint.path.split('/')[1] || 'root';
			const existing = groups.get(key) || [];
			existing.push(endpoint);
			groups.set(key, existing);
		}

		return Array.from(groups.entries()).map(([name, endpoints]) => ({
			name,
			count: endpoints.length,
			endpoints
		}));
	});
</script>

<div class="archived-panel">
	<!-- Header -->
	<div class="panel-header">
		<div class="panel-title">
			<span class="title-text">ARCHIVED ROUTES (DEEDS_LABS)</span>
			<span class="archived-count">{archived.length} archived</span>
		</div>
		<div class="panel-info">
			Moved during cleanup sessions 89-93
		</div>
	</div>

	<!-- Stats Bar -->
	<div class="stats-bar">
		<div class="stat-item">
			<span class="stat-label">TOTAL</span>
			<span class="stat-value">{archived.length}</span>
		</div>
		<div class="stat-item">
			<span class="stat-label">FILTERED</span>
			<span class="stat-value">{filteredArchived.length}</span>
		</div>
		<div class="stat-item">
			<span class="stat-label">CATEGORIES</span>
			<span class="stat-value">{groupedArchived.length}</span>
		</div>
	</div>

	<!-- Controls -->
	<div class="controls-bar">
		<div class="search-box">
			<span class="search-prefix">&gt;</span>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="SEARCH ARCHIVED ROUTES..."
				class="search-input"
			/>
		</div>
		<select bind:value={sortBy} class="sort-select">
			<option value="category">SORT BY CATEGORY</option>
			<option value="path">SORT BY PATH</option>
		</select>
	</div>

	<!-- Grouped List -->
	<div class="routes-list">
		{#if groupedArchived.length === 0}
			<div class="empty-state">
				<p>NO ARCHIVED ROUTES FOUND</p>
				<p class="hint">Try adjusting your search</p>
			</div>
		{:else}
			{#each groupedArchived as group}
				<div class="route-group">
					<div class="group-header">
						<span class="group-name">{group.name}</span>
						<span class="group-count">{group.count} routes</span>
					</div>
					<div class="group-routes">
						{#each group.endpoints as endpoint}
							<div class="route-row">
								<!-- Method Badges -->
								<div class="method-badges">
									{#each endpoint.methods as method}
										<span class="method-badge method-{method.toLowerCase()}">
											{method}
										</span>
									{/each}
								</div>

								<!-- Path -->
								<div class="route-path">
									{endpoint.path}
								</div>

								<!-- File Path -->
								<div class="route-file">
									📁 {endpoint.filePath.replace('../deeds_labs/', '')}
								</div>

								<!-- Description -->
								{#if endpoint.description}
									<div class="route-desc">
										{endpoint.description}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</div>

	<!-- Footer Info -->
	<div class="panel-footer">
		<div class="footer-text">
			💡 These routes were moved to <code>deeds_labs/</code> during consolidation.
			Safe to delete after review.
		</div>
	</div>
</div>

<style>
	/* ── Panel Container ── */
	.archived-panel {
		background: #0c0c0c;
		border: 1px solid #663300;
		font-family: 'Courier New', 'Consolas', monospace;
		color: #ff6633;
	}

	/* ── Header ── */
	.panel-header {
		padding: 0.75rem 1rem;
		background: #1a0c00;
		border-bottom: 1px solid #663300;
	}

	.panel-title {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.4rem;
	}

	.title-text {
		font-weight: bold;
		font-size: 0.9rem;
		letter-spacing: 0.15em;
		color: #ff6633;
	}

	.archived-count {
		font-size: 0.75rem;
		color: #ff9966;
		background: rgba(255, 102, 51, 0.1);
		padding: 0.2rem 0.5rem;
		border: 1px solid #ff6633;
	}

	.panel-info {
		font-size: 0.7rem;
		color: #996633;
	}

	/* ── Stats Bar ── */
	.stats-bar {
		display: flex;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: #111;
		border-bottom: 1px solid #331a00;
	}

	.stat-item {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.stat-label {
		font-size: 0.6rem;
		color: #996633;
		letter-spacing: 0.1em;
	}

	.stat-value {
		font-size: 1.1rem;
		font-weight: bold;
		color: #ff6633;
	}

	/* ── Controls ── */
	.controls-bar {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: #0a0a0a;
		border-bottom: 1px solid #331a00;
		align-items: center;
	}

	.search-box {
		display: flex;
		align-items: center;
		border: 1px solid #ff6633;
		padding: 0.3rem 0.5rem;
		flex: 1;
		min-width: 200px;
	}

	.search-prefix {
		color: #ff6633;
		margin-right: 0.5rem;
		font-weight: bold;
	}

	.search-input {
		background: transparent;
		border: none;
		color: #ff6633;
		font-family: inherit;
		font-size: 0.85rem;
		outline: none;
		width: 100%;
		letter-spacing: 0.05em;
	}

	.search-input::placeholder {
		color: #663300;
	}

	.sort-select {
		background: #0c0c0c;
		color: #ff6633;
		border: 1px solid #ff6633;
		padding: 0.3rem 0.5rem;
		font-family: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		letter-spacing: 0.05em;
	}

	.sort-select:focus {
		outline: 1px solid #ff6633;
	}

	/* ── Routes List ── */
	.routes-list {
		max-height: 600px;
		overflow-y: auto;
	}

	/* ── Route Group ── */
	.route-group {
		border-bottom: 1px solid #331a00;
	}

	.group-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.6rem 1rem;
		background: #1a0c00;
		border-bottom: 1px solid #331a00;
	}

	.group-name {
		font-weight: bold;
		font-size: 0.85rem;
		letter-spacing: 0.1em;
		color: #ff9966;
	}

	.group-count {
		font-size: 0.7rem;
		color: #996633;
	}

	.group-routes {
		display: flex;
		flex-direction: column;
	}

	/* ── Route Row ── */
	.route-row {
		padding: 0.75rem 1rem 0.75rem 2rem;
		border-bottom: 1px solid #1a0a00;
		background: #0a0a0a;
	}

	.route-row:hover {
		background: #1a0f00;
	}

	.route-row:last-child {
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

	.method-badge.method-get {
		color: #33ff33;
		border-color: #33ff33;
	}

	.method-badge.method-post {
		color: #ffff33;
		border-color: #ffff33;
	}

	.method-badge.method-delete {
		color: #ff3333;
		border-color: #ff3333;
	}

	.method-badge.method-put {
		color: #3399ff;
		border-color: #3399ff;
	}

	.method-badge.method-patch {
		color: #ff33ff;
		border-color: #ff33ff;
	}

	/* ── Route Path ── */
	.route-path {
		font-size: 0.9rem;
		color: #ff9966;
		font-weight: bold;
		margin-bottom: 0.4rem;
	}

	/* ── Route File ── */
	.route-file {
		font-size: 0.7rem;
		color: #996633;
		margin-bottom: 0.3rem;
	}

	/* ── Route Description ── */
	.route-desc {
		font-size: 0.75rem;
		color: #888;
		line-height: 1.4;
	}

	/* ── Footer ── */
	.panel-footer {
		padding: 0.75rem 1rem;
		background: #1a0c00;
		border-top: 1px solid #663300;
	}

	.footer-text {
		font-size: 0.7rem;
		color: #996633;
		line-height: 1.5;
	}

	.footer-text code {
		background: rgba(255, 102, 51, 0.1);
		padding: 0.1rem 0.3rem;
		border: 1px solid #663300;
		color: #ff9966;
	}

	/* ── Empty State ── */
	.empty-state {
		text-align: center;
		padding: 3rem;
		border: 1px dashed #663300;
		margin: 1rem;
	}

	.empty-state p {
		margin: 0.5rem 0;
		color: #996633;
	}

	.hint {
		font-size: 0.8rem;
	}

	/* ── Scrollbar ── */
	.routes-list::-webkit-scrollbar {
		width: 8px;
	}

	.routes-list::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.3);
	}

	.routes-list::-webkit-scrollbar-thumb {
		background: #ff6633;
		border-radius: 4px;
	}
</style>
