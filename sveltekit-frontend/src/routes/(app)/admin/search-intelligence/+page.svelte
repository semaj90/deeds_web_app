<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import FeedbackButtons from '$lib/components/ui/FeedbackButtons.svelte';
	import ResearchSummariesBrowser from '$lib/components/analytics/ResearchSummariesBrowser.svelte';

	// ── Types ─────────────────────────────────────────────────────────────────

	type HotQuery    = { query: string; hits: number; hash: string };
	type VPair       = { query_a: string; query_b: string; similarity: number; hit_count: number };
	type ClusterHeat = { gpu_cluster: number; total_hits: number; unique_queries: number; avg_rerank: number | null };
	type ChunkQ      = { chunk_id: string; relative_path: string | null; hit_count: number; avg_rerank: number | null; unique_queries: number; pipelines: string[]; quality_score: number };
	type PipelineMem = { pipeline: string; total_hits: number; unique_chunks: number; unique_queries: number; avg_rerank: number | null; top_chunk_path: string | null };
	type Champion    = { chunk_id: string; relative_path: string | null; pipeline_count: number; pipelines: string; total_hits: number; avg_rerank: number | null; quality_score: number };
	type Trending    = { query_hash: string; query: string | null; recent_hits: number; prior_hits: number; growth_rate: number };
	type DYM         = { suggestion: string; similarity: number; hitCount: number; source: 'redis' | 'pg' | 'qlora'; qualityTier?: string };
	type QloraStat   = { quality_tier: string; cnt: number; avg_score: number };
	type PromptLeaderEntry = { prompt: string; promptSource: string; section: string; clicks: number; rank: number };

	// ── State ─────────────────────────────────────────────────────────────────

	let days        = $state(7);
	let temperature = $state(0.5);
	let qFilter     = $state('');
	let suggestFor  = $state('');
	let loading     = $state(false);
	let error       = $state<string | null>(null);
	let autoRefresh = $state(false);
	let activeSection = $state<'queries' | 'pipeline' | 'chunks' | 'training' | 'research' | 'summaries'>('queries');

	// Distillation runner state
	let distillRunning  = $state(false);
	let distillResult   = $state<{
		candidates: number;
		inserted?:  number;
		skipped?:   number;
		dryRun?:    boolean;
		queued?:    boolean;
		background?: boolean;
	} | null>(null);
	let distillError    = $state<string | null>(null);
	let minRerankScore  = $state(0.8);
	let distillLimit    = $state(100);

	// Prompt leaderboard state
	let promptLeader    = $state<{ entries: PromptLeaderEntry[]; total: number; sections: string[] } | null>(null);
	let leaderSection   = $state('');
	let leaderLoading   = $state(false);

	// Checkpoint validator state
	type ValidateVerdict = 'pass' | 'fail' | 'degraded';
	type ValidateResult  = { query: string; candidateScore: number; baselineScore: number; delta: number; candidateIssues: string[]; candidateMs: number };
	type ValidateReport  = { verdict: ValidateVerdict; model: string; baseline: string; avgCandidate: number; avgBaseline: number; delta: number; improvements: number; regressions: number; results: ValidateResult[]; validatedAt: string };
	let ckptModel       = $state('');
	let ckptBaseline    = $state('gemma4-legal:latest');
	let ckptRunning     = $state(false);
	let ckptReport      = $state<ValidateReport | null>(null);
	let ckptError       = $state<string | null>(null);

	// Cluster narrative state
	type ClusterNarrative = { clusterId: number; summary: string; purpose: string; patterns: string[]; keyFiles: string[]; warnings: string[]; generatedAt: string };
	let expandedCluster     = $state<number | null>(null);
	let clusterNarrative    = $state<ClusterNarrative | null>(null);
	let clusterNarrLoading  = $state(false);
	let clusterNarrError    = $state<string | null>(null);

	// ── Research topics state ─────────────────────────────────────────────────
	type ResearchTopic = {
		queryHash:       string;
		query:           string;
		pipeline:        string;
		pipelines:       string[];
		qualityTier:     string | null;
		confidence:      number;
		feedbackRatio:   number;
		feedbackUp:      number;
		feedbackDown:    number;
		entityTags:      string[];
		graphSummary:    string | null;
		selfPromptChain: string[];
	};
	type ResearchData = {
		topics:          ResearchTopic[];
		seedTopics:      string[];
		hotQueryTags:    string[];
		graphExpansions: string[];
		meta: {
			pipeline:        string;
			cacheBuiltAt:    string | null;
			totalByPipeline: Record<string, number>;
		};
	};
	let researchPipeline   = $state<'all' | 'ace' | 'rag' | 'kag' | 'dag' | 'codebase'>('all');
	let researchDomains    = $state('typescript,sveltekit,ripgrep,ollama');
	let researchLoading    = $state(false);
	let researchData       = $state<ResearchData | null>(null);
	let researchError      = $state<string | null>(null);
	let expandedTopic      = $state<string | null>(null);

	// ── Corpus search state ───────────────────────────────────────────────────
	let corpusQuery        = $state('');
	let corpusLoading      = $state(false);
	let corpusError        = $state<string | null>(null);
	let corpusResults      = $state<CorpusResult[]>([]);

	// ── Ingest state ─────────────────────────────────────────────────────────
	let ingestStateCode    = $state('ca');
	let ingestLoading      = $state(false);
	let ingestResult       = $state<IngestResult | null>(null);
	let corpusStats        = $state<CorpusStats | null>(null);

	type CorpusResult = {
		pointId: string; collection: string; collectionLabel: string;
		query: string; summary: string; entityTags: string[];
		jurisdiction: string | null; corpusType: string | null;
		citationLabel: string | null; sectionPath: string | null;
		relevanceScore: number;
	};
	type IngestResult   = { queued?: boolean; skipped?: boolean; error?: string; stateName?: string; message?: string };
	type CorpusStats    = { byType: Record<string, { complete: number; total: number }>; constitutionCoverage: number; totalDocuments: number; totalComplete: number };

	async function run_corpus_search() {
		if (!corpusQuery.trim()) return;
		corpusLoading = true;
		corpusError   = null;
		try {
			const res = await fetch('/api/analytics/web-research', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'corpus-search', selfPrompts: [corpusQuery.trim()], pipeline: researchPipeline, maxResults: 6 }),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = await res.json();
			corpusResults = d.batches?.[0]?.summaries ?? [];
		} catch (e) {
			corpusError = e instanceof Error ? e.message : String(e);
		} finally {
			corpusLoading = false;
		}
	}

	async function ingest_constitution(stateCode: string) {
		ingestLoading = true;
		ingestResult  = null;
		try {
			const res = await fetch('/api/ingest/legal', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'constitution', stateCode }),
			});
			ingestResult = await res.json();
		} catch (e) {
			ingestResult = { error: e instanceof Error ? e.message : String(e) };
		} finally {
			ingestLoading = false;
		}
	}

	async function load_corpus_stats() {
		try {
			const res = await fetch('/api/ingest/legal?type=corpus');
			if (!res.ok) return;
			const d = await res.json();
			corpusStats = { byType: d.byCorpusType ? buildByTypeMap(d.byCorpusType) : {}, constitutionCoverage: d.constitutionCoverage?.pct ?? 0, totalDocuments: Object.values<{ total: number }>(d.byCorpusType ? buildByTypeMap(d.byCorpusType) : {}).reduce((s, v) => s + v.total, 0), totalComplete: d.constitutionCoverage?.complete ?? 0 };
		} catch { /* non-fatal */ }
	}

	function buildByTypeMap(rows: { corpus_type: string; processing_status: string; cnt: number }[]): Record<string, { complete: number; total: number }> {
		const m: Record<string, { complete: number; total: number }> = {};
		for (const r of rows) {
			if (!m[r.corpus_type]) m[r.corpus_type] = { complete: 0, total: 0 };
			m[r.corpus_type].total += r.cnt;
			if (r.processing_status === 'complete') m[r.corpus_type].complete += r.cnt;
		}
		return m;
	}

	async function fetch_research_topics(rebuild = false) {
		researchLoading = true;
		researchError   = null;
		try {
			const params = new URLSearchParams({
				pipeline: researchPipeline,
				domains:  researchDomains,
				limit:    '15',
				depth:    '3',
			});
			if (rebuild) params.set('rebuild', '1');
			const res = await fetch(`/api/analytics/research-topics?${params}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			researchData = await res.json();
		} catch (e) {
			researchError = e instanceof Error ? e.message : String(e);
		} finally {
			researchLoading = false;
		}
	}

	let data = $state<{
		hotQueries:          HotQuery[];
		clusterHeat:         ClusterHeat[];
		variancePairs:       VPair[];
		chunkQuality:        ChunkQ[];
		pipelineMemory:      PipelineMem[];
		crossPipelineChamps: Champion[];
		trending:            Trending[];
		didYouMean:          DYM[];
		qloraStats:          QloraStat[];
		meta:                { minSimilarity: number; windowDays: number; temperature: number };
	} | null>(null);

	let debounceTimer: ReturnType<typeof setTimeout>;

	// ── Derived ───────────────────────────────────────────────────────────────

	const MAX_HITS      = $derived(data?.hotQueries[0]?.hits ?? 1);
	const totalHits     = $derived(data?.hotQueries.reduce((s, q) => s + q.hits, 0) ?? 0);
	const totalExamples = $derived(data?.qloraStats.reduce((s, r) => s + r.cnt, 0) ?? 0);
	// Hash lookup for click-through attribution: suggestion → source query hash
	const hotHashByQuery = $derived(new Map(data?.hotQueries.map((q) => [q.query, q.hash]) ?? []));

	// ── Suggestion click-through ──────────────────────────────────────────────

	async function recordSuggestionClick(_suggestion: string) {
		const sourceHash = hotHashByQuery.get(suggestFor) ?? null;
		if (!sourceHash) return;
		fetch('/api/analytics/feedback', {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({ queryHash: sourceHash, rating: null, pipeline: 'did-you-mean' }),
		}).catch(() => {});
	}

	// ── Fetch ─────────────────────────────────────────────────────────────────

	async function fetch_data() {
		loading = true;
		error   = null;
		try {
			const params = new URLSearchParams({
				days:        String(days),
				temperature: temperature.toFixed(2),
			});
			if (qFilter)    params.set('q',       qFilter);
			if (suggestFor) params.set('suggest',  suggestFor);

			const res = await fetch(`/api/analytics/search-patterns?${params}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			data = await res.json();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	function schedule_refresh() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => { fetch_data(); }, 300);
	}

	async function fetch_leaderboard() {
		leaderLoading = true;
		try {
			const params = new URLSearchParams({ limit: '100' });
			if (leaderSection) params.set('section', leaderSection);
			const res = await fetch(`/api/analytics/prompt-leaderboard?${params}`);
			if (res.ok) promptLeader = await res.json();
		} catch { /* non-fatal */ } finally {
			leaderLoading = false;
		}
	}

	async function fetchClusterNarrative(clusterId: number, force = false) {
		clusterNarrLoading = true;
		clusterNarrError   = null;
		clusterNarrative   = null;
		try {
			const url = force
				? '/api/codebase-index/cluster-summary'
				: `/api/codebase-index/cluster-summary?clusterId=${clusterId}`;
			const opts = force
				? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clusterId, force: true }) }
				: {};
			const res = await fetch(url, opts);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			if (json.error) throw new Error(json.error);
			clusterNarrative = json as ClusterNarrative;
		} catch (e) {
			clusterNarrError = e instanceof Error ? e.message : String(e);
		} finally {
			clusterNarrLoading = false;
		}
	}

	function toggleClusterExpand(clusterId: number) {
		if (expandedCluster === clusterId) {
			expandedCluster  = null;
			clusterNarrative = null;
			clusterNarrError = null;
		} else {
			expandedCluster = clusterId;
			fetchClusterNarrative(clusterId);
		}
	}

	// Auto-load on days/temperature change; qFilter debounces via oninput
	$effect(() => {
		void days; void temperature;
		schedule_refresh();
	});

	// Load research topics + corpus stats when Research tab is opened
	$effect(() => {
		if (activeSection === 'research' && !researchData && !researchLoading) {
			fetch_research_topics();
			load_corpus_stats();
		}
	});

	// Load leaderboard when Training tab is opened or section filter changes
	$effect(() => {
		if (activeSection === 'training') {
			void leaderSection;
			fetch_leaderboard();
		}
	});

	// Auto-refresh interval
	$effect(() => {
		if (!autoRefresh) return;
		const id = setInterval(fetch_data, 30_000);
		return () => clearInterval(id);
	});

	// ── Distillation ──────────────────────────────────────────────────────────

	async function runDistill(dryRun: boolean) {
		distillRunning = true;
		distillResult  = null;
		distillError   = null;
		try {
			const r = await fetch('/api/analytics/qlora-dataset', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ minRerankScore, limit: distillLimit, dryRun }),
			});
			const d = await r.json() as typeof distillResult;
			distillResult = d;
			if (!dryRun && !d?.background) fetch_data(); // refresh QLoRA stats
		} catch (e) {
			distillError = e instanceof Error ? e.message : String(e);
		} finally {
			distillRunning = false;
		}
	}

	async function runValidation() {
		if (!ckptModel.trim()) return;
		ckptRunning = true;
		ckptReport  = null;
		ckptError   = null;
		try {
			const r = await fetch('/api/admin/model/validate-checkpoint', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ model: ckptModel.trim(), baseline: ckptBaseline.trim() }),
			});
			const d = await r.json() as ValidateReport & { error?: string };
			if (d.error) throw new Error(d.error);
			ckptReport = d;
		} catch (e) {
			ckptError = e instanceof Error ? e.message : String(e);
		} finally {
			ckptRunning = false;
		}
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	function pct(n: number, of: number) { return of ? Math.round((n / of) * 100) : 0; }
	function fmt_pct(n: number)         { return (n * 100).toFixed(1) + '%'; }
	function fmt_sim(n: number)         { return (n * 100).toFixed(0) + '%'; }

	function score_color(v: number | null): string {
		if (v == null) return '#6b7280';
		if (v >= 0.9)  return '#f59e0b';
		if (v >= 0.75) return '#4ade80';
		if (v >= 0.6)  return '#60a5fa';
		return '#f87171';
	}

	const PIPELINE_CFG: Record<string, { color: string; label: string }> = {
		ace:      { color: '#7c6ff7', label: 'ACE' },
		kag:      { color: '#4ade80', label: 'KAG' },
		dag:      { color: '#f59e0b', label: 'DAG' },
		rag:      { color: '#38bdf8', label: 'RAG' },
		reranker: { color: '#fb7185', label: 'Reranker' },
		codebase: { color: '#a78bfa', label: 'Codebase' },
	};
	const TIER_CFG: Record<string, string> = { gold: '#f59e0b', silver: '#9ca3af', bronze: '#b45309' };

	function short_path(p: string | null): string {
		if (!p) return '—';
		const parts = p.replace(/\\/g, '/').split('/');
		return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p;
	}
</script>

<div class="si-page">

<!-- ══════════════════════════════════════════════════════════════════════
     HEADER
══════════════════════════════════════════════════════════════════════ -->
<header class="si-header">
	<div class="header-left">
		<p class="eyebrow"><Icon name="bar-chart-3" class="w-3.5 h-3.5" /> Admin · Analytics</p>
		<h1>Search Intelligence</h1>
		<p class="subtitle">
			Live retrieval patterns · Query variance · Pipeline memory · QLoRA signals
		</p>
	</div>

	<div class="header-right">
		{#if loading}
			<span class="status-chip loading">
				<Icon name="loader" class="w-3.5 h-3.5 spin" /> Refreshing…
			</span>
		{:else if data}
			<span class="status-chip ok">
				<Icon name="check-circle" class="w-3.5 h-3.5" />
				{data.meta.windowDays}d · sim≥{data.meta.minSimilarity.toFixed(2)}
			</span>
		{/if}
		<button
			class="btn-icon"
			class:active={autoRefresh}
			title="Auto-refresh every 30s"
			onclick={() => { autoRefresh = !autoRefresh; }}
		>
			<Icon name="activity" class="w-4 h-4" />
		</button>
	</div>
</header>

{#if error}
	<div class="err-banner"><Icon name="alert-triangle" class="w-4 h-4" /> {error}</div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════
     CONTROLS
══════════════════════════════════════════════════════════════════════ -->
<div class="controls-bar">
	<!-- Window -->
	<div class="ctrl-group">
		<span class="ctrl-label">Window</span>
		<div class="btn-seg">
			{#each [1, 3, 7, 14, 30] as d}
				<button class="seg-btn" class:active={days === d} onclick={() => { days = d; }}>
					{d}d
				</button>
			{/each}
		</div>
	</div>

	<!-- Temperature -->
	<div class="ctrl-group temp-group">
		<span class="ctrl-label">
			Temperature <code class="val">{temperature.toFixed(2)}</code>
			<span class="sim-hint">sim≥{(1 - temperature * 0.5).toFixed(2)}</span>
		</span>
		<input
			type="range" min="0" max="1" step="0.01"
			bind:value={temperature}
			oninput={schedule_refresh}
			class="temp-slider"
		/>
		<div class="temp-labels"><span>exact</span><span>Bifrost</span><span>fuzzy</span></div>
	</div>

	<!-- Filter -->
	<div class="ctrl-group">
		<span class="ctrl-label">Filter queries <span class="ctrl-sub">(regex)</span></span>
		<div class="input-row">
			<input
				type="text" placeholder="e.g. hearsay|statute"
				bind:value={qFilter}
				oninput={schedule_refresh}
				class="text-input"
			/>
		</div>
	</div>

	<!-- Did you mean -->
	<div class="ctrl-group">
		<span class="ctrl-label">Did you mean? <span class="ctrl-sub">(semantic)</span></span>
		<div class="input-row">
			<input
				type="text" placeholder="Type a query…"
				bind:value={suggestFor}
				class="text-input"
			/>
			<button onclick={fetch_data} class="btn-search" title="Search suggestions">
				<Icon name="search" class="w-3.5 h-3.5" />
			</button>
		</div>
	</div>

	<button class="btn-refresh" onclick={fetch_data} disabled={loading}>
		<Icon name="refresh-cw" class="w-4 h-4 {loading ? 'spin' : ''}" />
		{loading ? 'Loading…' : 'Refresh'}
	</button>
</div>

<!-- ══════════════════════════════════════════════════════════════════════
     STAT STRIP
══════════════════════════════════════════════════════════════════════ -->
<div class="stat-strip">
	<div class="stat-pill">
		<span class="sp-label">Total hits</span>
		<span class="sp-val" style="color:#7c6ff7">{totalHits.toLocaleString()}</span>
	</div>
	<div class="stat-pill">
		<span class="sp-label">Hot queries</span>
		<span class="sp-val" style="color:#4ade80">{data?.hotQueries.length ?? 0}</span>
	</div>
	<div class="stat-pill">
		<span class="sp-label">Trending 24h</span>
		<span class="sp-val" style="color:#f59e0b">{data?.trending.length ?? 0}</span>
	</div>
	<div class="stat-pill">
		<span class="sp-label">Variance pairs</span>
		<span class="sp-val" style="color:#a78bfa">{data?.variancePairs.length ?? 0}</span>
	</div>
	<div class="stat-pill">
		<span class="sp-label">Active clusters</span>
		<span class="sp-val" style="color:#38bdf8">{data?.clusterHeat.length ?? 0}</span>
	</div>
	<div class="stat-pill">
		<span class="sp-label">QLoRA examples</span>
		<span class="sp-val" style="color:#fb7185">{totalExamples.toLocaleString()}</span>
	</div>
</div>

<!-- ══════════════════════════════════════════════════════════════════════
     SECTION TABS
══════════════════════════════════════════════════════════════════════ -->
<div class="section-tabs">
	<button class="s-tab" class:active={activeSection === 'queries'}  onclick={() => activeSection = 'queries'}>
		<Icon name="search" class="w-3.5 h-3.5" /> Queries
	</button>
	<button class="s-tab" class:active={activeSection === 'pipeline'} onclick={() => activeSection = 'pipeline'}>
		<Icon name="git-branch" class="w-3.5 h-3.5" /> Pipeline
	</button>
	<button class="s-tab" class:active={activeSection === 'chunks'}   onclick={() => activeSection = 'chunks'}>
		<Icon name="file-text" class="w-3.5 h-3.5" /> Chunks
	</button>
	<button class="s-tab" class:active={activeSection === 'training'} onclick={() => activeSection = 'training'}>
		<Icon name="brain" class="w-3.5 h-3.5" /> Training
	</button>
	<button class="s-tab" class:active={activeSection === 'research'} onclick={() => activeSection = 'research'}>
		<Icon name="telescope" class="w-3.5 h-3.5" /> Research
	</button>
	<button class="s-tab" class:active={activeSection === 'summaries'} onclick={() => activeSection = 'summaries'}>
		<Icon name="library" class="w-3.5 h-3.5" /> Summaries
	</button>
</div>

{#if data}
<div class="si-grid" class:wide={activeSection === 'chunks'}>

	<!-- ═══════════════════════════ QUERIES ═══════════════════════════════ -->
	{#if activeSection === 'queries'}

	<!-- Hot Queries -->
	<section class="panel span2">
		<h2><Icon name="flame" class="w-4 h-4" style="color:#f59e0b" /> Hot Queries
			<span class="h2-badge">{data.hotQueries.length}</span>
		</h2>
		{#if !data.hotQueries.length}
			<p class="empty">No matching queries in this window</p>
		{:else}
			<ul class="query-list">
				{#each data.hotQueries as q, i}
					<li>
						<span class="rank">{i + 1}</span>
						<div class="qbar-wrap">
							<div class="qbar-fill" style="width:{pct(q.hits, MAX_HITS)}%"></div>
						</div>
						<span class="q-text">{q.query}</span>
						<span class="q-hits">{q.hits}</span>
						<FeedbackButtons queryHash={q.hash} compact={true} showCounts={true} />
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Trending -->
	<section class="panel">
		<h2><Icon name="trending-up" class="w-4 h-4" style="color:#4ade80" /> Trending
			<span class="h2-badge">{data.trending.length}</span>
			<span class="h2-sub">24h growth rate</span>
		</h2>
		{#if !data.trending.length}
			<p class="empty">No trending data yet</p>
		{:else}
			<ul class="trending-list">
				{#each data.trending as t}
					<li>
						<span class="t-query">{t.query ?? t.query_hash.slice(0, 14) + '…'}</span>
						<div class="t-right">
							<span class="t-growth"
								style="color:{t.growth_rate > 3 ? '#f59e0b' : t.growth_rate > 1 ? '#4ade80' : '#6b7280'}">
								×{t.growth_rate.toFixed(1)}
							</span>
							<span class="t-meta">{t.recent_hits}↑</span>
							<FeedbackButtons queryHash={t.query_hash} pipeline="ace" compact={true} />
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Variance Pairs -->
	<section class="panel span2">
		<h2>
			<Icon name="git-merge" class="w-4 h-4" style="color:#a78bfa" /> Variance Pairs
			<span class="h2-badge">{data.variancePairs.length}</span>
			<span class="h2-sub">temp={temperature.toFixed(2)} · min_sim={data.meta.minSimilarity.toFixed(2)}</span>
		</h2>
		{#if !data.variancePairs.length}
			<p class="empty">No pairs at this threshold — increase temperature to see more</p>
		{:else}
			<table class="data-table">
				<thead>
					<tr><th>Query A</th><th>Query B</th><th style="text-align:right">Sim</th><th style="text-align:right">Hits</th></tr>
				</thead>
				<tbody>
					{#each data.variancePairs as p}
						<tr>
							<td class="q-cell">{p.query_a}</td>
							<td class="q-cell muted">{p.query_b}</td>
							<td class="r-cell">
								<span class="sim-chip"
									style="background:{p.similarity >= 0.95 ? '#f59e0b22' : p.similarity >= 0.85 ? '#4ade8022' : '#38bdf822'};
									       color:{p.similarity >= 0.95 ? '#f59e0b' : p.similarity >= 0.85 ? '#4ade80' : '#38bdf8'}">
									{fmt_sim(p.similarity)}
								</span>
							</td>
							<td class="r-cell">{p.hit_count}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<!-- Did You Mean -->
	{#if data.didYouMean.length || suggestFor}
	<section class="panel">
		<h2><Icon name="lightbulb" class="w-4 h-4" style="color:#fbbf24" /> Did You Mean?</h2>
		{#if data.didYouMean.length}
			<ul class="dym-list">
				{#each data.didYouMean as s}
					<li>
						<div class="dym-top">
							<button class="dym-btn" onclick={() => { recordSuggestionClick(s.suggestion); suggestFor = s.suggestion; fetch_data(); }}>
								"{s.suggestion}"
							</button>
							{#if s.qualityTier}
								<span class="tier-badge tier-{s.qualityTier}">{s.qualityTier}</span>
							{/if}
						</div>
						<div class="dym-bottom">
							<span class="dym-meta">
								{fmt_sim(s.similarity)} sim · {s.hitCount} hits
								<span class="src-badge src-{s.source}">{s.source}</span>
							</span>
							<FeedbackButtons queryHash={hotHashByQuery.get(s.suggestion) ?? s.suggestion} pipeline="did-you-mean" compact={true} />
						</div>
					</li>
				{/each}
			</ul>
		{:else if suggestFor}
			<p class="empty">No suggestions for "{suggestFor}"</p>
		{/if}
	</section>
	{/if}

	<!-- ═══════════════════════════ PIPELINE ══════════════════════════════ -->
	{:else if activeSection === 'pipeline'}

	<!-- Pipeline Memory -->
	<section class="panel">
		<h2><Icon name="cpu" class="w-4 h-4" style="color:#38bdf8" /> Pipeline Memory
			<span class="h2-sub">{days}d window</span>
		</h2>
		{#if !data.pipelineMemory.length}
			<p class="empty">No pipeline data in this window</p>
		{:else}
			{@const maxPhits = Math.max(...data.pipelineMemory.map((p) => p.total_hits), 1)}
			<div class="pipeline-list">
				{#each data.pipelineMemory as pm}
					{@const cfg = PIPELINE_CFG[pm.pipeline] ?? { color: '#9ca3af', label: pm.pipeline }}
					<div class="pip-row">
						<div class="pip-head">
							<span class="pip-dot" style="background:{cfg.color}"></span>
							<span class="pip-name">{cfg.label}</span>
							{#if pm.avg_rerank != null}
								<span class="pip-score" style="color:{score_color(pm.avg_rerank)}">
									{fmt_pct(pm.avg_rerank)}
								</span>
							{/if}
							<span class="pip-hits">{pm.total_hits.toLocaleString()}</span>
						</div>
						<div class="pip-bar-bg">
							<div class="pip-bar-fill"
								style="width:{pct(pm.total_hits, maxPhits)}%; background:{cfg.color}50; border-right:2px solid {cfg.color}">
							</div>
						</div>
						<div class="pip-meta">
							<span>{pm.unique_chunks} chunks</span>
							<span>{pm.unique_queries} queries</span>
							{#if pm.top_chunk_path}
								<span class="top-chunk" title={pm.top_chunk_path ?? ''}>
									<Icon name="file" class="w-3 h-3" />{short_path(pm.top_chunk_path)}
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Cross-Pipeline Champions -->
	<section class="panel">
		<h2><Icon name="trophy" class="w-4 h-4" style="color:#f59e0b" /> Cross-Pipeline Champions
			<span class="h2-badge">{data.crossPipelineChamps.length}</span>
			<span class="h2-sub">≥2 pipelines</span>
		</h2>
		{#if !data.crossPipelineChamps.length}
			<p class="empty">No chunks hit across multiple pipelines yet</p>
		{:else}
			<ul class="champ-list">
				{#each data.crossPipelineChamps as c}
					<li>
						<div class="champ-path" title={c.chunk_id}>{short_path(c.relative_path)}</div>
						<div class="champ-meta">
							<span class="pip-count-badge">{c.pipeline_count}×</span>
							<div class="pipe-tags">
								{#each c.pipelines.split(', ') as pipe}
									{@const cfg = PIPELINE_CFG[pipe.trim()] ?? { color: '#9ca3af' }}
									<span class="pipe-tag" style="border-color:{cfg.color}; color:{cfg.color}">{pipe.trim()}</span>
								{/each}
							</div>
							<span class="champ-hits">{c.total_hits} hits</span>
							{#if c.avg_rerank != null}
								<span style="color:{score_color(c.avg_rerank)}">{fmt_pct(c.avg_rerank)}</span>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Cluster Heatmap -->
	<section class="panel span2">
		<h2><Icon name="layers" class="w-4 h-4" style="color:#38bdf8" /> GPU Cluster Heatmap
			<span class="h2-badge">{data.clusterHeat.length} active</span>
		</h2>
		{#if !data.clusterHeat.length}
			<p class="empty">No cluster data in this window</p>
		{:else}
			{@const maxCH = data.clusterHeat[0]?.total_hits ?? 1}
			<ul class="cluster-list">
				{#each data.clusterHeat as c}
					<li title="Cluster {c.gpu_cluster} — {c.total_hits} hits, {c.unique_queries} queries">
						<button class="c-expand-btn" onclick={() => toggleClusterExpand(c.gpu_cluster)}
							aria-expanded={expandedCluster === c.gpu_cluster}>
							<Icon name={expandedCluster === c.gpu_cluster ? 'chevron-down' : 'chevron-right'} class="w-3 h-3" />
						</button>
						<span class="c-id">C{c.gpu_cluster}</span>
						<div class="c-bar-bg">
							<div class="c-bar-fill" style="width:{pct(c.total_hits, maxCH)}%"></div>
						</div>
						<span class="c-hits">{c.total_hits}</span>
						<span class="c-q muted">{c.unique_queries}q</span>
						{#if c.avg_rerank != null}
							<span class="c-score" style="color:{score_color(c.avg_rerank)}">{fmt_pct(c.avg_rerank)}</span>
						{/if}
					</li>
					{#if expandedCluster === c.gpu_cluster}
						<li class="cluster-narrative">
							{#if clusterNarrLoading}
								<p class="muted">Loading narrative…</p>
							{:else if clusterNarrError}
								<p class="error-text">{clusterNarrError}</p>
							{:else if clusterNarrative}
								<div class="narr-header">
									<strong>{clusterNarrative.purpose}</strong>
									<button class="btn-regen" onclick={() => fetchClusterNarrative(c.gpu_cluster, true)}
										title="Regenerate narrative">
										<Icon name="refresh-cw" class="w-3 h-3" /> Regenerate
									</button>
								</div>
								<p class="narr-summary">{clusterNarrative.summary}</p>
								{#if clusterNarrative.patterns.length}
									<div class="narr-section">
										<span class="narr-label">Patterns</span>
										<ul class="narr-list">{#each clusterNarrative.patterns as p}<li>{p}</li>{/each}</ul>
									</div>
								{/if}
								{#if clusterNarrative.keyFiles.length}
									<div class="narr-section">
										<span class="narr-label">Key Files</span>
										<ul class="narr-list mono">{#each clusterNarrative.keyFiles as f}<li>{f}</li>{/each}</ul>
									</div>
								{/if}
								{#if clusterNarrative.warnings.length}
									<div class="narr-section">
										<span class="narr-label">Warnings</span>
										<ul class="narr-list warn">{#each clusterNarrative.warnings as w}<li>{w}</li>{/each}</ul>
									</div>
								{/if}
								<p class="narr-footer muted">Generated {new Date(clusterNarrative.generatedAt).toLocaleString()}</p>
							{/if}
						</li>
					{/if}
				{/each}
			</ul>
		{/if}
	</section>

	<!-- ═══════════════════════════ CHUNKS ════════════════════════════════ -->
	{:else if activeSection === 'chunks'}

	<section class="panel span-full">
		<h2>
			<Icon name="bar-chart-2" class="w-4 h-4" style="color:#4ade80" /> Chunk Quality Signals
			<span class="h2-badge">{data.chunkQuality.length}</span>
			<span class="h2-sub">quality = hit_count × avg_rerank</span>
		</h2>
		{#if !data.chunkQuality.length}
			<p class="empty">No chunk data in this window</p>
		{:else}
			{@const maxQS = Math.max(...data.chunkQuality.map((c) => c.quality_score), 1)}
			<table class="data-table">
				<thead>
					<tr>
						<th style="width:2rem">#</th>
						<th>Path</th>
						<th>Pipelines</th>
						<th style="text-align:right">Hits</th>
						<th style="text-align:right">Queries</th>
						<th style="text-align:right">Avg rerank</th>
						<th style="text-align:right; width:120px">Quality score</th>
						<th style="text-align:center; width:60px">Rate</th>
					</tr>
				</thead>
				<tbody>
					{#each data.chunkQuality as cq, i}
						<tr>
							<td class="rank">{i + 1}</td>
							<td><span class="mono" title={cq.chunk_id}>{short_path(cq.relative_path)}</span></td>
							<td>
								<div class="pipe-tags sm">
									{#each cq.pipelines as pipe}
										{@const cfg = PIPELINE_CFG[pipe] ?? { color: '#9ca3af' }}
										<span class="pipe-tag" style="border-color:{cfg.color}; color:{cfg.color}">{pipe}</span>
									{/each}
								</div>
							</td>
							<td class="r-cell">{cq.hit_count}</td>
							<td class="r-cell">{cq.unique_queries}</td>
							<td class="r-cell">
								<span style="color:{score_color(cq.avg_rerank)}">
									{cq.avg_rerank != null ? fmt_pct(cq.avg_rerank) : '—'}
								</span>
							</td>
							<td class="r-cell">
								<div class="qs-bar-wrap">
									<div class="qs-bar" style="width:{pct(cq.quality_score, maxQS)}%; background:{score_color(cq.avg_rerank)}"></div>
									<span class="qs-val">{cq.quality_score.toFixed(1)}</span>
								</div>
							</td>
							<td class="r-cell">
								<FeedbackButtons queryHash={cq.chunk_id} pipeline="chunk-quality" compact={true} />
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<!-- ═══════════════════════════ TRAINING ══════════════════════════════ -->
	{:else if activeSection === 'training'}

	<!-- QLoRA Stats -->
	<section class="panel">
		<h2>
			<Icon name="brain" class="w-4 h-4" style="color:#a78bfa" /> QLoRA Training Examples
			<span class="h2-badge">{totalExamples.toLocaleString()} total</span>
		</h2>
		{#if !data.qloraStats.length}
			<p class="empty">No training examples yet — run distillation to populate</p>
		{:else}
			<div class="tier-list">
				{#each data.qloraStats as tier}
					{@const color = TIER_CFG[tier.quality_tier] ?? '#6b7280'}
					{@const p = totalExamples ? (tier.cnt / totalExamples) * 100 : 0}
					<div class="tier-row">
						<div class="tier-label">
							<span class="tier-dot" style="background:{color}"></span>
							<span class="tier-name">{tier.quality_tier.charAt(0).toUpperCase() + tier.quality_tier.slice(1)}</span>
						</div>
						<div class="tier-bar-bg">
							<div class="tier-bar-fill" style="width:{p}%; background:{color}50; border-right:2px solid {color}"></div>
						</div>
						<div class="tier-stats">
							<span class="tier-cnt">{tier.cnt.toLocaleString()}</span>
							<span class="tier-pct muted">{p.toFixed(1)}%</span>
							<span class="tier-score" style="color:{color}">avg {fmt_pct(tier.avg_score)}</span>
						</div>
					</div>
				{/each}
			</div>
			<!-- Stacked bar -->
			<div class="stacked-bar">
				{#each data.qloraStats as tier}
					{@const color = TIER_CFG[tier.quality_tier] ?? '#6b7280'}
					{@const p = totalExamples ? (tier.cnt / totalExamples) * 100 : 0}
					<div class="stack-seg" style="width:{p}%; background:{color}" title="{tier.quality_tier}: {tier.cnt}"></div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Feedback Legend -->
	<section class="panel">
		<h2><Icon name="thumbs-up" class="w-4 h-4" style="color:#4ade80" /> Feedback → QLoRA Loop</h2>
		<div class="feedback-legend">
			<div class="fl-row">
				<span class="fl-icon up">👍</span>
				<div class="fl-text">
					<span class="fl-title">Thumbs up — promotes to training</span>
					<span class="fl-desc">Sets <code>qlora:promote:{'{hash}'}</code> Redis flag · Upgrades quality tier (bronze→silver→gold) · Boosts chunk rerank_score to 1.0 · Included in next distillation pass</span>
				</div>
			</div>
			<div class="fl-row">
				<span class="fl-icon down">👎</span>
				<div class="fl-text">
					<span class="fl-title">Thumbs down — marks for review</span>
					<span class="fl-desc">Sets <code>qlora:skip:{'{hash}'}</code> Redis flag · Demotes quality tier (gold→silver→bronze) · Excluded from distillation · Flagged for KAG review</span>
				</div>
			</div>
			<div class="fl-row">
				<span class="fl-icon neutral">↺</span>
				<div class="fl-text">
					<span class="fl-title">Toggle off — clears vote</span>
					<span class="fl-desc">Removes <code>response_feedback</code> row · Deletes both Redis flags · Query returns to neutral state for next pipeline pass</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Distillation Runner -->
	<section class="panel">
		<h2><Icon name="flask-conical" class="w-4 h-4" style="color:#2dd4bf" /> Distillation Runner</h2>
		<p class="distill-desc">
			Trigger the <code>qlora.distill</code> pipeline to scan high-quality <code>rag_query_log</code>
			entries and insert them into <code>qlora_examples</code>.
		</p>

		<div class="distill-fields">
			<label class="field">
				<span>Min rerank score</span>
				<input type="number" min="0" max="1" step="0.05"
					bind:value={minRerankScore} class="num-input" />
			</label>
			<label class="field">
				<span>Limit</span>
				<input type="number" min="1" max="500"
					bind:value={distillLimit} class="num-input" />
			</label>
		</div>

		<div class="distill-actions">
			<button class="btn-distill dry" disabled={distillRunning}
				onclick={() => runDistill(true)}>
				<Icon name="eye" class="w-3.5 h-3.5" /> Dry run
			</button>
			<button class="btn-distill run" disabled={distillRunning}
				onclick={() => runDistill(false)}>
				<Icon name="play" class="w-3.5 h-3.5" />
				{distillRunning ? 'Running…' : 'Run distillation'}
			</button>
			<a href="/api/analytics/qlora-dataset?export=jsonl" download="qlora-training.jsonl"
				class="btn-distill export">
				<Icon name="download" class="w-3.5 h-3.5" /> Export JSONL
			</a>
		</div>

		{#if distillResult}
			<div class="distill-result">
				{#if distillResult.background}
					<span class="dr-item ok"><Icon name="list-checks" class="w-3 h-3" /> Queued in background</span>
				{:else}
					{#if distillResult.dryRun}
						<span class="dr-item warn"><Icon name="eye" class="w-3 h-3" /> Preview — no changes written</span>
					{/if}
					<span class="dr-item"><Icon name="list" class="w-3 h-3" /> {distillResult.candidates} candidates</span>
					{#if (distillResult.inserted ?? 0) > 0}
						<span class="dr-item ok"><Icon name="check" class="w-3 h-3" /> {distillResult.inserted} inserted</span>
					{/if}
					{#if (distillResult.skipped ?? 0) > 0}
						<span class="dr-item warn"><Icon name="skip-forward" class="w-3 h-3" /> {distillResult.skipped} skipped</span>
					{/if}
				{/if}
			</div>
		{/if}
		{#if distillError}
			<div class="distill-err">{distillError}</div>
		{/if}
	</section>

	<!-- Checkpoint Validator -->
	<section class="panel">
		<h2>
			<Icon name="shield-check" class="w-4 h-4" style="color:#22c55e" /> Checkpoint Validator
			<span class="h2-sub">Quality gate before promoting a fine-tuned model to production</span>
		</h2>

		<div class="ckpt-fields">
			<label class="field">
				<span>Candidate model</span>
				<input class="text-input" style="width:220px" placeholder="gemma4-legal-v2:latest"
					bind:value={ckptModel} />
			</label>
			<label class="field">
				<span>Baseline</span>
				<input class="text-input" style="width:200px"
					bind:value={ckptBaseline} />
			</label>
			<button class="btn-distill run" style="align-self:flex-end"
				disabled={ckptRunning || !ckptModel.trim()}
				onclick={runValidation}>
				<Icon name="play" class="w-3.5 h-3.5" />
				{ckptRunning ? 'Validating…' : 'Run validation'}
			</button>
		</div>

		{#if ckptError}
			<div class="distill-err">{ckptError}</div>
		{/if}

		{#if ckptReport}
			{@const vcolor = ckptReport.verdict === 'pass' ? '#22c55e' : ckptReport.verdict === 'fail' ? '#f87171' : '#f59e0b'}
			<div class="ckpt-verdict" style="border-color:{vcolor}30; background:{vcolor}0a">
				<span class="ckpt-badge" style="color:{vcolor}; border-color:{vcolor}40">
					{ckptReport.verdict.toUpperCase()}
				</span>
				<div class="ckpt-scores">
					<span>Candidate <strong style="color:{vcolor}">{fmt_pct(ckptReport.avgCandidate)}</strong></span>
					<span class="muted">vs</span>
					<span>Baseline <strong>{fmt_pct(ckptReport.avgBaseline)}</strong></span>
					<span class="ckpt-delta" style="color:{ckptReport.delta >= 0 ? '#4ade80' : '#f87171'}">
						{ckptReport.delta >= 0 ? '+' : ''}{(ckptReport.delta * 100).toFixed(1)}pp
					</span>
				</div>
				<div class="ckpt-meta">
					<span class="dr-item ok"><Icon name="trending-up" class="w-3 h-3" /> {ckptReport.improvements} improved</span>
					{#if ckptReport.regressions > 0}
						<span class="dr-item warn"><Icon name="trending-down" class="w-3 h-3" /> {ckptReport.regressions} regressed</span>
					{/if}
					<span class="muted" style="font-size:0.62rem">{new Date(ckptReport.validatedAt).toLocaleString()}</span>
				</div>
			</div>

			<table class="data-table" style="margin-top:0.75rem">
				<thead>
					<tr>
						<th>Probe query</th>
						<th class="r-cell" style="width:70px">Candidate</th>
						<th class="r-cell" style="width:70px">Baseline</th>
						<th class="r-cell" style="width:55px">Δ</th>
					</tr>
				</thead>
				<tbody>
					{#each ckptReport.results as r}
						{@const dc = r.delta >= 0.05 ? '#4ade80' : r.delta <= -0.05 ? '#f87171' : '#6b7280'}
						<tr>
							<td class="q-cell" title={r.query}>{r.query}</td>
							<td class="r-cell" style="color:{score_color(r.candidateScore)}">{fmt_pct(r.candidateScore)}</td>
							<td class="r-cell" style="color:{score_color(r.baselineScore)}">{fmt_pct(r.baselineScore)}</td>
							<td class="r-cell" style="color:{dc}; font-weight:600">
								{r.delta >= 0 ? '+' : ''}{(r.delta * 100).toFixed(0)}pp
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<!-- Prompt Leaderboard -->
	<section class="panel">
		<h2>
			<Icon name="trophy" class="w-4 h-4" style="color:#f59e0b" />
			Prompt Leaderboard
			{#if promptLeader}
				<span class="h2-badge">{promptLeader.total} prompts</span>
			{/if}
			<span class="h2-sub">Top prompts by click count from ACE synthesis sessions</span>
		</h2>

		<div class="leader-controls">
			<label class="ctrl-label">
				<Icon name="filter" class="w-3 h-3" /> Section
				<select class="leader-select" bind:value={leaderSection}
					onchange={fetch_leaderboard}>
					<option value="">All sections</option>
					{#each promptLeader?.sections ?? [] as sec}
						<option value={sec}>{sec}</option>
					{/each}
				</select>
			</label>
			<button class="btn-leader-refresh" onclick={fetch_leaderboard} disabled={leaderLoading}>
				<Icon name="refresh-cw" class="w-3 h-3" />
				{leaderLoading ? 'Loading…' : 'Refresh'}
			</button>
		</div>

		{#if leaderLoading && !promptLeader}
			<div class="empty">Loading leaderboard…</div>
		{:else if !promptLeader?.entries?.length}
			<div class="empty">No prompt clicks recorded yet. Prompts are tracked when users click synthesis suggestions.</div>
		{:else}
			<table class="data-table">
				<thead>
					<tr>
						<th class="r-cell" style="width:2.5rem">#</th>
						<th>Prompt</th>
						<th style="width:100px">Source</th>
						<th style="width:110px">Section</th>
						<th class="r-cell" style="width:60px">Clicks</th>
					</tr>
				</thead>
				<tbody>
					{#each promptLeader.entries as entry}
						<tr>
							<td class="rank">{entry.rank}</td>
							<td class="q-cell" title={entry.prompt}>{entry.prompt}</td>
							<td><span class="leader-src-badge">{entry.promptSource}</span></td>
							<td class="mono muted">{entry.section || '—'}</td>
							<td class="r-cell"><span class="leader-clicks">{entry.clicks}</span></td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	{/if}

</div>
{:else if !loading}
	<div class="no-data">
		<Icon name="database" class="w-8 h-8" />
		<p>No data loaded yet</p>
	</div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════
     RESEARCH TOPICS — independent of search-patterns data
══════════════════════════════════════════════════════════════════════ -->
{#if activeSection === 'research'}
<div class="si-grid">

	<!-- Controls -->
	<section class="panel span2">
		<div class="research-controls">
			<div class="ctrl-group">
				<label class="ctrl-label">Pipeline</label>
				<select bind:value={researchPipeline} class="ctrl-select" onchange={() => fetch_research_topics()}>
					<option value="all">All pipelines</option>
					<option value="ace">ACE</option>
					<option value="rag">RAG</option>
					<option value="kag">KAG</option>
					<option value="dag">DAG</option>
					<option value="codebase">Codebase</option>
				</select>
			</div>
			<div class="ctrl-group" style="flex:1">
				<label class="ctrl-label">Domains (comma-separated)</label>
				<input
					type="text"
					bind:value={researchDomains}
					class="ctrl-input"
					placeholder="typescript,sveltekit,ripgrep,ollama,awk"
				/>
			</div>
			<button class="btn-sm" onclick={() => fetch_research_topics(false)} disabled={researchLoading}>
				<Icon name="refresh-cw" class="w-3 h-3" />
				{researchLoading ? 'Loading…' : 'Refresh'}
			</button>
			<button class="btn-sm" onclick={() => fetch_research_topics(true)} disabled={researchLoading} title="Force-rebuild Redis index">
				<Icon name="database" class="w-3 h-3" /> Rebuild
			</button>
		</div>
		{#if researchData?.meta}
			<p class="cache-hint">
				Cache built: {researchData.meta.cacheBuiltAt
					? new Date(researchData.meta.cacheBuiltAt).toLocaleTimeString()
					: 'never'} &nbsp;·&nbsp;
				{Object.entries(researchData.meta.totalByPipeline)
					.filter(([, n]) => n > 0)
					.map(([k, n]) => `${k}:${n}`)
					.join(' · ')}
			</p>
		{/if}
	</section>

	<!-- Hot query tags + Graph expansions -->
	{#if researchData && (researchData.hotQueryTags.length || researchData.graphExpansions.length || researchData.seedTopics.length)}
	<section class="panel span2">
		<h2><Icon name="zap" class="w-4 h-4 text-yellow-400" /> Live Signals</h2>
		<div class="signal-row">
			{#if researchData.hotQueryTags.length}
			<div class="signal-group">
				<span class="signal-label">Hot queries</span>
				<div class="tag-cloud">
					{#each researchData.hotQueryTags.slice(0,8) as q}
						<span class="tag hot-tag" title={q}>{q.slice(0,50)}</span>
					{/each}
				</div>
			</div>
			{/if}
			{#if researchData.graphExpansions.length}
			<div class="signal-group">
				<span class="signal-label">Graph-connected questions</span>
				<ul class="signal-list">
					{#each researchData.graphExpansions as exp}
						<li>{exp}</li>
					{/each}
				</ul>
			</div>
			{/if}
			{#if researchData.seedTopics.length}
			<div class="signal-group">
				<span class="signal-label">Domain seed topics</span>
				<ul class="signal-list">
					{#each researchData.seedTopics as st}
						<li>{st}</li>
					{/each}
				</ul>
			</div>
			{/if}
		</div>
	</section>
	{/if}

	<!-- Research topic cards -->
	{#if researchLoading && !researchData}
		<section class="panel span2"><div class="empty">Building research index…</div></section>
	{:else if researchError}
		<section class="panel span2"><div class="empty error-text">{researchError}</div></section>
	{:else if !researchData?.topics?.length}
		<section class="panel span2">
			<div class="empty">
				No research topics yet. Run distillation first to populate the QLoRA examples, then rebuild the index.
			</div>
		</section>
	{:else}
		{#each researchData.topics as topic}
		<section class="panel research-card" class:expanded={expandedTopic === topic.queryHash}>

			<!-- Card header -->
			<div class="rc-header" role="button" tabindex="0"
				onclick={() => expandedTopic = expandedTopic === topic.queryHash ? null : topic.queryHash}
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') expandedTopic = expandedTopic === topic.queryHash ? null : topic.queryHash; }}>
				<div class="rc-meta">
					<span class="pipeline-badge {topic.pipeline}">{topic.pipeline.toUpperCase()}</span>
					{#if topic.qualityTier}
						<span class="tier-badge {topic.qualityTier}">{topic.qualityTier}</span>
					{/if}
					<span class="rc-conf" title="Composite score">
						{Math.round(topic.confidence * 100)}%
					</span>
					<span class="feedback-inline">
						<Icon name="thumbs-up" class="w-3 h-3" />{topic.feedbackUp}
						<Icon name="thumbs-down" class="w-3 h-3" />{topic.feedbackDown}
					</span>
				</div>
				<p class="rc-query">{topic.query || '(no query text)'}</p>
				{#if topic.entityTags.length}
					<div class="rc-tags">
						{#each topic.entityTags.slice(0,5) as tag}
							<span class="tag">{tag}</span>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Expanded detail -->
			{#if expandedTopic === topic.queryHash}
			<div class="rc-detail">
				{#if topic.graphSummary}
					<p class="rc-graph-summary"><strong>Graph context:</strong> {topic.graphSummary}</p>
				{/if}

				{#if topic.selfPromptChain.length}
				<div class="rc-chain">
					<h4><Icon name="link" class="w-3.5 h-3.5" /> Self-prompt chain</h4>
					<ol class="chain-list">
						{#each topic.selfPromptChain as step, i}
							<li class="chain-step">
								<span class="step-num">{i + 1}</span>
								<span class="step-text">{step}</span>
							</li>
						{/each}
					</ol>
				</div>
				{:else}
					<p class="muted chain-hint">No chain generated — run rebuild or use gold/platinum tier topics to trigger Ollama synthesis.</p>
				{/if}

				<div class="rc-pipelines">
					<span class="muted">Pipelines: </span>
					{#each topic.pipelines as pl}
						<span class="pipeline-badge {pl}">{pl}</span>
					{/each}
				</div>
			</div>
			{/if}

		</section>
		{/each}
	{/if}

	<!-- ── Corpus Search ─────────────────────────────────────────────────── -->
	<section class="panel corpus-panel">
		<h3 class="section-title">Local Legal Corpus Search</h3>
		<p class="corpus-desc">Search <code>legal_canon_chunks</code>, <code>court_opinions</code>, and <code>legal_documents</code> via gemma4-legal — authoritative, offline, no external calls.</p>
		<div class="corpus-controls">
			<input
				class="corpus-input"
				placeholder="e.g. hearsay exceptions under FRE 803 …"
				bind:value={corpusQuery}
				onkeydown={(e) => { if (e.key === 'Enter') run_corpus_search(); }}
			/>
			<button class="btn-sm primary" onclick={run_corpus_search} disabled={corpusLoading || !corpusQuery.trim()}>
				{corpusLoading ? 'Searching…' : 'Search Corpus'}
			</button>
		</div>
		{#if corpusError}
			<p class="err-msg">{corpusError}</p>
		{/if}
		{#if corpusResults.length}
			<div class="corpus-results">
				{#each corpusResults as r}
					<div class="corpus-result">
						<div class="corpus-result-header">
							<span class="corpus-badge {r.collection}">{r.collectionLabel}</span>
							{#if r.jurisdiction}<span class="juris-badge">{r.jurisdiction.toUpperCase()}</span>{/if}
							{#if r.citationLabel}<span class="citation-badge">{r.citationLabel}</span>{/if}
							<span class="score-badge">{(r.relevanceScore * 100).toFixed(0)}%</span>
						</div>
						{#if r.sectionPath}<p class="section-path">{r.sectionPath}</p>{/if}
						<p class="corpus-summary">{r.summary}</p>
						{#if r.entityTags.length}
							<div class="tag-row">
								{#each r.entityTags.slice(0, 6) as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else if !corpusLoading}
			<p class="empty-msg">Enter a legal question to search the local corpus.</p>
		{/if}
	</section>

	<!-- ── Legal Corpus Ingestion ────────────────────────────────────────── -->
	<section class="panel ingest-panel">
		<h3 class="section-title">Legal Corpus Ingestion</h3>

		{#if corpusStats}
			<div class="corpus-coverage">
				<div class="coverage-stat">
					<span class="cov-label">Constitutions</span>
					<div class="cov-bar-wrap">
						<div class="cov-bar" style="width: {corpusStats.constitutionCoverage}%"></div>
					</div>
					<span class="cov-pct">{corpusStats.constitutionCoverage}%</span>
					<span class="cov-detail">({corpusStats.byType['constitution']?.complete ?? 0}/53 ingested)</span>
				</div>
				{#each Object.entries(corpusStats.byType).filter(([k]) => k !== 'constitution') as [type, counts]}
					<div class="coverage-stat">
						<span class="cov-label">{type}</span>
						<span class="cov-detail">{counts.complete}/{counts.total} complete</span>
					</div>
				{/each}
			</div>
		{/if}

		<div class="ingest-controls">
			<label class="ctrl-label" for="ingest-state">State / Federal Code</label>
			<select id="ingest-state" class="ctrl-select" bind:value={ingestStateCode}>
				<option value="us">United States (Federal)</option>
				<option value="ca">California</option>
				<option value="ny">New York</option>
				<option value="tx">Texas</option>
				<option value="fl">Florida</option>
				<option value="wa">Washington</option>
				<option value="or">Oregon</option>
				<option value="co">Colorado</option>
				<option value="il">Illinois</option>
				<option value="pa">Pennsylvania</option>
				<option value="oh">Ohio</option>
				<option value="ga">Georgia</option>
				<option value="nc">North Carolina</option>
				<option value="all">All 53 constitutions (background)</option>
			</select>
			<button class="btn-sm primary" onclick={() => ingest_constitution(ingestStateCode)} disabled={ingestLoading}>
				{ingestLoading ? 'Queuing…' : 'Ingest Constitution'}
			</button>
			<button class="btn-sm" onclick={load_corpus_stats} title="Refresh coverage stats">
				Refresh Stats
			</button>
		</div>

		{#if ingestResult}
			<div class="ingest-result" class:success={ingestResult.queued} class:skip={ingestResult.skipped} class:fail={!!ingestResult.error}>
				{#if ingestResult.queued}
					Queued: <strong>{ingestResult.stateName ?? ingestResult.message}</strong> — pipeline running in background.
				{:else if ingestResult.skipped}
					Already complete. Pass <code>force: true</code> to re-ingest.
				{:else if ingestResult.error}
					Error: {ingestResult.error}
				{/if}
			</div>
		{/if}
	</section>

</div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════
     SUMMARIES BROWSER — paginated research_summaries (web + corpus + docs)
══════════════════════════════════════════════════════════════════════ -->
{#if activeSection === 'summaries'}
<div class="si-grid wide">
	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title">Research Summaries Browser</span>
			<span class="panel-sub">
				Paginated browse of all persisted web + corpus + document summaries.
				Filter by source, pipeline, and entity tags. Fuse.js instant search on current page.
				"Did you mean?" via pg_trgm. Cursor-based pagination — no OFFSET scans.
			</span>
		</div>
		<div class="summaries-browser-wrap">
			<ResearchSummariesBrowser />
		</div>
	</section>
</div>
{/if}

</div>

<style>
/* ── Root ──────────────────────────────────────────────────────────────── */
.si-page {
	padding: 2rem 2.5rem 4rem;
	max-width: 1440px;
	margin: 0 auto;
	color: #d4c7a3;
	font-family: 'JetBrains Mono', 'Cascadia Code', ui-monospace, monospace;
}

/* ── Header ────────────────────────────────────────────────────────────── */
.si-header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 1.5rem;
	gap: 1rem;
}
.header-right { display: flex; align-items: center; gap: 0.5rem; }
.eyebrow {
	display: flex; align-items: center; gap: 0.35rem;
	font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.12em;
	color: #60a5fa; opacity: 0.75; margin: 0 0 0.25rem;
}
h1 { font-size: 1.65rem; font-weight: 700; letter-spacing: -0.02em; color: #f0e8d0; margin: 0 0 0.3rem; }
.subtitle { font-size: 0.72rem; color: #6b7280; margin: 0; }

.status-chip {
	display: flex; align-items: center; gap: 0.35rem;
	font-size: 0.7rem; padding: 0.25rem 0.6rem; border-radius: 999px; border: 1px solid; white-space: nowrap;
}
.status-chip.ok      { border-color: #22c55e; color: #22c55e; }
.status-chip.loading { border-color: #6b7280; color: #6b7280; }

.btn-icon {
	width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center;
	border: 1px solid #2d2b24; border-radius: 5px; background: transparent; color: #6b7280; cursor: pointer;
}
.btn-icon:hover { border-color: #4ade80; color: #4ade80; }
.btn-icon.active { border-color: #4ade80; color: #4ade80; background: #4ade8018; }

.err-banner {
	display: flex; align-items: center; gap: 0.5rem;
	background: #7f1d1d22; border: 1px solid #7f1d1d; border-radius: 6px;
	padding: 0.5rem 0.9rem; color: #f87171; font-size: 0.75rem; margin-bottom: 1rem;
}

/* ── Controls ──────────────────────────────────────────────────────────── */
.controls-bar {
	display: flex; flex-wrap: wrap; align-items: flex-end; gap: 1.25rem;
	padding: 1rem 1.25rem; background: #13120f;
	border: 1px solid #2d2b24; border-radius: 8px; margin-bottom: 1.25rem;
}
.ctrl-group { display: flex; flex-direction: column; gap: 0.35rem; }
.ctrl-label {
	font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280;
	display: flex; align-items: center; gap: 0.35rem;
}
.ctrl-sub { opacity: 0.65; }
.val { color: #7c6ff7; font-size: 0.72rem; }
.sim-hint { color: #4b5563; font-size: 0.6rem; }

.btn-seg { display: flex; gap: 0.2rem; }
.seg-btn {
	padding: 0.25rem 0.55rem; font-size: 0.7rem; font-family: inherit;
	border: 1px solid #2d2b24; border-radius: 4px; background: transparent; color: #6b7280; cursor: pointer;
}
.seg-btn:hover { border-color: #7c6ff7; color: #7c6ff7; }
.seg-btn.active { background: #7c6ff718; border-color: #7c6ff7; color: #7c6ff7; font-weight: 600; }

.temp-group { min-width: 220px; }
.temp-slider { width: 100%; accent-color: #7c6ff7; cursor: pointer; margin: 0; }
.temp-labels { display: flex; justify-content: space-between; font-size: 0.6rem; color: #4b5563; }

.input-row { display: flex; gap: 0.3rem; }
.text-input {
	background: #0f0e0c; border: 1px solid #2d2b24; border-radius: 4px;
	padding: 0.3rem 0.5rem; font-size: 0.72rem; color: #d4c7a3; font-family: inherit; width: 170px;
}
.text-input:focus { outline: none; border-color: #7c6ff7; }

.btn-search {
	padding: 0.3rem 0.45rem; border: 1px solid #2d2b24; border-radius: 4px;
	background: transparent; color: #6b7280; cursor: pointer;
}
.btn-search:hover { border-color: #7c6ff7; color: #7c6ff7; }

.btn-refresh {
	display: flex; align-items: center; gap: 0.35rem; align-self: flex-end;
	padding: 0.3rem 0.75rem; border: 1px solid #374151; border-radius: 4px;
	background: transparent; color: #9ca3af; font-size: 0.72rem; font-family: inherit; cursor: pointer;
}
.btn-refresh:hover:not(:disabled) { border-color: #7c6ff7; color: #7c6ff7; }
.btn-refresh:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Stat strip ─────────────────────────────────────────────────────────── */
.stat-strip {
	display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem;
}
.stat-pill {
	display: flex; flex-direction: column; gap: 0.1rem;
	padding: 0.55rem 0.9rem; background: #13120f;
	border: 1px solid #2d2b24; border-radius: 6px; min-width: 100px;
}
.sp-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: #4b5563; }
.sp-val   { font-size: 1.1rem; font-weight: 700; }

/* ── Section tabs ───────────────────────────────────────────────────────── */
.section-tabs {
	display: flex; gap: 0.15rem;
	border-bottom: 1px solid #2d2b24; margin-bottom: 1.25rem;
}
.s-tab {
	display: flex; align-items: center; gap: 0.3rem;
	padding: 0.45rem 0.9rem; font-size: 0.72rem; font-family: inherit;
	border: none; border-bottom: 2px solid transparent; background: transparent;
	color: #4b5563; cursor: pointer; margin-bottom: -1px;
}
.s-tab:hover { color: #9ca3af; }
.s-tab.active { color: #7c6ff7; border-bottom-color: #7c6ff7; }

/* ── Grid ───────────────────────────────────────────────────────────────── */
.si-grid {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 1rem;
}
.si-grid.wide { grid-template-columns: 1fr; }
.span2      { grid-column: span 2; }
.span-full  { grid-column: 1 / -1; }

@media (max-width: 860px) {
	.si-grid { grid-template-columns: 1fr; }
	.span2   { grid-column: span 1; }
}

/* ── Panel ──────────────────────────────────────────────────────────────── */
.panel {
	background: #13120f; border: 1px solid #2d2b24; border-radius: 8px;
	padding: 0.9rem 1rem; overflow: hidden;
}
.panel h2 {
	font-size: 0.78rem; font-weight: 600; color: #d4c7a3;
	display: flex; align-items: center; gap: 0.4rem; margin: 0 0 0.85rem; flex-wrap: wrap;
}
.h2-badge {
	font-size: 0.62rem; padding: 0.1rem 0.4rem; border-radius: 999px;
	background: #2d2b24; color: #9ca3af;
}
.h2-sub { font-size: 0.65rem; color: #4b5563; font-weight: 400; }
.empty { font-size: 0.75rem; color: #374151; padding: 1.5rem 0; text-align: center; }

.no-data {
	display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
	padding: 4rem; color: #374151; font-size: 0.8rem;
}

/* ── Data table ─────────────────────────────────────────────────────────── */
.data-table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
.data-table th {
	padding: 0.35rem 0.5rem; text-align: left; font-size: 0.62rem;
	text-transform: uppercase; letter-spacing: 0.08em; color: #4b5563;
	border-bottom: 1px solid #2d2b24;
}
.data-table td { padding: 0.35rem 0.5rem; border-bottom: 1px solid #1a1914; vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.data-table tr:hover td { background: #1a1914; }
.r-cell { text-align: right; white-space: nowrap; }
.q-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
.q-cell.muted { color: #9ca3af; }
.mono { font-family: inherit; font-size: 0.7rem; color: #d4c7a3; }
.rank { color: #4b5563; font-size: 0.65rem; text-align: right; padding-right: 0.5rem; }
.sim-chip { font-size: 0.65rem; padding: 0.1rem 0.35rem; border-radius: 3px; font-weight: 600; }

/* ── Hot queries ────────────────────────────────────────────────────────── */
.query-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.query-list li {
	display: grid; grid-template-columns: 1.5rem 56px 1fr auto auto;
	align-items: center; gap: 0.5rem; font-size: 0.72rem;
}
.qbar-wrap { height: 5px; background: #1a1914; border-radius: 2px; overflow: hidden; }
.qbar-fill { height: 100%; background: #7c6ff7; border-radius: 2px; }
.q-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #d4c7a3; }
.q-hits { color: #7c6ff7; font-weight: 600; white-space: nowrap; min-width: 2.5rem; text-align: right; }

/* ── Trending ───────────────────────────────────────────────────────────── */
.trending-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; }
.trending-list li { display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; gap: 0.5rem; }
.t-query { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.t-right { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
.t-growth { font-weight: 700; font-size: 0.8rem; }
.t-meta { color: #6b7280; }

/* ── Variance pairs ─────────────────────────────────────────────────────── */
/* (uses .data-table) */

/* ── Did You Mean ───────────────────────────────────────────────────────── */
.dym-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.dym-list li { display: flex; flex-direction: column; gap: 0.2rem; }
.dym-btn {
	background: #7c6ff718; border: 1px solid #7c6ff740; color: #a89cf5;
	padding: 0.3rem 0.6rem; border-radius: 5px; font-size: 0.78rem; cursor: pointer; text-align: left;
	font-family: inherit;
}
.dym-btn:hover { background: #7c6ff730; }
.dym-meta { font-size: 0.68rem; color: #6b7280; display: flex; align-items: center; gap: 0.4rem; }
.src-badge { font-size: 0.62rem; padding: 0.05rem 0.3rem; border-radius: 3px; }
.src-badge.src-redis { background: #dc262640; color: #fca5a5; }
.src-badge.src-pg    { background: #2563eb40; color: #93c5fd; }

/* ── Pipeline memory ────────────────────────────────────────────────────── */
.pipeline-list { display: flex; flex-direction: column; gap: 0.85rem; }
.pip-row { display: flex; flex-direction: column; gap: 0.25rem; }
.pip-head { display: flex; align-items: center; gap: 0.4rem; }
.pip-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.pip-name { font-size: 0.75rem; font-weight: 600; flex: 1; }
.pip-score{ font-size: 0.68rem; font-weight: 600; }
.pip-hits { font-size: 0.68rem; color: #6b7280; }
.pip-bar-bg { height: 6px; background: #1a1914; border-radius: 3px; overflow: hidden; }
.pip-bar-fill { height: 100%; border-radius: 3px; min-width: 4px; }
.pip-meta { display: flex; gap: 0.75rem; font-size: 0.62rem; color: #4b5563; }
.top-chunk { display: flex; align-items: center; gap: 0.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Champions ──────────────────────────────────────────────────────────── */
.champ-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.65rem; }
.champ-list li { padding-bottom: 0.65rem; border-bottom: 1px solid #1a1914; }
.champ-list li:last-child { border-bottom: none; padding-bottom: 0; }
.champ-path { font-size: 0.72rem; color: #d4c7a3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 0.25rem; }
.champ-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; font-size: 0.68rem; color: #6b7280; }
.champ-hits { color: #9ca3af; }
.pip-count-badge { font-size: 0.65rem; font-weight: 700; color: #f59e0b; background: #f59e0b20; padding: 0.1rem 0.35rem; border-radius: 3px; }
.pipe-tags { display: flex; flex-wrap: wrap; gap: 0.2rem; }
.pipe-tags.sm .pipe-tag { font-size: 0.55rem; }
.pipe-tag { font-size: 0.6rem; padding: 0.05rem 0.25rem; border: 1px solid; border-radius: 3px; }

/* ── Cluster heatmap ────────────────────────────────────────────────────── */
.cluster-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.cluster-list li {
	display: grid; grid-template-columns: 20px 36px 1fr 46px 36px 52px;
	align-items: center; gap: 0.4rem; font-size: 0.72rem;
}
.c-expand-btn {
	background: none; border: none; padding: 0; cursor: pointer; color: #6b7280;
	display: flex; align-items: center; justify-content: center;
}
.c-expand-btn:hover { color: #f59e0b; }
.c-id    { color: #f59e0b; font-weight: 600; font-size: 0.68rem; }
.c-bar-bg { height: 5px; background: #1a1914; border-radius: 2px; overflow: hidden; }
.c-bar-fill { height: 100%; background: #f59e0b; border-radius: 2px; }
.c-hits  { text-align: right; }
.c-q     { text-align: right; }
.c-score { text-align: right; font-weight: 600; font-size: 0.68rem; }
.muted   { color: #6b7280; }

/* ── Cluster narrative ──────────────────────────────────────────────────── */
.cluster-narrative {
	display: block; grid-column: 1 / -1;
	background: #1a1914; border-radius: 6px; padding: 0.7rem 0.85rem;
	font-size: 0.72rem; line-height: 1.5; margin: 0.15rem 0 0.3rem;
}
.narr-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.4rem; }
.narr-header strong { color: #f5f5dc; font-size: 0.78rem; }
.btn-regen {
	display: inline-flex; align-items: center; gap: 0.3rem;
	background: none; border: 1px solid #333; border-radius: 4px;
	padding: 0.15rem 0.5rem; color: #9ca3af; font-size: 0.65rem; cursor: pointer;
}
.btn-regen:hover { border-color: #f59e0b; color: #f59e0b; }
.narr-summary { color: #d1d5db; margin-bottom: 0.5rem; }
.narr-section { margin-bottom: 0.4rem; }
.narr-label { display: block; color: #9ca3af; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.15rem; }
.narr-list { list-style: disc; padding-left: 1.2rem; margin: 0; color: #d1d5db; }
.narr-list li { margin-bottom: 0.1rem; }
.narr-list.mono li { font-family: monospace; font-size: 0.68rem; color: #a78bfa; }
.narr-list.warn li { color: #f59e0b; }
.narr-footer { font-size: 0.62rem; margin-top: 0.3rem; }
.error-text { color: #ef4444; }

/* ── Chunk quality ──────────────────────────────────────────────────────── */
.qs-bar-wrap { display: flex; align-items: center; gap: 0.4rem; justify-content: flex-end; }
.qs-bar { height: 4px; border-radius: 2px; min-width: 2px; max-width: 60px; }
.qs-val { font-size: 0.68rem; color: #9ca3af; min-width: 2.8rem; text-align: right; }

/* ── QLoRA tiers ────────────────────────────────────────────────────────── */
.tier-list { display: flex; flex-direction: column; gap: 0.7rem; margin-bottom: 0.85rem; }
.tier-row { display: grid; grid-template-columns: 90px 1fr auto; align-items: center; gap: 0.6rem; }
.tier-label { display: flex; align-items: center; gap: 0.35rem; }
.tier-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.tier-name { font-size: 0.75rem; }
.tier-bar-bg { height: 8px; background: #1a1914; border-radius: 4px; overflow: hidden; }
.tier-bar-fill { height: 100%; border-radius: 4px; min-width: 2px; }
.tier-stats { display: flex; flex-direction: column; align-items: flex-end; gap: 0.05rem; min-width: 76px; }
.tier-cnt   { font-size: 0.75rem; font-weight: 600; }
.tier-pct   { font-size: 0.6rem; }
.tier-score { font-size: 0.65rem; font-weight: 600; }
.stacked-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; gap: 1px; }
.stack-seg   { height: 100%; min-width: 2px; }

/* ── Distillation runner ────────────────────────────────────────────────── */
.distill-desc {
	font-size: 0.7rem; color: #6b7280; line-height: 1.6; margin: 0 0 1rem;
}
.distill-desc code {
	background: #1a1914; border: 1px solid #2d2b24; border-radius: 3px;
	padding: 0.1rem 0.3rem; font-family: inherit; color: #7c6ff7; font-size: 0.68rem;
}
.distill-fields { display: flex; gap: 1rem; margin-bottom: 0.85rem; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 0.3rem; }
.field span { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; }
.num-input {
	width: 80px; background: #0f0e0c; border: 1px solid #2d2b24; border-radius: 4px;
	padding: 0.3rem 0.5rem; font-family: inherit; font-size: 0.75rem; color: #d4c7a3;
}
.num-input:focus { outline: none; border-color: #7c6ff7; }
.distill-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.btn-distill {
	display: flex; align-items: center; gap: 0.3rem;
	padding: 0.3rem 0.7rem; border-radius: 4px; font-size: 0.72rem;
	font-family: inherit; cursor: pointer; border: 1px solid;
}
.btn-distill:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-distill.dry { border-color: #374151; background: transparent; color: #9ca3af; }
.btn-distill.run { border-color: #16a34a; background: #16a34a18; color: #4ade80; }
.btn-distill.run:hover:not(:disabled) { background: #16a34a30; }
.btn-distill.export { border-color: #7c6ff7; background: #7c6ff718; color: #a89ff7; text-decoration: none; }
.btn-distill.export:hover { background: #7c6ff730; }
.distill-result {
	display: flex; gap: 0.75rem; flex-wrap: wrap;
	padding: 0.45rem 0.7rem; background: #1a1914; border-radius: 4px; font-size: 0.7rem;
}
.dr-item { display: flex; align-items: center; gap: 0.25rem; color: #9ca3af; }
.dr-item.ok   { color: #4ade80; }
.dr-item.warn { color: #f59e0b; }
.distill-err {
	font-size: 0.7rem; color: #f87171; padding: 0.4rem 0.7rem;
	background: #7f1d1d18; border: 1px solid #7f1d1d40; border-radius: 4px;
}

/* ── DYM enhanced ───────────────────────────────────────────────────────── */
.dym-top { display: flex; align-items: center; gap: 0.4rem; }
.dym-bottom { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; margin-top: 0.2rem; }
.src-badge.src-qlora { background: #7c6ff740; color: #a89cf5; }
.tier-badge {
	font-size: 0.58rem; padding: 0.05rem 0.3rem; border-radius: 3px;
	font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
}
.tier-badge.tier-gold   { background: #f59e0b30; color: #f59e0b; border: 1px solid #f59e0b40; }
.tier-badge.tier-silver { background: #9ca3af30; color: #9ca3af; border: 1px solid #9ca3af40; }
.tier-badge.tier-bronze { background: #b4530930; color: #b45309; border: 1px solid #b4530940; }

/* ── Checkpoint validator ───────────────────────────────────────────────── */
.ckpt-fields { display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end; margin-bottom: 0.85rem; }
.ckpt-verdict {
	display: flex; flex-direction: column; gap: 0.5rem;
	padding: 0.75rem 1rem; border: 1px solid; border-radius: 6px; margin-bottom: 0.5rem;
}
.ckpt-badge {
	display: inline-flex; align-items: center;
	font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em;
	border: 1px solid; border-radius: 4px; padding: 0.2rem 0.6rem; align-self: flex-start;
}
.ckpt-scores {
	display: flex; align-items: center; gap: 0.75rem; font-size: 0.78rem; flex-wrap: wrap;
}
.ckpt-delta { font-weight: 700; font-size: 0.9rem; }
.ckpt-meta  { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }

/* ── Prompt leaderboard ─────────────────────────────────────────────────── */
.leader-controls {
	display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.85rem;
}
.leader-select {
	background: #0f0e0c; border: 1px solid #2d2b24; border-radius: 4px;
	padding: 0.25rem 0.5rem; font-family: inherit; font-size: 0.72rem; color: #d4c7a3;
	margin-left: 0.35rem;
}
.leader-select:focus { outline: none; border-color: #7c6ff7; }
.btn-leader-refresh {
	display: flex; align-items: center; gap: 0.3rem;
	padding: 0.25rem 0.6rem; border: 1px solid #374151; border-radius: 4px;
	background: transparent; color: #9ca3af; font-size: 0.72rem; font-family: inherit; cursor: pointer;
}
.btn-leader-refresh:hover:not(:disabled) { border-color: #f59e0b; color: #f59e0b; }
.btn-leader-refresh:disabled { opacity: 0.4; cursor: not-allowed; }
.leader-src-badge {
	font-size: 0.62rem; padding: 0.08rem 0.35rem; border-radius: 3px;
	background: #7c6ff718; border: 1px solid #7c6ff740; color: #a89cf5;
}
.leader-clicks {
	font-weight: 700; color: #f59e0b; font-size: 0.8rem;
}

/* ── Feedback legend ────────────────────────────────────────────────────── */
.feedback-legend { display: flex; flex-direction: column; gap: 0.75rem; }
.fl-row { display: flex; align-items: flex-start; gap: 0.75rem; }
.fl-icon { font-size: 1.25rem; flex-shrink: 0; width: 1.75rem; text-align: center; line-height: 1.3; }
.fl-icon.neutral { font-size: 1rem; color: #6b7280; }
.fl-text { display: flex; flex-direction: column; gap: 0.2rem; }
.fl-title { font-size: 0.72rem; font-weight: 600; color: #d4c7a3; }
.fl-desc { font-size: 0.67rem; color: #6b7280; line-height: 1.5; }
.fl-desc code {
	background: #1a1914; border: 1px solid #2d2b24; border-radius: 3px;
	padding: 0.05rem 0.25rem; font-family: inherit; color: #7c6ff7; font-size: 0.62rem;
}

/* ── Animations ─────────────────────────────────────────────────────────── */
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.7s linear infinite; display: inline-block; }

/* ── Research panel ────────────────────────────────────────────────────── */
.research-controls {
	display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap;
}
.ctrl-group { display: flex; flex-direction: column; gap: 0.25rem; }
.ctrl-label { font-size: 0.65rem; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
.ctrl-select, .ctrl-input {
	background: #181818; border: 1px solid #333; color: #ccc;
	padding: 0.3rem 0.5rem; border-radius: 4px; font-size: 0.75rem;
}
.ctrl-input { min-width: 240px; }
.cache-hint { font-size: 0.65rem; color: #555; margin-top: 0.5rem; }

.signal-row { display: flex; flex-wrap: wrap; gap: 1.25rem; }
.signal-group { display: flex; flex-direction: column; gap: 0.4rem; flex: 1; min-width: 180px; }
.signal-label { font-size: 0.65rem; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
.signal-list { margin: 0; padding-left: 1rem; list-style: disc; }
.signal-list li { font-size: 0.75rem; color: #aaa; margin-bottom: 0.2rem; }
.tag-cloud { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.hot-tag { background: #f59e0b18; border-color: #f59e0b40; color: #f59e0b; }

.research-card { cursor: pointer; transition: border-color 0.15s; }
.research-card:hover { border-color: #7c6ff740; }
.research-card.expanded { border-color: #7c6ff7; }

.rc-header { padding: 0; }
.rc-meta { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; flex-wrap: wrap; }
.rc-conf { font-size: 0.7rem; color: #a89cf5; font-weight: 600; }
.feedback-inline { display: flex; align-items: center; gap: 0.2rem; font-size: 0.65rem; color: #666; margin-left: auto; }
.rc-query { font-size: 0.8rem; color: #e0e0e0; line-height: 1.4; margin: 0 0 0.35rem; }
.rc-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; }

.rc-detail { border-top: 1px solid #2a2a2a; padding-top: 0.75rem; margin-top: 0.75rem; }
.rc-graph-summary { font-size: 0.72rem; color: #aaa; margin-bottom: 0.6rem; }
.rc-chain h4 { font-size: 0.7rem; color: #7c6ff7; margin: 0 0 0.4rem; display: flex; align-items: center; gap: 0.3rem; }
.chain-list { margin: 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }
.chain-step { display: flex; gap: 0.5rem; align-items: flex-start; }
.step-num {
	flex-shrink: 0; width: 1.2rem; height: 1.2rem; border-radius: 50%;
	background: #7c6ff720; border: 1px solid #7c6ff750;
	font-size: 0.6rem; color: #7c6ff7; display: flex; align-items: center; justify-content: center;
	font-weight: 700; margin-top: 0.1rem;
}
.step-text { font-size: 0.75rem; color: #ccc; line-height: 1.4; }
.chain-hint { font-size: 0.7rem; font-style: italic; margin: 0.3rem 0; }
.rc-pipelines { margin-top: 0.6rem; display: flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; }

.pipeline-badge { font-size: 0.58rem; padding: 0.1rem 0.4rem; border-radius: 3px; font-weight: 600; }
.pipeline-badge.ace      { background: #7c6ff718; border: 1px solid #7c6ff740; color: #a89cf5; }
.pipeline-badge.rag      { background: #3b82f618; border: 1px solid #3b82f640; color: #93c5fd; }
.pipeline-badge.kag      { background: #10b98118; border: 1px solid #10b98140; color: #6ee7b7; }
.pipeline-badge.dag      { background: #f59e0b18; border: 1px solid #f59e0b40; color: #fcd34d; }
.pipeline-badge.codebase { background: #ec489918; border: 1px solid #ec489940; color: #f9a8d4; }
.pipeline-badge.reranker { background: #f9731618; border: 1px solid #f9731640; color: #fdba74; }

.tier-badge { font-size: 0.58rem; padding: 0.1rem 0.4rem; border-radius: 3px; font-weight: 600; }
.tier-badge.platinum { background: #e2e8f018; border: 1px solid #e2e8f040; color: #e2e8f0; }
.tier-badge.gold     { background: #f59e0b18; border: 1px solid #f59e0b40; color: #fcd34d; }
.tier-badge.silver   { background: #9ca3af18; border: 1px solid #9ca3af40; color: #d1d5db; }
.tier-badge.bronze   { background: #b4530918; border: 1px solid #b4530930; color: #fbbf24; }

/* ── Corpus Search Panel ───────────────────────────────────────────────── */
.corpus-panel, .ingest-panel {
	margin-top: 1.5rem;
	padding: 1.25rem 1.5rem;
	background: rgba(30, 28, 22, 0.7);
	border: 1px solid #3a3520;
	border-radius: 6px;
}
.corpus-desc {
	font-size: 0.72rem;
	color: #a09070;
	margin: 0.25rem 0 1rem;
}
.corpus-desc code {
	background: #2a2618;
	padding: 0.1em 0.35em;
	border-radius: 3px;
	color: #c8b560;
}
.corpus-controls {
	display: flex;
	gap: 0.6rem;
	margin-bottom: 1rem;
}
.corpus-input {
	flex: 1;
	background: #1a1810;
	border: 1px solid #3a3520;
	border-radius: 4px;
	padding: 0.45rem 0.75rem;
	color: #d4c7a3;
	font-family: inherit;
	font-size: 0.8rem;
}
.corpus-input:focus { outline: none; border-color: #786030; }
.corpus-results { display: flex; flex-direction: column; gap: 0.75rem; }
.corpus-result {
	padding: 0.9rem 1rem;
	background: #16140e;
	border: 1px solid #2a2818;
	border-radius: 5px;
}
.corpus-result-header {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
	align-items: center;
	margin-bottom: 0.4rem;
}
.corpus-badge {
	font-size: 0.6rem;
	padding: 0.15rem 0.45rem;
	border-radius: 3px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
.corpus-badge.legal_canon_chunks { background: #1a3a1a; border: 1px solid #2a5a2a; color: #6bdd6b; }
.corpus-badge.court_opinions     { background: #1a1a3a; border: 1px solid #2a2a5a; color: #6b8bdd; }
.corpus-badge.documents          { background: #2a1a1a; border: 1px solid #4a2a2a; color: #dd8b6b; }
.juris-badge   { font-size: 0.6rem; padding: 0.1rem 0.35rem; border-radius: 2px; background: #2a2010; border: 1px solid #4a3818; color: #c8a040; font-weight: 700; }
.citation-badge { font-size: 0.6rem; padding: 0.1rem 0.4rem; border-radius: 2px; background: #201e14; border: 1px solid #3a3620; color: #b0a080; font-style: italic; }
.score-badge   { font-size: 0.6rem; padding: 0.1rem 0.3rem; border-radius: 2px; background: #0e1a1e; border: 1px solid #1a3040; color: #60b0d0; margin-left: auto; }
.section-path  { font-size: 0.65rem; color: #786840; margin: 0 0 0.3rem; font-style: italic; }
.corpus-summary { font-size: 0.76rem; color: #c0b090; line-height: 1.55; margin: 0 0 0.5rem; }

/* ── Corpus Ingestion Panel ────────────────────────────────────────────── */
.corpus-coverage { margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
.coverage-stat   { display: flex; align-items: center; gap: 0.75rem; font-size: 0.72rem; }
.cov-label   { width: 110px; color: #a09070; flex-shrink: 0; }
.cov-bar-wrap { flex: 1; max-width: 200px; height: 6px; background: #2a2618; border-radius: 3px; overflow: hidden; }
.cov-bar     { height: 100%; background: linear-gradient(90deg, #786030, #c8a040); border-radius: 3px; transition: width 0.4s ease; }
.cov-pct     { width: 36px; text-align: right; color: #c8a040; font-weight: 600; }
.cov-detail  { color: #786840; font-size: 0.68rem; }
.ingest-controls { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin-top: 0.75rem; }
.ingest-result {
	margin-top: 0.75rem;
	padding: 0.6rem 0.9rem;
	border-radius: 4px;
	font-size: 0.74rem;
}
.ingest-result.success { background: #0e1e10; border: 1px solid #1e4a20; color: #6bdd6b; }
.ingest-result.skip    { background: #1a1a0e; border: 1px solid #3a3a20; color: #a0a060; }
.ingest-result.fail    { background: #1e0e0e; border: 1px solid #4a1a1a; color: #dd6b6b; }

/* ── Summaries browser wrapper ─────────────────────────────────────────── */
.summaries-browser-wrap {
	padding: 0.75rem 0;
	min-height: 400px;
}
.panel-sub {
	font-size: 0.72rem;
	color: #6b7280;
	margin-top: 0.25rem;
	line-height: 1.5;
}
</style>
