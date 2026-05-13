<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	// ── Types ─────────────────────────────────────────────────────────────────

	interface SvcStatus {
		up: boolean;
		latencyMs?: number;
		error?: string;
	}

	interface ObsData {
		ok: boolean;
		generatedAt: string;
		services: Record<string, SvcStatus>;
		graphify: {
			codebaseGraphExists: boolean;
			codebaseMapExists: boolean;
			authorityScoresExists: boolean;
			rerankPayloadsExists: boolean;
			dailyLogAge: string | null;
			graphJsonAge: string | null;
			healthSnapshot: {
				generatedAt: string | null;
				wikiNoteCount: number;
				glyphCount: number;
				agentsMdCount: number;
				gemma4Coverage: number;
				bowClusterTiles: number;
				qdrantReachable: boolean;
				aceSmokeWikiOk: boolean;
				aceSmokeGlyphOk: boolean;
			} | null;
		};
		qdrantFeedback: {
			codebaseChunksPresent: boolean;
			codebaseChunkCount: number | null;
			authorityWritebackNote: string;
			rerankFeedbackNote: string;
			missingColumns: string[];
		};
		ace: {
			aceTopkCachedQueries: number;
			aceHitsCachedQueries: number;
			aceAuthorityPresent: boolean;
			manifoldClusterCount: number;
			somWeightsPresent: boolean;
			coveredClusters: number;
			coveredSomNodes: number;
			totalSummaries: number;
			lanesAvailable: string[];
			glyphClusterLanePresent: boolean;
		};
		synthesisMemory: {
			collection: string;
			available: boolean;
			approximateCount: number | null;
		};
		hyperrag: {
			latest: {
				query: string;
				ts: string;
				cluster: { id: number; label: string } | null;
				turbovecPrefilter: boolean;
				results: Array<{ id: string; score: number; lanes: string[]; filePath: string }>;
				bitfrostSummary?: string;
			} | null;
			logAge: string | null;
		};
		recommendations: Array<{ id: number; category: string; severity: string; title: string }>;
		recsTotal: number;
		recsGeneratedAt: string | null;
	}

	// ── State ─────────────────────────────────────────────────────────────────

	let data      = $state<ObsData | null>(null);
	let loading   = $state(true);
	let error     = $state<string | null>(null);
	let lastFetch = $state<string | null>(null);
	let polling   = $state(false);
	let timer: ReturnType<typeof setInterval> | undefined;

	const SERVICE_LABELS: Record<string, string> = {
		redis:       'Redis',
		postgres:    'Postgres',
		qdrant:      'Qdrant',
		neo4j:       'Neo4j',
		mcp:         'MCP Trace',
		goRetrieval: 'Go Retrieval',
		goSearch:    'Go Search',
		topology:    'Topology',
		turboQuant:  'TurboQuant',
		turboVec:    'TurboVec RTX',
	};

	// ── Fetch ─────────────────────────────────────────────────────────────────

	async function fetchStatus() {
		polling = true;
		try {
			const res = await fetch('/api/admin/observability', { signal: AbortSignal.timeout(10_000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			data      = await res.json() as ObsData;
			lastFetch = new Date().toLocaleTimeString();
			error     = null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading  = false;
			polling  = false;
		}
	}

	onMount(() => {
		fetchStatus();
		timer = setInterval(fetchStatus, 30_000);
	});

	onDestroy(() => { if (timer) clearInterval(timer); });

	// ── Helpers ───────────────────────────────────────────────────────────────

	function dot(up: boolean | undefined) {
		return up ? 'dot-green' : 'dot-red';
	}

	function check(ok: boolean) {
		return ok ? '✓' : '✗';
	}

	function severity(s: string) {
		if (s === 'high' || s === 'critical') return 'sev-high';
		if (s === 'medium') return 'sev-med';
		return 'sev-low';
	}

	function servicesUp(svcs: Record<string, SvcStatus> | undefined): number {
		if (!svcs) return 0;
		return Object.values(svcs).filter(s => s.up).length;
	}
</script>

<div class="obs-page">
	<header class="obs-header">
		<div>
			<p class="eyebrow">Admin / Observability</p>
			<h1>Graph · Search · ACE Feedback Spine</h1>
			<p class="subtitle">Read-only health snapshot — auto-refreshes every 30s</p>
		</div>
		<div class="header-right">
			{#if lastFetch}
				<span class="last-fetch">Last: {lastFetch}</span>
			{/if}
			<button class="refresh-btn" onclick={fetchStatus} disabled={polling}>
				<Icon name="refresh-cw" class="w-3.5 h-3.5 {polling ? 'animate-spin' : ''}" />
				{polling ? 'Refreshing…' : 'Refresh'}
			</button>
		</div>
	</header>

	{#if loading}
		<div class="loading-msg">
			<Icon name="loader" class="w-5 h-5 animate-spin" />
			Probing services…
		</div>
	{:else if error}
		<div class="error-msg">
			<Icon name="alert-triangle" class="w-4 h-4" />
			{error}
		</div>
	{:else if data}
		<div class="cards-grid">

			<!-- ── Service Health ──────────────────────────────────────────── -->
			<section class="card">
				<h2 class="card-title">
					<Icon name="activity" class="w-4 h-4" />
					Service Health
					<span class="badge">{servicesUp(data.services)}/{Object.keys(data.services).length} up</span>
				</h2>
				<ul class="svc-list">
					{#each Object.entries(data.services) as [key, svc]}
						<li class="svc-row">
							<span class="dot {dot(svc.up)}"></span>
							<span class="svc-name">{SERVICE_LABELS[key] ?? key}</span>
							<span class="svc-lat">{svc.latencyMs != null ? `${svc.latencyMs}ms` : '—'}</span>
							{#if svc.error}
								<span class="svc-err" title={svc.error}>⚠</span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>

			<!-- ── Graphify Status ─────────────────────────────────────────── -->
			<section class="card">
				<h2 class="card-title">
					<Icon name="git-branch" class="w-4 h-4" />
					Graphify Status
					{#if data.graphify.dailyLogAge}
						<span class="badge neutral">daily {data.graphify.dailyLogAge}</span>
					{/if}
				</h2>
				<ul class="check-list">
					<li><span class="{data.graphify.codebaseGraphExists ? 'ok' : 'fail'}">{check(data.graphify.codebaseGraphExists)}</span> codebase-graph.json {#if data.graphify.graphJsonAge}<span class="muted">({data.graphify.graphJsonAge})</span>{/if}</li>
					<li><span class="{data.graphify.codebaseMapExists ? 'ok' : 'fail'}">{check(data.graphify.codebaseMapExists)}</span> codebase-map.md</li>
					<li><span class="{data.graphify.authorityScoresExists ? 'ok' : 'fail'}">{check(data.graphify.authorityScoresExists)}</span> authority scores in Redis</li>
					<li><span class="{data.graphify.rerankPayloadsExists ? 'ok' : 'fail'}">{check(data.graphify.rerankPayloadsExists)}</span> Qdrant codebase_chunks_768 reachable</li>
				</ul>
				{#if data.graphify.healthSnapshot}
					{@const snap = data.graphify.healthSnapshot}
					<div class="snap-grid">
						<div class="snap-item">
							<span class="snap-val">{snap.wikiNoteCount.toLocaleString()}</span>
							<span class="snap-lbl">wiki notes</span>
						</div>
						<div class="snap-item">
							<span class="snap-val">{snap.glyphCount.toLocaleString()}</span>
							<span class="snap-lbl">glyphs</span>
						</div>
						<div class="snap-item">
							<span class="snap-val">{snap.agentsMdCount}</span>
							<span class="snap-lbl">AGENTS.md</span>
						</div>
						<div class="snap-item">
							<span class="snap-val">{snap.gemma4Coverage}%</span>
							<span class="snap-lbl">Gemma4 cov.</span>
						</div>
					</div>
					{#if snap.generatedAt}
						<p class="snap-ts muted">Snapshot: {new Date(snap.generatedAt).toLocaleString()}</p>
					{/if}
				{/if}
			</section>

			<!-- ── Qdrant Feedback ─────────────────────────────────────────── -->
			<section class="card">
				<h2 class="card-title">
					<Icon name="database" class="w-4 h-4" />
					Qdrant Feedback
				</h2>
				<ul class="check-list">
					<li>
						<span class="{data.qdrantFeedback.codebaseChunksPresent ? 'ok' : 'fail'}">{check(data.qdrantFeedback.codebaseChunksPresent)}</span>
						codebase_chunks_768
						{#if data.qdrantFeedback.codebaseChunkCount != null}
							<span class="muted">({data.qdrantFeedback.codebaseChunkCount.toLocaleString()} pts)</span>
						{/if}
					</li>
					<li>
						<span class="{data.ace.aceAuthorityPresent ? 'ok' : 'warn'}">
							{data.ace.aceAuthorityPresent ? '✓' : '⚠'}
						</span>
						{data.qdrantFeedback.authorityWritebackNote}
					</li>
				</ul>
				<p class="card-note muted">{data.qdrantFeedback.rerankFeedbackNote}</p>
				{#if data.qdrantFeedback.missingColumns.length}
					<ul class="warn-list">
						{#each data.qdrantFeedback.missingColumns as col}
							<li>⚠ {col}</li>
						{/each}
					</ul>
				{/if}
				<div class="stat-row">
					<div class="stat-item">
						<span class="stat-val">{data.ace.aceTopkCachedQueries}</span>
						<span class="stat-lbl">ace:topk keys</span>
					</div>
					<div class="stat-item">
						<span class="stat-val">{data.ace.aceHitsCachedQueries}</span>
						<span class="stat-lbl">ace:hits keys</span>
					</div>
				</div>
			</section>

			<!-- ── ACE Retrieval Lanes ─────────────────────────────────────── -->
			<section class="card">
				<h2 class="card-title">
					<Icon name="layers" class="w-4 h-4" />
					ACE Retrieval Lanes
					{#if data.ace.glyphClusterLanePresent}
						<span class="badge ok">glyph_cluster ✓</span>
					{/if}
				</h2>
				<ul class="lane-list">
					{#each data.ace.lanesAvailable as lane}
						<li class="lane-tag">{lane}</li>
					{/each}
				</ul>
				<div class="stat-row mt-2">
					<div class="stat-item">
						<span class="stat-val">{data.ace.manifoldClusterCount}</span>
						<span class="stat-lbl">manifold clusters</span>
					</div>
					<div class="stat-item">
						<span class="stat-val {data.ace.somWeightsPresent ? 'ok' : 'fail'}">{data.ace.somWeightsPresent ? 'YES' : 'NO'}</span>
						<span class="stat-lbl">SOM grid</span>
					</div>
					<div class="stat-item">
						<span class="stat-val {data.ace.aceAuthorityPresent ? 'ok' : 'fail'}">{data.ace.aceAuthorityPresent ? 'YES' : 'NO'}</span>
						<span class="stat-lbl">authority</span>
					</div>
				</div>
				<div class="stat-row mt-2">
					<div class="stat-item" title="Manifold clusters with at least one summary">
						<span class="stat-val">{data.ace.coveredClusters}</span>
						<span class="stat-lbl">covered clusters</span>
					</div>
					<div class="stat-item" title="SOM grid nodes with at least one summary">
						<span class="stat-val">{data.ace.coveredSomNodes}</span>
						<span class="stat-lbl">covered nodes</span>
					</div>
					<div class="stat-item">
						<span class="stat-val">{data.ace.totalSummaries.toLocaleString()}</span>
						<span class="stat-lbl">summaries</span>
					</div>
				</div>
			</section>

			<!-- ── HyperRAG & RTX Sidecar ──────────────────────────────────── -->
			<section class="card card-wide">
				<h2 class="card-title">
					<Icon name="zap" class="w-4 h-4" />
					HyperRAG & RTX Sidecar
					{#if data.hyperrag.logAge}
						<span class="badge neutral">latest {data.hyperrag.logAge}</span>
					{/if}
				</h2>
				{#if data.hyperrag.latest}
					<div class="hyperrag-summary">
						<div class="query-box">
							<span class="muted">Latest Query:</span>
							<code class="query-text">"{data.hyperrag.latest.query}"</code>
						</div>
						<div class="hyperrag-stats">
							<div class="stat-item">
								<span class="stat-val {data.hyperrag.latest.turbovecPrefilter ? 'ok' : 'fail'}">
									{data.hyperrag.latest.turbovecPrefilter ? 'ACTIVE' : 'OFF'}
								</span>
								<span class="stat-lbl">TurboVec</span>
							</div>
							<div class="stat-item">
								<span class="stat-val">{data.hyperrag.latest.cluster?.id ?? 'none'}</span>
								<span class="stat-lbl">manifold cluster</span>
							</div>
							<div class="stat-item">
								<span class="stat-val">{data.hyperrag.latest.results.length}</span>
								<span class="stat-lbl">retrieved</span>
							</div>
						</div>
					</div>
					<div class="mini-results mt-2">
						{#each data.hyperrag.latest.results.slice(0, 3) as res}
							<div class="mini-res-row">
								<span class="score">{res.score.toFixed(3)}</span>
								<span class="lanes">{res.lanes.join('+')}</span>
								<span class="path truncate">{res.filePath.split('/').pop()}</span>
							</div>
						{/each}
					</div>
					{#if data.hyperrag.latest.bitfrostSummary}
						<div class="bitfrost-box mt-3">
							<p class="bitfrost-text">{data.hyperrag.latest.bitfrostSummary}</p>
						</div>
					{/if}
				{:else}
					<p class="muted">No HyperRAG logs found. Run hyperrag-dense-multiquery to populate.</p>
				{/if}
			</section>

			<!-- ── Synthesis Memory ────────────────────────────────────────── -->
			<section class="card">
				<h2 class="card-title">
					<Icon name="brain" class="w-4 h-4" />
					Synthesis Memory
				</h2>
				<ul class="check-list">
					<li>
						<span class="{data.synthesisMemory.available ? 'ok' : 'fail'}">{check(data.synthesisMemory.available)}</span>
						{data.synthesisMemory.collection}
						{#if data.synthesisMemory.approximateCount != null}
							<span class="muted">({data.synthesisMemory.approximateCount.toLocaleString()} pts)</span>
						{:else if !data.synthesisMemory.available}
							<span class="muted">(collection not found)</span>
						{/if}
					</li>
					<li>
						<span class="{data.synthesisMemory.available ? 'ok' : 'warn'}">{data.synthesisMemory.available ? '✓' : '⚠'}</span>
						{data.synthesisMemory.available ? 'Ready for ACE wiki encoding' : 'Run research-to-wiki-encoder to populate'}
					</li>
				</ul>
			</section>

			<!-- ── Recommendations ────────────────────────────────────────── -->
			<section class="card card-wide">
				<h2 class="card-title">
					<Icon name="lightbulb" class="w-4 h-4" />
					Stale Gaps / Recommendations
					{#if data.recsTotal}
						<span class="badge neutral">{data.recsTotal} total</span>
					{/if}
					{#if data.recsGeneratedAt}
						<span class="muted text-xs">{new Date(data.recsGeneratedAt).toLocaleDateString()}</span>
					{/if}
				</h2>
				{#if data.recommendations.length}
					<ul class="rec-list">
						{#each data.recommendations as rec}
							<li class="rec-row">
								<span class="rec-sev {severity(rec.severity)}">{rec.severity}</span>
								<span class="rec-cat muted">{rec.category}</span>
								<span class="rec-title">{rec.title}</span>
							</li>
						{/each}
					</ul>
					{#if data.recsTotal > data.recommendations.length}
						<p class="muted text-xs mt-1">+{data.recsTotal - data.recommendations.length} more in docs/graph/recommendations.json</p>
					{/if}
				{:else}
					<p class="muted">No recommendations on record.</p>
				{/if}
			</section>

		</div>

		<p class="footer-note muted">
			Snapshot taken {new Date(data.generatedAt).toLocaleString()} · read-only · no writes
		</p>
	{/if}
</div>

<style>
	.obs-page { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }
	.obs-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap; }
	.eyebrow { font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.5; margin-bottom: 0.25rem; }
	h1 { font-size: 1.4rem; font-weight: 600; margin: 0; }
	.subtitle { font-size: 0.8rem; opacity: 0.5; margin-top: 0.25rem; }
	.header-right { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
	.last-fetch { font-size: 0.7rem; opacity: 0.5; }
	.refresh-btn { display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.8rem; font-size: 0.75rem; border-radius: 6px; border: 1px solid rgba(212,199,163,0.2); background: rgba(212,199,163,0.06); cursor: pointer; transition: background 0.15s; }
	.refresh-btn:hover:not(:disabled) { background: rgba(212,199,163,0.12); }
	.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	.loading-msg, .error-msg { display: flex; align-items: center; gap: 0.5rem; padding: 1.5rem; opacity: 0.7; font-size: 0.9rem; }
	.error-msg { color: #f87171; }

	.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
	.card { background: rgba(212,199,163,0.04); border: 1px solid rgba(212,199,163,0.12); border-radius: 8px; padding: 1rem; }
	.card-wide { grid-column: 1 / -1; }

	.card-title { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; font-weight: 600; margin: 0 0 0.75rem 0; }
	.badge { margin-left: 0.4rem; font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 400; background: rgba(212,199,163,0.1); }
	.badge.ok { background: rgba(74,222,128,0.15); color: #4ade80; }
	.badge.neutral { background: rgba(212,199,163,0.1); }

	/* service list */
	.svc-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.3rem; }
	.svc-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; }
	.svc-name { flex: 1; }
	.svc-lat { font-size: 0.7rem; opacity: 0.5; }
	.svc-err { color: #fbbf24; cursor: help; }
	.dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
	.dot-green { background: #4ade80; }
	.dot-red { background: #f87171; }

	/* check list */
	.check-list { list-style: none; padding: 0; margin: 0 0 0.5rem 0; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.78rem; }
	.check-list li { display: flex; align-items: baseline; gap: 0.4rem; }
	.ok   { color: #4ade80; font-weight: 700; }
	.fail { color: #f87171; font-weight: 700; }
	.warn { color: #fbbf24; font-weight: 700; }
	.muted { opacity: 0.5; font-size: 0.72rem; }

	/* snap grid */
	.snap-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-top: 0.75rem; }
	.snap-item { text-align: center; background: rgba(212,199,163,0.05); border-radius: 6px; padding: 0.4rem 0.25rem; }
	.snap-val { display: block; font-size: 1rem; font-weight: 700; }
	.snap-lbl { display: block; font-size: 0.6rem; opacity: 0.5; }
	.snap-ts { margin-top: 0.4rem; font-size: 0.68rem; }

	/* stat row */
	.stat-row { display: flex; gap: 0.75rem; margin-top: 0.5rem; }
	.stat-item { text-align: center; background: rgba(212,199,163,0.05); border-radius: 6px; padding: 0.4rem 0.75rem; min-width: 60px; }
	.stat-val { display: block; font-size: 1rem; font-weight: 700; }
	.stat-lbl { display: block; font-size: 0.6rem; opacity: 0.5; }
	.mt-2 { margin-top: 0.5rem; }

	/* lanes */
	.lane-list { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.lane-tag { font-size: 0.68rem; padding: 0.15rem 0.5rem; border-radius: 4px; background: rgba(212,199,163,0.08); border: 1px solid rgba(212,199,163,0.15); font-family: monospace; }

	/* hyperrag */
	.hyperrag-summary { display: flex; flex-direction: column; gap: 0.75rem; }
	.query-box { background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 4px; border: 1px solid rgba(212,199,163,0.1); }
	.query-text { font-size: 0.75rem; color: #d4c7a3; }
	.hyperrag-stats { display: flex; gap: 1rem; }
	.mini-results { display: flex; flex-direction: column; gap: 0.2rem; background: rgba(0,0,0,0.1); padding: 0.4rem; border-radius: 4px; }
	.mini-res-row { display: flex; align-items: center; gap: 0.75rem; font-size: 0.7rem; font-family: monospace; }
	.score { color: #4ade80; font-weight: 700; width: 45px; }
	.lanes { color: #fbbf24; width: 100px; }
	.path { opacity: 0.6; }
	.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	/* recs */
	.rec-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
	.rec-row { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.78rem; }
	.rec-sev { font-size: 0.65rem; font-weight: 700; padding: 0.1rem 0.35rem; border-radius: 3px; text-transform: uppercase; flex-shrink: 0; }
	.sev-high { background: rgba(248,113,113,0.2); color: #f87171; }
	.sev-med  { background: rgba(251,191,36,0.2);  color: #fbbf24; }
	.sev-low  { background: rgba(212,199,163,0.1); }
	.rec-cat  { flex-shrink: 0; min-width: 80px; }
	.rec-title { opacity: 0.85; }

	.warn-list { list-style: none; padding: 0; margin: 0.4rem 0; font-size: 0.75rem; color: #fbbf24; }
	.card-note { margin-top: 0.3rem; }
	.footer-note { font-size: 0.68rem; margin-top: 1.5rem; text-align: center; }
	.text-xs { font-size: 0.68rem; }
	.mt-1 { margin-top: 0.25rem; }
	.mt-3 { margin-top: 0.75rem; }

	.bitfrost-box {
		background: rgba(56, 189, 248, 0.05);
		border-left: 2px solid #38bdf8;
		padding: 0.75rem;
		border-radius: 0 4px 4px 0;
	}
	.bitfrost-text {
		font-size: 0.82rem;
		line-height: 1.5;
		color: #e2e8f0;
		font-style: italic;
		margin: 0;
	}
</style>
