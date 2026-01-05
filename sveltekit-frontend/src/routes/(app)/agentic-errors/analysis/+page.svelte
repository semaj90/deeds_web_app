<script lang="ts">
	import type { PageData } from './$types';

	const { data } = $props<{ data: PageData }>();

	let generating = $state(false);
	let selectedCluster = $state<any>(null);

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
			<h1 class="text-3xl font-bold text-white">RAG+KAG Error Analysis</h1>
			<p class="text-gray-400 mt-2">
				Comprehensive analysis with Gemini AI, knowledge graph integration
			</p>
		</div>

		<button
			onclick={generateAnalysis}
			disabled={generating || !data.hasGeminiKey}
			class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
		>
			{#if generating}
				⏳ Generating...
			{:else}
				🔄 Regenerate Analysis
			{/if}
		</button>
	</div>

	{#if !data.hasGeminiKey}
		<div class="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
			<p class="text-yellow-400">
				⚠️ <strong>GEMINI_API_KEY</strong> not set in .env. Add your API key to enable AI analysis.
			</p>
		</div>
	{/if}

	{#if data.analysis}
		<!-- Summary Cards -->
		<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
			<div class="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
				<div class="text-sm text-gray-400">Collections</div>
				<div class="text-2xl font-bold text-white mt-1">
					{data.analysis.metadata.totalCollections}
				</div>
			</div>

			<div class="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
				<div class="text-sm text-gray-400">Total Points</div>
				<div class="text-2xl font-bold text-white mt-1">
					{data.analysis.metadata.totalPoints.toLocaleString()}
				</div>
			</div>

			<div class="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
				<div class="text-sm text-gray-400">Unique Tags</div>
				<div class="text-2xl font-bold text-white mt-1">
					{data.analysis.metadata.uniqueTags}
				</div>
			</div>

			<div class="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
				<div class="text-sm text-gray-400">Last Updated</div>
				<div class="text-sm font-medium text-white mt-1">
					{new Date(data.timestamp).toLocaleString()}
				</div>
			</div>
		</div>

		<!-- Collections Overview -->
		<div class="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
			<h2 class="text-xl font-bold text-white mb-4">📦 Collections Overview</h2>

			<div class="space-y-4">
				{#each data.analysis.knowledge.collections as collection}
					<div class="p-4 bg-gray-900/50 border border-gray-600 rounded-lg">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<h3 class="text-lg font-semibold text-purple-400">{collection.name}</h3>
								<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
									<div>
										<span class="text-gray-400">Points:</span>
										<span class="text-white ml-2 font-medium">{collection.points.toLocaleString()}</span>
									</div>
									<div>
										<span class="text-gray-400">Vector Size:</span>
										<span class="text-white ml-2 font-medium">{collection.vectorSize}</span>
									</div>
									<div>
										<span class="text-gray-400">Tags:</span>
										<span class="text-white ml-2 font-medium">{collection.tags.length}</span>
									</div>
									<div>
										<span class="text-gray-400">File Types:</span>
										<span class="text-white ml-2 font-medium">{collection.fileTypes.join(', ')}</span>
									</div>
								</div>

								{#if collection.tags.length > 0}
									<div class="mt-3">
										<div class="text-xs text-gray-400 mb-2">Top Tags:</div>
										<div class="flex flex-wrap gap-2">
											{#each collection.tags.slice(0, 10) as tag}
												<span class="px-2 py-1 bg-purple-900/30 border border-purple-500/30 text-purple-300 text-xs rounded">
													{tag}
												</span>
											{/each}
										</div>
									</div>
								{/if}

								{#if collection.errorTypes.length > 0}
									<div class="mt-3">
										<div class="text-xs text-gray-400 mb-2">Error Types:</div>
										<div class="flex flex-wrap gap-2">
											{#each collection.errorTypes as errorType}
												<span class="px-2 py-1 bg-red-900/30 border border-red-500/30 text-red-300 text-xs rounded">
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
			<div class="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
				<h2 class="text-xl font-bold text-white mb-4">💡 Recommendations</h2>

				<div class="space-y-6">
					{#each data.analysis.recommendations as category}
						<div>
							<h3 class="text-lg font-semibold text-purple-400 mb-3">{category.category}</h3>
							<div class="space-y-2">
								{#each category.items as item}
									<div class="p-3 bg-gray-900/50 border border-gray-600 rounded">
										<div class="flex items-start justify-between">
											<div class="flex-1">
												<div class="text-white font-medium">
													{item.action || item.tool}
												</div>
												{#if item.reason}
													<div class="text-sm text-gray-400 mt-1">{item.reason}</div>
												{/if}
												{#if item.command}
													<pre class="mt-2 p-2 bg-black/50 border border-gray-700 rounded text-xs text-green-400 overflow-x-auto">{item.command}</pre>
												{/if}
												{#if item.args}
													<div class="mt-2 text-xs text-gray-500">
														Args: {JSON.stringify(item.args)}
													</div>
												{/if}
											</div>
											<span class="ml-4 px-2 py-1 text-xs rounded {
												item.priority === 'high' ? 'bg-red-900/30 border border-red-500/30 text-red-300' :
												item.priority === 'medium' ? 'bg-yellow-900/30 border border-yellow-500/30 text-yellow-300' :
												'bg-blue-900/30 border border-blue-500/30 text-blue-300'
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
			<div class="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
				<h2 class="text-xl font-bold text-white mb-4">🧠 Gemini AI Analysis</h2>

				{#if data.analysis.analysis.rawAnalysis}
					<pre class="p-4 bg-black/50 border border-gray-700 rounded text-sm text-gray-300 whitespace-pre-wrap overflow-x-auto">{data.analysis.analysis.rawAnalysis}</pre>
				{:else}
					<pre class="p-4 bg-black/50 border border-gray-700 rounded text-sm text-gray-300 overflow-x-auto">{JSON.stringify(data.analysis.analysis, null, 2)}</pre>
				{/if}
			</div>
		{/if}
	{:else}
		<!-- No analysis yet -->
		<div class="bg-gray-800/50 border border-gray-700 rounded-lg p-12 text-center">
			<div class="text-6xl mb-4">📊</div>
			<h2 class="text-2xl font-bold text-white mb-2">No Analysis Generated Yet</h2>
			<p class="text-gray-400 mb-6">
				Click "Regenerate Analysis" to start comprehensive error analysis with RAG+KAG integration.
			</p>

			{#if data.hasGeminiKey}
				<button
					onclick={generateAnalysis}
					class="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
				>
					🚀 Generate First Analysis
				</button>
			{:else}
				<p class="text-yellow-400">Set GEMINI_API_KEY in .env first</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	:global(body) {
		background: linear-gradient(to bottom right, #1a1a2e, #16213e);
	}
</style>
