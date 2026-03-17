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

// Sync initialContent changes into existing editor instance
$effect(() => {
	if (editor && initialContent != null) {
		const currentHtml = editor.getHTML();
		if (initialContent !== currentHtml) {
			editor.commands.setContent(initialContent as string, { emitUpdate: false });
		}
	}
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

<div class="report-editor-shell flex h-full min-h-[500px] flex-col overflow-hidden rounded-xl border border-neutral-300 bg-white text-neutral-900 shadow-sm">
<!-- Toolbar -->
{#if !readOnly}
<div class="editor-toolbar flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-neutral-100 p-2">
<Button variant="ghost" size="sm"
class={`toolbar-button ${isActive.bold ? 'toolbar-button-active' : ''}`}
onclick={() => editor?.chain().focus().toggleBold().run()}
>
<span class="i-lucide-bold w-4 h-4 inline-block"></span>
</Button>
<Button variant="ghost" size="sm"
class={`toolbar-button ${isActive.italic ? 'toolbar-button-active' : ''}`}
onclick={() => editor?.chain().focus().toggleItalic().run()}
>
<span class="i-lucide-italic w-4 h-4 inline-block"></span>
</Button>

<div class="mx-1 h-6 w-px bg-neutral-300"></div>

<Button variant="ghost" size="sm"
class={`toolbar-button ${isActive.h1 ? 'toolbar-button-active' : ''}`}
onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
>
<span class="i-lucide-heading-1 w-4 h-4 inline-block"></span>
</Button>
<Button variant="ghost" size="sm"
class={`toolbar-button ${isActive.h2 ? 'toolbar-button-active' : ''}`}
onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
>
<span class="i-lucide-heading-2 w-4 h-4 inline-block"></span>
</Button>

<div class="mx-1 h-6 w-px bg-neutral-300"></div>

<Button variant="ghost" size="sm"
class={`toolbar-button ${isActive.bullet ? 'toolbar-button-active' : ''}`}
onclick={() => editor?.chain().focus().toggleBulletList().run()}
>
<span class="i-lucide-list w-4 h-4 inline-block"></span>
</Button>
<Button variant="ghost" size="sm"
class={`toolbar-button ${isActive.ordered ? 'toolbar-button-active' : ''}`}
onclick={() => editor?.chain().focus().toggleOrderedList().run()}
>
<span class="i-lucide-list-ordered w-4 h-4 inline-block"></span>
</Button>

<div class="flex-1"></div>

<Button variant="outline" size="sm"
class="ai-trigger gap-2"
onclick={() => showAiMenu = !showAiMenu}
>
<span class="i-lucide-wand-2 w-3.5 h-3.5 inline-block"></span>
AI Assistant
</Button>

<Button variant="default" size="sm"
class="save-trigger gap-2 min-w-[100px]"
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
<div class="border-b border-neutral-200 bg-neutral-100 p-3" transition:slide>
<div class="flex gap-2">
<input
type="text"
class="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
placeholder="Ask AI to draft a section, summarize, or improved phrasing..."
bind:value={aiPrompt}
onkeydown={(e) => e.key === 'Enter' && runAiCommand()}
/>
<Button size="sm" class="generate-trigger" onclick={runAiCommand} disabled={isGenerating || !aiPrompt}>
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
<div class="relative flex-1 overflow-hidden bg-white">
<div bind:this={element} class="h-full max-w-none overflow-y-auto px-8 py-6 prose text-neutral-900 focus:outline-none"></div>
</div>

<!-- Status Bar -->
<div class="flex items-center justify-between border-t border-neutral-200 bg-neutral-100 px-3 py-1.5 text-xs text-neutral-500">
<div class="flex items-center gap-3">
<span>{wordCount} words</span>
{#if lastSaved}
<span class="flex items-center gap-1 text-neutral-700">
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
:global(.toolbar-button) {
color: #525252;
}

:global(.toolbar-button:hover),
:global(.toolbar-button:focus-visible),
:global(.toolbar-button-active) {
background: #e5e7eb !important;
color: #111827 !important;
}

:global(.ai-trigger) {
background: #ffffff !important;
border-color: #d4d4d8 !important;
color: #374151 !important;
}

:global(.ai-trigger:hover) {
background: #f5f5f5 !important;
color: #111827 !important;
}

:global(.save-trigger),
:global(.generate-trigger) {
background: #171717 !important;
border-color: #171717 !important;
color: #ffffff !important;
}

:global(.save-trigger:hover),
:global(.generate-trigger:hover) {
background: #000000 !important;
}

:global(.ProseMirror) {
outline: none;
min-height: 100%;
color: #111827;
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
color: #111827;
}
:global(.ProseMirror h2) {
font-size: 1.4em;
font-weight: 600;
margin-top: 1em;
margin-bottom: 0.5em;
color: #374151;
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
