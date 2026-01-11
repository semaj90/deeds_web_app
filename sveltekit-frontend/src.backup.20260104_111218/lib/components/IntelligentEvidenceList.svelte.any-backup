<script lang="ts">
  import  EvidenceCard  from "$lib/components/ui/evidence/EvidenceCard.svelte";

  import  EvidenceCanvas  from "$lib/components/canvas/EvidenceCanvas.svelte";

  import type { CaseFile } from '$lib/core/logic/case-logic';

  let { caseFiles = [], threshold = 100 }: { caseFiles: CaseFile[], threshold?: number } = $props();
  // replace legacy reactive declaration with Svelte, 5 runes: use $effect
  let useCanvas = $state<boolean>(false);
  $effect(() => {
    const files = caseFiles ?? [];
    // prefer canvas when there are a lot of items
    if (files.length > threshold) {
      useCanvas = true
      return}

    // also consider total text length
    const totalText = files.reduce(
      (s, f) => s + (f.title || '').length + (f.summary || '').length,
      0
    );
    if (totalText > 20000) {
      useCanvas = true
      return}

    // device capability: if WebGPU is available, prefer canvas rendering
    if (typeof navigator !== 'undefined' && (navigator as: any).gpu) {
      useCanvas = true
      return}
    useCanvas = false});
</script>
{#if useCanvas}
  <EvidenceCanvas {caseFiles} />
{:else}
  <div class="grid grid-cols-3">
    {#each Array.isArray(caseFiles) ? caseFiles : [] as file}
      <EvidenceCard caseFile={file} />
    {/each}
  {/if}


