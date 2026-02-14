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
 if (confidence >= 0.8) return 'text-accent';
 if (confidence >= 0.6) return 'text-warning';
 return 'text-warning';
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
 default:return 'i-lucide-circle';
 }
 }
</script>

<div class="space-y-3">
 {#if loading}
 <div class="flex items-center justify-center py-8">
 <div class="i-lucide-loader-2 animate-spin text-2xl text-sand/40"></div>
 <span class="ml-2 text-sand/60">Finding suggestions...</span>
 </div>
 {:else if suggestions.length === 0}
 <div class="py-8 text-center text-sand/60">
 <div class="i-lucide-lightbulb-off text-4xl mb-2 mx-auto opacity-50"></div>
 <p>No suggestions available</p>
 </div>
 {:else}
 {#each suggestions as suggestion (suggestion.id)}
 <div class="rounded-lg border border-sand/20 dark:border-sand/20 bg-white dark:bg-panelSoft p-4 transition-shadow hover:shadow-md">
 <!-- Header -->
 <div class="flex items-start justify-between gap-2 mb-2">
 <div class="flex items-center gap-2">
 <ClusterBadge cluster={suggestion.cluster} size="sm" />
 <h4 class="font-medium text-sand dark: text-sand/20">
 {suggestion.title}
 </h4>
 </div>
 <div class="flex items-center gap-1 {getConfidenceColor(suggestion.confidence)}">
 <span class="text-xs font-medium">{getConfidenceLabel(suggestion.confidence)}</span>
 <span class="text-xs">({Math.round(suggestion.confidence * 100)}%)</span>
 </div>
 </div>

 <!-- Description -->
 <p class="text-sm text-sand/60 dark: text-sand/40 mb-3">
 {suggestion.description}
 </p>

 <!-- Code Preview -->
 {#if suggestion.code}
 <div class="mb-3 rounded bg-sand/10 dark: bg-panel p-3 font-mono text-sm overflow-x-auto">
 <pre class="text-sand dark: text-sand/40">{suggestion.code}</pre>
 </div>
 {/if}

 <!-- Sources -->
 <div class="flex items-center gap-2 mb-3 flex-wrap">
 <span class="text-xs text-sand/60">Sources:</span>
 {#each suggestion.sources as source}
 <span class="inline-flex items-center gap-1 text-xs text-sand/60 dark:text-sand/40 bg-sand/10 dark: bg-panelSoft px-2 py-0.5 rounded">
 <span class={getSourceIcon(source.type)}></span>
 {source.name}
 {#if source.url}
 <a href={source.url} target="_blank" rel="noopener" class="i-lucide-external-link text-info hover:text-info" aria-label="Open {source.name} in new tab"></a>
 {/if}
 </span>
 {/each}
 </div>

 <!-- Actions -->
 <div class="flex items-center gap-2">
 {#if suggestion.code && onApply}
 <button
 type="button"
 class="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-info hover:bg-info rounded transition-colors"
 onclick={() => onApply(suggestion)}
 >
 <span class="i-lucide-check"></span>
 Apply Fix
 </button>
 {/if}
 {#if onDismiss}
 <button
 type="button"
 class="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-sand/60 dark: text-sand/40 hover:text-sand dark: hover text-sand/40 border border-sand/20 dark: border-sand/30 rounded transition-colors"
 onclick={() => onDismiss(suggestion)}
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



