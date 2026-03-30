<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { analysisPanel } from '$lib/stores/analysis-panel.svelte.js';
	import type { DiagnosisResult } from '$lib/stores/analysis-panel.svelte.js';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	let filePathInput = $state('');
	let showActivityLog = $state(false);
	let showComponents = $state(false);

	// Use store-backed diagnosis state (typed)
	let diagnosisRunning = $derived(analysisPanel.diagnosisLoading);
	let diagnosisResult = $derived(analysisPanel.lastDiagnosis);

	function formatLogTime(ts: number): string {
		return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	// Listen for custom event
	onMount(() => {
		const handleOpen = () => { open = true; };
		window.addEventListener('yorha:open-analysis', handleOpen);
		return () => window.removeEventListener('yorha:open-analysis', handleOpen);
	});

	// Lazy-load tab data on first activation
	let tabsLoaded = $state<Record<string, boolean>>({ context: false, errors: false, gpu: false, recs: false });

	$effect(() => {
		if (!open) return;
		const tab = analysisPanel.activeTab;
		if (tabsLoaded[tab]) return;
		tabsLoaded[tab] = true;
		if (tab === 'context') {
			analysisPanel.fetchPageContext();
		} else if (tab === 'errors') {
			analysisPanel.fetchStats();
			analysisPanel.fetchClusters();
		} else if (tab === 'gpu') {
			analysisPanel.checkGpu();
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			open = false;
		}
	}

	function handleBackdropClick() {
		open = false;
	}

	function handleAnalyze() {
		if (filePathInput.trim()) {
			analysisPanel.analyzeFile(filePathInput.trim());
		}
	}

	function handleFindRelated() {
		const fp = analysisPanel.analysisFilePath || filePathInput.trim();
		if (fp) analysisPanel.findRelated(fp);
	}

	async function runPageDiagnosis(diagMode: 'page' | 'route' = 'page') {
		feedbackSent = null;
		await analysisPanel.diagnosePage(diagMode);
	}

	function severityColor(sev: string): string {
		switch (sev) {
			case 'critical': return '#ef4444';
			case 'error': return '#f87171';
			case 'warn': return '#fbbf24';
			default: return 'rgba(255,255,255,0.5)';
		}
	}

	function gradeColor(grade: string): string {
		switch (grade) {
			case 'A': return '#4ade80';
			case 'B': return '#22c55e';
			case 'C': return '#fbbf24';
			case 'D': return '#f97316';
			case 'F': return '#ef4444';
			default: return 'rgba(255,255,255,0.5)';
		}
	}

	const tabs: { id: typeof analysisPanel.activeTab; label: string; icon: string }[] = [
		{ id: 'context', label: 'Context', icon: 'scan-search' },
		{ id: 'errors', label: 'Errors', icon: 'triangle-alert' },
		{ id: 'gpu', label: 'GPU', icon: 'cpu' },
		{ id: 'recs', label: 'Recs', icon: 'lightbulb' },
	];

	let feedbackSent = $state<'accurate' | 'inaccurate' | 'helpful' | 'unhelpful' | null>(null);

	// Similar past diagnoses state
	interface SimilarDiagnosis {
		diagnosisId: string;
		score: number;
		diagnosis: string;
		rootCauseType: string;
		routePath: string;
		source: string;
	}
	let similarResults = $state<SimilarDiagnosis[]>([]);
	let similarLoading = $state(false);
	let showSimilar = $state(false);

	async function fetchSimilarDiagnoses() {
		const query = diagnosisResult?.diagnosis?.slice(0, 200) || analysisPanel.currentRoute || '';
		if (!query) return;
		similarLoading = true;
		try {
			const res = await fetch('/api/error-brain/diagnosis-history/similar', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query,
					strategy: 'hybrid',
					limit: 5,
					scoreThreshold: 0.3,
					routePath: analysisPanel.currentRoute || undefined,
				}),
			});
			if (res.ok) {
				const data = await res.json();
				similarResults = data.similar ?? [];
			}
		} catch { /* non-critical */ }
		similarLoading = false;
		showSimilar = true;
	}

	async function submitDiagnosisFeedback(accurate?: boolean, helpful?: boolean) {
		const id = diagnosisResult?.diagnosisId;
		if (!id) return;
		try {
			const res = await fetch('/api/error-brain/diagnosis-history', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ diagnosisId: id, accurate, helpful }),
			});
			if (res.ok) {
				if (accurate !== undefined) feedbackSent = accurate ? 'accurate' : 'inaccurate';
				else if (helpful !== undefined) feedbackSent = helpful ? 'helpful' : 'unhelpful';
			}
		} catch { /* non-critical */ }
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<div
		class="panel-backdrop"
		onclick={handleBackdropClick}
		role="presentation"
	></div>

	<!-- Panel -->
	<aside
		class="analysis-panel"
		transition:fly={{ x: 420, duration: 200 }}
		aria-label="Analysis Panel"
	>
		<!-- Header -->
		<header class="panel-header">
			<div class="header-left">
				<Icon name="scan-search" size={16} />
				<span class="header-title">ANALYSIS</span>
				<span class="context-badge">{analysisPanel.contextLabel}</span>
			</div>
			<div class="header-right">
				{#if analysisPanel.hasActiveWork}
					<div class="spinner"></div>
				{/if}
				{#if analysisPanel.lastPerfMeta}
					<span class="perf-badge" title="Last operation performance">
						{analysisPanel.lastPerfMeta.parser === 'simdjson' ? 'SIMD' : 'V8'}
						{analysisPanel.lastPerfMeta.totalMs}ms
					</span>
				{/if}
				<button class="close-btn" onclick={() => open = false} aria-label="Close">
					<Icon name="x" size={16} />
				</button>
			</div>
		</header>

		<!-- Tabs -->
		<nav class="tab-bar">
			{#each tabs as tab}
				<button
					class="tab-btn"
					class:active={analysisPanel.activeTab === tab.id}
					onclick={() => analysisPanel.activeTab = tab.id}
				>
					<Icon name={tab.icon} size={13} />
					<span>{tab.label}</span>
					{#if tab.id === 'errors' && analysisPanel.pageErrorCount > 0}
						<span class="tab-badge">{analysisPanel.pageErrorCount}</span>
					{/if}
				</button>
			{/each}
		</nav>

		<!-- Tab Content -->
		<div class="tab-content">
			<!-- ═══ CONTEXT TAB ═══ -->
			{#if analysisPanel.activeTab === 'context'}
				<div class="section">
					<label class="section-label">Current Route</label>
					<div class="route-display">{analysisPanel.currentRoute || '/'}</div>
					{#if analysisPanel.currentCaseId}
						<div class="case-id-display">
							<Icon name="briefcase" size={12} />
							<span>Case: {analysisPanel.currentCaseId.slice(0, 8)}...</span>
						</div>
					{/if}
				</div>

				<!-- Page Components -->
				<div class="section">
					<div class="section-header-row">
						<label class="section-label">Page Components</label>
						{#if analysisPanel.pageContextLoading}
							<div class="spinner-sm"></div>
						{:else if analysisPanel.pageComponents}
							<button class="toggle-btn" onclick={() => showComponents = !showComponents}>
								<Icon name={showComponents ? 'chevron-up' : 'chevron-down'} size={12} />
							</button>
						{:else}
							<button class="toggle-btn" onclick={() => analysisPanel.fetchPageContext()} title="Load page context">
								<Icon name="refresh-cw" size={12} />
							</button>
						{/if}
					</div>
					{#if analysisPanel.pageContextError}
						<div class="error-msg">{analysisPanel.pageContextError}</div>
					{/if}
					{#if analysisPanel.pageComponents}
						{@const pc = analysisPanel.pageComponents}
						<div class="component-summary">
							<span class="comp-count">{pc.page.length + pc.layouts.length + pc.components.length + pc.stores.length}</span> files
							<span class="comp-sep">&middot;</span>
							<span class="comp-detail">{pc.components.length} components</span>
							<span class="comp-sep">&middot;</span>
							<span class="comp-detail">{pc.stores.length} stores</span>
							<span class="comp-sep">&middot;</span>
							<span class="comp-detail">{pc.apiEndpoints.length} APIs</span>
						</div>
						{#if showComponents}
							<div class="component-tree">
								{#if pc.page.length > 0}
									<div class="tree-group">
										<span class="tree-label">Page</span>
										{#each pc.page as f}<div class="tree-file">{f.split('/').pop()}</div>{/each}
									</div>
								{/if}
								{#if pc.layouts.length > 0}
									<div class="tree-group">
										<span class="tree-label">Layouts ({pc.layouts.length})</span>
										{#each pc.layouts as f}<div class="tree-file">{f.split('/').slice(-2).join('/')}</div>{/each}
									</div>
								{/if}
								{#if pc.components.length > 0}
									<div class="tree-group">
										<span class="tree-label">Components ({pc.components.length})</span>
										{#each pc.components.slice(0, 15) as f}<div class="tree-file">{f.split('/').pop()}</div>{/each}
										{#if pc.components.length > 15}
											<div class="tree-more">+{pc.components.length - 15} more</div>
										{/if}
									</div>
								{/if}
								{#if pc.stores.length > 0}
									<div class="tree-group">
										<span class="tree-label">Stores ({pc.stores.length})</span>
										{#each pc.stores as f}<div class="tree-file">{f.split('/').pop()}</div>{/each}
									</div>
								{/if}
								{#if pc.apiEndpoints.length > 0}
									<div class="tree-group">
										<span class="tree-label">API Endpoints ({pc.apiEndpoints.length})</span>
										{#each pc.apiEndpoints.slice(0, 10) as ep}<div class="tree-file api">{ep}</div>{/each}
										{#if pc.apiEndpoints.length > 10}
											<div class="tree-more">+{pc.apiEndpoints.length - 10} more</div>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					{/if}
				</div>

				<!-- Runtime Issues -->
				{#if analysisPanel.runtimeErrors.length > 0 || analysisPanel.networkFailures.length > 0}
					<div class="section">
						<label class="section-label">Runtime Issues</label>
						{#if analysisPanel.runtimeErrors.length > 0}
							<div class="issues-list">
								{#each analysisPanel.runtimeErrors.slice(0, 5) as err}
									<div class="issue-item" style="--sev-color: {severityColor(err.severity)}">
										<span class="issue-sev">{err.severity}</span>
										<span class="issue-msg">{err.message.slice(0, 120)}</span>
									</div>
								{/each}
								{#if analysisPanel.runtimeErrors.length > 5}
									<div class="tree-more">+{analysisPanel.runtimeErrors.length - 5} more errors</div>
								{/if}
							</div>
						{/if}
						{#if analysisPanel.networkFailures.length > 0}
							<div class="sub-section">
								<span class="sub-label">Failed API Calls</span>
								{#each analysisPanel.networkFailures.slice(0, 5) as nf}
									<div class="issue-item" style="--sev-color: #f87171">
										<span class="issue-sev">{nf.statusCode}</span>
										<span class="issue-msg">{nf.path} ({nf.count}x)</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Page Diagnosis -->
				<div class="section">
					<div class="diag-btns">
						<button
							class="action-btn primary-action"
							onclick={() => runPageDiagnosis('page')}
							disabled={diagnosisRunning}
						>
							{#if diagnosisRunning}
								<div class="spinner-sm"></div>
								<span>Analyzing...</span>
							{:else}
								<Icon name="scan" size={14} />
								<span>Analyze Current Page</span>
							{/if}
						</button>
						<button
							class="action-btn-sm"
							onclick={() => runPageDiagnosis('route')}
							disabled={diagnosisRunning}
							title="Route-mode diagnosis"
						>
							<Icon name="route" size={13} />
						</button>
					</div>
					{#if analysisPanel.diagnosisError}
						<div class="error-msg">{analysisPanel.diagnosisError}</div>
					{/if}
					{#if diagnosisResult}
						<div class="diagnosis-inline">
							<!-- Header: risk + root cause type + mode -->
							<div class="diag-header-row">
								{#if diagnosisResult.riskLevel}
									<span class="risk-badge" class:high={diagnosisResult.riskLevel === 'high'} class:medium={diagnosisResult.riskLevel === 'medium'}>
										{diagnosisResult.riskLevel}
									</span>
								{/if}
								{#if diagnosisResult.probableRootCauseType && diagnosisResult.probableRootCauseType !== 'unknown'}
									<span class="cause-tag">{diagnosisResult.probableRootCauseType}</span>
								{/if}
								{#if diagnosisResult.mode}
									<span class="mode-tag">{diagnosisResult.mode}</span>
								{/if}
								{#if diagnosisResult.needsHumanReview}
									<span class="review-tag" title="Needs human review">
										<Icon name="eye" size={10} />
									</span>
								{/if}
								{#if diagnosisResult.unsafeToAutoPatch}
									<span class="unsafe-tag" title="Unsafe to auto-patch">⚠ no-auto</span>
								{/if}
							</div>
							{#if diagnosisResult.diagnosis}
								<p class="ai-summary">{diagnosisResult.diagnosis}</p>
							{/if}
							{#if Array.isArray(diagnosisResult.fixPlan) && diagnosisResult.fixPlan.length > 0}
								<div class="sub-section">
									<span class="sub-label">Fix Plan</span>
									{#each diagnosisResult.fixPlan as step}
										<div class="fix-step">
											<span class="step-num">{step.step}</span>
											<span class="step-action">{step.action}</span>
										</div>
									{/each}
								</div>
							{/if}
							{#if Array.isArray(diagnosisResult.suggestedTests) && diagnosisResult.suggestedTests.length > 0}
								<div class="sub-section">
									<span class="sub-label">Suggested Tests</span>
									{#each diagnosisResult.suggestedTests as test}
										<div class="test-item">
											<span class="test-type">{test.type}</span>
											<span class="test-target">{test.target}</span>
										</div>
									{/each}
								</div>
							{/if}
							{#if Array.isArray(diagnosisResult.evidence) && diagnosisResult.evidence.length > 0}
								<div class="sub-section">
									<span class="sub-label">Evidence ({diagnosisResult.evidence.length})</span>
									{#each diagnosisResult.evidence.slice(0, 5) as ev}
										<div class="evidence-item">
											<span class="ev-kind">{ev.kind}</span>
											<span class="ev-snippet">{ev.snippet}</span>
										</div>
									{/each}
								</div>
							{/if}
							{#if diagnosisResult.sources}
								<div class="diag-sources">
									<Icon name="database" size={10} />
									<span>{diagnosisResult.sources.semanticMatches ?? 0} semantic</span>
									<span>{diagnosisResult.sources.errorHistoryMatches ?? 0} errors</span>
									<span>{diagnosisResult.sources.graphNeighborMatches ?? 0} graph</span>
									<span>{diagnosisResult.sources.runtimeEvidenceMatches ?? 0} runtime</span>
								</div>
							{/if}
							{#if Array.isArray(diagnosisResult.likelyFiles) && diagnosisResult.likelyFiles.length > 0}
								<div class="sub-section">
									<span class="sub-label">Likely Files</span>
									{#each diagnosisResult.likelyFiles.slice(0, 5) as f}
										<div class="likely-file">{f}</div>
									{/each}
								</div>
							{/if}
							{#if diagnosisResult._perf}
								<div class="diag-perf">
									<span class="perf-total">{diagnosisResult._perf.totalMs}ms</span>
									{#if diagnosisResult._perf.cached}
										<span class="perf-cached">cached</span>
									{/if}
								</div>
							{/if}
							{#if diagnosisResult.diagnosisId}
								<div class="diag-feedback">
									<span class="feedback-label">Was this helpful?</span>
									<button
										class="feedback-btn {feedbackSent === 'accurate' ? 'active-good' : ''}"
										title="Accurate diagnosis"
										disabled={feedbackSent !== null}
										onclick={() => submitDiagnosisFeedback(true, undefined)}
									>
										<Icon name="thumbs-up" size={12} />
									</button>
									<button
										class="feedback-btn {feedbackSent === 'inaccurate' ? 'active-bad' : ''}"
										title="Inaccurate diagnosis"
										disabled={feedbackSent !== null}
										onclick={() => submitDiagnosisFeedback(false, undefined)}
									>
										<Icon name="thumbs-down" size={12} />
									</button>
									{#if feedbackSent}
										<span class="feedback-ack">Recorded</span>
									{/if}
								</div>
								<!-- Similar Past Diagnoses -->
								<div class="similar-section">
									<button class="similar-toggle" onclick={fetchSimilarDiagnoses} disabled={similarLoading}>
										{#if similarLoading}
											<div class="spinner-sm"></div>
										{:else}
											<Icon name="search" size={12} />
										{/if}
										<span>Find Similar</span>
									</button>
									{#if showSimilar && similarResults.length > 0}
										<div class="similar-list">
											{#each similarResults as sim}
												<div class="similar-item">
													<div class="sim-header">
														<span class="sim-score">{(sim.score * 100).toFixed(0)}%</span>
														{#if sim.rootCauseType && sim.rootCauseType !== 'unknown'}
															<span class="cause-tag">{sim.rootCauseType}</span>
														{/if}
														<span class="sim-source">{sim.source}</span>
													</div>
													<p class="sim-diagnosis">{sim.diagnosis?.slice(0, 150) ?? ''}...</p>
												</div>
											{/each}
										</div>
									{:else if showSimilar}
										<div class="sim-empty">No similar past diagnoses found</div>
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- File Analysis -->
				<div class="section">
					<label class="section-label">Analyze File</label>
					<div class="input-row">
						<input
							class="file-input"
							type="text"
							placeholder="src/routes/api/..."
							bind:value={filePathInput}
							onkeydown={(e) => { if (e.key === 'Enter') handleAnalyze(); }}
						/>
						<button
							class="action-btn-sm"
							onclick={handleAnalyze}
							disabled={analysisPanel.analysisLoading || !filePathInput.trim()}
						>
							{#if analysisPanel.analysisLoading}
								<div class="spinner-sm"></div>
							{:else}
								<Icon name="sparkles" size={14} />
							{/if}
						</button>
					</div>
				</div>

				{#if analysisPanel.analysisError}
					<div class="error-msg">{analysisPanel.analysisError}</div>
				{/if}

				<!-- Analysis Result -->
				{#if analysisPanel.analysisResult}
					{@const a = analysisPanel.analysisResult}
					<div class="section">
						<!-- Health Grade -->
						{#if a.healthGrade && a.healthGrade !== '?'}
							<div class="health-grade" style="--gc: {gradeColor(a.healthGrade)}">
								<span class="grade-letter">{a.healthGrade}</span>
								<div class="grade-meta">
									{#if a.complexityScore !== undefined && a.complexityScore >= 0}
										<span>Complexity: {a.complexityScore}/10</span>
									{/if}
									{#if a.couplingScore !== undefined && a.couplingScore >= 0}
										<span>Coupling: {a.couplingScore}/10</span>
									{/if}
									{#if analysisPanel.lastPerfMeta}
										<span class="perf-inline">
											{analysisPanel.lastPerfMeta.totalMs}ms
											via {analysisPanel.lastPerfMeta.parser ?? 'v8'}
										</span>
									{/if}
								</div>
							</div>
						{/if}

						{#if a.summary}
							<p class="ai-summary">{a.summary}</p>
						{/if}

						{#if a.risks && a.risks.length > 0}
							<div class="sub-section">
								<span class="sub-label">Risks</span>
								{#each a.risks as risk}
									<div class="risk-item">
										<Icon name="alert-triangle" size={11} />
										<span>{risk}</span>
									</div>
								{/each}
							</div>
						{/if}

						{#if a.suggestions && a.suggestions.length > 0}
							<div class="sub-section">
								<span class="sub-label">Suggestions</span>
								{#each a.suggestions as sug}
									<div class="sug-item">
										<Icon name="lightbulb" size={11} />
										<span>{sug}</span>
									</div>
								{/each}
							</div>
						{/if}

						<!-- Related Files -->
						<button
							class="action-btn"
							onclick={handleFindRelated}
							disabled={analysisPanel.relatedLoading}
						>
							{#if analysisPanel.relatedLoading}
								<div class="spinner-sm"></div>
								<span>Searching Qdrant...</span>
							{:else}
								<Icon name="search" size={14} />
								<span>Find Similar Files</span>
							{/if}
						</button>
					</div>
				{/if}

				{#if analysisPanel.relatedError}
					<div class="error-msg">{analysisPanel.relatedError}</div>
				{/if}

				{#if analysisPanel.relatedFiles.length > 0}
					<div class="section">
						<label class="section-label">Related Files</label>
						<div class="related-list">
							{#each analysisPanel.relatedFiles as rf}
								<div class="related-item" title={rf.filePath}>
									<div class="related-row">
										<span class="related-path">{rf.filePath.split('/').pop()}</span>
										<span class="related-score">{(rf.score * 100).toFixed(0)}%</span>
									</div>
									{#if rf.symbol}
										<span class="related-symbol">{rf.kind}: {rf.symbol}</span>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Prosecute shortcut -->
				{#if analysisPanel.analysisResult}
					<button
						class="prosecute-btn"
						onclick={() => {
							const fp = analysisPanel.analysisFilePath || filePathInput;
							const a = analysisPanel.analysisResult;
							const issues: string[] = [];
							if (a?.healthGrade === 'D' || a?.healthGrade === 'F') issues.push(`Health grade: ${a.healthGrade}`);
							if (a?.risks) issues.push(...a.risks.slice(0, 2));
							const params = new URLSearchParams({ mode: 'code-review', file: fp, charge: issues.join('; ') || 'Code quality review' });
							goto(`/simulation?${params}`);
						}}
					>
						<Icon name="scale" size={14} />
						<span>Prosecute This Code</span>
					</button>
				{/if}

			<!-- ═══ ERRORS TAB ═══ -->
			{:else if analysisPanel.activeTab === 'errors'}
				<!-- Page Errors (filtered to current route) -->
				{#if analysisPanel.runtimeErrors.length > 0}
					<div class="section">
						<label class="section-label">Page Errors ({analysisPanel.runtimeErrors.length})</label>
						<div class="issues-list">
							{#each analysisPanel.runtimeErrors.slice(0, 8) as err}
								<div class="issue-item" style="--sev-color: {severityColor(err.severity)}">
									<span class="issue-sev">{err.severity}</span>
									<span class="issue-msg">{err.message.slice(0, 120)}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Stats Bar -->
				{#if analysisPanel.codebaseStats}
					{@const s = analysisPanel.codebaseStats}
					<div class="stats-grid">
						<div class="stat-card">
							<span class="stat-val">{s.totalErrors.toLocaleString()}</span>
							<span class="stat-lbl">Errors</span>
						</div>
						<div class="stat-card">
							<span class="stat-val">{s.errorClusters}</span>
							<span class="stat-lbl">Clusters</span>
						</div>
						<div class="stat-card">
							<span class="stat-val">{s.indexedFiles.toLocaleString()}</span>
							<span class="stat-lbl">Indexed</span>
						</div>
					</div>
					{#if s._perf}
						<div class="perf-bar">
							<Icon name="zap" size={10} />
							<span>{s._perf.totalMs}ms</span>
							<span class="perf-parser">{s._perf.parser ?? 'v8'}</span>
							{#if s._perf.simdAvailable}
								<span class="perf-simd">SIMD</span>
							{/if}
						</div>
					{/if}
				{:else if analysisPanel.statsLoading}
					<div class="loading-row"><div class="spinner-sm"></div><span>Loading stats...</span></div>
				{:else if analysisPanel.statsError}
					<div class="error-msg">{analysisPanel.statsError}</div>
				{/if}

				<!-- Error Clusters -->
				<div class="section">
					<label class="section-label">Error Clusters</label>
					{#if analysisPanel.clustersLoading}
						<div class="loading-row"><div class="spinner-sm"></div><span>Loading clusters...</span></div>
					{:else if analysisPanel.clustersError}
						<div class="error-msg">{analysisPanel.clustersError}</div>
					{:else if analysisPanel.errorClusters.length > 0}
						<div class="cluster-list">
							{#each analysisPanel.errorClusters as cluster}
								<div class="cluster-card">
									<div class="cluster-header">
										<span class="cluster-count">{cluster.member_count}</span>
										<span class="cluster-summary">{cluster.summary || cluster.id}</span>
									</div>
									{#if cluster.top_codes && cluster.top_codes.length > 0}
										<div class="cluster-codes">
											{#each cluster.top_codes.slice(0, 3) as code}
												<span class="code-tag">{code}</span>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-msg">No clusters indexed yet</div>
					{/if}
				</div>

				<!-- Top Error Codes -->
				{#if analysisPanel.codebaseStats?.topErrorCodes?.length}
					<div class="section">
						<label class="section-label">Top Error Codes</label>
						<div class="code-list">
							{#each analysisPanel.codebaseStats.topErrorCodes.slice(0, 5) as ec}
								<div class="code-row">
									<span class="code-name">{ec.code}</span>
									<span class="code-count">{ec.count}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Navigation links -->
				<div class="nav-links">
					<button class="nav-link" onclick={() => goto('/admin/error-brain')}>
						<Icon name="brain" size={14} />
						<span>Full Error Brain</span>
						<Icon name="arrow-right" size={12} />
					</button>
					<button class="nav-link" onclick={() => goto('/command-center/codebase')}>
						<Icon name="layout-dashboard" size={14} />
						<span>Codebase Dashboard</span>
						<Icon name="arrow-right" size={12} />
					</button>
				</div>

			<!-- ═══ GPU TAB ═══ -->
			{:else if analysisPanel.activeTab === 'gpu'}
				<div class="section">
					<label class="section-label">CUDA Status</label>
					{#if analysisPanel.gpuLoading}
						<div class="loading-row"><div class="spinner-sm"></div><span>Checking GPU...</span></div>
					{:else}
						<div class="gpu-status">
							<div class="status-dot" class:online={analysisPanel.gpuStatus.available}></div>
							<span>{analysisPanel.gpuStatus.available ? 'CUDA Available' : 'CPU Fallback'}</span>
						</div>
						{#if analysisPanel.gpuStatus.queueLength > 0}
							<div class="gpu-queue">Queue: {analysisPanel.gpuStatus.queueLength} tasks</div>
						{/if}
					{/if}
					{#if analysisPanel.gpuError}
						<div class="error-msg">{analysisPanel.gpuError}</div>
					{/if}
				</div>

				<!-- Device Info -->
				{#if analysisPanel.gpuDeviceInfo}
					<div class="section">
						<label class="section-label">Device</label>
						<div class="device-info">
							<div class="device-row">
								<Icon name="cpu" size={12} />
								<span class="device-name">{analysisPanel.gpuDeviceInfo.device || 'Unknown'}</span>
							</div>
							{#if analysisPanel.gpuDeviceInfo.capabilities.length > 0}
								<div class="device-caps">
									{#each analysisPanel.gpuDeviceInfo.capabilities as cap}
										<span class="cap-tag">{cap}</span>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- GPU Compute -->
				<div class="section">
					<label class="section-label">Compute Operations</label>
					<div class="compute-btns">
						<button
							class="action-btn"
							onclick={() => analysisPanel.runGpuCompute('similarity', [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])}
							disabled={analysisPanel.gpuComputeLoading}
						>
							{#if analysisPanel.gpuComputeLoading}
								<div class="spinner-sm"></div>
							{:else}
								<Icon name="git-compare" size={14} />
							{/if}
							<span>Similarity Test</span>
						</button>
						<button
							class="action-btn"
							onclick={() => analysisPanel.runGpuCompute('cluster', [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6], [0.7, 0.8, 0.9]], 2)}
							disabled={analysisPanel.gpuComputeLoading}
						>
							{#if analysisPanel.gpuComputeLoading}
								<div class="spinner-sm"></div>
							{:else}
								<Icon name="layers" size={14} />
							{/if}
							<span>Cluster Test</span>
						</button>
					</div>
				</div>

				<!-- Compute Result -->
				{#if analysisPanel.gpuComputeResult}
					{@const r = analysisPanel.gpuComputeResult}
					<div class="section">
						<label class="section-label">Last Compute Result</label>
						<div class="compute-result">
							<div class="compute-row">
								<span class="compute-label">Operation</span>
								<span class="compute-val">{r.operation}</span>
							</div>
							<div class="compute-row">
								<span class="compute-label">Source</span>
								<span class="compute-source" class:gpu={r.source === 'gpu'}>{r.source.toUpperCase()}</span>
							</div>
							<div class="compute-row">
								<span class="compute-label">Latency</span>
								<span class="compute-val">{r.latencyMs}ms</span>
							</div>
							{#if r.n}
								<div class="compute-row">
									<span class="compute-label">Vectors</span>
									<span class="compute-val">{r.n}{r.dimension ? ` x ${r.dimension}d` : ''}</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<div class="section">
					<label class="section-label">Actions</label>
					<button
						class="action-btn"
						onclick={() => { analysisPanel.invalidateCaches(); analysisPanel.checkGpu(); }}
						disabled={analysisPanel.gpuLoading}
					>
						<Icon name="refresh-cw" size={14} />
						<span>Refresh GPU Status</span>
					</button>
					<button
						class="action-btn"
						onclick={() => analysisPanel.triggerReindex()}
						disabled={analysisPanel.reindexing}
					>
						{#if analysisPanel.reindexing}
							<div class="spinner-sm"></div>
							<span>Reindexing...</span>
						{:else}
							<Icon name="database" size={14} />
							<span>Reindex + Cluster</span>
						{/if}
					</button>
				</div>

				<!-- Navigation -->
				<div class="nav-links">
					<button class="nav-link" onclick={() => goto('/admin/codebase-graph')}>
						<Icon name="git-branch" size={14} />
						<span>Full Dependency Graph</span>
						<Icon name="arrow-right" size={12} />
					</button>
					<button class="nav-link" onclick={() => goto('/admin/gpu-evidence-graph')}>
						<Icon name="cpu" size={14} />
						<span>GPU Evidence Graph</span>
						<Icon name="arrow-right" size={12} />
					</button>
				</div>

			<!-- ═══ RECS TAB ═══ -->
			{:else if analysisPanel.activeTab === 'recs'}
				<div class="section">
					<label class="section-label">ACE Recommendations</label>
					<p class="recs-hint">
						Context-aware suggestions based on your current page ({analysisPanel.contextLabel}).
					</p>
					<button
						class="action-btn"
						onclick={async () => {
							analysisPanel.recsLoading = true;
							analysisPanel.recsError = '';
							try {
								const query = `Analyze the current context: ${analysisPanel.contextLabel} (route: ${analysisPanel.currentRoute}). Provide 3-5 actionable recommendations for improving code quality, fixing errors, or optimizing performance in this area.`;
								const res = await fetch('/api/sse/chat', {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({ message: query, useACE: true }),
								});
								if (res.ok && res.body) {
									const reader = res.body.getReader();
									const decoder = new TextDecoder();
									let text = '';
									while (true) {
										const { done, value } = await reader.read();
										if (done) break;
										const chunk = decoder.decode(value, { stream: true });
										const lines = chunk.split('\n');
										for (const line of lines) {
											if (line.startsWith('data: ')) {
												try {
													const parsed = JSON.parse(line.slice(6));
													if (parsed.text) text += parsed.text;
													else if (parsed.content) text += parsed.content;
													else if (typeof parsed === 'string') text += parsed;
												} catch { /* partial JSON ok */ }
											}
										}
									}
									analysisPanel.aceRecommendations = text || 'No recommendations generated.';
								} else {
									analysisPanel.recsError = 'Failed to get recommendations';
								}
							} catch {
								analysisPanel.recsError = 'ACE service unavailable';
							} finally {
								analysisPanel.recsLoading = false;
							}
						}}
						disabled={analysisPanel.recsLoading}
					>
						{#if analysisPanel.recsLoading}
							<div class="spinner-sm"></div>
							<span>Thinking...</span>
						{:else}
							<Icon name="sparkles" size={14} />
							<span>Get Recommendations</span>
						{/if}
					</button>
				</div>

				{#if analysisPanel.recsError}
					<div class="error-msg">{analysisPanel.recsError}</div>
				{/if}

				{#if analysisPanel.aceRecommendations}
					<div class="section">
						<div class="recs-content">{analysisPanel.aceRecommendations}</div>
						<button class="nav-link" onclick={() => goto('/terminal')}>
							<Icon name="terminal" size={14} />
							<span>Continue in Terminal</span>
							<Icon name="arrow-right" size={12} />
						</button>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Activity Log -->
		{#if analysisPanel.activityLog.length > 0}
			<div class="activity-section">
				<div class="activity-toggle" onclick={() => showActivityLog = !showActivityLog} role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showActivityLog = !showActivityLog; } }}>
					<Icon name={showActivityLog ? 'chevron-down' : 'chevron-up'} size={12} />
					<span>Activity Log ({analysisPanel.activityLog.length})</span>
					<button class="log-clear-btn" onclick={(e) => { e.stopPropagation(); analysisPanel.clearLog(); }} aria-label="Clear log">
						<Icon name="trash-2" size={10} />
					</button>
				</div>
				{#if showActivityLog}
					<div class="activity-log">
						{#each analysisPanel.activityLog.slice(0, 15) as entry}
							<div class="log-entry">
								<span class="log-time">{formatLogTime(entry.timestamp)}</span>
								<span class="log-action">{entry.action}</span>
								<span class="log-detail">{entry.detail}</span>
								{#if entry.durationMs !== undefined}
									<span class="log-duration">{entry.durationMs}ms</span>
								{/if}
								{#if entry.parser}
									<span class="log-parser">{entry.parser}</span>
								{/if}
								{#if entry.source}
									<span class="log-source" class:gpu={entry.source === 'gpu'}>{entry.source}</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Footer -->
		<footer class="panel-footer">
			<kbd class="kbd">Ctrl+Shift+G</kbd> to toggle &middot; <kbd class="kbd">Esc</kbd> to close
		</footer>
	</aside>
{/if}

<style>
	/* ═══ Layout ═══ */
	.panel-backdrop {
		position: fixed;
		inset: 0;
		z-index: 39;
		background: rgba(0, 0, 0, 0.3);
	}

	.analysis-panel {
		position: fixed;
		top: 0;
		right: 0;
		z-index: 40;
		width: 420px;
		max-width: 90vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		background: rgba(12, 10, 8, 0.96);
		border-left: 1px solid rgba(126, 231, 255, 0.12);
		box-shadow: -8px 0 32px rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(16px);
	}

	/* ═══ Header ═══ */
	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(126, 231, 255, 0.1);
		background: rgba(0, 0, 0, 0.3);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: rgba(126, 231, 255, 0.9);
	}

	.header-title {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		color: rgba(214, 211, 209, 0.9);
	}

	.context-badge {
		font-size: 0.6rem;
		padding: 0.1rem 0.4rem;
		background: rgba(126, 231, 255, 0.08);
		border: 1px solid rgba(126, 231, 255, 0.15);
		border-radius: 3px;
		color: rgba(126, 231, 255, 0.7);
		font-family: 'JetBrains Mono', monospace;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.perf-badge {
		font-size: 0.55rem;
		font-family: 'JetBrains Mono', monospace;
		padding: 0.1rem 0.4rem;
		background: rgba(74, 222, 128, 0.08);
		border: 1px solid rgba(74, 222, 128, 0.2);
		border-radius: 3px;
		color: rgba(74, 222, 128, 0.8);
	}

	.close-btn {
		color: rgba(255, 255, 255, 0.4);
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
		border-radius: 4px;
		transition: all 0.15s;
	}

	.close-btn:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.08);
	}

	/* ═══ Tabs ═══ */
	.tab-bar {
		display: flex;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(0, 0, 0, 0.15);
	}

	.tab-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		padding: 0.5rem 0;
		font-size: 0.68rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.35);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tab-btn:hover {
		color: rgba(255, 255, 255, 0.6);
		background: rgba(255, 255, 255, 0.03);
	}

	.tab-btn.active {
		color: rgba(126, 231, 255, 0.9);
		border-bottom-color: rgba(126, 231, 255, 0.7);
		background: rgba(126, 231, 255, 0.04);
	}

	/* ═══ Content ═══ */
	.tab-content {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.section-label {
		font-size: 0.6rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.4);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-family: 'JetBrains Mono', monospace;
	}

	.sub-section {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.sub-label {
		font-size: 0.58rem;
		font-weight: 600;
		color: rgba(168, 85, 247, 0.7);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	/* ═══ Inputs ═══ */
	.input-row {
		display: flex;
		gap: 0.35rem;
	}

	.file-input {
		flex: 1;
		padding: 0.45rem 0.6rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 5px;
		color: rgba(255, 255, 255, 0.85);
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		outline: none;
		transition: border-color 0.15s;
	}

	.file-input:focus {
		border-color: rgba(126, 231, 255, 0.4);
	}

	.file-input::placeholder {
		color: rgba(255, 255, 255, 0.2);
	}

	/* ═══ Buttons ═══ */
	.action-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(126, 231, 255, 0.06);
		border: 1px solid rgba(126, 231, 255, 0.18);
		border-radius: 5px;
		color: rgba(126, 231, 255, 0.8);
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		cursor: pointer;
		transition: all 0.15s;
	}

	.action-btn:hover:not(:disabled) {
		background: rgba(126, 231, 255, 0.12);
		border-color: rgba(126, 231, 255, 0.3);
	}

	.action-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.action-btn-sm {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.45rem;
		background: rgba(168, 85, 247, 0.12);
		border: 1px solid rgba(168, 85, 247, 0.3);
		border-radius: 5px;
		color: #c084fc;
		cursor: pointer;
		transition: all 0.15s;
	}

	.action-btn-sm:hover:not(:disabled) {
		background: rgba(168, 85, 247, 0.2);
	}

	.action-btn-sm:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.prosecute-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(249, 115, 22, 0.1));
		border: 1px solid rgba(239, 68, 68, 0.25);
		border-radius: 5px;
		color: #f87171;
		font-size: 0.75rem;
		font-weight: 600;
		font-family: 'JetBrains Mono', monospace;
		cursor: pointer;
		transition: all 0.15s;
	}

	.prosecute-btn:hover {
		background: linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(249, 115, 22, 0.18));
		border-color: rgba(239, 68, 68, 0.4);
	}

	/* ═══ Display elements ═══ */
	.route-display {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.7);
		padding: 0.4rem 0.6rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.case-id-display {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.68rem;
		color: rgba(168, 85, 247, 0.7);
		font-family: 'JetBrains Mono', monospace;
	}

	/* ═══ Health Grade ═══ */
	.health-grade {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 6px;
	}

	.grade-letter {
		font-size: 1.5rem;
		font-weight: 800;
		font-family: 'JetBrains Mono', monospace;
		color: var(--gc, #fff);
		text-shadow: 0 0 10px var(--gc, #fff);
		min-width: 2rem;
		text-align: center;
	}

	.grade-meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		font-size: 0.62rem;
		color: rgba(255, 255, 255, 0.45);
		font-family: 'JetBrains Mono', monospace;
	}

	.perf-inline {
		color: rgba(74, 222, 128, 0.7);
	}

	.ai-summary {
		font-size: 0.75rem;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.8);
		margin: 0;
	}

	.risk-item {
		display: flex;
		align-items: flex-start;
		gap: 0.35rem;
		font-size: 0.7rem;
		color: #fbbf24;
		line-height: 1.4;
	}

	.sug-item {
		display: flex;
		align-items: flex-start;
		gap: 0.35rem;
		font-size: 0.7rem;
		color: #4ade80;
		line-height: 1.4;
	}

	/* ═══ Perf Bar ═══ */
	.perf-bar {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.58rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.4);
		padding: 0.25rem 0.5rem;
		background: rgba(74, 222, 128, 0.04);
		border-radius: 3px;
	}

	.perf-parser {
		color: rgba(126, 231, 255, 0.6);
	}

	.perf-simd {
		padding: 0 0.25rem;
		background: rgba(74, 222, 128, 0.12);
		border: 1px solid rgba(74, 222, 128, 0.2);
		border-radius: 2px;
		color: rgba(74, 222, 128, 0.8);
		font-size: 0.5rem;
		font-weight: 700;
	}

	/* ═══ Stats Grid ═══ */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}

	.stat-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.6rem 0.4rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 6px;
	}

	.stat-val {
		font-size: 1.1rem;
		font-weight: 700;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.9);
	}

	.stat-lbl {
		font-size: 0.55rem;
		color: rgba(255, 255, 255, 0.35);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	/* ═══ Clusters ═══ */
	.cluster-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.cluster-card {
		padding: 0.5rem 0.6rem;
		background: rgba(168, 85, 247, 0.04);
		border: 1px solid rgba(168, 85, 247, 0.12);
		border-radius: 5px;
	}

	.cluster-header {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.cluster-count {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
		font-weight: 700;
		color: #c084fc;
		min-width: 2rem;
		flex-shrink: 0;
	}

	.cluster-summary {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.65);
		line-height: 1.4;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.cluster-codes {
		display: flex;
		gap: 0.25rem;
		margin-top: 0.3rem;
		flex-wrap: wrap;
	}

	.code-tag {
		font-size: 0.58rem;
		font-family: 'JetBrains Mono', monospace;
		padding: 0.1rem 0.35rem;
		background: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.15);
		border-radius: 3px;
		color: rgba(248, 113, 113, 0.8);
	}

	/* ═══ Error codes ═══ */
	.code-list {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.code-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.3rem 0.5rem;
		border-radius: 4px;
	}

	.code-row:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	.code-name {
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.65);
	}

	.code-count {
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(248, 113, 113, 0.7);
	}

	/* ═══ Related Files ═══ */
	.related-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.related-item {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.35rem 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 4px;
	}

	.related-item:hover {
		background: rgba(6, 182, 212, 0.06);
		border-color: rgba(6, 182, 212, 0.15);
	}

	.related-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.related-path {
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.75);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.related-score {
		font-size: 0.6rem;
		font-family: 'JetBrains Mono', monospace;
		color: #22d3ee;
		flex-shrink: 0;
	}

	.related-symbol {
		font-size: 0.58rem;
		color: rgba(255, 255, 255, 0.3);
		font-family: 'JetBrains Mono', monospace;
	}

	/* ═══ GPU ═══ */
	.gpu-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #ef4444;
		flex-shrink: 0;
	}

	.status-dot.online {
		background: #4ade80;
		box-shadow: 0 0 6px rgba(74, 222, 128, 0.5);
	}

	.gpu-queue {
		font-size: 0.68rem;
		color: rgba(255, 200, 100, 0.7);
		font-family: 'JetBrains Mono', monospace;
	}

	/* ═══ Device Info ═══ */
	.device-info {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.5rem 0.6rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 5px;
	}

	.device-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.device-name {
		font-size: 0.72rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.8);
	}

	.device-caps {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.cap-tag {
		font-size: 0.52rem;
		font-family: 'JetBrains Mono', monospace;
		padding: 0.05rem 0.3rem;
		background: rgba(126, 231, 255, 0.06);
		border: 1px solid rgba(126, 231, 255, 0.12);
		border-radius: 2px;
		color: rgba(126, 231, 255, 0.6);
	}

	/* ═══ Compute ═══ */
	.compute-btns {
		display: flex;
		gap: 0.4rem;
	}

	.compute-btns .action-btn {
		flex: 1;
	}

	.compute-result {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem 0.6rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 5px;
	}

	.compute-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.compute-label {
		font-size: 0.62rem;
		color: rgba(255, 255, 255, 0.35);
		font-family: 'JetBrains Mono', monospace;
		text-transform: uppercase;
	}

	.compute-val {
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.8);
	}

	.compute-source {
		font-size: 0.6rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 700;
		padding: 0.05rem 0.35rem;
		border-radius: 3px;
		background: rgba(239, 68, 68, 0.1);
		color: rgba(248, 113, 113, 0.8);
		border: 1px solid rgba(239, 68, 68, 0.2);
	}

	.compute-source.gpu {
		background: rgba(74, 222, 128, 0.1);
		color: rgba(74, 222, 128, 0.9);
		border-color: rgba(74, 222, 128, 0.25);
	}

	/* ═══ Activity Log ═══ */
	.activity-section {
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(0, 0, 0, 0.2);
	}

	.activity-toggle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.4rem 1rem;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.35);
		font-size: 0.58rem;
		font-family: 'JetBrains Mono', monospace;
		cursor: pointer;
		transition: color 0.15s;
	}

	.activity-toggle:hover {
		color: rgba(255, 255, 255, 0.6);
	}

	.log-clear-btn {
		margin-left: auto;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.2);
		cursor: pointer;
		padding: 0.15rem;
		display: flex;
		align-items: center;
		border-radius: 3px;
	}

	.log-clear-btn:hover {
		color: rgba(248, 113, 113, 0.7);
	}

	.activity-log {
		max-height: 180px;
		overflow-y: auto;
		padding: 0 0.75rem 0.5rem;
	}

	.log-entry {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.2rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
		font-family: 'JetBrains Mono', monospace;
		flex-wrap: wrap;
	}

	.log-time {
		font-size: 0.52rem;
		color: rgba(255, 255, 255, 0.25);
		flex-shrink: 0;
	}

	.log-action {
		font-size: 0.55rem;
		color: rgba(126, 231, 255, 0.6);
		flex-shrink: 0;
	}

	.log-detail {
		font-size: 0.52rem;
		color: rgba(255, 255, 255, 0.45);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.log-duration {
		font-size: 0.5rem;
		color: rgba(74, 222, 128, 0.6);
		flex-shrink: 0;
	}

	.log-parser {
		font-size: 0.48rem;
		padding: 0 0.2rem;
		background: rgba(126, 231, 255, 0.06);
		border-radius: 2px;
		color: rgba(126, 231, 255, 0.5);
		flex-shrink: 0;
	}

	.log-source {
		font-size: 0.48rem;
		padding: 0 0.2rem;
		background: rgba(239, 68, 68, 0.08);
		border-radius: 2px;
		color: rgba(248, 113, 113, 0.6);
		flex-shrink: 0;
	}

	.log-source.gpu {
		background: rgba(74, 222, 128, 0.08);
		color: rgba(74, 222, 128, 0.7);
	}

	/* ═══ Navigation Links ═══ */
	.nav-links {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-top: 0.5rem;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.6rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 5px;
		color: rgba(255, 255, 255, 0.55);
		font-size: 0.72rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.nav-link span {
		flex: 1;
	}

	.nav-link:hover {
		background: rgba(126, 231, 255, 0.06);
		border-color: rgba(126, 231, 255, 0.15);
		color: rgba(255, 255, 255, 0.8);
	}

	/* ═══ Recs ═══ */
	.recs-hint {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.4);
		line-height: 1.5;
		margin: 0;
	}

	.recs-content {
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.75);
		line-height: 1.6;
		white-space: pre-wrap;
		padding: 0.6rem;
		background: rgba(168, 85, 247, 0.04);
		border: 1px solid rgba(168, 85, 247, 0.12);
		border-radius: 5px;
		max-height: 300px;
		overflow-y: auto;
	}

	/* ═══ Page Components ═══ */
	.section-header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.toggle-btn {
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.35);
		cursor: pointer;
		padding: 0.15rem;
		display: flex;
		align-items: center;
		border-radius: 3px;
	}

	.toggle-btn:hover {
		color: rgba(255, 255, 255, 0.7);
	}

	.component-summary {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.68rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.55);
		padding: 0.35rem 0.5rem;
		background: rgba(126, 231, 255, 0.04);
		border: 1px solid rgba(126, 231, 255, 0.08);
		border-radius: 4px;
	}

	.comp-count {
		font-weight: 700;
		color: rgba(126, 231, 255, 0.85);
	}

	.comp-sep {
		color: rgba(255, 255, 255, 0.15);
	}

	.comp-detail {
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.6rem;
	}

	.component-tree {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.4rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 5px;
		max-height: 220px;
		overflow-y: auto;
	}

	.tree-group {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.tree-label {
		font-size: 0.56rem;
		font-weight: 600;
		color: rgba(168, 85, 247, 0.65);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-family: 'JetBrains Mono', monospace;
	}

	.tree-file {
		font-size: 0.64rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.6);
		padding: 0.1rem 0.4rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tree-file.api {
		color: rgba(34, 211, 238, 0.7);
	}

	.tree-more {
		font-size: 0.58rem;
		color: rgba(255, 255, 255, 0.3);
		padding: 0.1rem 0.4rem;
		font-style: italic;
	}

	/* ═══ Runtime Issues ═══ */
	.issues-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.issue-item {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		padding: 0.3rem 0.5rem;
		background: rgba(239, 68, 68, 0.04);
		border: 1px solid rgba(239, 68, 68, 0.08);
		border-left: 2px solid var(--sev-color, rgba(255, 255, 255, 0.3));
		border-radius: 4px;
	}

	.issue-sev {
		font-size: 0.52rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 700;
		color: var(--sev-color, rgba(255, 255, 255, 0.5));
		text-transform: uppercase;
		flex-shrink: 0;
		min-width: 2.5rem;
	}

	.issue-msg {
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.65);
		line-height: 1.4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ═══ Diagnosis ═══ */
	.diag-btns {
		display: flex;
		gap: 0.35rem;
	}

	.diag-btns .action-btn {
		flex: 1;
	}

	.diag-btns .action-btn.primary-action {
		background: rgba(126, 231, 255, 0.1);
		border-color: rgba(126, 231, 255, 0.25);
		color: rgba(126, 231, 255, 0.95);
	}

	.diag-btns .action-btn.primary-action:hover:not(:disabled) {
		background: rgba(126, 231, 255, 0.18);
		border-color: rgba(126, 231, 255, 0.4);
	}

	.diagnosis-inline {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.5rem 0.6rem;
		background: rgba(126, 231, 255, 0.03);
		border: 1px solid rgba(126, 231, 255, 0.1);
		border-radius: 5px;
	}

	.diag-header-row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.risk-badge {
		font-size: 0.55rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 700;
		text-transform: uppercase;
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
		background: rgba(74, 222, 128, 0.1);
		color: rgba(74, 222, 128, 0.8);
		border: 1px solid rgba(74, 222, 128, 0.2);
	}

	.risk-badge.medium {
		background: rgba(251, 191, 36, 0.1);
		color: rgba(251, 191, 36, 0.8);
		border-color: rgba(251, 191, 36, 0.2);
	}

	.risk-badge.high {
		background: rgba(239, 68, 68, 0.1);
		color: rgba(248, 113, 113, 0.8);
		border-color: rgba(239, 68, 68, 0.2);
	}

	.cause-tag {
		font-size: 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		padding: 0.05rem 0.35rem;
		background: rgba(168, 85, 247, 0.08);
		border: 1px solid rgba(168, 85, 247, 0.15);
		border-radius: 3px;
		color: rgba(192, 132, 252, 0.8);
	}

	.mode-tag {
		font-size: 0.48rem;
		font-family: 'JetBrains Mono', monospace;
		padding: 0.05rem 0.3rem;
		background: rgba(126, 231, 255, 0.06);
		border: 1px solid rgba(126, 231, 255, 0.12);
		border-radius: 2px;
		color: rgba(126, 231, 255, 0.5);
		text-transform: uppercase;
	}

	.review-tag {
		display: flex;
		align-items: center;
		color: rgba(251, 191, 36, 0.7);
	}

	.unsafe-tag {
		font-size: 0.48rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 700;
		padding: 0.1rem 0.3rem;
		background: rgba(239, 68, 68, 0.15);
		color: rgba(248, 113, 113, 0.8);
		border-radius: 2px;
		text-transform: uppercase;
	}

	.fix-step {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.65);
		line-height: 1.4;
	}

	.step-num {
		font-family: 'JetBrains Mono', monospace;
		font-weight: 700;
		color: rgba(126, 231, 255, 0.7);
		min-width: 1.2rem;
		flex-shrink: 0;
	}

	.step-action {
		font-family: 'JetBrains Mono', monospace;
	}

	/* ═══ Suggested Tests ═══ */
	.test-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.62rem;
		font-family: 'JetBrains Mono', monospace;
	}

	.test-type {
		font-weight: 700;
		color: rgba(34, 211, 238, 0.7);
		text-transform: uppercase;
		font-size: 0.52rem;
		flex-shrink: 0;
		min-width: 3rem;
	}

	.test-target {
		color: rgba(255, 255, 255, 0.6);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ═══ Evidence ═══ */
	.evidence-item {
		display: flex;
		align-items: flex-start;
		gap: 0.35rem;
		font-size: 0.58rem;
		font-family: 'JetBrains Mono', monospace;
		padding: 0.2rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
	}

	.ev-kind {
		font-size: 0.48rem;
		font-weight: 700;
		color: rgba(126, 231, 255, 0.5);
		text-transform: uppercase;
		flex-shrink: 0;
		min-width: 4.5rem;
	}

	.ev-snippet {
		color: rgba(255, 255, 255, 0.5);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	/* ═══ Diagnosis Sources ═══ */
	.diag-sources {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.52rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.3);
		padding: 0.25rem 0.4rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 3px;
		margin-top: 0.2rem;
	}

	/* ═══ Likely Files ═══ */
	.likely-file {
		font-size: 0.58rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(126, 231, 255, 0.6);
		padding: 0.1rem 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ═══ Diagnosis Perf ═══ */
	.diag-perf {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.25);
		margin-top: 0.15rem;
	}

	.perf-total {
		font-weight: 700;
	}

	.perf-cached {
		padding: 0.05rem 0.25rem;
		background: rgba(52, 211, 153, 0.15);
		color: rgba(52, 211, 153, 0.6);
		border-radius: 2px;
		text-transform: uppercase;
		font-size: 0.45rem;
		font-weight: 700;
	}

	.diag-feedback {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.3rem;
		padding-top: 0.3rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.feedback-label {
		font-size: 0.55rem;
		color: rgba(255, 255, 255, 0.3);
		font-family: 'JetBrains Mono', monospace;
	}

	.feedback-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 3px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: transparent;
		color: rgba(255, 255, 255, 0.35);
		cursor: pointer;
		transition: all 0.15s;
	}

	.feedback-btn:hover:not(:disabled) {
		border-color: rgba(255, 255, 255, 0.25);
		color: rgba(255, 255, 255, 0.7);
		background: rgba(255, 255, 255, 0.05);
	}

	.feedback-btn:disabled {
		cursor: default;
		opacity: 0.4;
	}

	.feedback-btn.active-good {
		border-color: rgba(52, 211, 153, 0.4);
		color: rgba(52, 211, 153, 0.8);
		background: rgba(52, 211, 153, 0.1);
		opacity: 1;
	}

	.feedback-btn.active-bad {
		border-color: rgba(239, 68, 68, 0.4);
		color: rgba(239, 68, 68, 0.8);
		background: rgba(239, 68, 68, 0.1);
		opacity: 1;
	}

	.feedback-ack {
		font-size: 0.5rem;
		color: rgba(52, 211, 153, 0.5);
		font-family: 'JetBrains Mono', monospace;
	}

	/* ═══ Similar Diagnoses ═══ */
	.similar-section {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}
	.similar-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		padding: 0.2rem 0.5rem;
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.55rem;
		font-family: 'JetBrains Mono', monospace;
		cursor: pointer;
		transition: all 0.15s;
	}
	.similar-toggle:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.7);
	}
	.similar-list {
		margin-top: 0.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.similar-item {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: 0.35rem 0.5rem;
	}
	.sim-header {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-bottom: 0.2rem;
	}
	.sim-score {
		font-size: 0.55rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 700;
		color: #4ade80;
		min-width: 2rem;
	}
	.sim-source {
		font-size: 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		color: rgba(255, 255, 255, 0.3);
		margin-left: auto;
	}
	.sim-diagnosis {
		font-size: 0.55rem;
		color: rgba(255, 255, 255, 0.5);
		line-height: 1.3;
		margin: 0;
		word-break: break-word;
	}
	.sim-empty {
		font-size: 0.55rem;
		color: rgba(255, 255, 255, 0.3);
		font-style: italic;
		margin-top: 0.3rem;
	}

	/* ═══ Tab Badge ═══ */
	.tab-badge {
		font-size: 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 700;
		padding: 0 0.3rem;
		min-width: 1rem;
		text-align: center;
		background: rgba(239, 68, 68, 0.2);
		color: #f87171;
		border-radius: 8px;
	}

	/* ═══ Shared ═══ */
	.loading-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.72rem;
		color: rgba(168, 85, 247, 0.7);
	}

	.error-msg {
		font-size: 0.7rem;
		color: #f87171;
		padding: 0.4rem 0.6rem;
		background: rgba(239, 68, 68, 0.06);
		border-radius: 4px;
	}

	.empty-msg {
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.25);
		text-align: center;
		padding: 1rem;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(126, 231, 255, 0.2);
		border-top-color: rgba(126, 231, 255, 0.8);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	.spinner-sm {
		width: 12px;
		height: 12px;
		border: 1.5px solid rgba(168, 85, 247, 0.2);
		border-top-color: #a855f7;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	/* ═══ Footer ═══ */
	.panel-footer {
		padding: 0.5rem 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
		font-size: 0.58rem;
		color: rgba(255, 255, 255, 0.25);
		text-align: center;
		font-family: 'JetBrains Mono', monospace;
	}

	.kbd {
		display: inline-block;
		padding: 0 0.3rem;
		font-size: 0.55rem;
		font-family: 'JetBrains Mono', monospace;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		color: rgba(255, 255, 255, 0.4);
	}
</style>
