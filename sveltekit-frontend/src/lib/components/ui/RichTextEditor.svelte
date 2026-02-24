<script lang="ts">
	import { Editor } from '@tiptap/core';
	import Image from '@tiptap/extension-image';
	import Placeholder from '@tiptap/extension-placeholder';
	import StarterKit from '@tiptap/starter-kit';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		content?: string;
		placeholder?: string;
		editable?: boolean;
		showToolbar?: boolean;
		autoSave?: boolean;
		autoSaveDelay?: number;
		onChange?: (data: { html: string; markdown: string; json: any }) => void;
	}

	let {
		content = '',
		placeholder = 'Start writing your note...',
		editable = true,
		showToolbar = true,
		autoSave = false,
		autoSaveDelay = 2000,
		onChange,
	}: Props = $props();

	let element: HTMLElement;
	let editor: Editor;
	let isReady = $state<boolean>(false);
	let autoSaveTimer: ReturnType<typeof setTimeout>;

	// Toolbar state
	let isBold = $state<boolean>(false);
	let isItalic = $state<boolean>(false);
	let isBulletList = $state<boolean>(false);
	let isOrderedList = $state<boolean>(false);

	$effect(() => {
		if (!element) return;

		editor = new Editor({
			element,
			extensions: [
				StarterKit,
				Image.configure({
					inline: true,
					allowBase64: true,
					HTMLAttributes: {
						class: 'max-w-full h-auto rounded-lg',
					},
				}),
				Placeholder.configure({ placeholder }),
			],
			content,
			editable,
			onUpdate: () => {
				updateToolbarState();
				handleContentChange();
			},
			onSelectionUpdate: () => {
				updateToolbarState();
			},
			onCreate: () => {
				isReady = true;
				updateToolbarState();
			},
		});

		return () => {
			if (autoSaveTimer) {
				clearTimeout(autoSaveTimer);
			}
			editor?.destroy();
		};
	});

	function updateToolbarState() {
		if (!editor || !isReady) return;
		isBold = editor.isActive('bold');
		isItalic = editor.isActive('italic');
		isBulletList = editor.isActive('bulletList');
		isOrderedList = editor.isActive('orderedList');
	}

	function handleContentChange() {
		if (!editor || !isReady) return;

		const html = editor.getHTML();
		const json = editor.getJSON();
		const markdown = htmlToMarkdown(html);

		onChange?.({ html, markdown, json });

		if (autoSave) {
			if (autoSaveTimer) {
				clearTimeout(autoSaveTimer);
			}
			autoSaveTimer = setTimeout(() => {
				onChange?.({ html, markdown, json });
			}, autoSaveDelay);
		}
	}

	function htmlToMarkdown(html: string): string {
		return html
			.replace(/<h1[^>]*>(.*?)<\/h1>/g, '# $1\n\n')
			.replace(/<h2[^>]*>(.*?)<\/h2>/g, '## $1\n\n')
			.replace(/<h3[^>]*>(.*?)<\/h3>/g, '### $1\n\n')
			.replace(/<strong[^>]*>(.*?)<\/strong>/g, '**$1**')
			.replace(/<b[^>]*>(.*?)<\/b>/g, '**$1**')
			.replace(/<em[^>]*>(.*?)<\/em>/g, '*$1*')
			.replace(/<i[^>]*>(.*?)<\/i>/g, '*$1*')
			.replace(/<ul[^>]*>(.*?)<\/ul>/gs, (_match, inner) => {
				return inner.replace(/<li[^>]*>(.*?)<\/li>/g, '- $1\n') + '\n';
			})
			.replace(/<ol[^>]*>(.*?)<\/ol>/gs, (_match, inner) => {
				let counter = 1;
				return (
					inner.replace(/<li[^>]*>(.*?)<\/li>/g, () => `${counter++}. \n`) +
					'\n'
				);
			})
			.replace(/<p[^>]*>(.*?)<\/p>/g, '$1\n\n')
			.replace(/<[^>]+>/g, '')
			.replace(/\n{3,}/g, '\n\n')
			.trim();
	}

	// Toolbar actions
	function toggleBold() {
		editor?.chain().focus().toggleBold().run();
	}

	function toggleItalic() {
		editor?.chain().focus().toggleItalic().run();
	}

	function toggleBulletList() {
		editor?.chain().focus().toggleBulletList().run();
	}

	function toggleOrderedList() {
		editor?.chain().focus().toggleOrderedList().run();
	}

	function addImage() {
		const url = prompt('Enter image URL:');
		if (url) {
			editor?.chain().focus().setImage({ src: url }).run();
		}
	}

	function setHeading(level: number) {
		if (level === 0) {
			editor?.chain().focus().setParagraph().run();
		} else {
			editor
				?.chain()
				.focus()
				.toggleHeading({ level: level as 1 | 2 | 3 })
				.run();
		}
	}

	function saveContent() {
		if (!editor || !isReady) return;
		const html = editor.getHTML();
		const json = editor.getJSON();
		const markdown = htmlToMarkdown(html);
		onChange?.({ html, markdown, json });
	}

	// Public methods
	export function getContent() {
		if (!editor || !isReady) return { html: '', markdown: '', json: null };
		const html = editor.getHTML();
		const json = editor.getJSON();
		const markdown = htmlToMarkdown(html);
		return { html, markdown, json };
	}

	export function setContent(newContent: string, format: 'html' | 'json' = 'html') {
		if (!editor || !isReady) return;
		if (format === 'json') {
			editor.commands.setContent(JSON.parse(newContent));
		} else {
			editor.commands.setContent(newContent);
		}
	}

	export function focus() {
		editor?.commands.focus();
	}

	export function clear() {
		editor?.commands.clearContent();
	}
</script>

{#if showToolbar && editable}
	<div class="toolbar">
		<!-- Heading Dropdown -->
		<select
			class="toolbar-select"
			onchange={(e) => setHeading(parseInt((e.target as HTMLSelectElement).value))}
		>
			<option value="0">Normal</option>
			<option value="1">Heading 1</option>
			<option value="2">Heading 2</option>
			<option value="3">Heading 3</option>
		</select>

		<div class="toolbar-divider"></div>

		<!-- Text Formatting -->
		<button
			type="button"
			class="toolbar-btn"
			class:active={isBold}
			onclick={() => toggleBold()}
			title="Bold"
		>
			<Icon name="bold" class="w-4 h-4" />
		</button>

		<button
			type="button"
			class="toolbar-btn"
			class:active={isItalic}
			onclick={() => toggleItalic()}
			title="Italic"
		>
			<Icon name="italic" class="w-4 h-4" />
		</button>

		<div class="toolbar-divider"></div>

		<!-- Lists -->
		<button
			type="button"
			class="toolbar-btn"
			class:active={isBulletList}
			onclick={() => toggleBulletList()}
			title="Bullet List"
		>
			<Icon name="list" class="w-4 h-4" />
		</button>

		<button
			type="button"
			class="toolbar-btn"
			class:active={isOrderedList}
			onclick={() => toggleOrderedList()}
			title="Numbered List"
		>
			<Icon name="list-ordered" class="w-4 h-4" />
		</button>

		<div class="toolbar-divider"></div>

		<!-- Image -->
		<button
			type="button"
			class="toolbar-btn"
			onclick={() => addImage()}
			title="Add Image"
		>
			<Icon name="image" class="w-4 h-4" />
		</button>

		<div class="toolbar-divider"></div>

		<!-- Save Button -->
		<button
			type="button"
			class="toolbar-btn"
			onclick={() => saveContent()}
			title="Save Content"
		>
			<Icon name="save" class="w-4 h-4" />
			Save
		</button>
	</div>
{/if}

<div bind:this={element} class="editor-content"></div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem;
		border: 1px solid #e2e8f0;
		border-bottom: none;
		border-radius: 0.5rem 0.5rem 0 0;
		background: #f8fafc;
		flex-wrap: wrap;
	}

	.toolbar-select {
		padding: 0.25rem 0.5rem;
		border: 1px solid #e2e8f0;
		border-radius: 0.25rem;
		font-size: 0.875rem;
		background: white;
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.375rem;
		border: 1px solid transparent;
		border-radius: 0.25rem;
		background: transparent;
		cursor: pointer;
		color: #374151;
		font-size: 0.875rem;
		transition: all 0.15s ease;
	}

	.toolbar-btn:hover {
		background: #e2e8f0;
	}

	.toolbar-btn.active {
		background: #dbeafe;
		border-color: #93c5fd;
		color: #1d4ed8;
	}

	.toolbar-divider {
		width: 1px;
		height: 1.5rem;
		background: #e2e8f0;
		margin: 0 0.25rem;
	}

	.editor-content {
		border: 1px solid #e2e8f0;
		border-radius: 0 0 0.5rem 0.5rem;
		min-height: 200px;
		padding: 1rem;
	}

	:global(.ProseMirror) {
		outline: none;
		min-height: 200px;
	}

	:global(.ProseMirror p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		color: #9ca3af;
		pointer-events: none;
		height: 0;
	}

	:global(.ProseMirror img) {
		max-width: 100%;
		height: auto;
		border-radius: 0.5rem;
		margin: 0.5rem 0;
	}

	:global(.ProseMirror h1) {
		font-size: 1.875rem;
		font-weight: 700;
		margin: 1rem 0 0.5rem 0;
		line-height: 1.2;
	}

	:global(.ProseMirror h2) {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 1rem 0 0.5rem 0;
		line-height: 1.3;
	}

	:global(.ProseMirror h3) {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0.75rem 0 0.5rem 0;
		line-height: 1.4;
	}

	:global(.ProseMirror ul),
	:global(.ProseMirror ol) {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
	}

	:global(.ProseMirror li) {
		margin: 0.25rem 0;
	}

	:global(.ProseMirror strong) {
		font-weight: 600;
	}

	:global(.ProseMirror em) {
		font-style: italic;
	}
</style>
