<script lang="ts">
	import StarterKit from '@tiptap/starter-kit';
	import { Editor } from '@tiptap/core';

	interface Props {
		content?: string;
		placeholder?: string;
		onChange?: (html: string) => void;
		disabled?: boolean;
	}

	let {
		content = '',
		placeholder = 'Write your report...',
		onChange,
		disabled = false
	}: Props = $props();

	let editorContainer = $state<HTMLDivElement | null>(null);
	let editor = $state<Editor | null>(null);

	$effect(() => {
		if (!editorContainer) return;

		const instance = new Editor({
			element: editorContainer,
			extensions: [StarterKit],
			content: content || '',
			editable: !disabled,
			onUpdate: ({ editor: ed }) => {
				const html = ed.getHTML();
				onChange?.(html);
			},
			editorProps: {
				attributes: {
					class: 'prose prose-invert w-full focus:outline-none bg-neutral-950/90 text-neutral-100 p-4'
				}
			}
		});

		editor = instance;

		return () => {
			instance.destroy();
			editor = null;
		};
	});

	$effect(() => {
		if (editor && content && editor.getHTML() !== content) {
			editor.commands.setContent(content);
		}
	});

	$effect(() => {
		if (editor) {
			editor.setEditable(!disabled);
		}
	});
</script>

<div class="tiptap-editor border border-neutral-800 rounded-lg overflow-hidden bg-neutral-950/90">
	<!-- Toolbar -->
	<div class="flex items-center gap-1 border-b border-neutral-800 bg-neutral-950/60 p-2 flex-wrap">
		<button
			type="button"
			onclick={() => editor?.chain().focus().toggleBold().run()}
			class="px-2 py-1 rounded text-xs font-medium transition-colors {editor?.isActive('bold')
				? 'bg-neutral-700 text-neutral-100'
				: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}"
			{disabled}
		>
			<strong>B</strong>
		</button>

		<button
			type="button"
			onclick={() => editor?.chain().focus().toggleItalic().run()}
			class="px-2 py-1 rounded text-xs font-medium transition-colors {editor?.isActive('italic')
				? 'bg-neutral-700 text-neutral-100'
				: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}"
			{disabled}
		>
			<em>I</em>
		</button>

		<button
			type="button"
			onclick={() => editor?.chain().focus().toggleStrike().run()}
			class="px-2 py-1 rounded text-xs font-medium transition-colors {editor?.isActive('strike')
				? 'bg-neutral-700 text-neutral-100'
				: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}"
			{disabled}
		>
			<s>S</s>
		</button>

		<div class="w-px h-5 bg-neutral-700 mx-1"></div>

		<button
			type="button"
			onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
			class="px-2 py-1 rounded text-xs font-medium transition-colors {editor?.isActive('heading', {
				level: 1
			})
				? 'bg-neutral-700 text-neutral-100'
				: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}"
			{disabled}
		>
			H1
		</button>

		<button
			type="button"
			onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
			class="px-2 py-1 rounded text-xs font-medium transition-colors {editor?.isActive('heading', {
				level: 2
			})
				? 'bg-neutral-700 text-neutral-100'
				: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}"
			{disabled}
		>
			H2
		</button>

		<button
			type="button"
			onclick={() => editor?.chain().focus().toggleBulletList().run()}
			class="px-2 py-1 rounded text-xs font-medium transition-colors {editor?.isActive(
				'bulletList'
			)
				? 'bg-neutral-700 text-neutral-100'
				: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}"
			{disabled}
		>
			• List
		</button>

		<div class="w-px h-5 bg-neutral-700 mx-1"></div>

		<button
			type="button"
			onclick={() => editor?.chain().focus().clearNodes().run()}
			class="px-2 py-1 rounded text-xs font-medium bg-neutral-800 text-neutral-400 hover:bg-neutral-700 transition-colors"
			{disabled}
		>
			Clear
		</button>
	</div>

	<!-- Editor container mounted directly by @tiptap/core -->
	<div bind:this={editorContainer}></div>
</div>

<style>
	:global(.tiptap-editor .ProseMirror) {
		min-height: 400px;
		max-height: 600px;
		overflow-y: auto;
	}

	:global(.tiptap-editor .ProseMirror:focus) {
		outline: none;
	}

	:global(.tiptap-editor .ProseMirror p.is-editor-empty:first-child::before) {
		color: #6b7280;
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
	}
</style>
