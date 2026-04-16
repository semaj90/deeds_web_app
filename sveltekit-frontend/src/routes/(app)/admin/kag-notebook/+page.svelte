<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let cells = $derived(data.cells ?? []);
	let stats = $derived(data.stats ?? { totalCells: 0, totalFiles: 0, errorClusters: 0, errorCards: 0, highRiskFiles: 0, aceReadyCells: 0, gpuClusters: 0, importRecos: 0 });
	let loadError = $derived(data.error);

	// UI state
	let expandedCells = $state<Set<string>>(new Set());
	let aceResults = $state<Record<string, { loading: boolean; context: unknown; degraded: boolean; error?: string }>>({});
	let exportStatus = $state<'idle' | 'loading' | 'done' | 'error'>('idle');
	let exportPath = $state('');
	let filterRisk = $state('all');
	let filterType = $state('all');

	function toggleCell(id: string) {
		const next = new Set(expandedCells);
		next.has(id) ? next.delete(id) : next.add(id);
		expandedCells = next;
	}

	let filteredCells = $derived(
		cells.filter((c: any) => {
			if (filterType !== 'all' && c.type !== filterType) return false;
			if (filterRisk === 'ace-only' && !c.aceReady) return false;
			if (filterRisk === 'has-errors' && c.errorCount === 0) return false;
			return true;
		})
	);

	async function fixWithAce(cellId: string, errorId: string) {
		aceResults = { ...aceResults, [cellId]: { loading: true, context: null, degraded: false } };
		try {
			const res = await fetch('/api/codebase-index/kag-notebook', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'ace-fix', errorId })
			});
			const data = await res.json();
			aceResults = { ...aceResults, [cellId]: { loading: false, context: data.aceContext, degraded: data.degraded ?? false } };
		} catch {
			aceResults = { ...aceResults, [cellId]: { loading: false, context: null, degraded: false, error: 'Request failed' } };
		}
	}

	async function exportToObsidian() {
		exportStatus = 'loading';
		try {
			const res = await fetch('/api/codebase-index/kag-notebook', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'export-obsidian' })
			});
			const data = await res.json();
			if (!res.ok || data.error) {
				exportStatus = 'error';
				exportPath = data.detail ?? data.error ?? 'Export failed';
			} else {
				exportStatus = 'done';
				exportPath = data.path;
			}
		} catch {
			exportStatus = 'error';
			exportPath = 'Network error';
		}
	}

	function riskBadgeClass(risk: string): string {
		if (risk === 'high') return 'bg-red-500/20 text-red-400 border border-red-500/40';
		if (risk === 'med') return 'bg-orange-500/20 text-orange-400 border border-orange-500/40';
		return 'bg-green-500/20 text-green-400 border border-green-500/40';
	}

	function riskDot(risk: string): string {
		if (risk === 'high') return '🔴';
		if (risk === 'med') return '🟡';
		return '🟢';
	}
</script>

<div class="min-h-screen bg-gray-950 text-gray-100 p-6">
	<!-- Header -->
	<div class="mb-6 flex items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold text-white">KAG Error Notebook</h1>
			<p class="mt-1 text-sm text-gray-400">
				GPU codebase index × Neo4j graph × ACE error fixing
			</p>
		</div>
		<div class="flex gap-2 flex-shrink-0">
			<button
				onclick={() => invalidateAll()}
				class="px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600"
			>
				↺ Refresh
			</button>
			<button
				onclick={exportToObsidian}
				disabled={exportStatus === 'loading'}
				class="px-3 py-1.5 text-sm rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white border border-purple-500"
			>
				{exportStatus === 'loading' ? 'Exporting…' : '📓 Export to Obsidian'}
			</button>
		</div>
	</div>

	<!-- Export feedback -->
	{#if exportStatus === 'done'}
		<div class="mb-4 rounded p-3 bg-green-900/40 border border-green-600/50 text-green-300 text-sm">
			✅ Exported to Obsidian: <code class="ml-1 text-green-200">{exportPath}</code>
		</div>
	{:else if exportStatus === 'error'}
		<div class="mb-4 rounded p-3 bg-red-900/40 border border-red-600/50 text-red-300 text-sm">
			❌ Export failed: {exportPath}
		</div>
	{/if}

	{#if loadError}
		<div class="mb-4 rounded p-3 bg-yellow-900/40 border border-yellow-600/50 text-yellow-300 text-sm">
			⚠️ {loadError} — showing cached data or empty state
		</div>
	{/if}

	<!-- Stats row -->
	<div class="mb-6 grid grid-cols-4 gap-3 sm:grid-cols-8">
		{#each [
			{ label: 'Cells', value: stats.totalCells },
			{ label: 'Indexed Files', value: stats.totalFiles },
			{ label: 'Error Clusters', value: stats.errorClusters },
			{ label: 'Error Cards', value: stats.errorCards },
			{ label: 'High Risk', value: stats.highRiskFiles },
			{ label: 'ACE Ready', value: stats.aceReadyCells },
			{ label: 'GPU Clusters', value: stats.gpuClusters },
			{ label: 'Import Recos', value: stats.importRecos }
		] as s}
			<div class="rounded-lg border border-gray-700 bg-gray-900 p-3 text-center">
				<div class="text-xl font-bold text-white">{s.value}</div>
				<div class="text-xs text-gray-400 mt-0.5">{s.label}</div>
			</div>
		{/each}
	</div>

	<!-- Filters -->
	<div class="mb-4 flex gap-3 items-center text-sm">
		<span class="text-gray-500">Filter:</span>
		<select
			bind:value={filterType}
			class="rounded bg-gray-800 border border-gray-600 text-gray-200 px-2 py-1"
		>
			<option value="all">All types</option>
			<option value="error-cluster">Error clusters</option>
			<option value="file-profile">File profiles</option>
		</select>
		<select
			bind:value={filterRisk}
			class="rounded bg-gray-800 border border-gray-600 text-gray-200 px-2 py-1"
		>
			<option value="all">All cells</option>
			<option value="ace-only">ACE ready only</option>
			<option value="has-errors">Has errors</option>
		</select>
		<span class="text-gray-500 ml-auto">{filteredCells.length} of {cells.length}</span>
	</div>

	<!-- Notebook cells -->
	{#if filteredCells.length === 0}
		<div class="rounded-lg border border-gray-700 bg-gray-900 p-12 text-center text-gray-500">
			{#if cells.length === 0}
				No data yet — run the <strong class="text-gray-300">GPU codebase indexer</strong> first, or
				re-index via the VS Code task <code class="text-gray-300">Qdrant: Index Codebase (Full)</code>.
			{:else}
				No cells match the current filter.
			{/if}
		</div>
	{/if}

	<div class="flex flex-col gap-3">
		{#each filteredCells as cell (cell.id)}
			{@const expanded = expandedCells.has(cell.id)}
			{@const ace = aceResults[cell.id]}
			<div class="rounded-lg border border-gray-700 bg-gray-900 overflow-hidden">
				<!-- Cell header -->
				<button
					onclick={() => toggleCell(cell.id)}
					class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-800/60 transition-colors"
				>
					<span class="text-gray-400 text-xs font-mono w-4">{expanded ? '▼' : '▶'}</span>
					<span class="flex-1 font-medium text-white truncate">{cell.title}</span>
					<div class="flex items-center gap-2 flex-shrink-0">
						{#if cell.errorCount > 0}
							<span class="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40">
								{cell.errorCount} errors
							</span>
						{/if}
						{#if cell.aceReady}
							<span class="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40">
								ACE ✓
							</span>
						{/if}
						<span class="text-xs text-gray-500">{cell.type}</span>
					</div>
				</button>

				<!-- Cell body -->
				{#if expanded}
					<div class="border-t border-gray-700 px-4 py-4 space-y-4">
						<p class="text-sm text-gray-300">{cell.summary}</p>

						<!-- Top errors -->
						{#if cell.topErrors.length > 0}
							<div>
								<h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Top Errors</h3>
								<div class="space-y-1">
									{#each cell.topErrors as e}
										<div class="flex items-start gap-2 text-sm font-mono bg-gray-800/60 rounded px-3 py-1.5">
											<span class="text-red-400 flex-shrink-0">{e.code}</span>
											<span class="text-gray-300 flex-1 truncate">{e.message}</span>
											{#if e.file}
												<span class="text-gray-500 text-xs truncate max-w-48">{e.file.split('/').slice(-2).join('/')}</span>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Related files -->
						{#if cell.relatedFiles.length > 0}
							<div>
								<h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Related Files</h3>
								<div class="flex flex-wrap gap-1.5">
									{#each cell.relatedFiles as f}
										<span class="text-xs px-2 py-0.5 rounded font-mono {riskBadgeClass(f.risk)}">
											{riskDot(f.risk)} {f.path.split('/').slice(-2).join('/')}
											<span class="opacity-60 ml-1">{f.role}</span>
										</span>
									{/each}
								</div>
							</div>
						{/if}

						<!-- KAG context (if present) -->
						<!-- GPU cluster info -->
						{#if cell.gpuClusterId !== undefined}
							<div class="flex items-center gap-2 text-xs text-gray-400">
								<span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
									GPU cluster {cell.gpuClusterId}
								</span>
								{#if cell.gpuClusterSize}
									<span>{cell.gpuClusterSize} files in cluster</span>
								{/if}
							</div>
						{/if}

						<!-- Import recommendations (CouchDB MapReduce) -->
						{#if cell.importRecommendations?.length}
							<div>
								<h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">GPU Import Recommendations</h3>
								<div class="space-y-1">
									{#each cell.importRecommendations as r}
										<div class="flex items-center gap-2 text-xs bg-indigo-900/20 border border-indigo-700/40 rounded px-3 py-1.5">
											<span class="text-indigo-300 font-mono truncate flex-1">{r.targetPath.split('/').slice(-2).join('/')}</span>
											<span class="text-gray-400 flex-shrink-0">sim {r.similarity.toFixed(3)}</span>
											{#if r.reason}
												<span class="text-gray-500 truncate max-w-40">{r.reason}</span>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}

						{#if cell.kagContext}
							<div>
								<h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">KAG Context</h3>
								<pre class="text-xs text-gray-300 bg-gray-800/60 rounded p-3 overflow-x-auto whitespace-pre-wrap">{cell.kagContext}</pre>
							</div>
						{/if}

						<!-- ACE fix section -->
						<div class="border-t border-gray-700/60 pt-3 flex items-start gap-3">
							<button
								onclick={() => fixWithAce(cell.id, cell.topErrors[0]?.code ? `${cell.id}-${cell.topErrors[0].code}` : cell.id)}
								disabled={!cell.aceReady || ace?.loading}
								class="px-3 py-1.5 text-sm rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white border border-blue-500 flex-shrink-0"
							>
								{ace?.loading ? 'Analyzing…' : '🔧 Fix with ACE'}
							</button>
							{#if !cell.aceReady}
								<span class="text-xs text-gray-500 self-center">No error cards indexed for this cluster yet</span>
							{/if}
						</div>

						<!-- ACE result -->
						{#if ace && !ace.loading}
							<div class="rounded border {ace.error ? 'border-red-600/40 bg-red-900/20' : ace.degraded ? 'border-yellow-600/40 bg-yellow-900/20' : 'border-blue-600/40 bg-blue-900/20'} p-3">
								{#if ace.error}
									<p class="text-sm text-red-400">Error: {ace.error}</p>
								{:else if ace.degraded}
									<p class="text-sm text-yellow-400">⚠️ Neo4j unavailable — KAG operating in degraded mode. Start Neo4j to enable full graph traversal.</p>
								{:else}
									<h4 class="text-xs font-semibold text-blue-400 mb-2">ACE Root-Cause Analysis</h4>
									<pre class="text-xs text-gray-200 whitespace-pre-wrap overflow-x-auto">{JSON.stringify(ace.context, null, 2)}</pre>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>
