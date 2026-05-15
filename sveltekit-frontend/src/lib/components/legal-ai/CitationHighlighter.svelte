<script lang="ts">
	interface HighlightedCitation {
		text: string;
		startIndex: number;
		endIndex: number;
		summary?: string;
		confidence?: number;
	}

	interface Props {
		onsave?: (...args: any[]) => void;
		onremove?: (...args: any[]) => void;
		onsummarize?: (result: { text: string; summary: string; confidence: number }) => void;
		/** Called when user clicks "→ Research" — triggers deep-research task creation */
		onresearch?: (data: { text: string; summary?: string; pipelineHint?: string }) => void;
		content?: string;
		citations?: HighlightedCitation[];
	}

	let { content = '', citations = [], onsave, onremove, onsummarize, onresearch }: Props = $props();

	let selectedText = $state('');
	let selectionStart = $state(0);
	let selectionEnd = $state(0);
	let showTooltip = $state(false);
	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let tooltipBelow = $state(false);
	let isSummarizing = $state(false);
	let isResearching = $state(false);
	let summaryResult = $state<{ summary: string; confidence: number } | null>(null);
	let contentRef: HTMLDivElement | undefined = $state();

	function handleTextSelection() {
		const selection = window.getSelection();
		if (selection && selection.toString().trim().length > 0) {
			selectedText = selection.toString();
			const range = selection.getRangeAt(0);

			// Compute character indices relative to contentRef
			if (contentRef) {
				const preCaretRange = range.cloneRange();
				preCaretRange.selectNodeContents(contentRef);
				preCaretRange.setEnd(range.startContainer, range.startOffset);
				selectionStart = preCaretRange.toString().length;
				selectionEnd = selectionStart + selectedText.length;
			}

			// Position floating tooltip at selection
			const rect = range.getBoundingClientRect();
			tooltipX = rect.left + rect.width / 2;
			tooltipBelow = rect.top < 80;
			tooltipY = tooltipBelow ? rect.bottom + 8 : rect.top - 8;
			showTooltip = true;
			summaryResult = null;
			isSummarizing = false;
			isResearching = false;
		} else {
			closeTooltip();
		}
	}

	async function summarizeSelection() {
		if (!selectedText || selectedText.length < 10) return;
		isSummarizing = true;
		try {
			const res = await fetch('/api/summarize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: selectedText })
			});
			if (!res.ok) {
				summaryResult = { summary: 'Summarization unavailable', confidence: 0 };
				return;
			}
			const data = await res.json();
			summaryResult = { summary: data.summary, confidence: data.confidence };
			onsummarize?.({ text: selectedText, summary: data.summary, confidence: data.confidence });
		} catch {
			summaryResult = { summary: 'Failed to summarize', confidence: 0 };
		} finally {
			isSummarizing = false;
		}
	}

	function saveCitation() {
		if (selectedText) {
			onsave?.({
				text: selectedText,
				startIndex: selectionStart,
				endIndex: selectionEnd,
				summary: summaryResult?.summary,
				confidence: summaryResult?.confidence
			});
			closeTooltip();
		}
	}

	async function createResearchTask() {
		if (!selectedText || isResearching) return;
		isResearching = true;

		// Auto-summarize if we don't have a summary yet
		if (!summaryResult && selectedText.length >= 10) {
			await summarizeSelection();
		}

		onresearch?.({
			text: selectedText,
			summary: summaryResult?.summary,
			pipelineHint: 'ace',
		});

		closeTooltip();
		isResearching = false;
	}

	function closeTooltip() {
		showTooltip = false;
		selectedText = '';
		summaryResult = null;
		isSummarizing = false;
		isResearching = false;
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

	function removeCitation(citation: HighlightedCitation) {
		onremove?.(citation);
	}

	function confidenceLabel(c: number): string {
		if (c >= 0.85) return 'High';
		if (c >= 0.65) return 'Medium';
		return 'Low';
	}

	function confidenceColor(c: number): string {
		if (c >= 0.85) return '#2d7a3a';
		if (c >= 0.65) return '#b8860b';
		return '#a04040';
	}
</script>

<div class="citation-highlighter">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="content"
		bind:this={contentRef}
		onmouseup={handleTextSelection}
		ontouchend={handleTextSelection}
	>
		{@html renderContent()}
	</div>

	{#if showTooltip}
		<div
			class="floating-tooltip"
			style="left: {tooltipX}px; top: {tooltipY}px; transform: translate(-50%, {tooltipBelow ? '0' : '-100%'});"
		>
			{#if summaryResult}
				<div class="summary-result">
					<p class="summary-text">{summaryResult.summary}</p>
					<div class="summary-meta">
						<span
							class="confidence-badge"
							style="background-color: {confidenceColor(summaryResult.confidence)};"
						>
							{confidenceLabel(summaryResult.confidence)} ({Math.round(summaryResult.confidence * 100)}%)
						</span>
					</div>
					<div class="tooltip-actions">
						<button class="tooltip-btn save" onclick={saveCitation}>Save Citation</button>
						{#if onresearch}
							<button class="tooltip-btn research" onclick={createResearchTask} disabled={isResearching}>
								{isResearching ? 'Adding…' : '→ Research'}
							</button>
						{/if}
						<button class="tooltip-btn close" onclick={closeTooltip}>Close</button>
					</div>
				</div>
			{:else}
				<div class="tooltip-actions">
					<button class="tooltip-btn summarize" onclick={summarizeSelection} disabled={isSummarizing}>
						{isSummarizing ? 'Summarizing...' : 'Summarize'}
					</button>
					<button class="tooltip-btn save" onclick={saveCitation}>Save Citation</button>
					{#if onresearch}
						<button class="tooltip-btn research" onclick={createResearchTask} disabled={isResearching}>
							{isResearching ? 'Adding…' : '→ Research'}
						</button>
					{/if}
					<button class="tooltip-btn close" onclick={closeTooltip}>&#x2715;</button>
				</div>
			{/if}
		</div>
	{/if}

	{#if citations.length > 0}
		<div class="citations-list">
			<h4>Highlighted Citations ({citations.length})</h4>
			<ul>
				{#each citations as citation (citation.startIndex)}
					<li class="citation-item">
						<div class="citation-content">
							<span class="citation-text">{citation.text}</span>
							{#if citation.summary}
								<span class="citation-summary">{citation.summary}</span>
							{/if}
						</div>
						<button class="remove-btn" onclick={() => removeCitation(citation)}>&#x2715;</button>
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
		position: relative;
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

	.floating-tooltip {
		position: fixed;
		z-index: 9999;
		background: #2c2418;
		border: 1px solid #d4a574;
		border-radius: 8px;
		padding: 0.5rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		max-width: 400px;
		min-width: 200px;
	}

	.tooltip-actions {
		display: flex;
		gap: 0.35rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.tooltip-btn {
		padding: 0.35rem 0.65rem;
		border: none;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: background-color 0.15s;
	}

	.tooltip-btn.summarize {
		background-color: #8b4513;
		color: #f5f1e8;
	}

	.tooltip-btn.summarize:hover:not(:disabled) {
		background-color: #a0522d;
	}

	.tooltip-btn.summarize:disabled {
		opacity: 0.7;
		cursor: wait;
	}

	.tooltip-btn.save {
		background-color: #2d7a3a;
		color: #f5f1e8;
	}

	.tooltip-btn.save:hover {
		background-color: #3a9a4a;
	}

	.tooltip-btn.research {
		background-color: #1d4ed8;
		color: #e0f2fe;
	}

	.tooltip-btn.research:hover:not(:disabled) {
		background-color: #2563eb;
	}

	.tooltip-btn.research:disabled {
		opacity: 0.7;
		cursor: wait;
	}

	.tooltip-btn.close {
		background-color: #555;
		color: #ddd;
		padding: 0.35rem 0.5rem;
	}

	.tooltip-btn.close:hover {
		background-color: #777;
	}

	.summary-result {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.summary-text {
		margin: 0;
		font-size: 0.82rem;
		color: #f0ebe0;
		line-height: 1.45;
	}

	.summary-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.confidence-badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 10px;
		font-size: 0.7rem;
		font-weight: 600;
		color: #fff;
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
		align-items: flex-start;
		padding: 0.5rem;
		background-color: white;
		border: 1px solid #d4a574;
		border-radius: 4px;
	}

	.citation-content {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
	}

	.citation-text {
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.85rem;
		color: #8b4513;
		font-weight: 500;
	}

	.citation-summary {
		font-size: 0.78rem;
		color: #666;
		font-style: italic;
	}

	.remove-btn {
		background: none;
		border: none;
		color: #999;
		cursor: pointer;
		font-size: 1rem;
		padding: 0;
		transition: color 0.2s;
		flex-shrink: 0;
		margin-left: 0.5rem;
	}

	.remove-btn:hover {
		color: #ff6b6b;
	}
</style>
