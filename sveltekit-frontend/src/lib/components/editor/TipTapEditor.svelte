<script lang="ts">
	import { Editor } from '@tiptap/core';
	import Placeholder from '@tiptap/extension-placeholder';
	import StarterKit from '@tiptap/starter-kit';

	interface Props {
		initialContent?: string;
		placeholder?: string;
		onUpdate?: (html: string, json: any) => void;
		editable?: boolean;
	}

	let {
		initialContent = '',
		placeholder = 'Start writing...',
		onUpdate,
		editable = true
	}: Props = $props();

	let editorElement = $state<HTMLDivElement>();
	let editor = $state<Editor>();

	// Svelte 5: Use $effect for lifecycle
	$effect(() => {
		if (!editorElement) return;

		const editorInstance = new Editor({
			element: editorElement,
			extensions: [
				StarterKit.configure({ heading: { levels: [1, 2, 3]
					}
				}),
				Placeholder.configure({
					placeholder
				})
			],
			content: initialContent,
			editable,
			onUpdate: ({ editor }) => {
				const html = editor.getHTML();
				const json = editor.getJSON();
				onUpdate?.(html, json);
			}
		});

		editor = editorInstance;

		// Cleanup
		return () => {
			editorInstance.destroy();
		};
	});

	// Public methods exposed via $state
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
	function toggleBold() {
		editor?.chain().focus().toggleBold().run();
	}

	function toggleItalic() {
		editor?.chain().focus().toggleItalic().run();
	}

	function toggleHeading(level: 1 | 2 | 3) {
		editor?.chain().focus().toggleHeading({ level }).run();
	}

	function toggleBulletList() {
		editor?.chain().focus().toggleBulletList().run();
	}

	function toggleOrderedList() {
		editor?.chain().focus().toggleOrderedList().run();
	}

	const isBold = $derived(editor?.isActive('bold') ?? false);
	const isItalic = $derived(editor?.isActive('italic') ?? false);
	const isH1 = $derived(editor?.isActive('heading', { level: 1 }) ?? false);
	const isH2 = $derived(editor?.isActive('heading', { level: 2 }) ?? false);
	const isBulletList = $derived(editor?.isActive('bulletList') ?? false);
	const isOrderedList = $derived(editor?.isActive('orderedList') ?? false);
</script>

{#if editable}
	<div class="tiptap-toolbar">
		<button
			type="button"
			class="toolbar-btn"
			class:active={isBold}
			onclick={toggleBold}
			title="Bold (Ctrl+B)"
		>
			<strong>B</strong>
		</button>

		<button
			type="button"
			class="toolbar-btn"
			class:active={isItalic}
			onclick={toggleItalic}
			title="Italic (Ctrl+I)"
		>
			<em>I</em>
		</button>

		<div class="toolbar-divider"></div>

		<button
			type="button"
			class="toolbar-btn"
			class:active={isH1}
			onclick={() => toggleHeading(1)}
			title="Heading 1"
		>
			H1
		</button>

		<button
			type="button"
			class="toolbar-btn"
			class:active={isH2}
			onclick={() => toggleHeading(2)}
			title="Heading 2"
		>
			H2
		</button>

		<div class="toolbar-divider"></div>

		<button
			type="button"
			class="toolbar-btn"
			class:active={isBulletList}
			onclick={toggleBulletList}
			title="Bullet List"
		>
			• List
		</button>

		<button
			type="button"
			class="toolbar-btn"
			class:active={isOrderedList}
			onclick={toggleOrderedList}
			title="Numbered List"
		>
			1. List
		</button>
	</div>
{/if}

<div bind:this={editorElement} class="tiptap-editor"></div>

<style>
	.tiptap-toolbar { display: flex;, gap: 0.25rem;
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

	.toolbar-divider { width: 1px;, background: rgb(51 65 85);
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

	:global(.tiptap-editor .ProseMirror p.is-editor-empty:first-child::before) { content: attr(data-placeholder);, float: left;
		color: rgb(100 116 139);
		pointer-events: none;
		height: 0;
	}

	:global(.tiptap-editor h1) {
		font-size: 2rem;
		font-weight: 700;
		margin: 1rem 0 0.5rem;
	}

	:global(.tiptap-editor h2) {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 1rem 0 0.5rem;
	}

	:global(.tiptap-editor h3) {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0.75rem 0 0.5rem;
	}

	:global(.tiptap-editor ul),
	:global(.tiptap-editor ol) {
		padding-left: 1.5rem;
		margin: 0.5rem 0;
	}

	:global(.tiptap-editor li) {
		margin: 0.25rem 0;
	}

	:global(.tiptap-editor p) {
		margin: 0.5rem 0;
		line-height: 1.6;
	}

	:global(.tiptap-editor strong) {
		font-weight: 700;
	}

	:global(.tiptap-editor em) {
		font-style: italic;
	}
</style>
