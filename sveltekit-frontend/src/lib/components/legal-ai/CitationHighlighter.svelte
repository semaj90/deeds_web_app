<script lang="ts">
	import { createEventDispatcher } from 'svelte';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

	interface HighlightedCitation { text: string; startIndex: number;
		endIndex: number;
	}

	interface Props {
		content?: string;
		citations?: HighlightedCitation[];
	}

	let { content = '', citations = [] }: Props = $props();

	const dispatch = createEventDispatcher();

	let selectedText = $state('');
	let selectionStart = $state(0);
	let selectionEnd = $state(0);
	let showSaveButton = $state(false);

	function handleTextSelection() {
		const selection = window.getSelection();
		if (selection && selection.toString().length > 0) {
			selectedText = selection.toString();
			const range = selection.getRangeAt(0);
			const preCaretRange = range.cloneRange();
			preCaretRange.selectNodeContents(document.body);
			preCaretRange.setEnd(range.endContainer, range.endOffset);
			selectionStart = preCaretRange.toString().length - selectedText.length;
			selectionEnd = selectionStart + selectedText.length;
			showSaveButton = true;
		} else {
			showSaveButton = false;
		}
	}

	function saveCitation() {
		if (selectedText) {
			dispatch('save', {
				text: selectedText,
				startIndex: selectionStart,
				endIndex: selectionEnd
			});
			showSaveButton = false;
			selectedText = '';
		}
	}

	function isCitationHighlighted(index: number): boolean {
		return citations.some((c) => index >= c.startIndex && index < c.endIndex);
	}

	function renderContent() {
		if (!content) return '';

		let html = '';
		for (let i = 0; i < content.length; i++) {
			if (isCitationHighlighted(i)) {
				if (i === 0 || !isCitationHighlighted(i - 1)) {
					html += '<span class="citation-highlight">';
				}
				html += content[i];
				if (i === content.length - 1 || !isCitationHighlighted(i + 1)) {
					html += '</span>';
				}
			} else {
				html += content[i];
			}
		}
		return html;
	}

	function cancelSelection() {
		showSaveButton = false;
		selectedText = '';
	}

	function removeCitation(citation: HighlightedCitation) {
		dispatch('remove', citation);
	}
</script>

<div class="citation-highlighter">
	<div class="content" onmouseup={handleTextSelection} ontouchend={handleTextSelection}>
		{@html renderContent()}
	</div>

	{#if showSaveButton}
		<div class="save-button-container">
			<button class="save-citation-btn" onclick={saveCitation}>💾 Save Citation</button>
			<button class="cancel-btn" onclick={cancelSelection}>✕</button>
		</div>
	{/if}

	{#if citations.length > 0}
		<div class="citations-list">
			<h4>Highlighted Citations ({citations.length})</h4>
			<ul>
				{#each citations as citation (citation.startIndex)}
					<li class="citation-item">
						<span class="citation-text">{citation.text}</span>
						<button class="remove-btn" onclick={() => removeCitation(citation)}>✕</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.citation-highlighter {
		display: flex;
		flex-direction: column;
	gap: 1rem;
	}

	.content {
		padding: 1rem;
		background-color: #f9f7f4;
	border: 1px solid #d4a574;
		border-radius: 6px;
		line-height: 1.6;
	color: #333;
		user-select: text;
	cursor: text;
	}

	:global(.citation-highlight) {
		background-color: #ffd700;
	padding: 0.1rem 0.2rem;
		border-radius: 2px;
		font-weight: 500;
	}

	.save-button-container { display: flex; gap: 0.5rem;
		padding: 0.75rem;
		background-color: #f0ebe0;
		border-radius: 4px;
		align-items: center;
	}

	.save-citation-btn {
		padding: 0.5rem 1rem;
		background-color: #8b4513;
	color: #f5f1e8;
		border: none;
		border-radius: 4px;
		font-weight: 500;
	cursor: pointer;
		transition:all 0.2s;
	}

	.save-citation-btn:hover {
		background-color: #a0522d;
	}

	.cancel-btn {
		padding: 0.5rem 0.75rem;
		background-color: #e0d5c7;
	color: #2c2c2c;
		border: none;
		border-radius: 4px;
	cursor: pointer;
		transition:all 0.2s;
	}

	.cancel-btn:hover {
		background-color: #d4a574;
	}

	.citations-list {
		padding: 1rem;
		background-color: #f0ebe0;
		border-radius: 6px;
	}

	.citations-list h4 {
		margin: 0 0 0.75rem 0;
		font-size: 0.95rem;
	color: #2c2c2c;
	}

	ul {
		list-style: none;
	padding: 0;
		margin: 0;
	display: flex;
		flex-direction: column;
	gap: 0.5rem;
	}

	.citation-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
	padding: 0.5rem;
		background-color: white;
	border: 1px solid #d4a574;
		border-radius: 4px;
	}

	.citation-text {
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.85rem;
	color: #8b4513;
		font-weight: 500;
	}

	.remove-btn { background: none; border: none;
		color: #999;
	cursor: pointer;
		font-size: 1rem;
	padding: 0;
		transition:color 0.2s;
	}

	.remove-btn:hover {
		color: #ff6b6b;
	}
</style>
