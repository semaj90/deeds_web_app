<script lang="ts">
	/**
	 * MarkdownSceneViewer Component
	 * Renders AI-generated scene summaries for human validation
	 */
	import { marked } from 'marked';

	// Define type locally since not exported from ui-store
	interface MarkdownScene {
		markdown: string;
		id?: string;
		title?: string;
		confidence?: number;
		sourceFiles?: string[];
		validatedBy?: string;
		validatedAt?: Date;
		[key: string]: unknown;
	}

	interface Props {
		scene: MarkdownScene;
		onValidate?: (sceneId: string) => void;
		onEdit?: (sceneId: string, markdown: string) => void;
		onReject?: (sceneId: string) => void;
		class?: string;
		editable?: boolean;
	}

	let {
		scene,
		onValidate,
		onEdit,
		onReject,
		class: className = '',
		editable = false
	}: Props = $props();

	let isEditing = $state(false);
	let editedMarkdown = $state(scene.markdown);

	// Parse markdown to HTML
	const renderedHtml = $derived(typeof marked === 'function' ? marked(scene.markdown) : String(scene.markdown));

	function handleValidate() {
		onValidate?.(scene.id);
	}

	function handleReject() {
		onReject?.(scene.id);
	}

	function startEditing() {
		editedMarkdown = scene.markdown;
		isEditing = true;
	}

	function saveEdit() {
		onEdit?.(scene.id, editedMarkdown);
		isEditing = false;
	}

	function cancelEdit() {
		editedMarkdown = scene.markdown;
		isEditing = false;
	}
</script>

<div class="scene-viewer {className}" class:validated={scene.validated}>
	<!-- Header -->
	<div class="scene-header">
		<div class="scene-title-row">
			<h3 class="scene-title">{scene.title}</h3>
			{#if scene.aiGenerated}
				<span class="ai-badge">🤖 AI Generated</span>
			{/if}
			{#if scene.validated}
				<span class="validated-badge">✅ Validated</span>
			{/if}
		</div>

		<div class="scene-meta">
			<span class="confidence">
				Confidence: {Math.round(scene.confidence * 100)}%
			</span>
			{#if scene.sourceFiles.length > 0}
				<span class="sources">
					Sources: {scene.sourceFiles.join(', ')}
				</span>
			{/if}
		</div>
	</div>

	<!-- Content -->
	<div class="scene-content">
		{#if isEditing}
			<textarea class="edit-textarea" bind:value={editedMarkdown} rows="10"></textarea>
		{:else}
			<div class="markdown-content">
				{@html renderedHtml}
			</div>
		{/if}
	</div>

	<!-- Actions -->
	<div class="scene-actions">
		{#if isEditing}
			<button class="btn btn-primary" onclick={saveEdit}>💾 Save Changes</button>
			<button class="btn btn-secondary" onclick={cancelEdit}>Cancel</button>
		{:else}
			{#if !scene.validated}
				<button class="btn btn-success" onclick={handleValidate}>✅ Validate</button>
				<button class="btn btn-danger" onclick={handleReject}>❌ Reject</button>
			{/if}
			{#if editable}
				<button class="btn btn-secondary" onclick={startEditing}>✏️ Edit</button>
			{/if}
		{/if}
	</div>

	<!-- Validation Info -->
	{#if scene.validated && scene.validatedBy}
		<div class="validation-info">
			Validated by {scene.validatedBy} on {scene.validatedAt?.toLocaleDateString()}
		</div>
	{/if}
</div>

<style>
	.scene-viewer {
		background: var(--yorha-bg-secondary, #2a2a2a);
		border: 1px solid var(--yorha-border, #4a4a4a);
		border-radius: 8px;
	overflow: hidden;
	}

	.scene-viewer.validated {
		border-color: var(--yorha-success, #4ade80);
	}

	.scene-header {
		padding: 1rem 1.25rem;
		background: var(--yorha-bg, #1a1a1a);
		border-bottom: 1px solid var(--yorha-border, #4a4a4a);
	}

	.scene-title-row {
		display: flex;
		align-items: center;
	gap: 0.75rem;
		flex-wrap: wrap;
	}

	.scene-title {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
	color: var(--yorha-text, #d4d4d4);
	}

	.ai-badge {
		padding: 0.25rem 0.5rem;
		background: var(--yorha-accent, #c8a84b);
		color: var(--yorha-bg, #1a1a1a);
		font-size: 0.7rem;
		font-weight: 600;
		border-radius: 2px;
	}

	.validated-badge {
		padding: 0.25rem 0.5rem;
		background: var(--yorha-success, #4ade80);
		color: var(--yorha-bg, #1a1a1a);
		font-size: 0.7rem;
		font-weight: 600;
		border-radius: 2px;
	}

	.scene-meta {
		display: flex;
	gap: 1rem;
		margin-top: 0.5rem;
		font-size: 0.8rem;
	color: var(--yorha-text-muted, #888);
	}

	.scene-content {
		padding: 1.25rem;
	}

	.markdown-content {
		color: var(--yorha-text, #d4d4d4);
		line-height: 1.6;
	}

	.markdown-content :global(h1),
	.markdown-content :global(h2),
	.markdown-content :global(h3),
	.markdown-content :global(h4) {
		color: var(--yorha-text, #d4d4d4);
		margin-top: 1.5rem;
		margin-bottom: 0.75rem;
	}

	.markdown-content :global(h1:first-child),
	.markdown-content :global(h2:first-child),
	.markdown-content :global(h3:first-child) {
		margin-top: 0;
	}

	.markdown-content :global(p) {
		margin-bottom: 1rem;
	}

	.markdown-content :global(ul),
	.markdown-content :global(ol) {
		margin-bottom: 1rem;
		padding-left: 1.5rem;
	}

	.markdown-content :global(li) {
		margin-bottom: 0.25rem;
	}

	.markdown-content :global(code) {
		background: var(--yorha-bg, #1a1a1a);
		padding: 0.125rem 0.375rem;
		border-radius: 2px;
		font-family: var(--font-mono, monospace);
		font-size: 0.9em;
	}

	.markdown-content :global(pre) {
		background: var(--yorha-bg, #1a1a1a);
		padding: 1rem;
		border-radius: 4px;
		overflow-x: auto;
		margin-bottom: 1rem;
	}

	.markdown-content :global(pre code) {
		background: none;
	padding: 0;
	}

	.markdown-content :global(blockquote) {
		border-left: 3px solid var(--yorha-accent, #c8a84b);
		padding-left: 1rem;
	margin: 1rem 0;
		color: var(--yorha-text-muted, #888);
		font-style: italic;
	}

	.markdown-content :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 1rem;
	}

	.markdown-content :global(th),
	.markdown-content :global(td) {
		border: 1px solid var(--yorha-border, #4a4a4a);
		padding: 0.5rem 0.75rem;
		text-align: left;
	}

	.markdown-content :global(th) {
		background: var(--yorha-bg, #1a1a1a);
		font-weight: 600;
	}

	.edit-textarea {
		width: 100%;
		min-height: 200px;
	padding: 1rem;
		background: var(--yorha-bg, #1a1a1a);
		border: 1px solid var(--yorha-border, #4a4a4a);
		border-radius: 4px;
	color: var(--yorha-text, #d4d4d4);
		font-family: var(--font-mono, monospace);
		font-size: 0.9rem;
		line-height: 1.5;
	resize: vertical;
	}

	.edit-textarea:focus {
		outline: none;
		border-color: var(--yorha-accent, #c8a84b);
	}

	.scene-actions {
		display: flex;
	gap: 0.5rem;
		padding: 1rem 1.25rem;
		background: var(--yorha-bg, #1a1a1a);
		border-top: 1px solid var(--yorha-border, #4a4a4a);
	}

	.btn {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 4px;
		font-size: 0.85rem;
		font-weight: 500;
	cursor: pointer;
		transition:all 0.2s;
	}

	.btn-primary {
		background: var(--yorha-accent, #c8a84b);
		color: var(--yorha-bg, #1a1a1a);
	}

	.btn-primary:hover {
		background: var(--yorha-accent-hover, #d4b85c);
	}

	.btn-secondary {
		background: var(--yorha-bg-secondary, #2a2a2a);
		color: var(--yorha-text, #d4d4d4);
		border: 1px solid var(--yorha-border, #4a4a4a);
	}

	.btn-secondary:hover {
		background: var(--yorha-bg-hover, #333);
	}

	.btn-success {
		background: var(--yorha-success, #4ade80);
		color: var(--yorha-bg, #1a1a1a);
	}

	.btn-success:hover {
		background: #22c55e;
	}

	.btn-danger {
		background: var(--yorha-error, #ef4444);
		color: white;
	}

	.btn-danger:hover {
		background: #dc2626;
	}

	.validation-info {
		padding: 0.75rem 1.25rem;
		background: rgba(74, 222, 128, 0.1);
		color: var(--yorha-success, #4ade80);
		font-size: 0.8rem;
		text-align: center;
	}
</style>
