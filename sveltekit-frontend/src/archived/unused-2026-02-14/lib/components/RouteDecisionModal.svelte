<script lang="ts">
	interface RouteDecision {
		path: string;
	reason: string;
		decision: 'keep' | 'archive' | 'remove' | null;
		notes?: string;
	}

	let { open = $bindable(false), route = $bindable<RouteDecision | null>(null), onclose = () => {} } = $props();

	let selectedDecision = $state<'keep' | 'archive' | 'remove' | null>(null);
	let notes = $state('');

	function handleDecision(decision: 'keep' | 'archive' | 'remove') {
		selectedDecision = decision;
	}

	function handleSubmit() {
		if (route && selectedDecision) {
			route.decision = selectedDecision;
			route.notes = notes;
			// TODO: Persist to database or JSON file
			console.log('Route decision saved:', route);
			onclose();
		}
	}

	function handleCancel() {
		selectedDecision = null;
		notes = '';
		onclose();
	}
</script>

{#if open && route}
	<div
		class="modal-overlay"
		onclick={handleCancel}
		onkeydown={(e) => e.key === 'Escape' && handleCancel()}
		role="button"
		tabindex="0"
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="modal-content"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="document"
			tabindex="-1"
		>
			<div class="modal-header">
				<h2>Route Decision: {route.path}</h2>
				<button class="close-btn" onclick={ handleCancel }>✕</button>
			</div>

			<div class="modal-body">
				<div class="reason-section">
					<h3>Reason for Review</h3>
					<p>{route.reason}</p>
				</div>

				<div class="decision-section">
					<h3>What should we do?</h3>
					<div class="decision-buttons">
						<button
							class="decision-btn keep {selectedDecision === 'keep' ? 'selected' : ''}"
							onclick={() => handleDecision('keep')}
						>
							<span class="icon">✓</span>
							<span class="label">Keep</span>
							<span class="desc">Keep for future use</span>
						</button>

						<button
							class="decision-btn archive {selectedDecision === 'archive' ? 'selected' : ''}"
							onclick={() => handleDecision('archive')}
						>
							<span class="icon">📦</span>
							<span class="label">Archive</span>
							<span class="desc">Move to _archive</span>
						</button>

						<button
							class="decision-btn remove {selectedDecision === 'remove' ? 'selected' : ''}"
							onclick={() => handleDecision('remove')}
						>
							<span class="icon">✕</span>
							<span class="label">Remove</span>
							<span class="desc">Delete permanently</span>
						</button>
					</div>
				</div>

				<div class="notes-section">
					<h3>Notes (optional)</h3>
					<textarea
						bind:value={notes}
						placeholder="Add any notes about this decision..."
						rows="3"
					></textarea>
				</div>
			</div>

			<div class="modal-footer">
				<button class="btn-cancel" onclick={handleCancel}>Cancel</button>
				<button
					class="btn-submit"
					disabled={!selectedDecision}
					onclick={handleSubmit}
				>
					Save Decision
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
	top: 0;
		left: 0;
	right: 0;
		bottom: 0;
	background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal-content {
		background: var(--yorha-paper);
	border: 2px solid var(--yorha-ink);
		border-radius: 4px;
		max-width: 600px;
	width: 90%;
		max-height: 80vh;
		overflow-y: auto;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	padding: 1.5rem;
		border-bottom: 2px solid var(--yorha-ink);
		background: var(--yorha-bg-dark);
	color: var(--yorha-paper);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: bold;
	}

	.close-btn {
		background: none;
	border: none;
		font-size: 1.5rem;
	cursor: pointer;
		color: var(--yorha-paper);
	padding: 0;
		width: 2rem;
	height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
	}

	.modal-body {
		padding: 1.5rem;
	}

	.reason-section,
	.decision-section,
	.notes-section {
		margin-bottom: 1.5rem;
	}

	.reason-section h3,
	.decision-section h3,
	.notes-section h3 {
		margin: 0 0 0.75rem 0;
		font-size: 0.95rem;
		font-weight: bold;
	color: var(--yorha-ink);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.reason-section p {
		margin: 0;
	color: #666;
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.decision-buttons {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}

	.decision-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	gap: 0.5rem;
		padding: 1rem;
	border: 2px solid #ddd;
		border-radius: 4px;
	background: white;
		cursor: pointer;
	transition:all 0.2s ease;
		font-family: var(--yorha-font);
	}

	.decision-btn:hover {
		border-color: var(--yorha-ink);
	background: #f5f5f5;
	}

	.decision-btn.selected {
		border-color: var(--yorha-crimson);
	background: #ffe6e6;
	}

	.decision-btn.keep.selected {
		background: #e6ffe6;
		border-color: #00c853;
	}

	.decision-btn.archive.selected {
		background: #e3f2fd;
		border-color: #2196f3;
	}

	.decision-btn.remove.selected {
		background: #ffe6e6;
		border-color: var(--yorha-crimson);
	}

	.decision-btn .icon {
		font-size: 1.5rem;
	}

	.decision-btn .label {
		font-weight: bold;
		font-size: 0.9rem;
	color: var(--yorha-ink);
	}

	.decision-btn .desc {
		font-size: 0.7rem;
	color: #999;
	}

	.notes-section textarea {
		width: 100%;
	padding: 0.75rem;
		border: 1px solid #ddd;
		border-radius: 3px;
		font-family: var(--yorha-font);
		font-size: 0.875rem;
	resize: vertical;
		color: var(--yorha-ink);
	}

	.notes-section textarea:focus {
		outline: none;
		border-color: var(--yorha-crimson);
		box-shadow: 0 0 0 2px rgba(255, 0, 0, 0.1);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
	gap: 1rem;
		padding: 1.5rem;
		border-top: 1px solid #ddd;
		background: #f9f9f9;
	}

	.btn-cancel,
	.btn-submit {
		padding: 0.75rem 1.5rem;
		border: 1px solid #ddd;
		border-radius: 3px;
		font-family: var(--yorha-font);
		font-size: 0.875rem;
		font-weight: bold;
	cursor: pointer;
		transition:all 0.2s ease;
	}

	.btn-cancel {
		background: white;
	color: var(--yorha-ink);
	}

	.btn-cancel:hover {
		background: #f5f5f5;
		border-color: var(--yorha-ink);
	}

	.btn-submit {
		background: var(--yorha-crimson);
	color: white;
		border-color: var(--yorha-crimson);
	}

	.btn-submit:hover:not(disabled) {
		background: #d32f2f;
		border-color: #d32f2f;
	}

	.btn-submit:disabled {
		opacity: 0.5;
	cursor:not-allowed;
	}
</style>




