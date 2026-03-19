<!--
  Recommendation Widget
  Shows personalized document recommendations with 5-signal scoring breakdown

  Usage:
    <RecommendationWidget
      query="contract dispute evidence"
      caseId={currentCaseId}
      documentId={currentDocId}
      onSelect={(doc) => navigateToDocument(doc)}
    />
-->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	// ScrollArea removed — bits-ui ScrollArea triggers $props() TDZ in Svelte 5.46.0
	import { browser } from '$app/environment';
	import type { GPURerankMetrics } from '$lib/gpu/gpu-search-reranker.js';

	interface Props {
		query: string;
		caseId?: string;
		documentId?: string; // Current document ID (to exclude from recommendations)
		tags?: string[];
		limit?: number;
		onSelect?: (doc: RecommendedDocument) => void;
		compact?: boolean; // Compact mode for sidebars
		enableGPURerank?: boolean; // Enable client-side GPU reranking (default: false)
	}

	interface RecommendedDocument {
		documentId: string;
		title: string;
		score: number;
		signals: {
			vectorSimilarity: number;
			tagOverlap: number;
			topicAffinity: number;
			graphCentrality: number;
			profileMatch: number;
		};
		explanationTokens: string[];
		gpuScore?: number; // Client-side GPU cosine similarity score
	}

	let {
		query,
		caseId = undefined,
		documentId = undefined,
		tags = [],
		limit = 5,
		onSelect = undefined,
		compact = false,
		enableGPURerank = false
	}: Props = $props();

	let recommendations = $state<RecommendedDocument[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let expanded = $state<string | null>(null);
	let gpuMetrics = $state<GPURerankMetrics | null>(null);
	let gpuReranking = $state(false);

	// Fetch recommendations on mount and when query changes
	$effect(() => {
		if (query && query.trim().length > 0) {
			fetchRecommendations();
		}
	});

	async function fetchRecommendations() {
		loading = true;
		error = null;
		gpuMetrics = null;

		try {
			const response = await fetch('/api/recommendations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query,
					caseId,
					tags,
					topK: limit + 1, // Fetch one extra to exclude current document
					includeExplanations: true
				})
			});

			if (!response.ok) {
				throw new Error(`Recommendation fetch failed: ${response.status}`);
			}

			const data = await response.json();

			if (data.success) {
				// Filter out current document and limit to requested count
				recommendations = (data.data.recommendations || [])
					.filter((rec: RecommendedDocument) => rec.documentId !== documentId)
					.slice(0, limit);

				// Optional: GPU rerank after server results
				if (enableGPURerank && browser && recommendations.length > 0) {
					runGPURerank();
				}
			} else {
				throw new Error(data.error || 'Failed to fetch recommendations');
			}
		} catch (err) {
			console.error('[RecommendationWidget] Fetch error:', err);
			error = err instanceof Error ? err.message : String(err);
			recommendations = [];
		} finally {
			loading = false;
		}
	}

	/**
	 * Run client-side GPU reranking on server results.
	 * Uses WebGPU cosine similarity to verify/adjust server scores.
	 */
	async function runGPURerank() {
		if (!browser || recommendations.length === 0) return;
		gpuReranking = true;

		try {
			const { gpuRerank } = await import('$lib/gpu/gpu-search-reranker.js');
			const chunks = recommendations.map((rec) => ({
				content: `${rec.title} ${rec.explanationTokens.join(' ')}`,
				serverScore: rec.score
			}));

			const result = await gpuRerank(query, chunks, recommendations.length);
			if (result) {
				gpuMetrics = result.metrics;

				// Merge GPU scores into recommendations
				for (const item of result.items) {
					if (item.index < recommendations.length && item.gpuScore >= 0) {
						recommendations[item.index].gpuScore = item.gpuScore;
					}
				}

				// Re-sort by blended score (70% server + 30% GPU)
				recommendations = [...recommendations].sort((a, b) => {
					const scoreA = a.gpuScore !== undefined ? 0.7 * a.score + 0.3 * a.gpuScore : a.score;
					const scoreB = b.gpuScore !== undefined ? 0.7 * b.score + 0.3 * b.gpuScore : b.score;
					return scoreB - scoreA;
				});

				console.info(
					`[RecommendationWidget] GPU rerank: ${result.metrics.chunksProcessed} docs via ${result.metrics.backend} in ${result.metrics.totalMs}ms`
				);
			}
		} catch (err) {
			console.warn('[RecommendationWidget] GPU rerank failed (non-fatal):', err);
		} finally {
			gpuReranking = false;
		}
	}

	function toggleExpanded(docId: string) {
		expanded = expanded === docId ? null : docId;
	}

	async function handleSelect(doc: RecommendedDocument) {
		// Track click interaction
		try {
			await fetch('/api/recommendations/track', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					interactionType: 'click',
					documentId: doc.documentId,
					recommendationId: `rec-${Date.now()}`,
					caseId,
					searchContext: query
				})
			});
		} catch (trackError) {
			console.warn('[RecommendationWidget] Tracking failed:', trackError);
		}

		onSelect?.(doc);
	}

	function getSignalColor(value: number): string {
		if (value >= 0.8) return 'text-emerald-400';
		if (value >= 0.6) return 'text-blue-400';
		if (value >= 0.4) return 'text-amber-400';
		return 'text-sand-11';
	}

	function getSignalLabel(key: string): string {
		const labels: Record<string, string> = {
			vectorSimilarity: 'Vector',
			tagOverlap: 'Tags',
			topicAffinity: 'Topic',
			graphCentrality: 'Graph',
			profileMatch: 'Profile'
		};
		return labels[key] || key;
	}
</script>

<div class="recommendation-widget" class:compact>
	<!-- Header -->
	<div class="widget-header">
		<div class="flex items-center gap-2">
			<Icon name="sparkles" class="text-accent" />
			<h3 class="text-sm font-medium text-sand-12">
				{compact ? 'Related' : 'Recommended Documents'}
			</h3>
		</div>
		<div class="flex items-center gap-2">
			{#if gpuMetrics}
				<span class="gpu-badge" title="GPU reranked via {gpuMetrics.backend} in {gpuMetrics.totalMs}ms">
					<Icon name="cpu" />
					{gpuMetrics.backend}
				</span>
			{/if}
			{#if loading || gpuReranking}
				<div class="flex items-center gap-2 text-xs text-sand-11">
					<Icon name="loader-circle" class="animate-spin" />
					<span>{gpuReranking ? 'GPU reranking...' : 'Loading...'}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Content -->
	{#if error}
		<div class="error-state">
			<Icon name="circle-alert" class="text-danger" />
			<p class="text-xs text-danger">{error}</p>
			<Button onclick={fetchRecommendations} class="text-xs">Retry</Button>
		</div>
	{:else if recommendations.length === 0 && !loading}
		<div class="empty-state">
			<Icon name="inbox" class="text-sand-9" />
			<p class="text-xs text-sand-11">No recommendations found</p>
		</div>
	{:else}
		<div class="recommendation-list" style="overflow-y: auto;">
				{#each recommendations as rec (rec.documentId)}
					<div class="recommendation-item" class:expanded={expanded === rec.documentId}>
						<!-- Main Row -->
						<div class="item-header">
							<button
								class="item-content-button"
								onclick={() => handleSelect(rec)}
								onkeydown={(e) => e.key === 'Enter' && handleSelect(rec)}
							>
								<div class="item-content">
									<div class="flex items-start justify-between gap-2">
										<h4 class="item-title">{rec.title}</h4>
										<div class="score-badge">
											{Math.round(rec.score * 100)}%
										</div>
									</div>

									{#if !compact}
										<!-- Explanation Tokens -->
										<div class="explanation-tokens">
											{#each rec.explanationTokens.slice(0, 2) as token}
												<span class="token">{token}</span>
											{/each}
										</div>
									{/if}
								</div>
							</button>

							<button
								class="expand-button"
								onclick={(e) => {
									e.stopPropagation();
									toggleExpanded(rec.documentId);
								}}
							>
								<Icon name={expanded === rec.documentId ? 'chevron-up' : 'chevron-down'} />
							</button>
						</div>

						<!-- Expanded Details -->
						{#if expanded === rec.documentId && !compact}
							<div class="item-details">
								<div class="signals-grid">
									{#each Object.entries(rec.signals) as [key, value]}
										{#if key !== 'finalScore'}
											<div class="signal-row">
												<span class="signal-label">{getSignalLabel(key)}</span>
												<div class="signal-bar">
													<div class="signal-fill" style="width: {value * 100}%"></div>
												</div>
												<span class="signal-value {getSignalColor(value)}">
													{Math.round(value * 100)}%
												</span>
											</div>
										{/if}
									{/each}
									{#if rec.gpuScore !== undefined}
										<div class="signal-row">
											<span class="signal-label gpu-label">GPU</span>
											<div class="signal-bar gpu-bar">
												<div class="signal-fill gpu-fill" style="width: {rec.gpuScore * 100}%"></div>
											</div>
											<span class="signal-value text-emerald-400">
												{Math.round(rec.gpuScore * 100)}%
											</span>
										</div>
									{/if}
								</div>

								{#if rec.explanationTokens.length > 2}
									<div class="explanation-tokens-full">
										{#each rec.explanationTokens as token}
											<span class="token">{token}</span>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
		</div>
	{/if}
</div>

<style>
	.recommendation-widget {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		background: var(--panel-soft);
		border: 1px solid var(--sand-6);
		border-radius: 0.5rem;
		height: 100%;
		max-height: 600px;
	}

	.recommendation-widget.compact {
		padding: 0.75rem;
		gap: 0.5rem;
		max-height: 400px;
	}

	.widget-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--sand-6);
	}

	.recommendation-list {
		flex: 1;
		min-height: 0;
	}

	.viewport {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-right: 0.5rem;
	}

	.recommendation-item {
		background: var(--sand-2);
		border: 1px solid var(--sand-6);
		border-radius: 0.375rem;
		overflow: hidden;
		transition: all 0.2s;
	}

	.recommendation-item:hover {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}

	.recommendation-item.expanded {
		border-color: var(--accent);
	}

	.item-header {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem;
	}

	.item-content-button {
		flex: 1;
		min-width: 0;
		display: flex;
		padding: 0;
		background: transparent;
		border: none;
		text-align: left;
		cursor: pointer;
		color: inherit;
	}

	.item-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.item-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--sand-12);
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.score-badge {
		flex-shrink: 0;
		padding: 0.125rem 0.5rem;
		background: var(--accent-soft);
		color: var(--accent);
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.explanation-tokens {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.explanation-tokens-full {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--sand-6);
	}

	.token {
		font-size: 0.6875rem;
		padding: 0.125rem 0.5rem;
		background: var(--sand-4);
		color: var(--sand-11);
		border-radius: 0.25rem;
		white-space: nowrap;
	}

	.expand-button {
		flex-shrink: 0;
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: var(--sand-11);
		cursor: pointer;
		border-radius: 0.25rem;
		transition: all 0.2s;
	}

	.expand-button:hover {
		background: var(--sand-4);
		color: var(--sand-12);
	}

	.item-details {
		padding: 0 0.75rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.signals-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.signal-row {
		display: grid;
		grid-template-columns: 4rem 1fr 3rem;
		align-items: center;
		gap: 0.5rem;
	}

	.signal-label {
		font-size: 0.75rem;
		color: var(--sand-11);
	}

	.signal-bar {
		height: 0.375rem;
		background: var(--sand-4);
		border-radius: 0.25rem;
		overflow: hidden;
	}

	.signal-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--accent-soft), var(--accent));
		transition: width 0.3s ease;
	}

	.signal-value {
		font-size: 0.75rem;
		font-weight: 600;
		text-align: right;
	}

	.gpu-badge {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.625rem;
		padding: 0.125rem 0.375rem;
		background: rgba(16, 185, 129, 0.15);
		color: rgb(52, 211, 153);
		border-radius: 0.25rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.gpu-label {
		color: rgb(52, 211, 153);
		font-weight: 600;
	}

	.gpu-bar {
		background: rgba(16, 185, 129, 0.1);
	}

	.gpu-fill {
		background: linear-gradient(90deg, rgba(16, 185, 129, 0.4), rgb(16, 185, 129));
	}

	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem 1rem;
		text-align: center;
	}
</style>
