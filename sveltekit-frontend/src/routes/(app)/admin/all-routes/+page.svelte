<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import RouteOperationsDashboard from '$lib/components/RouteOperationsDashboard.svelte';
	import RouteInspectorModal from '$lib/components/RouteInspectorModal.svelte';
	import RouteDecisionModal from '$lib/components/RouteDecisionModal.svelte';
	import RoutesList from '$lib/components/RoutesList.svelte';
	import PhaseStatusPills from '$lib/components/PhaseStatusPills.svelte';
	import RouteInspectorDetectiveBoard from '$lib/components/RouteInspectorDetectiveBoard.svelte';
	import NESGraphRenderer from '$lib/components/NESGraphRenderer.svelte';
	import RouteInspectorWorking from '$lib/components/RouteInspectorWorking.svelte';
	import RouteAPIExplorer from '$lib/components/RouteAPIExplorer.svelte';
	import RouteTreeView from '$lib/components/RouteTreeView.svelte';
	import APITesterModal from '$lib/components/APITesterModal.svelte';
	import ArchivedRoutesPanel from '$lib/components/ArchivedRoutesPanel.svelte';
	import DevReviewPanel from '$lib/components/DevReviewPanel.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { RouteEndpoint } from '$lib/server/api-metadata-extractor';

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
	let showSimpleRoutes = $state(false);
	let showDetectiveBoard = $state(false);
	let showRouteGraph = $state(false);
	let showWorkingInspector = $state(false);
	let showErrorBrainHistory = $state(false);
	let errorBrainStatus = $state<{ totalErrors: number; affectedFiles: number; recentErrors: number; fixedCount: number; fixRate: number } | null>(null);
	let errorBrainRuns = $state<any[]>([]);
	let errorBrainLoading = $state(false);

	// New panels for comprehensive route exploration
	let showAPIExplorer = $state(false);
	let showRouteTree = $state(false);
	let showArchivedRoutes = $state(false);
	let showDemos = $state(false);
	let showDevReview = $state(false);
	let selectedEndpoint = $state<RouteEndpoint | null>(null);
	let apiTesterOpen = $state(false);

	// ── Loading + Client-Side Cache ──────────────────────────────────
	let metadataLoading = $state(true);
	let metadataProgress = $state(0);
	let metadataSource = $state<'cache' | 'network' | ''>('');

	const EMPTY_METADATA = {
		allEndpoints: [] as any[],
		activeAPI: [] as any[],
		archived: [] as any[],
		categories: [] as any[],
		stats: {
			totalRoutes: 0, activeRoutes: 0, archivedRoutes: 0,
			apiEndpoints: 0, pageServers: 0, pages: 0, categories: 0,
			methodCounts: { GET: 0, POST: 0, PUT: 0, DELETE: 0, PATCH: 0, load: 0, actions: 0 },
			groupCounts: { app: 0, dev: 0, admin: 0, api: 0, system: 0, other: 0, archived: 0 },
			authRequired: 0, sse: 0
		},
		crossRefs: [] as any[],
		deadRoutes: [] as any[]
	};

	const IDB_NAME = 'deeds-route-cache';
	const IDB_STORE = 'metadata';
	const IDB_KEY = 'route-metadata';
	const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	function openCacheDB(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const req = indexedDB.open(IDB_NAME, 1);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(IDB_STORE)) {
					db.createObjectStore(IDB_STORE);
				}
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}

	async function getCachedMetadata(): Promise<{ data: any; ts: number } | null> {
		try {
			const db = await openCacheDB();
			return new Promise((resolve) => {
				const tx = db.transaction(IDB_STORE, 'readonly');
				const store = tx.objectStore(IDB_STORE);
				const req = store.get(IDB_KEY);
				req.onsuccess = () => resolve(req.result ?? null);
				req.onerror = () => resolve(null);
			});
		} catch { return null; }
	}

	async function setCachedMetadata(data: any): Promise<void> {
		try {
			const db = await openCacheDB();
			const tx = db.transaction(IDB_STORE, 'readwrite');
			const store = tx.objectStore(IDB_STORE);
			store.put({ data, ts: Date.now() }, IDB_KEY);
		} catch { /* non-critical */ }
	}

	// Comprehensive route metadata — $state so we can update from cache/network
	let apiMetadata = $state(EMPTY_METADATA);

	// Derived counts from metadata
	let demoCount = $derived(apiMetadata.allEndpoints.filter((e: RouteEndpoint) => e.path.includes('/demos/')).length);
	let demoEndpoints = $derived(apiMetadata.allEndpoints.filter((e: RouteEndpoint) => e.path.includes('/demos/')));
	let categoryCount = $derived(apiMetadata.categories.length);
	let systemEndpoints = $derived(apiMetadata.allEndpoints.filter((e: RouteEndpoint) => e.group === 'system'));
	let showSystem = $state(false);

	// Group standalone/system routes by functional subcategory
	const standaloneSubgroupMap: Record<string, { label: string; icon: string }> = {
		login: { label: 'Authentication', icon: 'lock' },
		register: { label: 'Authentication', icon: 'lock' },
		health: { label: 'Health & Monitoring', icon: 'activity' },
		indexing: { label: 'Search & Indexing', icon: 'search' },
		'.well-known': { label: 'Well-Known', icon: 'globe' },
		acp: { label: 'Agent Protocol', icon: 'bot' },
		'couchdb-analytics': { label: 'Analytics', icon: 'bar-chart-2' },
		knowledge: { label: 'Knowledge Base', icon: 'book-open' },
		'legal-corpus-premium': { label: 'Legal Corpus', icon: 'scroll' },
		chat: { label: 'Chat', icon: 'message-circle' },
		'rag-search': { label: 'RAG Search', icon: 'search' },
		studio: { label: 'Studio', icon: 'palette' },
		'webgpu-similarity': { label: 'GPU Compute', icon: 'cpu' },
	};

	let groupedSystemEndpoints = $derived.by(() => {
		const groups: Record<string, { label: string; icon: string; endpoints: RouteEndpoint[] }> = {};
		for (const ep of systemEndpoints) {
			const firstSeg = ep.path.replace(/^\//, '').split('/')[0] || 'other';
			const meta = standaloneSubgroupMap[firstSeg] ?? { label: firstSeg.charAt(0).toUpperCase() + firstSeg.slice(1), icon: 'file' };
			const key = meta.label;
			if (!groups[key]) groups[key] = { label: meta.label, icon: meta.icon, endpoints: [] };
			groups[key].endpoints.push(ep);
		}
		return Object.values(groups).sort((a, b) => b.endpoints.length - a.endpoints.length);
	});

	async function loadErrorBrainHistory() {
		if (errorBrainLoading) return;
		errorBrainLoading = true;
		try {
			const [statusRes, runsRes] = await Promise.all([
				fetch('/api/internal/error-brain/status').then(r => r.ok ? r.json() : null).catch(() => null),
				fetch('/api/internal/error-brain/runs?limit=20').then(r => r.ok ? r.json() : null).catch(() => null)
			]);
			if (statusRes) errorBrainStatus = statusRes;
			if (runsRes?.runs) errorBrainRuns = runsRes.runs;
		} catch { /* fail silently */ }
		finally { errorBrainLoading = false; }
	}

	// Clear selectedEndpoint when API tester modal closes
	$effect(() => {
		if (!apiTesterOpen) {
			selectedEndpoint = null;
		}
	});

	$effect(() => {
		routes = Array.isArray(data.routes) ? data.routes : [];
	});

	// ── Client-side metadata loading: IDB cache → network fetch ──
	onMount(async () => {
		metadataProgress = 10;

		// Step 1: Check IDB cache for instant display
		const cached = await getCachedMetadata();
		if (cached && Date.now() - cached.ts < CACHE_TTL) {
			apiMetadata = cached.data;
			metadataSource = 'cache';
			metadataLoading = false;
			metadataProgress = 100;
			// Still refresh in background (stale-while-revalidate)
			fetchMetadataNetwork(false);
			return;
		}

		metadataProgress = 30;

		// Step 2: No cache — full network load with progress bar
		await fetchMetadataNetwork(true);
	});

	async function fetchMetadataNetwork(showLoading: boolean) {
		if (showLoading) metadataLoading = true;
		try {
			metadataProgress = 50;
			const res = await fetch('/api/routes/metadata?includeArchived=true');
			metadataProgress = 80;
			const json = await res.json();
			if (json.success && json.data) {
				apiMetadata = json.data;
				metadataSource = 'network';
				await setCachedMetadata(json.data);
			}
			metadataProgress = 100;
		} catch (err) {
			console.error('[all-routes] Network metadata fetch failed:', err);
		} finally {
			metadataLoading = false;
		}
	}

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
		goto(route.path);
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

	function handleTestEndpoint(endpoint: RouteEndpoint) {
		selectedEndpoint = endpoint;
		apiTesterOpen = true;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<main class="nes-command-center">
	<!-- Loading Overlay -->
	{#if metadataLoading}
		<div class="loading-overlay">
			<div class="loading-dialog">
				<div class="loading-title">INITIALIZING ROUTE SCANNER...</div>
				<div class="loading-bar-track">
					<div class="loading-bar-fill" style="width: {metadataProgress}%"></div>
				</div>
				<div class="loading-status">
					{#if metadataProgress < 30}
						CHECKING LOCAL CACHE...
					{:else if metadataProgress < 60}
						SCANNING FILESYSTEM ({metadataProgress}%)...
					{:else if metadataProgress < 90}
						INDEXING ENDPOINTS...
					{:else}
						FINALIZING...
					{/if}
				</div>
			</div>
		</div>
	{/if}

	{#if metadataSource === 'cache'}
		<div class="cache-banner">
			LOADED FROM CACHE — refreshing in background...
		</div>
	{/if}

	<!-- Header -->
	<div class="nes-header">
		<h1>NES COMMAND CENTER</h1>
		<p class="subtitle">// ROUTE MONITORING SYSTEM v2.0</p>
	</div>

	<!-- Enhanced Stats Bar with Comprehensive Route Counts -->
	<div class="stats-bar">
		<div class="stat-box stat-primary">
			<span class="stat-label">TOTAL ROUTES</span>
			<span class="stat-value">{apiMetadata.stats.totalRoutes}</span>
		</div>
		<div class="stat-box stat-active">
			<span class="stat-label">ACTIVE</span>
			<span class="stat-value">{apiMetadata.stats.activeRoutes}</span>
		</div>
		<div class="stat-box stat-archived">
			<span class="stat-label">ARCHIVED</span>
			<span class="stat-value">{apiMetadata.stats.archivedRoutes}</span>
		</div>
		<div class="stat-box stat-feature">
			<span class="stat-label">API</span>
			<span class="stat-value">{apiMetadata.stats.apiEndpoints}</span>
		</div>
		<div class="stat-box stat-feature">
			<span class="stat-label">SERVER</span>
			<span class="stat-value">{apiMetadata.stats.pageServers}</span>
		</div>
		<div class="stat-box stat-ai">
			<span class="stat-label">PAGES</span>
			<span class="stat-value">{apiMetadata.stats.pages}</span>
		</div>
		<button class="stat-box stat-demo stat-clickable" onclick={() => { showDemos = !showDemos; }}>
			<span class="stat-label">DEMOS</span>
			<span class="stat-value">{demoCount}</span>
		</button>
		<button class="stat-box stat-system stat-clickable" onclick={() => { showSystem = !showSystem; }}>
			<span class="stat-label">SYSTEM</span>
			<span class="stat-value">{apiMetadata.stats.groupCounts.system}</span>
		</button>
		<div class="stat-box stat-cats">
			<span class="stat-label">CATEGORIES</span>
			<span class="stat-value">{categoryCount}</span>
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

	<!-- Capability Bar with New Component Toggles -->
	<div class="capability-bar">
		<span class="cap-item">{stats.withLoad} with load()</span>
		<span class="cap-item">{stats.withActions} with actions</span>
		<span class="cap-item cap-ai">{stats.withAi} AI-powered</span>

		<!-- New Component Toggles -->
		<button class="cap-item cap-api" onclick={() => { showAPIExplorer = !showAPIExplorer; }}>
			{showAPIExplorer ? '[-]' : '[+]'} ROUTE EXPLORER ({apiMetadata.stats.activeRoutes})
		</button>
		<button class="cap-item cap-tree" onclick={() => { showRouteTree = !showRouteTree; }}>
			{showRouteTree ? '[-]' : '[+]'} ROUTE TREE
		</button>
		<button class="cap-item cap-archive" onclick={() => { showArchivedRoutes = !showArchivedRoutes; }}>
			{showArchivedRoutes ? '[-]' : '[+]'} ARCHIVED ({apiMetadata.stats.archivedRoutes})
		</button>
		<button class="cap-item cap-demo" onclick={() => { showDemos = !showDemos; }}>
			{showDemos ? '[-]' : '[+]'} DEMOS ({demoCount})
		</button>
		<button class="cap-item cap-review" onclick={() => { showDevReview = !showDevReview; }}>
			{showDevReview ? '[-]' : '[+]'} DEV REVIEW
		</button>
		<button class="cap-item cap-system" onclick={() => { showSystem = !showSystem; }}>
			{showSystem ? '[-]' : '[+]'} SYSTEM ({systemEndpoints.length})
		</button>

		{#if serverStats.totalClusters > 0}
			<button class="cap-item cap-clusters" onclick={() => (showClusters = !showClusters)}>
				{serverStats.totalClusters} error clusters ({serverStats.errorCount}E / {serverStats.warningCount}W)
				{showClusters ? '[-]' : '[+]'}
			</button>
		{/if}
		<button class="cap-item cap-ops" onclick={() => (showOpsLog = !showOpsLog)}>
			{showOpsLog ? '[-] HIDE OPS LOG' : '[+] OPS LOG'}
		</button>
		<button class="cap-item cap-ops" onclick={() => (showSimpleRoutes = !showSimpleRoutes)}>
			{showSimpleRoutes ? '[-] HIDE SIMPLE LIST' : '[+] SIMPLE LIST'}
		</button>
		<button class="cap-item cap-ops" onclick={() => (showRouteGraph = !showRouteGraph)}>
			{showRouteGraph ? '[-] HIDE GRAPH' : '[+] ROUTE GRAPH'}
		</button>
		<button class="cap-item cap-eb" onclick={() => { showErrorBrainHistory = !showErrorBrainHistory; if (showErrorBrainHistory && errorBrainRuns.length === 0) loadErrorBrainHistory(); }}>
			{showErrorBrainHistory ? '[-] HIDE ERROR BRAIN' : '[+] ERROR BRAIN'}
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

	<!-- API Explorer Panel (collapsible) -->
	{#if showAPIExplorer}
		<div class="explorer-panel">
			<RouteAPIExplorer
				categories={apiMetadata.categories}
				allEndpoints={apiMetadata.allEndpoints}
				onTestEndpoint={handleTestEndpoint}
			/>
		</div>
	{/if}

	<!-- Route Tree View Panel (collapsible) -->
	{#if showRouteTree}
		<div class="tree-panel">
			<RouteTreeView
				routes={apiMetadata.allEndpoints}
			/>
		</div>
	{/if}

	<!-- Archived Routes Panel (collapsible) -->
	{#if showArchivedRoutes}
		<div class="archived-panel-wrapper">
			<ArchivedRoutesPanel
				archived={apiMetadata.archived}
			/>
		</div>
	{/if}

	<!-- Demos Showcase Panel (collapsible) -->
	{#if showDemos}
		<div class="demos-panel">
			<div class="demos-header">
				<span class="demos-title">DEMOS & SHOWCASES</span>
				<span class="demos-count">{demoEndpoints.length} demo routes</span>
			</div>
			<div class="demos-grid">
				{#each demoEndpoints as demo}
					<div class="demo-card">
						<div class="demo-card-header">
							<span class="demo-type-badge" class:demo-page={demo.type === 'page'} class:demo-api={demo.type === 'api'} class:demo-server={demo.type === 'page-server'}>
								{demo.type === 'api' ? 'API' : demo.type === 'page-server' ? 'SRV' : 'PG'}
							</span>
							<span class="demo-path">{demo.path}</span>
						</div>
						{#if demo.description}
							<p class="demo-desc">{demo.description}</p>
						{/if}
						<div class="demo-actions">
							{#if demo.type === 'page' || demo.type === 'page-server'}
								<a href={demo.path} class="demo-visit-btn">VISIT</a>
							{/if}
							{#if demo.absolutePath}
								<a href="vscode://file/{demo.absolutePath}" class="demo-edit-btn">[EDIT]</a>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Dev Review Panel (collapsible) -->
	{#if showDevReview}
		<div class="dev-review-wrapper">
			<DevReviewPanel
				endpoints={apiMetadata.allEndpoints}
				stats={apiMetadata.stats}
				crossRefs={apiMetadata.crossRefs ?? []}
				deadRoutes={apiMetadata.deadRoutes ?? []}
			/>
		</div>
	{/if}

	<!-- System Routes Panel (collapsible) — grouped by subcategory -->
	{#if showSystem}
		<div class="system-panel">
			<div class="system-header">
				<span class="system-title">SYSTEM & STANDALONE ROUTES</span>
				<span class="system-count">{systemEndpoints.length} routes &middot; {groupedSystemEndpoints.length} groups</span>
			</div>
			<div class="system-desc">
				Routes outside (app)/(dev)/api groups, organized by function
			</div>
			{#each groupedSystemEndpoints as group}
				<div class="system-subgroup">
					<div class="system-subgroup-header">
						<Icon name={group.icon} size={13} />
						<span class="system-subgroup-label">{group.label}</span>
						<span class="system-subgroup-count">{group.endpoints.length}</span>
					</div>
					<div class="system-grid">
						{#each group.endpoints as ep}
							<div class="system-card">
								<div class="system-card-header">
									<span class="system-type-badge" class:system-page={ep.type === 'page'} class:system-api={ep.type === 'api'} class:system-server={ep.type === 'page-server'}>
										{ep.type === 'api' ? 'API' : ep.type === 'page-server' ? 'SRV' : 'PG'}
									</span>
									<span class="system-path">{ep.path}</span>
									{#if ep.hasAuth}
										<span class="system-auth">GUARDED</span>
									{/if}
								</div>
								{#if ep.description}
									<p class="system-card-desc">{ep.description}</p>
								{/if}
								<div class="system-card-actions">
									{#if ep.type === 'page' || ep.type === 'page-server'}
										<a href={ep.path} class="system-visit-btn">VISIT</a>
									{/if}
									{#if ep.absolutePath}
										<a href="vscode://file/{ep.absolutePath}" class="system-edit-btn">[EDIT]</a>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}

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

	<!-- Phase Status Pills -->
	<PhaseStatusPills />

	<!-- Operations Log Panel (collapsible) -->
	{#if showOpsLog}
		<div class="ops-log-panel">
			<RouteOperationsDashboard />
		</div>
	{/if}

	<!-- Simple Route List (collapsible) -->
	{#if showSimpleRoutes}
		<div class="ops-log-panel">
			<RoutesList />
		</div>
	{/if}

	<!-- NES Route Topology Graph (collapsible) -->
	{#if showRouteGraph}
		<div class="ops-log-panel" style="height: 500px; overflow: hidden;">
			<NESGraphRenderer
				nodes={filteredRoutes.slice(0, 40).map((r, i) => ({
					id: r.id ?? r.path ?? String(i),
					x: 100 + (i % 8) * 130,
					y: 80 + Math.floor(i / 8) * 100,
					type: r.errorState === 'broken' ? 'error' : r.group ? 'cluster' : 'route',
					label: r.path ?? r.id ?? 'unknown',
					data: r
				}))}
				edges={filteredRoutes.slice(0, 40).flatMap((r, i) => {
					const edges = [];
					if (r.group) {
						const groupPeer = filteredRoutes.findIndex((o, j) => j !== i && o.group === r.group);
						if (groupPeer >= 0) edges.push({ from: r.id ?? r.path ?? String(i), to: filteredRoutes[groupPeer].id ?? filteredRoutes[groupPeer].path ?? String(groupPeer), type: 'related' });
					}
					if (r.errorState === 'broken' && i > 0) edges.push({ from: r.id ?? r.path ?? String(i), to: filteredRoutes[0].id ?? filteredRoutes[0].path ?? '0', type: 'error' });
					return edges;
				})}
				width={1200}
				height={480}
			/>
		</div>
	{/if}

	<!-- Error Brain History Panel (collapsible) -->
	{#if showErrorBrainHistory}
		<div class="eb-panel">
			<div class="eb-header">
				<span class="eb-title">ERROR BRAIN HISTORY</span>
				{#if errorBrainStatus}
					<span class="eb-stats">
						{errorBrainStatus.totalErrors} total | {errorBrainStatus.affectedFiles} files | {errorBrainStatus.fixRate}% fix rate
					</span>
				{/if}
				<button class="eb-refresh" onclick={loadErrorBrainHistory} disabled={errorBrainLoading}>
					{errorBrainLoading ? 'LOADING...' : 'REFRESH'}
				</button>
			</div>
			{#if errorBrainStatus}
				<div class="eb-summary">
					<div class="eb-stat-row">
						<span class="eb-stat"><span class="eb-stat-label">TOTAL</span> <span class="eb-stat-val">{errorBrainStatus.totalErrors}</span></span>
						<span class="eb-stat"><span class="eb-stat-label">FILES</span> <span class="eb-stat-val">{errorBrainStatus.affectedFiles}</span></span>
						<span class="eb-stat"><span class="eb-stat-label">RECENT (24H)</span> <span class="eb-stat-val eb-recent">{errorBrainStatus.recentErrors}</span></span>
						<span class="eb-stat"><span class="eb-stat-label">FIXED</span> <span class="eb-stat-val eb-fixed">{errorBrainStatus.fixedCount}</span></span>
						<span class="eb-stat"><span class="eb-stat-label">FIX RATE</span> <span class="eb-stat-val eb-rate">{errorBrainStatus.fixRate}%</span></span>
					</div>
				</div>
			{/if}
			{#if errorBrainRuns.length > 0}
				<div class="eb-runs">
					{#each errorBrainRuns as run}
						<div class="eb-run-row" class:eb-run-fixed={run.status === 'fixed'}>
							<span class="eb-run-status">[{(run.status || 'open').toUpperCase()}]</span>
							<span class="eb-run-code">{run.error_code || '—'}</span>
							<span class="eb-run-file">{run.file_path?.replace('src/', '') || '—'}</span>
							<span class="eb-run-msg">{run.message?.slice(0, 80) || '—'}</span>
							<span class="eb-run-date">{run.created_at ? new Date(run.created_at).toLocaleDateString() : '—'}</span>
						</div>
					{/each}
				</div>
			{:else if !errorBrainLoading}
				<div class="eb-empty">NO ERROR HISTORY — Database may be offline</div>
			{/if}
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

	<!-- Route Card Grid -->
	{#if filteredRoutes.length > 0}
		<div class="route-card-grid">
			{#each filteredRoutes as route (route.id ?? route.path)}
				<button
					class="route-card"
					class:card-broken={route.errorState === 'broken'}
					class:card-flaky={route.errorState === 'flaky'}
					onclick={() => openRouteModal(route)}
				>
					<div class="card-icon-wrap">
						{#if route.kind === 'endpoint' || route.kind === 'server'}
							<svg class="card-svg" viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="5" y="6" width="2" height="2" fill="currentColor"/><rect x="9" y="6" width="2" height="2" fill="currentColor"/><line x1="4" y1="10" x2="12" y2="10" stroke="currentColor" stroke-width="1"/></svg>
						{:else if route.kind === 'layout'}
							<svg class="card-svg" viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="12" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="1"/><line x1="6" y1="5" x2="6" y2="14" stroke="currentColor" stroke-width="1"/></svg>
						{:else if route.hasAiImports}
							<svg class="card-svg" viewBox="0 0 16 16"><circle cx="8" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 12c0-2.2 1.8-4 4-4s4 1.8 4 4" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="6" y="1" width="4" height="2" fill="currentColor"/></svg>
						{:else if route.errorState === 'broken'}
							<svg class="card-svg card-svg-broken" viewBox="0 0 16 16"><line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="2"/><line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" stroke-width="2"/></svg>
						{:else}
							<svg class="card-svg" viewBox="0 0 16 16"><rect x="3" y="1" width="10" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="5" y1="4" x2="11" y2="4" stroke="currentColor" stroke-width="1"/><line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1"/><line x1="5" y1="10" x2="9" y2="10" stroke="currentColor" stroke-width="1"/></svg>
						{/if}
					</div>
					<span class="card-kind">{route.kind || 'page'}</span>
					<span class="card-path">{route.path}</span>
					{#if route.errorCount > 0}
						<span class="card-badge card-badge-error">{route.errorCount}E</span>
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
				<button class="nes-btn" onclick={() => { showWorkingInspector = true; }}>
					WORKING
				</button>
				<button class="nes-btn" onclick={() => { showDetectiveBoard = true; }}>
					DETECTIVE
				</button>
				<button class="nes-btn" onclick={closeModal}>
					CLOSE
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- API Tester Modal -->
{#if selectedEndpoint}
	<APITesterModal
		bind:open={apiTesterOpen}
		endpoint={selectedEndpoint}
	/>
{/if}

<!-- Route Inspector Modal (YoRHa-themed detail view) -->
<RouteInspectorModal bind:open={showInspector} route={selectedRoute ? { path: selectedRoute.path, kind: selectedRoute.kind ?? 'page', file: selectedRoute.file ?? '', summary: selectedRoute.summary ?? `Route: ${selectedRoute.path}`, category: selectedRoute.group, health: selectedRoute.errorState === 'healthy' ? 'green' : selectedRoute.errorState === 'flaky' ? 'yellow' : selectedRoute.errorState === 'broken' ? 'red' : undefined, errorCount: selectedRoute.errorCount, lastErrorMessage: selectedRoute.lastErrorMessage } : null} />

<RouteInspectorDetectiveBoard bind:open={showDetectiveBoard} route={selectedRoute ? { path: selectedRoute.path ?? selectedRoute.id, kind: selectedRoute.kind ?? 'page', file: selectedRoute.file ?? '', summary: selectedRoute.summary ?? `Route: ${selectedRoute.path}`, category: selectedRoute.group, health: selectedRoute.errorState === 'healthy' ? 'green' : selectedRoute.errorState === 'flaky' ? 'yellow' : selectedRoute.errorState === 'broken' ? 'red' : undefined, errorCount: selectedRoute.errorCount, lastErrorMessage: selectedRoute.lastErrorMessage } : null} />

<RouteInspectorWorking bind:open={showWorkingInspector} route={selectedRoute ? { path: selectedRoute.path, route: selectedRoute.path, file: selectedRoute.file ?? '', category: selectedRoute.group } : null} />

<RouteDecisionModal bind:open={showDecisionModal} bind:route={decisionRoute} onclose={() => { showDecisionModal = false; decisionRoute = null; }} />

<style>
	/* ── Loading Overlay ── */
	.loading-overlay {
		position: fixed;
		inset: 0;
		z-index: 9999;
		background: rgba(13, 13, 42, 0.95);
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: 'Press Start 2P', 'Courier New', 'Consolas', monospace;
	}

	.loading-dialog {
		border: 2px solid #4040c0;
		background: #0a0a1f;
		padding: 2rem 3rem;
		text-align: center;
		min-width: 380px;
		box-shadow: 0 0 40px rgba(64, 64, 192, 0.3);
	}

	.loading-title {
		font-size: 0.85rem;
		color: #c0c0ff;
		letter-spacing: 0.15em;
		margin-bottom: 1.5rem;
	}

	.loading-bar-track {
		height: 20px;
		border: 2px solid #2a2a5a;
		background: #0d0d2a;
		overflow: hidden;
	}

	.loading-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, #3333cc 0%, #6666ff 50%, #3333cc 100%);
		background-size: 200% 100%;
		animation: loading-shimmer 1.5s linear infinite;
		transition: width 0.3s ease;
	}

	@keyframes loading-shimmer {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}

	.loading-status {
		font-size: 0.6rem;
		color: #6060a0;
		margin-top: 1rem;
		letter-spacing: 0.1em;
	}

	.cache-banner {
		font-size: 0.6rem;
		color: #33aa33;
		text-align: center;
		padding: 0.3rem;
		border: 1px solid #1a441a;
		background: rgba(51, 170, 51, 0.05);
		margin-bottom: 0.75rem;
		letter-spacing: 0.05em;
		animation: cache-fade 3s forwards;
	}

	@keyframes cache-fade {
		0%, 70% { opacity: 1; }
		100% { opacity: 0; }
	}

	/* ── NES Command Center Theme (Blue) ── */
	.nes-command-center {
		padding: 1.5rem;
		font-family: 'Press Start 2P', 'Courier New', 'Consolas', monospace;
		background: #0d0d2a;
		color: #c0c0ff;
		min-height: 100vh;
		position: relative;
	}

	/* ── Header ── */
	.nes-header {
		text-align: center;
		padding: 1rem 0 1.5rem;
		border-bottom: 2px solid #2a2a5a;
		margin-bottom: 1.5rem;
	}

	.nes-header h1 {
		font-size: 1.4rem;
		color: #c0c0ff;
		letter-spacing: 0.3em;
		margin: 0;
		text-shadow: 0 0 10px rgba(64, 64, 192, 0.4);
	}

	.subtitle {
		color: #6060a0;
		font-size: 0.7rem;
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
		border: 1px solid #2a2a5a;
		padding: 0.4rem 0.8rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 80px;
	}

	.stat-label {
		font-size: 0.55rem;
		color: #6060a0;
		letter-spacing: 0.1em;
	}

	.stat-value {
		font-size: 1.1rem;
		font-weight: bold;
	}

	.stat-box.stat-primary { border-color: #4040c0; color: #c0c0ff; }
	.stat-box.stat-active { border-color: #3388cc; color: #66bbff; }
	.stat-box.stat-archived { border-color: #cc6633; color: #ff8844; }
	.stat-box.health-ok { border-color: #33aa33; color: #66ff66; }
	.stat-box.health-flaky { border-color: #cccc33; color: #ffff66; }
	.stat-box.health-broken { border-color: #cc3333; color: #ff6666; }
	.stat-box.stat-feature { border-color: #3366cc; color: #6699ff; }
	.stat-box.stat-ai { border-color: #cc33cc; color: #ff66ff; }
	.stat-box.stat-demo { border-color: #33cccc; color: #66ffff; }
	.stat-box.stat-cats { border-color: #9966cc; color: #bb88ff; }
	.stat-box.stat-clickable { cursor: pointer; transition: background 0.15s; }
	.stat-box.stat-clickable:hover { background: rgba(51, 204, 204, 0.15); }

	/* ── Capability Bar ── */
	.capability-bar {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
		padding: 0.4rem 0.75rem;
		background: #0a0a1f;
		border: 1px solid #2a2a5a;
		font-size: 0.65rem;
		flex-wrap: wrap;
		align-items: center;
	}

	.cap-item {
		color: #6060a0;
		letter-spacing: 0.05em;
	}

	.cap-item.cap-ai {
		color: #ff33ff;
	}

	.cap-item.cap-api {
		color: #3399ff;
		background: none;
		border: 1px solid #3399ff;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		letter-spacing: inherit;
	}

	.cap-item.cap-api:hover {
		background: rgba(51, 153, 255, 0.1);
	}

	.cap-item.cap-tree {
		color: #ffaa33;
		background: none;
		border: 1px solid #ffaa33;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		letter-spacing: inherit;
	}

	.cap-item.cap-tree:hover {
		background: rgba(255, 170, 51, 0.1);
	}

	.cap-item.cap-archive {
		color: #ff6633;
		background: none;
		border: 1px solid #ff6633;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		letter-spacing: inherit;
	}

	.cap-item.cap-archive:hover {
		background: rgba(255, 102, 51, 0.1);
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

	.cap-item.cap-eb {
		color: #ff6633;
		background: none;
		border: 1px solid #ff6633;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		letter-spacing: inherit;
	}

	.cap-item.cap-eb:hover {
		background: rgba(255, 102, 51, 0.1);
	}

	.cap-item.cap-demo {
		color: #33cccc;
		background: none;
		border: 1px solid #33cccc;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		letter-spacing: inherit;
	}

	.cap-item.cap-demo:hover {
		background: rgba(51, 204, 204, 0.1);
	}

	.cap-item.cap-review {
		color: #ff6633;
		background: none;
		border: 1px solid #ff6633;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		letter-spacing: inherit;
	}

	.cap-item.cap-review:hover {
		background: rgba(255, 102, 51, 0.1);
	}

	.cap-item.cap-system {
		color: #cc99ff;
		background: none;
		border: 1px solid #cc99ff;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		letter-spacing: inherit;
	}

	.cap-item.cap-system:hover {
		background: rgba(204, 153, 255, 0.1);
	}

	.stat-system {
		border-color: #cc99ff !important;
	}

	.stat-system .stat-label { color: #cc99ff; }
	.stat-system .stat-value { color: #cc99ff; }

	/* ── New Component Panels ── */
	.explorer-panel, .tree-panel, .archived-panel-wrapper, .dev-review-wrapper, .system-panel {
		margin-bottom: 1.5rem;
	}

	.ops-log-panel {
		margin-bottom: 1.5rem;
		border: 1px solid #2a2a5a;
		background: #0a0a1f;
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

	/* ── Demos Panel ── */
	.demos-panel {
		margin-bottom: 1.5rem;
		border: 1px solid #33cccc;
		background: #0c0c0c;
	}

	.demos-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.4rem 0.75rem;
		background: #001a1a;
		border-bottom: 1px solid #33cccc;
	}

	.demos-title {
		font-weight: bold;
		font-size: 0.8rem;
		color: #33cccc;
		letter-spacing: 0.1em;
	}

	.demos-count {
		font-size: 0.7rem;
		color: #1a9999;
	}

	.demos-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.5rem;
		padding: 0.75rem;
	}

	.demo-card {
		border: 1px solid #1a6666;
		padding: 0.5rem 0.75rem;
		background: #0a1a1a;
	}

	.demo-card:hover {
		border-color: #33cccc;
		background: #0f2222;
	}

	.demo-card-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.3rem;
	}

	.demo-type-badge {
		font-size: 0.55rem;
		font-weight: bold;
		padding: 0.05rem 0.25rem;
		border: 1px solid;
		letter-spacing: 0.08em;
		flex-shrink: 0;
	}

	.demo-type-badge.demo-page { color: #cc99ff; border-color: #cc99ff; }
	.demo-type-badge.demo-api { color: #33ff33; border-color: #33ff33; }
	.demo-type-badge.demo-server { color: #ff9933; border-color: #ff9933; }

	.demo-path {
		font-size: 0.7rem;
		color: #66ffff;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.demo-desc {
		font-size: 0.6rem;
		color: #669999;
		margin: 0 0 0.3rem 0;
		line-height: 1.3;
	}

	.demo-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.demo-visit-btn {
		font-size: 0.6rem;
		color: #33ff99;
		border: 1px solid #33ff99;
		padding: 0.1rem 0.4rem;
		text-decoration: none;
		font-family: inherit;
		letter-spacing: 0.05em;
	}

	.demo-visit-btn:hover {
		background: rgba(51, 255, 153, 0.15);
	}

	.demo-edit-btn {
		font-size: 0.6rem;
		color: #666;
		text-decoration: none;
		font-family: inherit;
	}

	.demo-edit-btn:hover {
		color: #999;
	}

	/* ── System Routes Panel ── */
	.system-panel {
		border: 1px solid #cc99ff;
		background: #0c0c0c;
		max-height: 600px;
		overflow-y: auto;
	}

	.system-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.4rem 0.75rem;
		background: #0f001a;
		border-bottom: 1px solid #cc99ff;
	}

	.system-title {
		font-weight: bold;
		font-size: 0.8rem;
		color: #cc99ff;
		letter-spacing: 0.1em;
	}

	.system-count {
		font-size: 0.7rem;
		color: #9966cc;
	}

	.system-desc {
		font-size: 0.6rem;
		color: #664499;
		padding: 0.3rem 0.75rem;
		border-bottom: 1px solid #330066;
	}

	.system-subgroup {
		border-bottom: 1px solid #330066;
	}

	.system-subgroup:last-child {
		border-bottom: none;
	}

	.system-subgroup-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.75rem;
		background: #0d0015;
		color: #bb88dd;
		font-size: 0.7rem;
		font-weight: bold;
		letter-spacing: 0.08em;
		border-bottom: 1px solid #220044;
	}

	.system-subgroup-label {
		flex: 1;
	}

	.system-subgroup-count {
		font-size: 0.6rem;
		color: #7744aa;
		font-weight: normal;
	}

	.system-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
	}

	.system-card {
		border: 1px solid #663399;
		padding: 0.5rem 0.75rem;
		background: #0a001a;
	}

	.system-card:hover {
		border-color: #cc99ff;
		background: #110022;
	}

	.system-card-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.3rem;
	}

	.system-type-badge {
		font-size: 0.55rem;
		font-weight: bold;
		padding: 0.05rem 0.25rem;
		border: 1px solid;
		letter-spacing: 0.08em;
		flex-shrink: 0;
	}

	.system-type-badge.system-page { color: #cc99ff; border-color: #cc99ff; }
	.system-type-badge.system-api { color: #33ff33; border-color: #33ff33; }
	.system-type-badge.system-server { color: #ff9933; border-color: #ff9933; }

	.system-path {
		font-size: 0.7rem;
		color: #cc99ff;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.system-auth {
		font-size: 0.5rem;
		color: #33ff33;
		font-weight: bold;
		flex-shrink: 0;
	}

	.system-card-desc {
		font-size: 0.6rem;
		color: #886699;
		margin: 0 0 0.3rem 0;
		line-height: 1.3;
	}

	.system-card-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.system-visit-btn {
		font-size: 0.6rem;
		color: #33ff99;
		border: 1px solid #33ff99;
		padding: 0.1rem 0.4rem;
		text-decoration: none;
		font-family: inherit;
		letter-spacing: 0.05em;
	}

	.system-visit-btn:hover {
		background: rgba(51, 255, 153, 0.15);
	}

	.system-edit-btn {
		font-size: 0.6rem;
		color: #666;
		text-decoration: none;
		font-family: inherit;
	}

	.system-edit-btn:hover {
		color: #999;
	}

	/* ── Error Brain Panel ── */
	.eb-panel {
		margin-bottom: 1.5rem;
		border: 1px solid #663300;
		background: #0c0c0c;
	}

	.eb-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 0.75rem;
		background: #1a0c00;
		border-bottom: 1px solid #663300;
	}

	.eb-title {
		font-weight: bold;
		font-size: 0.8rem;
		color: #ff6633;
		letter-spacing: 0.1em;
	}

	.eb-stats {
		font-size: 0.7rem;
		color: #996633;
		flex: 1;
	}

	.eb-refresh {
		background: none;
		border: 1px solid #663300;
		color: #ff6633;
		font-family: inherit;
		font-size: 0.65rem;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		letter-spacing: 0.05em;
	}

	.eb-refresh:hover { background: rgba(255, 102, 51, 0.1); }
	.eb-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

	.eb-summary {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid #331a00;
	}

	.eb-stat-row {
		display: flex;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.eb-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.eb-stat-label {
		font-size: 0.6rem;
		color: #664422;
		letter-spacing: 0.1em;
	}

	.eb-stat-val {
		font-size: 1rem;
		font-weight: bold;
		color: #ff6633;
	}

	.eb-stat-val.eb-recent { color: #ffaa33; }
	.eb-stat-val.eb-fixed { color: #33ff33; }
	.eb-stat-val.eb-rate { color: #33aaff; }

	.eb-runs {
		max-height: 400px;
		overflow-y: auto;
	}

	.eb-run-row {
		display: flex;
		gap: 0.5rem;
		padding: 0.3rem 0.75rem;
		border-bottom: 1px solid #1a0c00;
		font-size: 0.7rem;
		align-items: baseline;
	}

	.eb-run-row:last-child { border-bottom: none; }
	.eb-run-row.eb-run-fixed { opacity: 0.6; }

	.eb-run-status {
		font-weight: bold;
		flex-shrink: 0;
		width: 60px;
		color: #ff6633;
	}

	.eb-run-row.eb-run-fixed .eb-run-status { color: #33ff33; }

	.eb-run-code {
		color: #ffaa33;
		flex-shrink: 0;
		width: 60px;
	}

	.eb-run-file {
		color: #996633;
		flex-shrink: 0;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.eb-run-msg {
		color: #999;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.eb-run-date {
		color: #666;
		flex-shrink: 0;
	}

	.eb-empty {
		padding: 1rem;
		text-align: center;
		color: #663300;
		font-size: 0.75rem;
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
		border: 1px solid #2a2a5a;
		padding: 0.3rem 0.5rem;
		flex: 1;
		min-width: 200px;
	}

	.search-prefix {
		color: #4040c0;
		margin-right: 0.5rem;
		font-weight: bold;
	}

	.search-input {
		background: transparent;
		border: none;
		color: #c0c0ff;
		font-family: inherit;
		font-size: 0.85rem;
		outline: none;
		width: 100%;
		letter-spacing: 0.05em;
	}

	.search-input::placeholder {
		color: #4040c0;
	}

	.filter-group {
		display: flex;
		gap: 0.5rem;
	}

	.nes-select {
		background: #0d0d2a;
		color: #c0c0ff;
		border: 1px solid #2a2a5a;
		padding: 0.3rem 0.5rem;
		font-family: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		letter-spacing: 0.05em;
	}

	.nes-select:focus {
		outline: 1px solid #4040c0;
	}

	/* ── Route Card Grid ── */
	.route-card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 0.75rem;
	}

	.route-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		padding: 0.75rem 0.5rem;
		background: #10102a;
		border: 1px solid #2a2a5a;
		color: #c0c0ff;
		font-family: inherit;
		font-size: 0.65rem;
		cursor: pointer;
		text-align: center;
		transition: all 0.15s;
	}

	.route-card:hover {
		border-color: #4040c0;
		background: #15153a;
		box-shadow: 0 0 8px rgba(64, 64, 192, 0.2);
	}

	.route-card.card-broken {
		border-color: #cc3333;
		background: #1a0a1a;
	}

	.route-card.card-flaky {
		border-color: #cccc33;
		background: #1a1a0a;
	}

	.card-icon-wrap {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 0.25rem;
	}

	.card-svg {
		width: 24px;
		height: 24px;
		color: #6060a0;
	}

	.card-svg-broken {
		color: #ff4444;
	}

	.card-kind {
		font-size: 0.55rem;
		color: #6060a0;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.card-path {
		font-size: 0.6rem;
		color: #c0c0ff;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}

	.card-badge {
		font-size: 0.5rem;
		padding: 0.1rem 0.3rem;
		border: 1px solid #2a2a5a;
		color: #6060a0;
	}

	.card-badge-error {
		border-color: #cc3333;
		color: #ff6666;
		background: rgba(204, 51, 51, 0.1);
	}

	.card-group {
		font-size: 0.5rem;
		color: #4040c0;
	}

	/* ── Empty State ── */
	.empty-state {
		text-align: center;
		padding: 3rem;
		border: 1px dashed #2a2a5a;
	}

	.empty-state p {
		margin: 0.5rem 0;
	}

	.hint {
		color: #6060a0;
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
		background: #0d0d2a;
		border: 2px solid #4040c0;
		max-width: 600px;
		width: 100%;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 0 20px rgba(64, 64, 192, 0.3), inset 0 0 20px rgba(64, 64, 192, 0.05);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #2a2a5a;
		background: #10102a;
	}

	.modal-title {
		font-weight: bold;
		font-size: 0.9rem;
		letter-spacing: 0.15em;
		color: #c0c0ff;
	}

	.modal-close {
		background: none;
		border: 1px solid #2a2a5a;
		color: #6060a0;
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0.2rem 0.5rem;
	}

	.modal-close:hover {
		background: #4040c0;
		color: #fff;
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
		color: #6060a0;
		letter-spacing: 0.15em;
		margin-bottom: 0.2rem;
	}

	.detail-value {
		font-size: 0.85rem;
		color: #c0c0ff;
	}

	.path-value {
		font-size: 1rem;
		font-weight: bold;
		color: #d0d0ff;
	}

	.file-value {
		font-size: 0.75rem;
		color: #6060a0;
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
		background: #1a0a1a;
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
		border: 1px solid #4040c0;
		color: #c0c0ff;
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
		border-top: 1px dashed #2a2a5a;
		margin-top: 0.5rem;
		padding-top: 0.5rem;
	}

	.analysis-entry {
		display: flex;
		gap: 0.75rem;
		font-size: 0.7rem;
		padding: 0.2rem 0;
		border-bottom: 1px solid #1a1a3a;
		color: #a0a0d0;
	}

	.analysis-phase { color: #c0c0ff; }
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
		border-top: 1px solid #2a2a5a;
		background: #10102a;
	}

	.nes-btn {
		background: #0d0d2a;
		color: #c0c0ff;
		border: 1px solid #4040c0;
		padding: 0.4rem 0.8rem;
		font-family: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		letter-spacing: 0.1em;
		transition: all 0.15s;
	}

	.nes-btn:hover {
		background: #4040c0;
		color: #fff;
	}

	.nes-btn.primary {
		background: #4040c0;
		color: #fff;
		font-weight: bold;
	}

	.nes-btn.primary:hover {
		background: #5050d0;
	}
</style>
