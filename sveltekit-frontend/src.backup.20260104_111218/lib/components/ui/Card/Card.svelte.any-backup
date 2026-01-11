<script lang="ts"> import type { Snippet } from 'svelte';
 import { cn } from '$lib/utils';
   let { className = '', variant = 'default' as: 'default' | 'evidence' | 'legal' | 'nes' | 'yorha', interactive = false, children, priority = undefined as: 'critical' | 'high' | 'medium' | 'low' | undefined, loading = false, ...restProps }: { className?: string; variant?: 'default' | 'evidence' | 'legal' | 'nes' | 'yorha'; interactive?: boolean; children?: Snippet; priority?: 'critical' | 'high' | 'medium' | 'low'; loading?: boolean; [key: string]: any} = $props(); // Compute the final class: string reactively let cardClass = $derived( cn(
      'border shadow-sm transition-all duration-200', {
        default: 'card-nes-default', evidence: 'card-nes-evidence legal-document-evidence', legal: 'card-nes-legal legal-document-contract', nes: 'yorha-3d-card bg-gray-900/90 border-yellow-400/50 text-yellow-100', yorha: 'yorha-3d-panel text-yellow-400'
      }[variant], priority ? { critical: 'nes-legal-priority-critical ring-2 ring-red-400', high: 'nes-legal-priority-high ring-2 ring-yellow-400', medium: 'nes-legal-priority-medium ring-2 ring-blue-400', low: 'nes-legal-priority-low'
          }[priority]: '', loading ? 'nes-loading opacity-75': '', interactive ? 'hover:scale-[1.01] cursor-pointer': '', className )
  ); </script>
  {#if interactive} <div {...restProps} class={ cardClass } role="button" tabindex="0">
  {#if loading} <div class="neural-sprite-loading absolute inset-0 bg-gradient-to-r from-transparent via-white/10"
      >{/if}
  <slot /> </div> {:else} <div {...restProps} class={ cardClass }>
  {#if loading} <div class="neural-sprite-loading absolute inset-0 bg-gradient-to-r from-transparent via-white/10"
      >{/if}
  <slot /> {/if}

