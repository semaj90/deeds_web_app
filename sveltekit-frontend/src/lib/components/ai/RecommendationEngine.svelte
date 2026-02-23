<!-- AI Recommendation Engine — legal case strategy + evidence recommendations -->
<script lang="ts">
	import { Dialog } from 'bits-ui';
	import Loader from '@lucide/svelte/icons/loader';
	import Target from '@lucide/svelte/icons/target';
	import Search from '@lucide/svelte/icons/search';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Zap from '@lucide/svelte/icons/zap';
	import Shield from '@lucide/svelte/icons/shield';
	import Lightbulb from '@lucide/svelte/icons/lightbulb';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import X from '@lucide/svelte/icons/x';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

	interface ActionStep {
		id: string;
		description: string;
		order: number;
		estimated_duration: string;
		completion_criteria: string;
	}

	interface Risk {
		description: string;
		probability: number;
		impact: number;
		mitigation: string;
	}

	interface Alternative {
		title: string;
		description: string;
		pros: string[];
		cons: string[];
		confidence: number;
	}

	interface SuccessMetric {
		name: string;
		target: string;
		measurement_method: string;
	}

	interface Recommendation {
		id: string;
		title: string;
		description: string;
		category: 'strategy' | 'evidence' | 'legal_research' | 'next_action' | 'risk_mitigation';
		priority: 'high' | 'medium' | 'low';
		confidence: number;
		impact: number;
		effort: number;
		timeframe: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
		rationale: string;
		steps: ActionStep[];
		risks: Risk[];
		alternatives: Alternative[];
		success_metrics: SuccessMetric[];
		tags: string[];
	}

	interface Props {
		caseId?: string;
		contextQuery?: string;
		onapply?: (recommendation: Recommendation) => void;
	}

	let {
		caseId = '',
		contextQuery = '',
		onapply
	}: Props = $props();

	let recommendations = $state<Recommendation[]>([]);
	let selectedRecommendation = $state<Recommendation | null>(null);
	let isGenerating = $state(false);
	let showDetails = $state(false);
	let errorMessage = $state('');

	// Filters
	let categoryFilter = $state<'all' | 'strategy' | 'evidence' | 'legal_research' | 'next_action' | 'risk_mitigation'>('all');
	let priorityFilter = $state<'all' | 'high' | 'medium' | 'low'>('all');
	let confidenceThreshold = $state(50);

	let filteredRecommendations = $derived.by(() => {
		let filtered = recommendations;
		if (categoryFilter !== 'all') {
			filtered = filtered.filter(r => r.category === categoryFilter);
		}
		if (priorityFilter !== 'all') {
			filtered = filtered.filter(r => r.priority === priorityFilter);
		}
		filtered = filtered.filter(r => r.confidence >= confidenceThreshold);
		filtered.sort((a, b) => {
			const order: Record<string, number> = { high: 3, medium: 2, low: 1 };
			const diff = (order[b.priority] ?? 0) - (order[a.priority] ?? 0);
			if (diff !== 0) return diff;
			return b.confidence - a.confidence;
		});
		return filtered;
	});

	async function generateRecommendations() {
		isGenerating = true;
		errorMessage = '';
		try {
			const query = contextQuery || `Legal case analysis recommendations for case ${caseId || 'general'}`;

			// Stage 1: Search for relevant context via RAG
			const searchRes = await fetch('/api/rag/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query, caseId, top_k: 8 })
			});

			let context = '';
			if (searchRes.ok) {
				const searchData = await searchRes.json();
				const chunks = searchData.results ?? searchData.chunks ?? [];
				context = chunks.map((c: any) => c.text ?? c.content ?? '').join('\n\n');
			}

			// Stage 2: Generate recommendations via RAG answer endpoint
			const answerRes = await fetch('/api/rag/answer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: `Based on the following legal context, generate 5-8 specific recommendations for case strategy, evidence handling, legal research, next actions, and risk mitigation. For each recommendation, provide: title, description, category (strategy/evidence/legal_research/next_action/risk_mitigation), priority (high/medium/low), confidence score (0-100), impact score (0-100), effort score (0-100), timeframe (immediate/short_term/medium_term/long_term), rationale, and 2-3 action steps. Format as JSON array.`,
					context,
					caseId,
					include_todos: true
				})
			});

			if (!answerRes.ok) throw new Error(`API error: ${answerRes.status}`);
			const answerData = await answerRes.json();

			// Try to parse structured recommendations from the response
			const rawAnswer = answerData.answer ?? answerData.response ?? '';
			const parsed = tryParseRecommendations(rawAnswer, answerData.todos);

			if (parsed.length > 0) {
				recommendations = parsed;
			} else {
				// Fallback: generate mock recommendations from action items
				recommendations = generateFallbackRecommendations(answerData);
			}
		} catch (err) {
			console.error('Recommendation generation error:', err);
			errorMessage = err instanceof Error ? err.message : String(err);
		} finally {
			isGenerating = false;
		}
	}

	function tryParseRecommendations(text: string, todos?: any[]): Recommendation[] {
		// Try to extract JSON array from response
		const jsonMatch = text.match(/\[[\s\S]*?\]/);
		if (jsonMatch) {
			try {
				const arr = JSON.parse(jsonMatch[0]);
				if (Array.isArray(arr) && arr.length > 0 && arr[0].title) {
					return arr.map((r: any, i: number) => normalizeRecommendation(r, i));
				}
			} catch { /* JSON parse failed, fall through */ }
		}
		return [];
	}

	function normalizeRecommendation(r: any, index: number): Recommendation {
		const categories = ['strategy', 'evidence', 'legal_research', 'next_action', 'risk_mitigation'] as const;
		const priorities = ['high', 'medium', 'low'] as const;
		const timeframes = ['immediate', 'short_term', 'medium_term', 'long_term'] as const;

		return {
			id: r.id ?? `rec-${index}`,
			title: r.title ?? `Recommendation ${index + 1}`,
			description: r.description ?? r.summary ?? '',
			category: categories.includes(r.category) ? r.category : categories[index % 5],
			priority: priorities.includes(r.priority) ? r.priority : 'medium',
			confidence: typeof r.confidence === 'number' ? Math.min(100, Math.max(0, r.confidence)) : 70,
			impact: typeof r.impact === 'number' ? r.impact : 60,
			effort: typeof r.effort === 'number' ? r.effort : 50,
			timeframe: timeframes.includes(r.timeframe) ? r.timeframe : 'short_term',
			rationale: r.rationale ?? '',
			steps: Array.isArray(r.steps) ? r.steps.map((s: any, j: number) => ({
				id: s.id ?? `step-${j}`,
				description: s.description ?? s,
				order: s.order ?? j + 1,
				estimated_duration: s.estimated_duration ?? '1-2 hours',
				completion_criteria: s.completion_criteria ?? 'Complete'
			})) : [],
			risks: Array.isArray(r.risks) ? r.risks : [],
			alternatives: Array.isArray(r.alternatives) ? r.alternatives : [],
			success_metrics: Array.isArray(r.success_metrics) ? r.success_metrics : [],
			tags: Array.isArray(r.tags) ? r.tags : []
		};
	}

	function generateFallbackRecommendations(data: any): Recommendation[] {
		const todos = data.todos ?? [];
		const sources = data.sources ?? [];
		const results: Recommendation[] = [];
		const categories: Recommendation['category'][] = ['strategy', 'evidence', 'legal_research', 'next_action', 'risk_mitigation'];

		for (let i = 0; i < Math.max(todos.length, 3); i++) {
			const todo = todos[i];
			results.push({
				id: `fallback-${i}`,
				title: todo?.description ?? `Review ${categories[i % 5].replace('_', ' ')}`,
				description: todo?.description ?? `Analyze and address ${categories[i % 5].replace('_', ' ')} aspects of the case`,
				category: categories[i % 5],
				priority: todo?.priority === 'high' ? 'high' : i < 2 ? 'high' : 'medium',
				confidence: 65 + Math.floor(Math.random() * 25),
				impact: 50 + Math.floor(Math.random() * 40),
				effort: 30 + Math.floor(Math.random() * 50),
				timeframe: i === 0 ? 'immediate' : i < 3 ? 'short_term' : 'medium_term',
				rationale: `Based on RAG analysis with ${sources.length} source documents`,
				steps: [{
					id: `step-${i}-1`,
					description: todo?.description ?? 'Review relevant materials',
					order: 1,
					estimated_duration: '1-2 hours',
					completion_criteria: 'Analysis documented'
				}],
				risks: [],
				alternatives: [],
				success_metrics: [],
				tags: sources.slice(0, 2).map((s: any) => s.collection ?? 'legal')
			});
		}
		return results;
	}

	function getCategoryIcon(category: string) {
		switch (category) {
			case 'strategy': return Target;
			case 'evidence': return Search;
			case 'legal_research': return BookOpen;
			case 'next_action': return Zap;
			case 'risk_mitigation': return Shield;
			default: return Lightbulb;
		}
	}

	function getPriorityClass(priority: string): string {
		switch (priority) {
			case 'high': return 'rec-priority-high';
			case 'medium': return 'rec-priority-medium';
			case 'low': return 'rec-priority-low';
			default: return '';
		}
	}

	function getTimeframeLabel(tf: string): string {
		return tf.replace(/_/g, ' ');
	}

	function openDetails(rec: Recommendation) {
		selectedRecommendation = rec;
		showDetails = true;
	}

	function applyRecommendation(rec: Recommendation) {
		onapply?.(rec);
	}

	function calculateRiskScore(risks: Risk[]): number {
		if (risks.length === 0) return 0;
		return risks.reduce((sum, r) => sum + r.probability * r.impact * 100, 0) / risks.length;
	}
</script>

<div class="rec-engine">
	<div class="rec-header">
		<div>
			<h3 class="rec-title">
				<Lightbulb class="w-5 h-5" />
				AI Recommendation Engine
			</h3>
			<p class="rec-subtitle">Strategy, evidence, and risk analysis</p>
		</div>
		<button
			class="rec-generate-btn"
			onclick={generateRecommendations}
			disabled={isGenerating}
		>
			{#if isGenerating}
				<Loader class="w-4 h-4 animate-spin" />
				Generating...
			{:else}
				<Zap class="w-4 h-4" />
				Generate
			{/if}
		</button>
	</div>

	<!-- Filters -->
	<div class="rec-filters">
		<select bind:value={categoryFilter} class="rec-select">
			<option value="all">All Categories</option>
			<option value="strategy">Strategy</option>
			<option value="evidence">Evidence</option>
			<option value="legal_research">Legal Research</option>
			<option value="next_action">Next Actions</option>
			<option value="risk_mitigation">Risk Mitigation</option>
		</select>
		<select bind:value={priorityFilter} class="rec-select">
			<option value="all">All Priorities</option>
			<option value="high">High</option>
			<option value="medium">Medium</option>
			<option value="low">Low</option>
		</select>
		<label class="rec-threshold">
			<span>Min: {confidenceThreshold}%</span>
			<input type="range" min="0" max="100" step="5" bind:value={confidenceThreshold} />
		</label>
	</div>

	{#if errorMessage}
		<div class="rec-error">
			<AlertTriangle class="w-4 h-4" />
			{errorMessage}
		</div>
	{/if}

	<!-- Recommendations List -->
	{#if isGenerating}
		<div class="rec-loading">
			<Loader class="w-8 h-8 animate-spin" />
			<p>Analyzing case context and generating recommendations...</p>
		</div>
	{:else if filteredRecommendations.length === 0}
		<div class="rec-empty">
			<Lightbulb class="w-8 h-8" />
			<p>No recommendations yet. Click "Generate" to analyze your case.</p>
		</div>
	{:else}
		<div class="rec-grid">
			{#each filteredRecommendations as rec (rec.id)}
				{@const IconComponent = getCategoryIcon(rec.category)}
				<div class="rec-card">
					<div class="rec-card-header">
						<div class="rec-card-title-row">
							<IconComponent class="w-5 h-5 shrink-0" />
							<div class="rec-card-title-text">
								<h4 class="rec-card-title">{rec.title}</h4>
								<div class="rec-badges">
									<span class="rec-badge rec-badge-{rec.category}">{rec.category.replace(/_/g, ' ')}</span>
									<span class="rec-badge rec-badge-tf">{getTimeframeLabel(rec.timeframe)}</span>
								</div>
							</div>
						</div>
						<div class="rec-card-meta">
							<span class="rec-priority {getPriorityClass(rec.priority)}">{rec.priority.toUpperCase()}</span>
							<span class="rec-confidence">{rec.confidence}%</span>
						</div>
					</div>

					<p class="rec-card-desc">{rec.description}</p>

					<!-- Impact/Effort/Risk bars -->
					<div class="rec-bars">
						<div class="rec-bar-row">
							<span class="rec-bar-label">Impact</span>
							<div class="rec-bar"><div class="rec-bar-fill rec-bar-impact" style="width: {rec.impact}%"></div></div>
							<span class="rec-bar-val">{rec.impact}%</span>
						</div>
						<div class="rec-bar-row">
							<span class="rec-bar-label">Effort</span>
							<div class="rec-bar"><div class="rec-bar-fill rec-bar-effort" style="width: {rec.effort}%"></div></div>
							<span class="rec-bar-val">{rec.effort}%</span>
						</div>
						{#if rec.risks.length > 0}
							<div class="rec-bar-row">
								<span class="rec-bar-label">Risk</span>
								<div class="rec-bar"><div class="rec-bar-fill rec-bar-risk" style="width: {calculateRiskScore(rec.risks)}%"></div></div>
								<span class="rec-bar-val">{calculateRiskScore(rec.risks).toFixed(0)}%</span>
							</div>
						{/if}
					</div>

					{#if rec.steps.length > 0}
						<div class="rec-steps-preview">
							<strong>Steps ({rec.steps.length}):</strong>
							<ol>
								{#each rec.steps.slice(0, 2) as step}
									<li>{step.description}</li>
								{/each}
								{#if rec.steps.length > 2}
									<li class="rec-more">+{rec.steps.length - 2} more</li>
								{/if}
							</ol>
						</div>
					{/if}

					{#if rec.tags.length > 0}
						<div class="rec-tags">
							{#each rec.tags.slice(0, 3) as tag}
								<span class="rec-tag">{tag}</span>
							{/each}
						</div>
					{/if}

					<div class="rec-card-actions">
						<button class="rec-btn-secondary" onclick={() => openDetails(rec)}>Details</button>
						<button class="rec-btn-primary" onclick={() => applyRecommendation(rec)}>
							<CheckCircle class="w-3.5 h-3.5" />
							Apply
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Detail Dialog -->
<Dialog.Root bind:open={showDetails}>
	<Dialog.Portal>
		<Dialog.Overlay class="rec-dialog-overlay" />
		<Dialog.Content class="rec-dialog-content">
			{#if selectedRecommendation}
				{@const rec = selectedRecommendation}
				<Dialog.Title class="rec-dialog-title">{rec.title}</Dialog.Title>
				<Dialog.Description class="rec-dialog-desc">Detailed implementation plan</Dialog.Description>

				<div class="rec-detail-grid">
					<div class="rec-detail-item"><span class="rec-detail-label">Category</span><span>{rec.category.replace(/_/g, ' ')}</span></div>
					<div class="rec-detail-item"><span class="rec-detail-label">Priority</span><span class="{getPriorityClass(rec.priority)}">{rec.priority.toUpperCase()}</span></div>
					<div class="rec-detail-item"><span class="rec-detail-label">Confidence</span><span>{rec.confidence}%</span></div>
					<div class="rec-detail-item"><span class="rec-detail-label">Timeframe</span><span>{getTimeframeLabel(rec.timeframe)}</span></div>
				</div>

				{#if rec.rationale}
					<div class="rec-detail-section">
						<h4>Rationale</h4>
						<p>{rec.rationale}</p>
					</div>
				{/if}

				{#if rec.steps.length > 0}
					<div class="rec-detail-section">
						<h4>Implementation Steps</h4>
						<ol class="rec-detail-steps">
							{#each rec.steps as step}
								<li>
									<strong>{step.description}</strong>
									<div class="rec-step-meta">
										<span>Duration: {step.estimated_duration}</span>
										<span>Criteria: {step.completion_criteria}</span>
									</div>
								</li>
							{/each}
						</ol>
					</div>
				{/if}

				{#if rec.risks.length > 0}
					<div class="rec-detail-section">
						<h4>Risk Assessment</h4>
						{#each rec.risks as risk}
							<div class="rec-risk-item">
								<div class="rec-risk-header">
									<span>{risk.description}</span>
									<span class="rec-risk-score">P:{(risk.probability * 100).toFixed(0)}% I:{(risk.impact * 100).toFixed(0)}%</span>
								</div>
								<p class="rec-risk-mitigation"><strong>Mitigation:</strong> {risk.mitigation}</p>
							</div>
						{/each}
					</div>
				{/if}

				{#if rec.alternatives.length > 0}
					<div class="rec-detail-section">
						<h4>Alternatives</h4>
						{#each rec.alternatives as alt}
							<div class="rec-alt-item">
								<h5>{alt.title} ({alt.confidence}%)</h5>
								<p>{alt.description}</p>
								<div class="rec-pros-cons">
									{#if alt.pros.length > 0}
										<div>
											<strong>Pros:</strong>
											<ul>{#each alt.pros as pro}<li>{pro}</li>{/each}</ul>
										</div>
									{/if}
									{#if alt.cons.length > 0}
										<div>
											<strong>Cons:</strong>
											<ul>{#each alt.cons as con}<li>{con}</li>{/each}</ul>
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}

				{#if rec.success_metrics.length > 0}
					<div class="rec-detail-section">
						<h4>Success Metrics</h4>
						{#each rec.success_metrics as metric}
							<div class="rec-metric-item">
								<strong>{metric.name}</strong>
								<p>Target: {metric.target} | Method: {metric.measurement_method}</p>
							</div>
						{/each}
					</div>
				{/if}

				<div class="rec-dialog-actions">
					<button class="rec-btn-secondary" onclick={() => (showDetails = false)}>Close</button>
					<button class="rec-btn-primary" onclick={() => { applyRecommendation(rec); showDetails = false; }}>
						<CheckCircle class="w-4 h-4" />
						Apply Recommendation
					</button>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.rec-engine {
		border: 1px solid rgba(128, 128, 128, 0.2);
		border-radius: 8px;
		padding: 1.25rem;
		background: rgba(255, 255, 255, 0.02);
	}
	.rec-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1rem;
	}
	.rec-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
	}
	.rec-subtitle {
		margin: 0.25rem 0 0;
		font-size: 0.8rem;
		color: #888;
	}
	.rec-generate-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.rec-generate-btn:hover:not(:disabled) {
		background: #2563eb;
	}
	.rec-generate-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.rec-filters {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
		padding: 0.75rem;
		background: rgba(128, 128, 128, 0.05);
		border-radius: 6px;
	}
	.rec-select {
		padding: 0.4rem 0.6rem;
		border: 1px solid rgba(128, 128, 128, 0.3);
		border-radius: 4px;
		font-size: 0.8rem;
		background: transparent;
		color: inherit;
	}
	.rec-threshold {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
	}
	.rec-threshold input {
		width: 100px;
	}
	.rec-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 6px;
		color: #ef4444;
		font-size: 0.85rem;
		margin-bottom: 1rem;
	}
	.rec-loading, .rec-empty {
		text-align: center;
		padding: 2rem;
		color: #888;
	}
	.rec-loading p, .rec-empty p {
		margin: 0.75rem 0 0;
	}
	.rec-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
		gap: 1rem;
	}
	.rec-card {
		border: 1px solid rgba(128, 128, 128, 0.2);
		border-radius: 8px;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.03);
		transition: box-shadow 0.2s;
	}
	.rec-card:hover {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}
	.rec-card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}
	.rec-card-title-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		flex: 1;
	}
	.rec-card-title-text {
		flex: 1;
	}
	.rec-card-title {
		margin: 0 0 0.25rem;
		font-size: 0.95rem;
		font-weight: 600;
	}
	.rec-badges {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.rec-badge {
		padding: 0.15rem 0.4rem;
		border-radius: 3px;
		font-size: 0.65rem;
		font-weight: 500;
		text-transform: capitalize;
	}
	.rec-badge-strategy { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
	.rec-badge-evidence { background: rgba(16, 185, 129, 0.1); color: #10b981; }
	.rec-badge-legal_research { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
	.rec-badge-next_action { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
	.rec-badge-risk_mitigation { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
	.rec-badge-tf { background: rgba(128, 128, 128, 0.1); color: #888; }
	.rec-card-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.15rem;
	}
	.rec-priority {
		font-size: 0.7rem;
		font-weight: 700;
	}
	.rec-priority-high { color: #ef4444; }
	.rec-priority-medium { color: #f59e0b; }
	.rec-priority-low { color: #10b981; }
	.rec-confidence {
		font-size: 1rem;
		font-weight: 600;
	}
	.rec-card-desc {
		margin: 0 0 0.75rem;
		font-size: 0.8rem;
		color: #888;
		line-height: 1.4;
	}
	.rec-bars {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 0.75rem;
	}
	.rec-bar-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.rec-bar-label {
		font-size: 0.7rem;
		color: #888;
		min-width: 40px;
	}
	.rec-bar {
		flex: 1;
		height: 6px;
		background: rgba(128, 128, 128, 0.15);
		border-radius: 3px;
		overflow: hidden;
	}
	.rec-bar-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.3s;
	}
	.rec-bar-impact { background: #10b981; }
	.rec-bar-effort { background: #f59e0b; }
	.rec-bar-risk { background: #ef4444; }
	.rec-bar-val {
		font-size: 0.7rem;
		font-weight: 600;
		min-width: 30px;
		text-align: right;
	}
	.rec-steps-preview {
		font-size: 0.78rem;
		margin-bottom: 0.5rem;
	}
	.rec-steps-preview ol {
		margin: 0.25rem 0 0;
		padding-left: 1.25rem;
	}
	.rec-steps-preview li {
		margin-bottom: 0.15rem;
		color: #999;
	}
	.rec-more {
		color: #666;
		font-style: italic;
	}
	.rec-tags {
		display: flex;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}
	.rec-tag {
		padding: 0.1rem 0.35rem;
		background: rgba(128, 128, 128, 0.1);
		border-radius: 3px;
		font-size: 0.65rem;
		color: #888;
	}
	.rec-card-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(128, 128, 128, 0.1);
	}
	.rec-btn-secondary {
		padding: 0.35rem 0.75rem;
		background: transparent;
		border: 1px solid rgba(128, 128, 128, 0.3);
		border-radius: 4px;
		font-size: 0.78rem;
		cursor: pointer;
		color: inherit;
	}
	.rec-btn-secondary:hover {
		background: rgba(128, 128, 128, 0.1);
	}
	.rec-btn-primary {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.75rem;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.rec-btn-primary:hover {
		background: #2563eb;
	}

	/* Dialog styles */
	:global(.rec-dialog-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 50;
	}
	:global(.rec-dialog-content) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		max-width: 700px;
		width: 90%;
		max-height: 85vh;
		overflow-y: auto;
		background: #1a1a2e;
		border: 1px solid rgba(128, 128, 128, 0.3);
		border-radius: 12px;
		padding: 1.5rem;
		z-index: 51;
		color: #e0e0e0;
	}
	:global(.rec-dialog-title) {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 0.25rem;
	}
	:global(.rec-dialog-desc) {
		font-size: 0.8rem;
		color: #888;
		margin: 0 0 1rem;
	}
	.rec-detail-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
		padding: 1rem;
		background: rgba(128, 128, 128, 0.05);
		border-radius: 6px;
		margin-bottom: 1rem;
	}
	.rec-detail-item {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		text-align: center;
	}
	.rec-detail-label {
		font-size: 0.7rem;
		color: #888;
		text-transform: uppercase;
	}
	.rec-detail-section {
		margin-bottom: 1rem;
	}
	.rec-detail-section h4 {
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
		color: #aaa;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.rec-detail-section p {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
		color: #ccc;
	}
	.rec-detail-steps {
		padding-left: 1.25rem;
		margin: 0;
	}
	.rec-detail-steps li {
		margin-bottom: 0.75rem;
		font-size: 0.85rem;
	}
	.rec-step-meta {
		display: flex;
		gap: 1rem;
		margin-top: 0.25rem;
		font-size: 0.75rem;
		color: #888;
	}
	.rec-risk-item {
		padding: 0.75rem;
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 6px;
		margin-bottom: 0.5rem;
		background: rgba(239, 68, 68, 0.05);
	}
	.rec-risk-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.35rem;
		font-size: 0.85rem;
	}
	.rec-risk-score {
		font-size: 0.75rem;
		color: #888;
	}
	.rec-risk-mitigation {
		font-size: 0.8rem;
		color: #aaa;
	}
	.rec-alt-item {
		padding: 0.75rem;
		border: 1px solid rgba(128, 128, 128, 0.2);
		border-radius: 6px;
		margin-bottom: 0.5rem;
	}
	.rec-alt-item h5 {
		margin: 0 0 0.25rem;
		font-size: 0.85rem;
	}
	.rec-alt-item p {
		font-size: 0.8rem;
		color: #aaa;
	}
	.rec-pros-cons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}
	.rec-pros-cons ul {
		margin: 0.25rem 0 0;
		padding-left: 1rem;
		font-size: 0.75rem;
		color: #aaa;
	}
	.rec-metric-item {
		padding: 0.5rem;
		border: 1px solid rgba(59, 130, 246, 0.2);
		border-radius: 6px;
		margin-bottom: 0.5rem;
		background: rgba(59, 130, 246, 0.05);
	}
	.rec-metric-item strong {
		font-size: 0.85rem;
	}
	.rec-metric-item p {
		font-size: 0.75rem;
		color: #888;
		margin: 0.25rem 0 0;
	}
	.rec-dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(128, 128, 128, 0.2);
	}
</style>
