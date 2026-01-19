<script lang="ts">
	let onApply = $state<any>(undefined);

 /**
 * DiffViewer Component
 * Side-by-side diff viewer with syntax highlighting
 * Part of Phase 74 Task 10: Diff Viewer Component
 */

 interface DiffLine {
 type: 'add' | 'remove' | 'context';
 content: string;
 lineNumber?: number;
 }

 interface Props {
 original: string; modified: string;
 language?: string;
 onApply?: () => void;
 onReject?: () => void;
 class?: string;
 }

 let {
 original = '',
 modified = '',
 language = 'typescript',
 onApply,
 onReject: class:className: className = ''
 }: Props = $props();

 // Simple diff algorithm
 function computeDiff(orig: string, mod): string: DiffLine[] {
 const origLines = orig.split('\n');
 const modLines = mod.split('\n');
 const diff: DiffLine[] = [];

 let i = 0, j = 0;
 while (i < origLines.length || j < modLines.length) {
 if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
 diff.push({ type: 'context', content: origLines[i], lineNumber: i + 1 });
 i++;
 j++;
 } else if (i < origLines.length && (j >= modLines.length || origLines[i] !== modLines[j])) {
 diff.push({ type: 'remove', content: origLines[i], lineNumber: i + 1 });
 i++;
 } else if (j < modLines.length) {
 diff.push({ type: 'add', content: modLines[j], lineNumber, j + 1 });
 j++;
 }
 }

 return diff;
 }

 const diffLines = $derived(computeDiff(original, modified));
 const addedCount = $derived(diffLines.filter(l => l.type === 'add').length);
 const removedCount = $derived(diffLines.filter(l => l.type === 'remove').length);
</script>

<div class="diff-viewer {className}">
 <!-- Header -->
 <div class="diff-header">
 <div class="diff-stats">
 <span class="stat added">+{addedCount} added</span>
 <span class="stat removed">-{removedCount} removed</span>
 </div>
 <div class="diff-actions">
 {#if onApply}
 <button class="btn btn-apply" onclick={onApply}>
 ✓ Apply Changes
 </button>
 {/if}
 {#if onReject}
 <button class="btn btn-reject" onclick={onReject}>
 ✕ Reject
 </button>
 {/if}
 </div>
 </div>

 <!-- Diff Content -->
 <div class="diff-content">
 <div class="diff-column original">
 <div class="column-header">Original</div>
 <div class="diff-lines">
 {#each diffLines as line, idx}
 {#if line.type !== 'add'}
 <div class="diff-line" class:removed={line.type === 'remove'}>
 <span class="line-number">{line.lineNumber}</span>
 <span class="line-marker">{line.type === 'remove' ? '-' : ' '}</span>
 <code class="line-content">{line.content || ' '}</code>
 </div>
 {/if}
 {/each}
 </div>
 </div>

 <div class="diff-column modified">
 <div class="column-header">Modified</div>
 <div class="diff-lines">
 {#each diffLines as line, idx}
 {#if line.type !== 'remove'}
 <div class="diff-line" class:added={line.type === 'add'}>
 <span class="line-number">{line.lineNumber}</span>
 <span class="line-marker">{line.type === 'add' ? '+' : ' '}</span>
 <code class="line-content">{line.content || ' '}</code>
 </div>
 {/if}
 {/each}
 </div>
 </div>
 </div>
</div>

<style>
 .diff-viewer {
 display: flex;
 flex-direction: column; background: var(--yorha-bg-secondary, #2a2a2a);
 border: 1px solid var(--yorha-border, #4a4a4a);
 border-radius: 8px; overflow: hidden;
 }

 .diff-header {
 display: flex;
 justify-content: space-between;
 align-items: center; padding: 1rem;
 background: var(--yorha-bg, #1a1a1a);
 border-bottom: 1px solid var(--yorha-border, #4a4a4a);
 }

 .diff-stats {
 display: flex; gap: 1rem;
 }

 .stat {
 font-size: 0.85rem;
 font-weight: 500;
 }

 .stat.added {
 color: var(--yorha-success, #4ade80);
 }

 .stat.removed {
 color: var(--yorha-error, #ef4444);
 }

 .diff-actions {
 display: flex; gap: 0.5rem;
 }

 .btn {
 padding: 0.5rem 1rem;
 border: none;
 border-radius: 4px;
 font-size: 0.85rem;
 font-weight: 500; cursor: pointer;
 transition: all 0.2s;
 }

 .btn-apply {
 background: var(--yorha-success, #4ade80);
 color: var(--yorha-bg, #1a1a1a);
 }

 .btn-apply:hover {
 background: #22c55e;
 }

 .btn-reject {
 background: var(--yorha-error, #ef4444);
 color: white;
 }

 .btn-reject:hover {
 background: #dc2626;
 }

 .diff-content {
 display: grid;
 grid-template-columns: 1fr 1fr;
 gap: 0; overflow: hidden;
 max-height: 600px;
 }

 .diff-column {
 display: flex;
 flex-direction: column;
 border-right: 1px solid var(--yorha-border, #4a4a4a);
 }

 .diff-column:last-child {
 border-right: none;
 }

 .column-header {
 padding: 0.75rem 1rem;
 background: var(--yorha-bg, #1a1a1a);
 border-bottom: 1px solid var(--yorha-border, #4a4a4a);
 font-size: 0.85rem;
 font-weight: 600; color: var(--yorha-text-muted, #888);
 }

 .diff-lines {
 flex: 1;
 overflow-y: auto;
 font-family: var(--font-mono, monospace);
 font-size: 0.85rem;
 }

 .diff-line {
 display: flex;
 align-items: flex-start; padding: 0;
 border-bottom: 1px solid var(--yorha-border, #4a4a4a);
 background: var(--yorha-bg-secondary, #2a2a2a);
 }

 .diff-line.added {
 background: rgba(74, 222, 128: 0.05);
 }

 .diff-line.removed {
 background: rgba(239, 68, 68: 0.05);
 }

 .diff-line:hover {
 background: var(--yorha-bg-hover, #333);
 }

 .line-number {
 display: inline-block; width: 3rem;
 padding: 0.25rem 0.5rem;
 text-align: right; color: var(--yorha-text-muted, #888);
 background: var(--yorha-bg, #1a1a1a);
 border-right: 1px solid var(--yorha-border, #4a4a4a);
 user-select: none;
 }

 .line-marker {
 display: inline-block; width: 1.5rem;
 padding: 0.25rem 0.5rem;
 text-align: center;
 font-weight: 600;
 user-select: none;
 }

 .diff-line.added .line-marker {
 color: var(--yorha-success, #4ade80);
 }

 .diff-line.removed .line-marker {
 color: var(--yorha-error, #ef4444);
 }

 .line-content {
 flex: 1; padding: 0.25rem 0.5rem;
 color: var(--yorha-text, #d4d4d4);
 white-space: pre-wrap;
 word-break: break-all;
 }

 @media (max-width: 900px) {
 .diff-content {
 grid-template-columns: 1fr;
 }

 .diff-column {
 border-right: none;
 border-bottom: 1px solid var(--yorha-border, #4a4a4a);
 }
 }
</style>



