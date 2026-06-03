# TipTap Editor Enhancement Plan

## Goal
Upgrade `RichTextEditor.svelte` into a Word-like document editor with drag-drop file import, resizable editor area, and richer formatting toolbar.

## Current State
- **4 TipTap editors exist** — `RichTextEditor.svelte` is the most feature-rich (Image, Placeholder, StarterKit)
- **Used in**: `cases/[id]`, `reports/[id]/edit`, `cases/[id]/reports`
- **Installed packages**: `@tiptap/core@3.0.7`, `@tiptap/starter-kit@3.13.0`, `@tiptap/extension-image@3.20.4`, `@tiptap/extension-placeholder@3.17.1`
- **Already bundled via StarterKit**: `@tiptap/extension-link@3.13.0`, `@tiptap/extension-underline@3.13.0`

## Target: Enhance `RichTextEditor.svelte`

### Feature 1: Drag-and-Drop File Import (.txt, .md, .html)
- Add `ondragover`/`ondragleave`/`ondrop` handlers to the editor wrapper
- On drop of `.txt`/`.md`/`.html` files: read via FileReader, insert as editor content
- On drop of images: convert to base64, insert via `setImage()`
- Visual drag overlay with "Drop file to insert" indicator

### Feature 2: Resizable Editor Area
- Add CSS `resize: vertical` on the editor wrapper with `overflow: auto`
- Set `min-height: 300px`, no max-height (user controls size)
- Optional: drag handle at bottom-right corner for visual affordance

### Feature 3: Word-Like Toolbar Expansion
Add these controls to the existing toolbar (all available via StarterKit or already-installed extensions):
- **Underline** (via StarterKit's bundled `@tiptap/extension-underline`)
- **Strikethrough** (already in StarterKit)
- **Blockquote** (already in StarterKit)
- **Code block** (already in StarterKit)
- **Horizontal rule** (already in StarterKit)
- **Undo/Redo** (already in StarterKit)
- **Link** (via StarterKit's bundled `@tiptap/extension-link`)

### Feature 4: Status Bar
- Word count + character count
- Current formatting indicator
- File import status feedback

## Files Modified
1. `src/lib/components/ui/RichTextEditor.svelte` — Main enhancement target

## No New Dependencies Required
All extensions are already installed via `@tiptap/starter-kit@3.13.0` (which bundles link, underline, code-block, blockquote, etc.)

## Approach
Single file edit to `RichTextEditor.svelte` — enhance the existing component rather than creating a new one. The component keeps backward-compatible props.