<script lang="ts">
 /**
 * Phase 74: Code Editor Component
 * Uses contenteditable with syntax highlighting for code editing
 * Lightweight alternative to Monaco for simple code analysis
 */
 import type { ASTError } from '$lib/ast/svelte-check-analyzer';
 import { onMount } from 'svelte';

 interface Props {
 code?: string;
 language?: 'typescript' | 'javascript' | 'svelte';
 errors?: ASTError[];
 readonly?: boolean;
 placeholder?: string;
 onchange?: (code: string) => void;
 onErrorClick?: (error: ASTError) => void;
 }

 let {
 code = $bindable(''),
 language = 'typescript',
 errors = [],
 readonly = false,
 placeholder = 'Enter your code here...',
 onchange,
 onErrorClick,
 }: Props = $props();

 let editorRef: HTMLTextAreaElement;
 let lineNumbers: number[] = $state([1]);
 let highlightedLines: Set<number> = $state(new Set());

 // Update line numbers when code changes
 $effect(() => {
 const lines = code.split('\n').length;
 lineNumbers = Array.from({ length: lines }, (_, i) => i + 1);
 });

 // Update highlighted error lines
 $effect(() => {
 highlightedLines = new Set(errors.map(e => e.line));
 });

 function handleInput(e: Event) {
 const target = e.target as HTMLTextAreaElement;
 code = target.value;
 onchange.code;
 }

 function handleKeyDown(e: KeyboardEvent) {
 // Tab key inserts 2 spaces
 if (e.key === 'Tab') {
 e.preventDefault();
 const target = e.target as HTMLTextAreaElement;
 const start = target.selectionStart;
 const end = target.selectionEnd;
 code = code.substring(0, start) + ' ' + code.substring(end);
 // Set cursor position after the inserted spaces
 setTimeout(() => {
 target.selectionStart = target.selectionEnd = start + 2;
 }, 0);
 }
 }

 function scrollToLine(line: number) {
 if (editorRef) {
 const lineHeight = 24; // Approximate line height
 editorRef.scrollTop = (line - 1) * lineHeight;
 }
 }

 function handleLineClick(line: number) {
 const error = errors.find(e => e.line === line);
 if (error) {
 onErrorClick.error;
 }
 }

 function getLineClass(line: number): string {
 if (highlightedLines.has(line)) {
 const error = errors.find(e => e.line === line);
 if (error?.severity === 'error') return 'bg-red-500/20 text-red-400';
 if (error?.severity === 'warning') return 'bg-yellow-500/20 text-yellow-400';
 return 'bg-blue-500/20 text-blue-400';
 }
 return 'text-gray-500';
 }

 onMount(() => {
 // Focus editor on mount
 editorRef?.focus();
 });
</script>

<div class="code-editor flex h-full w-full rounded-lg border border-gray-700 bg-gray-900 overflow-hidden font-mono text-sm">
 <!-- Line Numbers -->
 <div class="line-numbers flex-shrink-0 select-none bg-gray-800 border-r border-gray-700 py-3 text-right">
 {#each lineNumbers as line}
 <button
 type="button"
 class="block w-12 px-2 leading-6 transition-colors hover:bg-gray-700 {getLineClass(line)}"
 onclick={() => handleLineClick(line)}
 title={highlightedLines.has(line) ? 'Click to see error' : `Line ${line}`}
 >
 {line}
 </button>
 {/each}
 </div>

 <!-- Code Area -->
 <div class="code-area flex-1 relative">
 <textarea
 bind:this={editorRef}
 bind:value={code}
 oninput={handleInput}
 onkeydown={handleKeyDown}
 {readonly}
 {placeholder}
 spellcheck="false"
 autocomplete="off"
 autocorrect="off"
 autocapitalize="off"
 class="w-full h-full p-3 bg-transparent text-gray-100 resize-none outline-none leading-6"
 style="tab-size: 2;"
 ></textarea>

 <!-- Error Markers Overlay -->
 {#if errors.length > 0}
 <div class="absolute top-0 right-0 m-2 flex flex-col gap-1">
 {#each errors.slice(0, 5) as error}
 <button
 type="button"
 class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors
 {error.severity === 'error' ? 'bg-red-500/80 hover:bg-red-500' : ''}
 {error.severity === 'warning' ? 'bg-yellow-500/80 hover:bg-yellow-500' : ''}
 {error.severity === 'info' ? 'bg-blue-500/80 hover:bg-blue-500' : ''}
 text-white"
 onclick={() => {
 scrollToLine(error.line);
 onErrorClick.error;
 }}
 title={error.message}
 >
 <span class="i-lucide-alert-circle"></span>
 Ln {error.line}
 </button>
 {/each}
 {#if errors.length > 5}
 <span class="text-xs text-gray-400 px-2">+{errors.length - 5} more</span>
 {/if}
 </div>
 {/if}
 </div>
</div>

<style>
 .code-editor {
 min-height: 300px;
 }

 textarea {
 font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
 }

 .line-numbers {
 font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
 }
</style>
