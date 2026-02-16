<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	let routes = $state<any[]>([]);
	let searchQuery = $state('');
	let filterHealth = $state<'all' | 'healthy' | 'flaky' | 'broken'>('all');
	let filterKind = $state<'all' | 'page' | 'layout' | 'server' | 'endpoint'>('all');
	let selectedRoute = $state<any | null>(null);
	let modalOpen = $state(false);

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
		broken: routes.filter((r: any) => r.errorState === 'broken').length
	});

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
	}

	function handleNavigate(route: any) {
		logInteraction(route.id, 'navigate', { path: route.path });
		window.location.href = route.path;
	}

	function handleAnalyze(route: any) {
		logInteraction(route.id, 'analyze');
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
	</div>

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

			<!-- Modal Actions -->
			<div class="modal-actions">
				<button class="nes-btn primary" onclick={() => handleNavigate(selectedRoute)}>
					VISIT PAGE
				</button>
				<button class="nes-btn" onclick={() => handleAnalyze(selectedRoute)}>
					ANALYZE
				</button>
				<button class="nes-btn" onclick={closeModal}>
					CLOSE
				</button>
			</div>
		</div>
	</div>
{/if}

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
