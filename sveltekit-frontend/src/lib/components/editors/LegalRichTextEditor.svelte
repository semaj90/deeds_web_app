<script lang="ts">
  /**
   * Legal Rich Text Editor
   * TipTap-based editor for legal documents
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
    onsave
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
      const [{ Editor }, { default: StarterKit }, { default: Placeholder }, { default: Underline }] = await Promise.all([
        import('@tiptap/core'),
        import('@tiptap/starter-kit'),
        import('@tiptap/extension-placeholder'),
        import('@tiptap/extension-underline')
      ]);

      editor = new Editor({
        element: editorElement,
        extensions: [
          StarterKit.configure({
            heading: { levels: [1, 2, 3, 4] }
          }),
          Placeholder.configure({ placeholder }),
          Underline
        ],
        content,
        editable: !readonly,
        onUpdate: ({ editor: e }) => {
          const html = e.getHTML();
          content = html;
          onchange?.(html);
          updateToolbarState();
        },
        onSelectionUpdate: () => {
          updateToolbarState();
        }
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

  function handleTextareaInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    content = target.value;
    onchange?.(content);
  }

  onMount(() => {
    initEditor();
  });

  onDestroy(() => {
    editor?.destroy();
  });
</script>

<div class="legal-rich-text-editor rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
  {#if !readonly}
    <div class="toolbar flex flex-wrap items-center gap-1 p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
      <div class="flex items-center gap-1 pr-2 border-r border-gray-300 dark:border-gray-600">
        <button type="button" onclick={undo} class="toolbar-btn" title="Undo (Ctrl+Z)">↶</button>
        <button type="button" onclick={redo} class="toolbar-btn" title="Redo (Ctrl+Y)">↷</button>
      </div>

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

      <div class="flex items-center gap-1 pr-2 border-r border-gray-300 dark:border-gray-600">
        <button type="button" onclick={toggleBold} class="toolbar-btn" class:active={isBold} title="Bold">B</button>
        <button type="button" onclick={toggleItalic} class="toolbar-btn" class:active={isItalic} title="Italic">I</button>
        <button type="button" onclick={toggleUnderline} class="toolbar-btn" class:active={isUnderline} title="Underline">U</button>
        <button type="button" onclick={toggleStrike} class="toolbar-btn" class:active={isStrike} title="Strikethrough">S</button>
      </div>

      <div class="flex items-center gap-1 pr-2 border-r border-gray-300 dark:border-gray-600">
        <button type="button" onclick={toggleBulletList} class="toolbar-btn" class:active={isBulletList} title="Bullet List">•</button>
        <button type="button" onclick={toggleOrderedList} class="toolbar-btn" class:active={isOrderedList} title="Numbered List">1.</button>
        <button type="button" onclick={toggleBlockquote} class="toolbar-btn" class:active={isBlockquote} title="Quote">"</button>
      </div>

      {#if onsave}
        <button type="button" onclick={handleSave} class="ml-auto toolbar-btn-primary" title="Save">Save</button>
      {/if}
    </div>
  {/if}

  <div
    bind:this={editorElement}
    class="editor-content prose prose-sm dark:prose-invert max-w-none p-4 overflow-y-auto"
    style="min-height: {minHeight};"
  >
    {#if !editor}
      <textarea
        bind:value={content}
        oninput={handleTextareaInput}
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
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 4px;
    color: var(--color-gray-600);
    transition: all 0.15s;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .toolbar-btn:hover {
    background: var(--color-gray-200);
    color: var(--color-gray-900);
  }

  .toolbar-btn.active {
    background: var(--color-blue-100);
    color: var(--color-blue-600);
  }

  .toolbar-btn-primary {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border-radius: 4px;
    background: var(--color-blue-500);
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    transition: background 0.15s;
    border: none;
    cursor: pointer;
  }

  .toolbar-btn-primary:hover {
    background: var(--color-blue-600);
  }

  .toolbar-select {
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid var(--color-gray-300);
    background: white;
    font-size: 0.875rem;
  }

  .editor-content :global(.ProseMirror) {
    outline: none;
    min-height: inherit;
  }
</style>
