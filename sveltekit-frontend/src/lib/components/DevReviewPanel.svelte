<script lang="ts">
	/**
	 * Dev Review Panel - NES Edition
	 * Shows auth coverage, SSE inventory, method distribution, associated files,
	 * orphan APIs, category heatmap, API cross-references, dead routes
	 */

	import type { RouteEndpoint, RouteStats, APICrossRef, DeadRouteRef } from '$lib/server/api-metadata-extractor';

	let {
		endpoints = [],
		stats,
		crossRefs = [],
		deadRoutes = []
	}: {
		endpoints: RouteEndpoint[];
		stats: RouteStats;
		crossRefs: APICrossRef[];
		deadRoutes: DeadRouteRef[];
	} = $props();

	let activeTab = $state<'auth' | 'sse' | 'methods' | 'files' | 'orphans' | 'heatmap' | 'xref' | 'dead'>('auth');

	// ── Auth Coverage ──
	let authCoverage = $derived.by(() => {
		const guarded = endpoints.filter(e => e.hasAuth);
		const unguarded = endpoints.filter(e => !e.hasAuth);
		const byGroup: Record<string, { total: number; guarded: number }> = {};

		for (const ep of endpoints) {
			const group = ep.group || 'other';
			if (!byGroup[group]) byGroup[group] = { total: 0, guarded: 0 };
			byGroup[group].total++;
			if (ep.hasAuth) byGroup[group].guarded++;
		}

		const groupEntries = Object.entries(byGroup)
			.sort((a, b) => b[1].total - a[1].total);

		return {
			total: endpoints.length,
			guarded: guarded.length,
			unguarded: unguarded.length,
			percent: endpoints.length > 0 ? Math.round((guarded.length / endpoints.length) * 100) : 0,
			byGroup: groupEntries
		};
	});

	// ── SSE Endpoints ──
	let sseEndpoints = $derived(endpoints.filter(e => e.responseType === 'text/event-stream'));

	// ── Method Distribution ──
	let methodDistribution = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const ep of endpoints) {
			for (const m of ep.methods) {
				counts[m] = (counts[m] || 0) + 1;
			}
			if (ep.methods.length === 0) {
				counts['(none)'] = (counts['(none)'] || 0) + 1;
			}
		}
		const total = Object.values(counts).reduce((a, b) => a + b, 0);
		return Object.entries(counts)
			.sort((a, b) => b[1] - a[1])
			.map(([method, count]) => ({
				method,
				count,
				percent: total > 0 ? Math.round((count / total) * 100) : 0
			}));
	});

	// ── Associated Files Per Route ──
	let associatedFiles = $derived.by(() => {
		const byPath: Record<string, RouteEndpoint[]> = {};
		for (const ep of endpoints) {
			if (ep.type === 'archived') continue;
			const urlPath = ep.path;
			if (!byPath[urlPath]) byPath[urlPath] = [];
			byPath[urlPath].push(ep);
		}
		// Only show routes with 2+ associated files
		return Object.entries(byPath)
			.filter(([, eps]) => eps.length >= 2)
			.sort((a, b) => b[1].length - a[1].length)
			.slice(0, 50);
	});

	// ── Orphan APIs (no sibling page at same path) ──
	let orphanAPIs = $derived.by(() => {
		const pagePaths = new Set(
			endpoints
				.filter(e => e.type === 'page' || e.type === 'page-server')
				.map(e => e.path)
		);
		return endpoints
			.filter(e => e.type === 'api' && !pagePaths.has(e.path.replace(/^\/api/, '')))
			.sort((a, b) => a.path.localeCompare(b.path));
	});

	// ── Category Health Heatmap ──
	let categoryHeatmap = $derived.by(() => {
		const catMap: Record<string, { total: number; authed: number; sse: number; pages: number; apis: number }> = {};
		for (const ep of endpoints) {
			if (ep.type === 'archived') continue;
			const cat = ep.category;
			if (!catMap[cat]) catMap[cat] = { total: 0, authed: 0, sse: 0, pages: 0, apis: 0 };
			catMap[cat].total++;
			if (ep.hasAuth) catMap[cat].authed++;
			if (ep.responseType === 'text/event-stream') catMap[cat].sse++;
			if (ep.type === 'page') catMap[cat].pages++;
			if (ep.type === 'api') catMap[cat].apis++;
		}
		return Object.entries(catMap)
			.sort((a, b) => b[1].total - a[1].total)
			.map(([name, data]) => ({
				name,
				...data,
				authPct: data.total > 0 ? Math.round((data.authed / data.total) * 100) : 0
			}));
	});

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

	function getTypeLabel(type: string): string {
		switch (type) {
			case 'api': return '+server.ts';
			case 'page': return '+page.svelte';
			case 'page-server': return '+page.server.ts';
			default: return type;
		}
	}

	function getTypeColor(type: string): string {
		switch (type) {
			case 'api': return '#33ff33';
			case 'page': return '#cc99ff';
			case 'page-server': return '#ff9933';
			default: return '#999';
		}
	}

	function heatColor(pct: number): string {
		if (pct >= 80) return '#33ff33';
		if (pct >= 60) return '#99ff33';
		if (pct >= 40) return '#ffaa33';
		if (pct >= 20) return '#ff6633';
		return '#ff3333';
	}
</script>

<div class="dev-review">
	<!-- Header -->
	<div class="review-header">
		<span class="header-title">DEV REVIEW DASHBOARD</span>
		<span class="header-count">{endpoints.length} routes analyzed</span>
	</div>

	<!-- Tabs -->
	<div class="tab-bar">
		<button class="tab-btn" class:tab-active={activeTab === 'auth'} onclick={() => activeTab = 'auth'}>
			AUTH ({authCoverage.percent}%)
		</button>
		<button class="tab-btn" class:tab-active={activeTab === 'sse'} onclick={() => activeTab = 'sse'}>
			SSE ({sseEndpoints.length})
		</button>
		<button class="tab-btn" class:tab-active={activeTab === 'methods'} onclick={() => activeTab = 'methods'}>
			METHODS
		</button>
		<button class="tab-btn" class:tab-active={activeTab === 'files'} onclick={() => activeTab = 'files'}>
			ASSOCIATED ({associatedFiles.length})
		</button>
		<button class="tab-btn" class:tab-active={activeTab === 'orphans'} onclick={() => activeTab = 'orphans'}>
			ORPHANS ({orphanAPIs.length})
		</button>
		<button class="tab-btn" class:tab-active={activeTab === 'heatmap'} onclick={() => activeTab = 'heatmap'}>
			HEATMAP ({categoryHeatmap.length})
		</button>
		<button class="tab-btn" class:tab-active={activeTab === 'xref'} onclick={() => activeTab = 'xref'}>
			XREF ({crossRefs.length})
		</button>
		<button class="tab-btn" class:tab-active={activeTab === 'dead'} onclick={() => activeTab = 'dead'}>
			DEAD ({deadRoutes.length})
		</button>
	</div>

	<!-- Tab Content -->
	<div class="tab-content">
		{#if activeTab === 'auth'}
			<!-- Auth Coverage Tab -->
			<div class="auth-overview">
				<div class="auth-bar-track">
					<div
						class="auth-bar-fill"
						style="width: {authCoverage.percent}%"
					></div>
				</div>
				<div class="auth-stats-row">
					<span class="auth-stat auth-guarded">{authCoverage.guarded} GUARDED</span>
					<span class="auth-stat auth-open">{authCoverage.unguarded} OPEN</span>
					<span class="auth-stat auth-pct">{authCoverage.percent}% COVERAGE</span>
				</div>
			</div>

			<div class="auth-groups">
				<div class="group-header-row">
					<span class="gh-name">GROUP</span>
					<span class="gh-bar">COVERAGE</span>
					<span class="gh-count">GUARDED / TOTAL</span>
				</div>
				{#each authCoverage.byGroup as [group, data]}
					{@const pct = data.total > 0 ? Math.round((data.guarded / data.total) * 100) : 0}
					<div class="group-row">
						<span class="group-name">{group}</span>
						<div class="group-bar-track">
							<div
								class="group-bar-fill"
								class:bar-good={pct >= 80}
								class:bar-warn={pct >= 40 && pct < 80}
								class:bar-bad={pct < 40}
								style="width: {pct}%"
							></div>
						</div>
						<span class="group-count">{data.guarded} / {data.total}</span>
					</div>
				{/each}
			</div>

		{:else if activeTab === 'sse'}
			<!-- SSE Endpoints Tab -->
			{#if sseEndpoints.length === 0}
				<div class="empty-tab">NO SSE ENDPOINTS DETECTED</div>
			{:else}
				<div class="sse-list">
					{#each sseEndpoints as ep}
						<div class="sse-row">
							<span class="sse-badge">SSE</span>
							<span class="sse-path">{ep.path}</span>
							<span class="sse-group">{ep.group}</span>
							{#if ep.hasAuth}
								<span class="sse-auth">GUARDED</span>
							{:else}
								<span class="sse-open">OPEN</span>
							{/if}
							{#if ep.absolutePath}
								<a href="vscode://file/{ep.absolutePath}" class="sse-edit">[EDIT]</a>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

		{:else if activeTab === 'methods'}
			<!-- Method Distribution Tab -->
			<div class="method-chart">
				{#each methodDistribution as { method, count, percent }}
					<div class="method-row">
						<span class="method-label" style="color: {getMethodColor(method)}">{method}</span>
						<div class="method-bar-track">
							<div
								class="method-bar-fill"
								style="width: {percent}%; background: {getMethodColor(method)}"
							></div>
						</div>
						<span class="method-count">{count}</span>
						<span class="method-pct">{percent}%</span>
					</div>
				{/each}
			</div>

			<!-- Group Distribution -->
			<div class="group-dist-title">BY GROUP</div>
			<div class="group-dist">
				{#each Object.entries(stats.groupCounts).filter(([, v]) => v > 0) as [group, count]}
					<div class="gdist-item">
						<span class="gdist-label">{group.toUpperCase()}</span>
						<span class="gdist-value">{count}</span>
					</div>
				{/each}
			</div>

		{:else if activeTab === 'files'}
			<!-- Associated Files Tab -->
			{#if associatedFiles.length === 0}
				<div class="empty-tab">NO MULTI-FILE ROUTES FOUND</div>
			{:else}
				<div class="assoc-list">
					{#each associatedFiles as [routePath, files]}
						<div class="assoc-route">
							<div class="assoc-path">{routePath}</div>
							<div class="assoc-files">
								{#each files as file}
									<div class="assoc-file-row">
										<span class="assoc-type" style="color: {getTypeColor(file.type)}">
											{getTypeLabel(file.type)}
										</span>
										<span class="assoc-methods">
											{#each file.methods as m}
												<span class="assoc-method" style="color: {getMethodColor(m)}">{m}</span>
											{/each}
										</span>
										{#if file.absolutePath}
											<a href="vscode://file/{file.absolutePath}" class="assoc-edit">[EDIT]</a>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}

		{:else if activeTab === 'orphans'}
			<!-- Orphan APIs Tab -->
			<div class="orphan-header-note">
				API endpoints with no corresponding page route at the same URL path.
				These are backend-only endpoints (expected for most APIs).
			</div>
			{#if orphanAPIs.length === 0}
				<div class="empty-tab">ALL API ENDPOINTS HAVE CORRESPONDING PAGES</div>
			{:else}
				<div class="orphan-list">
					{#each orphanAPIs.slice(0, 100) as ep}
						<div class="orphan-row">
							<div class="orphan-methods">
								{#each ep.methods as m}
									<span class="orphan-method" style="color: {getMethodColor(m)}">{m}</span>
								{/each}
							</div>
							<span class="orphan-path">{ep.path}</span>
							<span class="orphan-cat">{ep.category}</span>
							{#if ep.hasAuth}
								<span class="orphan-auth">GUARDED</span>
							{:else}
								<span class="orphan-open">OPEN</span>
							{/if}
							{#if ep.absolutePath}
								<a href="vscode://file/{ep.absolutePath}" class="orphan-edit">[EDIT]</a>
							{/if}
						</div>
					{/each}
					{#if orphanAPIs.length > 100}
						<div class="orphan-more">...and {orphanAPIs.length - 100} more</div>
					{/if}
				</div>
			{/if}

		{:else if activeTab === 'heatmap'}
			<!-- Category Health Heatmap -->
			<div class="heatmap-legend">
				<span class="heatmap-legend-item" style="color: #33ff33">80%+</span>
				<span class="heatmap-legend-item" style="color: #99ff33">60-79%</span>
				<span class="heatmap-legend-item" style="color: #ffaa33">40-59%</span>
				<span class="heatmap-legend-item" style="color: #ff6633">20-39%</span>
				<span class="heatmap-legend-item" style="color: #ff3333">&lt;20%</span>
				<span class="heatmap-legend-label">AUTH COVERAGE</span>
			</div>
			<div class="heatmap-grid">
				{#each categoryHeatmap as cat}
					<div class="heatmap-cell" style="border-color: {heatColor(cat.authPct)}">
						<div class="heatmap-name" style="color: {heatColor(cat.authPct)}">{cat.name}</div>
						<div class="heatmap-stats">
							<span class="heatmap-total">{cat.total} routes</span>
							<span class="heatmap-auth-pct" style="color: {heatColor(cat.authPct)}">{cat.authPct}%</span>
						</div>
						<div class="heatmap-breakdown">
							{#if cat.apis > 0}<span class="heatmap-tag heatmap-api">{cat.apis} API</span>{/if}
							{#if cat.pages > 0}<span class="heatmap-tag heatmap-page">{cat.pages} PG</span>{/if}
							{#if cat.sse > 0}<span class="heatmap-tag heatmap-sse">{cat.sse} SSE</span>{/if}
						</div>
					</div>
				{/each}
			</div>

		{:else if activeTab === 'xref'}
			<!-- API Cross-References Tab -->
			<div class="xref-header-note">
				Which pages consume which API endpoints (detected via fetch('/api/...') patterns).
			</div>
			{#if crossRefs.length === 0}
				<div class="empty-tab">NO API CROSS-REFERENCES DETECTED</div>
			{:else}
				<div class="xref-list">
					{#each crossRefs.slice(0, 80) as ref}
						<div class="xref-row">
							<div class="xref-api">
								<span class="xref-api-path">{ref.apiPath}</span>
								<span class="xref-consumer-count">{ref.consumers.length} consumer{ref.consumers.length !== 1 ? 's' : ''}</span>
							</div>
							<div class="xref-consumers">
								{#each ref.consumers as consumer}
									<div class="xref-consumer">
										<span class="xref-page-path">{consumer.pagePath}</span>
										<span class="xref-page-file">{consumer.pageFile.replace('src/routes/', '')}</span>
									</div>
								{/each}
							</div>
						</div>
					{/each}
					{#if crossRefs.length > 80}
						<div class="orphan-more">...and {crossRefs.length - 80} more</div>
					{/if}
				</div>
			{/if}

		{:else if activeTab === 'dead'}
			<!-- Dead Routes Tab -->
			<div class="dead-header-note">
				Pages that fetch API paths which don't have corresponding +server.ts files.
				These may indicate broken client-server wiring.
			</div>
			{#if deadRoutes.length === 0}
				<div class="empty-tab dead-ok">NO DEAD ROUTE REFERENCES DETECTED</div>
			{:else}
				<div class="dead-list">
					{#each deadRoutes as ref}
						<div class="dead-row">
							<div class="dead-page">
								<span class="dead-page-path">{ref.pagePath}</span>
								<span class="dead-page-file">{ref.pageFile.replace('src/routes/', '')}</span>
							</div>
							<div class="dead-missing">
								<span class="dead-missing-label">MISSING APIs:</span>
								{#each ref.missingAPIs as api}
									<span class="dead-missing-api">{api}</span>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.dev-review {
		background: #0c0c0c;
		border: 1px solid #ff6633;
		font-family: 'Courier New', 'Consolas', monospace;
		color: #33ff33;
	}

	/* ── Header ── */
	.review-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: #1a0800;
		border-bottom: 1px solid #ff6633;
	}

	.header-title {
		font-weight: bold;
		font-size: 0.9rem;
		letter-spacing: 0.15em;
		color: #ff6633;
	}

	.header-count {
		font-size: 0.75rem;
		color: #ff9966;
		background: rgba(255, 102, 51, 0.1);
		padding: 0.2rem 0.5rem;
		border: 1px solid #ff6633;
	}

	/* ── Tabs ── */
	.tab-bar {
		display: flex;
		background: #111;
		border-bottom: 1px solid #662200;
		flex-wrap: wrap;
	}

	.tab-btn {
		flex: 1;
		padding: 0.5rem 0.5rem;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: #996633;
		font-family: inherit;
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		cursor: pointer;
		transition: all 0.15s;
		min-width: 80px;
	}

	.tab-btn:hover {
		color: #ff9966;
		background: rgba(255, 102, 51, 0.05);
	}

	.tab-active {
		color: #ff6633;
		border-bottom-color: #ff6633;
		background: rgba(255, 102, 51, 0.1);
	}

	/* ── Tab Content ── */
	.tab-content {
		max-height: 500px;
		overflow-y: auto;
		padding: 0.75rem 1rem;
	}

	.empty-tab {
		text-align: center;
		padding: 2rem;
		color: #664400;
		font-size: 0.8rem;
	}

	/* ── Auth Coverage ── */
	.auth-overview {
		margin-bottom: 1rem;
	}

	.auth-bar-track {
		height: 12px;
		background: #1a0800;
		border: 1px solid #662200;
		margin-bottom: 0.5rem;
	}

	.auth-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, #33ff33, #66ff66);
		transition: width 0.3s;
	}

	.auth-stats-row {
		display: flex;
		gap: 1rem;
		font-size: 0.7rem;
	}

	.auth-guarded { color: #33ff33; }
	.auth-open { color: #ff3333; }
	.auth-pct { color: #ffaa33; margin-left: auto; }

	/* ── Auth Groups ── */
	.auth-groups {
		margin-top: 0.75rem;
	}

	.group-header-row {
		display: flex;
		gap: 0.5rem;
		padding: 0.3rem 0;
		font-size: 0.6rem;
		color: #664400;
		border-bottom: 1px solid #331100;
		align-items: center;
	}

	.gh-name { width: 80px; flex-shrink: 0; }
	.gh-bar { flex: 1; }
	.gh-count { width: 80px; text-align: right; flex-shrink: 0; }

	.group-row {
		display: flex;
		gap: 0.5rem;
		padding: 0.35rem 0;
		font-size: 0.7rem;
		align-items: center;
		border-bottom: 1px solid #1a0800;
	}

	.group-name {
		width: 80px;
		flex-shrink: 0;
		color: #ff9966;
		font-weight: bold;
	}

	.group-bar-track {
		flex: 1;
		height: 8px;
		background: #1a0800;
		border: 1px solid #331100;
	}

	.group-bar-fill {
		height: 100%;
		transition: width 0.3s;
	}

	.bar-good { background: #33ff33; }
	.bar-warn { background: #ffaa33; }
	.bar-bad { background: #ff3333; }

	.group-count {
		width: 80px;
		text-align: right;
		flex-shrink: 0;
		color: #999;
	}

	/* ── SSE Endpoints ── */
	.sse-list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.sse-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		background: #0a0a0a;
		border: 1px solid #1a0800;
		font-size: 0.75rem;
	}

	.sse-badge {
		background: #ff33ff;
		color: #000;
		font-size: 0.55rem;
		font-weight: bold;
		padding: 0.1rem 0.3rem;
		flex-shrink: 0;
	}

	.sse-path {
		flex: 1;
		color: #55ff55;
		font-weight: bold;
	}

	.sse-group {
		color: #666;
		font-size: 0.65rem;
	}

	.sse-auth {
		color: #33ff33;
		font-size: 0.6rem;
		font-weight: bold;
	}

	.sse-open {
		color: #ff3333;
		font-size: 0.6rem;
		font-weight: bold;
	}

	.sse-edit {
		color: #3399ff;
		text-decoration: none;
		font-size: 0.6rem;
		opacity: 0.5;
		transition: opacity 0.15s;
	}

	.sse-edit:hover {
		opacity: 1;
	}

	/* ── Method Distribution ── */
	.method-chart {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.method-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
	}

	.method-label {
		width: 60px;
		font-weight: bold;
		text-align: right;
		flex-shrink: 0;
	}

	.method-bar-track {
		flex: 1;
		height: 10px;
		background: #1a0800;
		border: 1px solid #331100;
	}

	.method-bar-fill {
		height: 100%;
		transition: width 0.3s;
		opacity: 0.8;
	}

	.method-count {
		width: 35px;
		text-align: right;
		color: #999;
		font-size: 0.7rem;
		flex-shrink: 0;
	}

	.method-pct {
		width: 35px;
		text-align: right;
		color: #664400;
		font-size: 0.65rem;
		flex-shrink: 0;
	}

	/* ── Group Distribution ── */
	.group-dist-title {
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid #331100;
		font-size: 0.7rem;
		color: #664400;
		letter-spacing: 0.1em;
		margin-bottom: 0.5rem;
	}

	.group-dist {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.gdist-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid #331100;
		font-size: 0.7rem;
	}

	.gdist-label {
		color: #ff9966;
		font-weight: bold;
	}

	.gdist-value {
		color: #999;
	}

	/* ── Associated Files ── */
	.assoc-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.assoc-route {
		border: 1px solid #1a0800;
		background: #0a0a0a;
	}

	.assoc-path {
		padding: 0.4rem 0.6rem;
		font-size: 0.8rem;
		font-weight: bold;
		color: #55ff55;
		background: #001100;
		border-bottom: 1px solid #1a0800;
	}

	.assoc-files {
		padding: 0.3rem 0.6rem;
	}

	.assoc-file-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.2rem 0;
		font-size: 0.7rem;
	}

	.assoc-type {
		width: 120px;
		flex-shrink: 0;
		font-weight: bold;
	}

	.assoc-methods {
		display: flex;
		gap: 0.3rem;
		flex: 1;
	}

	.assoc-method {
		font-size: 0.6rem;
		font-weight: bold;
	}

	.assoc-edit {
		color: #3399ff;
		text-decoration: none;
		font-size: 0.6rem;
		opacity: 0.5;
		transition: opacity 0.15s;
		flex-shrink: 0;
	}

	.assoc-edit:hover {
		opacity: 1;
	}

	/* ── Orphan APIs ── */
	.orphan-header-note {
		font-size: 0.65rem;
		color: #664400;
		margin-bottom: 0.75rem;
		line-height: 1.4;
	}

	.orphan-list {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.orphan-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.5rem;
		background: #0a0a0a;
		border: 1px solid #1a0800;
		font-size: 0.7rem;
	}

	.orphan-methods {
		display: flex;
		gap: 0.2rem;
		flex-shrink: 0;
		min-width: 50px;
	}

	.orphan-method {
		font-size: 0.55rem;
		font-weight: bold;
	}

	.orphan-path {
		flex: 1;
		color: #55ff55;
		font-weight: bold;
	}

	.orphan-cat {
		color: #666;
		font-size: 0.6rem;
		flex-shrink: 0;
	}

	.orphan-auth {
		color: #33ff33;
		font-size: 0.55rem;
		font-weight: bold;
		flex-shrink: 0;
	}

	.orphan-open {
		color: #ff3333;
		font-size: 0.55rem;
		font-weight: bold;
		flex-shrink: 0;
	}

	.orphan-edit {
		color: #3399ff;
		text-decoration: none;
		font-size: 0.55rem;
		opacity: 0.5;
		transition: opacity 0.15s;
		flex-shrink: 0;
	}

	.orphan-edit:hover {
		opacity: 1;
	}

	.orphan-more {
		text-align: center;
		padding: 0.5rem;
		color: #664400;
		font-size: 0.7rem;
	}

	/* ── Category Heatmap ── */
	.heatmap-legend {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		font-size: 0.6rem;
		align-items: center;
	}

	.heatmap-legend-item {
		font-weight: bold;
	}

	.heatmap-legend-label {
		color: #664400;
		margin-left: auto;
	}

	.heatmap-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 0.4rem;
	}

	.heatmap-cell {
		border: 1px solid;
		padding: 0.4rem 0.5rem;
		background: #0a0a0a;
		transition: background 0.15s;
	}

	.heatmap-cell:hover {
		background: #111;
	}

	.heatmap-name {
		font-weight: bold;
		font-size: 0.7rem;
		margin-bottom: 0.3rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.heatmap-stats {
		display: flex;
		justify-content: space-between;
		font-size: 0.6rem;
		margin-bottom: 0.2rem;
	}

	.heatmap-total {
		color: #999;
	}

	.heatmap-auth-pct {
		font-weight: bold;
	}

	.heatmap-breakdown {
		display: flex;
		gap: 0.3rem;
	}

	.heatmap-tag {
		font-size: 0.5rem;
		font-weight: bold;
		padding: 0.05rem 0.2rem;
		border: 1px solid;
	}

	.heatmap-api {
		color: #33ff33;
		border-color: #33ff33;
	}

	.heatmap-page {
		color: #cc99ff;
		border-color: #cc99ff;
	}

	.heatmap-sse {
		color: #ff33ff;
		border-color: #ff33ff;
	}

	/* ── API Cross-References ── */
	.xref-header-note {
		font-size: 0.65rem;
		color: #664400;
		margin-bottom: 0.75rem;
		line-height: 1.4;
	}

	.xref-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.xref-row {
		border: 1px solid #1a0800;
		background: #0a0a0a;
	}

	.xref-api {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.4rem 0.6rem;
		background: #001100;
		border-bottom: 1px solid #1a0800;
	}

	.xref-api-path {
		font-size: 0.75rem;
		font-weight: bold;
		color: #33ff33;
	}

	.xref-consumer-count {
		font-size: 0.6rem;
		color: #666;
	}

	.xref-consumers {
		padding: 0.3rem 0.6rem;
	}

	.xref-consumer {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.15rem 0;
		font-size: 0.65rem;
	}

	.xref-page-path {
		color: #cc99ff;
		font-weight: bold;
	}

	.xref-page-file {
		color: #555;
		font-size: 0.6rem;
	}

	/* ── Dead Routes ── */
	.dead-header-note {
		font-size: 0.65rem;
		color: #993300;
		margin-bottom: 0.75rem;
		line-height: 1.4;
	}

	.dead-ok {
		color: #33ff33 !important;
	}

	.dead-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.dead-row {
		border: 1px solid #661a00;
		background: #0a0505;
	}

	.dead-page {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.4rem 0.6rem;
		background: #110800;
		border-bottom: 1px solid #661a00;
	}

	.dead-page-path {
		font-size: 0.75rem;
		font-weight: bold;
		color: #ff6633;
	}

	.dead-page-file {
		font-size: 0.6rem;
		color: #555;
	}

	.dead-missing {
		padding: 0.3rem 0.6rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		align-items: center;
	}

	.dead-missing-label {
		font-size: 0.6rem;
		color: #993300;
		font-weight: bold;
		flex-shrink: 0;
	}

	.dead-missing-api {
		font-size: 0.65rem;
		color: #ff3333;
		padding: 0.05rem 0.3rem;
		border: 1px solid #660000;
		background: rgba(255, 0, 0, 0.05);
	}

	/* ── Scrollbar ── */
	.tab-content::-webkit-scrollbar {
		width: 8px;
	}

	.tab-content::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.3);
	}

	.tab-content::-webkit-scrollbar-thumb {
		background: #ff6633;
		border-radius: 4px;
	}
</style>
