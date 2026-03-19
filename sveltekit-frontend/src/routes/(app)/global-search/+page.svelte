<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { analytics } from '$lib/stores/analytics.svelte';
	import RAGSearchComponent from '$lib/components/RAGSearchComponent.svelte';
	import CodebaseSearch from '$lib/components/CodebaseSearch.svelte';
	import SearchPanel from '$lib/components/SearchPanel.svelte';
	import ContextConfirmModal from '$lib/components/ContextConfirmModal.svelte';
	import SearchResults from '$lib/components/SearchResults.svelte';
	import ResultDetail from '$lib/components/ResultDetail.svelte';
	import VectorIntelligenceDemo from '$lib/components/ai/VectorIntelligenceDemo.svelte';
	import type { GPURerankMetrics, GPURankedItem } from '$lib/gpu/gpu-search-reranker.js';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { trackClick } from '$lib/utils/tracking';
	import StatuteSearchBar from '$lib/components/legal-ai/StatuteSearchBar.svelte';
	import StatuteResultsList from '$lib/components/legal-ai/StatuteResultsList.svelte';
	import { searchCases, searchLaws, getSearchSuggestions, getSearchFilters, trackSearch, type SearchQuery, type SearchResponse, type SearchResult as TypedSearchResult } from '$lib/client/search-client.js';
	import type { PlatformSearchHit, PlatformSearchTiming } from '$lib/types/search.js';

	interface FilterFacets {
		jurisdictions: string[];
		categories: string[];
		types: string[];
	}

	let caseFacets = $state<FilterFacets>({ jurisdictions: [], categories: [], types: [] });
	let lawFacets = $state<FilterFacets>({ jurisdictions: [], categories: [], types: [] });
	let facetsLoaded = $state(false);

	let showRAGAssistant = $state(false);
	let showCodebaseSearch = $state(false);
	let showKagSearch = $state(false);
	let showContextConfirm = $state(false);
	let showChunkViewer = $state(false);
	let showVectorSearch = $state(false);
	let chunkViewerResult = $state<any>(null);
	let contextConfirmData = $state<{ context_id: string; source: string; score: number; snippet: string; range?: { from_msg_id: number; to_msg_id: number }; timestamp?: string } | null>(null);
	import { getConfidenceLevel, formatProcessingTime } from '$lib/utils';
	import type { RetrievalContext, RankedChunk } from '$lib/machines/retrieval-machine.js';

	interface SearchResult {
		chunk_id: string;
		text: string;
		snippet: string;
		score: number;
		confidence: string;
		source_type: string;
		source_id: string;
		source_title: string;
		source_url?: string;
		section?: string;
		related_entities: string[];
		vector_score?: number;
		tfidf_score?: number;
	}

	interface EvidenceBundle {
		hit: {
			evidenceId: string;
			chunkIndex: number;
			content: string;
			score: number;
			metadata: Record<string, unknown>;
			rerank?: {
				cosine: number;
				sharedCitations: number;
				jurisdictionMatch: number;
				sectionProximity: number;
				finalScore: number;
			};
		};
		siblings: Array<{ content: string; chunkIndex: number }>;
		sectionPath: string[];
		heading: string;
		citations: string[];
		graphNeighbors: Array<{
			nodeId: string;
			title: string;
			evidenceType: string;
			connectionType: string;
			strength: number;
			confidence: number;
		}>;
		documentContext?: {
			evidenceId: string;
			fileName: string;
			fileType: string;
			description: string;
			aiSummary?: string;
		};
	}

	interface SearchTiming {
		embedMs?: number;
		searchMs?: number;
		rerankMs?: number;
		hopMs?: number;
		kagMs?: number;
		dagMs?: number;
		totalMs?: number;
		embedding_time_ms?: number;
		search_time_ms?: number;
	}

	type SearchMode = 'all' | 'law' | 'cases' | 'evidence' | 'reports' | 'messages' | 'rag' | 'statutes' | 'precedents' | 'glossary';

	let searchQuery = $state('');
	let isSearching = $state(false);
	let searchMode = $state<SearchMode>('all');
	let scoringMethod = $state<"vector_only" | "hybrid" | "tfidf_only">("hybrid");
	let caseIdFilter = $state('');
	let caseSearchFilters = $state({
		jurisdiction: '',
		crimeCategory: '',
		crimeClassification: '',
	});
	let statuteSearchFilters = $state({
		jurisdiction: '',
		sectionType: '',
	});
	let searchSuggestions = $state<string[]>([]);
	let caseResults = $state<TypedSearchResult[]>([]);

	// RAG search results
	let ragResults = $state<SearchResult[]>([]);
	let ragTiming = $state<SearchTiming | null>(null);

	// Evidence search results (RAG+KAG+DAG)
	let evidenceBundles = $state<EvidenceBundle[]>([]);
	let evidenceResults = $state<any[]>([]);
	let evidenceTiming = $state<SearchTiming | null>(null);

	// Statutes / precedents / glossary results
	let statuteResults = $state<any[]>([]);
	let precedentResults = $state<any[]>([]);
	let glossaryResults = $state<any[]>([]);
	let auxTiming = $state<Record<string, number>>({});

	// Platform (all) search results
	let platformHits = $state<PlatformSearchHit[]>([]);
	let platformGroups = $state<Record<string, number>>({});
	let platformTiming = $state<PlatformSearchTiming | null>(null);

	// Library search results
	let libraryResults = $state<any[]>([]);

	let selectedResult = $state<SearchResult | null>(null);
	let selectedBundle = $state<EvidenceBundle | null>(null);
	let searchError = $state<string | null>(null);
	let totalFound = $state(0);

	let searchFilters = $state({
		cases: true,
		evidence: true,
		documents: true,
		persons: true,
	});

	// Load filter facets on mount
	$effect(() => {
		if (!facetsLoaded) {
			facetsLoaded = true;
			Promise.allSettled([
				getSearchFilters('cases'),
				getSearchFilters('laws'),
			]).then(([caseRes, lawRes]) => {
				if (caseRes.status === 'fulfilled') caseFacets = caseRes.value as FilterFacets;
				if (lawRes.status === 'fulfilled') lawFacets = lawRes.value as FilterFacets;
			});
		}
	});

	// GPU reranking state
	let gpuRerankEnabled = $state(false);
	let gpuRerankMetrics = $state<GPURerankMetrics | null>(null);
	let gpuRankedItems = $state<GPURankedItem[]>([]);
	let isGpuReranking = $state(false);
	let searchSuggestionTimeout: ReturnType<typeof setTimeout> | null = null;

	async function runGpuRerank() {
		if (!gpuRerankEnabled) return;

		const chunks = searchMode === 'evidence'
			? evidenceBundles.map(b => ({ content: b.hit.content, serverScore: b.hit.score }))
			: searchMode === 'rag'
				? ragResults.map(r => ({ content: r.text || r.snippet, serverScore: r.score }))
				: [];

		if (chunks.length === 0) return;

		isGpuReranking = true;
		try {
			const { gpuRerank } = await import('$lib/gpu/gpu-search-reranker.js');
			const result = await gpuRerank(searchQuery, chunks, 10);
			if (result) {
				gpuRankedItems = result.items;
				gpuRerankMetrics = result.metrics;
			}
		} catch (err) {
			console.error('[GPU Rerank] Failed:', err);
		} finally {
			isGpuReranking = false;
		}
	}

	async function performSearch() {
		if (!searchQuery.trim()) return;
		analytics.track('codebase_search', { query: searchQuery.slice(0, 200) });

		isSearching = true;
		searchError = null;
		searchSuggestions = [];
		caseResults = [];
		ragResults = [];
		evidenceBundles = [];
		evidenceResults = [];
		statuteResults = [];
		precedentResults = [];
		glossaryResults = [];
		platformHits = [];
		platformGroups = {};
		libraryResults = [];
		selectedResult = null;
		selectedBundle = null;
		gpuRankedItems = [];
		gpuRerankMetrics = null;

		try {
			if (searchMode === 'all') {
				await searchPlatform();
			} else if (searchMode === 'law') {
				await searchLibrary();
			} else if (searchMode === 'cases') {
				await searchCaseRecords();
			} else if (searchMode === 'evidence') {
				await searchEvidence();
			} else if (searchMode === 'reports') {
				await searchReportRecords();
			} else if (searchMode === 'messages') {
				await searchMessageRecords();
			} else if (searchMode === 'statutes') {
				await searchStatutes();
			} else if (searchMode === 'precedents') {
				await searchPrecedents();
			} else if (searchMode === 'glossary') {
				await searchGlossary();
			} else {
				await searchRAG();
			}
		} catch (err) {
			console.error('Search failed:', err);
			searchError = err instanceof Error ? err.message : 'Search failed';
		} finally {
			isSearching = false;
		}
	}

	async function searchPlatform() {
		const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&type=all&limit=20`);
		if (!res.ok) throw new Error(`Platform search failed: ${res.status}`);
		const data = await res.json();
		platformHits = data.hits ?? [];
		platformGroups = data.groups ?? {};
		platformTiming = data.timing ?? null;
		totalFound = data.totalResults ?? platformHits.length;
	}

	async function searchLibrary() {
		const res = await fetch('/api/library/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: searchQuery, limit: 20 }),
		});
		if (!res.ok) throw new Error(`Library search failed: ${res.status}`);
		const data = await res.json();
		libraryResults = data.results ?? [];
		totalFound = libraryResults.length;
	}

	async function searchCaseRecords() {
		const query: SearchQuery = {
			query: searchQuery,
			limit: 20,
			jurisdiction: caseSearchFilters.jurisdiction || undefined,
			crimeCategory: caseSearchFilters.crimeCategory || undefined,
			crimeClassification: caseSearchFilters.crimeClassification || undefined,
		};

		const data: SearchResponse = await searchCases(query);
		caseResults = data.results ?? [];
		auxTiming = { total_ms: data.executionTimeMs };
		totalFound = data.total ?? caseResults.length;
		void trackSearch(searchQuery, totalFound, data.executionTimeMs, 'cases');
	}

	async function searchEvidence() {
		const res = await fetch('/api/evidence/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: searchQuery,
				caseId: caseIdFilter || undefined,
				limit: 20,
				expandSections: true,
			}),
		});

		if (!res.ok) {
			throw new Error(`Evidence search failed: ${res.status}`);
		}

		const data = await res.json();
		evidenceResults = data.results ?? [];
		evidenceBundles = data.bundles ?? [];
		evidenceTiming = data.timing ?? null;
		totalFound = evidenceResults.length;

		// GPU rerank after server results arrive
		if (gpuRerankEnabled && evidenceBundles.length > 0) {
			await runGpuRerank();
		}
	}

	async function searchRAG() {
		const res = await fetch('/api/rag/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: searchQuery,
				top_k: 20,
				min_score: 0.3,
				scoring_method: scoringMethod,
			}),
		});

		if (!res.ok) {
			throw new Error(`RAG search failed: ${res.status}`);
		}

		const data = await res.json();
		ragResults = data.chunks ?? [];
		ragTiming = data;
		totalFound = data.total_found ?? ragResults.length;

		// GPU rerank after server results arrive
		if (gpuRerankEnabled && ragResults.length > 0) {
			await runGpuRerank();
		}
	}

	async function searchStatutes() {
		const query: SearchQuery = {
			query: searchQuery,
			limit: 20,
			jurisdiction: statuteSearchFilters.jurisdiction || undefined,
			sectionType: statuteSearchFilters.sectionType || undefined,
		};
		const data: SearchResponse = await searchLaws(query);
		statuteResults = data.results ?? [];
		auxTiming = { total_ms: data.executionTimeMs };
		totalFound = data.total ?? statuteResults.length;
		void trackSearch(searchQuery, totalFound, data.executionTimeMs, 'laws');
	}

	async function searchPrecedents() {
		const res = await fetch('/api/precedents/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: searchQuery,
				caseId: caseIdFilter || undefined,
				limit: 20,
			}),
		});
		if (!res.ok) throw new Error(`Precedents search failed: ${res.status}`);
		const data = await res.json();
		precedentResults = data.results ?? [];
		auxTiming = data.timing ?? {};
		totalFound = precedentResults.length;
	}

	async function searchGlossary() {
		const res = await fetch('/api/glossary/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: searchQuery, limit: 20 }),
		});
		if (!res.ok) throw new Error(`Glossary search failed: ${res.status}`);
		const data = await res.json();
		glossaryResults = data.results ?? [];
		auxTiming = data.timing ?? {};
		totalFound = glossaryResults.length;
	}

	async function searchReportRecords() {
		const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&type=reports&limit=20`);
		if (!res.ok) throw new Error(`Report search failed: ${res.status}`);
		const data = await res.json();
		platformHits = data.hits ?? [];
		platformGroups = data.groups ?? {};
		platformTiming = data.timing ?? null;
		totalFound = data.totalResults ?? platformHits.length;
	}

	async function searchMessageRecords() {
		const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&type=messages&limit=20`);
		if (!res.ok) throw new Error(`Message search failed: ${res.status}`);
		const data = await res.json();
		platformHits = data.hits ?? [];
		platformGroups = data.groups ?? {};
		platformTiming = data.timing ?? null;
		totalFound = data.totalResults ?? platformHits.length;
	}

	function getConfidenceFromScore(score: number) {
		return getConfidenceLevel(score);
	}

	function getTypeIcon(type: string): string {
		switch (type) {
			case 'case': return 'briefcase';
			case 'evidence': return 'search';
			case 'person': return 'users';
			case 'document': return 'file-text';
			case 'legal': return 'scale';
			case 'communication': return 'message-square';
			default: return 'file-text';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') performSearch();
	}

	function handleSearchInput() {
		if (searchSuggestionTimeout) {
			clearTimeout(searchSuggestionTimeout);
		}

		if (searchQuery.trim().length < 2) {
			searchSuggestions = [];
			return;
		}

		searchSuggestionTimeout = setTimeout(() => {
			void refreshSearchSuggestions();
		}, 150);
	}

	async function refreshSearchSuggestions() {
		const sugType = searchMode === 'cases' ? 'cases'
			: (searchMode === 'law' || searchMode === 'statutes') ? 'laws'
			: 'all';
		searchSuggestions = await getSearchSuggestions(searchQuery, sugType);
	}
</script>

<div class="search-page">
	<!-- Header -->
	<header class="search-header">
		<div class="header-content">
			<div class="header-title">
				<Icon name="search" size={28} />
				<div>
					<h1>GLOBAL SEARCH</h1>
					<p class="header-sub">RAG + KAG + DAG Multi-Stage Retrieval Pipeline</p>
				</div>
			</div>

			<div class="mode-toggle">
				<button class="mode-btn" class:active={searchMode === 'all'} onclick={() => searchMode = 'all'}>
					<Icon name="layers" size={14} /> All
				</button>
				<button class="mode-btn" class:active={searchMode === 'law'} onclick={() => searchMode = 'law'}>
					<Icon name="scale" size={14} /> Law
				</button>
				<button class="mode-btn" class:active={searchMode === 'cases'} onclick={() => { searchMode = 'cases'; searchSuggestions = []; }}>
					<Icon name="briefcase" size={14} /> Cases
				</button>
				<button class="mode-btn" class:active={searchMode === 'evidence'} onclick={() => searchMode = 'evidence'}>
					<Icon name="network" size={14} /> Evidence
				</button>
				<button class="mode-btn" class:active={searchMode === 'reports'} onclick={() => searchMode = 'reports'}>
					<Icon name="file-text" size={14} /> Reports
				</button>
				<button class="mode-btn" class:active={searchMode === 'messages'} onclick={() => searchMode = 'messages'}>
					<Icon name="message-square" size={14} /> Messages
				</button>
			</div>
		</div>
	</header>

	<div class="search-layout">
		<!-- Left Panel: Search + Filters -->
		<aside class="filter-panel">
			<div class="search-box">
				<div class="search-input-wrap">
					<span class="search-icon"><Icon name="search" size={16} /></span>
					<input
						type="text"
						placeholder="Search evidence, cases, legal documents..."
						bind:value={searchQuery}
						oninput={handleSearchInput}
						onkeydown={handleKeydown}
						list="global-search-suggestions"
						class="search-input"
					/>
					<datalist id="global-search-suggestions">
						{#each searchSuggestions as suggestion}
							<option value={suggestion}></option>
						{/each}
					</datalist>
					{#if searchQuery}
						<button class="clear-btn" onclick={() => { searchQuery = ''; }}>
							<Icon name="x" size={14} />
						</button>
					{/if}
				</div>
				<Button
					variant="default"
					size="sm"
					onclick={performSearch}
					disabled={isSearching || !searchQuery.trim()}
					class="search-submit"
				>
					{#if isSearching}
						<span class="animate-spin"><Icon name="loader-circle" size={16} /></span>
					{:else}
						SEARCH
					{/if}
				</Button>
			</div>

			{#if searchMode === 'cases'}
				<div class="filter-section">
					<h3>CASE FILTERS</h3>
					<select bind:value={caseSearchFilters.jurisdiction} class="filter-input">
						<option value="">All Jurisdictions</option>
						{#each caseFacets.jurisdictions as jur}
							<option value={jur}>{jur}</option>
						{/each}
					</select>
					<select bind:value={caseSearchFilters.crimeCategory} class="filter-input">
						<option value="">All Categories</option>
						{#each caseFacets.categories as cat}
							<option value={cat}>{cat}</option>
						{/each}
					</select>
					<select bind:value={caseSearchFilters.crimeClassification} class="filter-input">
						<option value="">All Classifications</option>
						{#each caseFacets.types as typ}
							<option value={typ}>{typ}</option>
						{/each}
					</select>
				</div>
			{:else if searchMode === 'law'}
				<div class="filter-section">
					<h3>LAW FILTERS</h3>
					<select bind:value={statuteSearchFilters.jurisdiction} class="filter-input">
						<option value="">All Jurisdictions</option>
						{#each lawFacets.jurisdictions as jur}
							<option value={jur}>{jur}</option>
						{/each}
					</select>
					<select bind:value={statuteSearchFilters.sectionType} class="filter-input">
						<option value="">All Categories</option>
						{#each lawFacets.categories as cat}
							<option value={cat}>{cat}</option>
						{/each}
					</select>
				</div>
			{:else if searchMode === 'evidence'}
				<div class="filter-section">
					<h3>CASE FILTER</h3>
					<input
						type="text"
						placeholder="Case ID (optional)"
						bind:value={caseIdFilter}
						class="filter-input"
					/>
				</div>
			{:else if searchMode === 'statutes'}
				<div class="filter-section">
					<StatuteSearchBar
						isLoading={isSearching}
						onsearch={(params) => {
							searchQuery = params.query ?? searchQuery;
							statuteSearchFilters.jurisdiction = params.jurisdiction ?? '';
							statuteSearchFilters.sectionType = params.category ?? '';
							performSearch();
						}}
						onclear={() => {
							searchQuery = '';
							statuteResults = [];
							statuteSearchFilters.jurisdiction = '';
							statuteSearchFilters.sectionType = '';
							searchSuggestions = [];
						}}
					/>
				</div>
			{/if}

			<div class="filter-section">
				<h3>CATEGORIES</h3>
				<div class="filter-grid">
					{#each Object.entries(searchFilters) as [key, enabled]}
						<label class="filter-item">
							<input
								type="checkbox"
								checked={enabled}
								onchange={() => searchFilters[key as keyof typeof searchFilters] = !searchFilters[key as keyof typeof searchFilters]}
							/>
							<span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
						</label>
					{/each}
				</div>
			</div>

			<!-- GPU Rerank Toggle -->

			<!-- Scoring Method Toggle -->
			{#if searchMode === "rag"}
				<div class="filter-section">
					<h3><Icon name="bar-chart-2" size={14} /> SCORING METHOD</h3>
					<div class="scoring-toggle">
						<button class="mode-btn" class:active={scoringMethod === "vector_only"} onclick={() => scoringMethod = "vector_only"}>Vector Only</button>
						<button class="mode-btn" class:active={scoringMethod === "hybrid"} onclick={() => scoringMethod = "hybrid"}>Hybrid</button>
						<button class="mode-btn" class:active={scoringMethod === "tfidf_only"} onclick={() => scoringMethod = "tfidf_only"}>TF-IDF Only</button>
					</div>
					<p class="scoring-hint">
						{#if scoringMethod === "hybrid"}70% vector + 30% TF-IDF{:else if scoringMethod === "vector_only"}Semantic similarity only{:else}Term frequency matching only{/if}
					</p>
				</div>
			{/if}
{#if searchMode === 'evidence' || searchMode === 'rag'}
				<div class="filter-section">
					<h3><Icon name="cpu" size={14} /> GPU RERANKING</h3>
					<label class="filter-item">
						<input
							type="checkbox"
							checked={gpuRerankEnabled}
							onchange={() => { gpuRerankEnabled = !gpuRerankEnabled; }}
						/>
						<span>Enable WebGPU rerank</span>
					</label>
					{#if gpuRerankEnabled && !gpuRerankMetrics && !isGpuReranking && (evidenceBundles.length > 0 || ragResults.length > 0)}
						<button class="mode-btn" onclick={runGpuRerank} style="margin-top: 4px; width: 100%">
							Rerank Now
						</button>
					{/if}
					{#if isGpuReranking}
						<div class="timing-row">
							<span class="animate-spin"><Icon name="loader-circle" size={12} /></span>
							<span>Computing GPU scores...</span>
						</div>
					{/if}
				</div>
			{/if}

			<!-- GPU Rerank Metrics -->
			{#if gpuRerankMetrics}
				<div class="timing-panel">
					<h3><Icon name="cpu" size={14} /> GPU RERANK</h3>
					<div class="timing-grid">
						<div class="timing-row">
							<span>Backend</span>
							<span class="timing-value">{gpuRerankMetrics.backend}</span>
						</div>
						<div class="timing-row">
							<span>Query Embed</span>
							<span class="timing-value">{gpuRerankMetrics.queryEmbedMs}ms</span>
						</div>
						<div class="timing-row">
							<span>Chunk Embed ({gpuRerankMetrics.chunksProcessed})</span>
							<span class="timing-value">{gpuRerankMetrics.chunkEmbedMs}ms</span>
						</div>
						<div class="timing-row">
							<span>GPU Compute</span>
							<span class="timing-value">{gpuRerankMetrics.gpuComputeMs}ms</span>
						</div>
						<div class="timing-row total">
							<span>Total</span>
							<span class="timing-value">{gpuRerankMetrics.totalMs}ms</span>
						</div>
						{#if gpuRerankMetrics.chunksSkipped > 0}
							<div class="timing-row">
								<span>Skipped</span>
								<span class="timing-value">{gpuRerankMetrics.chunksSkipped}</span>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Timing Breakdown -->
			{#if platformTiming && (searchMode === 'all' || searchMode === 'reports' || searchMode === 'messages')}
				<div class="timing-panel">
					<h3><Icon name="clock" size={14} /> SEARCH TIMING</h3>
					<div class="timing-grid">
						<div class="timing-row total">
							<span>Total</span>
							<span class="timing-value">{platformTiming.totalMs}ms</span>
						</div>
						{#each Object.entries(platformTiming.adapters) as [name, info]}
							<div class="timing-row">
								<span>{name} ({info.count})</span>
								<span class="timing-value" class:error-text={info.status === 'error'}>{info.ms}ms</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
			{#if (searchMode === 'cases' || searchMode === 'statutes' || searchMode === 'precedents' || searchMode === 'glossary') && auxTiming.total_ms}
				<div class="timing-panel">
					<h3><Icon name="clock" size={14} /> TIMING</h3>
					<div class="timing-grid">
						{#each Object.entries(auxTiming) as [key, ms]}
							<div class="timing-row">
								<span>{key.replace(/_/g, ' ')}</span>
								<span class="timing-value">{ms}ms</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
			{#if (searchMode === 'evidence' && evidenceTiming) || (searchMode === 'rag' && ragTiming)}
				{@const timing = searchMode === 'evidence' ? evidenceTiming : ragTiming}
				<div class="timing-panel">
					<h3><Icon name="clock" size={14} /> PIPELINE TIMING</h3>
					<div class="timing-grid">
						{#if timing?.embedMs ?? timing?.embedding_time_ms}
							<div class="timing-row">
								<span>Embedding</span>
								<span class="timing-value">{formatProcessingTime(timing?.embedMs ?? timing?.embedding_time_ms ?? 0)}</span>
							</div>
						{/if}
						{#if timing?.searchMs ?? timing?.search_time_ms}
							<div class="timing-row">
								<span>Vector Search</span>
								<span class="timing-value">{formatProcessingTime(timing?.searchMs ?? timing?.search_time_ms ?? 0)}</span>
							</div>
						{/if}
						{#if timing?.rerankMs}
							<div class="timing-row">
								<span>Reranking</span>
								<span class="timing-value">{formatProcessingTime(timing.rerankMs)}</span>
							</div>
						{/if}
						{#if timing?.hopMs}
							<div class="timing-row">
								<span>Section Hop</span>
								<span class="timing-value">{formatProcessingTime(timing.hopMs)}</span>
							</div>
						{/if}
						{#if timing?.kagMs}
							<div class="timing-row">
								<span>KAG Graph</span>
								<span class="timing-value">{formatProcessingTime(timing.kagMs)}</span>
							</div>
						{/if}
						{#if timing?.dagMs}
							<div class="timing-row">
								<span>DAG Context</span>
								<span class="timing-value">{formatProcessingTime(timing.dagMs)}</span>
							</div>
						{/if}
						<div class="timing-row total">
							<span>Total</span>
							<span class="timing-value">{formatProcessingTime(timing?.totalMs ?? (timing?.search_time_ms ?? 0))}</span>
						</div>
					</div>
				</div>
			{/if}
		</aside>

		<!-- Center: Results -->
		<main class="results-panel">
			<div class="results-header">
				<h2>SEARCH RESULTS</h2>
				{#if totalFound > 0}
					<span class="results-count">{totalFound} matches</span>
				{/if}
			</div>

			{#if searchError}
				<div class="error-msg">
					<p>{searchError}</p>
					<p class="error-hint">Ensure Qdrant and Ollama services are running.</p>
				</div>
			{:else if isSearching}
				<div class="loading-state">
					<span class="animate-spin"><Icon name="loader-circle" size={32} /></span>
					<p>Running {searchMode === 'evidence' ? 'RAG+KAG+DAG' : searchMode === 'rag' ? 'RAG' : 'typed Drizzle'} pipeline...</p>
				</div>
			{:else if searchMode === 'all' && platformHits.length > 0}
				<!-- Platform Search Results (grouped) -->
				{#if Object.keys(platformGroups).length > 0}
					<div class="platform-groups">
						{#each Object.entries(platformGroups) as [entityType, count]}
							<span class="platform-group-badge">
								{entityType} <span class="group-count">{count}</span>
							</span>
						{/each}
					</div>
				{/if}
				{#each platformHits as hit, i}
					<a href={hit.route} class="result-card platform-hit">
						<div class="bundle-header">
							<div class="bundle-rank">#{i + 1}</div>
							<span class="entity-type-badge">{hit.entityType}</span>
							<div class="bundle-title">{hit.title}</div>
							<div class="confidence-badge" style="background: rgba(96, 165, 250, 0.15); color: #60a5fa;">
								{hit.matchType} · {Math.round(hit.score * 100)}%
							</div>
						</div>
						<p class="bundle-preview">{hit.snippet}</p>
						{#if hit.jurisdiction || hit.corpusType}
							<div class="bundle-meta">
								{#if hit.jurisdiction}
									<span class="meta-tag source">{hit.jurisdiction}</span>
								{/if}
								{#if hit.corpusType}
									<span class="meta-tag section">{hit.corpusType}</span>
								{/if}
							</div>
						{/if}
					</a>
				{/each}

			{:else if searchMode === 'law' && libraryResults.length > 0}
				<!-- Legal Library Search Results -->
				{#each libraryResults as hit, i}
					<a href="/library/{hit.document_id ?? ''}/node/{hit.node_id ?? ''}" class="result-card library-hit">
						<div class="bundle-header">
							<div class="bundle-rank">#{i + 1}</div>
							<div class="bundle-title">{hit.document_title ?? 'Legal Document'}</div>
							<div class="confidence-badge" style="background: rgba(74, 222, 128, 0.15); color: #4ade80;">
								{Math.round(((hit.score ?? hit.rrf_score ?? 0) as number) * 100)}%
							</div>
						</div>
						{#if hit.node_heading}
							<p class="hit-heading-label">{hit.node_heading}</p>
						{/if}
						<p class="bundle-preview">{hit.snippet ?? (hit.chunk_text ?? '').slice(0, 250)}</p>
						{#if hit.jurisdiction_code || hit.corpus_type}
							<div class="bundle-meta">
								{#if hit.jurisdiction_code}
									<span class="meta-tag source">{hit.jurisdiction_code}</span>
								{/if}
								{#if hit.corpus_type}
									<span class="meta-tag section">{hit.corpus_type}</span>
								{/if}
								{#if hit.citation_label}
									<span class="meta-tag citation">{hit.citation_label}</span>
								{/if}
							</div>
						{/if}
					</a>
				{/each}

			{:else if (searchMode === 'reports' || searchMode === 'messages') && platformHits.length > 0}
				<!-- Report/Message Results (via platform search) -->
				{#if Object.keys(platformGroups).length > 0}
					<div class="platform-groups">
						{#each Object.entries(platformGroups) as [entityType, count]}
							<span class="platform-group-badge">
								{entityType} <span class="group-count">{count}</span>
							</span>
						{/each}
					</div>
				{/if}
				{#each platformHits as hit, i}
					<a href={hit.route} class="result-card platform-hit">
						<div class="bundle-header">
							<div class="bundle-rank">#{i + 1}</div>
							<span class="entity-type-badge">{hit.entityType}</span>
							<div class="bundle-title">{hit.title}</div>
							<div class="confidence-badge" style="background: rgba(96, 165, 250, 0.15); color: #60a5fa;">
								{hit.matchType} · {Math.round(hit.score * 100)}%
							</div>
						</div>
						<p class="bundle-preview">{hit.snippet}</p>
						{#if hit.metadata}
							<div class="bundle-meta">
								{#if hit.metadata.type}
									<span class="meta-tag source">{hit.metadata.type}</span>
								{/if}
								{#if hit.metadata.status}
									<span class="meta-tag section">{hit.metadata.status}</span>
								{/if}
								{#if hit.metadata.role}
									<span class="meta-tag entity">{hit.metadata.role}</span>
								{/if}
							</div>
						{/if}
					</a>
				{/each}

			{:else if searchMode === 'cases' && caseResults.length > 0}
				{#each caseResults as result, i}
					<button
						class="result-card"
						onclick={() => {
							trackClick({
								documentId: result.id,
								recommendationId: `case-${result.id}`,
								searchContext: searchQuery,
							});
						}}
						type="button"
					>
						<div class="bundle-header">
							<div class="bundle-rank">#{i + 1}</div>
							<div class="bundle-title">{result.title}</div>
							<div class="confidence-badge" style="background: rgba(56, 178, 172, 0.15); color: #38b2ac;">
								{Math.round((result.score ?? 0) * 100)}%
							</div>
						</div>
						<p class="bundle-preview">{result.text}</p>
						<div class="bundle-meta">
							{#if result.metadata?.caseNumber}
								<span class="meta-tag section">{result.metadata.caseNumber}</span>
							{/if}
							{#if result.metadata?.jurisdiction}
								<span class="meta-tag source">{result.metadata.jurisdiction}</span>
							{/if}
							{#if result.metadata?.court}
								<span class="meta-tag entity">{result.metadata.court}</span>
							{/if}
							{#if result.metadata?.crimeCategories?.length > 0}
								<span class="meta-tag citation">{result.metadata.crimeCategories.join(', ')}</span>
							{/if}
							{#if result.metadata?.crimeClassifications?.length > 0}
								<span class="meta-tag confidence">{result.metadata.crimeClassifications.join(', ')}</span>
							{/if}
						</div>
					</button>
				{/each}
			{:else if searchMode === 'evidence' && evidenceBundles.length > 0}
				<!-- Evidence Bundles (RAG+KAG+DAG) -->
				{#each evidenceBundles as bundle, i}
					{@const conf = getConfidenceFromScore(bundle.hit.score)}
					<button
						class="bundle-card"
						class:selected={selectedBundle === bundle}
						onclick={() => {
						selectedBundle = bundle;
						selectedResult = null;
						// Track click on evidence bundle
						trackClick({
							documentId: bundle.hit.evidenceId,
							recommendationId: `evidence-${bundle.hit.chunkIndex}`,
							caseId: caseIdFilter || undefined,
							searchContext: searchQuery
						});
					}}
						type="button"
					>
						<div class="bundle-header">
							<div class="bundle-rank">#{i + 1}</div>
							<div class="bundle-title">
								{bundle.heading || bundle.documentContext?.fileName || `Chunk ${bundle.hit.chunkIndex}`}
							</div>
							<div class="confidence-badge" style="color: var(--{conf.color}); background: var(--{conf.bgColor})">
								{conf.label} ({(bundle.hit.score * 100).toFixed(1)}%)
							</div>
						</div>
						<p class="bundle-preview">{bundle.hit.content.slice(0, 200)}...</p>
						<div class="bundle-meta">
							{#if bundle.sectionPath.length > 0}
								<span class="meta-tag section">{bundle.sectionPath.join(' > ')}</span>
							{/if}
							{#if bundle.citations.length > 0}
								<span class="meta-tag citation">{bundle.citations.length} citations</span>
							{/if}
							{#if bundle.siblings.length > 0}
								<span class="meta-tag sibling">{bundle.siblings.length} siblings</span>
							{/if}
							{#if bundle.graphNeighbors.length > 0}
								<span class="meta-tag graph">{bundle.graphNeighbors.length} graph links</span>
							{/if}
						</div>
						{#if bundle.hit.rerank}
							<div class="rerank-bar">
								<span title="Cosine similarity">cos: {(bundle.hit.rerank.cosine * 100).toFixed(0)}%</span>
								<span title="Shared citations">cite: {bundle.hit.rerank.sharedCitations}</span>
								<span title="Section proximity">sec: {(bundle.hit.rerank.sectionProximity * 100).toFixed(0)}%</span>
							</div>
						{/if}
						{#if gpuRankedItems.length > 0}
							{@const gpuItem = gpuRankedItems.find(g => g.index === i)}
							{#if gpuItem && gpuItem.gpuScore >= 0}
								<div class="rerank-bar" style="border-color: rgba(99,179,237,0.3)">
									<span title="GPU cosine (WebGPU/WASM)"><Icon name="cpu" size={10} /> gpu: {(gpuItem.gpuScore * 100).toFixed(0)}%</span>
									<span title="Delta vs server">delta: {(gpuItem.delta * 100).toFixed(1)}%</span>
									<span title="GPU rerank position">gpu-rank: #{gpuRankedItems.indexOf(gpuItem) + 1}</span>
								</div>
							{/if}
						{/if}
					</button>
				{/each}
			{:else if searchMode === 'evidence' && evidenceResults.length > 0}
				<!-- Flat evidence results (no bundles) -->
				{#each evidenceResults as result, i}
					{@const conf = getConfidenceFromScore(result.score)}
					<div class="result-card">
						<div class="bundle-header">
							<div class="bundle-rank">#{i + 1}</div>
							<div class="bundle-title">{result.content?.slice(0, 80) || 'Evidence chunk'}</div>
							<div class="confidence-badge" style="color: var(--{conf.color}); background: var(--{conf.bgColor})">
								{conf.label} ({(result.score * 100).toFixed(1)}%)
							</div>
						</div>
					</div>
				{/each}
			{:else if searchMode === 'rag' && ragResults.length > 0}
				<!-- RAG results -->
				{#each ragResults as result, i}
					{@const conf = getConfidenceFromScore(result.score)}
					<button
						class="result-card"
						class:selected={selectedResult === result}
						onclick={() => {
						selectedResult = result;
						selectedBundle = null;
						// Track click on RAG result
						trackClick({
							documentId: result.source_id || result.chunk_id,
							recommendationId: `rag-${result.chunk_id}`,
							caseId: caseIdFilter || undefined,
							searchContext: searchQuery
						});
					}}
						type="button"
					>
						<div class="bundle-header">
							<div class="bundle-rank">#{i + 1}</div>
							<div class="bundle-title">{result.source_title}</div>
							<div class="confidence-badge" style="color: var(--{conf.color}); background: var(--{conf.bgColor})">
								{conf.label} ({(result.score * 100).toFixed(1)}%)
							</div>
						</div>
						<p class="bundle-preview">{result.snippet || result.text?.slice(0, 200)}</p>
						<div class="bundle-meta">
							<span class="meta-tag source">{result.source_type}</span>
							{#if result.confidence}
								<span class="meta-tag confidence">{result.confidence}</span>
							{/if}
							{#if result.section}
								<span class="meta-tag section">{result.section}</span>
							{/if}
							{#if result.related_entities?.length > 0}
								<span class="meta-tag entity">{result.related_entities.length} entities</span>
							{/if}
						</div>
						{#if scoringMethod !== "vector_only" && result.vector_score !== undefined}
							<div class="score-breakdown">
								<div class="score-bar-wrap">
									<div class="score-bar-track">
										<div class="score-bar-vector" style="width: {(result.vector_score ?? result.score) * 100}%"></div>
										<div class="score-bar-tfidf" style="width: {(result.tfidf_score ?? 0) * 100}%"></div>
									</div>
								</div>
								<div class="score-labels">
									<span class="score-vec">vec: {((result.vector_score ?? result.score) * 100).toFixed(0)}%</span>
									<span class="score-tfidf">tfidf: {((result.tfidf_score ?? 0) * 100).toFixed(0)}%</span>
									<span class="score-combined">combined: {(result.score * 100).toFixed(0)}%</span>
								</div>
							</div>
						{/if}
					</button>
				{/each}
			{:else if searchMode === 'statutes' && statuteResults.length > 0}
				<StatuteResultsList
					statutes={statuteResults.map(r => ({
						id: r.id,
						code: r.metadata?.section ?? r.title,
						title: r.text?.slice(0, 200),
						jurisdiction: r.metadata?.jurisdiction,
						severity: r.metadata?.sectionType,
						category: r.metadata?.category,
						relevance_score: r.score
					}))}
					onselect={(statute) => { console.log('Selected statute:', statute.code, statute.id); }}
				/>
			{:else if searchMode === 'precedents' && precedentResults.length > 0}
				{#each precedentResults as result, i}
					<div class="result-card">
						<div class="bundle-header">
							<div class="bundle-rank">#{i + 1}</div>
							<div class="bundle-title">{result.title}</div>
							<div class="confidence-badge" style="background: rgba(99,179,237,0.15); color: #63b3ed;">
								{Math.round((result.similarity ?? 0) * 100)}%
							</div>
						</div>
						<p class="bundle-preview">{result.summary?.slice(0, 300)}</p>
						<div class="bundle-meta">
							{#if result.citation}
								<span class="meta-tag section">{result.citation}</span>
							{/if}
							{#if result.court}
								<span class="meta-tag source">{result.court}</span>
							{/if}
							{#if result.source}
								<span class="meta-tag entity">{result.source}</span>
							{/if}
						</div>
					</div>
				{/each}
			{:else if searchMode === 'glossary' && glossaryResults.length > 0}
				{#each glossaryResults as result, i}
					<div class="result-card">
						<div class="bundle-header">
							<div class="bundle-rank">#{i + 1}</div>
							<div class="bundle-title">{result.term}</div>
							<div class="confidence-badge" style="background: rgba(236,201,75,0.15); color: #ecc94b;">
								{result.matchType}
							</div>
						</div>
						<p class="bundle-preview">{result.definition}</p>
						<div class="bundle-meta">
							{#if result.category}
								<span class="meta-tag source">{result.category}</span>
							{/if}
							{#if result.jurisdiction}
								<span class="meta-tag section">{result.jurisdiction}</span>
							{/if}
							{#if result.relatedTerms?.length > 0}
								<span class="meta-tag entity">{result.relatedTerms.length} related</span>
							{/if}
						</div>
					</div>
				{/each}
			{:else if !isSearching && searchQuery}
				<div class="empty-state">
					<Icon name="search" size={48} />
					<p>No results found for "{searchQuery}"</p>
					<p class="empty-hint">Try broader search terms or switch search mode.</p>
				</div>
			{:else}
				<div class="empty-state">
					<Icon name="search" size={48} />
					<p>Enter a query to search</p>
					<p class="empty-hint">Search across evidence, cases, statutes, precedents, and glossary.</p>
				</div>
			{/if}
		</main>

		<!-- Right Panel: Detail -->
		<aside class="detail-panel">
			{#if selectedBundle}
				{@const conf = getConfidenceFromScore(selectedBundle.hit.score)}
				<div class="detail-header">
					<h3>CONTEXT BUNDLE</h3>
				</div>
				<div class="detail-body">
					<div class="detail-section">
						<h4>CONFIDENCE RANKING</h4>
						<div class="confidence-display">
							<div class="confidence-bar-track">
								<div class="confidence-bar-fill" style="width: {selectedBundle.hit.score * 100}%"></div>
							</div>
							<span class="confidence-label">{conf.label} — {(selectedBundle.hit.score * 100).toFixed(1)}%</span>
						</div>
						{#if selectedBundle.hit.rerank}
							<div class="rerank-detail">
								<div class="rerank-row">
									<span>Cosine (75%)</span>
									<span>{(selectedBundle.hit.rerank.cosine * 100).toFixed(1)}%</span>
								</div>
								<div class="rerank-row">
									<span>Citations (15%)</span>
									<span>{selectedBundle.hit.rerank.sharedCitations} shared</span>
								</div>
								<div class="rerank-row">
									<span>Context (10%)</span>
									<span>{(selectedBundle.hit.rerank.sectionProximity * 100).toFixed(0)}% section depth</span>
								</div>
							</div>
						{/if}
						{#if gpuRankedItems.length > 0}
							{@const bundleIdx = evidenceBundles.indexOf(selectedBundle)}
							{@const gpuItem = gpuRankedItems.find(g => g.index === bundleIdx)}
							{#if gpuItem && gpuItem.gpuScore >= 0}
								<div class="rerank-detail" style="border-top: 1px solid rgba(99,179,237,0.2); margin-top: 8px; padding-top: 8px">
									<div class="rerank-row">
										<span><Icon name="cpu" size={12} /> GPU Cosine</span>
										<span>{(gpuItem.gpuScore * 100).toFixed(1)}%</span>
									</div>
									<div class="rerank-row">
										<span>GPU Rank</span>
										<span>#{gpuRankedItems.indexOf(gpuItem) + 1}</span>
									</div>
									<div class="rerank-row">
										<span>Server-GPU Delta</span>
										<span>{(gpuItem.delta * 100).toFixed(1)}%</span>
									</div>
									{#if gpuRerankMetrics}
										<div class="rerank-row">
											<span>Backend</span>
											<span>{gpuRerankMetrics.backend}</span>
										</div>
									{/if}
								</div>
							{/if}
						{/if}
					</div>

					<!-- Document Context -->
					{#if selectedBundle.documentContext}
						<div class="detail-section">
							<h4>DOCUMENT</h4>
							<p class="detail-value">{selectedBundle.documentContext.fileName}</p>
							{#if selectedBundle.documentContext.description}
								<p class="detail-desc">{selectedBundle.documentContext.description}</p>
							{/if}
							{#if selectedBundle.documentContext.aiSummary}
								<p class="detail-summary">{selectedBundle.documentContext.aiSummary}</p>
							{/if}
						</div>
					{/if}

					<!-- Content -->
					<div class="detail-section">
						<h4>CONTENT</h4>
						<pre class="detail-content">{selectedBundle.hit.content}</pre>
					</div>

					<!-- Section Path -->
					{#if selectedBundle.sectionPath.length > 0}
						<div class="detail-section">
							<h4>SECTION PATH</h4>
							<div class="section-breadcrumb">
								{#each selectedBundle.sectionPath as seg, i}
									{#if i > 0}<Icon name="chevron-right" size={12} />{/if}
									<span>{seg}</span>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Citations -->
					{#if selectedBundle.citations.length > 0}
						<div class="detail-section">
							<h4>CITATIONS ({selectedBundle.citations.length})</h4>
							<ul class="citation-list">
								{#each selectedBundle.citations as cit}
									<li>{cit}</li>
								{/each}
							</ul>
						</div>
					{/if}

					<!-- Siblings -->
					{#if selectedBundle.siblings.length > 0}
						<div class="detail-section">
							<h4>SIBLING CHUNKS ({selectedBundle.siblings.length})</h4>
							{#each selectedBundle.siblings.slice(0, 3) as sib}
								<div class="sibling-chunk">
									<span class="chunk-idx">#{sib.chunkIndex}</span>
									<p>{sib.content.slice(0, 150)}...</p>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Graph Neighbors -->
					{#if selectedBundle.graphNeighbors.length > 0}
						<div class="detail-section">
							<h4><Icon name="network" size={14} /> GRAPH NEIGHBORS ({selectedBundle.graphNeighbors.length})</h4>
							{#each selectedBundle.graphNeighbors as neighbor}
								<div class="neighbor-card">
									<div class="neighbor-header">
										<span class="neighbor-title">{neighbor.title}</span>
										<span class="neighbor-type">{neighbor.connectionType}</span>
									</div>
									<div class="neighbor-meta">
										<span>Strength: {neighbor.strength}</span>
										<span>Confidence: {(neighbor.confidence * 100).toFixed(0)}%</span>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if selectedResult}
				{@const conf = getConfidenceFromScore(selectedResult.score)}
				<div class="detail-header">
					<h3>RESULT DETAIL</h3>
				</div>
				<div class="detail-body">
					<div class="detail-section">
						<h4>CONFIDENCE</h4>
						<div class="confidence-display">
							<div class="confidence-bar-track">
								<div class="confidence-bar-fill" style="width: {selectedResult.score * 100}%"></div>
							</div>
							<span class="confidence-label">{conf.label} — {(selectedResult.score * 100).toFixed(1)}%</span>
						</div>
					</div>
						{#if scoringMethod !== "vector_only" && selectedResult.vector_score !== undefined}
						<div class="detail-section">
							<h4>SCORING BREAKDOWN</h4>
							<div class="rerank-detail">
								<div class="rerank-row">
									<span>Vector Similarity (70%)</span>
									<span>{((selectedResult.vector_score ?? selectedResult.score) * 100).toFixed(1)}%</span>
								</div>
								<div class="rerank-row">
									<span>TF-IDF Score (30%)</span>
									<span>{((selectedResult.tfidf_score ?? 0) * 100).toFixed(1)}%</span>
								</div>
								<div class="rerank-row" style="border-top: 1px solid #3a3020; padding-top: 4px; margin-top: 2px; color: #f8f0d9; font-weight: 600">
									<span>Combined Score</span>
									<span>{(selectedResult.score * 100).toFixed(1)}%</span>
								</div>
							</div>
							<div class="score-bar-wrap" style="margin-top: 8px">
								<div class="score-bar-track">
									<div class="score-bar-vector" style="width: {(selectedResult.vector_score ?? selectedResult.score) * 100}%"></div>
									<div class="score-bar-tfidf" style="width: {(selectedResult.tfidf_score ?? 0) * 100}%"></div>
								</div>
							</div>
						</div>
					{/if}
<div class="detail-section">
						<h4>SOURCE</h4>
						<p class="detail-value">{selectedResult.source_title}</p>
						<p class="detail-desc">{selectedResult.source_type}</p>
					</div>
					<div class="detail-section">
						<h4>CONTENT</h4>
						<pre class="detail-content">{selectedResult.text}</pre>
					</div>
					{#if selectedResult.related_entities?.length > 0}
						<div class="detail-section">
							<h4>ENTITIES</h4>
							<div class="entity-list">
								{#each selectedResult.related_entities as entity}
									<span class="entity-tag">{entity}</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<div class="detail-placeholder">
					<Icon name="search" size={40} />
					<h3>NO SELECTION</h3>
					<p>Select a search result to view details, confidence ranking, and graph connections.</p>
				</div>
			{/if}
		</aside>
	</div>

	<!-- RAG Assistant Panel -->
	<div class="rag-toggle">
		<button class="rag-toggle-btn" class:active={showKagSearch} onclick={() => (showKagSearch = !showKagSearch)}>
			{showKagSearch ? '[-] HIDE KAG SEARCH' : '[+] KAG SEARCH PANEL'}
		</button>
		<button class="rag-toggle-btn" class:active={showRAGAssistant} onclick={() => (showRAGAssistant = !showRAGAssistant)}>
			{showRAGAssistant ? '[-] HIDE RAG ASSISTANT' : '[+] RAG SEARCH ASSISTANT'}
		</button>
		<button class="rag-toggle-btn" class:active={showCodebaseSearch} onclick={() => (showCodebaseSearch = !showCodebaseSearch)}>
			{showCodebaseSearch ? '[-] HIDE CODEBASE SEARCH' : '[+] CODEBASE SEARCH (Ctrl+K)'}
		</button>
		<button class="rag-toggle-btn" class:active={showChunkViewer} onclick={() => (showChunkViewer = !showChunkViewer)}>
			{showChunkViewer ? '[-] HIDE CHUNK VIEWER' : '[+] DOCUMENT CHUNK VIEWER'}
		</button>
		<button class="rag-toggle-btn" class:active={showVectorSearch} onclick={() => (showVectorSearch = !showVectorSearch)}>
			{showVectorSearch ? '[-] HIDE VECTOR SEARCH' : '[+] VECTOR INTELLIGENCE'}
		</button>
		<button class="rag-toggle-btn" onclick={() => {
			contextConfirmData = {
				context_id: 'ctx-' + Date.now(),
				source: 'chat_history',
				score: 0.87,
				snippet: 'Previous search context will appear here when available...',
				timestamp: new Date().toISOString()
			};
			showContextConfirm = true;
		}}>
			[?] CONFIRM CONTEXT
		</button>
	</div>
	{#if showKagSearch}
		<div class="rag-panel">
			<SearchPanel />
		</div>
	{/if}
	{#if showRAGAssistant}
		<div class="rag-panel">
			<RAGSearchComponent />
		</div>
	{/if}
	{#if showCodebaseSearch}
		<div class="rag-panel">
			<CodebaseSearch />
		</div>
	{/if}
	{#if showChunkViewer}
		<div class="rag-panel">
			<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; min-height: 400px;">
				<div>
					<SearchResults
						results={ragResults.map((r, i) => ({
							chunk_id: r.chunk_id,
							doc_id: r.source_id ?? r.source_title ?? 'unknown',
							page: 1,
							text: r.text ?? r.snippet ?? '',
							relevance_score: r.score,
							semantic_type: r.source_type,
							rank: i + 1,
						}))}
						onselect={(result) => { chunkViewerResult = result; }}
					/>
				</div>
				<div>
					<ResultDetail result={chunkViewerResult} />
				</div>
			</div>
		</div>
	{/if}
	{#if showVectorSearch}
		<div class="rag-panel">
			<VectorIntelligenceDemo />
		</div>
	{/if}
</div>

{#if showContextConfirm && contextConfirmData}
	<ContextConfirmModal
		context={contextConfirmData}
		hint="Is this the search context you were looking for?"
		onaccept={({ comment }) => { console.log('Context accepted:', contextConfirmData?.context_id, comment); showContextConfirm = false; }}
		onreject={({ comment }) => { console.log('Context rejected:', contextConfirmData?.context_id, comment); showContextConfirm = false; }}
	/>
{/if}

<style>
	.rag-toggle {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-top: 1px solid #3a3520;
	}

	.rag-toggle-btn {
		background: none;
		border: 1px solid #3a3520;
		color: #8a7a5a;
		font-family: inherit;
		font-size: 0.7rem;
		padding: 0.3rem 0.75rem;
		cursor: pointer;
		letter-spacing: 0.05em;
		transition: all 0.2s;
	}

	.rag-toggle-btn:hover { background: #2a2510; color: #d4c9a9; }
	.rag-toggle-btn.active { background: #2a2510; color: #d4c9a9; border-color: #5a4a30; }

	.rag-panel {
		padding: 1rem;
		border-top: 1px solid #3a3520;
		max-height: 60vh;
		overflow-y: auto;
	}
	.search-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #1a1610;
		color: #d4c9a9;
		font-family: 'JetBrains Mono', monospace;
		margin: -2.5rem;
		padding: 0;
	}

	.search-page :global(h1),
	.search-page :global(h2),
	.search-page :global(h3),
	.search-page :global(p) {
		color: inherit;
		text-transform: none;
		letter-spacing: normal;
		margin: 0;
	}

	.search-page :global(a) {
		color: inherit;
		border-bottom: none;
	}

	.search-page :global(button) {
		text-transform: none;
		letter-spacing: normal;
		background: none;
		border: none;
		box-shadow: none;
		padding: 0;
		color: inherit;
	}

	.search-page :global(input),
	.search-page :global(select) {
		background: transparent;
		border: none;
		box-shadow: none;
		color: inherit;
	}

	.search-page :global(.panel),
	.search-page :global(.card),
	.search-page :global([class*="panel"]) {
		background: transparent;
		border: none;
		box-shadow: none;
		color: inherit;
		padding: 0;
	}

	.search-header {
		padding: 1rem 1.5rem;
		background: #2a2016;
		border-bottom: 2px solid #3a3020;
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.header-title h1 {
		margin: 0;
		font-size: 1.25rem;
		letter-spacing: 0.15em;
		color: #f8f0d9;
	}

	.header-sub {
		margin: 0;
		font-size: 0.7rem;
		color: #8a7a5a;
		letter-spacing: 0.05em;
	}

	.mode-toggle {
		display: flex;
		gap: 4px;
		background: #1a1610;
		border-radius: 6px;
		padding: 3px;
	}

	.mode-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0.4rem 0.75rem;
		font-size: 0.7rem;
		font-family: inherit;
		font-weight: 600;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		background: transparent;
		color: #8a7a5a;
		transition: all 0.15s;
		letter-spacing: 0.03em;
	}

	.mode-btn.active {
		background: #3a3020;
		color: #f8f0d9;
	}

	.mode-btn:hover:not(.active) {
		color: #d4c9a9;
	}

	/* Layout */
	.search-layout {
		display: grid;
		grid-template-columns: 280px 1fr 340px;
		gap: 0;
		flex: 1;
		min-height: 0;
	}

	/* Filter Panel */
	.filter-panel {
		background: #221d15;
		border-right: 1px solid #3a3020;
		padding: 1rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.search-box {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.search-input-wrap {
		display: flex;
		align-items: center;
		gap: 8px;
		background: #1a1610;
		border: 1px solid #3a3020;
		border-radius: 4px;
		padding: 0 8px;
	}

	.search-input-wrap .search-icon {
		color: #8a7a5a;
		flex-shrink: 0;
		display: flex;
	}

	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		color: #f8f0d9;
		font-family: inherit;
		font-size: 0.8rem;
		padding: 8px 0;
		outline: none;
	}

	.search-input::placeholder {
		color: #5a5040;
	}

	.clear-btn {
		background: none;
		border: none;
		color: #8a7a5a;
		cursor: pointer;
		padding: 2px;
		display: flex;
	}

	.clear-btn:hover {
		color: #f8f0d9;
	}

	.filter-section h3 {
		font-size: 0.65rem;
		letter-spacing: 0.15em;
		color: #8a7a5a;
		margin: 0 0 8px;
		font-weight: 600;
	}

	.filter-input {
		width: 100%;
		padding: 6px 10px;
		background: #1a1610;
		border: 1px solid #3a3020;
		border-radius: 4px;
		color: #f8f0d9;
		font-family: inherit;
		font-size: 0.75rem;
	}

	.filter-grid {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.filter-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.75rem;
		cursor: pointer;
		color: #d4c9a9;
	}

	.filter-item input[type="checkbox"] {
		accent-color: #c9a96e;
	}

	/* Timing Panel */
	.timing-panel {
		background: #1a1610;
		border: 1px solid #3a3020;
		border-radius: 4px;
		padding: 10px;
	}

	.timing-panel h3 {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.65rem;
		letter-spacing: 0.15em;
		color: #c9a96e;
		margin: 0 0 8px;
	}

	.timing-grid {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.timing-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		color: #8a7a5a;
	}

	.timing-row.total {
		border-top: 1px solid #3a3020;
		padding-top: 4px;
		margin-top: 2px;
		color: #f8f0d9;
		font-weight: 600;
	}

	.timing-value {
		color: #d4c9a9;
		font-variant-numeric: tabular-nums;
	}

	/* Results Panel */
	.results-panel {
		padding: 1rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.results-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}

	.results-header h2 {
		margin: 0;
		font-size: 0.8rem;
		letter-spacing: 0.15em;
		color: #c9a96e;
	}

	.results-count {
		font-size: 0.7rem;
		color: #8a7a5a;
	}

	.bundle-card, .result-card {
		background: #221d15;
		border: 1px solid #3a3020;
		border-radius: 4px;
		padding: 12px;
		cursor: pointer;
		transition: all 0.15s;
		text-align: left;
		width: 100%;
		font-family: inherit;
		color: #d4c9a9;
	}

	.bundle-card:hover, .result-card:hover {
		border-color: #c9a96e;
	}

	.bundle-card.selected, .result-card.selected {
		border-color: #c9a96e;
		background: #2a2418;
	}

	.bundle-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	.bundle-rank {
		font-size: 0.65rem;
		color: #8a7a5a;
		font-weight: 700;
		min-width: 24px;
	}

	.bundle-title {
		flex: 1;
		font-size: 0.8rem;
		font-weight: 600;
		color: #f8f0d9;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.confidence-badge {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 3px;
		white-space: nowrap;
		background: #2a2016;
	}

	.bundle-preview {
		margin: 0 0 8px;
		font-size: 0.75rem;
		color: #8a7a5a;
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.bundle-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.meta-tag {
		font-size: 0.6rem;
		padding: 2px 6px;
		border-radius: 3px;
		background: #1a1610;
		color: #8a7a5a;
		font-weight: 500;
	}

	.meta-tag.section { color: #c9a96e; }
	.meta-tag.citation { color: #6ba3a0; }
	.meta-tag.sibling { color: #8a9a6a; }
	.meta-tag.graph { color: #a07a5a; }
	.meta-tag.source { color: #c9a96e; }
	.meta-tag.confidence { color: #8a9a6a; }
	.meta-tag.entity { color: #6ba3a0; }

	.rerank-bar {
		display: flex;
		gap: 12px;
		margin-top: 6px;
		padding-top: 6px;
		border-top: 1px solid #2a2418;
		font-size: 0.6rem;
		color: #5a5040;
	}

	/* Loading / Error / Empty states */
	.loading-state, .empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 4rem 2rem;
		color: #5a5040;
		text-align: center;
	}

	.loading-state p, .empty-state p {
		margin: 0;
		font-size: 0.85rem;
	}

	.empty-hint, .error-hint {
		font-size: 0.7rem;
		color: #4a4030;
	}

	/* Platform search */
	.platform-groups {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
	}

	.platform-group-badge {
		font-size: 0.6875rem;
		padding: 0.2rem 0.6rem;
		border-radius: 99px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.5);
		text-transform: capitalize;
	}

	.group-count {
		font-weight: 700;
		color: #60a5fa;
		margin-left: 0.25rem;
	}

	.entity-type-badge {
		font-size: 0.5625rem;
		font-weight: 700;
		text-transform: uppercase;
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.4);
		letter-spacing: 0.03em;
	}

	.platform-hit, .library-hit {
		text-decoration: none;
		color: inherit;
		display: block;
	}

	.hit-heading-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.4);
		margin: 0.15rem 0 0.35rem;
	}

	.error-msg {
		padding: 1rem;
		background: #2a1515;
		border: 1px solid #5a2020;
		border-radius: 4px;
		text-align: center;
	}

	.error-msg p {
		margin: 0 0 4px;
		color: #d4a0a0;
		font-size: 0.8rem;
	}

	/* Detail Panel */
	.detail-panel {
		background: #221d15;
		border-left: 1px solid #3a3020;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.detail-header {
		padding: 1rem;
		border-bottom: 1px solid #3a3020;
	}

	.detail-header h3 {
		margin: 0;
		font-size: 0.7rem;
		letter-spacing: 0.15em;
		color: #c9a96e;
	}

	.detail-body {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.detail-section h4 {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 8px;
		font-size: 0.65rem;
		letter-spacing: 0.12em;
		color: #8a7a5a;
	}

	.confidence-display {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.confidence-bar-track {
		height: 6px;
		background: #1a1610;
		border-radius: 3px;
		overflow: hidden;
	}

	.confidence-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, #8B1521, #B8965A, #2D5F3F);
		border-radius: 3px;
		transition: width 0.3s;
	}

	.confidence-label {
		font-size: 0.75rem;
		color: #d4c9a9;
		font-weight: 600;
	}

	.rerank-detail {
		margin-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.rerank-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		color: #8a7a5a;
	}

	.detail-value {
		font-size: 0.8rem;
		color: #f8f0d9;
		font-weight: 500;
	}

	.detail-desc {
		font-size: 0.75rem;
		color: #8a7a5a;
		margin: 4px 0 0;
	}

	.detail-summary {
		font-size: 0.75rem;
		color: #a09070;
		margin: 6px 0 0;
		font-style: italic;
	}

	.detail-content {
		font-size: 0.75rem;
		color: #d4c9a9;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
		background: #1a1610;
		padding: 10px;
		border-radius: 4px;
		border: 1px solid #2a2418;
		margin: 0;
		font-family: inherit;
		max-height: 300px;
		overflow-y: auto;
	}

	.section-breadcrumb {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.7rem;
		color: #c9a96e;
		flex-wrap: wrap;
	}

	.citation-list {
		margin: 0;
		padding: 0 0 0 1rem;
		list-style: disc;
		font-size: 0.7rem;
		color: #6ba3a0;
	}

	.citation-list li {
		margin-bottom: 4px;
	}

	.sibling-chunk {
		background: #1a1610;
		padding: 8px;
		border-radius: 4px;
		margin-bottom: 6px;
		border: 1px solid #2a2418;
	}

	.chunk-idx {
		font-size: 0.6rem;
		color: #8a7a5a;
		font-weight: 700;
	}

	.sibling-chunk p {
		margin: 4px 0 0;
		font-size: 0.7rem;
		color: #8a7a5a;
		line-height: 1.4;
	}

	.neighbor-card {
		background: #1a1610;
		padding: 8px;
		border-radius: 4px;
		border: 1px solid #2a2418;
		margin-bottom: 6px;
	}

	.neighbor-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}

	.neighbor-title {
		font-size: 0.75rem;
		color: #f8f0d9;
		font-weight: 500;
	}

	.neighbor-type {
		font-size: 0.6rem;
		color: #a07a5a;
		background: #2a2016;
		padding: 2px 6px;
		border-radius: 3px;
	}

	.neighbor-meta {
		display: flex;
		gap: 12px;
		font-size: 0.65rem;
		color: #8a7a5a;
	}

	.entity-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.entity-tag {
		font-size: 0.65rem;
		padding: 2px 6px;
		border-radius: 3px;
		background: #1a2a2a;
		color: #6ba3a0;
	}

	.detail-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 2rem;
		text-align: center;
		color: #5a5040;
	}

	.detail-placeholder h3 {
		margin: 1rem 0 0.5rem;
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		color: #8a7a5a;
	}

	.detail-placeholder p {
		margin: 0;
		font-size: 0.75rem;
		color: #5a5040;
		line-height: 1.5;
	}

	.animate-spin {
		display: inline-flex;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	@media (max-width: 1024px) {
		.search-layout {
			grid-template-columns: 1fr;
		}
		.filter-panel, .detail-panel {
			display: none;
		}
	}


	/* Scoring Toggle */
	.scoring-toggle {
		display: flex;
		gap: 4px;
		background: #1a1610;
		border-radius: 4px;
		padding: 3px;
	}

	.scoring-hint {
		margin: 6px 0 0;
		font-size: 0.6rem;
		color: #5a5040;
		font-style: italic;
	}

	/* Score Breakdown */
	.score-breakdown {
		margin-top: 8px;
		padding-top: 6px;
		border-top: 1px solid #2a2418;
	}

	.score-bar-wrap {
		margin-bottom: 4px;
	}

	.score-bar-track {
		display: flex;
		height: 4px;
		background: #1a1610;
		border-radius: 2px;
		overflow: hidden;
		gap: 1px;
	}

	.score-bar-vector {
		height: 100%;
		background: #6ba3a0;
		border-radius: 2px 0 0 2px;
		transition: width 0.3s;
	}

	.score-bar-tfidf {
		height: 100%;
		background: #c9a96e;
		border-radius: 0 2px 2px 0;
		transition: width 0.3s;
	}

	.score-labels {
		display: flex;
		gap: 10px;
		font-size: 0.6rem;
	}

	.score-vec { color: #6ba3a0; }
	.score-tfidf { color: #c9a96e; }
	.score-combined { color: #d4c9a9; margin-left: auto; font-weight: 600; }
</style>