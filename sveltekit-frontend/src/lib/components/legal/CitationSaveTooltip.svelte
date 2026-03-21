<script lang="ts">
	let {
		caseId = null,
		onSaved,
	}: {
		caseId?: string | null;
		onSaved?: (citation: { id: string; statuteCode: string }) => void;
	} = $props();

	let tooltipEl: HTMLDivElement | undefined = $state();
	let visible = $state(false);
	let expanded = $state(false);
	let saving = $state(false);
	let saved = $state(false);
	let selectedText = $state('');
	let posX = $state(0);
	let posY = $state(0);

	// Form fields
	let statuteCode = $state('');
	let notes = $state('');

	function handleMouseUp(e: MouseEvent) {
		const sel = window.getSelection();
		const text = sel?.toString().trim() ?? '';
		if (text.length < 3) {
			hide();
			return;
		}
		// Skip if selection is inside CitationHighlighter (has its own save UI)
		const target = e.target as HTMLElement | null;
		if (target?.closest('.citation-highlighter')) return;
		// Skip if selection is inside this tooltip itself
		if (tooltipEl && tooltipEl.contains(target)) return;

		selectedText = text;
		const range = sel!.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		posX = rect.left + rect.width / 2;
		posY = rect.top - 8;
		visible = true;
		expanded = false;
		saved = false;
	}

	function hide() {
		visible = false;
		expanded = false;
		saving = false;
		saved = false;
		statuteCode = '';
		notes = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') hide();
	}

	async function saveCitation() {
		if (saving) return;
		saving = true;
		try {
			const res = await fetch('/api/citations/saved', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					statute_code: statuteCode || 'highlight',
					highlighted_text: selectedText,
					notes: notes || null,
					case_id: caseId,
					source_type: 'highlight',
				}),
			});
			if (!res.ok) throw new Error('Save failed');
			const data = await res.json();
			saved = true;
			onSaved?.({ id: data.citation?.id, statuteCode: statuteCode || 'highlight' });
			setTimeout(hide, 1200);
		} catch {
			saving = false;
		}
	}
</script>

<svelte:document onmouseup={handleMouseUp} onkeydown={handleKeydown} />

{#if visible}
	<div
		bind:this={tooltipEl}
		class="citation-tooltip"
		style="left: {posX}px; top: {posY}px;"
		role="dialog"
		aria-label="Save citation"
	>
		{#if saved}
			<div class="ct-saved">Saved</div>
		{:else if expanded}
			<div class="ct-form">
				<div class="ct-preview">"{selectedText.length > 80 ? selectedText.slice(0, 80) + '…' : selectedText}"</div>
				<input
					bind:value={statuteCode}
					placeholder="Statute code (optional)"
					class="ct-input"
				/>
				<input
					bind:value={notes}
					placeholder="Note (optional)"
					class="ct-input"
				/>
				<div class="ct-actions">
					<button onclick={hide} class="ct-btn ct-btn-cancel">Cancel</button>
					<button onclick={saveCitation} disabled={saving} class="ct-btn ct-btn-save">
						{saving ? 'Saving…' : 'Save'}
					</button>
				</div>
			</div>
		{:else}
			<button onclick={() => (expanded = true)} class="ct-trigger">
				Save as Citation
			</button>
		{/if}
	</div>
{/if}

<style>
	.citation-tooltip {
		position: fixed;
		z-index: 9999;
		transform: translate(-50%, -100%);
		filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4));
	}

	.ct-trigger {
		background: var(--color-accent, #c8a87c);
		color: #1a1a1a;
		border: none;
		border-radius: 6px;
		padding: 5px 12px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	.ct-trigger:hover {
		filter: brightness(1.1);
	}

	.ct-form {
		background: #1e1e20;
		border: 1px solid rgba(200, 168, 124, 0.3);
		border-radius: 8px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 240px;
		max-width: 320px;
	}

	.ct-preview {
		font-size: 11px;
		color: rgba(200, 180, 150, 0.6);
		font-style: italic;
		line-height: 1.3;
		max-height: 40px;
		overflow: hidden;
	}

	.ct-input {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(200, 168, 124, 0.2);
		border-radius: 4px;
		padding: 5px 8px;
		font-size: 12px;
		color: rgba(200, 180, 150, 0.9);
		outline: none;
	}
	.ct-input:focus {
		border-color: rgba(200, 168, 124, 0.5);
	}

	.ct-actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
		margin-top: 2px;
	}

	.ct-btn {
		border: none;
		border-radius: 4px;
		padding: 4px 10px;
		font-size: 11px;
		font-weight: 600;
		cursor: pointer;
	}
	.ct-btn-cancel {
		background: transparent;
		color: rgba(200, 180, 150, 0.5);
	}
	.ct-btn-cancel:hover {
		color: rgba(200, 180, 150, 0.8);
	}
	.ct-btn-save {
		background: var(--color-accent, #c8a87c);
		color: #1a1a1a;
	}
	.ct-btn-save:hover {
		filter: brightness(1.1);
	}
	.ct-btn-save:disabled {
		opacity: 0.5;
		cursor: wait;
	}

	.ct-saved {
		background: #1e3a1e;
		border: 1px solid rgba(100, 200, 100, 0.4);
		border-radius: 6px;
		padding: 5px 14px;
		font-size: 12px;
		font-weight: 600;
		color: rgba(100, 200, 100, 0.9);
		white-space: nowrap;
	}
</style>
