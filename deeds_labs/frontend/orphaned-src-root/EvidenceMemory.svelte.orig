<script lang="ts">
	export let evidence = [];

	function formatScore(score: number): string {
		return (score * 100).toFixed(0);
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function handleEvidenceClick(item) {
		console.log('Clicked evidence:', item);
		// In production, would navigate to evidence details
	}
</script>

<div class="evidence-memory">
	{#if evidence.length === 0}
		<div class="empty-state">
			<p>No evidence referenced yet</p>
		</div>
	{:else}
		<div class="evidence-list">
			{#each evidence as item (item.chunk_id)}
				<div class="evidence-item" on:click={() => handleEvidenceClick(item)}>
					<div class="evidence-header">
						<div class="evidence-title">
							<span class="chunk-id">{item.chunk_id.substring(0, 8)}...</span>
							<span class="doc-id">{item.doc_id}</span>
						</div>
						<div class="score-badge">
							{formatScore(item.relevance_score)}%
						</div>
					</div>

					<div class="evidence-meta">
						<span class="ref-count">
							<strong>{item.reference_count}</strong> references
						</span>
						<span class="last-ref">
							{formatDate(item.last_referenced)}
						</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.evidence-memory {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		flex: 1;
		overflow-y: auto;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #999;
		font-size: 0.9rem;
		text-align: center;
	}

	.evidence-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.evidence-item {
		padding: 0.75rem;
		background: white;
		border: 1px solid #e0ddd8;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.evidence-item:hover {
		background: #fafaf8;
		border-color: #8b3a3a;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.evidence-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.evidence-title {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
	}

	.chunk-id {
		font-size: 0.8rem;
		color: #999;
		font-family: 'Courier New', monospace;
	}

	.doc-id {
		font-size: 0.85rem;
		font-weight: 600;
		color: #2d2d2d;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.score-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		background: #8b3a3a;
		color: white;
		border-radius: 3px;
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.evidence-meta {
		display: flex;
		gap: 0.75rem;
		font-size: 0.75rem;
		color: #999;
	}

	.ref-count {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.ref-count strong {
		color: #2d2d2d;
	}

	.last-ref {
		margin-left: auto;
	}
</style>
