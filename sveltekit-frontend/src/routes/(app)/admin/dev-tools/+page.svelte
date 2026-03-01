<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import EvidenceDrawer from '$lib/components/admin/EvidenceDrawer.svelte';
	import EvidenceDataGrid from '$lib/components/admin/EvidenceDataGrid.svelte';
	import CachePerformanceDashboard from '$lib/components/ai/CachePerformanceDashboard.svelte';
	import CacheDemo from '$lib/components/cache/CacheDemo.svelte';
	import GPUMetrics from '$lib/components/yorha/dashboard/GPUMetrics.svelte';
	import TerminalWindow from '$lib/components/terminal/TerminalWindow.svelte';
	import ProgressiveForm from '$lib/components/forms/ProgressiveForm.svelte';
	import YoRHaForm from '$lib/components/yorha/YoRHaForm.svelte';
	import AIStatusIndicator from '$lib/components/ai/AIStatusIndicator.svelte';
	import PerformanceMonitor from '$lib/components/ui/PerformanceMonitor.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import CacheMonitor from '$lib/components/cache/CacheMonitor.svelte';
	import DocumentUploadSimulator from '$lib/components/ai/DocumentUploadSimulator.svelte';
	let { data } = $props();

	// Tab state
	let activeTab = $state('services');
	const tabs = [
		{ value: 'services', label: 'Services' },
		{ value: 'indexing', label: 'Indexing' },
		{ value: 'search', label: 'Search' },
		{ value: 'qdrant', label: 'Qdrant' },
		{ value: 'docker', label: 'Docker' },
		{ value: 'tools', label: 'Admin Tools' },
		{ value: 'evidence', label: 'Evidence' },
		{ value: 'cache', label: 'Cache' },
		{ value: 'gpu', label: 'GPU' },
		{ value: 'terminal', label: 'Terminal' },
		{ value: 'forms', label: 'Forms' },
		{ value: 'ai-status', label: 'AI Status' },
		{ value: 'performance', label: 'Performance' },
		{ value: 'spinners', label: 'Spinners' },
		{ value: 'embeddings', label: 'Embeddings' },
		{ value: 'upload-sim', label: 'Upload Sim' },
		{ value: 'knowledge', label: 'Knowledge Base' },
	];

	// Reactive state
	let searchQuery = $state('');
	let searchResults = $state<Array<{ id: string; score: number; file: string; snippet: string }>>([]);
	let searching = $state(false);
	let indexingCodebase = $state(false);
	let indexingErrors = $state(false);
	let indexingLog = $state<string[]>([]);

	// Terminal state
	let terminalHistory = $state<Array<{ id: string; query: string; response: string; timestamp: Date; functionCalls: Array<{ name: string; result: unknown }> }>>([]);
	let terminalLoading = $state(false);

	async function handleTerminalQuery(query: string) {
		terminalLoading = true;
		const entry = { id: crypto.randomUUID(), query, response: '', timestamp: new Date(), functionCalls: [] as Array<{ name: string; result: unknown }> };
		try {
			const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: query }) });
			if (res.ok) {
				const json = await res.json();
				entry.response = json.response ?? json.message ?? JSON.stringify(json);
			} else {
				entry.response = `Error ${res.status}: ${res.statusText}`;
			}
		} catch (e) {
			entry.response = `Error: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			terminalHistory = [...terminalHistory, entry];
			terminalLoading = false;
		}
	}

	// Embedding test state
	let embedTestText = $state('');
	let embedTestResult = $state<{ embedding: number[]; model: string; dims: number; timeMs: number } | null>(null);
	let isEmbedding = $state(false);
	let embedError = $state('');
	let redisHealthy = $state<boolean | null>(null);
	let redisStats = $state<Record<string, any>>({});
	let isCheckingRedis = $state(false);

	async function testEmbedding() {
		if (!embedTestText.trim()) return;
		isEmbedding = true;
		embedError = '';
		embedTestResult = null;
		const start = performance.now();
		try {
			const res = await fetch('/api/embed', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: embedTestText, model: 'embeddinggemma' })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			embedTestResult = {
				embedding: data.embedding ?? [],
				model: data.model ?? 'embeddinggemma:latest',
				dims: data.embedding?.length ?? 0,
				timeMs: performance.now() - start
			};
		} catch (e) {
			embedError = e instanceof Error ? e.message : String(e);
		} finally {
			isEmbedding = false;
		}
	}

	async function checkRedisHealth() {
		isCheckingRedis = true;
		try {
			const res = await fetch('/api/health');
			if (res.ok) {
				const data = await res.json();
				redisHealthy = data.redis?.status === 'healthy' || data.redis?.connected === true || data.services?.some?.((s: any) => s.name?.toLowerCase().includes('redis') && s.status === 'healthy');
				redisStats = data.redis ?? {};
			} else {
				redisHealthy = false;
			}
		} catch {
			redisHealthy = false;
		} finally {
			isCheckingRedis = false;
		}
	}

	// Knowledge base seed state
	let seedStatus = $state<'idle' | 'seeding' | 'embedding' | 'indexing' | 'done' | 'error'>('idle');
	let seedResult = $state<Record<string, unknown> | null>(null);
	let seedError = $state('');

	async function seedKnowledge(withEmbed = false) {
		seedStatus = withEmbed ? 'embedding' : 'seeding';
		seedResult = null;
		seedError = '';
		try {
			const url = withEmbed ? '/api/admin/seed-knowledge?embed=true' : '/api/admin/seed-knowledge';
			const res = await fetch(url, { method: 'POST' });
			const json = await res.json();
			if (res.ok) {
				seedResult = json;
				seedStatus = 'done';
			} else {
				seedError = json.error ?? `HTTP ${res.status}`;
				seedStatus = 'error';
			}
		} catch (e) {
			seedError = e instanceof Error ? e.message : String(e);
			seedStatus = 'error';
		}
	}

	async function indexPdfs() {
		seedStatus = 'indexing';
		seedResult = null;
		seedError = '';
		try {
			const res = await fetch('/api/admin/seed-knowledge?action=index-pdfs');
			const json = await res.json();
			if (res.ok) {
				seedResult = json;
				seedStatus = 'done';
			} else {
				seedError = json.error ?? `HTTP ${res.status}`;
				seedStatus = 'error';
			}
		} catch (e) {
			seedError = e instanceof Error ? e.message : String(e);
			seedStatus = 'error';
		}
	}

	// Evidence drawer state
	let showEvidenceDrawer = $state(false);
	let selectedEvidenceFile = $state<any>(null);
	let isDrawerSaving = $state(false);
	let evidenceFiles = $state<any[]>([]);
	let isLoadingEvidence = $state(false);
	let showDataGrid = $state(false);

	// Derived
	const healthyCount = $derived(data.services.filter((s: { status: string }) => s.status === 'healthy').length);
	const totalServices = $derived(data.services.length);
	const totalVectors = $derived(data.qdrant.totalPoints);
	const codebaseIndexed = $derived(data.indexing.codebase?.pointCount ?? 0);
	const errorsIndexed = $derived(data.indexing.errors?.pointCount ?? 0);

	// Admin tool links
	const adminTools = [
		{ name: 'Codebase Viewer', href: '/admin/codebase-viewer', desc: 'Qdrant + PostgreSQL embedding browser', icon: '📊' },
		{ name: 'Component Analysis', href: '/admin/component-analysis', desc: 'Component unit analyzer with KB search', icon: '🧩' },
		{ name: 'Knowledge Search', href: '/admin/knowledge-search', desc: 'Multi-tab KB search (Qdrant + Ollama)', icon: '🔍' },
		{ name: 'Error Analysis', href: '/admin/error-analysis', desc: 'Phase 89 error analysis with SSE', icon: '🐛' },
		{ name: 'Route Explorer', href: '/admin/explorer', desc: 'Route explorer with tree view + SSE', icon: '🗺️' },
		{ name: 'Topology View', href: '/admin/topology', desc: 'Canvas-based network visualization', icon: '🕸️' },
		{ name: 'All Routes', href: '/all-routes', desc: 'SSE-based real-time route health', icon: '📡' },
	];

	async function searchCodebase() {
		if (!searchQuery.trim()) return;
		searching = true;
		searchResults = [];
		try {
			const res = await fetch('/api/indexing', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'search', query: searchQuery, limit: 20 })
			});
			if (res.ok) {
				const json = await res.json();
				searchResults = (json.results ?? []).map((r: Record<string, unknown>) => ({
					id: r.id as string ?? '',
					score: (r.score as number ?? 0),
					file: ((r.payload as Record<string, unknown>)?.file_path as string) ?? 'unknown',
					snippet: ((r.payload as Record<string, unknown>)?.content as string)?.substring(0, 200) ?? ''
				}));
			}
		} catch (e) {
			indexingLog = [...indexingLog, `Search error: ${e instanceof Error ? e.message : String(e)}`];
		} finally {
			searching = false;
		}
	}

	async function triggerIndexing(type: 'codebase' | 'errors') {
		if (type === 'codebase') indexingCodebase = true;
		else indexingErrors = true;

		indexingLog = [...indexingLog, `[${new Date().toLocaleTimeString()}] Starting ${type} indexing...`];

		try {
			const res = await fetch('/api/indexing', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: type })
			});
			const json = await res.json();
			if (res.ok) {
				indexingLog = [...indexingLog, `[${new Date().toLocaleTimeString()}] ${type} indexing complete: ${JSON.stringify(json.stats ?? json)}`];
				await invalidateAll();
			} else {
				indexingLog = [...indexingLog, `[${new Date().toLocaleTimeString()}] ${type} indexing failed: ${json.error ?? res.statusText}`];
			}
		} catch (e) {
			indexingLog = [...indexingLog, `[${new Date().toLocaleTimeString()}] ${type} error: ${e instanceof Error ? e.message : String(e)}`];
		} finally {
			if (type === 'codebase') indexingCodebase = false;
			else indexingErrors = false;
		}
	}

	async function refreshHealth() {
		await invalidateAll();
		indexingLog = [...indexingLog, `[${new Date().toLocaleTimeString()}] Health data refreshed`];
	}

	async function loadEvidenceFiles() {
		isLoadingEvidence = true;
		try {
			const res = await fetch('/api/evidence?limit=50');
			if (res.ok) {
				const json = await res.json();
				evidenceFiles = json.evidence ?? json.items ?? json ?? [];
			}
		} catch (e) {
			console.error('Failed to load evidence files:', e);
		} finally {
			isLoadingEvidence = false;
		}
	}
</script>

<div class="mx-auto max-w-[1600px] p-6">
	<!-- Header -->
	<header class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-black uppercase tracking-wide">Dev Tools Hub</h1>
			<p class="mt-1 text-sm text-black/60">
				Codebase indexing &bull; Service health &bull; Admin tools
			</p>
		</div>
		<div class="flex items-center gap-3">
			<span class="text-xs text-black/40">Updated: {new Date(data.timestamp).toLocaleTimeString()}</span>
			<button
				class="rounded-md border-2 border-black/30 bg-panel px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-black transition hover:border-accent hover:text-accent"
				onclick={refreshHealth}
			>
				Refresh
			</button>
		</div>
	</header>

	<!-- Top Stats Row -->
	<div class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
		<div class="flex items-center gap-3 rounded-lg border-2 bg-panel p-4 {healthyCount === totalServices ? 'border-accent' : 'border-warning'}">
			<span class="text-2xl">{healthyCount === totalServices ? '✅' : '⚠️'}</span>
			<div>
				<div class="text-xl font-bold text-black">{healthyCount}/{totalServices}</div>
				<div class="text-[10px] uppercase tracking-wide text-black/60">Services Up</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-info bg-panel p-4">
			<span class="text-2xl">🔢</span>
			<div>
				<div class="text-xl font-bold text-black">{totalVectors.toLocaleString()}</div>
				<div class="text-[10px] uppercase tracking-wide text-black/60">Qdrant Vectors</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-accent bg-panel p-4">
			<span class="text-2xl">📁</span>
			<div>
				<div class="text-xl font-bold text-black">{codebaseIndexed.toLocaleString()}</div>
				<div class="text-[10px] uppercase tracking-wide text-black/60">Code Indexed</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-warning bg-panel p-4">
			<span class="text-2xl">🐛</span>
			<div>
				<div class="text-xl font-bold text-black">{errorsIndexed.toLocaleString()}</div>
				<div class="text-[10px] uppercase tracking-wide text-black/60">Errors Indexed</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-info bg-panel p-4">
			<span class="text-2xl">🐳</span>
			<div>
				<div class="text-xl font-bold text-black">{data.docker.length}</div>
				<div class="text-[10px] uppercase tracking-wide text-black/60">Containers</div>
			</div>
		</div>
	</div>

	<!-- Tab Bar -->
	<div class="dt-tab-bar">
		{#each tabs as tab}
			<button
				class="dt-tab"
				class:active={activeTab === tab.value}
				onclick={() => { activeTab = tab.value; if (tab.value === 'evidence' && evidenceFiles.length === 0) loadEvidenceFiles(); }}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Services Tab -->
	{#if activeTab === 'services'}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.services as service}
				<div class="rounded-lg border-2 bg-panel p-4 {service.status === 'healthy' ? 'border-accent/30' : 'border-danger/30'}">
					<div class="mb-2 flex items-center justify-between">
						<h3 class="font-semibold text-black">{service.name}</h3>
						<span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider {service.status === 'healthy' ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger'}">
							{service.status}
						</span>
					</div>
					<div class="space-y-1 text-sm">
						{#if service.latencyMs !== undefined}
							<div class="flex justify-between">
								<span class="text-black/60">Latency:</span>
								<span class="font-mono text-black">{service.latencyMs}ms</span>
							</div>
						{/if}
						{#if service.details}
							<div class="flex justify-between">
								<span class="text-black/60">Details:</span>
								<span class="font-mono text-xs text-black/80">{service.details}</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Indexing Tab -->
	{#if activeTab === 'indexing'}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<div class="space-y-4">
				<h3 class="text-lg font-semibold text-black uppercase tracking-wide">Codebase Indexing</h3>

				<div class="rounded-lg border-2 border-black/20 bg-panel p-4">
					<div class="mb-3 flex items-center justify-between">
						<div>
							<div class="font-semibold text-black">Code Index</div>
							<div class="text-xs text-black/60">TypeScript + Svelte files → Qdrant + MinIO</div>
						</div>
						<span class="rounded-full bg-info/20 px-2 py-0.5 text-xs font-bold text-info">
							{codebaseIndexed} points
						</span>
					</div>
					<button
						class="w-full rounded-md border-2 border-accent bg-accent/10 px-4 py-2 text-sm font-mono uppercase tracking-wider text-accent transition hover:bg-accent/20 disabled:opacity-50"
						onclick={() => triggerIndexing('codebase')}
						disabled={indexingCodebase}
					>
						{indexingCodebase ? 'Indexing...' : 'Index Codebase'}
					</button>
				</div>

				<div class="rounded-lg border-2 border-black/20 bg-panel p-4">
					<div class="mb-3 flex items-center justify-between">
						<div>
							<div class="font-semibold text-black">Error Index</div>
							<div class="text-xs text-black/60">Error patterns → Qdrant for semantic search</div>
						</div>
						<span class="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-bold text-warning">
							{errorsIndexed} points
						</span>
					</div>
					<button
						class="w-full rounded-md border-2 border-warning bg-warning/10 px-4 py-2 text-sm font-mono uppercase tracking-wider text-warning transition hover:bg-warning/20 disabled:opacity-50"
						onclick={() => triggerIndexing('errors')}
						disabled={indexingErrors}
					>
						{indexingErrors ? 'Indexing...' : 'Index Errors'}
					</button>
				</div>
			</div>

			<div>
				<h3 class="mb-2 text-lg font-semibold text-black uppercase tracking-wide">Activity Log</h3>
				<div class="h-64 overflow-y-auto rounded-lg border-2 border-black/20 bg-black/40 p-3 font-mono text-xs text-black/80">
					{#if indexingLog.length === 0}
						<span class="text-black/30">No activity yet. Trigger an indexing operation to see logs.</span>
					{:else}
						{#each indexingLog as line}
							<div class="mb-1">{line}</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Search Tab -->
	{#if activeTab === 'search'}
		<div class="space-y-4">
			<div class="flex gap-2">
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search indexed codebase (semantic search via Qdrant)..."
					class="flex-1 rounded-lg border-2 border-black/20 bg-panel px-4 py-2 text-black placeholder-black/40 transition focus:border-accent focus:outline-none"
					onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') searchCodebase(); }}
				/>
				<button
					class="rounded-lg border-2 border-accent bg-accent/10 px-6 py-2 text-sm font-mono uppercase tracking-wider text-accent transition hover:bg-accent/20 disabled:opacity-50"
					onclick={searchCodebase}
					disabled={searching || !searchQuery.trim()}
				>
					{searching ? 'Searching...' : 'Search'}
				</button>
			</div>

			{#if searchResults.length > 0}
				<div class="space-y-2">
					{#each searchResults as result}
						<div class="rounded-lg border-2 border-black/20 bg-panel p-4 transition hover:border-info">
							<div class="mb-2 flex items-center justify-between">
								<code class="rounded bg-sand/10 px-2 py-0.5 text-xs text-info">{result.file}</code>
								<span class="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">
									{(result.score * 100).toFixed(1)}%
								</span>
							</div>
							{#if result.snippet}
								<pre class="overflow-x-auto whitespace-pre-wrap text-xs text-black/70">{result.snippet}</pre>
							{/if}
						</div>
					{/each}
				</div>
			{:else if searchQuery && !searching}
				<div class="rounded-lg border-2 border-dashed border-black/20 p-8 text-center text-black/40">
					No results. Try a different query or index the codebase first.
				</div>
			{/if}
		</div>
	{/if}

	<!-- Qdrant Tab -->
	{#if activeTab === 'qdrant'}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each data.qdrant.collections as collection}
				<div class="rounded-lg border-2 border-black/20 bg-panel p-4 transition hover:border-info">
					<div class="mb-3 flex items-center justify-between">
						<h3 class="font-semibold text-black">{collection.name}</h3>
						<span class="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
							{collection.status}
						</span>
					</div>
					<div class="space-y-1 text-sm">
						<div class="flex justify-between">
							<span class="text-black/60">Points:</span>
							<span class="font-semibold text-black">{collection.pointsCount.toLocaleString()}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-black/60">Vector Size:</span>
							<span class="font-semibold text-black">{collection.vectorSize}d</span>
						</div>
					</div>
				</div>
			{/each}

			{#if data.qdrant.collections.length === 0}
				<div class="col-span-full rounded-lg border-2 border-dashed border-black/20 p-8 text-center text-black/40">
					No Qdrant collections found. Is Qdrant running on port 6333?
				</div>
			{/if}
		</div>
	{/if}

	<!-- Docker Tab -->
	{#if activeTab === 'docker'}
		{#if data.docker.length > 0}
			<div class="overflow-hidden rounded-lg border-2 border-black/20 bg-panel">
				<table class="w-full border-collapse">
					<thead>
						<tr class="border-b-2 border-black/20 bg-sand/10">
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-black/60">Container</th>
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-black/60">Status</th>
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-black/60">Image</th>
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-black/60">Ports</th>
						</tr>
					</thead>
					<tbody>
						{#each data.docker as container}
							<tr class="border-b border-black/10 transition hover:bg-sand/5">
								<td class="p-3">
									<code class="text-xs text-black">{container.name}</code>
								</td>
								<td class="p-3">
									<span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase {container.status === 'running' ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger'}">
										{container.status}
									</span>
								</td>
								<td class="p-3 text-xs text-black/60">{container.image}</td>
								<td class="p-3 font-mono text-xs text-black/60">{container.ports || '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="rounded-lg border-2 border-dashed border-black/20 p-8 text-center text-black/40">
				No Docker containers detected. Docker Engine API may not be exposed on port 2375,
				or Docker Desktop is not running.
			</div>
		{/if}
	{/if}

	<!-- Admin Tools Tab -->
	{#if activeTab === 'tools'}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each adminTools as tool}
				<a
					href={tool.href}
					class="group rounded-lg border-2 border-black/20 bg-panel p-4 transition hover:border-accent hover:-translate-y-0.5 hover:shadow-md"
				>
					<div class="mb-2 flex items-center gap-2">
						<span class="text-xl">{tool.icon}</span>
						<h3 class="font-semibold text-black group-hover:text-accent">{tool.name}</h3>
					</div>
					<p class="text-xs text-black/60">{tool.desc}</p>
				</a>
			{/each}
		</div>
	{/if}

	<!-- Evidence Tab -->
	{#if activeTab === 'evidence'}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-semibold text-black uppercase tracking-wide">Evidence File Manager</h3>
				<button
					class="rounded-md border-2 border-info bg-info/10 px-4 py-1.5 text-xs font-mono uppercase tracking-wider text-info transition hover:bg-info/20"
					onclick={loadEvidenceFiles}
					disabled={isLoadingEvidence}
				>
					{isLoadingEvidence ? 'Loading...' : 'Refresh'}
				</button>
			</div>

			{#if evidenceFiles.length > 0}
				<div class="overflow-hidden rounded-lg border-2 border-black/20 bg-panel">
					<table class="w-full border-collapse">
						<thead>
							<tr class="border-b-2 border-black/20 bg-sand/10">
								<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-black/60">File</th>
								<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-black/60">Type</th>
								<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-black/60">Status</th>
								<th class="p-3 text-right text-xs font-bold uppercase tracking-wider text-black/60">Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each evidenceFiles as file (file.id)}
								<tr class="border-b border-black/10 transition hover:bg-sand/5">
									<td class="p-3">
										<div class="font-medium text-black text-sm">{file.title ?? file.filename ?? file.fileName ?? 'Untitled'}</div>
										<div class="text-xs text-black/40">{file.id}</div>
									</td>
									<td class="p-3 text-xs text-black/60">{file.evidenceType ?? file.file_type ?? file.fileType ?? '—'}</td>
									<td class="p-3">
										<span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase {(file.processing_status ?? file.status) === 'completed' ? 'bg-accent/20 text-accent' : 'bg-warning/20 text-warning'}">
											{file.processing_status ?? file.status ?? 'unknown'}
										</span>
									</td>
									<td class="p-3 text-right">
										<button
											class="text-xs text-info hover:text-info/80 transition"
											onclick={() => { selectedEvidenceFile = file; showEvidenceDrawer = true; }}
										>
											Inspect
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if !isLoadingEvidence}
				<div class="rounded-lg border-2 border-dashed border-black/20 p-8 text-center text-black/40">
					No evidence files loaded. Click Refresh to fetch from the database.
				</div>
			{:else}
				<div class="flex items-center justify-center p-12">
					<div class="w-6 h-6 border-2 border-info border-t-transparent rounded-full animate-spin"></div>
					<span class="ml-3 text-black/60">Loading evidence files...</span>
				</div>
			{/if}
			<!-- Advanced Data Grid -->
			<div class="mt-4">
				<button
					onclick={() => (showDataGrid = !showDataGrid)}
					class="rounded-md border-2 border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-mono uppercase tracking-wider text-accent transition hover:bg-accent/20"
				>
					{showDataGrid ? 'Hide Data Grid' : 'Advanced Data Grid'}
				</button>
				{#if showDataGrid}
					<div class="mt-3">
						<EvidenceDataGrid
							items={evidenceFiles.map((f: any) => ({
								id: f.id,
								filename: f.title ?? f.filename ?? f.fileName ?? 'Untitled',
								file_type: f.evidenceType ?? f.file_type ?? f.fileType ?? '',
								file_size: f.fileSize ?? f.file_size ?? 0,
								jurisdiction: f.jurisdiction ?? '',
								processing_status: f.processing_status ?? f.status ?? 'unknown',
								created_at: f.createdAt ?? f.created_at ?? '',
								chunk_count: f.chunk_count ?? 0,
							}))}
							total={evidenceFiles.length}
							page={1}
							pageSize={50}
							isLoading={isLoadingEvidence}
							onRowClick={(item) => { selectedEvidenceFile = evidenceFiles.find((f: any) => f.id === item.id); showEvidenceDrawer = true; }}
							onPageChange={() => {}}
							onSearch={() => {}}
							onFilterChange={() => {}}
						/>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Cache Tab -->
	{#if activeTab === 'cache'}
		<CachePerformanceDashboard />
		<div style="margin-top: 2rem;">
			<CacheMonitor />
		</div>
		<div style="margin-top: 2rem;">
			<CacheDemo />
		</div>
	{/if}

	<!-- GPU Tab -->
	{#if activeTab === 'gpu'}
		<GPUMetrics />
	{/if}

	<!-- Terminal Tab -->
	{#if activeTab === 'terminal'}
		<TerminalWindow
			queryHistory={terminalHistory}
			isLoading={terminalLoading}
			onquery={handleTerminalQuery}
		/>
	{/if}

	<!-- Forms Tab -->
	{#if activeTab === 'forms'}
		<div class="tab-content">
			<h3 class="text-black/80 text-sm font-semibold mb-4 uppercase tracking-wide">Progressive Enhancement Form Demo</h3>
			<ProgressiveForm
				title="Test Form (Progressive Enhancement)"
				description="Demo of SvelteKit progressive enhancement with client-side validation"
				action="/api/submit-form"
			/>
			<div class="mt-6">
				<h3 class="text-black/80 text-sm font-semibold mb-4 uppercase tracking-wide">YoRHa-Themed Form Demo</h3>
				<YoRHaForm
					title="YoRHa Data Input"
					subtitle="Theme-consistent form component"
					fields={[
						{ id: 'name', label: 'Case Name', type: 'text', placeholder: 'Enter case name...', required: true },
						{ id: 'priority', label: 'Priority', type: 'select', options: [{ label: 'High', value: 'high' }, { label: 'Medium', value: 'medium' }, { label: 'Low', value: 'low' }] },
						{ id: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Additional notes...' },
						{ id: 'urgent', label: 'Mark as Urgent', type: 'checkbox' }
					]}
					onsubmit={(data) => { console.log('YoRHa form submitted:', data); }}
				/>
			</div>
		</div>
	{/if}

	<!-- AI Status Tab -->
	{#if activeTab === 'ai-status'}
		<div class="space-y-4">
			<h3 class="text-lg font-semibold text-black uppercase tracking-wide">AI Backend Status Monitor</h3>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<AIStatusIndicator isReady={true} provider="local" model="gemma3-legal:latest" />
				<AIStatusIndicator isReady={true} provider="local" model="embeddinggemma:latest" />
				<AIStatusIndicator isLoading={true} provider="cloud" model="vLLM legal-bert" />
				<AIStatusIndicator provider="hybrid" model="ONNX gemma-270m" />
			</div>
			<div class="mt-4">
				<h4 class="text-sm font-semibold text-black/80 mb-2 uppercase tracking-wide">Error State Demo</h4>
				<AIStatusIndicator error="Connection to Ollama timed out after 30s" provider="local" model="gemma3-legal:latest" />
			</div>
		</div>
	{/if}

	{#if activeTab === 'performance'}
		<div class="space-y-4">
			<h3 class="text-lg font-semibold text-black uppercase tracking-wide">Performance Monitor</h3>
			<p class="text-sm text-black/60">Real-time FPS, memory, CPU/GPU usage, and response time metrics.</p>
			<PerformanceMonitor showOverlay={true} autoHide={false} updateInterval={1000} />
		</div>
	{/if}

	<!-- Embeddings Tab — Redis cache + embeddinggemma integration -->
	{#if activeTab === 'embeddings'}
		<div class="space-y-6">
			<h3 class="text-lg font-semibold text-black uppercase tracking-wide">Embedding & Cache Integration</h3>
			<p class="text-sm text-black/60">Test embeddinggemma:latest (768d) via Ollama + check Redis cache health.</p>

			<!-- Redis Health -->
			<div class="rounded-lg border-2 border-black/20 bg-panel p-4">
				<div class="flex items-center justify-between mb-3">
					<h4 class="font-semibold text-black uppercase tracking-wide">Redis Cache Health</h4>
					<button
						class="rounded-md border-2 border-info bg-info/10 px-3 py-1 text-xs font-mono uppercase text-info transition hover:bg-info/20 disabled:opacity-50"
						onclick={checkRedisHealth}
						disabled={isCheckingRedis}
					>
						{isCheckingRedis ? 'Checking...' : 'Check Health'}
					</button>
				</div>
				{#if redisHealthy !== null}
					<div class="flex items-center gap-2 text-sm">
						<span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase {redisHealthy ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger'}">
							{redisHealthy ? 'Connected' : 'Disconnected'}
						</span>
						{#if Object.keys(redisStats).length > 0}
							<span class="text-black/40 text-xs font-mono">
								{JSON.stringify(redisStats).slice(0, 120)}{JSON.stringify(redisStats).length > 120 ? '...' : ''}
							</span>
						{/if}
					</div>
				{:else}
					<p class="text-xs text-black/40">Click "Check Health" to query /api/health for Redis status.</p>
				{/if}
			</div>

			<!-- Embedding Test -->
			<div class="rounded-lg border-2 border-black/20 bg-panel p-4">
				<h4 class="font-semibold text-black mb-3 uppercase tracking-wide">embeddinggemma:latest (768-dim)</h4>
				<div class="space-y-3">
					<textarea
						bind:value={embedTestText}
						placeholder="Enter text to embed via Ollama embeddinggemma..."
						rows={3}
						class="w-full rounded-lg border-2 border-black/20 bg-sand/10 px-4 py-2 text-black text-sm placeholder-black/40 transition focus:border-accent focus:outline-none resize-vertical"
					></textarea>
					<div class="flex gap-2">
						<button
							class="flex-1 rounded-md border-2 border-accent bg-accent/10 px-4 py-2 text-sm font-mono uppercase tracking-wider text-accent transition hover:bg-accent/20 disabled:opacity-50"
							onclick={testEmbedding}
							disabled={isEmbedding || !embedTestText.trim()}
						>
							{isEmbedding ? 'Embedding...' : 'Generate Embedding'}
						</button>
						<button
							class="rounded-md border-2 border-black/30 bg-panel px-3 py-2 text-xs text-black/60 transition hover:text-black"
							onclick={() => { embedTestText = 'The defendant is charged under California Penal Code Section 187(a) with murder in the first degree.'; }}
						>
							Sample
						</button>
					</div>
				</div>

				{#if embedError}
					<div class="mt-3 p-3 bg-danger/10 border-2 border-danger rounded-lg text-danger text-sm">
						{embedError}
					</div>
				{/if}

				{#if embedTestResult}
					<div class="mt-3 space-y-2">
						<div class="flex items-center gap-3 text-sm">
							<span class="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">
								{embedTestResult.dims}d
							</span>
							<span class="text-black/60">Model: <span class="font-mono text-black">{embedTestResult.model}</span></span>
							<span class="text-black/60">Time: <span class="font-mono text-accent">{embedTestResult.timeMs.toFixed(0)}ms</span></span>
						</div>
						<div class="rounded-lg bg-black/40 p-3 font-mono text-xs text-black/70 max-h-24 overflow-y-auto">
							[{embedTestResult.embedding.slice(0, 8).map(v => v.toFixed(4)).join(', ')}, ... ({embedTestResult.dims} total)]
						</div>
						<div class="text-xs text-black/40">
							L2 norm: {Math.sqrt(embedTestResult.embedding.reduce((s, v) => s + v * v, 0)).toFixed(4)}
							&middot; Min: {Math.min(...embedTestResult.embedding).toFixed(4)}
							&middot; Max: {Math.max(...embedTestResult.embedding).toFixed(4)}
						</div>
					</div>
				{/if}
			</div>

			<!-- Architecture Info -->
			<div class="rounded-lg border-2 border-black/20 bg-panel p-4">
				<h4 class="font-semibold text-black mb-2 uppercase tracking-wide">Cache → Embedding Pipeline</h4>
				<div class="text-xs text-black/60 font-mono space-y-1">
					<p>L0: LokiJS (in-memory, 5-10min TTL)</p>
					<p>L1: IndexedDB (persistent, 7-day TTL)</p>
					<p>L2: Memory Cache (server, 5min TTL)</p>
					<p>L3: Redis (server, configurable TTL)</p>
					<p>L4: embeddinggemma:latest → 768d via gRPC/HTTP</p>
					<p class="mt-2 text-black/40">Fallback: nomic-embed-text (384d)</p>
					<p class="text-black/40">Vector stores: pgvector + Qdrant ANN</p>
				</div>
			</div>
		</div>
	{/if}

	{#if activeTab === 'upload-sim'}
		<div class="space-y-4">
			<h3 class="text-lg font-semibold text-black uppercase tracking-wide">Upload Pipeline Simulator</h3>
			<p class="text-sm text-black/60">Simulates the 4-stage evidence processing pipeline (upload → extract → chunk → embed).</p>
			<DocumentUploadSimulator />
		</div>
	{/if}

	{#if activeTab === 'knowledge'}
		<div class="space-y-6">
			<h3 class="text-lg font-semibold text-black uppercase tracking-wide">Legal Knowledge Base</h3>
			<p class="text-sm text-black/60">Seed glossary terms, statutes, and legal precedents into PostgreSQL. Generate 768-dim embeddings via Ollama embeddinggemma for cosine similarity search. Index lawpdfs/ through the 8-stage RAG pipeline (MinIO → chunking → Qdrant + pgvector).</p>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
				<div class="rounded-lg border-2 border-black/20 bg-panel p-4">
					<h4 class="font-semibold text-black mb-2 uppercase tracking-wide">Seed Data</h4>
					<p class="text-xs text-black/60 mb-3">~60 glossary terms, ~25 statutes, ~20 precedents. Idempotent (skips duplicates).</p>
					<button
						class="w-full rounded-md border-2 border-accent bg-accent/10 px-4 py-2 text-sm font-mono uppercase tracking-wider text-accent transition hover:bg-accent/20 disabled:opacity-50"
						onclick={() => seedKnowledge(false)}
						disabled={seedStatus !== 'idle' && seedStatus !== 'done' && seedStatus !== 'error'}
					>
						{seedStatus === 'seeding' ? 'Seeding...' : 'Seed Knowledge Base'}
					</button>
				</div>

				<div class="rounded-lg border-2 border-black/20 bg-panel p-4">
					<h4 class="font-semibold text-black mb-2 uppercase tracking-wide">Seed + Embed</h4>
					<p class="text-xs text-black/60 mb-3">Seed data + generate embeddings via embeddinggemma:latest (768-dim, cosine). Stored in pgvector.</p>
					<button
						class="w-full rounded-md border-2 border-info bg-info/10 px-4 py-2 text-sm font-mono uppercase tracking-wider text-info transition hover:bg-info/20 disabled:opacity-50"
						onclick={() => seedKnowledge(true)}
						disabled={seedStatus !== 'idle' && seedStatus !== 'done' && seedStatus !== 'error'}
					>
						{seedStatus === 'embedding' ? 'Embedding...' : 'Seed + Embed'}
					</button>
				</div>

				<div class="rounded-lg border-2 border-black/20 bg-panel p-4">
					<h4 class="font-semibold text-black mb-2 uppercase tracking-wide">Index PDFs</h4>
					<p class="text-xs text-black/60 mb-3">Index 36 lawpdfs/ through evidence upload pipeline (MinIO → OCR → chunk → embed → Qdrant).</p>
					<button
						class="w-full rounded-md border-2 border-warning bg-warning/10 px-4 py-2 text-sm font-mono uppercase tracking-wider text-warning transition hover:bg-warning/20 disabled:opacity-50"
						onclick={indexPdfs}
						disabled={seedStatus !== 'idle' && seedStatus !== 'done' && seedStatus !== 'error'}
					>
						{seedStatus === 'indexing' ? 'Indexing PDFs...' : 'Index lawpdfs/ (36 PDFs)'}
					</button>
				</div>
			</div>

			{#if seedStatus === 'done' && seedResult}
				<div class="rounded-lg border-2 border-accent/30 bg-accent/5 p-4">
					<h4 class="font-semibold text-accent mb-2 uppercase tracking-wide">Result</h4>
					<pre class="text-xs text-black/80 font-mono whitespace-pre-wrap overflow-x-auto max-h-48">{JSON.stringify(seedResult, null, 2)}</pre>
				</div>
			{/if}

			{#if seedStatus === 'error'}
				<div class="rounded-lg border-2 border-danger/30 bg-danger/5 p-4">
					<h4 class="font-semibold text-danger mb-2 uppercase tracking-wide">Error</h4>
					<p class="text-sm text-danger/80">{seedError}</p>
				</div>
			{/if}

			<div class="rounded-lg border-2 border-black/20 bg-panel p-4">
				<h4 class="font-semibold text-black mb-2 uppercase tracking-wide">Pipeline Architecture</h4>
				<div class="text-xs text-black/60 font-mono space-y-1">
					<p>RAG: Qdrant vector search → confidence ranking → LLM generation</p>
					<p>KAG: Schema validation + W3C spec checks</p>
					<p>DAG: Cluster dependency ordering + fix priority</p>
					<p class="mt-2 text-black/40">Storage: pgvector (768-dim text) + Qdrant (Cosine ANN)</p>
					<p class="text-black/40">Embedding: embeddinggemma:latest → nomic-embed-text fallback</p>
					<p class="text-black/40">Search: /api/glossary/search, /api/statutes/search, /api/precedents/search</p>
				</div>
			</div>
		</div>
	{/if}

	{#if activeTab === 'spinners'}
		<div class="space-y-6">
			<h3 class="text-lg font-semibold text-black uppercase tracking-wide">Loading Spinners</h3>
			<p class="text-sm text-black/60">Animated loading indicators with size and color variants.</p>
			<div class="grid grid-cols-2 gap-6">
				<div class="p-4 bg-sand/10 rounded-lg border-2 border-black/10">
					<p class="text-xs text-black/40 mb-3 uppercase">Small / Blue</p>
					<LoadingSpinner size="sm" color="blue" message="Loading..." />
				</div>
				<div class="p-4 bg-sand/10 rounded-lg border-2 border-black/10">
					<p class="text-xs text-black/40 mb-3 uppercase">Medium / Green</p>
					<LoadingSpinner size="md" color="green" message="Processing evidence..." />
				</div>
				<div class="p-4 bg-sand/10 rounded-lg border-2 border-black/10">
					<p class="text-xs text-black/40 mb-3 uppercase">Large / Purple</p>
					<LoadingSpinner size="lg" color="purple" message="Analyzing documents..." />
				</div>
				<div class="p-4 bg-sand/10 rounded-lg border-2 border-black/10">
					<p class="text-xs text-black/40 mb-3 uppercase">Medium / Gray (No Message)</p>
					<LoadingSpinner size="md" color="gray" showMessage={false} />
				</div>
			</div>
		</div>
	{/if}

</div>

<EvidenceDrawer
	isOpen={showEvidenceDrawer}
	data={selectedEvidenceFile}
	isLoading={false}
	isSaving={isDrawerSaving}
	onClose={() => { showEvidenceDrawer = false; selectedEvidenceFile = null; }}
	onSave={async (updated) => {
		isDrawerSaving = true;
		try {
			await fetch(`/api/evidence/${updated.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updated)
			});
			showEvidenceDrawer = false;
			await loadEvidenceFiles();
		} catch (e) { console.error('Save failed:', e); }
		finally { isDrawerSaving = false; }
	}}
	onDelete={async (id) => {
		try {
			await fetch(`/api/evidence/${id}`, { method: 'DELETE' });
			showEvidenceDrawer = false;
			selectedEvidenceFile = null;
			await loadEvidenceFiles();
		} catch (e) { console.error('Delete failed:', e); }
	}}
/>

<style>
	.dt-tab-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 1rem;
		border-bottom: 2px solid rgba(0, 0, 0, 0.2);
	}
	.dt-tab {
		padding: 0.5rem 1rem;
		border-radius: 0.375rem 0.375rem 0 0;
		font-size: 0.875rem;
		text-transform: uppercase;
		color: rgba(0, 0, 0, 0.6);
		background: rgba(212, 199, 163, 0.2);
		cursor: pointer;
		transition: all 0.15s;
		font-weight: 600;
	}
	.dt-tab:hover {
		color: #000;
		background: rgba(212, 199, 163, 0.3);
	}
	.dt-tab.active {
		border-bottom: 2px solid #4ade80;
		color: #4ade80;
		background: rgba(212, 199, 163, 0.4);
		font-weight: 700;
	}
</style>