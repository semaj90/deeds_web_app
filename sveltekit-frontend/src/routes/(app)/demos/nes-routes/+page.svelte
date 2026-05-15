<script lang="ts">
	import type { PageData } from './$types';
	import RouteInspectorModal from '$lib/components/RouteInspectorModal.svelte';

	const { data }: { data: PageData } = $props();

	let routes = $state<any[]>([]);
	let searchQuery = $state('');
	let filterKind = $state<'all' | 'page' | 'layout' | 'server' | 'endpoint'>('all');
	let filterHealth = $state<'all' | 'healthy' | 'flaky' | 'broken'>('all');
	let selectedRoute = $state<any | null>(null);
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

	let stats = $derived({
		total: routes.length,
		filtered: filteredRoutes.length,
		pages: routes.filter((r: any) => r.kind === 'page' || !r.kind).length,
		endpoints: routes.filter((r: any) => r.kind === 'endpoint' || r.kind === 'server').length,
		layouts: routes.filter((r: any) => r.kind === 'layout').length,
		healthy: routes.filter((r: any) => r.errorState === 'healthy' || !r.errorState).length,
		flaky: routes.filter((r: any) => r.errorState === 'flaky').length,
		broken: routes.filter((r: any) => r.errorState === 'broken').length,
		withAi: routes.filter((r: any) => r.hasAiImports).length,
		filesResolved: routes.filter((r: any) => r.file).length
	});

	let kindCounts = $derived({
		all: routes.length,
		page: routes.filter((r: any) => r.kind === 'page' || !r.kind).length,
		endpoint: routes.filter((r: any) => r.kind === 'endpoint' || r.kind === 'server').length,
		layout: routes.filter((r: any) => r.kind === 'layout').length
	});

	function openRoute(route: any) {
		selectedRoute = route;
		showInspector = true;
	}

	function getCardIcon(route: any): string {
		if (route.kind === 'endpoint' || route.kind === 'server') return 'endpoint';
		if (route.kind === 'layout') return 'layout';
		if (route.hasAiImports) return 'ai';
		if (route.errorState === 'broken') return 'broken';
		return 'page';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && showInspector) {
			showInspector = false;
			selectedRoute = null;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="nes-routes-layout">
	<!-- Left Sidebar -->
	<aside class="nes-sidebar">
		<div class="sidebar-section">
			<h3 class="sidebar-label">Filters</h3>
			<div class="search-field">
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search..."
					class="nes-search"
				/>
			</div>
		</div>

		<div class="sidebar-section">
			<h3 class="sidebar-label">Categories</h3>
			<span class="sidebar-stat">{stats.total} Routes</span>
			<div class="sidebar-filters">
				<button class="sidebar-btn" class:active={filterKind === 'all'} onclick={() => filterKind = 'all'}>
					All ({kindCounts.all})
				</button>
				<button class="sidebar-btn" class:active={filterKind === 'page'} onclick={() => filterKind = 'page'}>
					Pages ({kindCounts.page})
				</button>
				<button class="sidebar-btn" class:active={filterKind === 'endpoint'} onclick={() => filterKind = 'endpoint'}>
					Endpoints ({kindCounts.endpoint})
				</button>
				<button class="sidebar-btn" class:active={filterKind === 'layout'} onclick={() => filterKind = 'layout'}>
					Layouts ({kindCounts.layout})
				</button>
			</div>
		</div>

		<div class="sidebar-section">
			<h3 class="sidebar-label">Health</h3>
			<div class="sidebar-filters">
				<button class="sidebar-btn" class:active={filterHealth === 'all'} onclick={() => filterHealth = 'all'}>
					All
				</button>
				<button class="sidebar-btn health-ok" class:active={filterHealth === 'healthy'} onclick={() => filterHealth = 'healthy'}>
					Healthy ({stats.healthy})
				</button>
				<button class="sidebar-btn health-flaky" class:active={filterHealth === 'flaky'} onclick={() => filterHealth = 'flaky'}>
					Flaky ({stats.flaky})
				</button>
				<button class="sidebar-btn health-broken" class:active={filterHealth === 'broken'} onclick={() => filterHealth = 'broken'}>
					Broken ({stats.broken})
				</button>
			</div>
		</div>

		<div class="sidebar-section sidebar-stats">
			<h3 class="sidebar-label">ShieldScope</h3>
			<div class="stat-row">
				<span class="stat-key">Total</span>
				<span class="stat-val">{stats.total}</span>
			</div>
			<div class="stat-row">
				<span class="stat-key">Routes</span>
				<span class="stat-val">{stats.filtered}</span>
			</div>
			<div class="stat-row">
				<span class="stat-key">Files Resolved</span>
				<span class="stat-val">{stats.filesResolved}</span>
			</div>
			<div class="stat-row">
				<span class="stat-key">AI-Powered</span>
				<span class="stat-val stat-ai">{stats.withAi}</span>
			</div>
		</div>
	</aside>

	<!-- Main Card Grid -->
	<main class="nes-main">
		<div class="nes-topbar">
			<h1 class="nes-title">NES ROUTE EXPLORER</h1>
			<span class="nes-subtitle">{filteredRoutes.length} of {stats.total} routes</span>
		</div>

		{#if filteredRoutes.length > 0}
			<div class="card-grid">
				{#each filteredRoutes as route (route.id ?? route.path)}
					{@const icon = getCardIcon(route)}
					<button class="route-card" class:card-broken={route.errorState === 'broken'} class:card-flaky={route.errorState === 'flaky'} onclick={() => openRoute(route)}>
						<div class="card-icon-wrap">
							{#if icon === 'endpoint'}
								<svg class="card-svg" viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="5" y="6" width="2" height="2" fill="currentColor"/><rect x="9" y="6" width="2" height="2" fill="currentColor"/><line x1="4" y1="10" x2="12" y2="10" stroke="currentColor" stroke-width="1"/></svg>
							{:else if icon === 'layout'}
								<svg class="card-svg" viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="12" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="1"/><line x1="6" y1="5" x2="6" y2="14" stroke="currentColor" stroke-width="1"/></svg>
							{:else if icon === 'ai'}
								<svg class="card-svg" viewBox="0 0 16 16"><circle cx="8" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 12c0-2.2 1.8-4 4-4s4 1.8 4 4" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="6" y="1" width="4" height="2" fill="currentColor"/></svg>
							{:else if icon === 'broken'}
								<svg class="card-svg card-svg-broken" viewBox="0 0 16 16"><line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="2"/><line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" stroke-width="2"/></svg>
							{:else}
								<svg class="card-svg" viewBox="0 0 16 16"><rect x="3" y="1" width="10" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="5" y1="4" x2="11" y2="4" stroke="currentColor" stroke-width="1"/><line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1"/><line x1="5" y1="10" x2="9" y2="10" stroke="currentColor" stroke-width="1"/></svg>
							{/if}
						</div>
						<span class="card-kind">{route.kind || 'page'}</span>
						<span class="card-path">{route.path}</span>
						{#if route.errorCount > 0}
							<span class="card-badge">{route.errorCount}E</span>
						{/if}
						{#if route.group}
							<span class="card-group">/{route.group}</span>
						{/if}
					</button>
				{/each}
			</div>
		{:else}
			<div class="empty-state">
				<p>NO ROUTES FOUND</p>
				<p class="hint">Try adjusting your filters</p>
			</div>
		{/if}
	</main>
</div>

<!-- Route Inspector Modal (matching screenshot) -->
<RouteInspectorModal
	bind:open={showInspector}
	route={selectedRoute ? {
		path: selectedRoute.path,
		kind: selectedRoute.kind ?? 'page',
		file: selectedRoute.file ?? '',
		summary: selectedRoute.summary ?? `Client-side rendered ${selectedRoute.kind || 'page'} component.`,
		category: selectedRoute.group,
		version: 'v1',
		requiredPackages: ['svelte', 'sveltekit'],
		relatedRoutes: routes
			.filter((r: any) => r.group === selectedRoute.group && r.path !== selectedRoute.path)
			.slice(0, 3)
			.map((r: any) => r.path),
		health: selectedRoute.errorState === 'healthy' ? 'green' : selectedRoute.errorState === 'flaky' ? 'yellow' : selectedRoute.errorState === 'broken' ? 'red' : undefined,
		errorCount: selectedRoute.errorCount,
		lastErrorMessage: selectedRoute.lastErrorMessage
	} : null}
/>

<style>
	/* ── Layout ── */
	.nes-routes-layout {
		display: flex;
		min-height: 100vh;
		background: #0d0d2a;
		color: #c0c0ff;
		font-family: 'Press Start 2P', 'Courier New', monospace;
	}

	/* ── Sidebar ── */
	.nes-sidebar {
		width: 220px;
		min-width: 220px;
		background: #0a0a1f;
		border-right: 2px solid #2a2a5a;
		padding: 1rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		overflow-y: auto;
		max-height: 100vh;
		position: sticky;
		top: 0;
	}

	.sidebar-section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.sidebar-label {
		font-size: 0.55rem;
		color: #6060a0;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		margin: 0;
	}

	.sidebar-stat {
		font-size: 0.6rem;
		color: #8080c0;
	}

	.nes-search {
		width: 100%;
		background: #12122a;
		border: 1px solid #2a2a5a;
		color: #c0c0ff;
		padding: 0.35rem 0.5rem;
		font-family: inherit;
		font-size: 0.6rem;
		outline: none;
	}
	.nes-search:focus {
		border-color: #4040c0;
	}
	.nes-search::placeholder {
		color: #3a3a6a;
	}

	.sidebar-filters {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.sidebar-btn {
		background: transparent;
		border: 1px solid transparent;
		color: #8080a0;
		font-family: inherit;
		font-size: 0.5rem;
		padding: 0.25rem 0.4rem;
		text-align: left;
		cursor: pointer;
		transition: all 0.15s;
	}
	.sidebar-btn:hover {
		color: #c0c0ff;
		border-color: #2a2a5a;
	}
	.sidebar-btn.active {
		color: #e0e0ff;
		background: #1a1a3a;
		border-color: #4040c0;
	}
	.sidebar-btn.health-ok.active { border-color: #40c040; color: #80ff80; }
	.sidebar-btn.health-flaky.active { border-color: #c0c040; color: #ffff80; }
	.sidebar-btn.health-broken.active { border-color: #c04040; color: #ff8080; }

	.sidebar-stats {
		border-top: 1px solid #1a1a3a;
		padding-top: 0.75rem;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.5rem;
		padding: 0.15rem 0;
	}
	.stat-key { color: #6060a0; }
	.stat-val { color: #c0c0ff; font-weight: bold; }
	.stat-val.stat-ai { color: #ff80ff; }

	/* ── Main Content ── */
	.nes-main {
		flex: 1;
		padding: 1rem 1.25rem;
		overflow-y: auto;
	}

	.nes-topbar {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 2px solid #2a2a5a;
	}

	.nes-title {
		font-size: 0.9rem;
		color: #c0c0ff;
		letter-spacing: 0.2em;
		margin: 0;
		text-shadow: 0 0 10px rgba(64, 64, 192, 0.4);
	}

	.nes-subtitle {
		font-size: 0.55rem;
		color: #6060a0;
	}

	/* ── Card Grid ── */
	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 0.75rem;
	}

	.route-card {
		background: #12122e;
		border: 2px solid #2a2a5a;
		padding: 0.75rem 0.6rem 0.5rem;
		cursor: pointer;
		text-align: center;
		font-family: inherit;
		color: #c0c0ff;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		transition: all 0.15s;
		min-height: 110px;
	}
	.route-card:hover {
		border-color: #4040c0;
		background: #1a1a3a;
		box-shadow: 0 0 12px rgba(64, 64, 192, 0.25);
	}
	.route-card.card-broken {
		border-color: #6a2020;
	}
	.route-card.card-broken:hover {
		border-color: #c04040;
		box-shadow: 0 0 12px rgba(192, 64, 64, 0.25);
	}
	.route-card.card-flaky {
		border-color: #5a5a20;
	}

	.card-icon-wrap {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 0.15rem;
	}

	.card-svg {
		width: 28px;
		height: 28px;
		color: #6080e0;
		image-rendering: pixelated;
	}
	.card-svg-broken {
		color: #e04040;
	}

	.card-kind {
		font-size: 0.45rem;
		color: #6060a0;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	.card-path {
		font-size: 0.5rem;
		color: #a0a0e0;
		word-break: break-all;
		line-height: 1.3;
	}

	.card-badge {
		font-size: 0.4rem;
		background: #4a1a1a;
		color: #ff6060;
		padding: 0.1rem 0.3rem;
		border: 1px solid #6a2020;
	}

	.card-group {
		font-size: 0.4rem;
		color: #4a4a7a;
	}

	/* ── Empty State ── */
	.empty-state {
		text-align: center;
		padding: 3rem;
		border: 1px dashed #2a2a5a;
	}
	.empty-state p { margin: 0.5rem 0; font-size: 0.7rem; }
	.hint { color: #4a4a7a; font-size: 0.6rem; }

	/* ── Responsive ── */
	@media (max-width: 768px) {
		.nes-routes-layout {
			flex-direction: column;
		}
		.nes-sidebar {
			width: 100%;
			min-width: unset;
			max-height: unset;
			position: static;
			flex-direction: row;
			flex-wrap: wrap;
			border-right: none;
			border-bottom: 2px solid #2a2a5a;
		}
		.card-grid {
			grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		}
	}
</style>
