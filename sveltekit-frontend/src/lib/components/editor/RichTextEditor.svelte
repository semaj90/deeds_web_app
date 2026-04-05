<script lang="ts">
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		value?: string;
		height?: number;
		disabled?: boolean;
		placeholder?: string;
		onchange?: (content: string) => void;
	}

	let {
		value = $bindable(''),
		height = 400,
		disabled = false,
		placeholder = 'Begin writing your report...',
		onchange,
	}: Props = $props();

	let editorEl = $state<HTMLDivElement>();
	let wordCount = $derived.by(() => {
		if (!value) return 0;
		const text = value.replace(/<[^>]*>/g, '').trim();
		return text ? text.split(/\s+/).length : 0;
	});

	function exec(command: string, val?: string) {
		if (disabled) return;
		document.execCommand(command, false, val);
		syncContent();
	}

	function syncContent() {
		if (!editorEl) return;
		const html = editorEl.innerHTML;
		if (html !== value) {
			value = html;
			onchange?.(html);
		}
	}

	function handlePaste(e: ClipboardEvent) {
		e.preventDefault();
		const text = e.clipboardData?.getData('text/plain') ?? '';
		document.execCommand('insertText', false, text);
		syncContent();
	}

	$effect(() => {
		if (editorEl && value !== editorEl.innerHTML) {
			editorEl.innerHTML = value;
		}
	});

	const tools = [
		{ cmd: 'bold', icon: 'bold', label: 'Bold' },
		{ cmd: 'italic', icon: 'italic', label: 'Italic' },
		{ cmd: 'underline', icon: 'underline', label: 'Underline' },
		{ cmd: 'strikeThrough', icon: 'strikethrough', label: 'Strikethrough' },
		{ cmd: 'separator' },
		{ cmd: 'insertUnorderedList', icon: 'list', label: 'Bullet list' },
		{ cmd: 'insertOrderedList', icon: 'list-ordered', label: 'Numbered list' },
		{ cmd: 'separator' },
		{ cmd: 'formatBlock:h2', icon: 'heading-2', label: 'Heading 2' },
		{ cmd: 'formatBlock:h3', icon: 'heading-3', label: 'Heading 3' },
		{ cmd: 'formatBlock:blockquote', icon: 'quote', label: 'Blockquote' },
		{ cmd: 'separator' },
		{ cmd: 'removeFormat', icon: 'eraser', label: 'Clear formatting' },
	] as const;
</script>

<div class="rich-editor border border-sand/20 rounded-lg overflow-hidden bg-panelSoft">
	<!-- Toolbar -->
	<div class="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-sand/20 bg-panel">
		{#each tools as tool}
			{#if tool.cmd === 'separator'}
				<div class="w-px h-5 bg-sand/15 mx-1"></div>
			{:else}
				<button
					type="button"
					class="p-1.5 rounded hover:bg-sand/10 text-sand/70 hover:text-sand transition-colors disabled:opacity-30"
					title={tool.label}
					{disabled}
					onclick={() => {
						if (tool.cmd.startsWith('formatBlock:')) {
							exec('formatBlock', tool.cmd.split(':')[1]);
						} else {
							exec(tool.cmd);
						}
					}}
				>
					<Icon name={tool.icon} size={16} />
				</button>
			{/if}
		{/each}

		<div class="ml-auto text-xs text-sand/40 pr-2">
			{wordCount} words
		</div>
	</div>

	<!-- Editor area -->
	<div
		bind:this={editorEl}
		contenteditable={!disabled}
		role="textbox"
		aria-multiline="true"
		aria-label="Rich text editor"
		class="editor-content p-4 text-sm text-sand outline-none overflow-y-auto"
		style="min-height: {height}px; max-height: {height + 200}px;"
		data-placeholder={placeholder}
		oninput={syncContent}
		onpaste={handlePaste}
	></div>
</div>

<style>
	.editor-content:empty::before {
		content: attr(data-placeholder);
		color: var(--t-text-muted, #94a3b8);
		pointer-events: none;
	}

	.editor-content :global(h2) {
		font-size: 1.25rem;
		font-weight: 700;
		margin: 1em 0 0.5em;
	}

	.editor-content :global(h3) {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0.8em 0 0.4em;
	}

	.editor-content :global(blockquote) {
		border-left: 3px solid var(--t-accent, #38bdf8);
		padding-left: 1em;
		margin: 0.8em 0;
		font-style: italic;
		color: var(--t-text-muted, #94a3b8);
	}

	.editor-content :global(ul),
	.editor-content :global(ol) {
		padding-left: 1.5em;
		margin: 0.5em 0;
	}

	.editor-content :global(li) {
		margin-bottom: 0.25em;
	}

	.editor-content :global(p) {
		margin-bottom: 0.75em;
	}
</style>
