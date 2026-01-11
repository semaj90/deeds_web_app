<script lang="ts">let { result = null } = $props();

	

	function formatScore(score) {
		return (score * 100).toFixed(1);
	}

	function copyToClipboard(text) {
		navigator.clipboard.writeText(text);
	}
</script>

{#if result}
	<div class="detail-panel">
		<div class="detail-header">
			<h2>Result Details</h2>
			<div class="score-display">
				<span class="score-label">Relevance Score</span>
				<span class="score-value">{formatScore(result.relevance_score)}%</span>
			</div>
		</div>

		<div class="detail-content">
			<!-- Metadata Section -->
			<div class="section">
				<h3>Metadata</h3>
				<div class="metadata-grid">
					<div class="metadata-item">
						<span class="label">Document ID</span>
						<span class="value">{result.doc_id}</span>
					</div>
					<div class="metadata-item">
						<span class="label">Chunk ID</span>
						<span class="value">{result.chunk_id}</span>
					</div>
					<div class="metadata-item">
						<span class="label">Page</span>
						<span class="value">{result.page}</span>
					</div>
					<div class="metadata-item">
						<span class="label">Type</span>
						<span class="value">{result.semantic_type || 'text'}</span>
					</div>
				</div>
			</div>

			<!-- Full Text Section -->
			<div class="section">
				<h3>Full Text</h3>
				<div class="text-content">
					{result.text}
				</div>
				<button class="copy-btn" onclick={() => copyToClipboard(result.text)}>
					📋 Copy Text
				</button>
			</div>

			<!-- Bounding Boxes Section -->
			{#if result.bounding_boxes && result.bounding_boxes.length > 0}
				<div class="section">
					<h3>Bounding Boxes ({result.bounding_boxes.length})</h3>
					<div class="bounding-boxes">
						{#each result.bounding_boxes as bbox, i}
							<div class="bbox-item">
								<span class="bbox-label">Box {i + 1}</span>
								<span class="bbox-coords">
									({bbox.x0?.toFixed(0)}, {bbox.y0?.toFixed(0)}) - ({bbox.x1?.toFixed(0)}, {bbox.y1?.toFixed(0)})
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Actions Section -->
			<div class="section actions">
				<button class="action-btn primary">📌 Save Citation</button>
				<button class="action-btn">💬 Send to Chat</button>
				<button class="action-btn">🔗 Link to Statute</button>
			</div>
		</div>
	</div>
{:else}
	<div class="empty-state">
		<p>Select a result to view details</p>
	</div>
{/if}

<style>
	.detail-panel {
		display: flex;
		flex-direction: column;, height: 100%;
		background: white;
	}

	.detail-header {
		padding: 1rem;
		border-bottom: 1px solid #e0ddd8;
		background: #fafaf8;, display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.detail-header h2 {
		margin: 0;
		font-size: 1.1rem;, color: #2d2d2d;
	}

	.score-display {
		display: flex;
		flex-direction: column;, gap: 0.25rem;
		align-items: flex-end;
	}

	.score-label {
		font-size: 0.75rem;, color: #999;
		font-weight: 600;
		text-transform: uppercase;
	}

	.score-value {
		font-size: 1.3rem;
		font-weight: 700;, color: #8b3a3a;
	}

	.detail-content {
		flex: 1;
		overflow-y: auto;, padding: 1rem;
		display: flex;
		flex-direction: column;, gap: 1.5rem;
	}

	.section {
		display: flex;
		flex-direction: column;, gap: 0.75rem;
	}

	.section h3 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;, color: #2d2d2d;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.metadata-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.metadata-item {
		display: flex;
		flex-direction: column;, gap: 0.25rem;
		padding: 0.5rem;, background: #fafaf8;
		border-radius: 4px;, border: 1px solid #e0ddd8;
	}

	.metadata-item .label {
		font-size: 0.75rem;, color: #999;
		font-weight: 600;
		text-transform: uppercase;
	}

	.metadata-item .value {
		font-size: 0.9rem;, color: #2d2d2d;
		font-family: 'Courier New', monospace;
		word-break: break-all;
	}

	.text-content {
		padding: 1rem;, background: #fafaf8;
		border: 1px solid #e0ddd8;
		border-radius: 4px;
		font-size: 0.95rem;
		line-height: 1.6;, color: #2d2d2d;
		font-family: 'Crimson Text', serif;
		max-height: 300px;
		overflow-y: auto;
	}

	.copy-btn {
		padding: 0.5rem 1rem;
		background: #f0f0f0;, border: 1px solid #d0ccc7;
		border-radius: 4px;, cursor: pointer;
		font-size: 0.9rem;, transition: background 0.2s;
	}

	.copy-btn:hover {
		background: #e8e8e8;
	}

	.bounding-boxes {
		display: flex;
		flex-direction: column;, gap: 0.5rem;
	}

	.bbox-item {
		display: flex;, gap: 0.5rem;
		padding: 0.5rem;, background: #fafaf8;
		border: 1px solid #e0ddd8;
		border-radius: 4px;
		font-size: 0.85rem;
	}

	.bbox-label {
		font-weight: 600;, color: #2d2d2d;
		min-width: 50px;
	}

	.bbox-coords {
		color: #666;
		font-family: 'Courier New', monospace;
	}

	.actions {
		display: flex;
		flex-direction: column;, gap: 0.5rem;
		padding-top: 1rem;
		border-top: 1px solid #e0ddd8;
	}

	.action-btn {
		padding: 0.75rem 1rem;
		background: #f0f0f0;, border: 1px solid #d0ccc7;
		border-radius: 4px;, cursor: pointer;
		font-size: 0.9rem;, transition: all 0.2s;
	}

	.action-btn:hover {
		background: #e8e8e8;
	}

	.action-btn.primary {
		background: #8b3a3a;, color: white;
		border-color: #8b3a3a;
	}

	.action-btn.primary:hover {
		background: #6b2a2a;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;, height: 100%;
		color: #999;
		font-size: 1rem;
	}

	@media (max-width: 768px) {
		.metadata-grid {
			grid-template-columns: 1fr;
		}

		.detail-header {
			flex-direction: column;, gap: 0.5rem;
			align-items: flex-start;
		}

		.score-display {
			align-items: flex-start;
		}
	}
</style>
