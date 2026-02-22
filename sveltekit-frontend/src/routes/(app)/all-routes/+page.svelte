<script lang="ts">
	import type { PageData } from './$types';
	import RouteOperationsDashboard from '$lib/components/RouteOperationsDashboard.svelte';
	import RouteInspectorModal from '$lib/components/RouteInspectorModal.svelte';
	import RouteDecisionModal from '$lib/components/RouteDecisionModal.svelte';

	const { data }: { data: PageData } = $props();
	let showDecisionModal = $state(false);
	let decisionRoute = $state<{ path: string; reason: string; decision: 'keep' | 'archive' | 'remove' | null; notes?: string } | null>(null);

	let routes = $state<any[]>([]);
	let searchQuery = $state('');
	let filterHealth = $state<'all' | 'healthy' | 'flaky' | 'broken'>('all');
	let filterKind = $state<'all' | 'page' | 'layout' | 'server' | 'endpoint'>('all');
	let selectedRoute = $state<any | null>(null);
	let modalOpen = $state(false);
	let analyzeMode = $state(false);
	let analyses = $state<any[]>([]);
	let analyzeLoading = $state(false);
	let showOpsLog = $state(false);
	let showInspector = $state(false);

	$effect(() => {
		routes = Array.isArray(data.routes) ? data.routes : [];
	});

	let filteredRoutes = $derived.by(() => {
		let result = routes;

		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			result = result.filter(
				(r: any) =>
					r.path?.toLowerCase().includes(q) ||
					r.id?.toLowerCase().includes(q) ||
					r.kind?.toLowerCase().includes(q) ||
					r.group?.toLowerCase().includes(q)
			);
		}

		if (filterHealth !== 'all') {
			result = result.filter((r: any) => r.errorState === filterHealth);
		}

		if (filterKind !== 'all') {
			result = result.filter((r: any) => r.kind === filterKind);
		}

		return result;
	});

	let groupedRoutes = $derived.by(() => {
		const groups: Record<string, any[]> = {};
		for (const route of filteredRoutes) {
			const group = route.group || '(root)';
			if (!groups[group]) groups[group] = [];
			groups[group].push(route);
		}
		// Sort groups alphabetically, but (app) first
		const sorted: [string, any[]][] = Object.entries(groups).sort(([a], [b]) => {
			if (a === '(app)') return -1;
			if (b === '(app)') return 1;
			return a.localeCompare(b);
		});
		return sorted;
	});

	let stats = $derived({
		total: routes.length,
		filtered: filteredRoutes.length,
		healthy: routes.filter((r: any) => r.errorState === 'healthy' || !r.errorState).length,
		flaky: routes.filter((r: any) => r.errorState === 'flaky').length,
		broken: routes.filter((r: any) => r.errorState === 'broken').length,
		withLoad: routes.filter((r: any) => r.hasLoad).length,
		withActions: routes.filter((r: any) => r.hasActions).length,
		withAi: routes.filter((r: any) => r.hasAiImports).length,
		pages: routes.filter((r: any) => r.kind === 'page' || !r.kind).length,
		endpoints: routes.filter((r: any) => r.kind === 'endpoint' || r.kind === 'server').length
	});

	let errorClusters = $derived(Array.isArray((data as any).errorClusters) ? (data as any).errorClusters : []);
	let serverStats = $derived((data as any).stats as { totalRoutes: number; totalClusters: number; errorCount: number; warningCount: number } ?? { totalRoutes: 0, totalClusters: 0, errorCount: 0, warningCount: 0 });
	let showClusters = $state(false);

	// SSE Real-Time Updates
	let eventSource: EventSource | null = null;

	$effect(() => {
		eventSource = new EventSource('/api/routes/events');

		eventSource.addEventListener('message', (event) => {
			try {
				const msg = JSON.parse(event.data);
				if (msg.type === 'health_change') {
					updateRouteHealth(msg.routeId, msg.newStatus, msg.reason);
				} else if (msg.type === 'error_count_change') {
					updateRouteErrorCount(msg.routeId, msg.errorCount, msg.warningCount, msg.infoCount);
				}
			} catch {
				// ignore parse errors
			}
		});

		eventSource.addEventListener('error', () => {
			// auto-reconnect handled by EventSource
		});

		return () => {
			eventSource?.close();
		};
	});

	function updateRouteHealth(routeId: string, newStatus: string, _reason?: string): void {
		const idx = routes.findIndex((r: any) => r.id === routeId);
		if (idx === -1) return;
		const errorState =
			newStatus === 'healthy' ? 'healthy' : newStatus === 'flaky' ? 'flaky' : 'broken';
		routes[idx] = { ...routes[idx], status: newStatus, errorState };
		routes = routes;
	}

	function updateRouteErrorCount(
		routeId: string,
		errorCount: number,
		warningCount?: number,
		infoCount?: number
	): void {
		const idx = routes.findIndex((r: any) => r.id === routeId);
		if (idx === -1) return;
		routes[idx] = {
			...routes[idx],
			errorCount,
			warningCount: warningCount ?? routes[idx].warningCount,
			infoCount: infoCount ?? routes[idx].infoCount
		};
		routes = routes;
	}

	// Interaction Logging
	type InteractionType = 'view' | 'navigate' | 'analyze' | 'patch_apply';

	async function logInteraction(
		routeId: string,
		interactionType: InteractionType,
		metadata?: Record<string, any>
	): Promise<void> {
		try {
			await fetch(`/api/routes/${encodeURIComponent(routeId)}/interactions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ interaction_type: interactionType, metadata: metadata || {} })
			});
		} catch {
			// Don't block UI on logging errors
		}
	}

	function openRouteModal(route: any) {
		selectedRoute = route;
		modalOpen = true;
		logInteraction(route.id, 'view');
	}

	function closeModal() {
		modalOpen = false;
		selectedRoute = null;
		analyzeMode = false;
		analyses = [];
	}

	function handleNavigate(route: any) {
		logInteraction(route.id, 'navigate', { path: route.path });
		window.location.href = route.path;
	}

	async function handleAnalyze(route: any) {
		logInteraction(route.id, 'analyze');
		analyzeMode = true;
		analyzeLoading = true;
		analyses = [];
		try {
			const res = await fetch(
				`/api/routes/${encodeURIComponent(route.id)}/error-brain-analyses?limit=5`
			);
			if (res.ok) {
				const data = await res.json();
				analyses = Array.isArray(data.data) ? data.data : [];
			}
		} catch {
			// silently fail — modal still usable
		} finally {
			analyzeLoading = false;
		}
	}

	function handleOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeModal();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && modalOpen) closeModal();
	}

	function healthIcon(state?: string): string {
		if (state === 'broken') return '[!!]';
		if (state === 'flaky') return '[??]';
		return '[OK]';
	}

	function healthClass(state?: string): string {
		if (state === 'broken') return 'health-broken';
		if (state === 'flaky') return 'health-flaky';
		return 'health-ok';
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<main class="nes-command-center">
	<!-- Header -->
	<div class="nes-header">
		<h1>NES COMMAND CENTER</h1>
		<p class="subtitle">// ROUTE MONITORING SYSTEM v2.0</p>
	</div>

	<!-- Stats Bar -->
	<div class="stats-bar">
		<div class="stat-box">
			<span class="stat-label">TOTAL</span>
			<span class="stat-value">{stats.total}</span>
		</div>
		<div class="stat-box">
			<span class="stat-label">SHOWING</span>
			<span class="stat-value">{stats.filtered}</span>
		</div>
		<div class="stat-box health-ok">
			<span class="stat-label">HEALTHY</span>
			<span class="stat-value">{stats.healthy}</span>
		</div>
		<div class="stat-box health-flaky">
			<span class="stat-label">FLAKY</span>
			<span class="stat-value">{stats.flaky}</span>
		</div>
		<div class="stat-box health-broken">
			<span class="stat-label">BROKEN</span>
			<span class="stat-value">{stats.broken}</span>
		</div>
		<div class="stat-box stat-feature">
			<span class="stat-label">PAGES</span>
			<span class="stat-value">{stats.pages}</span>
		</div>
		<div class="stat-box stat-feature">
			<span class="stat-label">API</span>
			<span class="stat-value">{stats.endpoints}</span>
		</div>
		<div class="stat-box stat-ai">
			<span class="stat-label">AI</span>
			<span class="stat-value">{stats.withAi}</span>
		</div>
	</div>

	<!-- Capability Bar -->
	<div class="capability-bar">
		<span class="cap-item">{stats.withLoad} with load()</span>
		<span class="cap-item">{stats.withActions} with actions</span>
		<span class="cap-item cap-ai">{stats.withAi} AI-powered</span>
		{#if serverStats.totalClusters > 0}
			<button class="cap-item cap-clusters" onclick={() => (showClusters = !showClusters)}>
				{serverStats.totalClusters} error clusters ({serverStats.errorCount}E / {serverStats.warningCount}W)
				{showClusters ? '[-]' : '[+]'}
			</button>
		{/if}
		<button class="cap-item cap-ops" onclick={() => (showOpsLog = !showOpsLog)}>
			{showOpsLog ? '[-] HIDE OPS LOG' : '[+] OPS LOG'}
		</button>
		<button class="cap-item cap-ops" onclick={() => {
			if (selectedRoute) {
				decisionRoute = { path: selectedRoute.path ?? selectedRoute.id, reason: selectedRoute.errorState === 'broken' ? 'Route is broken' : selectedRoute.errorState === 'flaky' ? 'Route is flaky' : 'Routine review', decision: null };
				showDecisionModal = true;
			}
		}} disabled={!selectedRoute}>
			DECIDE
		</button>
	</div>

	<!-- Error Clusters Panel (collapsible) -->
	{#if showClusters && errorClusters.length > 0}
		<div class="clusters-panel">
			<div class="clusters-header">
				<span class="clusters-title">ERROR CLUSTERS</span>
				<span class="clusters-count">{errorClusters.length} clusters</span>
			</div>
			{#each errorClusters.slice(0, 20) as cluster}
				<div class="cluster-row cluster-{cluster.severity}">
					<span class="cluster-severity">[{cluster.severity.toUpperCase()}]</span>
					<span class="cluster-tool">{cluster.tool}</span>
					<span class="cluster-code">{cluster.code}</span>
					<span class="cluster-message">{cluster.message}</span>
					<span class="cluster-count">{cluster.count}x</span>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Operations Log Panel (collapsible) -->
	{#if showOpsLog}
		<div class="ops-log-panel">
			<RouteOperationsDashboard />
		</div>
	{/if}

	<!-- Search & Filters -->
	<div class="filters-bar">
		<div class="search-box">
			<span class="search-prefix">&gt;</span>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="SEARCH ROUTES..."
				class="search-input"
			/>
		</div>
		<div class="filter-group">
			<select bind:value={filterHealth} class="nes-select">
				<option value="all">ALL HEALTH</option>
				<option value="healthy">HEALTHY</option>
				<option value="flaky">FLAKY</option>
				<option value="broken">BROKEN</option>
			</select>
			<select bind:value={filterKind} class="nes-select">
				<option value="all">ALL TYPES</option>
				<option value="page">PAGES</option>
				<option value="server">SERVER</option>
				<option value="endpoint">API</option>
				<option value="layout">LAYOUTS</option>
			</select>
		</div>
	</div>

	<!-- Route Groups -->
	{#if groupedRoutes.length > 0}
		{#each groupedRoutes as [groupName, groupRoutes]}
			<div class="route-group">
				<div class="group-header">
					<span class="group-name">{groupName}</span>
					<span class="group-count">{groupRoutes.length} routes</span>
				</div>
				<div class="route-list">
					{#each groupRoutes as route (route.id)}
						<button
							class="route-row"
							class:has-errors={route.errorCount > 0}
							class:is-broken={route.errorState === 'broken'}
							class:is-flaky={route.errorState === 'flaky'}
							onclick={() => openRouteModal(route)}
						>
							<span class="route-health {healthClass(route.errorState)}">{healthIcon(route.errorState)}</span>
							<span class="route-path">{route.path}</span>
							<span class="route-kind">[{route.kind || 'page'}]</span>
							{#if route.errorCount > 0}
								<span class="route-errors">{route.errorCount}E</span>
							{/if}
							{#if route.warningCount > 0}
								<span class="route-warnings">{route.warningCount}W</span>
							{/if}
							{#if route.tags?.length}
								<span class="route-tags">
									{#each route.tags.slice(0, 3) as tag}
										<span class="tag">{tag}</span>
									{/each}
								</span>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{/each}
	{:else}
		<div class="empty-state">
			<p>NO ROUTES FOUND</p>
			{#if searchQuery || filterHealth !== 'all' || filterKind !== 'all'}
				<p class="hint">Try adjusting your filters</p>
			{:else}
				<p class="hint">Route data is loading or unavailable</p>
			{/if}
		</div>
	{/if}
</main>

<!-- Route Detail Modal -->
{#if modalOpen && selectedRoute}
	<div
		class="modal-overlay"
		onclick={handleOverlayClick}
		role="presentation"
		tabindex="-1"
	>
		<div class="nes-modal" role="dialog" aria-modal="true" aria-label="Route Details">
			<!-- Modal Header -->
			<div class="modal-header">
				<div class="modal-title">ROUTE DETAILS</div>
				<button class="modal-close" onclick={closeModal}>[X]</button>
			</div>

			<!-- Modal Body -->
			<div class="modal-body">
				<div class="detail-section">
					<div class="detail-label">PATH</div>
					<div class="detail-value path-value">{selectedRoute.path}</div>
				</div>

				<div class="detail-row">
					<div class="detail-section">
						<div class="detail-label">TYPE</div>
						<div class="detail-value">{selectedRoute.kind || 'page'}</div>
					</div>
					<div class="detail-section">
						<div class="detail-label">GROUP</div>
						<div class="detail-value">{selectedRoute.group || '(root)'}</div>
					</div>
					<div class="detail-section">
						<div class="detail-label">STATUS</div>
						<div class="detail-value {healthClass(selectedRoute.errorState)}">
							{healthIcon(selectedRoute.errorState)} {selectedRoute.errorState || 'healthy'}
						</div>
					</div>
				</div>

				{#if selectedRoute.errorCount > 0 || selectedRoute.warningCount > 0}
					<div class="detail-section">
						<div class="detail-label">DIAGNOSTICS</div>
						<div class="diagnostics-bar">
							{#if selectedRoute.errorCount > 0}
								<span class="diag-errors">{selectedRoute.errorCount} ERRORS</span>
							{/if}
							{#if selectedRoute.warningCount > 0}
								<span class="diag-warnings">{selectedRoute.warningCount} WARNINGS</span>
							{/if}
							{#if selectedRoute.infoCount > 0}
								<span class="diag-info">{selectedRoute.infoCount} INFO</span>
							{/if}
						</div>
					</div>
				{/if}

				{#if selectedRoute.lastErrorMessage}
					<div class="detail-section">
						<div class="detail-label">LAST ERROR</div>
						<div class="error-box">
							<div class="error-text">{selectedRoute.lastErrorMessage}</div>
							{#if selectedRoute.lastErrorAt}
								<div class="error-time">{new Date(selectedRoute.lastErrorAt).toLocaleString()}</div>
							{/if}
						</div>
					</div>
				{/if}

				{#if selectedRoute.file}
					<div class="detail-section">
						<div class="detail-label">FILE</div>
						<div class="detail-value file-value">{selectedRoute.file}</div>
					</div>
				{/if}

				<div class="detail-row">
					{#if selectedRoute.hasLoad}
						<span class="feature-badge">HAS LOAD</span>
					{/if}
					{#if selectedRoute.hasActions}
						<span class="feature-badge">HAS ACTIONS</span>
					{/if}
					{#if selectedRoute.hasAiImports}
						<span class="feature-badge ai">AI IMPORTS</span>
					{/if}
				</div>

				{#if selectedRoute.tags?.length}
					<div class="detail-section">
						<div class="detail-label">TAGS</div>
						<div class="tags-list">
							{#each selectedRoute.tags as tag}
								<span class="tag">{tag}</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if selectedRoute.suggestionCount > 0}
					<div class="detail-section">
						<div class="detail-label">SUGGESTIONS</div>
						<div class="detail-value">{selectedRoute.suggestionCount} available</div>
					</div>
				{/if}

				{#if selectedRoute.patchSuccessRate !== undefined && selectedRoute.patchSuccessRate !== null}
					<div class="detail-section">
						<div class="detail-label">PATCH SUCCESS</div>
						<div class="detail-value">{Math.round(selectedRoute.patchSuccessRate * 100)}%</div>
					</div>
				{/if}
			</div>

			<!-- Analyze Mode: Error-Brain Analysis History -->
			{#if analyzeMode}
				<div class="detail-section analyze-section" data-testid="analyze-panel">
					<div class="detail-label">ERROR-BRAIN ANALYSES</div>
					{#if analyzeLoading}
						<div class="detail-value analyze-loading">LOADING...</div>
					{:else if analyses.length === 0}
						<div class="detail-value analyze-empty">NO ANALYSES YET</div>
					{:else}
						{#each analyses as analysis}
							<div class="analysis-entry">
								<span class="analysis-phase">[{analysis.phase ?? 'unknown'}]</span>
								<span class="analysis-status">{analysis.status ?? 'pending'}</span>
								<span class="analysis-patches">{analysis.patches?.length ?? 0}P</span>
								<span class="analysis-date">{new Date(analysis.created_at).toLocaleDateString()}</span>
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			<!-- Modal Actions -->
			<div class="modal-actions">
				<button class="nes-btn primary" onclick={() => handleNavigate(selectedRoute)}>
					VISIT PAGE
				</button>
				{#if analyzeMode}
					<button class="nes-btn" onclick={() => { analyzeMode = false; analyses = []; }}>
						BACK
					</button>
				{:else}
					<button class="nes-btn" data-testid="analyze-btn" onclick={() => handleAnalyze(selectedRoute)}>
						ANALYZE
					</button>
				{/if}
				<button class="nes-btn" onclick={() => { showInspector = true; }}>
					INSPECT
				</button>
				<button class="nes-btn" onclick={closeModal}>
					CLOSE
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Route Inspector Modal (YoRHa-themed detail view) -->
<RouteInspectorModal bind:open={showInspector} route={selectedRoute ? { path: selectedRoute.path, kind: selectedRoute.kind ?? 'page', file: selectedRoute.file ?? '', summary: selectedRoute.summary ?? `Route: ${selectedRoute.path}`, category: selectedRoute.group, health: selectedRoute.errorState === 'healthy' ? 'green' : selectedRoute.errorState === 'flaky' ? 'yellow' : selectedRoute.errorState === 'broken' ? 'red' : undefined, errorCount: selectedRoute.errorCount, lastErrorMessage: selectedRoute.lastErrorMessage } : null} />

<RouteDecisionModal bind:open={showDecisionModal} bind:route={decisionRoute} onclose={() => { showDecisionModal = false; decisionRoute = null; }} />

<style>
	/* ── NES Command Center Theme ── */
	.nes-command-center {
		padding: 1.5rem;
		font-family: 'Courier New', 'Consolas', monospace;
		background: #0c0c0c;
		color: #33ff33;
		min-height: 100vh;
	}

	/* ── Header ── */
	.nes-header {
		text-align: center;
		padding: 1rem 0 1.5rem;
		border-bottom: 2px solid #33ff33;
		margin-bottom: 1.5rem;
	}

	.nes-header h1 {
		font-size: 1.8rem;
		color: #33ff33;
		letter-spacing: 0.3em;
		margin: 0;
		text-shadow: 0 0 10px rgba(51, 255, 51, 0.5);
	}

	.subtitle {
		color: #1a9a1a;
		font-size: 0.8rem;
		margin: 0.5rem 0 0;
		letter-spacing: 0.15em;
	}

	/* ── Stats Bar ── */
	.stats-bar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.stat-box {
		border: 1px solid #33ff33;
		padding: 0.4rem 0.8rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 80px;
	}

	.stat-label {
		font-size: 0.65rem;
		color: #1a9a1a;
		letter-spacing: 0.1em;
	}

	.stat-value {
		font-size: 1.2rem;
		font-weight: bold;
	}

	.stat-box.health-ok { border-color: #33ff33; }
	.stat-box.health-flaky { border-color: #ffff33; color: #ffff33; }
	.stat-box.health-broken { border-color: #ff3333; color: #ff3333; }
	.stat-box.stat-feature { border-color: #3399ff; color: #3399ff; }
	.stat-box.stat-ai { border-color: #ff33ff; color: #ff33ff; }

	/* ── Capability Bar ── */
	.capability-bar {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
		padding: 0.4rem 0.75rem;
		background: #111;
		border: 1px solid #1a5a1a;
		font-size: 0.7rem;
		flex-wrap: wrap;
		align-items: center;
	}

	.cap-item {
		color: #1a9a1a;
		letter-spacing: 0.05em;
	}

	.cap-item.cap-ai {
		color: #ff33ff;
	}

	.cap-item.cap-clusters {
		color: #ffaa33;
		background: none;
		border: 1px solid #ffaa33;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		letter-spacing: inherit;
		margin-left: auto;
	}

	.cap-item.cap-clusters:hover {
		background: rgba(255, 170, 51, 0.1);
	}

	.cap-item.cap-ops {
		color: #3399ff;
		background: none;
		border: 1px solid #3399ff;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		letter-spacing: inherit;
	}

	.cap-item.cap-ops:hover {
		background: rgba(51, 153, 255, 0.1);
	}

	.ops-log-panel {
		margin-bottom: 1.5rem;
		border: 1px solid #3399ff;
		background: #0c0c0c;
		max-height: 600px;
		overflow-y: auto;
	}

	/* ── Error Clusters ── */
	.clusters-panel {
		margin-bottom: 1.5rem;
		border: 1px solid #664400;
		background: #0c0c0c;
	}

	.clusters-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.4rem 0.75rem;
		background: #1a1000;
		border-bottom: 1px solid #664400;
	}

	.clusters-title {
		font-weight: bold;
		font-size: 0.8rem;
		color: #ffaa33;
		letter-spacing: 0.1em;
	}

	.clusters-count {
		font-size: 0.7rem;
		color: #996600;
	}

	.cluster-row {
		display: flex;
		gap: 0.5rem;
		padding: 0.3rem 0.75rem;
		border-bottom: 1px solid #1a1000;
		font-size: 0.7rem;
		align-items: baseline;
	}

	.cluster-row:last-child {
		border-bottom: none;
	}

	.cluster-severity {
		font-weight: bold;
		flex-shrink: 0;
		width: 50px;
	}

	.cluster-row.cluster-error .cluster-severity { color: #ff3333; }
	.cluster-row.cluster-warning .cluster-severity { color: #ffff33; }
	.cluster-row.cluster-info .cluster-severity { color: #3399ff; }

	.cluster-tool {
		color: #666;
		flex-shrink: 0;
		width: 70px;
	}

	.cluster-code {
		color: #ffaa33;
		flex-shrink: 0;
	}

	.cluster-message {
		color: #999;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cluster-count {
		color: #666;
		flex-shrink: 0;
	}

	/* ── Filters ── */
	.filters-bar {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
		align-items: center;
	}

	.search-box {
		display: flex;
		align-items: center;
		border: 1px solid #33ff33;
		padding: 0.3rem 0.5rem;
		flex: 1;
		min-width: 200px;
	}

	.search-prefix {
		color: #33ff33;
		margin-right: 0.5rem;
		font-weight: bold;
	}

	.search-input {
		background: transparent;
		border: none;
		color: #33ff33;
		font-family: inherit;
		font-size: 0.85rem;
		outline: none;
		width: 100%;
		letter-spacing: 0.05em;
	}

	.search-input::placeholder {
		color: #1a6a1a;
	}

	.filter-group {
		display: flex;
		gap: 0.5rem;
	}

	.nes-select {
		background: #0c0c0c;
		color: #33ff33;
		border: 1px solid #33ff33;
		padding: 0.3rem 0.5rem;
		font-family: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		letter-spacing: 0.05em;
	}

	.nes-select:focus {
		outline: 1px solid #33ff33;
	}

	/* ── Route Groups ── */
	.route-group {
		margin-bottom: 1.5rem;
		border: 1px solid #1a5a1a;
	}

	.group-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: #111;
		border-bottom: 1px solid #1a5a1a;
	}

	.group-name {
		font-weight: bold;
		font-size: 0.85rem;
		letter-spacing: 0.1em;
		color: #33ff33;
	}

	.group-count {
		font-size: 0.7rem;
		color: #1a9a1a;
	}

	.route-list {
		display: flex;
		flex-direction: column;
	}

	/* ── Route Rows ── */
	.route-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		border: none;
		border-bottom: 1px solid #0a2a0a;
		background: transparent;
		color: #33ff33;
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: background-color 0.15s;
	}

	.route-row:hover {
		background: #112211;
	}

	.route-row:last-child {
		border-bottom: none;
	}

	.route-row.is-broken {
		border-left: 3px solid #ff3333;
	}

	.route-row.is-flaky {
		border-left: 3px solid #ffff33;
	}

	.route-health {
		font-size: 0.7rem;
		font-weight: bold;
		flex-shrink: 0;
		width: 32px;
	}

	.health-ok { color: #33ff33; }
	.health-flaky { color: #ffff33; }
	.health-broken { color: #ff3333; }

	.route-path {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.route-kind {
		color: #1a9a1a;
		font-size: 0.7rem;
		flex-shrink: 0;
	}

	.route-errors {
		background: #ff3333;
		color: #000;
		padding: 0.1rem 0.3rem;
		font-size: 0.65rem;
		font-weight: bold;
		flex-shrink: 0;
	}

	.route-warnings {
		background: #ffff33;
		color: #000;
		padding: 0.1rem 0.3rem;
		font-size: 0.65rem;
		font-weight: bold;
		flex-shrink: 0;
	}

	.route-tags {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.tag {
		background: #1a3a1a;
		color: #33ff33;
		padding: 0.1rem 0.3rem;
		font-size: 0.6rem;
		letter-spacing: 0.05em;
	}

	/* ── Empty State ── */
	.empty-state {
		text-align: center;
		padding: 3rem;
		border: 1px dashed #1a5a1a;
	}

	.empty-state p {
		margin: 0.5rem 0;
	}

	.hint {
		color: #1a6a1a;
		font-size: 0.8rem;
	}

	/* ── Modal Overlay ── */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 1rem;
	}

	/* ── NES Modal ── */
	.nes-modal {
		background: #0c0c0c;
		border: 2px solid #33ff33;
		max-width: 600px;
		width: 100%;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 0 20px rgba(51, 255, 51, 0.2), inset 0 0 20px rgba(51, 255, 51, 0.05);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #33ff33;
		background: #111;
	}

	.modal-title {
		font-weight: bold;
		font-size: 0.9rem;
		letter-spacing: 0.15em;
		color: #33ff33;
	}

	.modal-close {
		background: none;
		border: 1px solid #33ff33;
		color: #33ff33;
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0.2rem 0.5rem;
	}

	.modal-close:hover {
		background: #33ff33;
		color: #000;
	}

	.modal-body {
		padding: 1rem;
		overflow-y: auto;
		flex: 1;
	}

	/* ── Detail Sections ── */
	.detail-section {
		margin-bottom: 0.75rem;
	}

	.detail-label {
		font-size: 0.65rem;
		color: #1a9a1a;
		letter-spacing: 0.15em;
		margin-bottom: 0.2rem;
	}

	.detail-value {
		font-size: 0.85rem;
		color: #33ff33;
	}

	.path-value {
		font-size: 1rem;
		font-weight: bold;
		color: #55ff55;
	}

	.file-value {
		font-size: 0.75rem;
		color: #1a9a1a;
		word-break: break-all;
	}

	.detail-row {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
	}

	/* ── Diagnostics ── */
	.diagnostics-bar {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.diag-errors {
		background: #ff3333;
		color: #000;
		padding: 0.15rem 0.4rem;
		font-size: 0.7rem;
		font-weight: bold;
	}

	.diag-warnings {
		background: #ffff33;
		color: #000;
		padding: 0.15rem 0.4rem;
		font-size: 0.7rem;
		font-weight: bold;
	}

	.diag-info {
		background: #3399ff;
		color: #000;
		padding: 0.15rem 0.4rem;
		font-size: 0.7rem;
		font-weight: bold;
	}

	/* ── Error Box ── */
	.error-box {
		background: #1a0a0a;
		border-left: 3px solid #ff3333;
		padding: 0.5rem 0.75rem;
	}

	.error-text {
		color: #ff6666;
		font-size: 0.8rem;
		word-break: break-word;
	}

	.error-time {
		color: #663333;
		font-size: 0.7rem;
		margin-top: 0.25rem;
	}

	/* ── Feature Badges ── */
	.feature-badge {
		border: 1px solid #33ff33;
		color: #33ff33;
		padding: 0.15rem 0.4rem;
		font-size: 0.65rem;
		letter-spacing: 0.1em;
	}

	.feature-badge.ai {
		border-color: #ff33ff;
		color: #ff33ff;
	}

	.tags-list {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	/* ── Modal Actions ── */
	.analyze-section {
		border-top: 1px dashed #1a5a1a;
		margin-top: 0.5rem;
		padding-top: 0.5rem;
	}

	.analysis-entry {
		display: flex;
		gap: 0.75rem;
		font-size: 0.7rem;
		padding: 0.2rem 0;
		border-bottom: 1px solid #0a2a0a;
		color: #aaffaa;
	}

	.analysis-phase { color: #55ff55; }
	.analysis-status { color: #aaaaaa; }
	.analysis-patches { color: #ffaa33; }
	.analysis-date { color: #666; margin-left: auto; }

	.analyze-loading, .analyze-empty {
		font-size: 0.7rem;
		color: #666;
		padding: 0.25rem 0;
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-top: 1px solid #1a5a1a;
		background: #111;
	}

	.nes-btn {
		background: #0c0c0c;
		color: #33ff33;
		border: 1px solid #33ff33;
		padding: 0.4rem 0.8rem;
		font-family: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		letter-spacing: 0.1em;
		transition: all 0.15s;
	}

	.nes-btn:hover {
		background: #33ff33;
		color: #000;
	}

	.nes-btn.primary {
		background: #33ff33;
		color: #000;
		font-weight: bold;
	}

	.nes-btn.primary:hover {
		background: #55ff55;
	}
</style>
