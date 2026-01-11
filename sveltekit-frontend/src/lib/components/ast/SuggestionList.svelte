<script lang="ts">
 /**
 * Phase 74: Suggestion List Component
 * Displays ranked suggestions with confidence scores and actions
 */
 import type { Suggestion } from '$lib/ast/suggestion-engine';
 import ClusterBadge from './ClusterBadge.svelte';

 interface Props {
 suggestions: Suggestion[];
 onApply?: (suggestion: Suggestion) => void;
 onDismiss?: (suggestion: Suggestion) => void;
 loading?: boolean;
 }

 let { suggestions, onApply, onDismiss, loading = false }: Props = $props();

 function getConfidenceColor(confidence: number): string {
 if (confidence >= 0.8) return 'text-green-500';
 if (confidence >= 0.6) return 'text-yellow-500';
 return 'text-orange-500';
 }

 function getConfidenceLabel(confidence: number): string {
 if (confidence >= 0.8) return 'High';
 if (confidence >= 0.6) return 'Medium';
 return 'Low';
 }

 function getSourceIcon(type: string): string {
 switch (type) {
 case 'rag': return 'i-lucide-database';
 case 'web': return 'i-lucide-globe';
 case 'ai': return 'i-lucide-sparkles';
 case 'local': return 'i-lucide-code';
 default: return 'i-lucide-circle';
 }
 }
</script>

<div class="space-y-3">
 {#if loading}
 <div class="flex items-center justify-center py-8">
 <div class="i-lucide-loader-2 animate-spin text-2xl text-gray-400"></div>
 <span class="ml-2 text-gray-500">Finding suggestions...</span>
 </div>
 {:else if suggestions.length === 0}
 <div class="py-8 text-center text-gray-500">
 <div class="i-lucide-lightbulb-off text-4xl mb-2 mx-auto opacity-50"></div>
 <p>No suggestions available</p>
 </div>
 {:else}
 {#each suggestions as suggestion (suggestion.id)}
 <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 transition-shadow hover:shadow-md">
 <!-- Header -->
 <div class="flex items-start justify-between gap-2 mb-2">
 <div class="flex items-center gap-2">
 <ClusterBadge cluster={suggestion.cluster} size="sm" />
 <h4 class="font-medium text-gray-900 dark:text-gray-100">
 {suggestion.title}
 </h4>
 </div>
 <div class="flex items-center gap-1 {getConfidenceColor(suggestion.confidence)}">
 <span class="text-xs font-medium">{getConfidenceLabel(suggestion.confidence)}</span>
 <span class="text-xs">({Math.round(suggestion.confidence * 100)}%)</span>
 </div>
 </div>

 <!-- Description -->
 <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
 {suggestion.description}
 </p>

 <!-- Code Preview -->
 {#if suggestion.code}
 <div class="mb-3 rounded bg-gray-100 dark:bg-gray-900 p-3 font-mono text-sm overflow-x-auto">
 <pre class="text-gray-800 dark:text-gray-200">{suggestion.code}</pre>
 </div>
 {/if}

 <!-- Sources -->
 <div class="flex items-center gap-2 mb-3 flex-wrap">
 <span class="text-xs text-gray-500">Sources:</span>
 {#each suggestion.sources as source}
 <span class="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
 <span class={getSourceIcon(source.type)}></span>
 {source.name}
 {#if source.url}
 <a href={source.url} target="_blank" rel="noopener" class="i-lucide-external-link text-blue-500 hover:text-blue-600"></a>
 {/if}
 </span>
 {/each}
 </div>

 <!-- Actions -->
 <div class="flex items-center gap-2">
 {#if suggestion.code && onApply}
 <button
 type="button"
 class="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors"
 onclick={() => onApply.suggestion}
 >
 <span class="i-lucide-check"></span>
 Apply Fix
 </button>
 {/if}
 {#if onDismiss}
 <button
 type="button"
 class="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 dark: text-gray-400, hover:text-gray-800 dark: hover, text-gray-200 border border-gray-300 dark:border-gray-600 rounded transition-colors"
 onclick={() => onDismiss.suggestion}
 >
 <span class="i-lucide-x"></span>
 Dismiss
 </button>
 {/if}
 </div>
 </div>
 {/each}
 {/if}
</div>
