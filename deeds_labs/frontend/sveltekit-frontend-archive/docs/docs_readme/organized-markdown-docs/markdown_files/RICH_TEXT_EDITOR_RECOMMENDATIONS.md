# Rich Text Editor Recommendations for SvelteKit

## Requirements Met
- ✅ Lightweight & MIT licensed
- ✅ No Virtual DOM (works with Svelte's real DOM)
- ✅ SvelteKit compatible
- ✅ Works with UnoCSS
- ✅ Compatible with bits-ui/melt-ui

## Top Recommendations

### 1. **Svelte-TipTap** (RECOMMENDED)
```bash
npm install @tiptap/core @tiptap/starter-kit @tiptap/extension-placeholder
npm install svelte-tiptap
```

**Pros:**
- Built specifically for Svelte
- Uses TipTap (MIT license)
- Excellent UnoCSS integration
- No VDOM conflicts
- Extensible with plugins
- Great for legal documents (table support, document structure)

**Example Usage:**
```typescript
// lib/components/RichTextEditor.svelte
<script lang="ts">
  import { Editor } from 'svelte-tiptap';
  import StarterKit from '@tiptap/starter-kit';
  import Placeholder from '@tiptap/extension-placeholder';

  export let content = '';

  const extensions = [
    StarterKit,
    Placeholder.configure({
      placeholder: 'Write your legal document...'
    })
  ];
</script>

<div class="prose max-w-none">
  <Editor bind:content {extensions} class="min-h-[400px] p-4" />
</div>
```

### 2. **Milkdown**
```bash
npm install @milkdown/core @milkdown/preset-commonmark @milkdown/theme-nord
```

**Pros:**
- Plugin-based architecture
- Excellent TypeScript support
- WYSIWYG + Markdown modes
- MIT licensed
- Great for structured documents

### 3. **Quill with Svelte Wrapper**
```bash
npm install quill svelte-quill
```

**Pros:**
- Battle-tested in production
- Extensive customization
- Good performance
- Active community

## Integration with Your Stack

### UnoCSS Integration
```typescript
// In your editor component
<div class="
  prose prose-lg
  border border-gray-200 rounded-lg
  focus-within:border-blue-500
  transition-colors
">
  <Editor {extensions} />
</div>
``
```

## Legal Document Features

For your legal app, consider these extensions:

```typescript
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';

const extensions = [
  StarterKit,
  Table.configure({
    resizable: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
  TextStyle,
  Color,
  Highlight.configure({
    multicolor: true,
  }),
];
```

## Final Recommendation

**Use Svelte-TipTap** because:
1. Purpose-built for Svelte (no VDOM issues)
2. Excellent performance and bundle size
3. Perfect UnoCSS integration
4. Extensible for legal document features
5. Active development and community
6. MIT licensed
7. Works seamlessly with your current tech stack

Would you like me to create a complete RichTextEditor.svelte component with your styling system?


## bits-ui v2 Integration (Svelte 5)

bits-ui v2.0.0 is fully compatible with Svelte 5 and uses the new runes API.

### Key Changes from v1 to v2
- Use `$state()` instead of `let` for reactive variables
- Use `$props()` instead of `export let`
- Components use `.Root`, `.Trigger`, `.Content` pattern
- Use `{#snippet}` for render props instead of slots
- Event handlers use `onclick` not `on:click`

### Example: Custom Toolbar with bits-ui v2
```svelte
<script lang="ts">
  import { Toggle, Button, Tooltip } from 'bits-ui';

  let editor: any;
  let isBold = $state(false);
  let isItalic = $state(false);

  function toggleBold() {
    editor?.chain().focus().toggleBold().run();
    isBold = editor?.isActive('bold') ?? false;
  }

  function toggleItalic() {
    editor?.chain().focus().toggleItalic().run();
    isItalic = editor?.isActive('italic') ?? false;
  }
</script>

<div class="border-b p-2 flex gap-2">
  <Toggle.Root pressed={isBold} onPressedChange={toggleBold}>
    {#snippet children({ pressed })}
      <span class={pressed ? 'font-bold' : ''}>B</span>
    {/snippet}
  </Toggle.Root>

  <Toggle.Root pressed={isItalic} onPressedChange={toggleItalic}>
    {#snippet children({ pressed })}
      <span class={pressed ? 'italic' : ''}>I</span>
    {/snippet}
  </Toggle.Root>

  <Tooltip.Root>
    <Tooltip.Trigger>
      <Button.Root onclick={() => editor?.chain().focus().undo().run()}>
        Undo
      </Button.Root>
    </Tooltip.Trigger>
    <Tooltip.Content>
      Undo (Ctrl+Z)
    </Tooltip.Content>
  </Tooltip.Root>
</div>
```

### Import from Barrel Export
```typescript
// Option 1: Direct bits-ui import
import { Toggle, Button, Tooltip } from 'bits-ui';

// Option 2: Via UI barrel export
import { BitsToggle, BitsButton, BitsTooltip } from '$lib/components/ui';

// Option 3: Namespace import
import { Bits } from '$lib/components/ui';
// Then use: Bits.Toggle, Bits.Button, etc.
```
