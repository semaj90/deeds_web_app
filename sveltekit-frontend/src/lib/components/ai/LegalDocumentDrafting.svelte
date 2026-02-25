<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		caseId?: string;
		class?: string;
	}

	let { caseId, class: className = '' }: Props = $props();

	type DocCategory = 'motion' | 'brief' | 'memo' | 'contract' | 'letter';

	const TEMPLATES: Array<{ id: DocCategory; label: string; icon: string; prompt: string }> = [
		{ id: 'motion', label: 'Motion', icon: 'gavel', prompt: 'Draft a legal motion for' },
		{ id: 'brief', label: 'Brief', icon: 'book-open', prompt: 'Draft a legal brief regarding' },
		{ id: 'memo', label: 'Memo', icon: 'file-text', prompt: 'Draft a legal memorandum about' },
		{
			id: 'contract',
			label: 'Contract',
			icon: 'handshake',
			prompt: 'Draft a contract clause for'
		},
		{
			id: 'letter',
			label: 'Letter',
			icon: 'mail',
			prompt: 'Draft a formal legal letter regarding'
		}
	];

	let selectedTemplate = $state<DocCategory | null>(null);
	let documentTitle = $state('');
	let caseContext = $state('');
	let draftContent = $state('');
	let isGenerating = $state(false);
	let error = $state<string | null>(null);

	let wordCount = $derived(
		draftContent ? draftContent.split(/\s+/).filter(Boolean).length : 0
	);

	async function generateDraft() {
		if (!selectedTemplate || !documentTitle.trim()) return;

		const template = TEMPLATES.find((t) => t.id === selectedTemplate);
		if (!template) return;

		isGenerating = true;
		error = null;
		draftContent = '';

		const prompt = `${template.prompt} "${documentTitle}".${caseContext ? ` Context: ${caseContext}` : ''}${caseId ? ` Case ID: ${caseId}` : ''}\n\nWrite a professional, well-structured legal document. Include proper headings, numbered sections, and formal legal language.`;

		try {
			const url = `/api/chat/stream?message=${encodeURIComponent(prompt)}`;
			const eventSource = new EventSource(url);

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					if (data.token) {
						draftContent += data.token;
					}
					if (data.done) {
						eventSource.close();
						isGenerating = false;
					}
				} catch {
					if (event.data && event.data !== '[DONE]') {
						draftContent += event.data;
					}
				}
			};

			eventSource.onerror = () => {
				eventSource.close();
				isGenerating = false;
				if (!draftContent) {
					error = 'Failed to connect to AI service';
				}
			};
		} catch (e) {
			error = e instanceof Error ? e.message : 'Generation failed';
			isGenerating = false;
		}
	}

	function copyToClipboard() {
		navigator.clipboard.writeText(draftContent);
	}

	function clearDraft() {
		draftContent = '';
		documentTitle = '';
		caseContext = '';
		selectedTemplate = null;
		error = null;
	}
</script>

<div class="legal-drafting {className}">
	<div class="draft-header">
		<Icon name="pen-tool" size={16} />
		<h3>Legal Document Drafting</h3>
	</div>

	{#if !draftContent && !isGenerating}
		<div class="template-grid">
			{#each TEMPLATES as tmpl}
				<button
					class="template-card"
					class:selected={selectedTemplate === tmpl.id}
					onclick={() => (selectedTemplate = tmpl.id)}
				>
					<Icon name={tmpl.icon} size={18} />
					<span>{tmpl.label}</span>
				</button>
			{/each}
		</div>

		{#if selectedTemplate}
			<div class="draft-form">
				<div class="form-field">
					<label for="doc-title">Document Title</label>
					<input
						id="doc-title"
						type="text"
						bind:value={documentTitle}
						placeholder="e.g., Motion to Suppress Evidence"
						class="form-input"
					/>
				</div>
				<div class="form-field">
					<label for="case-ctx">Case Context (optional)</label>
					<textarea
						id="case-ctx"
						bind:value={caseContext}
						placeholder="Provide relevant case details, parties, key facts..."
						rows="3"
						class="form-textarea"
					></textarea>
				</div>
				<Button
					onclick={generateDraft}
					disabled={!documentTitle.trim() || isGenerating}
				>
					<Icon name="sparkles" size={14} />
					Generate Draft
				</Button>
			</div>
		{/if}
	{:else}
		<div class="draft-output">
			<div class="output-toolbar">
				<span class="word-badge">{wordCount} words</span>
				{#if isGenerating}
					<span class="generating-badge">
						<Icon name="loader" size={12} />
						Generating...
					</span>
				{/if}
				<div class="toolbar-actions">
					<Button variant="ghost" size="sm" onclick={copyToClipboard} disabled={isGenerating}>
						<Icon name="copy" size={12} />
						Copy
					</Button>
					<Button variant="ghost" size="sm" onclick={clearDraft} disabled={isGenerating}>
						<Icon name="rotate-ccw" size={12} />
						New
					</Button>
				</div>
			</div>
			<div class="draft-content">
				{#if draftContent}
					{#each draftContent.split('\n') as line}
						{#if line.trim()}
							<p>{line}</p>
						{/if}
					{/each}
				{/if}
			</div>
		</div>
	{/if}

	{#if error}
		<p class="draft-error">{error}</p>
	{/if}
</div>

<style>
	.legal-drafting {
		padding: 0.75rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		background: var(--color-panel-soft, #1c1917);
	}
	.draft-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.draft-header h3 {
		flex: 1;
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0;
	}
	.template-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.template-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.375rem;
		padding: 0.75rem 0.5rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.375rem;
		background: transparent;
		cursor: pointer;
		color: inherit;
		font-size: 0.75rem;
		transition: all 0.15s;
	}
	.template-card:hover {
		border-color: var(--color-accent, #a51c30);
		background: rgba(255, 255, 255, 0.03);
	}
	.template-card.selected {
		border-color: var(--color-accent, #a51c30);
		background: rgba(165, 28, 48, 0.1);
	}
	.draft-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.form-field label {
		font-size: 0.6875rem;
		font-weight: 500;
		opacity: 0.7;
	}
	.form-input,
	.form-textarea {
		padding: 0.5rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.375rem;
		background: rgba(255, 255, 255, 0.03);
		color: inherit;
		font-size: 0.8125rem;
		font-family: inherit;
	}
	.form-textarea {
		resize: vertical;
		min-height: 60px;
	}
	.draft-output {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.output-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.word-badge {
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 0.25rem;
		opacity: 0.6;
	}
	.generating-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.6875rem;
		color: var(--color-info, #3b82f6);
	}
	.toolbar-actions {
		margin-left: auto;
		display: flex;
		gap: 0.25rem;
	}
	.draft-content {
		padding: 0.75rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.375rem;
		background: rgba(255, 255, 255, 0.02);
		max-height: 400px;
		overflow-y: auto;
		font-size: 0.8125rem;
		line-height: 1.6;
	}
	.draft-content p {
		margin: 0 0 0.5rem 0;
	}
	.draft-error {
		font-size: 0.8125rem;
		color: var(--color-danger, #ef4444);
		margin: 0.5rem 0 0;
	}
</style>
