<script lang="ts">
	import type { PageData } from './$types';
	import AgenticController from '$lib/components/agentic/AgenticController.svelte';

	const { data } = $props<{ data: PageData }>();

	let generating = $state(false);
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
			disabled={generating || !data.hasGeminiKey}
			class="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
		>
			{#if generating}
				⏳ Generating...
			{:else}
				🔄 Regenerate Analysis
			{/if}
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
		<div class="p-4 bg-warning/20 border-2 border-warning rounded-lg">
			<p class="text-black">
				⚠️ <strong>GEMINI_API_KEY</strong> not set in .env. Add your API key to enable AI analysis.
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

			<div class="space-y-4">
				{#each data.analysis.knowledge.collections as collection}
					<div class="p-4 bg-sand/10 border-2 border-black/20 rounded-lg">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<h3 class="text-lg font-semibold text-accent">{collection.name}</h3>
								<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
									<div>
										<span class="text-black/60">Points:</span>
										<span class="text-black ml-2 font-medium">{collection.points.toLocaleString()}</span>
									</div>
									<div>
										<span class="text-black/60">Vector Size:</span>
										<span class="text-black ml-2 font-medium">{collection.vectorSize}</span>
									</div>
									<div>
										<span class="text-black/60">Tags:</span>
										<span class="text-black ml-2 font-medium">{collection.tags.length}</span>
									</div>
									<div>
										<span class="text-black/60">File Types:</span>
										<span class="text-black ml-2 font-medium">{collection.fileTypes.join(', ')}</span>
									</div>
								</div>

								{#if collection.tags.length > 0}
									<div class="mt-3">
										<div class="text-xs text-black/60 mb-2 uppercase tracking-wide">Top Tags:</div>
										<div class="flex flex-wrap gap-2">
											{#each collection.tags.slice(0, 10) as tag}
												<span class="px-2 py-1 bg-accent/20 border border-accent text-accent text-xs rounded">
													{tag}
												</span>
											{/each}
										</div>
									</div>
								{/if}

								{#if collection.errorTypes.length > 0}
									<div class="mt-3">
										<div class="text-xs text-black/60 mb-2 uppercase tracking-wide">Error Types:</div>
										<div class="flex flex-wrap gap-2">
											{#each collection.errorTypes as errorType}
												<span class="px-2 py-1 bg-danger/20 border border-danger text-danger text-xs rounded">
													{errorType}
												</span>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Recommendations -->
		{#if data.analysis.recommendations}
			<div class="bg-panel border-2 border-black/20 rounded-lg p-6">
				<h2 class="text-xl font-bold text-black mb-4 uppercase tracking-wide">💡 Recommendations</h2>

				<div class="space-y-6">
					{#each data.analysis.recommendations as category}
						<div>
							<h3 class="text-lg font-semibold text-accent mb-3">{category.category}</h3>
							<div class="space-y-2">
								{#each category.items as item}
									<div class="p-3 bg-sand/10 border-2 border-black/20 rounded">
										<div class="flex items-start justify-between">
											<div class="flex-1">
												<div class="text-black font-medium">
													{item.action || item.tool}
												</div>
												{#if item.reason}
													<div class="text-sm text-black/60 mt-1">{item.reason}</div>
												{/if}
												{#if item.command}
													<pre class="mt-2 p-2 bg-black/30 border-2 border-black/20 rounded text-xs text-accent overflow-x-auto">{item.command}</pre>
												{/if}
												{#if item.args}
													<div class="mt-2 text-xs text-black/40">
														Args: {JSON.stringify(item.args)}
													</div>
												{/if}
											</div>
											<span class="ml-4 px-2 py-1 text-xs rounded border-2 {
												item.priority === 'high' ? 'bg-danger/20 border-danger text-danger' :
												item.priority === 'medium' ? 'bg-warning/20 border-warning text-warning' :
												'bg-info/20 border-info text-info'
											}">
												{item.priority}
											</span>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Gemini Analysis -->
		{#if data.analysis.analysis}
			<div class="bg-panel border-2 border-black/20 rounded-lg p-6">
				<h2 class="text-xl font-bold text-black mb-4 uppercase tracking-wide">🧠 Gemini AI Analysis</h2>

				{#if data.analysis.analysis.rawAnalysis}
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

			{#if data.hasGeminiKey}
				<button
					onclick={generateAnalysis}
					class="px-6 py-3 bg-accent hover:bg-accent/80 text-white rounded-lg transition-colors"
				>
					🚀 Generate First Analysis
				</button>
			{:else}
				<p class="text-warning">Set GEMINI_API_KEY in .env first</p>
			{/if}
		</div>
	{/if}
</div>
