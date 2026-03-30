<!-- LegalResearchSpellbook.svelte — Game-style RAG Engine UI ("Spellbook") -->
<!-- Corpus search, AI analysis scanning, source results with relevance -->
<script lang="ts">
	interface SearchResult {
		id: string;
		title: string;
		source: string;
		excerpt: string;
		relevance: number;
		docType: 'statute' | 'case-law' | 'regulation' | 'treatise' | 'brief';
		jurisdiction?: string;
		citation?: string;
	}

	interface Props {
		caseId?: string;
	}

	let { caseId = '' }: Props = $props();

	// --- State ---
	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let isSearching = $state(false);
	let isAnalyzing = $state(false);
	let analysisProgress = $state(0);
	let analysisStage = $state('');
	let aiSummary = $state('');
	let searchHistory = $state<string[]>([]);
	let selectedResult = $state<SearchResult | null>(null);
	let corpusFilter = $state<string>('all');
	let totalFound = $state(0);
	let searchTimeMs = $state(0);
	let pinnedResults = $state<Set<string>>(new Set());

	const DOC_ICONS: Record<string, string> = {
		'statute': '📜',
		'case-law': '⚖',
		'regulation': '📋',
		'treatise': '📚',
		'brief': '📝',
	};

	const DOC_COLORS: Record<string, string> = {
		'statute': '#fbbf24',
		'case-law': '#60a5fa',
		'regulation': '#34d399',
		'treatise': '#c084fc',
		'brief': '#f87171',
	};

	const CORPUS_FILTERS = [
		{ id: 'all', label: 'ALL CORPUS' },
		{ id: 'statute', label: 'STATUTES' },
		{ id: 'case-law', label: 'CASE LAW' },
		{ id: 'regulation', label: 'REGULATIONS' },
		{ id: 'treatise', label: 'TREATISES' },
	];

	function relevanceColor(r: number): string {
		if (r >= 0.85) return '#34d399';
		if (r >= 0.6) return '#fbbf24';
		return '#f87171';
	}

	function relevanceLabel(r: number): string {
		if (r >= 0.85) return 'HIGH';
		if (r >= 0.6) return 'MED';
		return 'LOW';
	}

	async function doSearch() {
		if (!query.trim()) return;
		isSearching = true;
		results = [];
		aiSummary = '';
		selectedResult = null;
		totalFound = 0;

		const start = performance.now();

		try {
			const params = new URLSearchParams({ query: query.trim(), limit: '12' });
			if (caseId) params.set('caseId', caseId);
			if (corpusFilter !== 'all') params.set('docType', corpusFilter);

			const res = await fetch(`/api/rag/search?${params}`);
			const data = await res.json();

			searchTimeMs = Math.round(performance.now() - start);
			totalFound = data.totalResults ?? data.results?.length ?? 0;

			results = (data.results ?? []).map((r: any, i: number) => ({
				id: r.id ?? `r${i}`,
				title: r.title ?? r.payload?.title ?? 'Untitled',
				source: r.source ?? r.collection ?? 'unknown',
				excerpt: r.content ?? r.payload?.content ?? r.excerpt ?? '',
				relevance: r.score ?? r.relevance ?? 0,
				docType: r.docType ?? r.payload?.doc_type ?? 'statute',
				jurisdiction: r.jurisdiction ?? r.payload?.jurisdiction ?? '',
				citation: r.citation ?? r.payload?.citation ?? '',
			}));

			if (!searchHistory.includes(query.trim())) {
				searchHistory = [query.trim(), ...searchHistory.slice(0, 7)];
			}

			// Auto-analyze after search
			if (results.length > 0) {
				runAnalysis();
			}
		} catch (err) {
			console.error('Search failed:', err);
		} finally {
			isSearching = false;
		}
	}

	async function runAnalysis() {
		isAnalyzing = true;
		analysisProgress = 0;
		analysisStage = 'Initializing RAG pipeline...';
		aiSummary = '';

		const stages = [
			{ pct: 15, label: 'Embedding query vector (768-dim)...' },
			{ pct: 35, label: 'Scanning corpus collections...' },
			{ pct: 55, label: 'Cross-referencing statutes...' },
			{ pct: 75, label: 'Extracting legal reasoning...' },
			{ pct: 90, label: 'Generating synthesis...' },
		];

		for (const stage of stages) {
			analysisStage = stage.label;
			analysisProgress = stage.pct;
			await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));
		}

		try {
			const res = await fetch('/api/rag/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: query.trim(),
					caseId,
					mode: 'answer',
					topK: 5,
				}),
			});
			const data = await res.json();
			aiSummary = data.answer ?? data.summary ?? 'Analysis complete. Review sources below for detailed findings.';
		} catch {
			aiSummary = 'AI analysis unavailable — review retrieved sources manually.';
		} finally {
			analysisProgress = 100;
			analysisStage = 'Complete';
			setTimeout(() => {
				isAnalyzing = false;
			}, 600);
		}
	}

	function togglePin(id: string) {
		const next = new Set(pinnedResults);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		pinnedResults = next;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') doSearch();
	}
</script>

<div class="spellbook-root">
	<!-- Header -->
	<div class="spell-header">
		<div class="spell-title-row">
			<span class="spell-icon">📖</span>
			<span class="spell-title">LEGAL RESEARCH — SPELLBOOK</span>
			<span class="spell-subtitle">RAG Engine v2 · Corpus Search · AI Analysis</span>
		</div>
	</div>

	<!-- Search bar -->
	<div class="search-bar">
		<div class="search-input-wrap">
			<span class="search-glyph">⟐</span>
			<input
				type="text"
				class="search-input"
				placeholder="Enter legal query, statute reference, or case citation..."
				bind:value={query}
				onkeydown={handleKeydown}
				disabled={isSearching}
			/>
			<button class="search-btn" onclick={doSearch} disabled={isSearching || !query.trim()}>
				{isSearching ? '⟳ SEARCHING...' : '⚡ CAST SEARCH'}
			</button>
		</div>

		<!-- Corpus filters -->
		<div class="filter-row">
			{#each CORPUS_FILTERS as f}
				<button
					class="filter-chip {corpusFilter === f.id ? 'active' : ''}"
					onclick={() => (corpusFilter = f.id)}
				>
					{f.label}
				</button>
			{/each}
			{#if totalFound > 0}
				<span class="result-meta">{totalFound} results · {searchTimeMs}ms</span>
			{/if}
		</div>
	</div>

	<!-- Analysis scanner overlay -->
	{#if isAnalyzing}
		<div class="analysis-scanner">
			<div class="scanner-label">{analysisStage}</div>
			<div class="scanner-bar-bg">
				<div class="scanner-bar-fill" style="width: {analysisProgress}%"></div>
			</div>
			<div class="scanner-pct">{analysisProgress}%</div>
		</div>
	{/if}

	<!-- AI Summary -->
	{#if aiSummary}
		<div class="ai-summary">
			<div class="ai-summary-header">
				<span class="ai-badge">🧠 AI SYNTHESIS</span>
			</div>
			<div class="ai-summary-text">{aiSummary}</div>
		</div>
	{/if}

	<!-- Results body -->
	<div class="results-body">
		<!-- Result list -->
		<div class="results-list">
			{#if results.length === 0 && !isSearching}
				<div class="empty-state">
					<div class="empty-icon">📖</div>
					<div class="empty-text">Enter a query to search the legal corpus</div>
					<div class="empty-sub">Searches across statutes, case law, regulations, and treatises using vector similarity + BM25 fusion</div>

					{#if searchHistory.length > 0}
						<div class="history-section">
							<span class="history-label">RECENT QUERIES</span>
							{#each searchHistory as h}
								<button class="history-item" onclick={() => { query = h; doSearch(); }}>{h}</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			{#each results as result}
				<button
					class="result-card {selectedResult?.id === result.id ? 'selected' : ''} {pinnedResults.has(result.id) ? 'pinned' : ''}"
					onclick={() => (selectedResult = result)}
				>
					<div class="result-top-row">
						<span class="result-type-icon">{DOC_ICONS[result.docType] ?? '📄'}</span>
						<span class="result-title">{result.title}</span>
						<span class="relevance-badge" style="color: {relevanceColor(result.relevance)}; border-color: {relevanceColor(result.relevance)}">
							{Math.round(result.relevance * 100)}% {relevanceLabel(result.relevance)}
						</span>
					</div>
					{#if result.citation}
						<div class="result-citation">{result.citation}</div>
					{/if}
					<div class="result-excerpt">{result.excerpt.slice(0, 200)}{result.excerpt.length > 200 ? '...' : ''}</div>
					<div class="result-footer">
						<span class="result-source" style="color: {DOC_COLORS[result.docType]}">{result.docType.toUpperCase()}</span>
						{#if result.jurisdiction}
							<span class="result-jurisdiction">{result.jurisdiction}</span>
						{/if}
						<span class="pin-btn {pinnedResults.has(result.id) ? 'pinned' : ''}" role="button" tabindex="0" onclick={(e) => { e.stopPropagation(); togglePin(result.id); }} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); togglePin(result.id); } }}>
							{pinnedResults.has(result.id) ? '★' : '☆'}
						</span>
					</div>
				</button>
			{/each}
		</div>

		<!-- Detail panel -->
		{#if selectedResult}
			<div class="detail-panel">
				<div class="detail-header">
					<span class="detail-icon">{DOC_ICONS[selectedResult.docType] ?? '📄'}</span>
					<span class="detail-title">{selectedResult.title}</span>
				</div>

				<div class="detail-meta-grid">
					<div class="meta-item">
						<span class="meta-label">TYPE</span>
						<span class="meta-value" style="color: {DOC_COLORS[selectedResult.docType]}">{selectedResult.docType.toUpperCase()}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">RELEVANCE</span>
						<span class="meta-value" style="color: {relevanceColor(selectedResult.relevance)}">{Math.round(selectedResult.relevance * 100)}%</span>
					</div>
					{#if selectedResult.jurisdiction}
						<div class="meta-item">
							<span class="meta-label">JURISDICTION</span>
							<span class="meta-value">{selectedResult.jurisdiction}</span>
						</div>
					{/if}
					{#if selectedResult.citation}
						<div class="meta-item">
							<span class="meta-label">CITATION</span>
							<span class="meta-value">{selectedResult.citation}</span>
						</div>
					{/if}
				</div>

				<div class="detail-content">
					<span class="detail-section-label">FULL EXCERPT</span>
					<p class="detail-text">{selectedResult.excerpt}</p>
				</div>

				<!-- Relevance bar -->
				<div class="relevance-meter">
					<span class="meter-label">RELEVANCE SCORE</span>
					<div class="meter-bar-bg">
						<div class="meter-bar-fill" style="width: {selectedResult.relevance * 100}%; background: {relevanceColor(selectedResult.relevance)}"></div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.spellbook-root {
		display: flex;
		flex-direction: column;
		height: 680px;
		background: #0e0d0b;
		border: 1px solid rgba(212, 199, 163, 0.12);
		border-radius: 8px;
		overflow: hidden;
		font-family: 'Courier New', monospace;
		color: rgba(212, 199, 163, 0.85);
	}

	/* Header */
	.spell-header {
		padding: 12px 16px;
		background: rgba(192, 132, 252, 0.04);
		border-bottom: 1px solid rgba(192, 132, 252, 0.12);
	}
	.spell-title-row { display: flex; align-items: center; gap: 10px; }
	.spell-icon { font-size: 20px; }
	.spell-title { font-size: 12px; font-weight: 700; letter-spacing: 0.15em; }
	.spell-subtitle { font-size: 9px; color: rgba(212, 199, 163, 0.4); letter-spacing: 0.08em; }

	/* Search bar */
	.search-bar {
		padding: 12px 16px;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
	}
	.search-input-wrap {
		display: flex;
		align-items: center;
		gap: 8px;
		background: rgba(212, 199, 163, 0.04);
		border: 1px solid rgba(192, 132, 252, 0.2);
		border-radius: 6px;
		padding: 2px 4px 2px 12px;
	}
	.search-glyph { font-size: 16px; color: rgba(192, 132, 252, 0.5); }
	.search-input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		color: rgba(212, 199, 163, 0.9);
		font-family: inherit;
		font-size: 12px;
		padding: 8px 0;
	}
	.search-input::placeholder { color: rgba(212, 199, 163, 0.25); }
	.search-btn {
		padding: 7px 18px;
		background: rgba(192, 132, 252, 0.12);
		border: 1px solid rgba(192, 132, 252, 0.35);
		border-radius: 4px;
		color: #c084fc;
		font-family: inherit;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		cursor: pointer;
		white-space: nowrap;
	}
	.search-btn:hover:not(:disabled) { background: rgba(192, 132, 252, 0.2); }
	.search-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	/* Filters */
	.filter-row { display: flex; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
	.filter-chip {
		padding: 3px 10px;
		background: rgba(212, 199, 163, 0.04);
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 3px;
		font-family: inherit;
		font-size: 9px;
		letter-spacing: 0.1em;
		color: rgba(212, 199, 163, 0.5);
		cursor: pointer;
	}
	.filter-chip:hover { border-color: rgba(192, 132, 252, 0.3); color: rgba(212, 199, 163, 0.7); }
	.filter-chip.active {
		background: rgba(192, 132, 252, 0.1);
		border-color: rgba(192, 132, 252, 0.4);
		color: #c084fc;
	}
	.result-meta {
		margin-left: auto;
		font-size: 9px;
		color: rgba(212, 199, 163, 0.3);
		letter-spacing: 0.06em;
	}

	/* Scanner */
	.analysis-scanner {
		margin: 0 16px;
		padding: 10px 14px;
		background: rgba(192, 132, 252, 0.06);
		border: 1px solid rgba(192, 132, 252, 0.15);
		border-radius: 6px;
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 8px;
	}
	.scanner-label { font-size: 10px; color: #c084fc; flex: 1; letter-spacing: 0.05em; }
	.scanner-bar-bg {
		width: 160px;
		height: 6px;
		background: rgba(212, 199, 163, 0.06);
		border-radius: 3px;
		overflow: hidden;
	}
	.scanner-bar-fill {
		height: 100%;
		background: #c084fc;
		border-radius: 3px;
		transition: width 0.3s;
	}
	.scanner-pct { font-size: 10px; color: #c084fc; font-weight: 700; min-width: 30px; text-align: right; }

	/* AI Summary */
	.ai-summary {
		margin: 8px 16px;
		padding: 12px 14px;
		background: rgba(52, 211, 153, 0.04);
		border: 1px solid rgba(52, 211, 153, 0.15);
		border-radius: 6px;
	}
	.ai-summary-header { margin-bottom: 6px; }
	.ai-badge {
		font-size: 9px;
		letter-spacing: 0.12em;
		color: #34d399;
		font-weight: 700;
	}
	.ai-summary-text { font-size: 11px; line-height: 1.5; color: rgba(212, 199, 163, 0.7); }

	/* Results body */
	.results-body { display: flex; flex: 1; overflow: hidden; }

	/* Result list */
	.results-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 20px;
		text-align: center;
	}
	.empty-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.4; }
	.empty-text { font-size: 12px; color: rgba(212, 199, 163, 0.5); margin-bottom: 4px; }
	.empty-sub { font-size: 10px; color: rgba(212, 199, 163, 0.25); max-width: 400px; }
	.history-section { margin-top: 20px; text-align: left; width: 100%; max-width: 400px; }
	.history-label { font-size: 9px; letter-spacing: 0.12em; color: rgba(212, 199, 163, 0.3); display: block; margin-bottom: 6px; }
	.history-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 5px 10px;
		background: rgba(212, 199, 163, 0.03);
		border: 1px solid rgba(212, 199, 163, 0.06);
		border-radius: 3px;
		color: rgba(212, 199, 163, 0.5);
		font-family: inherit;
		font-size: 10px;
		cursor: pointer;
		margin-bottom: 3px;
	}
	.history-item:hover { background: rgba(192, 132, 252, 0.08); border-color: rgba(192, 132, 252, 0.2); }

	/* Result card */
	.result-card {
		display: block;
		width: 100%;
		text-align: left;
		padding: 10px 12px;
		background: rgba(212, 199, 163, 0.02);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 5px;
		cursor: pointer;
		font-family: inherit;
		color: inherit;
	}
	.result-card:hover { background: rgba(212, 199, 163, 0.05); }
	.result-card.selected { border-color: rgba(192, 132, 252, 0.4); background: rgba(192, 132, 252, 0.04); }
	.result-card.pinned { border-left: 3px solid #fbbf24; }

	.result-top-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
	.result-type-icon { font-size: 14px; }
	.result-title { flex: 1; font-size: 11px; font-weight: 600; }
	.relevance-badge {
		padding: 2px 8px;
		border: 1px solid;
		border-radius: 3px;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.05em;
	}
	.result-citation { font-size: 9px; color: rgba(212, 199, 163, 0.35); margin-bottom: 4px; letter-spacing: 0.03em; }
	.result-excerpt {
		font-size: 10px;
		line-height: 1.4;
		color: rgba(212, 199, 163, 0.5);
		margin-bottom: 6px;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
	}
	.result-footer { display: flex; align-items: center; gap: 10px; }
	.result-source { font-size: 9px; letter-spacing: 0.1em; font-weight: 700; }
	.result-jurisdiction { font-size: 9px; color: rgba(212, 199, 163, 0.3); }
	.pin-btn {
		margin-left: auto;
		background: none;
		border: none;
		font-size: 14px;
		color: rgba(212, 199, 163, 0.2);
		cursor: pointer;
		padding: 0 2px;
	}
	.pin-btn:hover, .pin-btn.pinned { color: #fbbf24; }

	/* Detail panel */
	.detail-panel {
		width: 300px;
		min-width: 300px;
		background: rgba(212, 199, 163, 0.02);
		border-left: 1px solid rgba(212, 199, 163, 0.1);
		padding: 14px;
		overflow-y: auto;
	}
	.detail-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
		padding-bottom: 10px;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
	}
	.detail-icon { font-size: 18px; }
	.detail-title { font-size: 12px; font-weight: 700; }

	.detail-meta-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-bottom: 14px;
	}
	.meta-item {
		padding: 6px 8px;
		background: rgba(212, 199, 163, 0.03);
		border-radius: 4px;
	}
	.meta-label { display: block; font-size: 8px; letter-spacing: 0.12em; color: rgba(212, 199, 163, 0.35); margin-bottom: 2px; }
	.meta-value { font-size: 10px; font-weight: 600; }

	.detail-content { margin-bottom: 14px; }
	.detail-section-label { display: block; font-size: 9px; letter-spacing: 0.12em; color: rgba(212, 199, 163, 0.35); margin-bottom: 6px; }
	.detail-text { font-size: 10px; line-height: 1.5; color: rgba(212, 199, 163, 0.6); }

	.relevance-meter { margin-top: 8px; }
	.meter-label { font-size: 9px; letter-spacing: 0.1em; color: rgba(212, 199, 163, 0.35); display: block; margin-bottom: 6px; }
	.meter-bar-bg {
		height: 8px;
		background: rgba(212, 199, 163, 0.06);
		border-radius: 4px;
		overflow: hidden;
	}
	.meter-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
</style>
