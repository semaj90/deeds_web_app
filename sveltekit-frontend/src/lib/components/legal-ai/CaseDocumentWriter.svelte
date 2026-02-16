<script lang="ts">
	import { Dialog } from 'bits-ui';
	import CaseSelector from '$lib/components/CaseSelector.svelte';
	import TipTapEditor from '$lib/components/editor/TipTapEditor.svelte';

	interface Props {
		isOpen?: boolean;
	}

	let { isOpen = $bindable(false) }: Props = $props();

	let selectedCase = $state<{ id: string; title: string; caseNumber: string; status: string } | null>(null);
	let noteTitle = $state('');
	let editorContent = $state('');
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let saveMessage = $state('');
	let editorRef: TipTapEditor | undefined = $state();

	function handleEditorUpdate(html: string) {
		editorContent = html;
		// Reset save status on edit
		if (saveStatus === 'saved') saveStatus = 'idle';
	}

	function handleCaseSelect(caseItem: { id: string; title: string; caseNumber: string; status: string }) {
		selectedCase = caseItem;
	}

	async function saveDocument() {
		if (!selectedCase) {
			saveStatus = 'error';
			saveMessage = 'Select a case first';
			return;
		}

		const html = editorRef?.getHTML() || editorContent;
		if (!html || html === '<p></p>') {
			saveStatus = 'error';
			saveMessage = 'Document is empty';
			return;
		}

		saveStatus = 'saving';
		try {
			const res = await fetch(`/api/cases/${selectedCase.id}/notes`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: noteTitle.trim() || 'Untitled Document',
					content: html,
					isAI: false
				})
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				saveStatus = 'error';
				saveMessage = data.error || 'Failed to save';
				return;
			}

			saveStatus = 'saved';
			saveMessage = `Saved to "${selectedCase.title}"`;
		} catch {
			saveStatus = 'error';
			saveMessage = 'Network error';
		}
	}

	function resetForm() {
		noteTitle = '';
		editorContent = '';
		selectedCase = null;
		saveStatus = 'idle';
		saveMessage = '';
		editorRef?.setContent('');
	}

	function closeDialog() {
		isOpen = false;
	}
</script>

<Dialog.Root bind:open={isOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
	<Dialog.Portal>
		<Dialog.Overlay class="cdw-overlay" />
		<Dialog.Content class="cdw-content">
			<div class="cdw-header">
				<div class="cdw-title-row">
					<Dialog.Title class="cdw-title">Case Document Writer</Dialog.Title>
					<div class="cdw-header-actions">
						<button
							class="cdw-save-btn"
							onclick={saveDocument}
							disabled={saveStatus === 'saving' || !selectedCase}
						>
							{saveStatus === 'saving' ? 'Saving...' : 'Save to Case'}
						</button>
						<Dialog.Close class="cdw-close-btn">&#x2715;</Dialog.Close>
					</div>
				</div>

				<div class="cdw-meta-row">
					<div class="cdw-case-selector">
						<span class="cdw-label">Case:</span>
						<CaseSelector
							onselect={handleCaseSelect}
							placeholder="Search cases..."
						/>
					</div>
					{#if selectedCase}
						<span class="cdw-case-badge">{selectedCase.caseNumber} - {selectedCase.title}</span>
					{/if}
				</div>

				<div class="cdw-title-input-row">
					<input
						type="text"
						class="cdw-title-input"
						bind:value={noteTitle}
						placeholder="Document title (optional)"
					/>
				</div>
			</div>

			<div class="cdw-editor-wrap">
				<TipTapEditor
					bind:this={editorRef}
					theme="legal"
					placeholder="Write your case document here..."
					onUpdate={handleEditorUpdate}
				/>
			</div>

			{#if saveStatus !== 'idle'}
				<div class="cdw-status" class:saved={saveStatus === 'saved'} class:error={saveStatus === 'error'}>
					{#if saveStatus === 'saving'}
						Saving...
					{:else if saveStatus === 'saved'}
						{saveMessage}
					{:else if saveStatus === 'error'}
						{saveMessage}
					{/if}
				</div>
			{/if}

			<div class="cdw-footer">
				<span class="cdw-shortcut-hint">Ctrl+Shift+D to toggle</span>
				{#if selectedCase}
					<span class="cdw-footer-case">Saving to: {selectedCase.title}</span>
				{:else}
					<span class="cdw-footer-case cdw-no-case">No case selected</span>
				{/if}
				<button class="cdw-reset-btn" onclick={resetForm}>Clear</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.cdw-overlay) {
		position: fixed;
		inset: 0;
		z-index: 9990;
		background: rgba(0, 0, 0, 0.6);
	}

	:global(.cdw-content) {
		position: fixed;
		z-index: 9991;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 90vw;
		max-width: 860px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		background: #f5f1e8;
		border: 2px solid #8b4513;
		border-radius: 10px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		overflow: hidden;
	}

	.cdw-header {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #d4a574;
		background: #3d2b1f;
	}

	.cdw-title-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	:global(.cdw-title) {
		font-size: 1.1rem;
		font-weight: 700;
		color: #f5f1e8;
		margin: 0;
		letter-spacing: 0.5px;
	}

	.cdw-header-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.cdw-save-btn {
		padding: 0.35rem 0.85rem;
		background: #2d7a3a;
		color: #f5f1e8;
		border: none;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.cdw-save-btn:hover:not(:disabled) {
		background: #3a9a4a;
	}

	.cdw-save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	:global(.cdw-close-btn) {
		background: none;
		border: none;
		color: #d4a574;
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0.25rem;
	}

	:global(.cdw-close-btn:hover) {
		color: #f5f1e8;
	}

	.cdw-meta-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.cdw-case-selector {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
	}

	.cdw-label {
		color: #d4a574;
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.cdw-case-badge {
		padding: 0.2rem 0.6rem;
		background: #8b4513;
		color: #f5f1e8;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.cdw-title-input-row {
		margin-top: 0.25rem;
	}

	.cdw-title-input {
		width: 100%;
		padding: 0.4rem 0.6rem;
		background: #4a3728;
		border: 1px solid #8b4513;
		border-radius: 4px;
		color: #f5f1e8;
		font-size: 0.85rem;
		font-family: inherit;
	}

	.cdw-title-input::placeholder {
		color: #b8a88a;
	}

	.cdw-editor-wrap {
		flex: 1;
		overflow-y: auto;
		min-height: 300px;
		max-height: 55vh;
	}

	.cdw-status {
		padding: 0.4rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		text-align: center;
	}

	.cdw-status.saved {
		background: #d4edda;
		color: #155724;
	}

	.cdw-status.error {
		background: #f8d7da;
		color: #721c24;
	}

	.cdw-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
		border-top: 1px solid #d4a574;
		background: #f0ebe0;
		font-size: 0.75rem;
	}

	.cdw-shortcut-hint {
		color: #8b7355;
		font-family: 'Monaco', 'Courier New', monospace;
	}

	.cdw-footer-case {
		color: #5c4333;
		font-weight: 500;
	}

	.cdw-no-case {
		color: #999;
		font-style: italic;
	}

	.cdw-reset-btn {
		padding: 0.25rem 0.5rem;
		background: #e0d5c7;
		border: 1px solid #d4a574;
		border-radius: 3px;
		color: #5c4333;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.cdw-reset-btn:hover {
		background: #d4a574;
		color: #fff;
	}
</style>
