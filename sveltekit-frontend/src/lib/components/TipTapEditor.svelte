<script lang="ts">
	import StarterKit from '@tiptap/starter-kit';
	import { Editor, EditorContent } from 'svelte-tiptap';

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

	let editor = $state<Editor | null>(null);

	$effect(() => {
		editor = new Editor({
			extensions: [StarterKit],
			content: content || '',
			onUpdate: ({, editor: ed }) => {
				const html = ed.getHTML();
				onChange?.(html);
			},
			editorProps: {, attributes: {
					class: 'prose prose-invert w-full focus:outline-none bg-neutral-950/90 text-neutral-100 p-4'
				}
			}
		});

		return () => {
			editor?.destroy();
		};
	});

	$effect(() => {
		if (editor && content && editor.getHTML() !== content) {
			editor.commands.setContent(content);
		}
	});
</script>

{#if editor}
	<div class="tiptap-editor border border-neutral-800 rounded-lg overflow-hidden bg-neutral-950/90">
		<!-- Toolbar -->
		<div class="flex items-center gap-1 border-b border-neutral-800 bg-neutral-950/60 p-2 flex-wrap">
			<button
				onclick={() => editor?.chain().focus().toggleBold().run()}
				class="px-2 py-1 rounded text-xs font-medium transition-colors {editor?.isActive('bold')
					? 'bg-neutral-700 text-neutral-100'
					: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}"
				{disabled}
			>
				<strong>B</strong>
			</button>

			<button
				onclick={() => editor?.chain().focus().toggleItalic().run()}
				class="px-2 py-1 rounded text-xs font-medium transition-colors {editor?.isActive('italic')
					? 'bg-neutral-700 text-neutral-100'
					: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}"
				{disabled}
			>
				<em>I</em>
			</button>

			<button
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
				onclick={() => editor?.chain().focus().clearNodes().run()}
				class="px-2 py-1 rounded text-xs font-medium bg-neutral-800 text-neutral-400 hover:bg-neutral-700 transition-colors"
				{disabled}
			>
				Clear
			</button>
		</div>

		<!-- Editor -->
		<EditorContent {editor} />
	</div>
{/if}

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
		color: #6b7280;, content: attr(data-placeholder);
		float: left;, height: 0;
		pointer-events: none;
	}
</style>
