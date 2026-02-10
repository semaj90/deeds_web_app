<script lang="ts">
	import type { CitationSaveRequest } from '$lib/types/citations';

	let {
		caseId = undefined,
		onsaved
	}: {
		caseId?: string;
		onsaved?: (citation: unknown) => void;
	} = $props();

	let isLoading = $state(false);

	let formData = $state<CitationSaveRequest>({
		citationText: '',
		sourceType: 'statute',
		tags: []
	});

	let tagInput = $state('');
	let showAdvanced = $state(false);

	const sourceTypes = [
		{ value: 'statute', label: 'Statute' },
	{ value: 'case_law', label: 'Case Law' },
	{ value: 'regulation', label: 'Regulation' },
	{ value: 'manual', label: 'Manual Entry' }
	];

	function addTag() {
		if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
			formData.tags = [...(formData.tags ?? []), tagInput.trim()];
			tagInput = '';
		}
	}

	function removeTag(tag: string) {
		formData.tags = formData.tags?.filter((t) => t !== tag) ?? [];
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!formData.citationText.trim()) {
			alert('Citation text is required');
			return;
		}

		isLoading = true;
		try {
			const response = await fetch('/api/citations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
					...formData,
					caseId: caseId || undefined
				})
			});

			if (!response.ok) {
				throw new Error('Failed to save citation');
			}

			const citation = await response.json();
			onsaved?.(citation);

			formData = {
				citationText: '',
				sourceType: 'statute',
				tags: []
			};
			tagInput = '';
			showAdvanced = false;
		} catch (error) {
			console.error('Error saving citation:', error);
			alert('Failed to save citation');
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && e.ctrlKey) {
			handleSubmit(e);
		}
	}
</script>

<div class="citation-save-form">
	<form onsubmit={handleSubmit}>
		<div class="form-group">
			<label for="citation-text">Citation Text *</label>
			<textarea
				id="citation-text"
				bind:value={formData.citationText}
				placeholder="e.g., 42 U.S.C. § 1983"
				rows="3"
				onkeydown={handleKeydown}
				disabled={isLoading}
			></textarea>
		</div>

		<div class="form-group">
			<label for="source-type">Source Type *</label>
			<select id="source-type" bind:value={formData.sourceType} disabled={isLoading}>
				{#each sourceTypes as type}
					<option value={type.value}>{type.label}</option>
				{/each}
			</select>
		</div>

		<div class="form-group">
			<label for="tags">Tags</label>
			<div class="tag-input-group">
				<input
					id="tags"
					type="text"
					bind:value={tagInput}
					placeholder="Add tag and press Enter"
					onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
					disabled={isLoading}
				/>
				<button
					type="button"
					onclick={addTag}
					disabled={isLoading || !tagInput.trim()}
					class="btn-secondary"
				>
					Add
				</button>
			</div>
			{#if formData.tags && formData.tags.length > 0}
				<div class="tags-list">
					{#each formData.tags as tag}
						<span class="tag">
							{tag}
							<button
								type="button"
								onclick={() => removeTag(tag)}
								disabled={isLoading}
								class="tag-remove"
							>
								×
							</button>
						</span>
					{/each}
				</div>
			{/if}
		</div>

		<button
			type="button"
			onclick={() => (showAdvanced = !showAdvanced)}
			class="btn-link"
			disabled={isLoading}
		>
			{showAdvanced ? '▼' : '▶'} Advanced Options
		</button>

		{#if showAdvanced}
			<div class="advanced-options">
				<div class="form-group">
					<label for="statute-code">Statute Code</label>
					<input
						id="statute-code"
						type="text"
						bind:value={formData.statuteCode}
						placeholder="e.g., 42-1983"
						disabled={isLoading}
					/>
				</div>

				<div class="form-group">
					<label for="statute-title">Statute Title</label>
					<input
						id="statute-title"
						type="text"
						bind:value={formData.statuteTitle}
						placeholder="e.g., Civil action for deprivation of rights"
						disabled={isLoading}
					/>
				</div>

				<div class="form-group">
					<label for="context-text">Context Text</label>
					<textarea
						id="context-text"
						bind:value={formData.contextText}
						placeholder="Surrounding text for context"
						rows="2"
						disabled={isLoading}
					></textarea>
				</div>

				<div class="form-group">
					<label for="notes">Notes</label>
					<textarea
						id="notes"
						bind:value={formData.notes}
						placeholder="Additional notes about this citation"
						rows="2"
						disabled={isLoading}
					></textarea>
				</div>

				<div class="form-group">
					<label for="relevance">Relevance Score (0-1)</label>
					<input
						id="relevance"
						type="number"
						bind:value={formData.relevanceScore}
						min="0"
						max="1"
						step="0.1"
						disabled={isLoading}
					/>
				</div>
			</div>
		{/if}

		<div class="form-actions">
			<button
				type="submit"
				disabled={isLoading || !formData.citationText.trim()}
				class="btn-primary"
			>
				{isLoading ? 'Saving...' : 'Save Citation'}
			</button>
		</div>
	</form>
</div>

<style>
	.citation-save-form { background: var(--color-parchment);
		border: 1px solid var(--color-tan);
		border-radius: 8px;
	padding: 24px;
		max-width: 600px;
	}

	form {
		display: flex;
		flex-direction: column;
	gap: 20px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
	gap: 8px;
	}

	label {
		font-weight: 600;
	color: var(--color-burgundy);
		font-size: 14px;
	}

	textarea,
	input[type='text'],
	input[type='number'],
	select {
		padding: 10px 12px;
		border: 1px solid var(--color-tan);
		border-radius: 4px;
		font-family: inherit;
		font-size: 14px;
	background: white;
		color: var(--color-dark);
	}

	textarea:focus,
	input:focus,
	select:focus {
		outline: none;
		border-color: var(--color-burgundy);
		box-shadow: 0 0 0 3px rgba(139, 35, 50, 0.1);
	}

	textarea:disabled,
	input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	select:disabled { background: var(--color-light-gray);
		cursor: not-allowed;
	}

	.tag-input-group { display: flex;
		gap: 8px;
	}

	.tag-input-group input {
		flex: 1;
	}

	.tags-list {
		display: flex;
		flex-wrap: wrap;
	gap: 8px;
		margin-top: 8px;
	}

	.tag {
		display: inline-flex;
		align-items: center;
	gap: 6px;
		background: var(--color-burgundy);
	color: white;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 13px;
	}

	.tag-remove { background: none;
		border: none;
		color: white;
	cursor: pointer;
		font-size: 16px;
	padding: 0;
		line-height: 1;
	}

	.tag-remove:hover {
		opacity: 0.8;
	}

	.tag-remove:disabled { cursor: not-allowed;
		opacity: 0.6;
	}

	.btn-link { background: none;
		border: none;
		color: var(--color-burgundy);
	cursor: pointer;
		font-size: 14px;
	padding: 0;
		text-align: left;
	}

	.btn-link:hover {
		text-decoration: underline;
	}

	.btn-link:disabled { cursor: not-allowed;
		opacity: 0.6;
	}

	.advanced-options {
		display: flex;
		flex-direction: column;
	gap: 16px;
		padding: 16px;
	background: rgba(139, 35, 50, 0.05);
		border-radius: 4px;
	}

	.form-actions { display: flex;
		gap: 12px;
		margin-top: 8px;
	}

	.btn-primary,
	.btn-secondary {
		padding: 10px 16px;
		border: none;
		border-radius: 4px;
		font-size: 14px;
		font-weight: 600;
	cursor: pointer;
		transition:all 150ms ease;
	}

	.btn-primary { background: var(--color-burgundy);
		color: white;
		flex: 1;
	}

	.btn-primary:hover:not(:disabled) { background: var(--color-dark-burgundy);
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(139, 35, 50, 0.2);
	}

	.btn-primary:disabled { background: var(--color-light-gray);
		color: var(--color-medium-gray);
		cursor: not-allowed;
	}

	.btn-secondary { background: var(--color-tan);
		color: var(--color-dark);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--color-dark-tan);
	}

	.btn-secondary:disabled { background: var(--color-light-gray);
		color: var(--color-medium-gray);
		cursor: not-allowed;
	}
</style>
