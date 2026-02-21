<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import AISummaryReader from '$lib/components/legal/AISummaryReader.svelte';
	import JudicialAnalysisAgent from '$lib/components/yorha/JudicialAnalysisAgent.svelte';
	import GraphVisualizationGallery from '$lib/components/visualization/GraphVisualizationGallery.svelte';
	import AutomatedLegalResearch from '$lib/components/ai/AutomatedLegalResearch.svelte';
	import ContextualDetectiveBoard from '$lib/components/detective/ContextualDetectiveBoard.svelte';

	let { data }: { data: PageData } = $props();

	let analysisQuery = $state('');
	let analysisResults: any[] = $state([]);
	let searchResults: any[] = $state([]);
	let searchBundles: any[] = $state([]);
	let searchTiming: any = $state(null);
	let isAnalyzing = $state(false);
	let isSearching = $state(false);
	let selectedEvidence: any = $state(null);
	let analysisMode: 'pattern' | 'correlation' | 'prediction' = $state('pattern');
	let activeTab: 'search' | 'analyze' = $state('search');
	let selectedCaseId = $state('');
	let showSummaryReader = $state(false);
	let showJudicialAgent = $state(false);
	let showGraphGallery = $state(false);
	let showLegalResearch = $state(false);
	let showDetectiveBoard = $state(false);
	let errorMessage = $state('');

	const analysisModes = [
		{ id: 'pattern' as const, label: 'PATTERN ANALYSIS', icon: 'P' },
		{ id: 'correlation' as const, label: 'CORRELATION', icon: 'C' },
		{ id: 'prediction' as const, label: 'PREDICTION', icon: 'T' }
	] as const;

	let webgpuCapable = $derived(typeof navigator !== 'undefined' && 'gpu' in navigator);

	let evidencePool = $derived(data.recentEvidence ?? []);
	let caseStats = $derived(data.caseStats ?? { total: 0, open: 0, closed: 0 });
	let evidenceCount = $derived(data.evidenceCount ?? 0);
</script>

<main class="analysis-center">
	<!-- Header -->
	<header class="analysis-header">
		<div class="header-title">
			<h1>ANALYSIS CENTER</h1>
			<div class="header-stats">
				<span class="status-indicator">
					{webgpuCapable ? 'GPU READY' : 'CPU MODE'}
				</span>
				<span class="stat-pill">{evidenceCount} Evidence Items</span>
				<span class="stat-pill">{caseStats.total} Cases ({caseStats.open} open)</span>
			</div>
		</div>
		<div class="analysis-controls">
			<div class="tab-selector">
				<button
					class="tab-btn {activeTab === 'search' ? 'active' : ''}"
					onclick={() => (activeTab = 'search')}
				>
					EVIDENCE SEARCH
				</button>
				<button
					class="tab-btn {activeTab === 'analyze' ? 'active' : ''}"
					onclick={() => (activeTab = 'analyze')}
				>
					AI ANALYSIS
				</button>
			</div>
			<div class="mode-selector">
				{#each analysisModes as mode}
					<button
						class="mode-btn {analysisMode === mode.id ? 'active' : ''}"
						onclick={() => (analysisMode = mode.id)}
					>
						<span class="mode-icon">[{mode.icon}]</span>
						<span class="mode-label">{mode.label}</span>
					</button>
				{/each}
			</div>
		</div>
	</header>

	{#if errorMessage}
		<div class="error-banner">
			<span>{errorMessage}</span>
			<button onclick={() => (errorMessage = '')}>dismiss</button>
		</div>
	{/if}

	<!-- Main Analysis Interface -->
	<div class="analysis-layout">
		<!-- Query Input Panel -->
		<section class="query-panel">
			<div class="query-header">
				<h2>{activeTab === 'search' ? 'EVIDENCE SEARCH' : 'AI ANALYSIS'}</h2>
				<span class="query-mode">{analysisMode.toUpperCase()}</span>
			</div>

			{#if activeTab === 'search'}
				<!-- Semantic Evidence Search Form -->
				<form
					method="post"
					action="?/search"
					use:enhance={({ formData }) => {
						isSearching = true;
						errorMessage = '';
						return async ({ result }) => {
							isSearching = false;
							if (result.type === 'success' && result.data) {
								const d = result.data as Record<string, any>;
								searchResults = Array.isArray(d.searchResults) ? d.searchResults : [];
								searchBundles = Array.isArray(d.bundles) ? d.bundles : [];
								searchTiming = d.timing ?? null;
							} else if (result.type === 'failure') {
								errorMessage = (result.data as any)?.searchError ?? 'Search failed';
							}
						};
					}}
				>
					<textarea
						class="analysis-input"
						placeholder="Search evidence semantically (e.g., 'financial transactions linked to suspect' or 'witness statements about the incident')..."
						bind:value={analysisQuery}
						name="query"
						rows="3"
					></textarea>
					<input type="hidden" name="mode" value={analysisMode} />
					<input type="hidden" name="caseId" value={selectedCaseId} />
					<div class="form-actions">
						<button
							type="submit"
							class="analyze-btn {isSearching ? 'loading' : ''}"
							disabled={isSearching || !analysisQuery.trim()}
						>
							{#if isSearching}
								<span class="loading-spinner"></span>
								SEARCHING...
							{:else}
								SEARCH EVIDENCE
							{/if}
						</button>
					</div>
				</form>
			{:else}
				<!-- AI Analysis Form -->
				<form
					method="post"
					action="?/analyze"
					use:enhance={({ formData }) => {
						isAnalyzing = true;
						errorMessage = '';
						return async ({ result }) => {
							isAnalyzing = false;
							if (result.type === 'success' && result.data?.analysis) {
								analysisResults = [result.data.analysis, ...analysisResults];
								analysisQuery = '';
							} else if (result.type === 'failure') {
								errorMessage = (result.data as any)?.analysisError ?? 'Analysis failed';
							}
						};
					}}
				>
					<textarea
						class="analysis-input"
						placeholder="Enter analysis query (e.g., 'Find patterns in financial transactions' or 'Predict next actions based on surveillance data')..."
						bind:value={analysisQuery}
						name="query"
						rows="3"
					></textarea>
					<input type="hidden" name="mode" value={analysisMode} />
					<button
						type="submit"
						class="analyze-btn {isAnalyzing ? 'loading' : ''}"
						disabled={isAnalyzing || !analysisQuery.trim()}
					>
						{#if isAnalyzing}
							<span class="loading-spinner"></span>
							ANALYZING...
						{:else}
							RUN ANALYSIS
						{/if}
					</button>
				</form>
			{/if}
		</section>

		<!-- Results Panel -->
		<section class="results-panel">
			{#if activeTab === 'search'}
				<div class="results-header">
					<h2>SEARCH RESULTS</h2>
					{#if searchTiming}
						<span class="timing-badge">{searchTiming.totalMs}ms</span>
					{/if}
					<span class="results-count">{searchResults.length} HITS</span>
				</div>

				<div class="results-list">
					{#if searchResults.length === 0}
						<div class="empty-results">
							<p>No results yet. Enter a query to search evidence semantically.</p>
							<p class="hint">Uses RAG + KAG + DAG pipeline with legal-aware reranking.</p>
						</div>
					{/if}

					{#each searchResults as result}
						<div class="result-card">
							<div class="result-header">
								<span class="result-id">{result.evidenceId}</span>
								<span class="result-score">
									{(result.score * 100).toFixed(1)}%
								</span>
								{#if result.rerank}
									<span class="rerank-badge" title="Cosine: {(result.rerank.cosine * 100).toFixed(0)}% | Citations: {result.rerank.sharedCitations}">
										reranked
									</span>
								{/if}
							</div>
							<div class="result-content">{result.content}</div>
							{#if result.metadata}
								<div class="result-meta">
									{#if result.metadata.heading}
										<span class="meta-tag">{result.metadata.heading}</span>
									{/if}
									{#if result.metadata.fileName}
										<span class="meta-tag file">{result.metadata.fileName}</span>
									{/if}
									{#if result.metadata.jurisdiction}
										<span class="meta-tag jurisdiction">{result.metadata.jurisdiction}</span>
									{/if}
								</div>
							{/if}
						</div>
					{/each}

					<!-- Context Bundles (graph-hop expanded) -->
					{#if searchBundles.length > 0}
						<div class="bundles-section">
							<h3>CONTEXT BUNDLES ({searchBundles.length})</h3>
							{#each searchBundles as bundle}
								<div class="bundle-card">
									<div class="bundle-header">
										<span class="bundle-heading">{bundle.heading || 'Section'}</span>
										<span class="bundle-path">{bundle.sectionPath?.join(' > ') || ''}</span>
									</div>
									{#if bundle.siblings?.length > 0}
										<div class="bundle-siblings">
											<span class="sibling-count">{bundle.siblings.length} sibling chunks</span>
										</div>
									{/if}
									{#if bundle.citations?.length > 0}
										<div class="bundle-citations">
											{#each bundle.citations.slice(0, 5) as citation}
												<span class="citation-tag">{citation}</span>
											{/each}
										</div>
									{/if}
									{#if bundle.graphNeighbors?.length > 0}
										<div class="bundle-neighbors">
											<span class="neighbor-label">Graph Neighbors:</span>
											{#each bundle.graphNeighbors.slice(0, 3) as neighbor}
												<span class="neighbor-tag" title="Strength: {neighbor.strength}%, Confidence: {(neighbor.confidence * 100).toFixed(0)}%">
													{neighbor.title} [{neighbor.connectionType}]
												</span>
											{/each}
										</div>
									{/if}
									{#if bundle.documentContext}
										<div class="bundle-doc">
											<span class="doc-name">{bundle.documentContext.fileName}</span>
											{#if bundle.documentContext.aiSummary}
												<p class="doc-summary">{bundle.documentContext.aiSummary}</p>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				<div class="results-header">
					<h2>ANALYSIS RESULTS</h2>
					<span class="results-count">{analysisResults.length} ANALYSES</span>
				</div>

				<div class="results-list">
					{#if analysisResults.length === 0}
						<div class="empty-results">
							<p>No analyses yet. Enter a query and run AI analysis.</p>
							<p class="hint">Uses Gemma3-Legal for pattern detection, correlation mapping, and threat prediction.</p>
						</div>
					{/if}

					{#each analysisResults as result}
						<div class="result-card">
							<div class="result-header">
								<span class="result-mode">{result.mode.toUpperCase()}</span>
								<span class="result-confidence">
									{(result.confidence * 100).toFixed(1)}%
								</span>
								<span class="result-time">
									{new Date(result.timestamp).toLocaleTimeString()}
								</span>
							</div>
							<div class="result-query">
								<strong>Query:</strong> {result.query}
							</div>
							<div class="result-content analysis-text">{result.result}</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Evidence Pool Panel (real data from DB) -->
		<section class="evidence-panel">
			<div class="evidence-header">
				<h2>EVIDENCE POOL</h2>
				<span class="evidence-count">{evidencePool.length} RECENT</span>
			</div>

			<div class="evidence-list">
				{#if evidencePool.length === 0}
					<div class="empty-results">
						<p>No evidence in database yet.</p>
						<p class="hint">Upload evidence via /evidence page.</p>
					</div>
				{/if}

				{#each evidencePool as ev}
					<button
						class="evidence-item {selectedEvidence?.id === ev.id ? 'selected' : ''}"
						onclick={() => {
							selectedEvidence = ev;
							if (ev.title) {
								analysisQuery = ev.title + (ev.description ? ': ' + ev.description.slice(0, 100) : '');
							}
						}}
					>
						<div class="evidence-meta">
							<span class="evidence-type">{(ev.evidenceType ?? 'document').toUpperCase()}</span>
							{#if ev.caseId}
								<span class="evidence-case">Case linked</span>
							{/if}
						</div>
						<div class="evidence-title">{ev.title ?? 'Untitled'}</div>
						{#if ev.description}
							<div class="evidence-preview">{ev.description.substring(0, 120)}...</div>
						{/if}
						<div class="evidence-timestamp">
							{ev.createdAt ? new Date(ev.createdAt).toLocaleDateString() : ''}
						</div>
					</button>
				{/each}
			</div>
		</section>
	</div>

	<!-- Timing Details -->
	{#if searchTiming && activeTab === 'search'}
		<div class="timing-bar">
			<span>Embed: {searchTiming.embedMs ?? 0}ms</span>
			<span>Search: {searchTiming.searchMs ?? 0}ms</span>
			<span>Rerank: {searchTiming.rerankMs ?? 0}ms</span>
			{#if searchTiming.hopMs}
				<span>Graph-hop: {searchTiming.hopMs}ms</span>
			{/if}
			{#if searchTiming.kagMs}
				<span>KAG: {searchTiming.kagMs}ms</span>
			{/if}
			{#if searchTiming.dagMs}
				<span>DAG: {searchTiming.dagMs}ms</span>
			{/if}
			<span class="timing-total">Total: {searchTiming.totalMs ?? 0}ms</span>
		</div>
	{/if}

	<!-- AI Summary Reader -->
	<div class="summary-toggle">
		<button
			class="mode-btn {showSummaryReader ? 'active' : ''}"
			onclick={() => (showSummaryReader = !showSummaryReader)}
		>
			<span class="mode-label">
				{showSummaryReader ? 'HIDE SUMMARY READER' : 'AI SUMMARY READER'}
			</span>
		</button>
	</div>
	{#if showSummaryReader}
		<div class="summary-reader-container">
			<AISummaryReader documentType="evidence" />
		</div>
	{/if}

	<!-- Judicial Analysis Agent -->
	<div class="summary-toggle">
		<button
			class="mode-btn {showJudicialAgent ? 'active' : ''}"
			onclick={() => (showJudicialAgent = !showJudicialAgent)}
		>
			<span class="mode-label">
				{showJudicialAgent ? 'HIDE JUDICIAL AGENT' : 'JUDICIAL ANALYSIS AGENT'}
			</span>
		</button>
	</div>
	{#if showJudicialAgent}
		<div class="summary-reader-container">
			<JudicialAnalysisAgent
				evidence={evidencePool.map((e: any) => ({ id: e.id, title: e.title ?? 'Untitled', description: e.description }))}
			/>
		</div>
	{/if}

	<!-- Graph Visualization Gallery -->
	<div class="summary-toggle">
		<button
			class="mode-btn {showGraphGallery ? 'active' : ''}"
			onclick={() => (showGraphGallery = !showGraphGallery)}
		>
			<span class="mode-label">
				{showGraphGallery ? 'HIDE GRAPH GALLERY' : 'GRAPH VISUALIZATION GALLERY'}
			</span>
		</button>
	</div>
	{#if showGraphGallery}
		<div class="summary-reader-container">
			<GraphVisualizationGallery />
		</div>
	{/if}

	<!-- Automated Legal Research -->
	<div class="summary-toggle">
		<button
			class="mode-btn {showLegalResearch ? 'active' : ''}"
			onclick={() => (showLegalResearch = !showLegalResearch)}
		>
			<span class="mode-label">
				{showLegalResearch ? 'HIDE LEGAL RESEARCH' : 'AUTOMATED LEGAL RESEARCH'}
			</span>
		</button>
	</div>
	{#if showLegalResearch}
		<div class="summary-reader-container">
			<AutomatedLegalResearch research={{ query: '', jurisdiction: '', case_type: '', research_depth: 'comprehensive', metadata: { research_timestamp: '', model_used: 'gemma3-legal' } }} />
		</div>
	{/if}

	<!-- Contextual Detective Board -->
	<div class="summary-toggle">
		<button
			class="mode-btn {showDetectiveBoard ? 'active' : ''}"
			onclick={() => (showDetectiveBoard = !showDetectiveBoard)}
		>
			<span class="mode-label">
				{showDetectiveBoard ? 'HIDE DETECTIVE BOARD' : 'CONTEXTUAL DETECTIVE BOARD'}
			</span>
		</button>
	</div>
	{#if showDetectiveBoard}
		<div class="summary-reader-container">
			<ContextualDetectiveBoard caseId={selectedCaseId || 'default'} initialEvidence={evidencePool} />
		</div>
	{/if}
</main>

<style>
	.analysis-center {
		background: linear-gradient(135deg, #0d1117, #161b22);
		min-height: 100vh;
		color: #f0f6fc;
		font-family: 'JetBrains Mono', 'Consolas', monospace;
		position: relative;
	}

	.analysis-center::before {
		content: '';
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background:
			linear-gradient(90deg, rgba(16, 185, 129, 0.06) 1px, transparent 1px),
			linear-gradient(rgba(16, 185, 129, 0.06) 1px, transparent 1px);
		background-size: 24px 24px;
		pointer-events: none;
		z-index: 0;
	}

	.analysis-header {
		position: relative;
		z-index: 1;
		background: rgba(0, 0, 0, 0.8);
		border-bottom: 2px solid #10b981;
		padding: 1rem 2rem;
		box-shadow: 0 2px 10px rgba(16, 185, 129, 0.2);
	}

	.header-title {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.header-title h1 {
		color: #10b981;
		font-size: 1.5rem;
		margin: 0;
		letter-spacing: 0.2em;
		text-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
	}

	.header-stats {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.status-indicator {
		padding: 0.2rem 0.6rem;
		font-size: 0.7rem;
		border-radius: 3px;
		font-weight: bold;
		background: rgba(16, 185, 129, 0.2);
		color: #10b981;
		border: 1px solid #10b981;
	}

	.stat-pill {
		padding: 0.2rem 0.6rem;
		font-size: 0.7rem;
		border-radius: 3px;
		background: rgba(30, 41, 59, 0.8);
		color: #9ca3af;
		border: 1px solid #374151;
	}

	.analysis-controls {
		margin-top: 0.75rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tab-selector {
		display: flex;
		gap: 0;
	}

	.tab-btn {
		padding: 0.5rem 1rem;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid #374151;
		color: #9ca3af;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		transition: all 0.2s;
	}

	.tab-btn:first-child {
		border-radius: 4px 0 0 4px;
	}

	.tab-btn:last-child {
		border-radius: 0 4px 4px 0;
		border-left: none;
	}

	.tab-btn.active {
		background: rgba(16, 185, 129, 0.2);
		border-color: #10b981;
		color: #10b981;
	}

	.mode-selector {
		display: flex;
		gap: 0.4rem;
	}

	.mode-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.75rem;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid #374151;
		color: #9ca3af;
		border-radius: 4px;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.75rem;
		transition: all 0.2s;
	}

	.mode-btn:hover,
	.mode-btn.active {
		background: rgba(16, 185, 129, 0.15);
		border-color: #10b981;
		color: #10b981;
	}

	.mode-icon {
		font-weight: bold;
		color: #10b981;
	}

	.error-banner {
		position: relative;
		z-index: 1;
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid #ef4444;
		color: #fca5a5;
		padding: 0.5rem 1rem;
		margin: 0.5rem 1rem;
		border-radius: 4px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.85rem;
	}

	.error-banner button {
		background: none;
		border: 1px solid #ef4444;
		color: #ef4444;
		padding: 0.2rem 0.5rem;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.7rem;
		border-radius: 3px;
	}

	.analysis-layout {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: 1fr 1fr 280px;
		gap: 1rem;
		min-height: calc(100vh - 180px);
		padding: 1rem;
	}

	.query-panel,
	.results-panel,
	.evidence-panel {
		background: rgba(13, 17, 23, 0.9);
		border: 1px solid #1e3a2a;
		border-radius: 6px;
		padding: 1rem;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.query-header,
	.results-header,
	.evidence-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.query-header h2,
	.results-header h2,
	.evidence-header h2 {
		color: #10b981;
		font-size: 0.85rem;
		margin: 0;
		letter-spacing: 0.1em;
	}

	.query-mode {
		color: #6b7280;
		font-size: 0.7rem;
	}

	.results-count,
	.evidence-count {
		color: #6b7280;
		font-size: 0.7rem;
	}

	.timing-badge {
		background: rgba(16, 185, 129, 0.15);
		color: #10b981;
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
		font-size: 0.65rem;
	}

	.analysis-input {
		width: 100%;
		min-height: 80px;
		background: rgba(30, 41, 59, 0.6);
		border: 1px solid #374151;
		border-radius: 4px;
		color: #f0f6fc;
		padding: 0.75rem;
		font-family: inherit;
		font-size: 0.85rem;
		resize: vertical;
	}

	.analysis-input:focus {
		outline: none;
		border-color: #10b981;
		box-shadow: 0 0 8px rgba(16, 185, 129, 0.15);
	}

	.form-actions {
		margin-top: 0.5rem;
	}

	.analyze-btn {
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.6rem;
		background: linear-gradient(90deg, #10b981, #34d399);
		border: none;
		border-radius: 4px;
		color: #0d1117;
		font-weight: bold;
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.2s;
		letter-spacing: 0.05em;
	}

	.analyze-btn:hover:not(:disabled) {
		filter: brightness(1.1);
		box-shadow: 0 0 12px rgba(16, 185, 129, 0.3);
	}

	.analyze-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.loading-spinner {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 2px solid #0d1117;
		border-radius: 50%;
		border-top-color: transparent;
		animation: spin 0.8s linear infinite;
		margin-right: 0.4rem;
		vertical-align: middle;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.results-list {
		flex: 1;
		overflow-y: auto;
	}

	.empty-results {
		text-align: center;
		padding: 2rem 1rem;
		color: #6b7280;
		font-size: 0.85rem;
	}

	.empty-results .hint {
		font-size: 0.75rem;
		color: #4b5563;
		margin-top: 0.5rem;
	}

	.result-card {
		background: rgba(30, 41, 59, 0.4);
		border: 1px solid #1e293b;
		border-radius: 6px;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.result-header {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		flex-wrap: wrap;
	}

	.result-id {
		color: #10b981;
		font-weight: bold;
		font-size: 0.7rem;
	}

	.result-score {
		color: #34d399;
		font-weight: bold;
	}

	.rerank-badge {
		background: rgba(139, 92, 246, 0.2);
		color: #a78bfa;
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
		font-size: 0.6rem;
		cursor: help;
	}

	.result-mode {
		color: #10b981;
		font-weight: bold;
	}

	.result-confidence {
		color: #34d399;
	}

	.result-time {
		color: #6b7280;
		margin-left: auto;
	}

	.result-query {
		color: #d1d5db;
		margin-bottom: 0.5rem;
		font-size: 0.8rem;
	}

	.result-content {
		color: #e5e7eb;
		font-size: 0.8rem;
		line-height: 1.5;
	}

	.result-content.analysis-text {
		white-space: pre-wrap;
	}

	.result-meta {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
		margin-top: 0.5rem;
	}

	.meta-tag {
		padding: 0.1rem 0.3rem;
		background: rgba(16, 185, 129, 0.1);
		color: #6ee7b7;
		border-radius: 3px;
		font-size: 0.65rem;
	}

	.meta-tag.file {
		color: #93c5fd;
		background: rgba(59, 130, 246, 0.1);
	}

	.meta-tag.jurisdiction {
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.1);
	}

	/* Bundles */
	.bundles-section {
		margin-top: 1rem;
		border-top: 1px solid #1e293b;
		padding-top: 0.75rem;
	}

	.bundles-section h3 {
		color: #10b981;
		font-size: 0.75rem;
		margin: 0 0 0.5rem 0;
		letter-spacing: 0.1em;
	}

	.bundle-card {
		background: rgba(16, 185, 129, 0.05);
		border: 1px solid #1e3a2a;
		border-radius: 4px;
		padding: 0.6rem;
		margin-bottom: 0.5rem;
	}

	.bundle-header {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		margin-bottom: 0.3rem;
	}

	.bundle-heading {
		color: #10b981;
		font-weight: bold;
	}

	.bundle-path {
		color: #6b7280;
		font-size: 0.65rem;
	}

	.bundle-siblings,
	.bundle-citations,
	.bundle-neighbors,
	.bundle-doc {
		font-size: 0.7rem;
		margin-top: 0.3rem;
	}

	.sibling-count {
		color: #9ca3af;
	}

	.citation-tag {
		display: inline-block;
		padding: 0.1rem 0.3rem;
		background: rgba(251, 191, 36, 0.1);
		color: #fbbf24;
		border-radius: 3px;
		font-size: 0.6rem;
		margin-right: 0.2rem;
	}

	.neighbor-label {
		color: #9ca3af;
		margin-right: 0.3rem;
	}

	.neighbor-tag {
		display: inline-block;
		padding: 0.1rem 0.3rem;
		background: rgba(139, 92, 246, 0.1);
		color: #a78bfa;
		border-radius: 3px;
		font-size: 0.6rem;
		margin-right: 0.2rem;
		cursor: help;
	}

	.doc-name {
		color: #93c5fd;
		font-weight: bold;
	}

	.doc-summary {
		color: #9ca3af;
		margin: 0.2rem 0 0;
		font-size: 0.7rem;
		line-height: 1.4;
	}

	/* Evidence Panel */
	.evidence-list {
		flex: 1;
		overflow-y: auto;
	}

	.evidence-item {
		display: block;
		width: 100%;
		text-align: left;
		background: rgba(30, 41, 59, 0.4);
		border: 1px solid #1e293b;
		border-radius: 4px;
		padding: 0.6rem;
		margin-bottom: 0.5rem;
		cursor: pointer;
		transition: all 0.2s;
		color: inherit;
		font-family: inherit;
		font-size: inherit;
	}

	.evidence-item:hover,
	.evidence-item.selected {
		border-color: #10b981;
		box-shadow: 0 0 8px rgba(16, 185, 129, 0.2);
	}

	.evidence-meta {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.3rem;
		font-size: 0.65rem;
	}

	.evidence-type {
		color: #10b981;
		font-weight: bold;
	}

	.evidence-case {
		color: #a78bfa;
	}

	.evidence-title {
		color: #f0f6fc;
		font-weight: bold;
		font-size: 0.8rem;
		margin-bottom: 0.2rem;
	}

	.evidence-preview {
		color: #9ca3af;
		font-size: 0.75rem;
		line-height: 1.3;
		margin-bottom: 0.3rem;
	}

	.evidence-timestamp {
		color: #4b5563;
		font-size: 0.65rem;
	}

	/* Timing Bar */
	.timing-bar {
		position: relative;
		z-index: 1;
		display: flex;
		gap: 1rem;
		padding: 0.4rem 1rem;
		background: rgba(0, 0, 0, 0.6);
		border-top: 1px solid #1e293b;
		font-size: 0.7rem;
		color: #6b7280;
		flex-wrap: wrap;
	}

	.timing-total {
		color: #10b981;
		font-weight: bold;
		margin-left: auto;
	}

	/* Summary Toggle */
	.summary-toggle {
		position: relative;
		z-index: 1;
		padding: 0.5rem 1rem;
	}

	.summary-reader-container {
		position: relative;
		z-index: 1;
		padding: 0 1rem 1rem;
	}
</style>
