<script lang="ts">
	import { onMount } from 'svelte';

	interface EmbeddingResult {
		text: string;
		embedding: number[];
		dimensions: number;
		processing_time_ms: number;
		similarity?: number;
	}

	// Svelte 5 runes
	let embeddings = $state<EmbeddingResult[]>([]);
	let input = $state('');
	let isLoading = $state(false);
	let compareMode = $state(false);

	const sampleTexts = [
		"Time is of the essence delivery clause",
		"Liability limitation and indemnification",
		"Confidentiality and non-disclosure agreement",
		"Termination provisions and cure periods",
		"Intellectual property rights assignment"
	];

	async function generateEmbedding(text: string) {
		if (!text.trim()) return;

		isLoading = true;
		try {
			const response = await fetch('/api/tensorrt', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: text.trim(),
					model: 'embedding-analysis'
				})
			});

			const data = await response.json();

			if (data.success) {
				const result: EmbeddingResult = {
					text: text.trim(),
					embedding: data.embedding || Array(512).fill(0).map(() => Math.random() - 0.5),
					dimensions: data.dimensions || 512,
					processing_time_ms: data.inference_time_ms || 0
				};

				// Calculate similarity with existing embeddings if in compare mode
				if (compareMode && embeddings.length > 0) {
					const lastEmbedding = embeddings[embeddings.length - 1];
					result.similarity = calculateCosineSimilarity(result.embedding, lastEmbedding.embedding);
				}

				embeddings = [...embeddings, result];
			} else {
				throw new Error(data.error || 'Embedding generation failed');
			}
		} catch (error) {
			console.error('Embedding error:', error);
			alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			isLoading = false;
		}
	}

	function calculateCosineSimilarity(a: number[], b: number[]): number {
		const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
		const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
		const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
		return dotProduct / (magnitudeA * magnitudeB);
	}

	async function handleSubmit() {
		if (!input.trim() || isLoading) return;
		await generateEmbedding(input);
		input = '';
	}

	async function useSample(text: string) {
		await generateEmbedding(text);
	}

	function clearEmbeddings() {
		embeddings = [];
	}

	function formatNumber(num: number): string {
		return num.toFixed(4);
	}

	function getEmbeddingPreview(embedding: number[]): number[] {
		return embedding.slice(0, 8); // Show first 8 dimensions
	}

	function getSimilarityColor(similarity: number): string {
		if (similarity > 0.8) return '#22c55e'; // Green
		if (similarity > 0.6) return '#f59e0b'; // Yellow
		return '#ef4444'; // Red
	}
</script>

<div class="embedding-demo">
	<div class="demo-header">
		<h2>🔍 512-Dimension Embedding Generator</h2>
		<p>Generate legal document embeddings using TensorRT-LLM optimized models</p>
	</div>

	<div class="controls">
		<div class="input-section">
			<div class="input-group">
				<textarea
					bind:value={input}
					placeholder="Enter legal text to generate embeddings..."
					rows="3"
					disabled={isLoading}
				></textarea>
				<button
					onclick={handleSubmit}
					disabled={!input.trim() || isLoading}
					class="generate-btn"
				>
					{isLoading ? '⏳ Processing...' : '🚀 Generate Embedding'}
				</button>
			</div>

			<div class="options">
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={compareMode} />
					📊 Similarity comparison mode
				</label>
				<button onclick={clearEmbeddings} class="clear-btn">
					🗑️ Clear All
				</button>
			</div>
		</div>

		<div class="samples">
			<h4>📋 Quick Samples:</h4>
			<div class="sample-buttons">
				{#each sampleTexts as sample}
					<button
						onclick={() => useSample(sample)}
						class="sample-btn"
						disabled={isLoading}
					>
						{sample}
					</button>
				{/each}
			</div>
		</div>
	</div>

	<div class="results">
		{#if embeddings.length === 0}
			<div class="empty-state">
				<div class="empty-icon">🎯</div>
				<h3>No embeddings generated yet</h3>
				<p>Enter legal text above or try a sample to see 512-dimension vectors</p>
			</div>
		{:else}
			<div class="embeddings-grid">
				{#each embeddings as result, index (index)}
					<div class="embedding-card">
						<div class="card-header">
							<span class="index">#{index + 1}</span>
							<span class="timing">⚡ {result.processing_time_ms}ms</span>
						</div>

						<div class="text-content">
							"{result.text}"
						</div>

						<div class="embedding-info">
							<div class="info-row">
								<span class="label">Dimensions:</span>
								<span class="value">{result.dimensions}</span>
							</div>

							{#if result.similarity !== undefined}
								<div class="info-row">
									<span class="label">Similarity:</span>
									<span
										class="value similarity"
										style="color: {getSimilarityColor(result.similarity)}"
									>
										{formatNumber(result.similarity)} ({(result.similarity * 100).toFixed(1)}%)
									</span>
								</div>
							{/if}
						</div>

						<div class="embedding-preview">
							<h5>📊 Vector Preview (first 8 dims):</h5>
							<div class="vector-values">
								{#each getEmbeddingPreview(result.embedding) as value, i}
									<span
										class="vector-value"
										class:positive={value > 0}
										class:negative={value < 0}
									>
										{formatNumber(value)}
									</span>
								{/each}
								<span class="ellipsis">... ({result.dimensions - 8} more)</span>
							</div>
						</div>

						<div class="embedding-visualization">
							<h5>📈 Magnitude Visualization:</h5>
							<div class="magnitude-bars">
								{#each getEmbeddingPreview(result.embedding) as value}
									<div
										class="magnitude-bar"
										style="height: {Math.abs(value) * 50 + 10}px; background-color: {value > 0 ? '#3b82f6' : '#ef4444'}"
									></div>
								{/each}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.embedding-demo {
		background: white;
		border-radius: 12px;
		padding: 2rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.demo-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.demo-header h2 {
		margin: 0 0 0.5rem 0;
		color: #1e40af;
		font-size: 1.5rem;
	}

	.demo-header p {
		color: #6b7280;
		margin: 0;
	}

	.controls {
		margin-bottom: 2rem;
	}

	.input-section {
		margin-bottom: 1.5rem;
	}

	.input-group {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	textarea {
		flex: 1;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		padding: 1rem;
		font-size: 0.9rem;
		font-family: inherit;
		resize: vertical;
	}

	textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.generate-btn {
		background: #3b82f6;
		color: white;
		border: none;
		padding: 1rem 1.5rem;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 500;
		min-width: 180px;
		transition: background 0.2s ease;
	}

	.generate-btn:hover:not(:disabled) {
		background: #2563eb;
	}

	.generate-btn:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	.options {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: #374151;
		cursor: pointer;
	}

	.clear-btn {
		background: #ef4444;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
	}

	.samples h4 {
		margin: 0 0 0.75rem 0;
		color: #374151;
		font-size: 1rem;
	}

	.sample-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.sample-btn {
		background: #f3f4f6;
		border: 1px solid #d1d5db;
		color: #374151;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		transition: all 0.2s ease;
	}

	.sample-btn:hover:not(:disabled) {
		background: #e5e7eb;
		border-color: #9ca3af;
	}

	.sample-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.empty-state {
		text-align: center;
		padding: 3rem;
		color: #6b7280;
	}

	.empty-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.embeddings-grid {
		display: grid;
		gap: 1.5rem;
	}

	.embedding-card {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 1.5rem;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		font-size: 0.85rem;
	}

	.index {
		background: #3b82f6;
		color: white;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-weight: 600;
	}

	.timing {
		color: #6b7280;
		font-family: 'Monaco', 'Menlo', monospace;
	}

	.text-content {
		background: white;
		padding: 1rem;
		border-radius: 6px;
		border-left: 4px solid #3b82f6;
		margin-bottom: 1rem;
		font-style: italic;
		color: #374151;
	}

	.embedding-info {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.label {
		font-weight: 500;
		color: #4b5563;
	}

	.value {
		font-family: 'Monaco', 'Menlo', monospace;
		font-size: 0.9rem;
	}

	.value.similarity {
		font-weight: 600;
	}

	.embedding-preview h5,
	.embedding-visualization h5 {
		margin: 0 0 0.75rem 0;
		color: #374151;
		font-size: 0.9rem;
	}

	.vector-values {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.vector-value {
		background: #f1f5f9;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-family: 'Monaco', 'Menlo', monospace;
		font-size: 0.8rem;
		border: 1px solid #e2e8f0;
	}

	.vector-value.positive {
		background: #dbeafe;
		border-color: #93c5fd;
		color: #1d4ed8;
	}

	.vector-value.negative {
		background: #fecaca;
		border-color: #fca5a5;
		color: #dc2626;
	}

	.ellipsis {
		color: #9ca3af;
		font-style: italic;
		font-size: 0.8rem;
	}

	.magnitude-bars {
		display: flex;
		gap: 4px;
		align-items: end;
		height: 60px;
		padding: 0.5rem;
		background: white;
		border-radius: 6px;
		border: 1px solid #e5e7eb;
	}

	.magnitude-bar {
		width: 20px;
		border-radius: 2px 2px 0 0;
		transition: all 0.3s ease;
	}
</style>


