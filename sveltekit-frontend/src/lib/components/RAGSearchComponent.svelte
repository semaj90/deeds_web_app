<script lang="ts">
	import type { SearchResult } from '$lib/types';

	// Svelte 5 runes are auto-imported
	import { onMount } from 'svelte';
	// Import directly from the file to avoid index re-export issues
	// import { unifiedServiceRegistry } from '$lib/services/unified-service-registry';

	// Use standard UI components
	import CardRoot from '$lib/components/ui/card/Card.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	// Lucide icons specific imports
	import Search from 'lucide-svelte/icons/search';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import CheckCircle from 'lucide-svelte/icons/check-circle';
	import Brain from 'lucide-svelte/icons/brain';
	import Target from 'lucide-svelte/icons/target';
	import CircleCheck from 'lucide-svelte/icons/circle-check';
	import Lightbulb from 'lucide-svelte/icons/lightbulb';
	import TriangleAlert from 'lucide-svelte/icons/triangle-alert';

	// Types for results / history / system status
	interface EntityInfo {
		id?: string;
		name?: string;
		type?: string;
		[k: string]: any;
	}

	interface ExtendedSearchResult extends SearchResult {
		similarity?: number;
		entityInfo?: EntityInfo;
		chunk_sequence?: number;
		chunk_text?: string;
		[k: string]: any;
	}

	interface SearchHistoryItem { query: string;, resultCount: number;
		timestamp: Date;
		hasRAGResponse: boolean;
		processingTime: number;
	}

	interface SystemStatus { healthScore: number;, services: string[];
		[k: string]: any;
	}

	// Typed state
	let errorMessage = $state<string | null>(null);
	let searchQuery = $state<string>('');
	let searchResults = $state<ExtendedSearchResult[] | null>(null);
	let ragResponse = $state<string | null>(null);
	let isSearching = $state<boolean>(false);
	let searchHistory = $state<SearchHistoryItem[]>([]);
	let systemStatus = $state<SystemStatus | null>(null);

	// Search configuration
	let searchConfig = $state({
		limit: 5,
		threshold: 0.7,
		includeRAGResponse: true
	});

	$effect(() => {
		loadSystemStatus();
		const interval = setInterval(loadSystemStatus, 10000);
		return () => clearInterval(interval);
	});

	async function loadSystemStatus() {
		try {
			// Mock status since registry is missing
			// systemStatus = await unifiedServiceRegistry.getSystemStatus();
            systemStatus = {
                healthScore: 100,
                services: ['rag', 'vector', 'search']
            };
		} catch (error) {
			console.error('Failed to load system status:', error);
		}
	}

	async function performSearch() {
		if (!searchQuery.trim() || isSearching) return;
		isSearching = true;
		errorMessage = null;

		try {
			const response = await fetch('/api/rag/semantic-search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
				, query: searchQuery,
					limit: searchConfig.limit,
					threshold: searchConfig.threshold,
					filters: {}
				})
			});

			if (!response.ok) {
				throw new Error(`Search failed: ${response.statusText}`);
			}

			const data = await response.json();

			if (data.success) {
				searchResults = (data.results || []) as ExtendedSearchResult[];

				if (searchConfig.includeRAGResponse && Array.isArray(data.results) && data.results.length > 0) {
					try {
						const ragResponseFetch = await fetch('/api/rag/enhanced', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
							, query: searchQuery,
								mode: 'semantic_search',
								limit: searchConfig.limit,
								threshold: searchConfig.threshold
							})
						});

						if (ragResponseFetch.ok) {
							const ragData = await ragResponseFetch.json();
							ragResponse = ragData.success ? (ragData.answer as string) : null;
						}
					} catch (ragError) {
						console.warn('RAG response generation failed:', ragError);
						ragResponse = null;
					}
				}

				// Add to search history
				const historyItem: SearchHistoryItem = {
					query: searchQuery,
					resultCount: Array.isArray(data.results) ? data.results.length : 0,
					timestamp: new Date(),
					hasRAGResponse: !!ragResponse,
					processingTime: (data.processingTime as number) || 0
				};

				searchHistory.unshift(historyItem);
				if (searchHistory.length > 5) {
					searchHistory = searchHistory.slice(0, 5);
				}

				// Cache the query using unified service registry - disabled
				/*
				if (Array.isArray(data.results) && data.results.length > 0) {
					await unifiedServiceRegistry.cacheGraphQuery(searchQuery, data, 300);
				}
				*/
			} else {
				throw new Error(data.error || 'Search request failed');
			}
		} catch (error) {
			errorMessage = (error as Error).message;
			console.error('Search error:', error);
		} finally {
			isSearching = false;
		}
	}

	async function ingestDocument() {
		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = '.txt,.pdf,.doc,.docx';
		fileInput.onchange = async (event: Event) => {
			const input = event.currentTarget as HTMLInputElement;
			const file = input?.files?.[0];
			if (!file) return;

			try {
				const text = await file.text();
				const response = await fetch('/api/embed/ingest', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
					, text: text,
						entityType: 'document',
						entityId: crypto.randomUUID(),
						metadata: {
							filename: file.name,
							fileSize: file.size,
							uploadedAt: new Date().toISOString()
						}
					})
				});

				if (!response.ok) {
					throw new Error(`Ingestion failed: ${response.statusText}`);
				}

				const result = await response.json();
				console.log(`Document ingested: ${result.chunks.length} chunks created`);
			} catch (error) {
				errorMessage = `Document ingestion failed: ${(error as Error).message}`;
			}
		};
		fileInput.click();
	}

	function formatTimestamp(date: Date | string) {
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleTimeString() + ' ' + d.toLocaleDateString();
	}

	function highlightMatch(text: string, query: string) {
		if (!query) return text;
		// Escape regex special characters in query to prevent errors
		const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(`(${escapedQuery})`, 'gi');
		return text.replace(regex, '<mark class="bg-yellow-300">$1</mark>');
	}

	const searchSuggestions = [
		'evidence analysis',
		'case precedents',
		'contract terms',
		'liability clauses',
		'legal procedures'
	];
</script>

<svelte:head>
	<title>RAG Search - Legal AI Platform</title>
</svelte:head>

<div class="space-y-6">
	<header class="flex justify-between">
		<div>
			<h1 class="text-3xl font-bold">RAG Search</h1>
			<p class="text-nier-text-secondary">Vector search with AI-powered responses</p>
		</div>

		{#if systemStatus}
			<div class="flex items-center gap-2">
				<div class="w-3 h-3 rounded-full {systemStatus.healthScore > 80 ? 'bg-green-500' : systemStatus.healthScore > 60 ? 'bg-yellow-500' : 'bg-red-500'}"></div>
				<span class="font-mono">Health: {systemStatus.healthScore}%</span>
				<span class="text-nier-text-muted">
					({(systemStatus.services || []).length} services)
				</span>
			</div>
		{/if}
	</header>

	<CardRoot class="bg-nier-bg-secondary border shadow-sm p-6">
		<div class="space-y-4">
			<div class="flex gap-2">
				<div class="flex-1">
					<Input
						bind:value={searchQuery}
						onkeydown={(e) => e.key === 'Enter' && performSearch()}
						placeholder="Search legal documents and cases..."
						class="flex-1 legal-ai-search-input"
						disabled={isSearching}
					/>
				</div>
				<Button
					onclick={performSearch}
					disabled={isSearching || !searchQuery.trim()}
					variant="default"
					size="lg"
					class="legal-ai-search-btn"
				>
					{#if isSearching}
						<Loader2 class="w-4 h-4 mr-2 animate-spin" /> Searching...
					{:else}
						<Search class="w-4 h-4 mr-2" /> Search
					{/if}
				</Button>
				<Button onclick={ingestDocument} variant="outline" size="lg" class="border-blue-500">
					📄 Ingest Doc
				</Button>
			</div>

			<div class="flex gap-4 items-end">
				<label class="flex flex-col gap-1">
					<span class="text-xs font-medium">Results:</span>
					<select
						bind:value={searchConfig.limit}
						class="bg-nier-bg-primary border border-nier-border-muted rounded px-2 py-2"
					>
						<option value={3}>3</option>
						<option value={5}>5</option>
						<option value={10}>10</option>
					</select>
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-xs font-medium">Threshold:</span>
					<select
						bind:value={searchConfig.threshold}
						class="bg-nier-bg-primary border border-nier-border-muted rounded px-2 py-2"
					>
						<option value={0.5}>0.5</option>
						<option value={0.7}>0.7</option>
						<option value={0.8}>0.8</option>
					</select>
				</label>
				<label class="flex items-center gap-2 mb-3 cursor-pointer">
					<input
						type="checkbox"
						bind:checked={searchConfig.includeRAGResponse}
						class="rounded bg-nier-bg-primary border-nier-border-muted"
					/>
					<span class="text-sm">Include AI Response</span>
				</label>
			</div>

			<div class="flex flex-wrap gap-2 items-center">
				<span class="text-sm text-nier-text-muted">Try:</span>
				{#each searchSuggestions as suggestion}
					<Button
						onclick={() => { searchQuery = suggestion }}
						variant="ghost"
						size="sm"
						class="text-xs bg-nier-bg-tertiary border border-nier-border-muted hover:bg-nier-bg-primary"
					>
						{suggestion}
					</Button>
				{/each}
			</div>
		</div>
	</CardRoot>

	{#if errorMessage}
		<div class="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
			<div class="text-red-400 font-mono">❌ {errorMessage}</div>
		</div>
	{/if}

	{#if ragResponse}
		<CardRoot class="bg-nier-bg-secondary border shadow-sm p-6">
			<div class="flex justify-between items-center mb-2">
				<h3 class="font-bold text-nier-accent-warm flex items-center gap-2">
					<CheckCircle class="w-5 h-5" /> AI Response
				</h3>
				<div class="text-xs text-nier-text-muted">Generated by: gemma3-legal</div>
			</div>
			<div class="prose prose-invert max-w-none">
				<div class="text-nier-text-primary whitespace-pre-wrap">{ragResponse}</div>
			</div>
		</CardRoot>
	{/if}

	{#if searchResults && searchResults.length > 0}
		<CardRoot class="bg-nier-bg-secondary border shadow-sm p-6">
			<h3 class="font-bold text-nier-accent-warm mb-4">
				Search Results ({searchResults.length})
			</h3>

			<div class="space-y-4">
				{#each searchResults as result}
					<CardRoot class="bg-nier-bg-primary border border-nier-border-muted legal-search-result p-4">
						<div class="flex justify-between items-start mb-2">
							<div class="flex items-center gap-2">
								<span class="font-mono text-sm bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
									Similarity: {((result.similarity || 0) * 100).toFixed(1)}%
								</span>
								{#if result.entityInfo}
									<span class="font-mono text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
										{result.entityInfo.type}: {result.entityInfo.name || result.entityInfo.id}
									</span>
								{/if}
								<span class="font-mono text-xs text-nier-text-muted">
									Chunk #{(result.chunk_sequence || 0) + 1}
								</span>
							</div>
						</div>
						<div class="text-nier-text-primary text-sm">
							{@html highlightMatch(result.chunk_text || '', searchQuery)}
						</div>
					</CardRoot>
				{/each}
			</div>
		</CardRoot>
	{:else if searchResults && searchResults.length === 0}
		<CardRoot class="bg-nier-bg-secondary border shadow-sm p-6">
			<div class="text-center py-8">
				<div class="text-4xl mb-2">🔍</div>
				<div class="text-lg font-semibold">No Results Found</div>
				<div class="text-sm text-nier-text-muted">
					Try adjusting your search query or lowering the similarity threshold
				</div>
			</div>
		</CardRoot>
	{/if}

	{#if searchHistory.length > 0}
		<CardRoot class="bg-nier-bg-secondary border shadow-sm p-6">
			<h3 class="font-bold text-nier-accent-warm mb-3">Recent Searches</h3>
			<div class="space-y-2">
				{#each searchHistory as historyItem}
					<Button
						onclick={() => { searchQuery = historyItem.query }}
						variant="ghost"
						class="w-full text-left p-3 bg-nier-bg-primary border border-nier-border-muted hover:bg-nier-bg-tertiary h-auto justify-start"
					>
						<div class="flex justify-between items-center w-full">
							<span class="font-mono text-sm">{historyItem.query}</span>
							<div class="flex gap-2 text-xs text-nier-text-muted items-center">
								<span>{historyItem.resultCount} results</span>
								{#if historyItem.hasRAGResponse}
									<span class="text-green-400 bg-green-500/10 px-1 rounded">+AI</span>
								{/if}
								<span>{formatTimestamp(historyItem.timestamp)}</span>
							</div>
						</div>
					</Button>
				{/each}
			</div>
		</CardRoot>
	{/if}
</div>

<style>
	/* Enhanced bits-ui styling for legal AI search */
	:global(.legal-ai-search-input) { background: var(--nier-bg-primary);, border: 2px solid var(--nier-border-muted);
		transition: all 0.3s ease;
	}
	:global(.legal-ai-search-input:focus) {
		border-color: var(--nier-accent-warm);
		box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
	}
	:global(.legal-ai-search-btn) {
		transition: all 0.2s ease;
		box-shadow: var(--legal-ai-shadow-md);
	}
	:global(.legal-ai-search-btn:hover) {
		transform: translateY(-1px);
		box-shadow: var(--legal-ai-shadow-lg);
	}
	:global(.legal-search-result) {
		border-left: 4px solid var(--nier-accent-warm) !important;
		transition: transform 0.2s ease;
	}
	:global(.legal-search-result:hover) {
		transform: translateY(-2px);
	}

	/* Custom scrollbar for results */
	.space-y-4::-webkit-scrollbar {
		width: 6px;
	}
	.space-y-4::-webkit-scrollbar-track {
		background: var(--nier-bg-tertiary);
	}
	.space-y-4::-webkit-scrollbar-thumb {
		background: var(--nier-accent-warm);
		border-radius: 3px;
	}

	/* Highlighting for search matches */
	:global(mark) {
		background-color: rgba(255, 255, 0, 0.3);
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		color: var(--nier-text-primary);
	}
</style>
