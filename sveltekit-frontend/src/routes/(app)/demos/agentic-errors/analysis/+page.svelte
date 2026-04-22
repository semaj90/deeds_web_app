<script lang="ts">
	import type { PageData } from './$types';
	import AgenticController from '$lib/components/agentic/AgenticController.svelte';

	const { data } = $props<{ data: PageData }>();

	let generating = $state(false);
	let reindexing = $state(false);
	let selectedCluster = $state<any>(null);
	let showAgenticController = $state(false);

	async function generateAnalysis() {
		generating = true;
		try {
			const res = await fetch('/api/phase89/analysis', { method: 'POST' });
			if (res.ok) {
				location.reload();
			}
		} finally {
			generating = false;
		}
	}

	async function triggerReindex() {
		reindexing = true;
		try {
			const res = await fetch('/api/phase89/reindex', { method: 'POST' });
			const result = await res.json();
			if (result.success) {
				// Refresh analysis after a short delay to let indexing start
				setTimeout(() => location.reload(), 2000);
			}
		} finally {
			reindexing = false;
		}
	}

	const priorityColors: Record<string, string> = {
		HIGH: 'bg-danger/20 border-danger text-danger',
		MED: 'bg-warning/20 border-warning text-warning',
		LOW: 'bg-info/20 border-info text-info',
	};

	const categoryIcons: Record<string, string> = {
		indexing: '📦',
		retrieval: '🔍',
		health: '🏥',
		pipeline: '⚙️',
	};
</script>

<svelte:head>
	<title>Error Analysis - Phase 89</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold text-black tracking-wide uppercase">RAG+KAG Error Analysis</h1>
			<p class="text-black/60 mt-2">
				Comprehensive analysis with Gemini AI, knowledge graph integration
			</p>
		</div>

		<button
			onclick={generateAnalysis}
			disabled={generating}
			class="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
		>
			{#if generating}
				⏳ Generating...
			{:else}
				🔄 Regenerate Analysis
			{/if}
		</button>
		<button
			onclick={triggerReindex}
			disabled={reindexing}
			class="px-4 py-2 bg-panel hover:bg-sand/20 text-black border-2 border-black/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
		>
			{reindexing ? '⏳ Re-indexing...' : '📦 Re-index Codebase'}
		</button>
	</div>

	<!-- Agentic Controller (error query + fix suggestions) -->
	<div class="mb-4">
		<button
			onclick={() => (showAgenticController = !showAgenticController)}
			class="px-4 py-2 bg-panel hover:bg-sand/20 text-black border-2 border-black/20 rounded-lg transition text-sm font-mono"
		>
			{showAgenticController ? '[-] Hide Agentic Controller' : '[+] Agentic Error Controller'}
		</button>
	</div>
	{#if showAgenticController}
		<div class="mb-6">
			<AgenticController />
		</div>
	{/if}

	{#if !data.hasGeminiKey}
		<div class="p-4 bg-info/20 border-2 border-info rounded-lg">
			<p class="text-black">
				ℹ️ Using the local Ollama stack for AI analysis.
			</p>
		</div>
	{/if}

	{#if data.analysis}
		<!-- Summary Cards -->
		<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
			<div class="p-4 bg-panel border-2 border-black/20 rounded-lg">
				<div class="text-sm text-black/60 uppercase tracking-wide">Collections</div>
				<div class="text-2xl font-bold text-black mt-1">
					{data.analysis.metadata.totalCollections}
				</div>
			</div>

			<div class="p-4 bg-panel border-2 border-black/20 rounded-lg">
				<div class="text-sm text-black/60 uppercase tracking-wide">Total Points</div>
				<div class="text-2xl font-bold text-black mt-1">
					{data.analysis.metadata.totalPoints.toLocaleString()}
				</div>
			</div>

			<div class="p-4 bg-panel border-2 border-black/20 rounded-lg">
				<div class="text-sm text-black/60 uppercase tracking-wide">Unique Tags</div>
				<div class="text-2xl font-bold text-black mt-1">
					{data.analysis.metadata.uniqueTags}
				</div>
			</div>

			<div class="p-4 bg-panel border-2 border-black/20 rounded-lg">
				<div class="text-sm text-black/60 uppercase tracking-wide">Last Updated</div>
				<div class="text-sm font-medium text-black mt-1">
					{new Date(data.timestamp).toLocaleString()}
				</div>
			</div>
		</div>

		<!-- Collections Overview -->
		<div class="bg-panel border-2 border-black/20 rounded-lg p-6">
			<h2 class="text-xl font-bold text-black mb-4 uppercase tracking-wide">📦 Collections Overview</h2>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
				{#each data.analysis.knowledge.collections as collection}
					<div class="p-4 bg-sand/10 border-2 border-black/20 rounded-lg">
						<h3 class="text-sm font-semibold text-accent truncate" title={collection.name}>{collection.name}</h3>
						<div class="grid grid-cols-2 gap-2 mt-2 text-sm">
							<div>
								<span class="text-black/60">Points:</span>
								<span class="text-black ml-1 font-medium">{(collection.points ?? 0).toLocaleString()}</span>
							</div>
							<div>
								<span class="text-black/60">Segments:</span>
								<span class="text-black ml-1 font-medium">{collection.segments ?? '—'}</span>
							</div>
						</div>
						<div class="mt-2">
							<span class="px-2 py-0.5 text-xs rounded border {
								collection.status === 'green' ? 'bg-accent/20 border-accent text-accent' :
								collection.status === 'yellow' ? 'bg-warning/20 border-warning text-warning' :
								'bg-danger/20 border-danger text-danger'
							}">
								{collection.status ?? 'unknown'}
							</span>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Cluster Health -->
		{#if data.analysis.clusterHealth}
			{@const ch = data.analysis.clusterHealth}
			<div class="bg-panel border-2 border-black/20 rounded-lg p-6">
				<h2 class="text-xl font-bold text-black mb-4 uppercase tracking-wide">🏥 Cluster Health</h2>
				<div class="grid grid-cols-2 md:grid-cols-5 gap-4">
					<div class="text-center">
						<div class="text-2xl font-bold text-black">{ch.totalClusters}</div>
						<div class="text-xs text-black/60 uppercase">Error Clusters</div>
					</div>
					<div class="text-center">
						<div class="text-2xl font-bold text-black">{ch.errorEvents}</div>
						<div class="text-xs text-black/60 uppercase">Error Events</div>
					</div>
					<div class="text-center">
						<div class="text-2xl font-bold" class:text-accent={ch.codebaseChunksInQdrant > 0} class:text-danger={ch.codebaseChunksInQdrant === 0}>
							{ch.codebaseChunksInQdrant.toLocaleString()}
						</div>
						<div class="text-xs text-black/60 uppercase">Codebase Chunks</div>
					</div>
					<div class="text-center">
						<div class="text-2xl font-bold text-black">{ch.phase89ChunksInQdrant.toLocaleString()}</div>
						<div class="text-xs text-black/60 uppercase">P89 Error Chunks</div>
					</div>
					<div class="text-center">
						<div class="text-2xl font-bold text-black">{ch.phase90CardsInQdrant.toLocaleString()}</div>
						<div class="text-xs text-black/60 uppercase">P90 Error Cards</div>
					</div>
				</div>

				{#if ch.codebaseChunksInQdrant === 0}
					<div class="mt-4 p-3 bg-danger/10 border-2 border-danger/30 rounded-lg flex items-center justify-between">
						<span class="text-danger text-sm font-medium">Codebase index empty — semantic search disabled</span>
						<button
							onclick={triggerReindex}
							disabled={reindexing}
							class="px-3 py-1 bg-danger hover:bg-danger/80 text-white text-sm rounded disabled:opacity-50 transition-colors"
						>
							{reindexing ? '⏳ Indexing...' : '🔄 Re-index Now'}
						</button>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Recommendations -->
		{#if data.analysis.recommendations}
			<div class="bg-panel border-2 border-black/20 rounded-lg p-6">
				<h2 class="text-xl font-bold text-black mb-4 uppercase tracking-wide">💡 Recommendations</h2>

				<div class="space-y-3">
					{#each data.analysis.recommendations as rec}
						{@const isStructured = typeof rec === 'object' && rec.priority}
						{#if isStructured}
							<div class="p-4 bg-sand/10 border-2 border-black/20 rounded-lg">
								<div class="flex items-start gap-3">
									<span class="text-xl">{categoryIcons[rec.category] ?? '📋'}</span>
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2 mb-1">
											<span class="font-semibold text-black">{rec.title}</span>
											<span class="px-2 py-0.5 text-xs rounded border-2 {priorityColors[rec.priority] ?? 'bg-info/20 border-info text-info'}">
												{rec.priority}
											</span>
										</div>
										<p class="text-sm text-black/60 mb-2">{rec.detail}</p>
										<div class="flex items-center gap-3">
											<pre class="flex-1 p-2 bg-black/5 border border-black/10 rounded text-xs text-accent overflow-x-auto">{rec.action}</pre>
											{#if rec.action.startsWith('POST /api/phase89/reindex') || rec.action.includes('codebase-index')}
												<button
													onclick={triggerReindex}
													disabled={reindexing}
													class="px-3 py-1 bg-accent hover:bg-accent/80 text-white text-xs rounded disabled:opacity-50 transition-colors whitespace-nowrap"
												>
													{reindexing ? '⏳...' : '▶ Run'}
												</button>
											{/if}
										</div>
										{#if rec.estimatedImpact}
											<div class="text-xs text-black/40 mt-2">Impact: {rec.estimatedImpact}</div>
										{/if}
									</div>
								</div>
							</div>
						{:else}
							<!-- Legacy string recommendation -->
							<div class="p-3 bg-sand/10 border-2 border-black/20 rounded text-sm text-black">
								{rec}
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/if}

		<!-- AI Analysis Summary -->
		{#if data.analysis.analysis}
			<div class="bg-panel border-2 border-black/20 rounded-lg p-6">
				<h2 class="text-xl font-bold text-black mb-4 uppercase tracking-wide">🧠 AI Analysis</h2>

				{#if typeof data.analysis.analysis === 'string'}
					<p class="text-black leading-relaxed">{data.analysis.analysis}</p>
				{:else if data.analysis.analysis.rawAnalysis}
					<pre class="p-4 bg-black/30 border-2 border-black/20 rounded text-sm text-black whitespace-pre-wrap overflow-x-auto">{data.analysis.analysis.rawAnalysis}</pre>
				{:else}
					<pre class="p-4 bg-black/30 border-2 border-black/20 rounded text-sm text-black overflow-x-auto">{JSON.stringify(data.analysis.analysis, null, 2)}</pre>
				{/if}
			</div>
		{/if}
	{:else}
		<!-- No analysis yet -->
		<div class="bg-panel border-2 border-black/20 rounded-lg p-12 text-center">
			<div class="text-6xl mb-4">📊</div>
			<h2 class="text-2xl font-bold text-black mb-2 uppercase tracking-wide">No Analysis Generated Yet</h2>
			<p class="text-black/60 mb-6">
				Click "Regenerate Analysis" to start comprehensive error analysis with RAG+KAG integration.
			</p>

			<button
				onclick={generateAnalysis}
				class="px-6 py-3 bg-accent hover:bg-accent/80 text-white rounded-lg transition-colors"
			>
				🚀 Generate First Analysis
			</button>
		</div>
	{/if}
</div>
