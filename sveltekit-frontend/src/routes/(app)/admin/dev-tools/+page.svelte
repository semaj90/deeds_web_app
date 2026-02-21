<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import EvidenceDrawer from '$lib/components/admin/EvidenceDrawer.svelte';
	import EvidenceDataGrid from '$lib/components/admin/EvidenceDataGrid.svelte';
	import CachePerformanceDashboard from '$lib/components/ai/CachePerformanceDashboard.svelte';
	import CacheDemo from '$lib/components/cache/CacheDemo.svelte';

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
	];

	// Reactive state
	let searchQuery = $state('');
	let searchResults = $state<Array<{ id: string; score: number; file: string; snippet: string }>>([]);
	let searching = $state(false);
	let indexingCodebase = $state(false);
	let indexingErrors = $state(false);
	let indexingLog = $state<string[]>([]);

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
			<h1 class="text-2xl font-bold text-sand">Dev Tools Hub</h1>
			<p class="mt-1 text-sm text-sand/60">
				Codebase indexing &bull; Service health &bull; Admin tools
			</p>
		</div>
		<div class="flex items-center gap-3">
			<span class="text-xs text-sand/40">Updated: {new Date(data.timestamp).toLocaleTimeString()}</span>
			<button
				class="rounded-md border border-sand/30 bg-panel px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-sand transition hover:border-accent hover:text-accent"
				onclick={refreshHealth}
			>
				Refresh
			</button>
		</div>
	</header>

	<!-- Top Stats Row -->
	<div class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
		<div class="flex items-center gap-3 rounded-lg border-2 bg-panel p-4 {healthyCount === totalServices ? 'border-accent/40' : 'border-warning/40'}">
			<span class="text-2xl">{healthyCount === totalServices ? '✅' : '⚠️'}</span>
			<div>
				<div class="text-xl font-bold text-sand">{healthyCount}/{totalServices}</div>
				<div class="text-[10px] uppercase tracking-wide text-sand/60">Services Up</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-info/40 bg-panel p-4">
			<span class="text-2xl">🔢</span>
			<div>
				<div class="text-xl font-bold text-sand">{totalVectors.toLocaleString()}</div>
				<div class="text-[10px] uppercase tracking-wide text-sand/60">Qdrant Vectors</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-accent/40 bg-panel p-4">
			<span class="text-2xl">📁</span>
			<div>
				<div class="text-xl font-bold text-sand">{codebaseIndexed.toLocaleString()}</div>
				<div class="text-[10px] uppercase tracking-wide text-sand/60">Code Indexed</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-warning/40 bg-panel p-4">
			<span class="text-2xl">🐛</span>
			<div>
				<div class="text-xl font-bold text-sand">{errorsIndexed.toLocaleString()}</div>
				<div class="text-[10px] uppercase tracking-wide text-sand/60">Errors Indexed</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-info/40 bg-panel p-4">
			<span class="text-2xl">🐳</span>
			<div>
				<div class="text-xl font-bold text-sand">{data.docker.length}</div>
				<div class="text-[10px] uppercase tracking-wide text-sand/60">Containers</div>
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
						<h3 class="font-semibold text-sand">{service.name}</h3>
						<span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider {service.status === 'healthy' ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger'}">
							{service.status}
						</span>
					</div>
					<div class="space-y-1 text-sm">
						{#if service.latencyMs !== undefined}
							<div class="flex justify-between">
								<span class="text-sand/60">Latency:</span>
								<span class="font-mono text-sand">{service.latencyMs}ms</span>
							</div>
						{/if}
						{#if service.details}
							<div class="flex justify-between">
								<span class="text-sand/60">Details:</span>
								<span class="font-mono text-xs text-sand/80">{service.details}</span>
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
				<h3 class="text-lg font-semibold text-sand">Codebase Indexing</h3>

				<div class="rounded-lg border-2 border-sand/20 bg-panel p-4">
					<div class="mb-3 flex items-center justify-between">
						<div>
							<div class="font-semibold text-sand">Code Index</div>
							<div class="text-xs text-sand/60">TypeScript + Svelte files → Qdrant + MinIO</div>
						</div>
						<span class="rounded-full bg-info/20 px-2 py-0.5 text-xs font-bold text-info">
							{codebaseIndexed} points
						</span>
					</div>
					<button
						class="w-full rounded-md border border-accent bg-accent/10 px-4 py-2 text-sm font-mono uppercase tracking-wider text-accent transition hover:bg-accent/20 disabled:opacity-50"
						onclick={() => triggerIndexing('codebase')}
						disabled={indexingCodebase}
					>
						{indexingCodebase ? 'Indexing...' : 'Index Codebase'}
					</button>
				</div>

				<div class="rounded-lg border-2 border-sand/20 bg-panel p-4">
					<div class="mb-3 flex items-center justify-between">
						<div>
							<div class="font-semibold text-sand">Error Index</div>
							<div class="text-xs text-sand/60">Error patterns → Qdrant for semantic search</div>
						</div>
						<span class="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-bold text-warning">
							{errorsIndexed} points
						</span>
					</div>
					<button
						class="w-full rounded-md border border-warning bg-warning/10 px-4 py-2 text-sm font-mono uppercase tracking-wider text-warning transition hover:bg-warning/20 disabled:opacity-50"
						onclick={() => triggerIndexing('errors')}
						disabled={indexingErrors}
					>
						{indexingErrors ? 'Indexing...' : 'Index Errors'}
					</button>
				</div>
			</div>

			<div>
				<h3 class="mb-2 text-lg font-semibold text-sand">Activity Log</h3>
				<div class="h-64 overflow-y-auto rounded-lg border-2 border-sand/20 bg-black/40 p-3 font-mono text-xs text-sand/80">
					{#if indexingLog.length === 0}
						<span class="text-sand/30">No activity yet. Trigger an indexing operation to see logs.</span>
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
					class="flex-1 rounded-lg border-2 border-sand/20 bg-panel px-4 py-2 text-sand placeholder-sand/40 transition focus:border-accent focus:outline-none"
					onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') searchCodebase(); }}
				/>
				<button
					class="rounded-lg border border-accent bg-accent/10 px-6 py-2 text-sm font-mono uppercase tracking-wider text-accent transition hover:bg-accent/20 disabled:opacity-50"
					onclick={searchCodebase}
					disabled={searching || !searchQuery.trim()}
				>
					{searching ? 'Searching...' : 'Search'}
				</button>
			</div>

			{#if searchResults.length > 0}
				<div class="space-y-2">
					{#each searchResults as result}
						<div class="rounded-lg border-2 border-sand/20 bg-panel p-4 transition hover:border-info/40">
							<div class="mb-2 flex items-center justify-between">
								<code class="rounded bg-sand/10 px-2 py-0.5 text-xs text-info">{result.file}</code>
								<span class="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">
									{(result.score * 100).toFixed(1)}%
								</span>
							</div>
							{#if result.snippet}
								<pre class="overflow-x-auto whitespace-pre-wrap text-xs text-sand/70">{result.snippet}</pre>
							{/if}
						</div>
					{/each}
				</div>
			{:else if searchQuery && !searching}
				<div class="rounded-lg border-2 border-dashed border-sand/20 p-8 text-center text-sand/40">
					No results. Try a different query or index the codebase first.
				</div>
			{/if}
		</div>
	{/if}

	<!-- Qdrant Tab -->
	{#if activeTab === 'qdrant'}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each data.qdrant.collections as collection}
				<div class="rounded-lg border-2 border-sand/20 bg-panel p-4 transition hover:border-info/40">
					<div class="mb-3 flex items-center justify-between">
						<h3 class="font-semibold text-sand">{collection.name}</h3>
						<span class="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
							{collection.status}
						</span>
					</div>
					<div class="space-y-1 text-sm">
						<div class="flex justify-between">
							<span class="text-sand/60">Points:</span>
							<span class="font-semibold text-sand">{collection.pointsCount.toLocaleString()}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-sand/60">Vector Size:</span>
							<span class="font-semibold text-sand">{collection.vectorSize}d</span>
						</div>
					</div>
				</div>
			{/each}

			{#if data.qdrant.collections.length === 0}
				<div class="col-span-full rounded-lg border-2 border-dashed border-sand/20 p-8 text-center text-sand/40">
					No Qdrant collections found. Is Qdrant running on port 6333?
				</div>
			{/if}
		</div>
	{/if}

	<!-- Docker Tab -->
	{#if activeTab === 'docker'}
		{#if data.docker.length > 0}
			<div class="overflow-hidden rounded-lg border-2 border-sand/20 bg-panel">
				<table class="w-full border-collapse">
					<thead>
						<tr class="border-b-2 border-sand/20 bg-panelSoft">
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-sand/60">Container</th>
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-sand/60">Status</th>
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-sand/60">Image</th>
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-sand/60">Ports</th>
						</tr>
					</thead>
					<tbody>
						{#each data.docker as container}
							<tr class="border-b border-sand/10 transition hover:bg-sand/5">
								<td class="p-3">
									<code class="text-xs text-sand">{container.name}</code>
								</td>
								<td class="p-3">
									<span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase {container.status === 'running' ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger'}">
										{container.status}
									</span>
								</td>
								<td class="p-3 text-xs text-sand/60">{container.image}</td>
								<td class="p-3 font-mono text-xs text-sand/60">{container.ports || '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="rounded-lg border-2 border-dashed border-sand/20 p-8 text-center text-sand/40">
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
					class="group rounded-lg border-2 border-sand/20 bg-panel p-4 transition hover:border-accent/40 hover:-translate-y-0.5 hover:shadow-md"
				>
					<div class="mb-2 flex items-center gap-2">
						<span class="text-xl">{tool.icon}</span>
						<h3 class="font-semibold text-sand group-hover:text-accent">{tool.name}</h3>
					</div>
					<p class="text-xs text-sand/60">{tool.desc}</p>
				</a>
			{/each}
		</div>
	{/if}

	<!-- Evidence Tab -->
	{#if activeTab === 'evidence'}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-semibold text-sand">Evidence File Manager</h3>
				<button
					class="rounded-md border border-info bg-info/10 px-4 py-1.5 text-xs font-mono uppercase tracking-wider text-info transition hover:bg-info/20"
					onclick={loadEvidenceFiles}
					disabled={isLoadingEvidence}
				>
					{isLoadingEvidence ? 'Loading...' : 'Refresh'}
				</button>
			</div>

			{#if evidenceFiles.length > 0}
				<div class="overflow-hidden rounded-lg border-2 border-sand/20 bg-panel">
					<table class="w-full border-collapse">
						<thead>
							<tr class="border-b-2 border-sand/20 bg-panelSoft">
								<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-sand/60">File</th>
								<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-sand/60">Type</th>
								<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-sand/60">Status</th>
								<th class="p-3 text-right text-xs font-bold uppercase tracking-wider text-sand/60">Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each evidenceFiles as file (file.id)}
								<tr class="border-b border-sand/10 transition hover:bg-sand/5">
									<td class="p-3">
										<div class="font-medium text-sand text-sm">{file.title ?? file.filename ?? file.fileName ?? 'Untitled'}</div>
										<div class="text-xs text-sand/40">{file.id}</div>
									</td>
									<td class="p-3 text-xs text-sand/60">{file.evidenceType ?? file.file_type ?? file.fileType ?? '—'}</td>
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
				<div class="rounded-lg border-2 border-dashed border-sand/20 p-8 text-center text-sand/40">
					No evidence files loaded. Click Refresh to fetch from the database.
				</div>
			{:else}
				<div class="flex items-center justify-center p-12">
					<div class="w-6 h-6 border-2 border-info border-t-transparent rounded-full animate-spin"></div>
					<span class="ml-3 text-sand/60">Loading evidence files...</span>
				</div>
			{/if}
			<!-- Advanced Data Grid -->
			<div class="mt-4">
				<button
					onclick={() => (showDataGrid = !showDataGrid)}
					class="rounded-md border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-mono uppercase tracking-wider text-accent transition hover:bg-accent/20"
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
			<CacheDemo />
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
		border-bottom: 2px solid rgba(212, 199, 163, 0.2);
	}
	.dt-tab {
		padding: 0.5rem 1rem;
		border-radius: 0.375rem 0.375rem 0 0;
		font-size: 0.875rem;
		text-transform: uppercase;
		color: rgba(212, 199, 163, 0.6);
		background: rgba(36, 33, 27, 0.4);
		cursor: pointer;
		transition: all 0.15s;
	}
	.dt-tab:hover {
		color: #d4c7a3;
		background: rgba(36, 33, 27, 0.6);
	}
	.dt-tab.active {
		border-bottom: 2px solid #4ade80;
		color: #4ade80;
		background: rgba(36, 33, 27, 0.7);
	}
</style>
