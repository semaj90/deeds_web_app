<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';

  interface Props {
    open?: boolean;
    evidenceId?: string;
    title?: string;
    onClose?: () => void;
  }

  let { open = $bindable(false), evidenceId, title = 'Legal Analysis', onClose }: Props = $props();

  let dialogEl: HTMLDialogElement | undefined = $state(undefined);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let analysis = $state<{
    summary?: string;
    entities?: Array<{ type: string; value: string }>;
    forensics?: Array<{ type: string; severity: string; detail: string }>;
    confidence?: number;
  } | null>(null);

  // Sync open prop with native dialog
  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  async function runAnalysis() {
    if (!evidenceId) return;
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/evidence/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId, actions: ['entity_extraction', 'forensics', 'summarization'] })
      });
      if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
      const data = await res.json();
      analysis = data;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Analysis failed';
    } finally {
      loading = false;
    }
  }

  function handleClose() {
    open = false;
    onClose?.();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogEl) {
      handleClose();
    }
  }

  $effect(() => {
    if (open && evidenceId && !analysis) {
      runAnalysis();
    }
  });
</script>

{#if open}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialogEl}
  class="analysis-dialog"
  onclick={handleBackdropClick}
  oncancel={(e) => { e.preventDefault(); handleClose(); }}
>
  <div class="dialog-content">
    <h2 class="text-lg font-bold mb-4">{title}</h2>

    {#if loading}
      <div class="flex items-center gap-3 py-8 justify-center">
        <div class="h-5 w-5 animate-spin border-2 border-accent border-t-transparent rounded-full"></div>
        <span>Running analysis pipeline...</span>
      </div>
    {:else if error}
      <div class="p-4 bg-danger/10 border border-danger/30 rounded mb-4">
        <p class="text-danger font-medium">Analysis Error</p>
        <p class="text-sm mt-1">{error}</p>
      </div>
      <Button onclick={runAnalysis}>Retry</Button>
    {:else if analysis}
      {#if analysis.summary}
        <section class="mb-4">
          <h3 class="font-semibold text-sm uppercase tracking-wide mb-2">Summary</h3>
          <p class="text-sm leading-relaxed">{analysis.summary}</p>
        </section>
      {/if}

      {#if analysis.entities?.length}
        <section class="mb-4">
          <h3 class="font-semibold text-sm uppercase tracking-wide mb-2">
            Entities ({analysis.entities.length})
          </h3>
          <div class="flex flex-wrap gap-2">
            {#each analysis.entities as entity}
              <span class="px-2 py-1 text-xs bg-info/10 border border-info/30 rounded">
                <strong>{entity.type}:</strong> {entity.value}
              </span>
            {/each}
          </div>
        </section>
      {/if}

      {#if analysis.forensics?.length}
        <section class="mb-4">
          <h3 class="font-semibold text-sm uppercase tracking-wide mb-2">
            Forensic Findings ({analysis.forensics.length})
          </h3>
          {#each analysis.forensics as finding}
            <div class="p-2 mb-2 text-sm border-l-2 {finding.severity === 'high' ? 'border-danger bg-danger/5' : finding.severity === 'medium' ? 'border-warning bg-warning/5' : 'border-info bg-info/5'}">
              <span class="font-medium">{finding.type}</span>: {finding.detail}
            </div>
          {/each}
        </section>
      {/if}

      {#if analysis.confidence != null}
        <div class="text-xs text-sand/60 mt-4">
          Confidence: {(analysis.confidence * 100).toFixed(1)}%
        </div>
      {/if}
    {:else}
      <p class="text-sand/60 py-4 text-center">No evidence selected for analysis.</p>
    {/if}

    <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-sand/20">
      <Button onclick={handleClose}>Close</Button>
      {#if analysis}
        <Button onclick={runAnalysis} disabled={loading}>Re-analyze</Button>
      {/if}
    </div>
  </div>
</dialog>
{/if}

<style>
  .analysis-dialog {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    max-width: 100vw;
    max-height: 100vh;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }

  .analysis-dialog::backdrop {
    background: rgba(0, 0, 0, 0.6);
  }

  .dialog-content {
    width: 100%;
    max-width: 42rem;
    background: var(--panel, #1c1917);
    border: 1px solid var(--sand-dark, rgba(168, 162, 158, 0.2));
    padding: 1.5rem;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }
</style>
