<script lang="ts">
	import { Editor } from '@tiptap/core';
	import Image from '@tiptap/extension-image';
	import Link from '@tiptap/extension-link';
	import Placeholder from '@tiptap/extension-placeholder';
	import StarterKit from '@tiptap/starter-kit';
	import Underline from '@tiptap/extension-underline';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		content?: string;
		placeholder?: string;
		editable?: boolean;
		showToolbar?: boolean;
		autoSave?: boolean;
		autoSaveDelay?: number;
		minHeight?: number;
		onChange?: (data: { html: string; markdown: string; json: any }) => void;
	}

	let {
		content = '',
		placeholder = 'Start writing your note...',
		editable = true,
		showToolbar = true,
		autoSave = false,
		autoSaveDelay = 2000,
		minHeight = 300,
		onChange,
	}: Props = $props();

	let element = $state<HTMLElement>();
	let editor = $state<Editor>();
	let isReady = $state(false);
	let autoSaveTimer: ReturnType<typeof setTimeout>;

	// Drag-drop state
	let isDragOver = $state(false);
	let dropMessage = $state('');

	// Toolbar active states
	let isBold = $state(false);
	let isItalic = $state(false);
	let isUnderline = $state(false);
	let isStrike = $state(false);
	let isBulletList = $state(false);
	let isOrderedList = $state(false);
	let isBlockquote = $state(false);
	let isCodeBlock = $state(false);
	let isLink = $state(false);
	let headingLevel = $state(0);

	// Status bar
	let wordCount = $derived.by(() => {
		if (!editor || !isReady) return 0;
		return editor.getText().trim().split(/\s+/).filter(Boolean).length;
	});
	let charCount = $derived.by(() => {
		if (!editor || !isReady) return 0;
		return editor.getText().length;
	});

	$effect(() => {
		if (!element) return;

		editor = new Editor({
			element,
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3] },
				}),
				Underline,
				Link.configure({
					openOnClick: false,
					HTMLAttributes: { class: 'editor-link' },
				}),
				Image.configure({
					inline: true,
					allowBase64: true,
					HTMLAttributes: { class: 'editor-image' },
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
			if (autoSaveTimer) clearTimeout(autoSaveTimer);
			editor?.destroy();
		};
	});

	function updateToolbarState() {
		if (!editor || !isReady) return;
		isBold = editor.isActive('bold');
		isItalic = editor.isActive('italic');
		isUnderline = editor.isActive('underline');
		isStrike = editor.isActive('strike');
		isBulletList = editor.isActive('bulletList');
		isOrderedList = editor.isActive('orderedList');
		isBlockquote = editor.isActive('blockquote');
		isCodeBlock = editor.isActive('codeBlock');
		isLink = editor.isActive('link');
		if (editor.isActive('heading', { level: 1 })) headingLevel = 1;
		else if (editor.isActive('heading', { level: 2 })) headingLevel = 2;
		else if (editor.isActive('heading', { level: 3 })) headingLevel = 3;
		else headingLevel = 0;
	}

	function handleContentChange() {
		if (!editor || !isReady) return;
		const html = editor.getHTML();
		const json = editor.getJSON();
		const markdown = htmlToMarkdown(html);
		onChange?.({ html, markdown, json });
		if (autoSave) {
			if (autoSaveTimer) clearTimeout(autoSaveTimer);
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
			.replace(/<u[^>]*>(.*?)<\/u>/g, '$1')
			.replace(/<s[^>]*>(.*?)<\/s>/g, '~~$1~~')
			.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gs, '> $1\n\n')
			.replace(/<code[^>]*>(.*?)<\/code>/g, '`$1`')
			.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, '[$2]($1)')
			.replace(/<ul[^>]*>(.*?)<\/ul>/gs, (_m, inner) =>
				inner.replace(/<li[^>]*>(.*?)<\/li>/g, '- $1\n') + '\n'
			)
			.replace(/<ol[^>]*>(.*?)<\/ol>/gs, (_m, inner) => {
				let c = 1;
				return inner.replace(/<li[^>]*>(.*?)<\/li>/g, () => `${c++}. \n`) + '\n';
			})
			.replace(/<hr[^>]*>/g, '\n---\n\n')
			.replace(/<p[^>]*>(.*?)<\/p>/g, '$1\n\n')
			.replace(/<[^>]+>/g, '')
			.replace(/\n{3,}/g, '\n\n')
			.trim();
	}

	// ── Toolbar actions ──────────────────────────────────────────────
	function setHeading(level: number) {
		if (!editor) return;
		if (level === 0) editor.chain().focus().setParagraph().run();
		else editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
	}

	function addLink() {
		if (!editor) return;
		if (isLink) {
			editor.chain().focus().unsetLink().run();
			return;
		}
		const url = prompt('Enter URL:');
		if (url) editor.chain().focus().setLink({ href: url }).run();
	}

	function addImage() {
		const url = prompt('Enter image URL:');
		if (url) editor?.chain().focus().setImage({ src: url }).run();
	}

	// ── Drag-and-drop file handling ──────────────────────────────────
	const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'html', 'htm', 'csv', 'json', 'log']);
	const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		// Only clear if leaving the wrapper (not entering a child)
		const target = e.relatedTarget as Node | null;
		if (target && (e.currentTarget as HTMLElement).contains(target)) return;
		isDragOver = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
		if (!editor || !e.dataTransfer?.files.length) return;

		const files = Array.from(e.dataTransfer.files);
		for (const file of files) {
			const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

			if (IMAGE_TYPES.has(file.type)) {
				// Insert image as base64
				const dataUrl = await fileToDataUrl(file);
				editor.chain().focus().setImage({ src: dataUrl }).run();
				dropMessage = `Inserted image: ${file.name}`;
			} else if (TEXT_EXTS.has(ext)) {
				// Read text file and insert content
				const text = await file.text();
				if (ext === 'html' || ext === 'htm') {
					editor.chain().focus().insertContent(text).run();
				} else if (ext === 'md' || ext === 'markdown') {
					// Basic markdown — insert as plain text paragraphs
					const paragraphs = text.split(/\n{2,}/).filter(Boolean);
					const html = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
					editor.chain().focus().insertContent(html).run();
				} else {
					// Plain text
					const paragraphs = text.split(/\n{2,}/).filter(Boolean);
					const html = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
					editor.chain().focus().insertContent(html).run();
				}
				dropMessage = `Imported: ${file.name} (${formatSize(file.size)})`;
			} else {
				dropMessage = `Unsupported file type: ${file.name}`;
			}
		}

		// Clear message after 3s
		setTimeout(() => { dropMessage = ''; }, 3000);
	}

	function fileToDataUrl(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	function escapeHtml(str: string): string {
		return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	// ── Import file via button ───────────────────────────────────────
	let fileInput = $state<HTMLInputElement>();

	function triggerFileImport() {
		fileInput?.click();
	}

	async function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files?.length || !editor) return;
		const file = input.files[0];
		const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
		const text = await file.text();

		if (ext === 'html' || ext === 'htm') {
			editor.chain().focus().insertContent(text).run();
		} else {
			const paragraphs = text.split(/\n{2,}/).filter(Boolean);
			const html = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
			editor.chain().focus().insertContent(html).run();
		}
		dropMessage = `Imported: ${file.name}`;
		setTimeout(() => { dropMessage = ''; }, 3000);
		input.value = '';
	}

	// ── Public API (backward-compatible) ─────────────────────────────
	export function getContent() {
		if (!editor || !isReady) return { html: '', markdown: '', json: null };
		const html = editor.getHTML();
		return { html, markdown: htmlToMarkdown(html), json: editor.getJSON() };
	}

	export function setContent(newContent: string, format: 'html' | 'json' = 'html') {
		if (!editor || !isReady) return;
		if (format === 'json') editor.commands.setContent(JSON.parse(newContent));
		else editor.commands.setContent(newContent);
	}

	export function focus() { editor?.commands.focus(); }
	export function clear() { editor?.commands.clearContent(); }
</script>

<input
	bind:this={fileInput}
	type="file"
	accept=".txt,.md,.html,.htm,.csv,.json,.log"
	class="hidden-file-input"
	onchange={handleFileInput}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="editor-shell"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	{#if showToolbar && editable}
		<div class="toolbar">
			<!-- Heading dropdown -->
			<select
				class="toolbar-select"
				value={headingLevel}
				onchange={(e) => setHeading(parseInt((e.target as HTMLSelectElement).value))}
			>
				<option value="0">Normal</option>
				<option value="1">Heading 1</option>
				<option value="2">Heading 2</option>
				<option value="3">Heading 3</option>
			</select>

			<div class="toolbar-divider"></div>

			<!-- Text formatting -->
			<button type="button" class="toolbar-btn" class:active={isBold}
				onclick={() => editor?.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
				<Icon name="bold" class="w-4 h-4" />
			</button>
			<button type="button" class="toolbar-btn" class:active={isItalic}
				onclick={() => editor?.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
				<Icon name="italic" class="w-4 h-4" />
			</button>
			<button type="button" class="toolbar-btn" class:active={isUnderline}
				onclick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
				<Icon name="underline" class="w-4 h-4" />
			</button>
			<button type="button" class="toolbar-btn" class:active={isStrike}
				onclick={() => editor?.chain().focus().toggleStrike().run()} title="Strikethrough">
				<Icon name="strikethrough" class="w-4 h-4" />
			</button>

			<div class="toolbar-divider"></div>

			<!-- Lists -->
			<button type="button" class="toolbar-btn" class:active={isBulletList}
				onclick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet List">
				<Icon name="list" class="w-4 h-4" />
			</button>
			<button type="button" class="toolbar-btn" class:active={isOrderedList}
				onclick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered List">
				<Icon name="list-ordered" class="w-4 h-4" />
			</button>

			<div class="toolbar-divider"></div>

			<!-- Block elements -->
			<button type="button" class="toolbar-btn" class:active={isBlockquote}
				onclick={() => editor?.chain().focus().toggleBlockquote().run()} title="Blockquote">
				<Icon name="quote" class="w-4 h-4" />
			</button>
			<button type="button" class="toolbar-btn" class:active={isCodeBlock}
				onclick={() => editor?.chain().focus().toggleCodeBlock().run()} title="Code Block">
				<Icon name="code" class="w-4 h-4" />
			</button>
			<button type="button" class="toolbar-btn"
				onclick={() => editor?.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
				<Icon name="minus" class="w-4 h-4" />
			</button>

			<div class="toolbar-divider"></div>

			<!-- Insert -->
			<button type="button" class="toolbar-btn" class:active={isLink}
				onclick={addLink} title="Insert Link">
				<Icon name="link" class="w-4 h-4" />
			</button>
			<button type="button" class="toolbar-btn"
				onclick={addImage} title="Insert Image URL">
				<Icon name="image" class="w-4 h-4" />
			</button>
			<button type="button" class="toolbar-btn"
				onclick={triggerFileImport} title="Import file (.txt, .md, .html)">
				<Icon name="file-up" class="w-4 h-4" />
			</button>

			<div class="toolbar-divider"></div>

			<!-- Undo / Redo -->
			<button type="button" class="toolbar-btn"
				onclick={() => editor?.chain().focus().undo().run()} title="Undo (Ctrl+Z)">
				<Icon name="undo-2" class="w-4 h-4" />
			</button>
			<button type="button" class="toolbar-btn"
				onclick={() => editor?.chain().focus().redo().run()} title="Redo (Ctrl+Shift+Z)">
				<Icon name="redo-2" class="w-4 h-4" />
			</button>
		</div>
	{/if}

	<!-- Editor area with drag overlay -->
	<div class="editor-content" style="min-height: {minHeight}px">
		{#if isDragOver}
			<div class="drag-overlay">
				<div class="drag-overlay-inner">
					<Icon name="file-up" class="w-8 h-8" />
					<span>Drop file to insert</span>
					<span class="drag-hint">.txt, .md, .html, or images</span>
				</div>
			</div>
		{/if}
		<div bind:this={element} class="editor-element"></div>
	</div>

	<!-- Status bar -->
	<div class="status-bar">
		<span>{wordCount} words &middot; {charCount} chars</span>
		{#if dropMessage}
			<span class="drop-status">{dropMessage}</span>
		{/if}
		<span class="status-right">
			{#if headingLevel > 0}H{headingLevel}{:else}Body{/if}
		</span>
	</div>
</div>

<style>
	.hidden-file-input {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
		opacity: 0;
	}

	.editor-shell {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--t-border, #e2e8f0);
		border-radius: 0.5rem;
		overflow: hidden;
		background: var(--t-bg, #fff);
	}

	/* ── Toolbar ────────────────────────────────────────────────── */
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		padding: 0.375rem 0.5rem;
		border-bottom: 1px solid var(--t-border, #e2e8f0);
		background: var(--t-bg-secondary, #f8fafc);
		flex-wrap: wrap;
	}

	.toolbar-select {
		padding: 0.2rem 0.4rem;
		border: 1px solid var(--t-border, #e2e8f0);
		border-radius: 0.25rem;
		font-size: 0.8rem;
		background: var(--t-bg, #fff);
		color: var(--t-text, #374151);
		cursor: pointer;
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.3rem;
		border: 1px solid transparent;
		border-radius: 0.25rem;
		background: transparent;
		cursor: pointer;
		color: var(--t-text-secondary, #6b7280);
		transition: all 0.1s ease;
	}

	.toolbar-btn:hover {
		background: var(--t-bg-hover, #e2e8f0);
		color: var(--t-text, #374151);
	}

	.toolbar-btn.active {
		background: var(--t-accent-soft, #dbeafe);
		border-color: var(--t-accent, #93c5fd);
		color: var(--t-accent-text, #1d4ed8);
	}

	.toolbar-divider {
		width: 1px;
		height: 1.25rem;
		background: var(--t-border, #e2e8f0);
		margin: 0 0.15rem;
	}

	/* ── Editor content area ────────────────────────────────────── */
	.editor-content {
		position: relative;
		resize: vertical;
		overflow: auto;
		padding: 1rem 1.25rem;
	}

	.editor-element {
		min-height: 100%;
	}

	/* ── Drag overlay ───────────────────────────────────────────── */
	.drag-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(59, 130, 246, 0.08);
		border: 2px dashed rgba(59, 130, 246, 0.5);
		border-radius: 0.375rem;
		z-index: 10;
		pointer-events: none;
	}

	.drag-overlay-inner {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.375rem;
		color: #3b82f6;
		font-weight: 600;
		font-size: 0.95rem;
	}

	.drag-hint {
		font-size: 0.75rem;
		font-weight: 400;
		opacity: 0.7;
	}

	/* ── Status bar ─────────────────────────────────────────────── */
	.status-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.25rem 0.75rem;
		border-top: 1px solid var(--t-border, #e2e8f0);
		background: var(--t-bg-secondary, #f8fafc);
		font-size: 0.75rem;
		color: var(--t-text-secondary, #9ca3af);
	}

	.drop-status {
		color: #3b82f6;
		font-weight: 500;
	}

	.status-right {
		margin-left: auto;
	}

	/* ── ProseMirror styles ─────────────────────────────────────── */
	:global(.ProseMirror) {
		outline: none;
		min-height: 100%;
		color: var(--t-text, #1a1a1a);
		line-height: 1.6;
	}

	:global(.ProseMirror p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		color: var(--t-text-secondary, #9ca3af);
		pointer-events: none;
		height: 0;
	}

	:global(.ProseMirror .editor-image) {
		max-width: 100%;
		height: auto;
		border-radius: 0.5rem;
		margin: 0.5rem 0;
	}

	:global(.ProseMirror .editor-link) {
		color: #3b82f6;
		text-decoration: underline;
		cursor: pointer;
	}

	:global(.ProseMirror h1) {
		font-size: 1.875rem;
		font-weight: 700;
		margin: 1rem 0 0.5rem;
		line-height: 1.2;
	}

	:global(.ProseMirror h2) {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 1rem 0 0.5rem;
		line-height: 1.3;
	}

	:global(.ProseMirror h3) {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0.75rem 0 0.5rem;
		line-height: 1.4;
	}

	:global(.ProseMirror ul),
	:global(.ProseMirror ol) {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
	}

	:global(.ProseMirror ul) { list-style-type: disc; }
	:global(.ProseMirror ol) { list-style-type: decimal; }

	:global(.ProseMirror li) {
		margin: 0.25rem 0;
	}

	:global(.ProseMirror strong) { font-weight: 600; }
	:global(.ProseMirror em) { font-style: italic; }
	:global(.ProseMirror u) { text-decoration: underline; }
	:global(.ProseMirror s) { text-decoration: line-through; }

	:global(.ProseMirror blockquote) {
		border-left: 3px solid var(--t-border, #d1d5db);
		padding-left: 1rem;
		margin: 0.75rem 0;
		color: var(--t-text-secondary, #6b7280);
		font-style: italic;
	}

	:global(.ProseMirror pre) {
		background: #1e1e2e;
		color: #cdd6f4;
		padding: 0.75rem 1rem;
		border-radius: 0.375rem;
		font-family: 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.875rem;
		overflow-x: auto;
		margin: 0.5rem 0;
	}

	:global(.ProseMirror code) {
		background: rgba(0, 0, 0, 0.06);
		padding: 0.15rem 0.35rem;
		border-radius: 0.2rem;
		font-family: 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.875em;
	}

	:global(.ProseMirror pre code) {
		background: none;
		padding: 0;
		border-radius: 0;
	}

	:global(.ProseMirror hr) {
		border: none;
		border-top: 1px solid var(--t-border, #e2e8f0);
		margin: 1rem 0;
	}
</style>
