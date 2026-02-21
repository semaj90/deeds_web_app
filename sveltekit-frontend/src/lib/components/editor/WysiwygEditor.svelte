<!-- WysiwygEditor — Rich text editor with AI assistant + citation helper -->
<!-- Session 64: Rewritten from minified/corrupted → clean Svelte 5 $state runes -->
<script lang="ts">
	interface Props {
		content?: string;
		placeholder?: string;
		readonly?: boolean;
		height?: string;
		enableAI?: boolean;
		enableCitation?: boolean;
		enableCollaboration?: boolean;
		onchange?: (detail: { content: string; wordCount: number }) => void;
	}

	let {
		content = $bindable(''),
		placeholder = 'Start typing your legal document...',
		readonly = false,
		height = '400px',
		enableAI = true,
		enableCitation = true,
		enableCollaboration = false,
		onchange
	}: Props = $props();

	// Editor state
	let editorElement: HTMLElement | undefined = $state();
	let isInitialized = $state(false);

	// Counts (migrated from writable stores)
	let wordCount = $state(0);
	let charCount = $state(0);

	// Modal state (migrated from writable stores)
	let aiOpen = $state(false);
	let citeOpen = $state(false);
	let collaborationActive = $state(false);

	// AI Assistant state
	let aiQuery = $state('');
	let aiResults = $state('');
	let isProcessingAI = $state(false);
	let selectedText = $state('');

	// Citation state
	let citationQuery = $state('');
	let citationResults = $state<Array<{ title: string; citation: string; relevance: number }>>([]);

	function updateCounts(text: string): number {
		const plainText = text.replace(/<[^>]*>/g, '');
		const wc = (plainText.match(/\S+/g) || []).length;
		wordCount = wc;
		charCount = plainText.length;
		return wc;
	}

	function handleInput() {
		if (!editorElement) return;
		const html = editorElement.innerHTML;
		content = html;
		const wc = updateCounts(html);
		onchange?.({ content: html, wordCount: wc });
	}

	function openAIAssistant(text: string = '') {
		selectedText = text || getSelection();
		aiQuery = '';
		aiResults = '';
		aiOpen = true;
	}

	function openCitationHelper(text: string = '') {
		citationQuery = text || getSelection();
		citationResults = [];
		citeOpen = true;
	}

	function getSelection(): string {
		const sel = window.getSelection();
		if (sel && sel.rangeCount > 0 && editorElement?.contains(sel.anchorNode)) {
			return sel.toString();
		}
		return '';
	}

	function toggleCollaboration() {
		collaborationActive = !collaborationActive;
	}

	async function processAIRequest(): Promise<void> {
		if (!aiQuery.trim()) return;
		isProcessingAI = true;

		try {
			const response = await fetch('/api/ai/ask', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: aiQuery,
					context: selectedText
						? [{ role: 'user', content: `Selected text: ${selectedText}` }]
						: [],
					options: {
						maxSources: 5,
						provider: 'auto',
						enableLegalClassification: true
					}
				})
			});

			const data = await response.json();
			if (data.success) {
				aiResults = data.data.answer;
			} else {
				aiResults = 'Sorry, I encountered an error processing your request.';
			}
		} catch (error) {
			console.error('AI request failed:', error);
			aiResults = 'Failed to connect to AI service.';
		} finally {
			isProcessingAI = false;
		}
	}

	async function searchCitations(): Promise<void> {
		if (!citationQuery.trim()) return;

		try {
			const response = await fetch('/api/search/citations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: citationQuery, limit: 10 })
			});

			const data = await response.json();
			if (data.success) {
				citationResults = data.results.map((r: any) => ({
					title: r.title,
					citation: r.citation,
					relevance: r.similarity
				}));
			}
		} catch (error) {
			console.error('Citation search failed:', error);
		}
	}

	function insertCitation(citation: { title: string; citation: string }) {
		const citationHtml = `<div class="citation" contenteditable="false"><strong>${citation.title}</strong><p><em>${citation.citation}</em></p></div>`;
		insertAtCursor(citationHtml);
		citeOpen = false;
	}

	function insertAIContent() {
		const aiHtml = `<div class="ai-suggestion">${aiResults}</div>`;
		insertAtCursor(aiHtml);
		aiOpen = false;
	}

	function insertAtCursor(html: string) {
		if (!editorElement) return;
		editorElement.focus();

		const sel = window.getSelection();
		if (sel && sel.rangeCount > 0) {
			const range = sel.getRangeAt(0);
			range.deleteContents();
			const temp = document.createElement('div');
			temp.innerHTML = html;
			const frag = document.createDocumentFragment();
			while (temp.firstChild) {
				frag.appendChild(temp.firstChild);
			}
			range.insertNode(frag);
		} else {
			editorElement.innerHTML += html;
		}

		handleInput();
	}

	// Public API
	export function getContent(): string {
		return editorElement ? editorElement.innerHTML : content;
	}

	export function setContent(newContent: string) {
		content = newContent;
		if (editorElement) {
			editorElement.innerHTML = newContent;
		}
		updateCounts(newContent);
	}

	$effect(() => {
		if (editorElement && content && !isInitialized) {
			editorElement.innerHTML = content;
			updateCounts(content);
			isInitialized = true;
		}
	});
</script>

<div class="wysiwyg-container">
	<!-- Editor Toolbar -->
	<div class="editor-toolbar" role="toolbar" aria-label="Editor toolbar">
		<div class="toolbar-left">
			<button
				type="button"
				class="toolbar-btn ai-btn"
				aria-label="Open AI Assistant"
				disabled={!enableAI}
				onclick={() => openAIAssistant()}
			>
				AI Assistant
			</button>
			<button
				type="button"
				class="toolbar-btn cite-btn"
				aria-label="Open Citation Helper"
				disabled={!enableCitation}
				onclick={() => openCitationHelper()}
			>
				Citations
			</button>
			{#if enableCollaboration}
				<button
					type="button"
					class="toolbar-btn"
					aria-pressed={collaborationActive}
					onclick={toggleCollaboration}
				>
					{collaborationActive ? 'Stop Collab' : 'Collaborate'}
				</button>
			{/if}
		</div>
		<div class="toolbar-right" aria-live="polite" aria-atomic="true">
			<span>Words: {wordCount}</span>
			<span>Characters: {charCount}</span>
		</div>
	</div>

	<!-- Main Editor -->
	<div
		bind:this={editorElement}
		class="editor-content"
		style="height: {height}"
		role="textbox"
		aria-multiline="true"
		contenteditable={!readonly}
		data-placeholder={placeholder}
		oninput={handleInput}
	>
		{#if !content}
			<div class="editor-placeholder" aria-hidden="true">{placeholder}</div>
		{/if}
	</div>
</div>

<!-- AI Assistant Modal -->
{#if aiOpen}
	<div class="modal-overlay" onclick={() => (aiOpen = false)} role="presentation"></div>
	<div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-title">
		<div class="modal-header">
			<h2 id="ai-title">AI Legal Assistant</h2>
			<button class="modal-close" onclick={() => (aiOpen = false)}>&times;</button>
		</div>
		<div class="modal-body">
			{#if selectedText}
				<div class="selected-text">
					<strong>Selected text:</strong>
					<p>"{selectedText}"</p>
				</div>
			{/if}

			<div class="form-group">
				<label for="ai-query">What would you like help with?</label>
				<textarea
					id="ai-query"
					bind:value={aiQuery}
					placeholder="E.g., 'Analyze this clause', 'Suggest improvements', 'Find relevant precedents'..."
					rows="4"
					class="form-textarea"
				></textarea>
				<button
					onclick={processAIRequest}
					disabled={isProcessingAI || !aiQuery.trim()}
					class="btn btn-primary"
				>
					{isProcessingAI ? 'Processing...' : 'Ask AI'}
				</button>
			</div>

			{#if aiResults}
				<div class="ai-results">
					<strong>AI Response:</strong>
					<div class="ai-response">{aiResults}</div>
					<button onclick={insertAIContent} class="btn btn-secondary">
						Insert into Document
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Citation Helper Modal -->
{#if citeOpen}
	<div class="modal-overlay" onclick={() => (citeOpen = false)} role="presentation"></div>
	<div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="cite-title">
		<div class="modal-header">
			<h2 id="cite-title">Citation Helper</h2>
			<button class="modal-close" onclick={() => (citeOpen = false)}>&times;</button>
		</div>
		<div class="modal-body">
			<div class="form-group">
				<label for="cite-query">Search for citations:</label>
				<input
					id="cite-query"
					bind:value={citationQuery}
					placeholder="Enter legal concept, case name, or statute..."
					class="form-input"
				/>
				<button onclick={searchCitations} disabled={!citationQuery.trim()} class="btn">
					Search
				</button>
			</div>

			{#if citationResults.length > 0}
				<div class="citation-results">
					<h4>Found Citations:</h4>
					{#each citationResults as citation}
						<div class="citation-item">
							<div class="citation-title">{citation.title}</div>
							<div class="citation-text">{citation.citation}</div>
							<div class="citation-meta">
								Relevance: {Math.round(citation.relevance * 100)}%
							</div>
							<button
								onclick={() => insertCitation(citation)}
								class="btn btn-secondary btn-sm"
							>
								Insert Citation
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.wysiwyg-container {
		border: 1px solid #d1d5db;
		border-radius: 0.5rem;
		overflow: hidden;
		background: white;
	}

	.editor-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #d1d5db;
	}

	.toolbar-left {
		display: flex;
		gap: 0.5rem;
	}

	.toolbar-btn {
		padding: 0.25rem 0.75rem;
		font-size: 0.875rem;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 0.25rem;
		transition: background-color 0.2s;
		cursor: pointer;
	}

	.toolbar-btn:hover {
		background: #f3f4f6;
	}

	.toolbar-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ai-btn {
		border-color: #93c5fd;
		color: #1d4ed8;
	}

	.ai-btn:hover:not(:disabled) {
		background: #eff6ff;
	}

	.cite-btn {
		border-color: #86efac;
		color: #059669;
	}

	.cite-btn:hover:not(:disabled) {
		background: #f0fdf4;
	}

	.toolbar-right {
		display: flex;
		gap: 1rem;
		font-size: 0.875rem;
		color: #4b5563;
	}

	.editor-content {
		width: 100%;
		overflow-y: auto;
	}

	.editor-content[contenteditable='true'] {
		outline: none;
		padding: 1rem;
		min-height: 200px;
	}

	.editor-placeholder {
		pointer-events: none;
		color: #9ca3af;
		padding: 1rem;
	}

	/* Modal styles */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 49;
	}

	.modal-dialog {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 50;
		width: 90vw;
		max-width: 600px;
		background: white;
		border-radius: 0.5rem;
		padding: 1.5rem;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
	}

	.modal-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: #6b7280;
		line-height: 1;
	}

	.modal-close:hover {
		color: #111827;
	}

	.modal-body {
		max-height: 60vh;
		overflow-y: auto;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.form-textarea,
	.form-input {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-family: inherit;
		resize: vertical;
	}

	.selected-text {
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-radius: 0.25rem;
		padding: 0.75rem;
		margin-bottom: 1rem;
	}

	.ai-results {
		margin-top: 1rem;
		padding: 1rem;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 0.25rem;
	}

	.ai-response {
		margin: 0.75rem 0;
		padding: 0.75rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.25rem;
	}

	.citation-results {
		margin-top: 1rem;
		max-height: 300px;
		overflow-y: auto;
	}

	.citation-item {
		border: 1px solid #e5e7eb;
		border-radius: 0.25rem;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
		transition: background-color 0.2s;
	}

	.citation-item:hover {
		background: #f9fafb;
	}

	.citation-title {
		font-weight: 600;
		color: #111827;
	}

	.citation-text {
		font-size: 0.875rem;
		color: #374151;
		margin-top: 0.25rem;
	}

	.citation-meta {
		font-size: 0.75rem;
		color: #6b7280;
		margin-top: 0.5rem;
	}

	.btn {
		padding: 0.5rem 1rem;
		border-radius: 0.25rem;
		font-weight: 500;
		transition: background-color 0.2s;
		cursor: pointer;
		border: none;
	}

	.btn-primary {
		background: #2563eb;
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.btn-secondary {
		background: #e5e7eb;
		color: #1f2937;
	}

	.btn-secondary:hover {
		background: #d1d5db;
	}

	.btn-sm {
		padding: 0.25rem 0.5rem;
		font-size: 0.875rem;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
