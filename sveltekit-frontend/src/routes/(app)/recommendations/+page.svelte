<script lang="ts">
	import RecommendationWidget from '$lib/components/recommendations/RecommendationWidget.svelte';
	import RecommendationEngine from '$lib/components/ai/RecommendationEngine.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface UserPreferences {
		topicPreferences: Array<{ topicId: number; weight: number }>;
		recentInteractions: Array<{
			documentId: string;
			interactionType: string;
			timestamp: string;
			searchContext?: string;
		}>;
		stats: {
			totalInteractions: number;
			uniqueDocuments: number;
			topInteractionType: string;
		};
	}

	let query = $state('');
	let activeQuery = $state('legal case analysis');
	let caseId = $state('');
	let preferences = $state<UserPreferences | null>(null);
	let prefsLoading = $state(false);
	let prefsError = $state<string | null>(null);
	let activeTab = $state<'documents' | 'strategy' | 'diagnostics'>('documents');
	let appliedRecommendations = $state<string[]>([]);
	let gpuRerank = $state(false);

	interface DiagnosedSpec {
		specId: string;
		events: string[];
		path: string[];
		recommendation: {
			state: string;
			stateLabel: string;
			recommendation: string;
			timestamp: string;
			triggerCondition: string;
		} | null;
	}

	let diagnosedSpecs = $state<DiagnosedSpec[]>([]);
	let loadingDiagnostics = $state(false);
	let diagnosticsError = $state<string | null>(null);

	let simSpecId = $state('spec_id_101');
	let simEvent = $state('TSC_ERR');

	$effect(() => {
		fetchPreferences();
	});

	$effect(() => {
		if (activeTab === 'diagnostics') {
			fetchDiagnostics();
		}
	});

	async function fetchDiagnostics() {
		loadingDiagnostics = true;
		diagnosticsError = null;
		try {
			const res = await fetch('/api/tasks/hmm-diagnosis');
			if (res.ok) {
				const data = await res.json();
				if (data.success) {
					diagnosedSpecs = data.data || [];
				} else {
					diagnosticsError = data.error || 'Failed to fetch diagnostics';
				}
			} else {
				diagnosticsError = `Server returned status ${res.status}`;
			}
		} catch (err) {
			diagnosticsError = err instanceof Error ? err.message : 'Failed to load diagnostics';
		} finally {
			loadingDiagnostics = false;
		}
	}

	async function triggerSimulatedEvent() {
		const specId = simSpecId.trim();
		const event = simEvent.trim();
		if (!specId || !event) return;
		try {
			const res = await fetch('/api/tasks/hmm-diagnosis', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ specId, event })
			});
			if (res.ok) {
				const data = await res.json();
				if (data.success) {
					await fetchDiagnostics();
				}
			}
		} catch (err) {
			console.error('[HMM Sim] Error triggering event:', err);
		}
	}

	async function fetchPreferences() {
		prefsLoading = true;
		prefsError = null;
		try {
			const res = await fetch('/api/recommendations');
			if (res.ok) {
				const data = await res.json();
				if (data.success) {
					preferences = data.data;
				}
			}
		} catch (err) {
			prefsError = err instanceof Error ? err.message : 'Failed to load preferences';
		} finally {
			prefsLoading = false;
		}
	}

	function handleSearch() {
		if (query.trim()) {
			activeQuery = query.trim();
		}
	}

	function handleDocumentSelect(doc: any) {
		activeQuery = doc.title || 'document analysis';
	}

	function handleStrategyApply(recommendation: any) {
		appliedRecommendations = [...appliedRecommendations, recommendation.id];
	}

	function getInteractionIcon(type: string): string {
		const icons: Record<string, string> = {
			view: 'eye',
			click: 'mouse-pointer-click',
			save: 'bookmark',
			share: 'share-2',
			dismiss: 'x'
		};
		return icons[type] || 'activity';
	}
</script>

<svelte:head>
	<title>AI Recommendations - Personalized Intelligence</title>
</svelte:head>

<div class="rec-page">
	<!-- Header -->
	<div class="rec-header">
		<div class="rec-header-left">
			<div class="rec-header-icon">
				<Icon name="sparkles" />
			</div>
			<div>
				<h1 class="rec-title">AI Recommendations</h1>
				<p class="rec-subtitle">5-signal multi-modal ranking + legal strategy engine</p>
			</div>
		</div>
		<div class="rec-tab-bar">
			<button
				type="button"
				class="rec-tab"
				class:active={activeTab === 'documents'}
				onclick={() => { activeTab = 'documents'; }}
			>
				<Icon name="file-text" />
				Document Recommendations
			</button>
			<button
				type="button"
				class="rec-tab"
				class:active={activeTab === 'strategy'}
				onclick={() => { activeTab = 'strategy'; }}
			>
				<Icon name="brain" />
				Strategy Engine
			</button>
			<button
				type="button"
				class="rec-tab"
				class:active={activeTab === 'diagnostics'}
				onclick={() => { activeTab = 'diagnostics'; }}
			>
				<Icon name="activity" />
				Kanban HMM Diagnostics
			</button>
		</div>
	</div>

	<!-- Search Bar -->
	<div class="rec-search-panel">
		<form onsubmit={(e) => { e.preventDefault(); handleSearch(); }} class="rec-search-form">
			<div class="rec-search-wrap">
				<Icon name="search" class="rec-search-icon" />
				<input
					type="text"
					bind:value={query}
					placeholder="Search for recommendations... (e.g., contract dispute evidence, defense strategy)"
					class="rec-search-input"
				/>
			</div>
			<input
				type="text"
				bind:value={caseId}
				placeholder="Case ID (optional)"
				class="rec-case-input"
			/>
			<Button onclick={handleSearch}>Search</Button>
		</form>
	</div>

	<!-- Signal Weights Legend -->
	<div class="rec-signals-panel">
		<div class="rec-signals-header">
			<Icon name="sliders" />
			<h3>5-Signal Ranking System</h3>
		</div>
		<div class="rec-signals-grid">
			<div class="rec-signal">
				<div class="rec-signal-pct">35%</div>
				<div class="rec-signal-name">Vector Similarity</div>
				<div class="rec-signal-desc">Embedding cosine</div>
			</div>
			<div class="rec-signal">
				<div class="rec-signal-pct">20%</div>
				<div class="rec-signal-name">Tag Overlap</div>
				<div class="rec-signal-desc">Jaccard similarity</div>
			</div>
			<div class="rec-signal">
				<div class="rec-signal-pct">20%</div>
				<div class="rec-signal-name">Topic Affinity</div>
				<div class="rec-signal-desc">K-means clusters</div>
			</div>
			<div class="rec-signal">
				<div class="rec-signal-pct">15%</div>
				<div class="rec-signal-name">Graph Centrality</div>
				<div class="rec-signal-desc">Neo4j connections</div>
			</div>
			<div class="rec-signal">
				<div class="rec-signal-pct">10%</div>
				<div class="rec-signal-name">Profile Match</div>
				<div class="rec-signal-desc">User preferences</div>
			</div>
		</div>
	</div>

	<!-- Main Content -->
	<div class="rec-content">
		<!-- Left: Main Recommendations Area -->
		<div class="rec-main">
			{#if activeTab === 'documents'}
				<RecommendationWidget
					query={activeQuery}
					{caseId}
					onSelect={handleDocumentSelect}
					limit={10}
					enableGPURerank={gpuRerank}
				/>
			{:else if activeTab === 'strategy'}
				<RecommendationEngine
					{caseId}
					contextQuery={activeQuery}
					onapply={handleStrategyApply}
				/>
			{:else}
				<!-- Diagnostics Panel -->
				<div class="rec-diagnostics-container">
					<!-- Telemetry Simulator Widget -->
					<div class="rec-simulator-panel">
						<div class="rec-simulator-header">
							<Icon name="sliders" class="rec-icon-gold" />
							<h3>HMM Kanban Telemetry Simulator</h3>
						</div>
						<p class="rec-simulator-desc">
							Simulate development events flowing into Valkey. Emit events for any <code>spec_id</code> to progress the Hidden Markov Model.
						</p>
						<div class="rec-simulator-form">
							<div class="rec-input-group">
								<label for="sim-spec-id">Spec ID / Card ID</label>
								<input
									id="sim-spec-id"
									type="text"
									bind:value={simSpecId}
									placeholder="e.g. spec_id_101"
									class="rec-sim-input"
								/>
							</div>
							<div class="rec-input-group">
								<label for="sim-event">Telemetry Event</label>
								<select id="sim-event" bind:value={simEvent} class="rec-sim-select">
									<option value="TSC_ERR">V1: tsc errors cached across directories (TSC_ERR)</option>
									<option value="MQ_NACK">V2: RabbitMQ payload nack / validation failure (MQ_NACK)</option>
									<option value="CACHE_HIT_STALE">V3: High hot-cache hits (CACHE_HIT_STALE)</option>
									<option value="GRAPH_HOTSPOT">V4: Graph hotspot detection (GRAPH_HOTSPOT)</option>
									<option value="MQ_ACK">Other: RabbitMQ ACK / Normal CRUD edit (MQ_ACK)</option>
									<option value="COMMIT">Other: Code commit (COMMIT)</option>
								</select>
							</div>
							<button
								type="button"
								class="rec-btn-gold"
								onclick={triggerSimulatedEvent}
							>
								Emit Telemetry Event
							</button>
						</div>
					</div>

					<!-- Active Diagnostics Cards -->
					<div class="rec-diagnostics-header">
						<Icon name="activity" />
						<h2>Active Task Diagnostics ({diagnosedSpecs.length})</h2>
					</div>

					{#if loadingDiagnostics}
						<div class="rec-skeleton-area">
							<div class="skel-block" style="height: 10rem; width: 100%;"></div>
							<div class="skel-block" style="height: 10rem; width: 100%;"></div>
						</div>
					{:else if diagnosticsError}
						<div class="rec-error">{diagnosticsError}</div>
					{:else if diagnosedSpecs.length === 0}
						<div class="rec-empty-diagnostics">
							<Icon name="alert-circle" />
							<p>No active task loops detected in Valkey cache.</p>
							<p class="sub">Use the Telemetry Simulator above to generate your first telemetry progression events.</p>
						</div>
					{:else}
						<div class="rec-diagnostics-grid">
							{#each diagnosedSpecs as spec}
								{@const finalState = spec.path[spec.path.length - 1] || 'S1'}
								<div class="rec-diag-card state-{finalState}">
									<div class="rec-diag-card-header">
										<span class="rec-diag-spec-id">Spec ID: {spec.specId}</span>
										<span class="rec-diag-badge state-{finalState}">
											{finalState === 'S1' ? 'S1: Healthy' :
											 finalState === 'S2' ? 'S2: Schema Bloat' :
											 finalState === 'S3' ? 'S3: Regression Trap' : 'S4: Stale / Abandoned'}
										</span>
									</div>

									<!-- Telemetry logs -->
									<div class="rec-diag-section">
										<div class="rec-section-label-small">Telemetry Sequence (Valkey Sliding Window)</div>
										<div class="rec-sequence-flow">
											{#each spec.events as ev, i}
												<span class="rec-sequence-item">{ev}</span>
												{#if i < spec.events.length - 1}
													<span class="rec-sequence-arrow">➔</span>
												{/if}
											{/each}
										</div>
									</div>

									<!-- Decoded hidden states path -->
									<div class="rec-diag-section">
										<div class="rec-section-label-small">Decoded Hidden States Path (Viterbi)</div>
										<div class="rec-sequence-flow font-mono">
											{#each spec.path as st, i}
												<span class="rec-sequence-state state-{st}">{st}</span>
												{#if i < spec.path.length - 1}
													<span class="rec-sequence-arrow">➔</span>
												{/if}
											{/each}
										</div>
									</div>

									<!-- Recommendation Card -->
									{#if spec.recommendation}
										<div class="rec-diag-recommendation-box state-{finalState}">
											<div class="rec-diag-reco-title">
												<Icon name="info" />
												<span>Automated Recommendation</span>
											</div>
											<p class="rec-diag-reco-text">
												"{spec.recommendation.recommendation}"
											</p>
											<p class="rec-diag-reco-trigger">
												<strong>Trigger Condition:</strong> {spec.recommendation.triggerCondition}
											</p>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Right: User Profile & History -->
		<div class="rec-sidebar">
			<!-- User Preferences Panel -->
			<div class="rec-panel">
				<div class="rec-panel-header">
					<div class="rec-panel-title">
						<Icon name="user" />
						<h3>Your Profile</h3>
					</div>
					<button
						type="button"
						onclick={fetchPreferences}
						class="rec-refresh-btn"
						title="Refresh"
					>
						<Icon name="refresh-cw" class={prefsLoading ? 'animate-spin' : ''} />
					</button>
				</div>

				{#if prefsError}
					<div class="rec-error">{prefsError}</div>
				{:else if preferences}
					<!-- Interaction Stats -->
					<div class="rec-stats-grid">
						<div class="rec-stat-card">
							<div class="rec-stat-num">{preferences.stats?.totalInteractions ?? 0}</div>
							<div class="rec-stat-label">Interactions</div>
						</div>
						<div class="rec-stat-card">
							<div class="rec-stat-num">{preferences.stats?.uniqueDocuments ?? 0}</div>
							<div class="rec-stat-label">Documents</div>
						</div>
					</div>

					<!-- Topic Preferences -->
					{#if preferences.topicPreferences?.length > 0}
						<div class="rec-section">
							<div class="rec-section-label">Topic Preferences</div>
							<div class="rec-topic-list">
								{#each preferences.topicPreferences.slice(0, 5) as pref}
									<div class="rec-topic-row">
										<div class="rec-topic-name">Topic {pref.topicId}</div>
										<div class="rec-topic-bar-track">
											<div
												class="rec-topic-bar-fill"
												style="width: {Math.round(pref.weight * 100)}%"
											></div>
										</div>
										<div class="rec-topic-pct">{Math.round(pref.weight * 100)}%</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Recent Interactions -->
					{#if preferences.recentInteractions?.length > 0}
						<div class="rec-section">
							<div class="rec-section-label">Recent Activity</div>
							<div class="rec-activity-list">
								{#each preferences.recentInteractions.slice(0, 8) as interaction}
									<div class="rec-activity-row">
										<Icon name={getInteractionIcon(interaction.interactionType)} class="rec-activity-icon" />
										<div class="rec-activity-info">
											<div class="rec-activity-title">{interaction.searchContext || interaction.documentId}</div>
											<div class="rec-activity-date">{new Date(interaction.timestamp).toLocaleDateString()}</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{:else if prefsLoading}
					<div class="rec-skeleton-area">
						<div class="rec-stats-grid">
							<div class="rec-stat-card skeleton">
								<div class="skel-block skel-num"></div>
								<div class="skel-block skel-label"></div>
							</div>
							<div class="rec-stat-card skeleton">
								<div class="skel-block skel-num"></div>
								<div class="skel-block skel-label"></div>
							</div>
						</div>
						<div class="rec-skeleton-bars">
							<div class="skel-block skel-bar-label"></div>
							<div class="skel-block skel-bar"></div>
							<div class="skel-block skel-bar short"></div>
							<div class="skel-block skel-bar shorter"></div>
						</div>
					</div>
				{:else}
					<div class="rec-empty">
						No interaction history yet. Start searching to build your profile.
					</div>
				{/if}
			</div>

			<!-- Applied Recommendations -->
			{#if appliedRecommendations.length > 0}
				<div class="rec-panel">
					<div class="rec-panel-title">
						<Icon name="circle-check" class="rec-icon-green" />
						<h3>Applied ({appliedRecommendations.length})</h3>
					</div>
					<div class="rec-applied-text">
						{appliedRecommendations.length} recommendation{appliedRecommendations.length > 1 ? 's' : ''} applied this session
					</div>
				</div>
			{/if}

			<!-- GPU Rerank Toggle -->
			<div class="rec-panel">
				<div class="rec-panel-header">
					<div class="rec-panel-title">
						<Icon name="cpu" class="rec-icon-green" />
						<h3>GPU Reranking</h3>
					</div>
					<button
						type="button"
						class="rec-toggle"
						class:on={gpuRerank}
						onclick={() => { gpuRerank = !gpuRerank; }}
					>
						<div class="rec-toggle-thumb"></div>
					</button>
				</div>
				<p class="rec-panel-desc">
					{gpuRerank ? 'WebGPU cosine similarity active — blending 70% server + 30% GPU scores' : 'Enable client-side GPU reranking via RTX 3060 Ti'}
				</p>
			</div>

			<!-- Architecture Info -->
			<div class="rec-panel">
				<div class="rec-panel-title">
					<Icon name="cpu" />
					<h3>Architecture</h3>
				</div>
				<ul class="rec-arch-list">
					<li><Icon name="check" class="rec-check-icon" /><span>Multi-modal ranker (5 signals)</span></li>
					<li><Icon name="check" class="rec-check-icon" /><span>K-means++ topic clustering (k=15)</span></li>
					<li><Icon name="check" class="rec-check-icon" /><span>User history with 7-day decay</span></li>
					<li><Icon name="check" class="rec-check-icon" /><span>WebGPU cosine similarity (RTX 3060 Ti)</span></li>
					<li><Icon name="check" class="rec-check-icon" /><span>Qdrant vector search (768-dim)</span></li>
					<li><Icon name="check" class="rec-check-icon" /><span>ACE context engine (7 sources)</span></li>
					<li><Icon name="check" class="rec-check-icon" /><span>Neo4j graph centrality (degree)</span></li>
				</ul>
			</div>
		</div>
	</div>
</div>

<style>
	/* ── Page layout ── */
	.rec-page {
		min-height: 100vh;
		background: #0e0d0b;
		margin: -2.5rem;
		padding: 1.5rem max(1.5rem, calc(50% - 40rem));
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.rec-page :global(h1), .rec-page :global(h2), .rec-page :global(h3), .rec-page :global(h4), .rec-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.rec-page :global(a) { color: inherit; border-bottom: none; }
	.rec-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.rec-page :global(input), .rec-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.rec-page :global(.panel), .rec-page :global(.card), .rec-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* ── Header ── */
	.rec-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.rec-header-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.rec-header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.625rem;
		background: linear-gradient(135deg, rgba(96, 165, 250, 0.15), rgba(167, 139, 250, 0.15));
		border: 1px solid rgba(96, 165, 250, 0.25);
		color: rgba(96, 165, 250, 0.9);
		flex-shrink: 0;
	}
	.rec-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
		letter-spacing: -0.01em;
	}
	.rec-subtitle {
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.45);
		margin-top: 0.125rem;
	}

	/* ── Tab bar ── */
	.rec-tab-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.rec-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-size: 0.8rem;
		font-weight: 500;
		border: 1px solid rgba(212, 199, 163, 0.1);
		background: rgba(0, 0, 0, 0.2);
		color: rgba(212, 199, 163, 0.55);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.rec-tab:hover {
		color: rgba(212, 199, 163, 0.8);
		border-color: rgba(96, 165, 250, 0.3);
	}
	.rec-tab.active {
		background: rgba(96, 165, 250, 0.15);
		color: rgba(96, 165, 250, 0.95);
		border-color: rgba(96, 165, 250, 0.4);
	}

	/* ── Search panel ── */
	.rec-search-panel {
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
		padding: 1rem;
	}
	.rec-search-form {
		display: flex;
		gap: 0.75rem;
		align-items: stretch;
	}
	.rec-search-wrap {
		flex: 1;
		position: relative;
	}
	:global(.rec-search-icon) {
		position: absolute;
		left: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		width: 0.9rem;
		height: 0.9rem;
		color: rgba(212, 199, 163, 0.35);
	}
	.rec-search-input {
		width: 100%;
		padding: 0.625rem 1rem 0.625rem 2.25rem;
		border-radius: 0.375rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(212, 199, 163, 0.12);
		color: rgba(212, 199, 163, 0.9);
		font-size: 0.85rem;
	}
	.rec-search-input::placeholder { color: rgba(212, 199, 163, 0.35); }
	.rec-search-input:focus { border-color: rgba(96, 165, 250, 0.5); outline: none; }
	.rec-case-input {
		width: 12rem;
		padding: 0.625rem 1rem;
		border-radius: 0.375rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(212, 199, 163, 0.12);
		color: rgba(212, 199, 163, 0.9);
		font-size: 0.85rem;
	}
	.rec-case-input::placeholder { color: rgba(212, 199, 163, 0.35); }
	.rec-case-input:focus { border-color: rgba(96, 165, 250, 0.5); outline: none; }

	/* ── Signal weights ── */
	.rec-signals-panel {
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
		padding: 1rem;
	}
	.rec-signals-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		color: rgba(96, 165, 250, 0.8);
		font-size: 0.85rem;
		font-weight: 500;
	}
	.rec-signals-header h3 { margin: 0; font-size: inherit; font-weight: inherit; color: rgba(212, 199, 163, 0.9); }
	.rec-signals-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.75rem;
	}
	.rec-signal { text-align: center; }
	.rec-signal-pct {
		font-size: 1.1rem;
		font-weight: 700;
		color: rgba(96, 165, 250, 0.9);
		font-variant-numeric: tabular-nums;
	}
	.rec-signal-name { font-size: 0.7rem; color: rgba(212, 199, 163, 0.65); margin-top: 0.125rem; }
	.rec-signal-desc { font-size: 0.65rem; color: rgba(212, 199, 163, 0.4); }

	/* ── Content grid ── */
	.rec-content {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.25rem;
	}
	@media (min-width: 1024px) {
		.rec-content { grid-template-columns: 2fr 1fr; }
	}
	.rec-main { min-width: 0; }
	.rec-sidebar {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* ── Panel (right sidebar cards) ── */
	.rec-panel {
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.rec-panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.rec-panel-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: rgba(96, 165, 250, 0.7);
		font-size: 0.85rem;
	}
	.rec-panel-title h3 {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
	}
	.rec-panel-desc {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.5);
		margin: 0;
	}
	.rec-refresh-btn {
		padding: 0.25rem;
		border-radius: 0.25rem;
		background: none;
		border: none;
		color: rgba(212, 199, 163, 0.5);
		cursor: pointer;
		transition: background 0.15s;
	}
	.rec-refresh-btn:hover { background: rgba(96, 165, 250, 0.1); }
	.rec-error { font-size: 0.75rem; color: #f87171; }
	.rec-empty { font-size: 0.75rem; color: rgba(212, 199, 163, 0.5); padding: 1rem 0; text-align: center; }
	.rec-applied-text { font-size: 0.75rem; color: rgba(212, 199, 163, 0.5); }

	/* ── Stats grid ── */
	.rec-stats-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.rec-stat-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(212, 199, 163, 0.06);
		border-radius: 0.375rem;
		padding: 0.5rem;
		text-align: center;
	}
	.rec-stat-card.skeleton { opacity: 0.5; }
	.rec-stat-num {
		font-size: 1.1rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.9);
		font-variant-numeric: tabular-nums;
	}
	.rec-stat-label { font-size: 0.7rem; color: rgba(212, 199, 163, 0.5); }

	/* ── Section label ── */
	.rec-section { display: flex; flex-direction: column; gap: 0.5rem; }
	.rec-section-label {
		font-size: 0.7rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	/* ── Topic bars ── */
	.rec-topic-list { display: flex; flex-direction: column; gap: 0.375rem; }
	.rec-topic-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.rec-topic-name { font-size: 0.7rem; color: rgba(212, 199, 163, 0.5); width: 4rem; flex-shrink: 0; }
	.rec-topic-bar-track {
		flex: 1;
		height: 0.375rem;
		background: rgba(212, 199, 163, 0.08);
		border-radius: 9999px;
		overflow: hidden;
	}
	.rec-topic-bar-fill {
		height: 100%;
		background: rgba(96, 165, 250, 0.7);
		border-radius: 9999px;
	}
	.rec-topic-pct { font-size: 0.7rem; color: rgba(212, 199, 163, 0.4); width: 2.5rem; text-align: right; font-variant-numeric: tabular-nums; }

	/* ── Activity list ── */
	.rec-activity-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		max-height: 12rem;
		overflow-y: auto;
	}
	.rec-activity-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
	}
	:global(.rec-activity-icon) { width: 0.85rem; height: 0.85rem; color: rgba(212, 199, 163, 0.35); flex-shrink: 0; }
	.rec-activity-info { flex: 1; min-width: 0; }
	.rec-activity-title { color: rgba(212, 199, 163, 0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.rec-activity-date { font-size: 0.65rem; color: rgba(212, 199, 163, 0.35); }

	/* ── GPU toggle ── */
	.rec-toggle {
		width: 2.5rem;
		height: 1.25rem;
		border-radius: 9999px;
		background: rgba(212, 199, 163, 0.15);
		border: none;
		cursor: pointer;
		position: relative;
		transition: background 0.2s;
		padding: 0;
	}
	.rec-toggle.on { background: rgba(52, 211, 153, 0.6); }
	.rec-toggle-thumb {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: #fff;
		position: absolute;
		top: 0.125rem;
		left: 0.125rem;
		transition: transform 0.2s;
	}
	.rec-toggle.on .rec-toggle-thumb { transform: translateX(1.25rem); }

	/* ── Icons (green accent) ── */
	:global(.rec-icon-green) { color: rgba(52, 211, 153, 0.8) !important; }
	:global(.rec-check-icon) { width: 0.85rem; height: 0.85rem; color: rgba(96, 165, 250, 0.6); flex-shrink: 0; margin-top: 0.1rem; }

	/* ── Architecture list ── */
	.rec-arch-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.rec-arch-list li {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.55);
	}

	/* ── Skeletons ── */
	.rec-skeleton-area { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.5rem 0; }
	.rec-skeleton-bars { display: flex; flex-direction: column; gap: 0.4rem; }
	.skel-block {
		background: rgba(212, 199, 163, 0.08);
		border-radius: 0.25rem;
		animation: pulse 1.5s ease-in-out infinite;
	}
	.skel-num { height: 1.5rem; width: 2.5rem; margin: 0 auto 0.25rem; }
	.skel-label { height: 0.75rem; width: 4rem; margin: 0 auto; }
	.skel-bar-label { height: 0.75rem; width: 6rem; }
	.skel-bar { height: 0.375rem; width: 100%; }
	.skel-bar.short { width: 75%; }
	.skel-bar.shorter { width: 50%; }
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	/* ── Responsive ── */
	@media (max-width: 640px) {
		.rec-signals-grid { grid-template-columns: repeat(3, 1fr); }
		.rec-search-form { flex-direction: column; }
		.rec-case-input { width: 100%; }
		.rec-header { flex-direction: column; align-items: flex-start; }
	}

	/* ── Diagnostics styles ── */
	.rec-diagnostics-container {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.rec-simulator-panel {
		background: rgba(28, 27, 24, 0.4);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
		padding: 1.25rem;
	}

	.rec-simulator-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.rec-simulator-header h3 {
		font-size: 1rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
	}

	.rec-simulator-desc {
		font-size: 0.78rem;
		color: rgba(212, 199, 163, 0.5);
		margin-bottom: 1.25rem;
		line-height: 1.4;
	}

	.rec-simulator-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1rem;
	}

	.rec-input-group {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		flex: 1;
		min-width: 12rem;
	}

	.rec-input-group label {
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		color: rgba(212, 199, 163, 0.45);
		letter-spacing: 0.05em;
	}

	.rec-sim-input, .rec-sim-select {
		background: rgba(0, 0, 0, 0.25) !important;
		border: 1px solid rgba(212, 199, 163, 0.15) !important;
		border-radius: 0.375rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.9);
		outline: none;
		transition: border-color 0.15s;
		width: 100%;
		box-sizing: border-box;
	}

	.rec-sim-select option {
		background: #1c1b18;
		color: rgba(212, 199, 163, 0.9);
	}

	.rec-sim-input:focus, .rec-sim-select:focus {
		border-color: rgba(212, 199, 163, 0.35) !important;
	}

	.rec-btn-gold {
		background: linear-gradient(135deg, #c8a635, #e6c860) !important;
		color: #0e0d0b !important;
		font-weight: 700;
		font-size: 0.8rem;
		padding: 0.55rem 1.25rem;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: transform 0.1s, opacity 0.2s;
		height: 2.2rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.rec-btn-gold:hover {
		opacity: 0.95;
	}

	.rec-btn-gold:active {
		transform: scale(0.98);
	}

	.rec-diagnostics-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		padding-bottom: 0.5rem;
		margin-top: 0.5rem;
	}

	.rec-diagnostics-header h2 {
		font-size: 1.15rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
	}

	.rec-empty-diagnostics {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		background: rgba(0, 0, 0, 0.15);
		border: 1px dashed rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
		text-align: center;
		color: rgba(212, 199, 163, 0.4);
		gap: 0.5rem;
	}

	.rec-empty-diagnostics p {
		font-size: 0.85rem;
	}

	.rec-empty-diagnostics p.sub {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.25);
	}

	.rec-diagnostics-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
	}

	.rec-diag-card {
		background: rgba(28, 27, 24, 0.35);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-left-width: 4px;
		border-radius: 0.375rem;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		transition: transform 0.15s;
	}

	.rec-diag-card:hover {
		transform: translateY(-2px);
	}

	.rec-diag-card.state-S1 { border-left-color: rgba(52, 211, 153, 0.6); }
	.rec-diag-card.state-S2 { border-left-color: rgba(96, 165, 250, 0.6); }
	.rec-diag-card.state-S3 { border-left-color: rgba(251, 191, 36, 0.6); }
	.rec-diag-card.state-S4 { border-left-color: rgba(156, 163, 175, 0.6); }

	.rec-diag-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.rec-diag-spec-id {
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
	}

	.rec-diag-badge {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 0.15rem 0.45rem;
		border-radius: 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.rec-diag-badge.state-S1 { background: rgba(52, 211, 153, 0.15); color: rgba(52, 211, 153, 0.9); border: 1px solid rgba(52, 211, 153, 0.25); }
	.rec-diag-badge.state-S2 { background: rgba(96, 165, 250, 0.15); color: rgba(96, 165, 250, 0.9); border: 1px solid rgba(96, 165, 250, 0.25); }
	.rec-diag-badge.state-S3 { background: rgba(251, 191, 36, 0.15); color: rgba(251, 191, 36, 0.9); border: 1px solid rgba(251, 191, 36, 0.25); }
	.rec-diag-badge.state-S4 { background: rgba(156, 163, 175, 0.15); color: rgba(156, 163, 175, 0.9); border: 1px solid rgba(156, 163, 175, 0.25); }

	.rec-diag-section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.rec-section-label-small {
		font-size: 0.65rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.35);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.rec-sequence-flow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		background: rgba(0, 0, 0, 0.15);
		padding: 0.375rem 0.5rem;
		border-radius: 0.25rem;
		border: 1px solid rgba(212, 199, 163, 0.04);
	}

	.rec-sequence-item {
		font-size: 0.72rem;
		color: rgba(212, 199, 163, 0.7);
	}

	.rec-sequence-arrow {
		font-size: 0.65rem;
		color: rgba(212, 199, 163, 0.25);
	}

	.rec-sequence-state {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.05rem 0.25rem;
		border-radius: 0.2rem;
	}

	.rec-sequence-state.state-S1 { background: rgba(52, 211, 153, 0.1); color: rgba(52, 211, 153, 0.85); }
	.rec-sequence-state.state-S2 { background: rgba(96, 165, 250, 0.1); color: rgba(96, 165, 250, 0.85); }
	.rec-sequence-state.state-S3 { background: rgba(251, 191, 36, 0.1); color: rgba(251, 191, 36, 0.85); }
	.rec-sequence-state.state-S4 { background: rgba(156, 163, 175, 0.1); color: rgba(156, 163, 175, 0.85); }

	.rec-diag-recommendation-box {
		margin-top: 0.25rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 0.375rem;
		padding: 0.75rem;
		border: 1px solid transparent;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.rec-diag-recommendation-box.state-S1 { border-color: rgba(52, 211, 153, 0.12); }
	.rec-diag-recommendation-box.state-S2 { border-color: rgba(96, 165, 250, 0.12); }
	.rec-diag-recommendation-box.state-S3 { border-color: rgba(251, 191, 36, 0.12); }
	.rec-diag-recommendation-box.state-S4 { border-color: rgba(156, 163, 175, 0.12); }

	.rec-diag-reco-title {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.72rem;
		font-weight: 600;
	}

	.rec-diag-recommendation-box.state-S1 .rec-diag-reco-title { color: rgba(52, 211, 153, 0.9); }
	.rec-diag-recommendation-box.state-S2 .rec-diag-reco-title { color: rgba(96, 165, 250, 0.9); }
	.rec-diag-recommendation-box.state-S3 .rec-diag-reco-title { color: rgba(251, 191, 36, 0.9); }
	.rec-diag-recommendation-box.state-S4 .rec-diag-reco-title { color: rgba(156, 163, 175, 0.9); }

	.rec-diag-reco-text {
		font-size: 0.78rem;
		color: rgba(212, 199, 163, 0.85);
		line-height: 1.4;
	}

	.rec-diag-reco-trigger {
		font-size: 0.68rem;
		color: rgba(212, 199, 163, 0.4);
		line-height: 1.3;
	}

	:global(.rec-icon-gold) {
		color: #e6c860 !important;
	}
</style>
