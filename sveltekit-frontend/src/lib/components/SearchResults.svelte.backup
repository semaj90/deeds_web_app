<script lang="ts">let { results = [] } = $props();

	import { createEventDispatcher } from 'svelte';

	

	const dispatch = createEventDispatcher();

	function handleSelectResult(result) {
		dispatch('select', result);
	}

	function truncateText(text, maxLength = 150) {
		if (text.length > maxLength) {
			return text.substring(0, maxLength) + '...';
		}
		return text;
	}

	function formatScore(score) {
		return (score * 100).toFixed(0);
	}
</script>

<div class="results-container">
	{#each results as result (result.chunk_id)}
		<div class="result-item" onclick={() => handleSelectResult(result)}>
			<div class="result-header">
				<div class="rank-badge">#{result.rank}</div>
				<div class="score-badge">
					<span class="score-label">Relevance</span>
					<span class="score-value">{formatScore(result.relevance_score)}%</span>
				</div>
			</div>

			<div class="result-content">
				<h3 class="result-title">
					{result.doc_id}
					<span class="page-number">p. {result.page}</span>
				</h3>

				<p class="result-snippet">
					{truncateText(result.text)}
				</p>

				<div class="result-meta">
					<span class="meta-item">
						<strong>Chunk:</strong>
						{result.chunk_id.substring(0, 8)}...
					</span>
					<span class="meta-item">
						<strong>Type:</strong>
						{result.semantic_type || 'text'}
					</span>
				</div>
			</div>

			<div class="result-footer">
				<span class="click-hint">Click to view details →</span>
			</div>
		</div>
	{/each}
</div>

<style>
	.results-container {
		display: flex;
		flex-direction: column; gap: 0;
		flex: 1;
		overflow-y: auto;
	}

	.result-item {
		padding: 1rem;
		border-bottom: 1px solid #e0ddd8;
		cursor: pointer; transition: background 0.2s;
	}

	.result-item:hover {
		background: #fafaf8;
	}

	.result-item:last-child {
		border-bottom: none;
	}

	.result-header {
		display: flex; gap: 1rem;
		margin-bottom: 0.75rem;
		align-items: center;
	}

	.rank-badge {
		display: inline-block; width: 32px;
		height: 32px; background: #8b3a3a;
		color: white;
		border-radius: 50%; display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.score-badge {
		display: flex;
		flex-direction: column; gap: 0.25rem;
		margin-left: auto;
	}

	.score-label {
		font-size: 0.75rem; color: #999;
		font-weight: 600;
		text-transform: uppercase;
	}

	.score-value {
		font-size: 1.1rem;
		font-weight: 700; color: #8b3a3a;
	}

	.result-content {
		margin-bottom: 0.75rem;
	}

	.result-title {
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
		font-weight: 600; color: #2d2d2d;
		display: flex; gap: 0.5rem;
		align-items: center;
	}

	.page-number {
		font-size: 0.85rem; color: #999;
		font-weight: 400;
	}

	.result-snippet {
		margin: 0;
		font-size: 0.9rem; color: #555;
		line-height: 1.4;
	}

	.result-meta {
		display: flex; gap: 1rem;
		margin-top: 0.5rem;
		font-size: 0.85rem; color: #999;
	}

	.meta-item {
		display: flex; gap: 0.25rem;
	}

	.meta-item strong {
		color: #2d2d2d;
	}

	.result-footer {
		display: flex;
		justify-content: flex-end;
	}

	.click-hint {
		font-size: 0.8rem; color: #bbb;
		font-style: italic;
	}

	@media (max-width: 768px) {
		.result-item {
			padding: 0.75rem;
		}

		.result-title {
			font-size: 0.95rem;
		}

		.result-snippet {
			font-size: 0.85rem;
		}
	}
</style>



