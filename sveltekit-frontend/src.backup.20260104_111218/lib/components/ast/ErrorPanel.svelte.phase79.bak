<script lang="ts">
 /**
 * Phase 74: Error Panel Component
 * Displays AST errors with severity icons and navigation
 */
 import type { ASTError } from '$lib/ast/svelte-check-analyzer';

 interface Props {
 errors: ASTError[];
 onErrorClick?: (error: ASTError) => void;
 selectedErrorId?: string;
 maxHeight?: string;
 }

 let { errors, onErrorClick, selectedErrorId, maxHeight = '300px' }: Props = $props();

 function getSeverityIcon(severity: ASTError['severity']): string {
 switch (severity) {
 case 'error': return 'i-lucide-x-circle text-red-500';
 case 'warning': return 'i-lucide-alert-triangle text-yellow-500';
 case 'info': return 'i-lucide-info text-blue-500';
 case 'hint': return 'i-lucide-lightbulb text-purple-500';
 default: return 'i-lucide-circle text-gray-500';
 }
 }

 function getSeverityBg(severity: ASTError['severity']): string {
 switch (severity) {
 case 'error': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
 case 'warning': return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
 case 'info': return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
 case 'hint': return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800';
 default: return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800';
 }
 }

 const errorCounts = $derived({
 error: errors.filter(e => e.severity === 'error').length,
 warning: errors.filter(e => e.severity === 'warning').length,
 info: errors.filter(e => e.severity === 'info').length,
 hint: errors.filter(e => e.severity === 'hint').length,
 });
</script>

<div class="flex flex-col h-full">
 <!-- Header with counts -->
 <div class="flex items-center gap-4 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
 <h3 class="font-medium text-gray-900 dark:text-gray-100">Problems</h3>
 <div class="flex items-center gap-3 text-sm">
 {#if errorCounts.error > 0}
 <span class="flex items-center gap-1 text-red-600 dark:text-red-400">
 <span class="i-lucide-x-circle"></span>
 {errorCounts.error}
 </span>
 {/if}
 {#if errorCounts.warning > 0}
 <span class="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
 <span class="i-lucide-alert-triangle"></span>
 {errorCounts.warning}
 </span>
 {/if}
 {#if errorCounts.info > 0}
 <span class="flex items-center gap-1 text-blue-600 dark:text-blue-400">
 <span class="i-lucide-info"></span>
 {errorCounts.info}
 </span>
 {/if}
 </div>
 </div>

 <!-- Error list -->
 <div class="flex-1 overflow-y-auto" style="max-height: {maxHeight}">
 {#if errors.length === 0}
 <div class="flex flex-col items-center justify-center py-8 text-gray-500">
 <span class="i-lucide-check-circle text-4xl text-green-500 mb-2"></span>
 <p>No problems detected</p>
 </div>
 {:else}
 <div class="divide-y divide-gray-200 dark:divide-gray-700">
 {#each errors as error (error.id)}
 <button
 type="button"
 class="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors {selectedErrorId === error.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''}"
 onclick={() => onErrorClick?.(error)}
 >
 <div class="flex items-start gap-3">
 <!-- Severity icon -->
 <span class="{getSeverityIcon(error.severity)} text-lg flex-shrink-0 mt-0.5"></span>

 <!-- Error details -->
 <div class="flex-1 min-w-0">
 <div class="flex items-center gap-2 mb-1">
 <span class="text-xs font-mono text-gray-500 dark:text-gray-400">
 {error.code}
 </span>
 <span class="text-xs text-gray-400 dark:text-gray-500">
 Ln {error.line}, Col {error.column}
 </span>
 </div>
 <p class="text-sm text-gray-800 dark:text-gray-200 break-words">
 {error.message}
 </p>
 {#if error.suggestion}
 <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
 💡 {error.suggestion}
 </p>
 {/if}
 </div>

 <!-- Navigate icon -->
 <span class="i-lucide-chevron-right text-gray-400 flex-shrink-0"></span>
 </div>
 </button>
 {/each}
 </div>
 {/if}
 </div>
</div>
