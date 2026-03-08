<script lang="ts">
import { Editor } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { slide } from 'svelte/transition';

import Button from '$lib/components/ui/Button.svelte';

interface Props {
	initialContent?: string;
	placeholder?: string;
	readOnly?: boolean;
	onSave?: (content: string) => Promise<void>;
	onAutoSave?: (content: string) => void;
	onUpdate?: (content: string) => void;
}

let {
	initialContent = '',
	placeholder = 'Write something amazing...',
	readOnly = false,
	onSave,
	onAutoSave,
	onUpdate
}: Props = $props();

// State
let element = $state<HTMLElement>();
let editor = $state<Editor>();
let wordCount = $state(0);
let isSaving = $state(false);
let lastSaved = $state<Date | null>(null);
let showAiMenu = $state(false);
let aiPrompt = $state('');
let isGenerating = $state(false);

// Derived
let isActive = $derived({
bold: editor?.isActive('bold') ?? false,
italic: editor?.isActive('italic') ?? false,
h1: editor?.isActive('heading', { level: 1 }) ?? false,
h2: editor?.isActive('heading', { level: 2 }) ?? false,
bullet: editor?.isActive('bulletList') ?? false,
ordered: editor?.isActive('orderedList') ?? false,
});

$effect(() => {
	if (!element) return;

	editor = new Editor({
		element,
		editable: !readOnly,
		extensions: [
			StarterKit,
			Placeholder.configure({ placeholder })
		],
		content: initialContent,
		onUpdate: ({ editor }) => {
			const text = editor.getText();
			wordCount = text.trim().split(/\s+/).filter(Boolean).length;

			// Debounced autosave
			if (onAutoSave) {
				onAutoSave(editor.getHTML());
			}
			if (onUpdate) {
				onUpdate(editor.getHTML());
			}
		}
	});

	return () => {
		editor?.destroy();
	};
});

async function handleSave() {
if (!editor || !onSave) return;

isSaving = true;
try {
await onSave(editor.getHTML());
lastSaved = new Date();
} finally {
setTimeout(() => isSaving = false, 500);
}
}

async function runAiCommand() {
if (!aiPrompt.trim() || !editor) return;

isGenerating = true;
try {
// Get current editor context for better AI responses
const currentText = editor.getText().slice(0, 2000);
const contextPrompt = currentText.length > 50
	? `Legal document context:\n${currentText}\n\nUser request: ${aiPrompt}`
	: `Legal writing request: ${aiPrompt}`;

// Call Ollama API
const res = await fetch('/api/chat', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		model: 'gemma3-legal:latest',
		prompt: contextPrompt,
		stream: false,
		options: { temperature: 0.7, num_predict: 512 }
	}),
	signal: AbortSignal.timeout(30000)
});

if (res.ok) {
	const data = await res.json();
	const generatedText = data.response?.trim() ?? '';

	if (generatedText.length > 0) {
		editor.chain().focus().insertContent(`\n\n${generatedText}\n\n`).run();
	}
} else {
	// Fallback if Ollama unavailable
	const fallbackText = `\n\n[AI assistant temporarily unavailable. Original request: "${aiPrompt}"]\n\n`;
	editor.chain().focus().insertContent(fallbackText).run();
}

aiPrompt = '';
showAiMenu = false;
} catch (err) {
console.error('[TiptapAI] Error:', err);
// Insert placeholder on error
editor?.chain().focus().insertContent(`\n\n[AI generation failed. Please try again.]\n\n`).run();
aiPrompt = '';
showAiMenu = false;
} finally {
isGenerating = false;
}
}

function formatTime(d: Date) {
return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

</script>

<div class="border rounded-xl bg-background shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]">
<!-- Toolbar -->
{#if !readOnly}
<div class="border-b bg-muted/40 p-2 flex items-center gap-1 flex-wrap">
<Button variant="ghost" size="sm"
class={isActive.bold ? "bg-muted" : ""}
onclick={() => editor?.chain().focus().toggleBold().run()}
>
<span class="i-lucide-bold w-4 h-4 inline-block"></span>
</Button>
<Button variant="ghost" size="sm"
class={isActive.italic ? "bg-muted" : ""}
onclick={() => editor?.chain().focus().toggleItalic().run()}
>
<span class="i-lucide-italic w-4 h-4 inline-block"></span>
</Button>

<div class="w-px h-6 bg-border mx-1"></div>

<Button variant="ghost" size="sm"
class={isActive.h1 ? "bg-muted" : ""}
onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
>
<span class="i-lucide-heading-1 w-4 h-4 inline-block"></span>
</Button>
<Button variant="ghost" size="sm"
class={isActive.h2 ? "bg-muted" : ""}
onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
>
<span class="i-lucide-heading-2 w-4 h-4 inline-block"></span>
</Button>

<div class="w-px h-6 bg-border mx-1"></div>

<Button variant="ghost" size="sm"
class={isActive.bullet ? "bg-muted" : ""}
onclick={() => editor?.chain().focus().toggleBulletList().run()}
>
<span class="i-lucide-list w-4 h-4 inline-block"></span>
</Button>
<Button variant="ghost" size="sm"
class={isActive.ordered ? "bg-muted" : ""}
onclick={() => editor?.chain().focus().toggleOrderedList().run()}
>
<span class="i-lucide-list-ordered w-4 h-4 inline-block"></span>
</Button>

<div class="flex-1"></div>

<Button variant="outline" size="sm"
class="gap-2 text-indigo-400 border-info/30 hover:bg-info/10"
onclick={() => showAiMenu = !showAiMenu}
>
<span class="i-lucide-wand-2 w-3.5 h-3.5 inline-block"></span>
AI Assistant
</Button>

<Button variant="default" size="sm"
class="gap-2 min-w-[100px]"
onclick={handleSave}
disabled={isSaving}
>
{#if isSaving}
<span class="i-lucide-loader-2 w-3.5 h-3.5 animate-spin inline-block"></span>
Saving
{:else}
<span class="i-lucide-save w-3.5 h-3.5 inline-block"></span>
Save
{/if}
</Button>
</div>
{/if}

<!-- AI Menu -->
{#if showAiMenu}
<div class="bg-indigo-950/30 border-b border-info/20 p-3" transition:slide>
<div class="flex gap-2">
<input
type="text"
class="flex-1 bg-background border rounded-md px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
placeholder="Ask AI to draft a section, summarize, or improved phrasing..."
bind:value={aiPrompt}
onkeydown={(e) => e.key === 'Enter' && runAiCommand()}
/>
<Button size="sm" onclick={runAiCommand} disabled={isGenerating || !aiPrompt}>
{#if isGenerating}
<span class="i-lucide-loader-2 w-3.5 h-3.5 animate-spin p-0 inline-block"></span>
{:else}
Generate
{/if}
</Button>
</div>
</div>
{/if}

<!-- Editor Area -->
<div class="flex-1 overflow-hidden relative bg-editor-bg">
<div bind:this={element} class="h-full overflow-y-auto px-8 py-6 prose prose-invert max-w-none focus:outline-none"></div>
</div>

<!-- Status Bar -->
<div class="border-t bg-muted/20 px-3 py-1.5 flex items-center justify-between text-xs text-muted-foreground">
<div class="flex items-center gap-3">
<span>{wordCount} words</span>
{#if lastSaved}
<span class="flex items-center gap-1 text-accent">
<span class="i-lucide-check w-3 h-3 inline-block"></span>
Saved {formatTime(lastSaved)}
</span>
{:else}
<span class="italic">Unsaved changes</span>
{/if}
</div>
<div>
Markdown Supported
</div>
</div>
</div>

<style>
:global(.ProseMirror) {
outline: none;
min-height: 100%;
}
:global(.ProseMirror p.is-editor-empty:first-child::before) { color: #64748b;
		content: attr(data-placeholder);
float: left;
height: 0;
pointer-events: none;
}
:global(.ProseMirror h1) {
font-size: 1.8em;
font-weight: 700;
margin-bottom: 0.5em;
color: #f8fafc;
}
:global(.ProseMirror h2) {
font-size: 1.4em;
font-weight: 600;
margin-top: 1em;
margin-bottom: 0.5em;
color: #e2e8f0;
}
:global(.ProseMirror ul) {
list-style-type: disc;
padding-left: 1.5em;
}
:global(.ProseMirror ol) {
list-style-type: decimal;
padding-left: 1.5em;
}
</style>
