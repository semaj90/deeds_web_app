<script lang="ts">
	// Bundle Preview Panel
	// Fetches /api/codebase-index/export/bundle and renders a compact summary
	// of the exported indexing state so ACE/agentic tools can see live.

	interface GraphNode {
		id: string;
		path?: string;
		gpuCluster?: number | null;
		somCluster?: number | null;
		pageRank?: number | null;
		tags?: string[];
	}

	interface GraphEdge {
		src: string;
		dst: string;
		relation: string;
		weight?: number;
	}

	interface ClusterSummary {
		id: number;
		purpose: string | null;
		patterns: string[];
		warnings: string[];
		tags: string[];
		memberCount: number;
		hasSummaryEmbedding: boolean;
	}

	interface WikiNote {
		id: string;
		type: string;
		body: Record<string, unknown>;
	}

	interface BundleResponse {
		graph: { nodes: GraphNode[]; edges: GraphEdge[] } | null;
		clusters: ClusterSummary[] | null;
		wikiNotes: WikiNote[] | null;
		manifold4: Array<{ id: string; manifold: number[] }> | null;
		tileAtlas: { tileCount: number; source: string } | null;
		cacheStats: Record<string, number> | null;
		meta: {
			exportedAt: string;
			counts: Record<string, number>;
			sources: Record<string, boolean>;
			errors?: Record<string, string>;
		};
	}

	let bundle = $state<BundleResponse | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let limit = $state(200);

	const counts = $derived(bundle?.meta.counts ?? {});
	const sources = $derived(bundle?.meta.sources ?? {});
	const errors = $derived(bundle?.meta.errors ?? {});
	const wikiByType = $derived.by(() => {
		const byType = new Map<string, number>();
		for (const note of bundle?.wikiNotes ?? []) {
			byType.set(note.type, (byType.get(note.type) ?? 0) + 1);
		}
		return [...byType.entries()].sort((a, b) => b[1] - a[1]);
	});
	const clustersByPurpose = $derived(
		[...(bundle?.clusters ?? [])].sort((a, b) => b.memberCount - a.memberCount).slice(0, 5)
	);

	async function fetchBundle() {
		if (loading) return;
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/codebase-index/export/bundle?limit=${limit}`, {
				signal: AbortSignal.timeout(20_000)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			bundle = (await res.json()) as BundleResponse;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	async function downloadBundle(fullLimit = 2000) {
		try {
			const res = await fetch(`/api/codebase-index/export/bundle?limit=${fullLimit}`, {
				signal: AbortSignal.timeout(60_000)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `codebase-bundle-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	function downloadColab() {
		// Server serves the .ipynb directly; navigate to trigger browser download
		window.location.href = '/api/graph/colab-export';
	}

	function statusColor(ok: boolean): string {
		return ok ? 'text-green-400' : 'text-red-400';
	}
</script>

<section class="mb-8 rounded-xl border border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur">
	<div class="mb-4 flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold text-slate-100">Export Bundle Preview</h2>
			<p class="text-xs text-slate-400">
				GET /api/codebase-index/export/bundle — graph + clusters + wiki notes + manifold4 + tileAtlas + cacheStats
			</p>
		</div>
		<div class="flex items-center gap-2">
			<label class="flex items-center gap-1.5 text-xs text-slate-400">
				limit
				<input
					type="number"
					min="10"
					max="5000"
					bind:value={limit}
					disabled={loading}
					class="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs focus:border-cyan-500 focus:outline-none disabled:opacity-50"
				/>
			</label>
			<button
				onclick={fetchBundle}
				disabled={loading}
				class="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{loading ? 'Loading…' : bundle ? 'Refresh' : 'Preview'}
			</button>
			<button
				onclick={() => downloadBundle(2000)}
				disabled={loading}
				class="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700/50 disabled:opacity-50"
				title="Download full bundle as JSON file"
			>
				📦 JSON
			</button>
			<button
				onclick={downloadColab}
				class="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700/50"
				title="Download Jupyter notebook for Colab GPU analysis"
			>
				📓 Colab .ipynb
			</button>
		</div>
	</div>

	{#if error}
		<div class="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
			{error}
		</div>
	{/if}

	{#if !bundle && !loading}
		<div class="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center text-sm text-slate-500">
			Click <span class="text-cyan-400">Preview</span> to fetch the current export bundle.
			<br />
			Endpoint returns all 6 parts in one call for agentic tool consumption.
		</div>
	{/if}

	{#if bundle}
		<!-- Meta row — source health + counts -->
		<div class="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-6">
			{#each ['graph', 'clusters', 'wikiNotes', 'manifold4', 'tileAtlas', 'cacheStats'] as key (key)}
				<div class="rounded-lg border border-slate-700 bg-slate-900/30 p-2 text-center">
					<div class="text-xs text-slate-500">{key}</div>
					<div class="font-mono text-lg {statusColor(Boolean(sources[key]))}">
						{#if key === 'graph' && bundle.graph}
							{bundle.graph.nodes.length}n / {bundle.graph.edges.length}e
						{:else if counts[key === 'graph' ? 'nodes' : key] != null}
							{counts[key === 'graph' ? 'nodes' : key]}
						{:else if sources[key]}
							ok
						{:else}
							—
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Error panel if any source failed -->
		{#if Object.keys(errors).length > 0}
			<div class="mb-4 rounded-lg border border-orange-500/50 bg-orange-500/10 p-3 text-xs">
				<div class="mb-1 font-semibold text-orange-300">Degraded sources:</div>
				{#each Object.entries(errors) as [src, msg] (src)}
					<div class="text-orange-400">
						<span class="font-mono">{src}</span>: {msg}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Detail grids -->
		<div class="grid gap-4 lg:grid-cols-3">
			<!-- Top clusters -->
			<div class="rounded-lg border border-slate-700 bg-slate-900/30 p-3">
				<div class="mb-2 text-xs font-semibold text-cyan-400">Top clusters by size</div>
				{#if clustersByPurpose.length === 0}
					<div class="text-xs text-slate-600">no data</div>
				{:else}
					<div class="space-y-2">
						{#each clustersByPurpose as cluster (cluster.id)}
							<div class="border-l-2 border-cyan-500/50 pl-2">
								<div class="flex items-center justify-between text-xs">
									<span class="font-mono text-cyan-400">#{cluster.id}</span>
									<span class="text-slate-500">{cluster.memberCount} members</span>
								</div>
								<div class="truncate text-xs text-slate-300">{cluster.purpose ?? '(no purpose)'}</div>
								{#if cluster.warnings.length > 0}
									<div class="text-xs text-orange-400">⚠ {cluster.warnings.length} warning(s)</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Wiki notes by type -->
			<div class="rounded-lg border border-slate-700 bg-slate-900/30 p-3">
				<div class="mb-2 text-xs font-semibold text-orange-400">Karpathy wiki feedback</div>
				{#if wikiByType.length === 0}
					<div class="text-xs text-slate-600">no notes yet — run pipeline stages 6, 8, 10</div>
				{:else}
					<div class="space-y-1">
						{#each wikiByType as [type, count] (type)}
							<div class="flex items-center justify-between text-xs">
								<span class="text-slate-300">{type}</span>
								<span class="font-mono text-orange-400">{count}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Redis cache stats -->
			<div class="rounded-lg border border-slate-700 bg-slate-900/30 p-3">
				<div class="mb-2 text-xs font-semibold text-purple-400">Redis cache keys</div>
				{#if !bundle.cacheStats || Object.keys(bundle.cacheStats).length === 0}
					<div class="text-xs text-slate-600">no data</div>
				{:else}
					<div class="space-y-1">
						{#each Object.entries(bundle.cacheStats) as [pattern, count] (pattern)}
							<div class="flex items-center justify-between text-xs">
								<span class="truncate font-mono text-slate-400">{pattern}</span>
								<span class="font-mono text-purple-400">{count}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Footer meta -->
		<div class="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-500">
			<span>
				exported: {new Date(bundle.meta.exportedAt).toLocaleTimeString()}
			</span>
			{#if bundle.tileAtlas}
				<span>
					tiles: <span class="text-slate-300">{bundle.tileAtlas.tileCount}</span>
					from <span class="font-mono">{bundle.tileAtlas.source}</span>
				</span>
			{/if}
		</div>
	{/if}
</section>
