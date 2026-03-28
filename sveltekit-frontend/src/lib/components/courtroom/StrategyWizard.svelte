<!--
  GRPO Strategy Wizard — Courtroom Simulation
  4-step reasoning chain: RAG → KAG → Semantic → LLM Synthesis
  Generates 4 strategic recommendations with who/what/why/how taxonomy.
-->
<script lang="ts">
	import { Card, N643DButton, N64Badge, N64ProgressBar } from '$lib/components/ui/gaming/n64';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface StrategyRecommendation {
		role: string;
		who: string;
		what: string;
		why: string;
		how: string;
		confidence: number;
		canonRefs: string[];
		sources: ('rag' | 'kag' | 'semantic')[];
	}

	interface SearchTimings {
		rag_ms: number;
		kag_ms: number;
		semantic_ms: number;
		synthesis_ms: number;
		total_ms: number;
	}

	interface Props {
		sessionId: string;
		onClose: () => void;
		onApply: (rec: StrategyRecommendation) => void;
	}

	let { sessionId, onClose, onApply }: Props = $props();

	let recommendations = $state<StrategyRecommendation[]>([]);
	let thinking = $state('');
	let isAnalyzing = $state(false);
	let analysisStep = $state('');
	let timings = $state<SearchTimings | null>(null);
	let showThinking = $state(false);
	let error = $state('');

	const ANALYSIS_STEPS = [
		'Searching legal canon (RAG)...',
		'Querying knowledge graph (KAG)...',
		'Finding similar cases (Semantic)...',
		'Synthesizing strategies (GRPO)...',
	];

	const ROLE_ICONS: Record<string, string> = {
		'Legal Strategist': 'scale',
		'Evidence Analyst': 'search',
		'Procedural Expert': 'file-text',
		'Case Historian': 'book-open',
	};

	const SOURCE_COLORS: Record<string, string> = {
		rag: 'var(--t-accent, #92cc41)',
		kag: 'var(--t-info, #3cbcfc)',
		semantic: 'var(--t-warning, #f7d51d)',
	};

	async function analyzeCase() {
		isAnalyzing = true;
		error = '';
		recommendations = [];
		thinking = '';
		timings = null;

		// Animate through analysis steps
		for (let i = 0; i < ANALYSIS_STEPS.length; i++) {
			analysisStep = ANALYSIS_STEPS[i];
			if (i < ANALYSIS_STEPS.length - 1) {
				await new Promise(r => setTimeout(r, 600));
			}
		}

		try {
			const res = await fetch(`/api/simulation/${sessionId}/strategy`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({ error: 'Request failed' }));
				throw new Error(data.error || `HTTP ${res.status}`);
			}

			const data = await res.json();
			recommendations = data.recommendations ?? [];
			thinking = data.thinking ?? '';
			timings = data.searchTimings ?? null;
		} catch (err: any) {
			error = err.message || 'Failed to generate strategy recommendations';
		} finally {
			isAnalyzing = false;
			analysisStep = '';
		}
	}
</script>

<div class="strategy-wizard">
	<!-- Header -->
	<div class="wizard-header">
		<div class="header-title">
			<Icon name="sparkles" size={18} />
			<span>STRATEGY WIZARD</span>
			<N64Badge>GRPO</N64Badge>
		</div>
		<button class="close-btn" onclick={onClose} aria-label="Close strategy wizard">
			<Icon name="x" size={16} />
		</button>
	</div>

	<!-- Content -->
	<div class="wizard-content">
		{#if recommendations.length === 0 && !isAnalyzing}
			<!-- Initial state: Analyze button -->
			<div class="analyze-prompt">
				<p class="prompt-text">
					Run the GRPO thinking chain to analyze the case and generate 4 strategic recommendations.
				</p>
				<p class="prompt-detail">
					Searches legal canon (RAG), knowledge graph (KAG), and similar cases (Semantic), then synthesizes strategies using who/what/why/how.
				</p>
				<N643DButton
					onclick={analyzeCase}
					variant="primary"
					glowIntensity={0.6}
				>
					ANALYZE CASE
				</N643DButton>
				{#if error}
					<p class="error-msg">{error}</p>
				{/if}
			</div>
		{:else if isAnalyzing}
			<!-- Loading state -->
			<div class="analyzing">
				<div class="thinking-animation">
					<div class="brain-pulse"></div>
				</div>
				<p class="step-label">{analysisStep}</p>
				<N64ProgressBar value={75} max={100} />
			</div>
		{:else}
			<!-- Results: 4 recommendation cards -->
			<div class="recommendations">
				{#each recommendations as rec, i}
					<div class="rec-card">
						<Card padding="small" hoverable elevation={2}>
							<div class="rec-inner">
								<!-- Card header -->
								<div class="rec-header">
									<div class="rec-role">
										<Icon name={ROLE_ICONS[rec.role] ?? 'user'} size={14} />
										<span class="role-name">{rec.role}</span>
									</div>
									<span class="rec-rank">#{i + 1}</span>
								</div>

								<!-- Who/What/Why/How sections -->
								<div class="taxonomy">
									<div class="tax-section">
										<span class="tax-label">WHO</span>
										<span class="tax-value">{rec.who}</span>
									</div>
									<div class="tax-section">
										<span class="tax-label">WHAT</span>
										<span class="tax-value">{rec.what}</span>
									</div>
									<div class="tax-section">
										<span class="tax-label">WHY</span>
										<span class="tax-value">{rec.why}</span>
									</div>
									<div class="tax-section">
										<span class="tax-label">HOW</span>
										<span class="tax-value">{rec.how}</span>
									</div>
								</div>

								<!-- Footer: confidence + sources + apply -->
								<div class="rec-footer">
									<div class="confidence">
										<span class="conf-label">Confidence</span>
										<div class="conf-bar">
											<div class="conf-fill" style="width: {rec.confidence * 100}%"></div>
										</div>
										<span class="conf-value">{Math.round(rec.confidence * 100)}%</span>
									</div>

									<div class="rec-meta">
										<div class="source-tags">
											{#each rec.sources as src}
												<span class="source-tag" style="border-color: {SOURCE_COLORS[src] ?? '#666'}">
													{src.toUpperCase()}
												</span>
											{/each}
										</div>
										{#if rec.canonRefs.length > 0}
											<span class="canon-count">{rec.canonRefs.length} refs</span>
										{/if}
									</div>

									<button class="apply-btn" onclick={() => onApply(rec)}>
										APPLY
									</button>
								</div>
							</div>
						</Card>
					</div>
				{/each}
			</div>

			<!-- Thinking trace (collapsible) -->
			{#if thinking}
				<div class="thinking-section">
					<button class="thinking-toggle" onclick={() => showThinking = !showThinking}>
						<Icon name={showThinking ? 'chevron-down' : 'chevron-right'} size={14} />
						Chain-of-Thought
					</button>
					{#if showThinking}
						<pre class="thinking-text">{thinking}</pre>
					{/if}
				</div>
			{/if}

			<!-- Timings -->
			{#if timings}
				<div class="timings">
					<span>RAG: {timings.rag_ms}ms</span>
					<span>KAG: {timings.kag_ms}ms</span>
					<span>Semantic: {timings.semantic_ms}ms</span>
					<span>Synthesis: {timings.synthesis_ms}ms</span>
					<span class="total">Total: {timings.total_ms}ms</span>
				</div>
			{/if}

			<!-- Re-analyze button -->
			<div class="reanalyze">
				<N643DButton onclick={analyzeCase} variant="secondary" size="small">
					RE-ANALYZE
				</N643DButton>
			</div>
		{/if}
	</div>
</div>

<style>
	.strategy-wizard {
		position: absolute;
		top: 0;
		right: 0;
		width: 380px;
		max-width: 90vw;
		height: 100%;
		background: rgba(10, 10, 15, 0.95);
		border-left: 2px solid var(--t-accent, #92cc41);
		display: flex;
		flex-direction: column;
		z-index: 100;
		font-family: 'Press Start 2P', 'Courier New', monospace;
		overflow: hidden;
	}

	.wizard-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid rgba(146, 204, 65, 0.3);
		flex-shrink: 0;
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--t-accent, #92cc41);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.close-btn {
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #ccc;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.close-btn:hover {
		border-color: var(--t-danger, #f83800);
		color: var(--t-danger, #f83800);
	}

	.wizard-content {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
	}

	/* Analyze prompt */
	.analyze-prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 24px 8px;
		text-align: center;
	}
	.prompt-text {
		color: #ddd;
		font-size: 9px;
		line-height: 1.6;
	}
	.prompt-detail {
		color: #888;
		font-size: 8px;
		line-height: 1.5;
	}
	.error-msg {
		color: var(--t-danger, #f83800);
		font-size: 8px;
	}

	/* Analyzing animation */
	.analyzing {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 40px 8px;
	}
	.thinking-animation {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.brain-pulse {
		width: 32px;
		height: 32px;
		border: 3px solid var(--t-accent, #92cc41);
		border-radius: 50%;
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		0%, 100% { transform: scale(1); opacity: 1; }
		50% { transform: scale(1.3); opacity: 0.5; }
	}
	.step-label {
		color: var(--t-accent, #92cc41);
		font-size: 8px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	/* Recommendations */
	.recommendations {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.rec-card {
		width: 100%;
	}
	.rec-inner {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.rec-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.rec-role {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--t-accent, #92cc41);
	}
	.role-name {
		font-size: 8px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.rec-rank {
		color: #666;
		font-size: 10px;
	}

	/* Taxonomy sections */
	.taxonomy {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.tax-section {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}
	.tax-label {
		color: var(--t-info, #3cbcfc);
		font-size: 7px;
		font-weight: bold;
		min-width: 32px;
		text-transform: uppercase;
		flex-shrink: 0;
	}
	.tax-value {
		color: #ccc;
		font-size: 8px;
		line-height: 1.4;
	}

	/* Footer */
	.rec-footer {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 6px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}
	.confidence {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.conf-label {
		color: #888;
		font-size: 7px;
		min-width: 60px;
	}
	.conf-bar {
		flex: 1;
		height: 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		overflow: hidden;
	}
	.conf-fill {
		height: 100%;
		background: var(--t-accent, #92cc41);
		transition: width 0.5s ease;
	}
	.conf-value {
		color: var(--t-accent, #92cc41);
		font-size: 8px;
		min-width: 28px;
		text-align: right;
	}

	.rec-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.source-tags {
		display: flex;
		gap: 4px;
	}
	.source-tag {
		font-size: 6px;
		padding: 1px 4px;
		border: 1px solid;
		color: #aaa;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.canon-count {
		color: #666;
		font-size: 7px;
	}

	.apply-btn {
		align-self: flex-end;
		background: rgba(146, 204, 65, 0.15);
		border: 1px solid var(--t-accent, #92cc41);
		color: var(--t-accent, #92cc41);
		padding: 4px 12px;
		font-size: 8px;
		font-family: inherit;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 1px;
	}
	.apply-btn:hover {
		background: rgba(146, 204, 65, 0.3);
	}

	/* Thinking trace */
	.thinking-section {
		margin-top: 12px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		padding-top: 8px;
	}
	.thinking-toggle {
		display: flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: none;
		color: #888;
		font-size: 8px;
		font-family: inherit;
		cursor: pointer;
		padding: 4px 0;
	}
	.thinking-toggle:hover {
		color: #ccc;
	}
	.thinking-text {
		color: #777;
		font-size: 7px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 200px;
		overflow-y: auto;
		padding: 8px;
		background: rgba(0, 0, 0, 0.3);
		margin-top: 4px;
	}

	/* Timings */
	.timings {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 12px;
		padding-top: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}
	.timings span {
		color: #555;
		font-size: 7px;
	}
	.timings .total {
		color: #888;
	}

	/* Re-analyze */
	.reanalyze {
		display: flex;
		justify-content: center;
		margin-top: 16px;
		padding-bottom: 16px;
	}
</style>
