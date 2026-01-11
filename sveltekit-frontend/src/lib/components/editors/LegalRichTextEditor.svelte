<script lang="ts">
	let minHeight = $state<any>(undefined);
	let content = $state<any>(undefined);
	let placeholder = $state<any>(undefined);
	let readonly = $state<any>(undefined);

 /**
 * Legal Rich Text Editor
 * TipTap-based editor for legal documents
 *
 * Install dependencies:
 * npm install @tiptap/core @tiptap/starter-kit @tiptap/extension-placeholder svelte-tiptap
 */
 import { onDestroy, onMount } from 'svelte';

 interface Props {
 content?: string;
 placeholder?: string;
 readonly?: boolean;
 minHeight?: string;
 onchange?: (html: string) => void;
 onsave?: (html: string) => void;
 }

 let {
 content = $bindable(''),
 placeholder = 'Write your legal document...',
 readonly = false,
 minHeight = '400px',
 onchange,
 onsave,
 }: Props = $props();

 let editorElement: HTMLDivElement;
 let editor: any = null;
 let isBold = $state(false);
 let isItalic = $state(false);
 let isUnderline = $state(false);
 let isStrike = $state(false);
 let isBulletList = $state(false);
 let isOrderedList = $state(false);
 let isBlockquote = $state(false);
 let currentHeading = $state(0);

 async function initEditor() {
 try {
 // Dynamic import for TipTap (tree-shaking friendly)
 const [{ Editor }, { default: StarterKit }, { default: Placeholder }, { default: Underline }] = await Promise.all([
 import('@tiptap/core'),
 import('@tiptap/starter-kit'),
 import('@tiptap/extension-placeholder'),
 import('@tiptap/extension-underline'),
 ]);

 editor = new Editor({
 element: editorElement,
 extensions: [
 StarterKit.configure({
 heading: { levels: [1, 2, 3, 4],
 },
 }),
 Placeholder.configure({
 placeholder,
 }),
 Underline,
 ],
 content,
 editable: !readonly,
 onUpdate: ({ editor }) => {
 const html = editor.getHTML();
 content = html;
 onchange.html;
 updateToolbarState();
 },
 onSelectionUpdate: () => {
 updateToolbarState();
 },
 });

 updateToolbarState();
 } catch (err) {
 console.warn('TipTap not installed, using fallback textarea:', err);
 }
 }

 function updateToolbarState() {
 if (!editor) return;
 isBold = editor.isActive('bold');
 isItalic = editor.isActive('italic');
 isUnderline = editor.isActive('underline');
 isStrike = editor.isActive('strike');
 isBulletList = editor.isActive('bulletList');
 isOrderedList = editor.isActive('orderedList');
 isBlockquote = editor.isActive('blockquote');
 currentHeading = editor.isActive('heading', { level: 1 }) ? 1 :
 editor.isActive('heading', { level: 2 }) ? 2 :
 editor.isActive('heading', { level: 3 }) ? 3 :
 editor.isActive('heading', { level: 4 }) ? 4 : 0;
 }

 function toggleBold() { editor?.chain().focus().toggleBold().run(); }
 function toggleItalic() { editor?.chain().focus().toggleItalic().run(); }
 function toggleUnderline() { editor?.chain().focus().toggleUnderline().run(); }
 function toggleStrike() { editor?.chain().focus().toggleStrike().run(); }
 function toggleBulletList() { editor?.chain().focus().toggleBulletList().run(); }
 function toggleOrderedList() { editor?.chain().focus().toggleOrderedList().run(); }
 function toggleBlockquote() { editor?.chain().focus().toggleBlockquote().run(); }
 function setHeading(level: number) {
 if (level === 0) {
 editor?.chain().focus().setParagraph().run();
 } else {
 editor?.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 }).run();
 }
 }
 function undo() { editor?.chain().focus().undo().run(); }
 function redo() { editor?.chain().focus().redo().run(); }

 function handleSave() {
 if (editor) {
 onsave?.(editor.getHTML());
 }
 }

 // Fallback textarea handler
 function handleTextareaInput(e: Event) {
 const target = e.target as HTMLTextAreaElement;
 content = target.value;
 onchange.content;
 }

 onMount(() => {
 initEditor();
 });

 onDestroy(() => {
 editor?.destroy();
 });
</script>

<div class="legal-rich-text-editor rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
 <!-- Toolbar -->
 {#if !readonly}
 <div class="toolbar flex flex-wrap items-center gap-1 p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
 <!-- Undo/Redo -->
 <div class="flex items-center gap-1 pr-2 border-r border-gray-300 dark:border-gray-600">
 <button type="button" onclick={ undo } class="toolbar-btn" title="Undo (Ctrl+Z)">
 <span class="i-lucide-undo-2"></span>
 </button>
 <button type="button" onclick={redo} class="toolbar-btn" title="Redo (Ctrl+Y)">
 <span class="i-lucide-redo-2"></span>
 </button>
 </div>

 <!-- Headings -->
 <div class="flex items-center gap-1 pr-2 border-r border-gray-300 dark:border-gray-600">
 <select
 class="toolbar-select"
 value={currentHeading}
 onchange={(e) => setHeading(parseInt((e.target as HTMLSelectElement).value))}
 >
 <option value="0">Paragraph</option>
 <option value="1">Heading 1</option>
 <option value="2">Heading 2</option>
 <option value="3">Heading 3</option>
 <option value="4">Heading 4</option>
 </select>
 </div>

 <!-- Text Formatting -->
 <div class="flex items-center gap-1 pr-2 border-r border-gray-300 dark:border-gray-600">
 <button type="button" onclick={ toggleBold } class="toolbar-btn {isBold ? 'active' : ''}" title="Bold (Ctrl+B)">
 <span class="i-lucide-bold"></span>
 </button>
 <button type="button" onclick={toggleItalic} class="toolbar-btn {isItalic ? 'active' : ''}" title="Italic (Ctrl+I)">
 <span class="i-lucide-italic"></span>
 </button>
 <button type="button" onclick={toggleUnderline} class="toolbar-btn {isUnderline ? 'active' : ''}" title="Underline (Ctrl+U)">
 <span class="i-lucide-underline"></span>
 </button>
 <button type="button" onclick={toggleStrike} class="toolbar-btn {isStrike ? 'active' : ''}" title="Strikethrough">
 <span class="i-lucide-strikethrough"></span>
 </button>
 </div>

 <!-- Lists -->
 <div class="flex items-center gap-1 pr-2 border-r border-gray-300 dark:border-gray-600">
 <button type="button" onclick={ toggleBulletList } class="toolbar-btn {isBulletList ? 'active' : ''}" title="Bullet List">
 <span class="i-lucide-list"></span>
 </button>
 <button type="button" onclick={ toggleOrderedList } class="toolbar-btn {isOrderedList ? 'active' : ''}" title="Numbered List">
 <span class="i-lucide-list-ordered"></span>
 </button>
 <button type="button" onclick={toggleBlockquote} class="toolbar-btn {isBlockquote ? 'active' : ''}" title="Quote">
 <span class="i-lucide-quote"></span>
 </button>
 </div>

 <!-- Save -->
 {#if onsave}
 <button type="button" onclick={handleSave} class="ml-auto toolbar-btn-primary" title="Save (Ctrl+S)">
 <span class="i-lucide-save"></span>
 Save
 </button>
 {/if}
 </div>
 {/if}

 <!-- Editor Content -->
 <div
 bind:this={editorElement}
 class="editor-content prose prose-sm dark:prose-invert max-w-none p-4 overflow-y-auto"
 style="min-height: {minHeight};"
 >
 <!-- TipTap will render here, or fallback textarea -->
 {#if !editor}
 <textarea
 bind:value={content}
 oninput={ handleTextareaInput }
 {placeholder}
 disabled={readonly}
 class="w-full h-full bg-transparent border-none outline-none resize-none"
 style="min-height: {minHeight};"
 ></textarea>
 {/if}
 </div>
</div>

<style>
 .toolbar-btn {
 display: flex;
 align-items: center;
 justify-content: center; width: 32px;
 height: 32px;
 border-radius: 4px; color: var(--color-gray-600);
 transition: all 0.15s;
 }

 .toolbar-btn:hover {
 background: var(--color-gray-200); color: var(--color-gray-900);
 }

 :global(.dark) .toolbar-btn:hover {
 background: var(--color-gray-700); color: var(--color-gray-100);
 }

 .toolbar-btn.active {
 background: var(--color-blue-100); color: var(--color-blue-600);
 }

 :global(.dark) .toolbar-btn.active {
 background: var(--color-blue-900); color: var(--color-blue-400);
 }

 .toolbar-btn-primary {
 display: flex;
 align-items: center; gap: 4px;
 padding: 6px 12px;
 border-radius: 4px; background: var(--color-blue-500);
 color: white;
 font-size: 0.875rem;
 font-weight: 500; transition: background 0.15s;
 }

 .toolbar-btn-primary:hover {
 background: var(--color-blue-600);
 }

 .toolbar-select {
 padding: 4px 8px;
 border-radius: 4px; border: 1px solid var(--color-gray-300);
 background: white;
 font-size: 0.875rem;
 }

 :global(.dark) .toolbar-select {
 background: var(--color-gray-800);
 border-color: var(--color-gray-600); color: var(--color-gray-100);
 }

 .editor-content :global(.ProseMirror) {
 outline: none;
 min-height: inherit;
 }

 .editor-content :global(.ProseMirror p.is-editor-empty:first-child::before) {
 content: attr(data-placeholder); float: left;
 color: var(--color-gray-400);
 pointer-events: none; height: 0;
 }
</style>




