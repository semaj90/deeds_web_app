<script lang="ts">
	import { Editor } from '@tiptap/core';
	import Placeholder from '@tiptap/extension-placeholder';
	import StarterKit from '@tiptap/starter-kit';

	interface Props {
		initialContent?: string;
		placeholder?: string;
		onUpdate?: (html: string, json: any) => void;
		editable?: boolean;
		theme?: 'dark' | 'legal';
	}

	let {
		initialContent = '',
		placeholder = 'Start writing...',
		onUpdate,
		editable = true,
		theme = 'dark'
	}: Props = $props();

	let editorElement = $state<HTMLDivElement>();
	let editor = $state<Editor>();

	// Selection tooltip state
	let showSelTooltip = $state(false);
	let selTooltipX = $state(0);
	let selTooltipY = $state(0);
	let selTooltipBelow = $state(false);
	let isSummarizing = $state(false);
	let summaryResult = $state<{ summary: string; confidence: number } | null>(null);
	let selectedText = $state('');

	$effect(() => {
		if (!editorElement) return;

		const editorInstance = new Editor({
			element: editorElement,
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3] },
					blockquote: {},
					horizontalRule: {}
				}),
				Placeholder.configure({ placeholder })
			],
			content: initialContent,
			editable,
			onUpdate: ({ editor }) => {
				const html = editor.getHTML();
				const json = editor.getJSON();
				onUpdate?.(html, json);
			},
			onSelectionUpdate: ({ editor: ed }) => {
				const { from, to } = ed.state.selection;
				if (to - from > 5) {
					const text = ed.state.doc.textBetween(from, to, ' ');
					selectedText = text;
					// Position tooltip using DOM selection
					const domSelection = window.getSelection();
					if (domSelection && domSelection.rangeCount > 0) {
						const range = domSelection.getRangeAt(0);
						const rect = range.getBoundingClientRect();
						selTooltipX = rect.left + rect.width / 2;
						selTooltipBelow = rect.top < 80;
						selTooltipY = selTooltipBelow ? rect.bottom + 8 : rect.top - 8;
						showSelTooltip = true;
						summaryResult = null;
						isSummarizing = false;
					}
				} else {
					showSelTooltip = false;
					selectedText = '';
				}
			}
		});

		editor = editorInstance;

		return () => {
			editorInstance.destroy();
		};
	});

	export function getHTML() {
		return editor?.getHTML() || '';
	}

	export function getJSON() {
		return editor?.getJSON();
	}

	export function setContent(content: string) {
		editor?.commands.setContent(content);
	}

	export function focus() {
		editor?.commands.focus();
	}

	// Toolbar actions
	function toggleBold() { editor?.chain().focus().toggleBold().run(); }
	function toggleItalic() { editor?.chain().focus().toggleItalic().run(); }
	function toggleHeading(level: 1 | 2 | 3) { editor?.chain().focus().toggleHeading({ level }).run(); }
	function toggleBulletList() { editor?.chain().focus().toggleBulletList().run(); }
	function toggleOrderedList() { editor?.chain().focus().toggleOrderedList().run(); }
	function toggleBlockquote() { editor?.chain().focus().toggleBlockquote().run(); }
	function insertHorizontalRule() { editor?.chain().focus().setHorizontalRule().run(); }

	const isBold = $derived(editor?.isActive('bold') ?? false);
	const isItalic = $derived(editor?.isActive('italic') ?? false);
	const isH1 = $derived(editor?.isActive('heading', { level: 1 }) ?? false);
	const isH2 = $derived(editor?.isActive('heading', { level: 2 }) ?? false);
	const isH3 = $derived(editor?.isActive('heading', { level: 3 }) ?? false);
	const isBulletList = $derived(editor?.isActive('bulletList') ?? false);
	const isOrderedList = $derived(editor?.isActive('orderedList') ?? false);
	const isBlockquote = $derived(editor?.isActive('blockquote') ?? false);

	// Selection tooltip actions
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
		} catch {
			summaryResult = { summary: 'Failed to summarize', confidence: 0 };
		} finally {
			isSummarizing = false;
		}
	}

	function insertSummaryAsQuote() {
		if (summaryResult?.summary && editor) {
			editor.chain().focus()
				.setBlockquote()
				.insertContent(summaryResult.summary)
				.run();
			closeSelTooltip();
		}
	}

	function closeSelTooltip() {
		showSelTooltip = false;
		selectedText = '';
		summaryResult = null;
		isSummarizing = false;
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

{#if editable}
	<div class="tiptap-toolbar" class:legal={theme === 'legal'}>
		<button type="button" class="toolbar-btn" class:active={isBold} onclick={toggleBold} title="Bold (Ctrl+B)">
			<strong>B</strong>
		</button>
		<button type="button" class="toolbar-btn" class:active={isItalic} onclick={toggleItalic} title="Italic (Ctrl+I)">
			<em>I</em>
		</button>

		<div class="toolbar-divider"></div>

		<button type="button" class="toolbar-btn" class:active={isH1} onclick={() => toggleHeading(1)} title="Heading 1">
			H1
		</button>
		<button type="button" class="toolbar-btn" class:active={isH2} onclick={() => toggleHeading(2)} title="Heading 2">
			H2
		</button>
		<button type="button" class="toolbar-btn" class:active={isH3} onclick={() => toggleHeading(3)} title="Heading 3">
			H3
		</button>

		<div class="toolbar-divider"></div>

		<button type="button" class="toolbar-btn" class:active={isBulletList} onclick={toggleBulletList} title="Bullet List">
			&#x2022; List
		</button>
		<button type="button" class="toolbar-btn" class:active={isOrderedList} onclick={toggleOrderedList} title="Numbered List">
			1. List
		</button>

		<div class="toolbar-divider"></div>

		<button type="button" class="toolbar-btn" class:active={isBlockquote} onclick={toggleBlockquote} title="Block Quote (Cite)">
			Cite
		</button>
		<button type="button" class="toolbar-btn" onclick={insertHorizontalRule} title="Horizontal Rule">
			&#x2014;
		</button>
	</div>
{/if}

<div bind:this={editorElement} class="tiptap-editor" class:legal={theme === 'legal'}></div>

{#if showSelTooltip}
	<div
		class="sel-tooltip"
		style="left: {selTooltipX}px; top: {selTooltipY}px; transform: translate(-50%, {selTooltipBelow ? '0' : '-100%'});"
	>
		{#if summaryResult}
			<div class="sel-summary">
				<p class="sel-summary-text">{summaryResult.summary}</p>
				<div class="sel-summary-meta">
					<span class="sel-confidence" style="background-color: {confidenceColor(summaryResult.confidence)};">
						{confidenceLabel(summaryResult.confidence)} ({Math.round(summaryResult.confidence * 100)}%)
					</span>
				</div>
				<div class="sel-actions">
					<button class="sel-btn insert" onclick={insertSummaryAsQuote}>Insert as Quote</button>
					<button class="sel-btn close" onclick={closeSelTooltip}>Close</button>
				</div>
			</div>
		{:else}
			<div class="sel-actions">
				<button class="sel-btn summarize" onclick={summarizeSelection} disabled={isSummarizing}>
					{isSummarizing ? 'Summarizing...' : 'Summarize'}
				</button>
				<button class="sel-btn close" onclick={closeSelTooltip}>&#x2715;</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* === Dark theme (default) === */
	.tiptap-toolbar {
		display: flex;
		gap: 0.25rem;
		padding: 0.5rem;
		border-bottom: 1px solid rgb(30 41 59);
		background: rgb(15 23 42);
		border-radius: 0.75rem 0.75rem 0 0;
		flex-wrap: wrap;
	}

	.toolbar-btn {
		padding: 0.375rem 0.75rem;
		border: 1px solid rgb(51 65 85);
		border-radius: 0.375rem;
		background: rgb(30 41 59);
		color: rgb(148 163 184);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.toolbar-btn:hover {
		background: rgb(51 65 85);
		border-color: rgb(100 116 139);
		color: rgb(226 232 240);
	}

	.toolbar-btn.active {
		background: rgb(59 130 246);
		border-color: rgb(96 165 250);
		color: white;
	}

	.toolbar-divider {
		width: 1px;
		background: rgb(51 65 85);
		margin: 0 0.25rem;
	}

	:global(.tiptap-editor) {
		min-height: 400px;
		padding: 1rem;
		background: rgb(15 23 42);
		border: 1px solid rgb(30 41 59);
		border-top: none;
		border-radius: 0 0 0.75rem 0.75rem;
		color: rgb(226 232 240);
	}

	:global(.tiptap-editor .ProseMirror) {
		outline: none;
		min-height: 380px;
	}

	:global(.tiptap-editor .ProseMirror p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		color: rgb(100 116 139);
		pointer-events: none;
		height: 0;
	}

	:global(.tiptap-editor h1) { font-size: 2rem; font-weight: 700; margin: 1rem 0 0.5rem; }
	:global(.tiptap-editor h2) { font-size: 1.5rem; font-weight: 600; margin: 1rem 0 0.5rem; }
	:global(.tiptap-editor h3) { font-size: 1.25rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
	:global(.tiptap-editor ul), :global(.tiptap-editor ol) { padding-left: 1.5rem; margin: 0.5rem 0; }
	:global(.tiptap-editor li) { margin: 0.25rem 0; }
	:global(.tiptap-editor p) { margin: 0.5rem 0; line-height: 1.6; }
	:global(.tiptap-editor strong) { font-weight: 700; }
	:global(.tiptap-editor em) { font-style: italic; }

	:global(.tiptap-editor blockquote) {
		border-left: 3px solid rgb(100 116 139);
		padding-left: 1rem;
		margin: 0.75rem 0;
		color: rgb(148 163 184);
		font-style: italic;
	}

	:global(.tiptap-editor hr) {
		border: none;
		border-top: 1px solid rgb(51 65 85);
		margin: 1rem 0;
	}

	/* === Legal theme === */
	.tiptap-toolbar.legal {
		background: #3d2b1f;
		border-bottom: 1px solid #8b4513;
	}

	.tiptap-toolbar.legal .toolbar-btn {
		background: #4a3728;
		border-color: #8b4513;
		color: #d4a574;
	}

	.tiptap-toolbar.legal .toolbar-btn:hover {
		background: #5c4333;
		border-color: #a0522d;
		color: #f5f1e8;
	}

	.tiptap-toolbar.legal .toolbar-btn.active {
		background: #8b4513;
		border-color: #a0522d;
		color: #f5f1e8;
	}

	.tiptap-toolbar.legal .toolbar-divider {
		background: #8b4513;
	}

	:global(.tiptap-editor.legal) {
		background: #f9f7f4;
		border-color: #d4a574;
		color: #2c2c2c;
	}

	:global(.tiptap-editor.legal .ProseMirror p.is-editor-empty:first-child::before) {
		color: #b8a88a;
	}

	:global(.tiptap-editor.legal blockquote) {
		border-left-color: #8b4513;
		color: #5c4333;
	}

	:global(.tiptap-editor.legal hr) {
		border-top-color: #d4a574;
	}

	/* === Selection tooltip === */
	.sel-tooltip {
		position: fixed;
		z-index: 9999;
		background: #2c2418;
		border: 1px solid #d4a574;
		border-radius: 8px;
		padding: 0.5rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		max-width: 360px;
		min-width: 160px;
	}

	.sel-actions {
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}

	.sel-btn {
		padding: 0.35rem 0.65rem;
		border: none;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: background-color 0.15s;
	}

	.sel-btn.summarize { background-color: #8b4513; color: #f5f1e8; }
	.sel-btn.summarize:hover:not(:disabled) { background-color: #a0522d; }
	.sel-btn.summarize:disabled { opacity: 0.7; cursor: wait; }
	.sel-btn.insert { background-color: #2d7a3a; color: #f5f1e8; }
	.sel-btn.insert:hover { background-color: #3a9a4a; }
	.sel-btn.close { background-color: #555; color: #ddd; padding: 0.35rem 0.5rem; }
	.sel-btn.close:hover { background-color: #777; }

	.sel-summary {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.sel-summary-text {
		margin: 0;
		font-size: 0.82rem;
		color: #f0ebe0;
		line-height: 1.45;
	}

	.sel-summary-meta {
		display: flex;
		align-items: center;
	}

	.sel-confidence {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 10px;
		font-size: 0.7rem;
		font-weight: 600;
		color: #fff;
	}
</style>
