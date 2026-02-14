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
      case 'error': return 'i-lucide-x-circle text-danger';
      case 'warning': return 'i-lucide-alert-triangle text-warning';
      case 'info': return 'i-lucide-info text-info';
      case 'hint': return 'i-lucide-lightbulb text-info';
      default:return 'i-lucide-circle text-sand/60';
    }
  }

  function getSeverityBg(severity: ASTError['severity']): string {
    switch (severity) {
      case 'error': return 'bg-danger/5 dark:bg-danger/10 border-danger/20 dark:border-danger/30';
      case 'warning': return 'bg-warning/5 dark:bg-warning/20/20 border-warning/20 dark:border-warning';
      case 'info': return 'bg-info/5 dark:bg-info/10 border-info/20 dark:border-info/30';
      case 'hint': return 'bg-info/5 dark:bg-info/20/20 border-info/20';
      default:return 'bg-sand/5 dark:bg-panel/20 border-sand/20 dark:border-sand/20';
    }
  }

  const errorCounts = $derived({
    error: errors.filter(e => e.severity === 'error').length,
    warning: errors.filter(e => e.severity === 'warning').length,
    info: errors.filter(e => e.severity === 'info').length,
    hint: errors.filter(e => e.severity === 'hint').length
  });
</script>

<div class="flex flex-col h-full">
  <!-- Header with counts -->
  <div class="flex items-center gap-4 px-4 py-2 border-b border-sand/20 dark:border-sand/20 bg-sand/5 dark:bg-panelSoft">
    <h3 class="font-medium text-sand dark:text-sand/20">Problems</h3>
    <div class="flex items-center gap-3 text-sm">
      {#if errorCounts.error > 0}
        <span class="flex items-center gap-1 text-danger dark:text-danger/80">
          <span class="i-lucide-x-circle"></span>
          {errorCounts.error}
        </span>
      {/if}
      {#if errorCounts.warning > 0}
        <span class="flex items-center gap-1 text-warning dark:text-warning">
          <span class="i-lucide-alert-triangle"></span>
          {errorCounts.warning}
        </span>
      {/if}
      {#if errorCounts.info > 0}
        <span class="flex items-center gap-1 text-info dark:text-info/80">
          <span class="i-lucide-info"></span>
          {errorCounts.info}
        </span>
      {/if}
    </div>
  </div>

  <!-- Error list -->
  <div class="flex-1 overflow-y-auto" style="max-height: {maxHeight}">
    {#if errors.length === 0}
      <div class="flex flex-col items-center justify-center py-8 text-sand/60">
        <span class="i-lucide-check-circle text-4xl text-accent mb-2"></span>
        <p>No problems detected</p>
      </div>
    {:else}
      <div class="divide-y divide-gray-200 dark:divide-sand/20">
        {#each errors as error (error.id)}
          <button
            type="button"
            class="w-full text-left px-4 py-3 hover:bg-sand/10 dark:hover:bg-panelSoft transition-colors {selectedErrorId === error.id ? 'bg-info/5 dark:bg-info/20/30' : ''}"
            onclick={() => onErrorClick?.(error)}
          >
            <div class="flex items-start gap-3">
              <!-- Severity icon -->
              <span class="{getSeverityIcon(error.severity)} text-lg flex-shrink-0 mt-0.5"></span>

              <!-- Error details -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs font-mono text-sand/60 dark:text-sand/40">
                    {error.code}
                  </span>
                  <span class="text-xs text-sand/40 dark:text-sand/60">
                    Ln {error.line},
	Col {error.column}
                  </span>
                </div>
                <p class="text-sm text-sand dark:text-sand/40 break-words">
                  {error.message}
                </p>
                {#if error.suggestion}
                  <p class="text-xs text-sand/60 dark:text-sand/40 mt-1 italic">
                    💡 {error.suggestion}
                  </p>
                {/if}
              </div>

              <!-- Navigate icon -->
              <span class="i-lucide-chevron-right text-sand/40 flex-shrink-0"></span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
