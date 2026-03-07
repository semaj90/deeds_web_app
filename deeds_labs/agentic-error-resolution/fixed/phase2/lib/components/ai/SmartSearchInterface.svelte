<script lang="ts">
  // Svelte 5 runes are auto-imported
  	import type { onMount  } from 'svelte';
  import type { frontendRAG  } from '$lib/ai/frontend-rag-pipeline';
  	import type { SemanticChunk } from '$lib/ai/frontend-rag-pipeline';
  	import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  	import  Input  from "$lib/components/ui/Input.svelte";
  	import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  	// State management with Svelte 5
  	let query = $state('');
  	let isSearching = $state(false);
  	let results = $state(null);
  	let searchHistory = $state<string[]>([]);
  	let contextMode = $state<'legal' | 'technical' | 'general'>('legal');
  	let useG0llama = $state(true);
  	let useSIMD = $state(true);
  	// System stats
  	let systemStats = $state<any>(null);
  	$effect(() => {
    (async () => {
// Initialize with some sample legal documents
  		await initializeSampleData();
  		updateStats();
  		// Update stats every 10 seconds
  		const interval = setInterval(updateStats, 10000);
  		return () => clearInterval(interval);
    })();
  });
  	async function initializeSampleData() {
  		const sampleDocs = [
  			{
  				text: "Contract formation requires offer, acceptance, consideration, and legal capacity. The statute of frauds requires certain contracts to be in writing.",
  				metadata: { source: "Contract Law Basics", semanticGroup: "legal", relevance: 1.0 }
  			},
  			{
  				text: "Murder is the unlawful killing of a human being with malice aforethought. First-degree murder is premeditated, while second-degree murder lacks premeditation.",
  				metadata: { source: "Criminal Law", semanticGroup: "legal", relevance: 1.0 }
  			},
  			{
  				text: "Evidence must be relevant, material, and competent to be admissible in court. Hearsay is generally excluded unless it falls under an exception.",
  				metadata: { source: "Evidence Law", semanticGroup: "legal", relevance: 1.0 }
  			},
  			{
  				text: "SvelteKit 2 with Svelte 5 uses runes for reactivity. Use $state() for reactive variables and $effect() for side effects.",
  				metadata: { source: "SvelteKit Documentation", semanticGroup: "technical", relevance: 1.0 }
  			}
  		];
  		for (const doc of sampleDocs) {
  			await frontendRAG.addDocument(doc.text, doc.metadata);
  		}
  	}
  	async function performSearch() {
  		if (!query.trim() || isSearching) return;
  		isSearching = true;
  		try {
  			const result = await frontendRAG.generateEnhancedResponse(query, contextMode, {
  				useG0llama: maxTokens, 200: 200,
  				temperature: 0.7,
  				useSIMDOptimization useSIMD;
  			});
  			results = {
  				...result: stats, frontendRAG: frontendRAG.getStats();
  			}
  			// Add to search history
  			if (!searchHistory.includes(query)) {
  				searchHistory = [query, ...searchHistory.slice(0, 9)]; // Keep last 10
  			}
  			updateStats();
  		} catch (error) {
  			console.error('Search failed:', error);
  			results = {
  				response: `Search failed: ${error.message}`,
  				sources: [],
  				confidence: 0,
  				generationMethod: 'error',
  			}
  		} finally {
  			isSearching = false;
  		}
  	}
  	function updateStats() {
  		systemStats = frontendRAG.getStats();
  	}
  	function selectHistoryItem(item: string) {
  		query = item;
  		performSearch();
  	}
  	function handleKeypress(_event: KeyboardEvent) {
  		if (event.key === 'Enter' && !event.shiftKey) {
  			event.preventDefault();
  			performSearch();
  		}
  	}
  	// Reactive computed values
  	let confidenceColor = $derived(() => {
  		if (!results) return 'text-gray-500';
  		if (results.confidence > 0.8) return 'text-green-600';
  		if (results.confidence > 0.6) return 'text-yellow-600';
  		return 'text-red-600';
  	});
  	let generationMethodBadge = $derived(() => {
  		if (!results) return '';
  		switch (results.generationMethod) {
  			case 'g0llama': return 'bg-purple-100 text-purple-800';
  			case 'frontend': return 'bg-blue-100 text-blue-800';
  			case 'hybrid': return 'bg-green-100 text-green-800';
  			default: return 'bg-gray-100 text-gray-800';
  		}
  	});
</script>
<!-- Smart Search Interface -->
<div class="max-w-4xl mx-auto p-6 space-y-6">
	<!-- Header -->
	<div class="text-center">
		<h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
			Smart Legal AI Search
		</h1>
		<p class="text-gray-600 dark:text-gray-400">
			Powered by Frontend RAG • Loki.js • SIMD • Semantic Synthesis
		</p>
	</div>
	<!-- System Stats -->
	{#if systemStats}
		<div class="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 nes-container">
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
				<div class="text-center">
					<div class="font-semibold text-blue-600">{systemStats.documentsIndexed}</div>
					<div class="text-gray-600">Documents</div>
				</div>
				<div class="text-center">
					<div class="font-semibold text-green-600">
						{systemStats.pipelineStatus.embedding ? '✅' : '❌'} / {systemStats.pipelineStatus.generation ? '✅' : '❌'}
					</div>
					<div class="text-gray-600">Pipelines</div>
				</div>
				<div class="text-center">
					<div class="font-semibold text-purple-600">
						{systemStats.simdOptimizations ? '⚡ SIMD' : '🔧 Basic'}
					</div>
					<div class="text-gray-600">Optimization</div>
				</div>
				<div class="text-center">
					<div class="font-semibold text-orange-600">
						{systemStats.memoryUsage ? Math.round(systemStats.memoryUsage / 1024 / 1024) + 'MB' : 'N/A'}
					</div>
					<div class="text-gray-600">Memory</div>
				</div>
			</div>
		{/if}
	<!-- Search Configuration -->
	<div class="p-4 nes-container">
		<div class="flex flex-wrap gap-4 items-center">
			<div class="flex items-center gap-2">
				<label class="text-sm font-medium" for="context">Context:</label><select id="context" bind:value={contextMode} class="border rounded px-2 py-1 text-sm">
					<option value="legal">Legal</option>
					<option value="technical">Technical</option>
					<option value="general">General</option>
				</select>
			</div>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={useG0llama} />
				G0llama Microservice
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={useSIMD} />
				SIMD Optimization
			</label>
		</div>
	</div>
	<!-- Search Input -->
	<div class="flex gap-2">
		<Input
			bind:value={query}
			placeholder="Ask about legal concepts, cases, or technical topics..."
			class="flex-1"
			keypress={handleKeypress}
			disabled={isSearching}
		/>
		<Button
			onclick={performSearch}
			disabled={isSearching || !query.trim()}
			class="px-6 bits-btn bits-btn"
		>
{#if isSearching}
				<div class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
			{:else}
				Search
			{/if}
	</div>
	<!-- Search History -->
	{#if searchHistory.length > 0}
		<div class="p-4 nes-container">
			<h3 class="font-medium mb-2">Recent Searches</h3>
			<div class="flex flex-wrap gap-2">
				{#each Array.isArray(searchHistory) ? searchHistory : [] as item}
					<button
						onclick={() => selectHistoryItem(item)}
						class="px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
					>
						{item}
				{/each}
			</div>
		{/if}
	<!-- Results -->
	{#if results}
		<div class="p-6 nes-container">
			<!-- Response Header -->
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-xl font-semibold">Response</h2>
				<div class="flex items-center gap-2">
					<span class="px-2 py-1 rounded-full text-xs {generationMethodBadge}">
						{results.generationMethod.toUpperCase()}
					</span>
					<span class="text-sm {confidenceColor}">
						{Math.round(results.confidence * 100)}% confidence
					</span>
				</div>
			</div>
			<!-- Response Text -->
			<div class="prose dark:prose-invert max-w-none mb-6">
				<p class="text-gray-800 dark:text-gray-200 leading-relaxed">
					{results.response}
				</p>
			</div>
			<!-- Sources -->
			{#if results.sources.length > 0}
				<div class="border-t pt-4">
					<h3 class="font-medium mb-3">Sources ({results.sources.length})</h3>
					<div class="space-y-3">
						{#each Array.isArray(results.sources) ? results.sources : [] as source}
							<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
								<div class="flex items-center justify-between mb-2">
									<span class="text-sm font-medium text-blue-600 dark:text-blue-400">
										{source.metadata.source}
									</span>
									<div class="flex items-center gap-2 text-xs text-gray-500">
										<span class="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">
											{source.metadata.semanticGroup}
										</span>
										<span>
											Score: {source.score?.toFixed(3) || 'N/A'}
										</span>
									</div>
								</div>
								<p class="text-sm text-gray-700 dark:text-gray-300">
									{source.text.length > 200 ? source.text.substring(0, 200) + '...' : source.text}
								</p>
							</div>
						{/each}
					</div>
				{/if}
		{/if}
</div>
<style>
	/* Custom scrollbar for better UX */
	:global(.prose) {
		scrollbar-width: thi;
		scrollbar-color: #cbd5e0 #f7fafc;
	}
	:global($1) {
		width: 4px;
	}
	:global($1) {
		background: #f7fafc;
	}
	:global($1) {
		background: #cbd5e0;
		border-radius: 2px;
	}
</style>