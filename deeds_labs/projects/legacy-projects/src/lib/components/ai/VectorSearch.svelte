<script lang="ts">
	import { onMount } from 'svelte';
	import type { SimilarityResult, SimilaritySearchResponse } from '../../../routes/api/embeddings/+server';

	// Svelte 5 runes
	let searchQuery = $state('');
	let isSearching = $state(false);
	let searchResults = $state<SimilarityResult[]>([]);
	let searchTime = $state(0);
	let selectedModel = $state('embeddinggemma:latest');
	let topK = $state(5);

	// Search function
	async function performSearch() {
		if (!searchQuery.trim()) return;

		isSearching = true;
		try {
			const response = await fetch('/api/similarity-search', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					query: searchQuery,
					top_k: topK,
					model: selectedModel
				})
			});

			if (!response.ok) {
				throw new Error(`Search failed: ${response.statusText}`);
			}

			const data: SimilaritySearchResponse = await response.json();
			searchResults = data.results;
			searchTime = data.processing_time_ms;
		} catch (error) {
			console.error('Search error:', error);
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	// Handle enter key
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			performSearch();
		}
	}

	// Risk level styling
	function getRiskColor(riskLevel: string): string {
		switch (riskLevel) {
			case 'high': return 'text-red-600 bg-red-50 border-red-200';
			case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
			case 'low': return 'text-green-600 bg-green-50 border-green-200';
			default: return 'text-gray-600 bg-gray-50 border-gray-200';
		}
	}

	// Similarity score styling
	function getSimilarityColor(similarity: number): string {
		if (similarity >= 0.8) return 'text-green-600';
		if (similarity >= 0.6) return 'text-yellow-600';
		return 'text-red-600';
	}
</script>

<div class="vector-search-container p-6 bg-white rounded-lg shadow-lg">
	<div class="header mb-6">
		<h2 class="text-2xl font-bold text-gray-800 mb-2">Legal Vector Search</h2>
		<p class="text-gray-600">Search legal clauses using 512-dimension embeddings</p>
	</div>

	<!-- Search Configuration -->
	<div class="search-config grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
		<div>
			<label for="model-select" class="block text-sm font-medium text-gray-700 mb-2">
				Embedding Model
			</label>
			<select
				id="model-select"
				bind:value={selectedModel}
				class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
			>
				<option value="embeddinggemma:latest">Gemma Embeddings (Primary)</option>
				<option value="nomic-embed-text:latest">Nomic Embeddings (Backup)</option>
			</select>
		</div>

		<div>
			<label for="top-k" class="block text-sm font-medium text-gray-700 mb-2">
				Results Count
			</label>
			<input
				id="top-k"
				type="number"
				bind:value={topK}
				min="1"
				max="20"
				class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
			/>
		</div>

		<div class="flex items-end">
			<div class="text-sm text-gray-500">
				512-dim vectors • {searchResults.length} results
				{#if searchTime > 0}
					• {searchTime}ms
				{/if}
			</div>
		</div>
	</div>

	<!-- Search Input -->
	<div class="search-input mb-6">
		<label for="search-query" class="block text-sm font-medium text-gray-700 mb-2">
			Search Query
		</label>
		<div class="relative">
			<textarea
				id="search-query"
				bind:value={searchQuery}
				onkeydown={handleKeyDown}
				placeholder="Enter legal text to search for similar clauses... (e.g., 'contract termination with notice period')"
				class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
				rows="3"
			></textarea>
			<div class="absolute bottom-2 right-2 text-xs text-gray-400">
				Press Enter to search
			</div>
		</div>
	</div>

	<!-- Search Button -->
	<div class="search-actions mb-6">
		<button
			onclick={performSearch}
			disabled={isSearching || !searchQuery.trim()}
			class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
		>
			{#if isSearching}
				<span class="inline-flex items-center">
					<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					Searching...
				</span>
			{:else}
				Search Similar Clauses
			{/if}
		</button>
	</div>

	<!-- Search Results -->
	{#if searchResults.length > 0}
		<div class="search-results">
			<h3 class="text-lg font-semibold text-gray-800 mb-4">
				Similar Legal Clauses ({searchResults.length} results)
			</h3>

			<div class="results-grid space-y-4">
				{#each searchResults as result, index}
					<div class="result-card p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
						<div class="result-header flex items-start justify-between mb-3">
							<div class="result-meta flex items-center space-x-3">
								<span class="similarity-score text-lg font-semibold {getSimilarityColor(result.similarity)}">
									{(result.similarity * 100).toFixed(1)}%
								</span>
								<span class="result-rank text-sm text-gray-500">
									#{index + 1}
								</span>
							</div>
							<div class="result-badges flex space-x-2">
								<span class="risk-badge px-2 py-1 text-xs font-medium rounded-full border {getRiskColor(result.risk_level)}">
									{result.risk_level} risk
								</span>
								<span class="type-badge px-2 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-600 border border-blue-200">
									{result.clause_type.replace('_', ' ')}
								</span>
							</div>
						</div>

						<div class="result-content">
							<p class="text-gray-800 leading-relaxed">
								{result.text}
							</p>
						</div>

						<div class="result-footer mt-3 text-xs text-gray-500">
							Document ID: {result.id} • Similarity: {result.similarity.toFixed(4)}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else if searchQuery && !isSearching}
		<div class="no-results text-center py-8">
			<div class="text-gray-500 mb-2">No similar clauses found</div>
			<div class="text-sm text-gray-400">Try adjusting your search query or check the spelling</div>
		</div>
	{/if}

	{#if !searchQuery && !isSearching && searchResults.length === 0}
		<div class="search-placeholder text-center py-8">
			<div class="text-gray-500 mb-2">Enter a legal query to search for similar clauses</div>
			<div class="text-sm text-gray-400">
				Examples: "time is of essence", "liability limitation", "termination clause"
			</div>
		</div>
	{/if}
</div>

<style>
	.vector-search-container {
		max-width: 1200px;
		margin: 0 auto;
	}

	.result-card {
		background: linear-gradient(135deg, #fafafa 0%, #ffffff 100%);
	}

	.result-card:hover {
		background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
	}

	.similarity-score {
		font-feature-settings: 'tnum';
	}
</style>


