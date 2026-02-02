<script lang="ts">
/**
 * CitationInspector Component (Svelte 5)
 * Modal to display full source content with metadata
 *
 * Pattern: CopilotKit + Pydantic AI
 * Phase: Agentic RAG Source Validation (Task 1.3)
 */

import type { CitationInspectorProps } from '$lib/types/source-validation';

// Svelte 5 props
let { citation, isOpen, onClose }: CitationInspectorProps = $props();

// Close on Escape key
function handleKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape' && isOpen) {
		onClose();
	}
}

// Close on backdrop click
function handleBackdropClick(event: MouseEvent) {
	if (event.target === event.currentTarget) {
		onClose();
	}
}
</script>

<svelte, window onkeydown={ handleKeydown } />

{#if isOpen}
	<div
		class="modal-backdrop"
		onclick={ handleBackdropClick }
		onkeydown={(e) => e.key === 'Escape' && onClose()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="citation-title"
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="modal-content"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="document"
		>
			<!-- Header -->
			<div class="modal-header">
				<div class="flex-1">
					<h2 id="citation-title" class="text-xl font-bold mb-2">
						📄 Source Citation
					</h2>
					<p class="text-sm text-gray-600">{citation.source_file}</p>
				</div>
				<button
					onclick={onClose}
					class="close-button"
					aria-label="Close"
				>
					✕
				</button>
			</div>

			<!-- Metadata -->
			<div class="metadata-section">
				<div class="metadata-grid">
					<div class="metadata-item">
						<span class="label">Chunk ID:</span>
						<span class="value font-mono text-xs">{citation.chunk_id}</span>
					</div>
					<div class="metadata-item">
						<span class="label">Confidence:</span>
						<span
							class="value font-semibold"
							class:text-green-600={citation.confidence >= 0.9}; class:text-yellow-600={citation.confidence >= 0.7 && citation.confidence < 0.9}; class:text-red-600={citation.confidence < 0.7}
						>
							{(citation.confidence * 100).toFixed(1)}%
						</span>
					</div>
					<div class="metadata-item">
						<span class="label">Used in Answer:</span>
						<span class="value">
							{#if citation.used_in_answer}
								<span class="text-green-600 font-semibold">✅ Yes</span>
							{:else}
								<span class="text-gray-500">❌ No</span>
							{/if}
						</span>
					</div>
				</div>
			</div>

			<!-- Content -->
			<div class="content-section">
				<h3 class="section-title">Full Content:</h3>
				<div class="content-text">
					{citation.snippet}
				</div>
			</div>

			<!-- Footer Actions -->
			<div class="modal-footer">
				<button
					onclick={onClose}
					class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
	top: 0;
		left: 0;
	width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	padding: 1rem;
		overflow-y: auto;
	}

	.modal-content {
		background: white;
		border-radius: 12px;
		max-width: 800px;
	width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
			0 10px 10px -5px rgba(0, 0, 0, 0.04);
		animation: slideIn 0.2s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
	transform: translateY(-20px);
		}
		to {
			opacity: 1;
	transform: translateY(0);
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: start;
	padding: 1.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.close-button {
		width: 32px;
	height: 32px;
		border-radius: 6px;
	border: none;
		background: #f3f4f6;
	cursor: pointer;
		font-size: 1.25rem;
	color: #6b7280;
		transition:all 0.2s;
	}

	.close-button:hover {
		background: #e5e7eb;
	color: #374151;
	}

	.metadata-section {
		padding: 1.5rem;
	background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.metadata-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.metadata-item {
		display: flex;
		flex-direction: column;
	gap: 0.25rem;
	}

	.metadata-item .label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	color: #6b7280;
		letter-spacing: 0.05em;
	}

	.metadata-item .value {
		font-size: 0.875rem;
	color: #111827;
	}

	.content-section {
		padding: 1.5rem;
	}

	.section-title {
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: uppercase;
	color: #6b7280;
		letter-spacing: 0.05em;
		margin-bottom: 1rem;
	}

	.content-text {
		padding: 1rem;
	background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-family: 'Courier New', monospace;
		font-size: 0.875rem;
		line-height: 1.6;
	color: #374151;
		white-space: pre-wrap;
		overflow-x: auto;
	}

	.modal-footer {
		padding: 1.5rem;
		border-top: 1px solid #e5e7eb;
		display: flex;
		justify-content: flex-end;
	gap: 0.75rem;
	}
</style>



