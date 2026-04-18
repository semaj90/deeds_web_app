<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let { data } = $props();

	let summary = $derived(data.summary);
	let patterns = $derived(data.patterns);

	let activeTab = $state<'overview' | 'patterns' | 'cache' | 'for-you' | 'search-intel' | 'deep-research' | 'matrix' | 'playground'>('overview');

	// Listen for Alt+D / Alt+R keyboard navigation from layout
	onMount(() => {
		if (!browser) return;
		// Check URL hash for initial tab
		const hash = window.location.hash.replace('#', '') as typeof activeTab;
		const validTabs = ['overview','patterns','cache','for-you','search-intel','deep-research','matrix','playground'];
		if (validTabs.includes(hash)) { activeTab = hash; }

		function handleNavAnalytics(e: Event) {
			const tab = (e as CustomEvent<{ tab: string }>).detail?.tab as typeof activeTab;
			if (tab && validTabs.includes(tab)) {
				activeTab = tab;
				if (tab === 'for-you') loadForYou();
				if (tab === 'search-intel') loadSearchIntel();
				if (tab === 'deep-research') loadDeepResearch();
				if (tab === 'matrix') loadMatrix();
				if (tab === 'playground') loadPlayground();
				window.history.replaceState(null, '', `/analytics#${tab}`);
			}
		}
		window.addEventListener('yorha:nav-analytics', handleNavAnalytics);
		return () => window.removeEventListener('yorha:nav-analytics', handleNavAnalytics);
	});

	interface PersonalizedCase {
		caseId: string;
		title: string;
		score: number;
		reason: string;
		interactionTypes: string[];
	}

	let personalizedCases = $state<PersonalizedCase[]>([]);
	let forYouLoading = $state(false);

	async function loadForYou() {
		if (personalizedCases.length > 0) return; // already loaded
		forYouLoading = true;
		try {
			const res = await fetch('/api/recommendations');
			if (res.ok) {
				const json = await res.json();
				personalizedCases = json.data?.personalizedCases ?? [];
			}
		} catch { /* non-fatal */ }
		forYouLoading = false;
	}

	// ── Search Intelligence — matches /api/analytics/search-patterns response ──
	interface SearchIntelData {
		hotQueries:          Array<{ query: string; hits: number; hash: string }>;
		trending:            Array<{ query_hash: string; query: string | null; recent_hits: number; prior_hits: number; growth_rate: number }>;
		crossPipelineChamps: Array<{ chunk_id: string; relative_path: string | null; pipeline_count: number; pipelines: string; total_hits: number; avg_rerank: number | null; quality_score: number }>;
		pipelineMemory:      Array<{ pipeline: string; total_hits: number; unique_chunks: number; unique_queries: number; avg_rerank: number | null; top_chunk_path: string | null }>;
		didYouMean:          Array<{ suggestion: string; similarity: number; hitCount: number; source: string; qualityTier?: string }>;
		chunkQuality:        Array<{ chunk_id: string; relative_path: string | null; hit_count: number; avg_rerank: number | null; unique_queries: number; pipelines: string[]; quality_score: number }>;
		clusterHeat:         Array<{ gpu_cluster: number; total_hits: number; unique_queries: number; avg_rerank: number | null }>;
	}

	let searchIntel = $state<SearchIntelData | null>(null);
	let searchIntelLoading = $state(false);

	async function loadSearchIntel() {
		if (searchIntel) return;
		searchIntelLoading = true;
		try {
			const res = await fetch('/api/analytics/search-patterns');
			if (res.ok) searchIntel = await res.json();
		} catch { /* non-fatal */ }
		searchIntelLoading = false;
	}

	// ── Deep Research — self-prompting via RAG/KAG/DAG/ACE + feedback index ──
	interface ResearchTopic {
		id:          string;
		title:       string;
		description: string;
		reasoning:   string;
		priority:    'high' | 'medium' | 'low';
		sources:     string[];
		selfPrompt:  string;
		tags:        string[];
		pipelineHint: string;
	}

	interface FeedbackSignal {
		queryHash:  string;
		query:      string;
		thumbsUp:   number;
		thumbsDown: number;
		pipeline:   string;
	}

	interface PipelineHitSummary {
		pipeline:      string;
		totalHits:     number;
		uniqueChunks:  number;
		uniqueQueries: number;
		avgRerank:     number | null;
		topChunkPath:  string | null;
	}

	interface DeepResearchData {
		topics:            ResearchTopic[];
		feedbackSignals:   FeedbackSignal[];
		pipelineSummary:   PipelineHitSummary[];
		graphInsights:     Array<{ caseId: string; title: string; centrality: number; sharedTypes: string[] }>;
		hotQueryTags:      string[];
		topPrompts:        string[];
		generatedAt:       string | null;
		modelUsed:         string | null;
		cachedUntil:       string | null;
	}

	let deepResearch = $state<DeepResearchData | null>(null);
	let deepResearchLoading = $state(false);
	let deepResearchError = $state<string | null>(null);

	// Self-prompt execution state
	let executingPromptId = $state<string | null>(null);
	let promptResult = $state<{ answer: string; pipeline: string; durationMs: number } | null>(null);

	async function loadDeepResearch(refresh = false) {
		if (deepResearch && !refresh) return;
		deepResearchLoading = true;
		deepResearchError = null;
		try {
			const url = refresh ? '/api/analytics/deep-research?refresh=true' : '/api/analytics/deep-research';
			const res = await fetch(url);
			if (res.ok) {
				deepResearch = await res.json();
			} else {
				deepResearchError = 'Failed to load research topics';
			}
		} catch {
			deepResearchError = 'Network error loading research topics';
		}
		deepResearchLoading = false;
	}

	async function executeSelfPrompt(topic: ResearchTopic) {
		executingPromptId = topic.id;
		promptResult = null;
		try {
			const res = await fetch('/api/analytics/deep-research', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					selfPrompt: topic.selfPrompt,
					pipelineHint: topic.pipelineHint,
				}),
			});
			if (res.ok) {
				promptResult = await res.json();
			}
		} catch { /* non-fatal */ }
		executingPromptId = null;
	}

	// ── MapReduce Matrix state ──────────────────────────────────────────
	interface MatrixRow {
		chunkId: string;
		filePath: string;
		scores: number[];
		composite: number;
	}
	interface MatrixData {
		matrix: MatrixRow[];
		topChunks: Array<{ chunkId: string; filePath: string; composite: number; pipeline: string }>;
		pipelineCoverage: Record<string, number>;
		glyphContext: { totalGlyphs: number; topSections: Array<{ section: string; count: number }> };
		synthesis: { topics: Array<{ title: string; rationale: string; selfPrompt: string; pipeline: string }> } | null;
		meta: { userId: string; days: number; rowCount: number; computeMs: number };
	}
	let matrixData = $state<MatrixData | null>(null);
	let matrixLoading = $state(false);
	let matrixError = $state<string | null>(null);

	async function loadMatrix(refresh = false) {
		if (matrixData && !refresh) return;
		matrixLoading = true;
		matrixError = null;
		try {
			const url = refresh ? '/api/analytics/mapreduce-matrix?refresh=true' : '/api/analytics/mapreduce-matrix';
			const res = await fetch(url);
			if (res.ok) {
				matrixData = await res.json();
			} else {
				matrixError = 'Failed to load matrix analysis';
			}
		} catch {
			matrixError = 'Network error loading matrix';
		}
		matrixLoading = false;
	}

	// ── Research Playground — unified query across all analytics sources ──
	interface UnifiedTopic {
		id: string; title: string; selfPrompt: string; pipeline: string;
		priority: 'high' | 'medium' | 'low'; score: number;
		sources: string[]; tags: string[]; mcpHints: string[];
	}
	interface AwkAgg { pipeline: string; hitCount: number; avgScore: number; p50Score: number; highQuality: number; mediumQuality: number; lowQuality: number }
	interface ScoreBucket { bucketStart: number; count: number; pipeline: string }
	interface PlaygroundResult {
		unifiedTopics: UnifiedTopic[];
		selfPromptChain: string[];
		aggregations: { pipelineStats: AwkAgg[]; scoreBuckets: ScoreBucket[] };
		deepResearch: { topics: unknown[]; hotQueryTags: string[]; topPrompts: string[] } | null;
		codebaseInsights: { topics: unknown[]; filesScanned: number } | null;
		webInsights: { batches: unknown[]; totalSummaries: number } | null;
		fetchedPage: { url: string; title: string; markdown: string; source: string } | null;
		langGraphState: { messages: { role: string; name?: string; content: string | unknown }[]; next: string; step?: number; accumulated: { topics: string[]; selfPrompts: string[] } } | null;
		meta: { computeMs: number; sources: string[]; cachedUntil: string };
	}
	let playgroundQuery        = $state('');
	let playgroundPipeline     = $state('all');
	let playgroundDepth        = $state(3);
	let playgroundDays         = $state(7);
	let playgroundIncludeWeb   = $state(false);
	let playgroundIncludeMx    = $state(true);
	let playgroundIncludeCb    = $state(true);
	let playgroundResult       = $state<PlaygroundResult | null>(null);
	let playgroundLoading      = $state(false);
	let playgroundError        = $state<string | null>(null);
	let playgroundAggOnly      = $state<{ pipelineStats: AwkAgg[]; scoreBuckets: ScoreBucket[] } | null>(null);

	async function loadPlayground() {
		if (playgroundAggOnly) return;
		try {
			const res = await fetch('/api/analytics/unified-research?days=7');
			if (res.ok) {
				const json = await res.json();
				playgroundAggOnly = json.aggregations;
			}
		} catch { /* non-fatal */ }
	}

	async function runPlayground() {
		playgroundLoading = true;
		playgroundError = null;
		try {
			const res = await fetch('/api/analytics/unified-research', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query:           playgroundQuery || undefined,
					pipeline:        playgroundPipeline,
					depth:           playgroundDepth,
					days:            playgroundDays,
					includeWeb:      playgroundIncludeWeb,
					includeMatrix:   playgroundIncludeMx,
					includeCodebase: playgroundIncludeCb,
				}),
			});
			if (res.ok) {
				const json = await res.json();
				playgroundResult = json;
				playgroundAggOnly = json.aggregations;
			} else {
				playgroundError = 'Query failed — check console';
			}
		} catch (e: unknown) {
			playgroundError = e instanceof Error ? e.message : 'Network error';
		}
		playgroundLoading = false;
	}

	async function runSelfPrompt(prompt: string) {
		if (executingPromptId) return;
		executingPromptId = prompt;
		playgroundQuery = prompt;
		await runPlayground();
		executingPromptId = null;
	}


	function priorityColor(p: string): string {
		if (p === 'high') return 'rgba(248, 113, 113, 0.8)';
		if (p === 'medium') return 'rgba(251, 191, 36, 0.7)';
		return 'rgba(52, 211, 153, 0.7)';
	}

	function formatRate(rate: number): string {
		return `${(rate * 100).toFixed(1)}%`;
	}

	function formatMs(ms: number): string {
		return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
	}

	function relativeTime(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		return `${Math.floor(hrs / 24)}d ago`;
	}
</script>

<div class="analytics-page">
	<div class="ana-header">
		<div class="ana-header-left">
			<div class="ana-header-icon">
				<Icon name="bar-chart-3" />
			</div>
			<div>
				<h1 class="ana-title">User Analytics</h1>
				<p class="ana-subtitle">ACE context engine feedback — query patterns, cache performance, inference routing</p>
			</div>
		</div>
		<div class="ana-user-badge">User: {data.userId}</div>
	</div>

	<!-- Tabs -->
	<div class="ana-tabs">
		{#each [
			{ id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
			{ id: 'patterns', label: 'Query Patterns', icon: 'activity' },
			{ id: 'cache', label: 'Cache Performance', icon: 'database' },
			{ id: 'search-intel', label: 'Search Intelligence', icon: 'search' },
			{ id: 'deep-research', label: 'Deep Research', icon: 'brain' },
			{ id: 'matrix', label: 'MapReduce Matrix', icon: 'grid-3x3' },
			{ id: 'playground', label: 'Research Playground', icon: 'flask-conical' },
			{ id: 'for-you', label: 'For You', icon: 'sparkles' }
		] as tab}
			<button
				class="ana-tab"
				class:active={activeTab === tab.id}
				onclick={() => { activeTab = tab.id as typeof activeTab; if (tab.id === 'for-you') loadForYou(); if (tab.id === 'search-intel') loadSearchIntel(); if (tab.id === 'deep-research') loadDeepResearch(); if (tab.id === 'matrix') loadMatrix(); if (tab.id === 'playground') loadPlayground(); }}
			>
				<Icon name={tab.icon} />
				{tab.label}
			</button>
		{/each}
	</div>

	{#if activeTab === 'overview'}
		<!-- Summary Cards -->
		<div class="ana-stats-grid">
			<div class="ana-stat-card">
				<div class="ana-stat-header">
					<Icon name="activity" class="ana-stat-icon" />
					<span class="ana-stat-label">Total Queries</span>
				</div>
				<div class="ana-stat-value">{summary.totalQueries}</div>
				<div class="ana-stat-sub">Last 7 days</div>
			</div>

			<div class="ana-stat-card">
				<div class="ana-stat-header">
					<Icon name="timer" class="ana-stat-icon" />
					<span class="ana-stat-label">Avg Latency</span>
				</div>
				<div class="ana-stat-value">{formatMs(summary.avgLatencyMs)}</div>
				<div class="ana-stat-sub">Per query</div>
			</div>

			<div class="ana-stat-card">
				<div class="ana-stat-header">
					<Icon name="database" class="ana-stat-icon" />
					<span class="ana-stat-label">Cache Hit Rate</span>
				</div>
				<div class="ana-stat-value">{formatRate(summary.cacheHitRate)}</div>
				<div class="ana-stat-sub">LokiJS + IndexedDB + Redis</div>
			</div>

			<div class="ana-stat-card">
				<div class="ana-stat-header">
					<Icon name="bar-chart-3" class="ana-stat-icon" />
					<span class="ana-stat-label">Patterns</span>
				</div>
				<div class="ana-stat-value">{patterns.length}</div>
				<div class="ana-stat-sub">Unique query clusters</div>
			</div>
		</div>

		<!-- Top Intents + Tools -->
		<div class="ana-two-col">
			<div class="ana-card">
				<h3 class="ana-card-title">Top Intents</h3>
				{#if summary.topIntents.length > 0}
					<ul class="ana-list">
						{#each summary.topIntents as intent}
							<li>
								<span class="ana-dot accent"></span>
								{intent}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="ana-empty">No intents captured yet</p>
				{/if}
			</div>

			<div class="ana-card">
				<h3 class="ana-card-title">Most Used Tools</h3>
				{#if summary.mostUsedTools.length > 0}
					<ul class="ana-list">
						{#each summary.mostUsedTools as tool}
							<li>
								<span class="ana-dot info"></span>
								{tool}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="ana-empty">No tool usage recorded yet</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if activeTab === 'patterns'}
		<div class="ana-card">
			<div class="ana-card-head">
				<h3 class="ana-card-title">Top Query Patterns (30 days)</h3>
				<p class="ana-card-desc">Repeated queries feed ACE context pre-warming</p>
			</div>
			{#if patterns.length > 0}
				<div class="ana-pattern-list">
					{#each patterns as pattern, i}
						<div class="ana-pattern-row">
							<div class="ana-pattern-left">
								<span class="ana-pattern-rank">{i + 1}</span>
								<code class="ana-pattern-hash">{pattern.query_hash}</code>
							</div>
							<div class="ana-pattern-right">
								<span>{pattern.count}x</span>
								<span>{relativeTime(pattern.last_seen)}</span>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="ana-empty-center">
					No query patterns recorded yet. Use chat or search to generate analytics.
				</div>
			{/if}
		</div>
	{/if}

	{#if activeTab === 'cache'}
		<div class="ana-two-col">
			<div class="ana-card">
				<h3 class="ana-card-title">Cache Layers</h3>
				<div class="ana-cache-layers">
					{#each [
						{ name: 'L0: LokiJS', ttl: '5-10min', scope: 'Session' },
						{ name: 'L1: IndexedDB', ttl: '7 days', scope: 'Persistent' },
						{ name: 'L2: Memory', ttl: '5min', scope: 'Server process' },
						{ name: 'L3: Redis', ttl: 'Configurable', scope: 'Cross-request' }
					] as layer}
						<div class="ana-cache-row">
							<span class="ana-cache-name">{layer.name}</span>
							<div class="ana-cache-meta">
								<span>{layer.ttl}</span>
								<span>{layer.scope}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="ana-card">
				<h3 class="ana-card-title">Hit Rate Breakdown</h3>
				<div class="ana-hit-rate">
					<div class="ana-bar-track">
						<div
							class="ana-bar-fill"
							style="width: {summary.cacheHitRate * 100}%"
						></div>
					</div>
					<span class="ana-bar-label">{formatRate(summary.cacheHitRate)}</span>
				</div>
				<p class="ana-card-desc">Combined hit rate across all cache layers</p>
			</div>
		</div>

		{#if summary.slowEndpoints.length > 0}
			<div class="ana-card ana-card-danger">
				<h3 class="ana-card-title">Slow Endpoints</h3>
				<div class="ana-slow-list">
					{#each summary.slowEndpoints as endpoint}
						<div class="ana-slow-item">{endpoint}</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}

	{#if activeTab === 'search-intel'}
		{#if searchIntelLoading}
			<div class="ana-empty-center">Loading search intelligence...</div>
		{:else if searchIntel}
			<!-- Hot Queries + Trending -->
			<div class="ana-two-col">
				<div class="ana-card">
					<h3 class="ana-card-title">Hot Queries</h3>
					<p class="ana-card-desc">Most frequent queries across all pipelines</p>
					{#if searchIntel.hotQueries?.length}
						<div class="ana-pattern-list">
							{#each searchIntel.hotQueries.slice(0, 8) as hq, i}
								<div class="ana-pattern-row">
									<div class="ana-pattern-left">
										<span class="ana-pattern-rank">{i + 1}</span>
										<span class="ana-si-query">{hq.query}</span>
									</div>
									<div class="ana-pattern-right">
										<span>{hq.hits}x</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="ana-empty">No hot queries recorded yet</p>
					{/if}
				</div>

				<div class="ana-card">
					<h3 class="ana-card-title">Trending</h3>
					<p class="ana-card-desc">Queries with rising frequency</p>
					{#if searchIntel.trending?.length}
						<div class="ana-pattern-list">
							{#each searchIntel.trending.slice(0, 8) as t, i}
								<div class="ana-pattern-row">
									<div class="ana-pattern-left">
										<span class="ana-pattern-rank">{i + 1}</span>
										<span class="ana-si-query">{t.query ?? t.query_hash.slice(0, 12)}</span>
									</div>
									<div class="ana-pattern-right">
										<span class="ana-si-growth">+{(t.growth_rate * 100).toFixed(0)}%</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="ana-empty">No trending data yet</p>
					{/if}
				</div>
			</div>

			<!-- Pipeline Memory + Cluster Heat -->
			<div class="ana-two-col">
				<div class="ana-card">
					<h3 class="ana-card-title">Pipeline Memory</h3>
					<p class="ana-card-desc">RAG/KAG/DAG/ACE retrieval breakdown</p>
					{#if searchIntel.pipelineMemory?.length}
						<div class="ana-cache-layers">
							{#each searchIntel.pipelineMemory as pm}
								<div class="ana-cache-row">
									<span class="ana-cache-name">{pm.pipeline}</span>
									<div class="ana-cache-meta">
										<span>{pm.total_hits} hits</span>
										<span>avg {pm.avg_rerank != null ? (pm.avg_rerank * 100).toFixed(0) + '%' : '—'}</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="ana-empty">No pipeline data yet</p>
					{/if}
				</div>

				<div class="ana-card">
					<h3 class="ana-card-title">Cluster Heat Map</h3>
					<p class="ana-card-desc">Vector cluster activity density</p>
					{#if searchIntel.clusterHeat?.length}
						<div class="ana-pattern-list">
							{#each searchIntel.clusterHeat.slice(0, 6) as cluster}
								<div class="ana-pattern-row">
									<div class="ana-pattern-left">
										<code class="ana-pattern-hash">#{cluster.gpu_cluster}</code>
									</div>
									<div class="ana-pattern-right">
										<span>{cluster.total_hits} hits</span>
										<span>avg {cluster.avg_rerank != null ? (cluster.avg_rerank * 100).toFixed(0) + '%' : '—'}</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="ana-empty">No cluster data yet</p>
					{/if}
				</div>
			</div>

			<!-- Cross-Pipeline Champions + Chunk Quality -->
			<div class="ana-two-col">
				<div class="ana-card">
					<h3 class="ana-card-title">Cross-Pipeline Champions</h3>
					<p class="ana-card-desc">Chunks surfaced by multiple retrieval pipelines</p>
					{#if searchIntel.crossPipelineChamps?.length}
						<div class="ana-pattern-list">
							{#each searchIntel.crossPipelineChamps.slice(0, 5) as champ}
								<div class="ana-pattern-row">
									<div class="ana-pattern-left">
										<code class="ana-pattern-hash">{champ.chunk_id.slice(0, 12)}</code>
										<div class="ana-si-tags">
											{#each champ.pipelines.split(', ') as p}
												<span class="ana-rec-tag">{p}</span>
											{/each}
										</div>
									</div>
									<div class="ana-pattern-right">
										<span class="ana-rec-score">{champ.quality_score.toFixed(2)}</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="ana-empty">No cross-pipeline data yet</p>
					{/if}
				</div>

				<div class="ana-card">
					<h3 class="ana-card-title">Chunk Quality</h3>
					<p class="ana-card-desc">Retrieval quality signals across the corpus</p>
					{#if searchIntel.chunkQuality?.length}
						<div class="ana-cache-layers">
							<div class="ana-cache-row">
								<span class="ana-cache-name">Tracked chunks</span>
								<span class="ana-stat-value" style="font-size:1rem">{searchIntel.chunkQuality.length}</span>
							</div>
							<div class="ana-cache-row">
								<span class="ana-cache-name">Avg rerank</span>
								<span class="ana-stat-value" style="font-size:1rem">
									{(searchIntel.chunkQuality.reduce((s, c) => s + (c.avg_rerank ?? 0), 0) / searchIntel.chunkQuality.length * 100).toFixed(0)}%
								</span>
							</div>
						</div>
					{:else}
						<p class="ana-empty">No chunk quality data</p>
					{/if}
				</div>
			</div>

			<!-- Did You Mean -->
			{#if searchIntel.didYouMean?.length}
				<div class="ana-card">
					<h3 class="ana-card-title">Did You Mean?</h3>
					<p class="ana-card-desc">Semantically similar query variants detected in the corpus</p>
					<div class="ana-pattern-list">
						{#each searchIntel.didYouMean.slice(0, 5) as dym}
							<div class="ana-pattern-row">
								<div class="ana-pattern-left">
									<span class="ana-si-query">{dym.suggestion}</span>
									<span class="ana-rec-tag">{dym.source}</span>
								</div>
								<div class="ana-pattern-right">
									<span>{(dym.similarity * 100).toFixed(0)}% match</span>
									<span>{dym.hitCount} hits</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{:else}
			<div class="ana-empty-center">
				Failed to load search intelligence data.
			</div>
		{/if}
	{/if}

	{#if activeTab === 'deep-research'}
		<div class="ana-card">
			<div class="ana-card-head" style="display:flex;align-items:center;justify-content:space-between">
				<div>
					<h3 class="ana-card-title">Deep Research Topics</h3>
					<p class="ana-card-desc">Self-prompting research topics generated from RAG/KAG/DAG/ACE hits, feedback signals, and graph analysis via Ollama</p>
				</div>
				<button class="dr-refresh-btn" onclick={() => loadDeepResearch(true)} disabled={deepResearchLoading}>
					<Icon name="refresh-cw" />
					{deepResearchLoading ? 'Generating…' : 'Regenerate'}
				</button>
			</div>

			{#if deepResearchLoading}
				<div class="ana-empty-center">Generating research topics via Ollama deep analysis…</div>
			{:else if deepResearchError}
				<div class="ana-empty-center">{deepResearchError}</div>
			{:else if deepResearch?.topics?.length}
				<div class="dr-topics-grid">
					{#each deepResearch.topics as topic}
						<div class="dr-topic-card" class:dr-priority-high={topic.priority === 'high'}>
							<div class="dr-topic-header">
								<span class="dr-priority-badge" style="color: {priorityColor(topic.priority)}">{topic.priority}</span>
								<span class="dr-pipeline-badge">{topic.pipelineHint.toUpperCase()}</span>
							</div>
							<h4 class="dr-topic-title">{topic.title}</h4>
							<p class="dr-topic-desc">{topic.description}</p>
							<p class="dr-topic-reasoning">{topic.reasoning}</p>
							<div class="dr-topic-tags">
								{#each topic.tags as tag}
									<span class="ana-rec-tag">{tag}</span>
								{/each}
							</div>
							<div class="dr-topic-sources">
								Sources: {topic.sources.join(', ')}
							</div>
							<div class="dr-topic-prompt">
								<code class="dr-self-prompt">{topic.selfPrompt}</code>
								<button
									class="dr-execute-btn"
									disabled={executingPromptId !== null}
									onclick={() => executeSelfPrompt(topic)}
								>
									{executingPromptId === topic.id ? 'Running…' : 'Execute'}
								</button>
							</div>
						</div>
					{/each}
				</div>

				{#if promptResult}
					<div class="ana-card" style="margin-top: 0.75rem; border-color: rgba(96, 165, 250, 0.2)">
						<div class="ana-card-head">
							<h3 class="ana-card-title">Deep Research Result</h3>
							<p class="ana-card-desc">Pipeline: {promptResult.pipeline} — {promptResult.durationMs}ms</p>
						</div>
						<div class="dr-result-text">{promptResult.answer}</div>
					</div>
				{/if}
			{:else}
				<div class="ana-empty-center">
					No research topics generated yet. Click "Regenerate" to analyze your feedback signals and generate recommendations.
				</div>
			{/if}
		</div>

		<!-- Feedback Signals + Pipeline Summary side-by-side -->
		{#if deepResearch && !deepResearchLoading}
			<div class="ana-two-col">
				<div class="ana-card">
					<h3 class="ana-card-title">Feedback Index</h3>
					<p class="ana-card-desc">Thumbs up/down signals driving research priority</p>
					{#if deepResearch.feedbackSignals?.length}
						<div class="ana-pattern-list">
							{#each deepResearch.feedbackSignals.slice(0, 8) as sig}
								<div class="ana-pattern-row">
									<div class="ana-pattern-left">
										<span class="ana-si-query">{sig.query}</span>
										<span class="ana-rec-tag">{sig.pipeline}</span>
									</div>
									<div class="ana-pattern-right">
										<span class="dr-thumb-up">+{sig.thumbsUp}</span>
										<span class="dr-thumb-down">-{sig.thumbsDown}</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="ana-empty">No feedback signals yet — vote on search results to build the index</p>
					{/if}
				</div>

				<div class="ana-card">
					<h3 class="ana-card-title">Pipeline Hit Summary</h3>
					<p class="ana-card-desc">RAG/KAG/DAG/ACE retrieval distribution (7 days)</p>
					{#if deepResearch.pipelineSummary?.length}
						<div class="ana-cache-layers">
							{#each deepResearch.pipelineSummary as pm}
								<div class="ana-cache-row">
									<span class="ana-cache-name">{pm.pipeline.toUpperCase()}</span>
									<div class="ana-cache-meta">
										<span>{pm.totalHits} hits</span>
										<span>{pm.uniqueChunks} chunks</span>
										<span>{pm.avgRerank != null ? (pm.avgRerank * 100).toFixed(0) + '%' : '—'}</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="ana-empty">No pipeline data yet</p>
					{/if}
				</div>
			</div>

			<!-- Graph Insights + Hot Tags + Top Prompts -->
			<div class="ana-two-col">
				<div class="ana-card">
					<h3 class="ana-card-title">Graph Insights</h3>
					<p class="ana-card-desc">Connected cases from knowledge graph analysis</p>
					{#if deepResearch.graphInsights?.length}
						<div class="ana-pattern-list">
							{#each deepResearch.graphInsights.slice(0, 5) as gi}
								<div class="ana-pattern-row">
									<div class="ana-pattern-left">
										<span class="ana-si-query">{gi.title || gi.caseId.slice(0, 12)}</span>
										<div class="ana-si-tags">
											{#each gi.sharedTypes.slice(0, 3) as st}
												<span class="ana-rec-tag">{st}</span>
											{/each}
										</div>
									</div>
									<div class="ana-pattern-right">
										<span class="ana-rec-score">{gi.centrality.toFixed(2)}</span>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="ana-empty">No graph connections found</p>
					{/if}
				</div>

				<div class="ana-card">
					<h3 class="ana-card-title">Research Context</h3>
					<p class="ana-card-desc">Hot query tags and top-clicked prompts feeding the research engine</p>
					{#if deepResearch.hotQueryTags?.length || deepResearch.topPrompts?.length}
						<div class="ana-cache-layers">
							{#if deepResearch.hotQueryTags?.length}
								<div class="ana-cache-row">
									<span class="ana-cache-name">Hot Tags</span>
									<div class="ana-si-tags" style="justify-content:flex-end">
										{#each deepResearch.hotQueryTags.slice(0, 4) as tag}
											<span class="ana-rec-tag">{tag.slice(0, 30)}</span>
										{/each}
									</div>
								</div>
							{/if}
							{#each deepResearch.topPrompts?.slice(0, 4) ?? [] as prompt, i}
								<div class="ana-cache-row">
									<span class="ana-cache-name">Prompt #{i + 1}</span>
									<span class="ana-si-query" style="text-align:right;max-width:16rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{prompt}</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="ana-empty">No research context yet</p>
					{/if}
				</div>
			</div>

			{#if deepResearch.generatedAt}
				<div class="dr-meta">
					Generated {relativeTime(deepResearch.generatedAt)} via {deepResearch.modelUsed ?? 'unknown'}
					{#if deepResearch.cachedUntil}
						 — cached until {new Date(deepResearch.cachedUntil).toLocaleTimeString()}
					{/if}
				</div>
			{/if}
		{/if}
	{/if}

	{#if activeTab === 'matrix'}
		<div class="ana-card">
			<div class="ana-card-head">
				<h3 class="ana-card-title">MapReduce Matrix Analysis</h3>
				<p class="ana-card-desc">8-dimensional similarity matrix across RAG/KAG/DAG/ACE pipelines with cosine-scored chunk ranking</p>
				<button class="ana-refresh-btn" onclick={() => loadMatrix(true)} disabled={matrixLoading}>
					<Icon name="refresh-cw" /> Refresh
				</button>
			</div>

			{#if matrixLoading}
				<div class="ana-loading">Executing MapReduce pipeline…</div>
			{:else if matrixError}
				<div class="ana-error">{matrixError}</div>
			{:else if matrixData}
				<!-- Pipeline Coverage -->
				<div class="matrix-section">
					<h4>Pipeline Coverage</h4>
					<div class="matrix-coverage">
						{#each Object.entries(matrixData.pipelineCoverage) as [pipeline, count]}
							<div class="matrix-coverage-item">
								<span class="matrix-pipe-label">{pipeline.toUpperCase()}</span>
								<span class="matrix-pipe-count">{count}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- Top Ranked Chunks -->
				<div class="matrix-section">
					<h4>Top Ranked Chunks</h4>
					<div class="matrix-table-wrap">
						<table class="matrix-table">
							<thead>
								<tr>
									<th>File</th>
									<th>Pipeline</th>
									<th>Composite</th>
									<th>RAG</th>
									<th>KAG</th>
									<th>DAG</th>
									<th>ACE</th>
								</tr>
							</thead>
							<tbody>
								{#each matrixData.topChunks.slice(0, 15) as chunk}
									{@const row = matrixData.matrix.find(r => r.chunkId === chunk.chunkId)}
									<tr>
										<td class="matrix-filepath">{chunk.filePath?.split('/').slice(-2).join('/') ?? chunk.chunkId.slice(0, 12)}</td>
										<td><span class="matrix-pipe-badge">{chunk.pipeline}</span></td>
										<td class="matrix-score">{chunk.composite.toFixed(3)}</td>
										<td class="matrix-score">{row?.scores[0]?.toFixed(2) ?? '–'}</td>
										<td class="matrix-score">{row?.scores[1]?.toFixed(2) ?? '–'}</td>
										<td class="matrix-score">{row?.scores[2]?.toFixed(2) ?? '–'}</td>
										<td class="matrix-score">{row?.scores[3]?.toFixed(2) ?? '–'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>

				<!-- Glyph Topology Context -->
				{#if matrixData.glyphContext.totalGlyphs > 0}
					<div class="matrix-section">
						<h4>Glyph Topology ({matrixData.glyphContext.totalGlyphs} glyphs)</h4>
						<div class="matrix-coverage">
							{#each matrixData.glyphContext.topSections as sec}
								<div class="matrix-coverage-item">
									<span class="matrix-pipe-label">{sec.section}</span>
									<span class="matrix-pipe-count">{sec.count}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Synthesis Topics -->
				{#if matrixData.synthesis?.topics?.length}
					<div class="matrix-section">
						<h4>Self-Prompting Research Topics</h4>
						{#each matrixData.synthesis.topics as topic, i}
							<div class="dr-topic-card">
								<div class="dr-topic-num">{i + 1}</div>
								<div class="dr-topic-body">
									<div class="dr-topic-title">{topic.title}</div>
									<div class="dr-topic-rationale">{topic.rationale}</div>
									<div class="dr-topic-tags">
										<span class="dr-tag">{topic.pipeline}</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<div class="dr-meta">
					{matrixData.meta.rowCount} chunks in {matrixData.meta.computeMs}ms — {matrixData.meta.days}-day window
				</div>
			{/if}
		</div>
	{/if}

	{#if activeTab === 'playground'}
		<div class="ana-card">
			<div class="ana-card-head">
				<h3 class="ana-card-title">Research Playground</h3>
				<p class="ana-card-desc">Unified query: research-cache · mapreduce-matrix · codebase rg/awk · web Firecrawl · deep-research · LangGraph supervisor</p>
			</div>

			<div class="pg-form">
				<div class="pg-query-row">
					<input class="pg-input" type="text" placeholder="Query or paste a URL for Firecrawl…" bind:value={playgroundQuery} />
					<button class="pg-run-btn" onclick={runPlayground} disabled={playgroundLoading}>
						{#if playgroundLoading}Running…{:else}Run Query{/if}
					</button>
				</div>
				<div class="pg-options-row">
					<label class="pg-option-group">
						<span>Pipeline</span>
						<select bind:value={playgroundPipeline}>
							{#each ['all','ace','rag','kag','dag','codebase'] as p}
								<option value={p}>{p.toUpperCase()}</option>
							{/each}
						</select>
					</label>
					<label class="pg-option-group">
						<span>Depth {playgroundDepth}</span>
						<input type="range" min="1" max="5" bind:value={playgroundDepth} />
					</label>
					<label class="pg-option-group">
						<span>Days {playgroundDays}</span>
						<input type="range" min="1" max="30" bind:value={playgroundDays} />
					</label>
					<label class="pg-toggle"><input type="checkbox" bind:checked={playgroundIncludeMx} /> Matrix</label>
					<label class="pg-toggle"><input type="checkbox" bind:checked={playgroundIncludeCb} /> Codebase rg</label>
					<label class="pg-toggle"><input type="checkbox" bind:checked={playgroundIncludeWeb} /> Web (Firecrawl)</label>
				</div>
			</div>

			{#if playgroundError}
				<div class="ana-error">{playgroundError}</div>
			{/if}

			{#if playgroundAggOnly?.pipelineStats?.length}
				<div class="pg-section">
					<h4 class="pg-section-title">AWK Pipeline Aggregations</h4>
					<div class="pg-agg-table-wrap">
						<table class="pg-agg-table">
							<thead><tr>
								<th>Pipeline</th><th>Hits</th><th>Avg Score</th><th>P50</th>
								<th class="pg-high">High</th><th class="pg-med">Med</th><th class="pg-low">Low</th>
							</tr></thead>
							<tbody>
								{#each playgroundAggOnly.pipelineStats as agg}
								<tr>
									<td><span class="matrix-pipe-badge">{agg.pipeline}</span></td>
									<td class="pg-num">{agg.hitCount.toLocaleString()}</td>
									<td class="pg-num">{agg.avgScore.toFixed(3)}</td>
									<td class="pg-num">{agg.p50Score.toFixed(3)}</td>
									<td class="pg-num pg-high">{agg.highQuality}</td>
									<td class="pg-num pg-med">{agg.mediumQuality}</td>
									<td class="pg-num pg-low">{agg.lowQuality}</td>
								</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if playgroundAggOnly.scoreBuckets?.length}
						<div class="pg-histogram">
							<div class="pg-hist-title">Score Histogram (0.1 buckets)</div>
							<div class="pg-hist-bars">
								{#each playgroundAggOnly.scoreBuckets as bucket, _i}
									{@const maxCount = Math.max(...playgroundAggOnly.scoreBuckets.map(b => b.count), 1)}
									<div class="pg-hist-bar" title="{bucket.pipeline} {bucket.bucketStart.toFixed(1)}: {bucket.count}">
										<div class="pg-hist-fill" style="height:{Math.round((bucket.count/maxCount)*64)}px"></div>
										<span class="pg-hist-label">{bucket.bucketStart.toFixed(1)}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			{#if playgroundResult}
				{#if playgroundResult.unifiedTopics?.length}
					<div class="pg-section">
						<h4 class="pg-section-title">Unified Research Topics ({playgroundResult.unifiedTopics.length})</h4>
						{#each playgroundResult.unifiedTopics as topic, i}
							<div class="pg-topic-card" style="border-left-color:{priorityColor(topic.priority)}">
								<div class="pg-topic-num">{i+1}</div>
								<div class="pg-topic-body">
									<div class="pg-topic-title">{topic.title}</div>
									<div class="pg-topic-prompt">{topic.selfPrompt}</div>
									<div class="pg-topic-meta">
										<span class="matrix-pipe-badge">{topic.pipeline}</span>
										<span class="pg-score">{(topic.score*100).toFixed(0)}%</span>
										{#each topic.sources as src}<span class="pg-source-badge">{src}</span>{/each}
										{#each topic.mcpHints as hint}<span class="pg-mcp-hint" title={hint}>{hint.split(':')[1]}</span>{/each}
									</div>
								</div>
								<button class="pg-exec-btn" onclick={() => runSelfPrompt(topic.selfPrompt)} disabled={!!executingPromptId} title="Use as next query">
									{executingPromptId === topic.selfPrompt ? '…' : '→'}
								</button>
							</div>
						{/each}
					</div>
				{/if}

				{#if playgroundResult.selfPromptChain?.length}
					<div class="pg-section">
						<h4 class="pg-section-title">Self-Prompt Chain (depth {playgroundDepth})</h4>
						<div class="pg-chain">
							{#each playgroundResult.selfPromptChain as prompt, i}
								<div class="pg-chain-step">
									<div class="pg-chain-num">{i+1}</div>
									<div class="pg-chain-text">{prompt}</div>
									<button class="pg-exec-btn" onclick={() => runSelfPrompt(prompt)} disabled={!!executingPromptId}>→</button>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if playgroundResult.fetchedPage}
					<div class="pg-section">
						<h4 class="pg-section-title">Fetched Page — {playgroundResult.fetchedPage.source}</h4>
						<div class="pg-fetched-meta">
							<a href={playgroundResult.fetchedPage.url} target="_blank" rel="noreferrer">{playgroundResult.fetchedPage.title}</a>
						</div>
						<pre class="pg-fetched-text">{playgroundResult.fetchedPage.markdown.slice(0, 1200)}{playgroundResult.fetchedPage.markdown.length > 1200 ? '…' : ''}</pre>
					</div>
				{/if}

				{#if playgroundResult.langGraphState?.messages?.length}
					<div class="pg-section">
						<h4 class="pg-section-title">LangGraph Supervisor State</h4>
						<div class="pg-lg-meta">
							next: <code>{playgroundResult.langGraphState.next}</code>
							· step {playgroundResult.langGraphState.step}/5
							· sources: {playgroundResult.meta.sources.join(', ')}
						</div>
						<div class="pg-lg-messages">
							{#each playgroundResult.langGraphState.messages as msg}
								<div class="pg-lg-msg pg-lg-{msg.role}">
									<span class="pg-lg-role">{msg.name ?? msg.role}</span>
									<span class="pg-lg-content">{typeof msg.content === 'string' ? msg.content.slice(0, 180) : JSON.stringify(msg.content).slice(0, 180)}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<div class="dr-meta">{playgroundResult.meta.computeMs}ms · {playgroundResult.meta.sources.length} sources · cached {new Date(playgroundResult.meta.cachedUntil).toLocaleTimeString()}</div>
			{/if}
		</div>
	{/if}

	{#if activeTab === 'for-you'}
		<div class="ana-card">
			<div class="ana-card-head">
				<h3 class="ana-card-title">Recommended Cases</h3>
				<p class="ana-card-desc">Cases connected to your activity via shared entities in the knowledge graph</p>
			</div>
			{#if forYouLoading}
				<div class="ana-empty-center">Loading recommendations...</div>
			{:else if personalizedCases.length > 0}
				<div class="ana-pattern-list">
					{#each personalizedCases as rec, i}
						<div class="ana-pattern-row">
							<div class="ana-pattern-left">
								<span class="ana-pattern-rank">{i + 1}</span>
								<div class="ana-rec-info">
									<a href="/cases/{rec.caseId}" class="ana-rec-title">{rec.title || rec.caseId.slice(0, 8)}</a>
									<span class="ana-rec-reason">{rec.reason}</span>
								</div>
							</div>
							<div class="ana-pattern-right">
								<span class="ana-rec-score">{rec.score.toFixed(1)}</span>
								{#each rec.interactionTypes.slice(0, 2) as type}
									<span class="ana-rec-tag">{type}</span>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="ana-empty-center">
					No recommendations yet. View, search, or analyze more cases to build your interaction graph.
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* ── Page layout ── */
	.analytics-page {
		min-height: 100vh;
		background: #0e0d0b;
		margin: -2.5rem;
		padding: 1.5rem max(1.5rem, calc(50% - 36rem));
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.analytics-page :global(h1), .analytics-page :global(h2), .analytics-page :global(h3), .analytics-page :global(h4), .analytics-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.analytics-page :global(a) { color: inherit; border-bottom: none; }
	.analytics-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.analytics-page :global(input), .analytics-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.analytics-page :global(.panel), .analytics-page :global(.card), .analytics-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* ── Header ── */
	.ana-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.ana-header-left {
		display: flex;
		align-items: center;
		gap: 0.875rem;
	}
	.ana-header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.625rem;
		background: linear-gradient(135deg, rgba(96, 165, 250, 0.15), rgba(52, 211, 153, 0.15));
		border: 1px solid rgba(96, 165, 250, 0.25);
		color: rgba(96, 165, 250, 0.9);
		flex-shrink: 0;
	}
	.ana-title {
		font-size: 1.375rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
		letter-spacing: -0.01em;
	}
	.ana-subtitle { font-size: 0.75rem; color: rgba(212, 199, 163, 0.4); margin-top: 0.125rem; }
	.ana-user-badge {
		font-size: 0.68rem;
		color: rgba(212, 199, 163, 0.3);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}

	/* ── Tabs ── */
	.ana-tabs {
		display: flex;
		gap: 0.25rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		padding-bottom: 0;
	}
	.ana-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.45);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition: all 0.15s;
		margin-bottom: -1px;
	}
	.ana-tab:hover { color: rgba(212, 199, 163, 0.7); }
	.ana-tab.active {
		color: rgba(96, 165, 250, 0.95);
		border-bottom-color: rgba(96, 165, 250, 0.8);
	}

	/* ── Stats grid ── */
	.ana-stats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
	}
	@media (max-width: 768px) { .ana-stats-grid { grid-template-columns: repeat(2, 1fr); } }
	.ana-stat-card {
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
		padding: 1rem;
	}
	.ana-stat-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.5rem;
	}
	:global(.ana-stat-icon) { width: 0.9rem; height: 0.9rem; color: rgba(96, 165, 250, 0.7); }
	.ana-stat-label {
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: rgba(212, 199, 163, 0.4);
		font-weight: 600;
	}
	.ana-stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		font-variant-numeric: tabular-nums;
	}
	.ana-stat-sub { font-size: 0.68rem; color: rgba(212, 199, 163, 0.3); margin-top: 0.25rem; }

	/* ── Two column layout ── */
	.ana-two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	@media (max-width: 768px) { .ana-two-col { grid-template-columns: 1fr; } }

	/* ── Card ── */
	.ana-card {
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
		padding: 1rem;
	}
	.ana-card-danger { border-color: rgba(248, 113, 113, 0.2); }
	.ana-card-head { padding-bottom: 0.75rem; border-bottom: 1px solid rgba(212, 199, 163, 0.06); margin-bottom: 0.5rem; }
	.ana-card-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.85);
		margin: 0 0 0.25rem;
	}
	.ana-card-desc { font-size: 0.7rem; color: rgba(212, 199, 163, 0.35); margin: 0.375rem 0 0; }

	/* ── List ── */
	.ana-list {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.ana-list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.65);
	}
	.ana-dot {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.ana-dot.accent { background: rgba(96, 165, 250, 0.7); }
	.ana-dot.info { background: rgba(56, 189, 248, 0.7); }
	.ana-empty { font-size: 0.8rem; color: rgba(212, 199, 163, 0.3); font-style: italic; margin: 0; }
	.ana-empty-center { padding: 2rem; text-align: center; font-size: 0.8rem; color: rgba(212, 199, 163, 0.3); font-style: italic; }

	/* ── Pattern list ── */
	.ana-pattern-list {
		display: flex;
		flex-direction: column;
	}
	.ana-pattern-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 0;
		border-bottom: 1px solid rgba(212, 199, 163, 0.04);
	}
	.ana-pattern-row:last-child { border-bottom: none; }
	.ana-pattern-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.ana-pattern-rank {
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: rgba(212, 199, 163, 0.25);
		width: 1.25rem;
	}
	.ana-pattern-hash {
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: rgba(212, 199, 163, 0.55);
	}
	.ana-pattern-right {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.4);
	}

	/* ── Cache layers ── */
	.ana-cache-layers { display: flex; flex-direction: column; gap: 0.6rem; margin-top: 0.5rem; }
	.ana-cache-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.ana-cache-name { font-size: 0.8rem; color: rgba(212, 199, 163, 0.75); }
	.ana-cache-meta {
		display: flex;
		gap: 0.75rem;
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.35);
	}

	/* ── Hit rate bar ── */
	.ana-hit-rate {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin: 0.5rem 0;
	}
	.ana-bar-track {
		flex: 1;
		height: 1rem;
		background: rgba(212, 199, 163, 0.06);
		border-radius: 9999px;
		overflow: hidden;
	}
	.ana-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, rgba(96, 165, 250, 0.6), rgba(52, 211, 153, 0.6));
		border-radius: 9999px;
		transition: width 0.3s;
	}
	.ana-bar-label {
		font-size: 0.85rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.9);
		font-variant-numeric: tabular-nums;
	}

	/* ── Slow endpoints ── */
	.ana-slow-list { display: flex; flex-direction: column; gap: 0.375rem; margin-top: 0.5rem; }
	.ana-slow-item {
		font-size: 0.8rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: #f87171;
	}

	/* ── For You recommendations ── */
	.ana-rec-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
	.ana-rec-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(96, 165, 250, 0.85);
		text-decoration: none;
	}
	.ana-rec-title:hover { color: rgba(96, 165, 250, 1); text-decoration: underline; }
	.ana-rec-reason {
		font-size: 0.68rem;
		color: rgba(212, 199, 163, 0.35);
		max-width: 28rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ana-rec-score {
		font-size: 0.75rem;
		font-weight: 700;
		color: rgba(52, 211, 153, 0.8);
		font-variant-numeric: tabular-nums;
	}
	.ana-rec-tag {
		font-size: 0.6rem;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: rgba(212, 199, 163, 0.06);
		border: 1px solid rgba(212, 199, 163, 0.1);
		color: rgba(212, 199, 163, 0.45);
	}

	/* ── Search Intelligence ── */
	.ana-si-query {
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.65);
	}
	.ana-si-strike { text-decoration: line-through; color: rgba(212, 199, 163, 0.3); }
	.ana-si-arrow { font-size: 0.75rem; color: rgba(96, 165, 250, 0.6); margin: 0 0.25rem; }
	.ana-si-growth {
		font-size: 0.75rem;
		font-weight: 700;
		color: rgba(52, 211, 153, 0.8);
		font-variant-numeric: tabular-nums;
	}
	.ana-si-tags {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	/* ── Deep Research ── */
	.dr-refresh-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem !important;
		font-size: 0.7rem;
		font-weight: 600;
		color: rgba(96, 165, 250, 0.85);
		background: rgba(96, 165, 250, 0.08) !important;
		border: 1px solid rgba(96, 165, 250, 0.2) !important;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}
	.dr-refresh-btn:hover { background: rgba(96, 165, 250, 0.15) !important; }
	.dr-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	.dr-topics-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-top: 0.75rem;
	}
	@media (max-width: 768px) { .dr-topics-grid { grid-template-columns: 1fr; } }

	.dr-topic-card {
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(212, 199, 163, 0.06);
		border-radius: 0.5rem;
		padding: 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		transition: border-color 0.15s;
	}
	.dr-topic-card:hover { border-color: rgba(212, 199, 163, 0.15); }
	.dr-topic-card.dr-priority-high { border-left: 2px solid rgba(248, 113, 113, 0.4); }

	.dr-topic-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.dr-priority-badge {
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.dr-pipeline-badge {
		font-size: 0.55rem;
		font-weight: 600;
		padding: 0.1rem 0.35rem;
		border-radius: 0.2rem;
		background: rgba(96, 165, 250, 0.1);
		color: rgba(96, 165, 250, 0.7);
		letter-spacing: 0.04em;
	}

	.dr-topic-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
		margin: 0;
		line-height: 1.3;
	}
	.dr-topic-desc {
		font-size: 0.72rem;
		color: rgba(212, 199, 163, 0.55);
		line-height: 1.5;
		margin: 0;
	}
	.dr-topic-reasoning {
		font-size: 0.66rem;
		color: rgba(212, 199, 163, 0.3);
		font-style: italic;
		margin: 0;
	}
	.dr-topic-tags {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}
	.dr-topic-sources {
		font-size: 0.6rem;
		color: rgba(212, 199, 163, 0.25);
	}
	.dr-topic-prompt {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin-top: 0.25rem;
		padding-top: 0.375rem;
		border-top: 1px solid rgba(212, 199, 163, 0.05);
	}
	.dr-self-prompt {
		flex: 1;
		font-size: 0.68rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: rgba(212, 199, 163, 0.45);
		line-height: 1.4;
		word-break: break-word;
	}
	.dr-execute-btn {
		padding: 0.25rem 0.625rem !important;
		font-size: 0.65rem;
		font-weight: 600;
		color: rgba(52, 211, 153, 0.85);
		background: rgba(52, 211, 153, 0.08) !important;
		border: 1px solid rgba(52, 211, 153, 0.2) !important;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
		white-space: nowrap;
	}
	.dr-execute-btn:hover { background: rgba(52, 211, 153, 0.15) !important; }
	.dr-execute-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.dr-result-text {
		font-size: 0.78rem;
		color: rgba(212, 199, 163, 0.7);
		line-height: 1.65;
		white-space: pre-wrap;
		max-height: 24rem;
		overflow-y: auto;
	}

	.dr-thumb-up {
		font-size: 0.72rem;
		font-weight: 600;
		color: rgba(52, 211, 153, 0.8);
		font-variant-numeric: tabular-nums;
	}
	.dr-thumb-down {
		font-size: 0.72rem;
		font-weight: 600;
		color: rgba(248, 113, 113, 0.7);
		font-variant-numeric: tabular-nums;
	}

	.dr-meta {
		font-size: 0.62rem;
		color: rgba(212, 199, 163, 0.2);
		text-align: right;
		padding: 0.25rem 0;
	}

	/* MapReduce Matrix tab */
	.matrix-section { margin-bottom: 1rem; }
	.matrix-section h4 { font-size: 0.75rem; color: rgba(212, 199, 163, 0.6); margin: 0 0 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
	.matrix-coverage { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.matrix-coverage-item { display: flex; align-items: center; gap: 0.35rem; background: rgba(212, 199, 163, 0.06); border: 1px solid rgba(212, 199, 163, 0.08); border-radius: 4px; padding: 0.25rem 0.5rem; font-size: 0.7rem; }
	.matrix-pipe-label { color: rgba(212, 199, 163, 0.5); text-transform: uppercase; font-size: 0.6rem; letter-spacing: 0.04em; }
	.matrix-pipe-count { color: rgba(96, 165, 250, 0.9); font-weight: 600; }
	.matrix-table-wrap { overflow-x: auto; }
	.matrix-table { width: 100%; border-collapse: collapse; font-size: 0.7rem; }
	.matrix-table th { text-align: left; padding: 0.3rem 0.5rem; color: rgba(212, 199, 163, 0.4); border-bottom: 1px solid rgba(212, 199, 163, 0.08); font-weight: 500; }
	.matrix-table td { padding: 0.3rem 0.5rem; border-bottom: 1px solid rgba(212, 199, 163, 0.04); }
	.matrix-filepath { color: rgba(212, 199, 163, 0.7); max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.matrix-score { color: rgba(96, 165, 250, 0.8); font-family: monospace; text-align: right; }
	.matrix-pipe-badge { background: rgba(96, 165, 250, 0.12); color: rgba(96, 165, 250, 0.9); padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.6rem; text-transform: uppercase; }

	/* ── Research Playground ── */
	.pg-form { display: flex; flex-direction: column; gap: 0.625rem; margin-bottom: 1.25rem; }
	.pg-query-row { display: flex; gap: 0.5rem; }
	.pg-input {
		flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(212,199,163,0.12);
		border-radius: 0.375rem; padding: 0.5rem 0.75rem;
		color: rgba(212,199,163,0.9); font-size: 0.8rem; outline: none;
	}
	.pg-input:focus { border-color: rgba(96,165,250,0.4); }
	.pg-run-btn {
		padding: 0.5rem 1.25rem; background: rgba(96,165,250,0.15);
		border: 1px solid rgba(96,165,250,0.3); border-radius: 0.375rem;
		color: rgba(96,165,250,0.9); font-size: 0.8rem; cursor: pointer; white-space: nowrap;
		transition: background 0.15s;
	}
	.pg-run-btn:hover:not(:disabled) { background: rgba(96,165,250,0.25); }
	.pg-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.pg-options-row { display: flex; flex-wrap: wrap; gap: 0.875rem; align-items: center; font-size: 0.72rem; color: rgba(212,199,163,0.6); }
	.pg-option-group { display: flex; align-items: center; gap: 0.375rem; }
	.pg-option-group span { white-space: nowrap; }
	.pg-option-group select, .pg-option-group input[type=range] { accent-color: rgba(96,165,250,0.8); }
	.pg-toggle { display: flex; align-items: center; gap: 0.25rem; cursor: pointer; }
	.pg-section { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid rgba(212,199,163,0.06); }
	.pg-section-title { font-size: 0.75rem; font-weight: 600; color: rgba(212,199,163,0.5); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.625rem; }
	.pg-agg-table-wrap { overflow-x: auto; }
	.pg-agg-table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
	.pg-agg-table th { color: rgba(212,199,163,0.4); font-weight: 500; text-align: left; padding: 0.3rem 0.5rem; border-bottom: 1px solid rgba(212,199,163,0.08); }
	.pg-agg-table td { padding: 0.3rem 0.5rem; border-bottom: 1px solid rgba(212,199,163,0.04); }
	.pg-num { font-family: monospace; color: rgba(212,199,163,0.8); }
	.pg-high { color: rgba(52,211,153,0.9) !important; }
	.pg-med  { color: rgba(251,191,36,0.9) !important; }
	.pg-low  { color: rgba(248,113,113,0.8) !important; }
	.pg-histogram { margin-top: 0.75rem; }
	.pg-hist-title { font-size: 0.68rem; color: rgba(212,199,163,0.4); margin-bottom: 0.375rem; }
	.pg-hist-bars { display: flex; align-items: flex-end; gap: 2px; height: 72px; }
	.pg-hist-bar { display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: default; }
	.pg-hist-fill { width: 10px; background: rgba(96,165,250,0.4); border-radius: 2px 2px 0 0; min-height: 1px; transition: height 0.2s; }
	.pg-hist-bar:hover .pg-hist-fill { background: rgba(96,165,250,0.7); }
	.pg-hist-label { font-size: 0.45rem; color: rgba(212,199,163,0.3); transform: rotate(-45deg); white-space: nowrap; }
	.pg-topic-card {
		display: flex; align-items: flex-start; gap: 0.625rem;
		background: rgba(0,0,0,0.2); border-left: 3px solid rgba(212,199,163,0.2);
		border-radius: 0 0.375rem 0.375rem 0; padding: 0.625rem 0.75rem;
		margin-bottom: 0.375rem;
	}
	.pg-topic-num { font-size: 0.65rem; font-family: monospace; color: rgba(212,199,163,0.3); width: 1.25rem; flex-shrink: 0; padding-top: 0.125rem; }
	.pg-topic-body { flex: 1; display: flex; flex-direction: column; gap: 0.25rem; }
	.pg-topic-title { font-size: 0.8rem; font-weight: 600; color: rgba(212,199,163,0.9); }
	.pg-topic-prompt { font-size: 0.7rem; color: rgba(212,199,163,0.55); font-style: italic; }
	.pg-topic-meta { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; margin-top: 0.125rem; }
	.pg-score { font-size: 0.65rem; font-family: monospace; color: rgba(52,211,153,0.8); }
	.pg-source-badge { font-size: 0.58rem; background: rgba(139,92,246,0.12); color: rgba(139,92,246,0.8); padding: 0.05rem 0.3rem; border-radius: 3px; }
	.pg-mcp-hint { font-size: 0.58rem; background: rgba(251,191,36,0.08); color: rgba(251,191,36,0.7); padding: 0.05rem 0.3rem; border-radius: 3px; }
	.pg-exec-btn { padding: 0.25rem 0.5rem; background: rgba(96,165,250,0.1); border: 1px solid rgba(96,165,250,0.2); border-radius: 0.25rem; color: rgba(96,165,250,0.8); font-size: 0.7rem; cursor: pointer; flex-shrink: 0; }
	.pg-exec-btn:hover:not(:disabled) { background: rgba(96,165,250,0.2); }
	.pg-exec-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.pg-chain { display: flex; flex-direction: column; gap: 0.375rem; }
	.pg-chain-step { display: flex; align-items: flex-start; gap: 0.5rem; background: rgba(0,0,0,0.15); border-radius: 0.375rem; padding: 0.5rem 0.75rem; }
	.pg-chain-num { font-size: 0.65rem; font-family: monospace; color: rgba(96,165,250,0.5); width: 1rem; flex-shrink: 0; padding-top: 0.1rem; }
	.pg-chain-text { flex: 1; font-size: 0.75rem; color: rgba(212,199,163,0.8); }
	.pg-fetched-meta { margin-bottom: 0.375rem; font-size: 0.72rem; }
	.pg-fetched-meta a { color: rgba(96,165,250,0.8); text-decoration: none; }
	.pg-fetched-meta a:hover { text-decoration: underline; }
	.pg-fetched-text { font-size: 0.68rem; color: rgba(212,199,163,0.6); background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 0.375rem; white-space: pre-wrap; overflow-x: auto; max-height: 300px; overflow-y: auto; }
	.pg-lg-meta { font-size: 0.7rem; color: rgba(212,199,163,0.5); margin-bottom: 0.5rem; }
	.pg-lg-meta code { background: rgba(0,0,0,0.2); padding: 0.1rem 0.3rem; border-radius: 3px; color: rgba(96,165,250,0.8); }
	.pg-lg-messages { display: flex; flex-direction: column; gap: 0.25rem; }
	.pg-lg-msg { display: flex; gap: 0.5rem; font-size: 0.7rem; padding: 0.25rem 0; border-bottom: 1px solid rgba(212,199,163,0.04); }
	.pg-lg-role { font-weight: 600; width: 6rem; flex-shrink: 0; color: rgba(212,199,163,0.4); font-size: 0.65rem; padding-top: 0.1rem; }
	.pg-lg-content { color: rgba(212,199,163,0.7); }
	.pg-lg-user .pg-lg-role { color: rgba(96,165,250,0.6); }
	.pg-lg-tool .pg-lg-role { color: rgba(251,191,36,0.6); }
</style>
