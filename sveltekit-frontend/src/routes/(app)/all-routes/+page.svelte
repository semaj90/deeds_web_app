<script lang="ts">
	// @ts-nocheck
	import { onDestroy, onMount } from 'svelte';
	import type { PageData } from './$types';

	// ─────────────────────────────────────
	// Props & Data
	// ─────────────────────────────────────
	const { data }: { data: PageData } = $props();

	// Make routes reactive so SSE updates trigger re-renders
	// Initialize from server data
	let routes = $state<any[]>([]);

	// Initialize routes from data on mount
	$effect(() => {
		if (data.routes) {
			routes = data.routes;
		}
	});

	// Phase 10: Real-Time Updates (SSE)
	// ─────────────────────────────────────

	let eventSource: EventSource | null = null;

	/**
	 * Task 10.3: Update UI on health change
	 * Create EventSource connection in all-routes page
	 * Listen for 'message' events from SSE endpoint
	 * Update route card health indicator in real-time
	 */
	onMount(() => {
		// Connect to SSE endpoint
		eventSource = new EventSource('/api/routes/events');

		eventSource.addEventListener('message', (event) => {
			try {
				const data = JSON.parse(event.data);

				if (data.type === 'connected') {
					console.log('[SSE] Connected to real-time updates');
				} else if (data.type === 'health_change') {
					console.log(`[SSE] Health change: ${data.routeId} → ${data.newStatus}`);
					updateRouteHealth(data.routeId, data.newStatus, data.reason);
				} else if (data.type === 'error_count_change') {
					console.log(`[SSE] Error count change: ${data.routeId} → ${data.errorCount} errors`);
					updateRouteErrorCount(data.routeId, data.errorCount, data.warningCount, data.infoCount);
				}
			} catch (error) {
				console.error('[SSE] Error parsing message:', error);
			}
		});

		eventSource.addEventListener('error', (error) => {
			console.error('[SSE] Connection error - will auto-reconnect:', error);
		});

		console.log('[SSE] EventSource connection established');
	});

	onDestroy(() => {
		if (eventSource) {
			eventSource.close();
			console.log('[SSE] EventSource connection closed');
		}
	});

	/**
	 * Update route health status in real-time
	 */
	function updateRouteHealth(routeId: string, newStatus: string, reason?: string): void {
		const routeIndex = routes.findIndex((r) => r.id === routeId);
		if (routeIndex === -1) {
			console.warn(`[SSE] Route ${ routeId } not found in routes array`);
			return;
		}

		// Map status to errorState
		const errorState =
			newStatus === 'healthy' ? 'healthy' : newStatus === 'flaky' ? 'flaky' : 'broken';

		// Update route
		routes[routeIndex] = {
			...routes[routeIndex],
			status: newStatus,
			errorState
		};

		// Trigger reactivity
		routes = routes;

		console.log(`[SSE] Updated route ${ routeId } health to ${newStatus}`);
	}

	/**
	 * Update route error counts in real-time
	 */
	function updateRouteErrorCount(
		routeId: string,
		errorCount: number,
		warningCount?: number,
		infoCount?: number
	): void {
		const routeIndex = routes.findIndex((r) => r.id === routeId);
		if (routeIndex === -1) {
			console.warn(`[SSE] Route ${routeId} not found in routes array`);
			return;
		}

		// Update route
		routes[routeIndex] = {
			...routes[routeIndex],
			errorCount,
			warningCount, warningCount || routes[routeIndex].warningCount,
			infoCount, infoCount || routes[routeIndex].infoCount
		};

		// Trigger reactivity
		routes = routes;

		console.log(`[SSE] Updated route ${routeId} error count to ${errorCount}`);
	}

	// ─────────────────────────────────────
	// Phase 7: Interaction Logging
	// ─────────────────────────────────────

	type InteractionType = 'view' | 'navigate' | 'analyze' | 'patch_apply';

	/**
	 * 7.1: Implement logInteraction() helper
	 * Creates async function that POSTs to /api/routes/:routeId/interactions
	 */
	async function logInteraction(
		routeId: string,
		interactionType: InteractionType,
		metadata?: Record<string, any>
	): Promise<void> {
		try {
			const response = await fetch(`/api/routes/${encodeURIComponent(routeId)}/interactions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ interaction_type: interactionType,
					metadata: metadata || {}
				})
			});

			if (!response.ok) {
				console.warn(`[Phase 7.1] Failed to log interaction: ${response.status}`);
				return;
			}

			console.log(`[Phase 7.1] Logged ${ interactionType } interaction for route ${routeId}`);
		} catch (error) {
			// Don't block UI on logging errors
			console.error(`[Phase 7.1] Error logging interaction:`, error);
		}
	}

	/**
	 * 7.2: Log route view interactions
	 * Call logInteraction('view') when route modal opens
	 */
	function handleRouteView(routeId: string): void {
		logInteraction(routeId, 'view');
	}

	/**
	 * 7.3: Log route navigate interactions
	 * Call logInteraction('navigate') when "Visit Page" button clicked
	 */
	function handleRouteNavigate(routeId: string, path: string): void {
		logInteraction(routeId, 'navigate', { path });

		window.location.href = path;
	}

	/**
	 * 7.4: Log error brain analyze interactions
	 * Call logInteraction('analyze') when error brain analysis starts
	 */
	function handleErrorBrainAnalyze(routeId: string): void {
		logInteraction(routeId, 'analyze');
	}

	/**
	 * 7.5: Log patch apply interactions
	 * Call logInteraction('patch_apply') when patch is applied
	 */
	function handlePatchApply(routeId: string, patchId: string): void {
		logInteraction(routeId, 'patch_apply', { patch_id: patchId });
	}
</script>

<main class="command-center">
	<h1>🎮 YoRHa Command Center</h1>

	<div class="debug-info">
		<h2>Debug Information</h2>
		<p><strong>Routes loaded:</strong> {data.routes?.length ?? 0}</p>
		<p><strong>Error clusters:</strong> {data.errorClusters?.length ?? 0}</p>
		<p><strong>Graph nodes:</strong> {data.graph?.nodes?.length ?? 0}</p>
		<p><strong>Shield data:</strong> {data.shieldData ? 'Loaded' : 'Not found'}</p>
		<p><strong>Error summary:</strong> {data.errorSummary ? 'Loaded' : 'Not found'}</p>
	</div>

	{#if routes && routes.length > 0}
		<div class="routes-list">
			<h2>Routes ({routes.length})</h2>
			<ul>
				{#each routes.slice(0, 10) as route}
					<li class="route-item" class:has-errors={route.errorCount && route.errorCount > 0}>
						<button
							class="route-info-btn"
							onclick={() => handleRouteView(route.id)}
							title="View route details"
						>
							<div class="route-info">
								<strong>{route.path}</strong>
								<span class="kind">{route.kind}</span>
								{#if route.status !== 'ok'}
									<span class="status {route.status}">{route.status}</span>
								{/if}
							</div>
							{#if route.lastErrorMessage}
								<div class="error-details">
									<span class="error-message">{route.lastErrorMessage}</span>
									{#if route.lastErrorAt}
										<span class="error-timestamp">{new Date(route.lastErrorAt).toLocaleString()}</span>
									{/if}
								</div>
							{/if}
						</button>
						<div class="route-actions">
							{#if route.errorCount}
								<span class="error-badge" title={`${route.errorCount} error${route.errorCount !== 1 ? 's' : ''}`}>
									{route.errorCount} error{route.errorCount !== 1 ? 's' : ''}
								</span>
							{/if}
							{#if route.warningCount}
								<span class="warning-badge" title={`${route.warningCount} warning${route.warningCount !== 1 ? 's' : ''}`}>
									{route.warningCount} warning{route.warningCount !== 1 ? 's' : ''}
								</span>
							{/if}
							{#if route.errorState}
								<span class="health-indicator" title={`Health, ${route.errorState}`}>
									{route.errorState === 'healthy' ? '✅' : route.errorState === 'flaky' ? '🟡' : '❌'}
								</span>
							{/if}
							<button
								class="action-btn"
								onclick={() => handleRouteNavigate(route.id: route.path)}
								title="Visit this route"
							>
								→ Visit
							</button>
							<button
								class="action-btn"
								onclick={() => handleErrorBrainAnalyze(route.id)}
								title="Analyze with error brain"
							>
								🧠 Analyze
							</button>
						</div>
					</li>
				{/each}
			</ul>
			{#if routes.length > 10}
				<p>... and {routes.length - 10} more routes</p>
			{/if}
		</div>
	{:else}
		<p>No routes loaded from server.</p>
	{/if}
</main>

<style>
	.command-center {
		padding: 2rem;
		font-family: 'Courier New', monospace;
		background: #000; color: #0f0;
		min-height: 100vh;
	}

	h1 {
		color: #ff0;
		text-align: center;
		font-size: 2rem;
		margin-bottom: 2rem;
	}

	.debug-info {
		background: #111; padding: 1rem;
		border: 1px solid #0f0;
		margin-bottom: 2rem;
	}

	.routes-list {
		background: #111; padding: 1rem;
		border: 1px solid #0f0;
	}

	.routes-list ul {
		list-style: none; padding: 0;
	}

	.route-item {
		padding: 0;
		border-bottom: 1px solid #333;
		border-left: 3px solid transparent;
		display: flex; gap: 1rem;
		align-items: center;
		justify-content: space-between;
		list-style: none; transition: border-left-color 0.2s;
	}

	/* Phase 8.2: Color-code route cards by health status */
	.route-item.has-errors {
		border-left-color: #f00;
	}

	.route-info-btn {
		background: none; border: none;
		color: #0f0; padding: 0.75rem;
		cursor: pointer; flex: 1;
		text-align: left; transition: background-color 0.2s;
		font-family: inherit;
	}

	.route-info-btn:hover {
		background-color: #1a1a1a;
	}

	.route-info-btn:focus {
		outline: 2px solid #0f0;
		outline-offset: -2px;
	}

	.route-info {
		display: flex; gap: 0.5rem;
		align-items: center;
	}

	/* Phase 8.3: Error details display */
	.error-details {
		display: flex;
		flex-direction: column; gap: 0.25rem;
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid #333;
		font-size: 0.75rem;
	}

	.error-message {
		color: #f88;
		font-style: italic;
		max-width: 400px; overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.error-timestamp {
		color: #888;
		font-size: 0.7rem;
	}

	.route-actions {
		display: flex; gap: 0.5rem;
		align-items: center;
	}

	.kind {
		background: #333; padding: 0.2rem 0.5rem;
		border-radius: 3px;
		font-size: 0.8rem;
	}

	.status {
		padding: 0.2rem 0.5rem;
		border-radius: 3px;
		font-size: 0.8rem;
	}

	.status.error { background: #f00; color: #000; }
	.status.warning { background: #ff0; color: #000; }

	/* Phase 8.1: Error count badge */
	.error-badge {
		background: #f00; color: #000;
		padding: 0.2rem 0.5rem;
		border-radius: 3px;
		font-size: 0.8rem;
		font-weight: bold;
	}

	/* Phase 8.1: Warning count badge */
	.warning-badge {
		background: #ff0; color: #000;
		padding: 0.2rem 0.5rem;
		border-radius: 3px;
		font-size: 0.8rem;
		font-weight: bold;
	}

	/* Phase 8.2: Health status indicator */
	.health-indicator {
		font-size: 1.2rem; cursor: help;
	}

	.action-btn {
		background: #0f0; color: #000;
		border: none; padding: 0.3rem 0.6rem;
		border-radius: 3px;
		font-size: 0.8rem;
		font-weight: bold; cursor: pointer;
		transition: background-color 0.2s;
	}

	.action-btn:hover {
		background: #0d0;
	}

	.action-btn:active {
		background: #0a0;
	}
</style>



