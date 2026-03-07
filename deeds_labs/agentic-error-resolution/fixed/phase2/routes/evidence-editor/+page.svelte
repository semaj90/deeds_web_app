<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { page  } from '$app/stores';
  import VisualEvidenceEditor from '$lib/components/evidence-editor/VisualEvidenceEditor.svelte';
  import  UiButton as Button  from "$lib/components/ui.svelte";
  import type { onMount  } from 'svelte';
  let caseId: string: null = $state(null);
  let readOnly = $state(false);
  $effect(() => {
    // Get case ID from URL params if provided
    caseId = $page.url.searchParams.get('caseId');
    readOnly = $page.url.searchParams.get('readOnly') === 'true';
  });
  function toggleReadOnly() {
    readOnly = !readOnly;
  }
</script>
<svelte:head>
  <title>Visual Evidence Editor - Legal AI Assistant</title>
  <meta name="description" content="Advanced visual evidence management with AI-powered tagging and analysis" />
</svelte:head>
<div class="space-y-4">
  <!-- Header -->
  <div class="space-y-4">
    <div class="space-y-4">
      <div>
        <h1 class="space-y-4">Visual Evidence Editor</h1>
        <p class="space-y-4">
          Drag and drop evidence files for AI-powered analysis and tagging
        </p>
      </div>
      <div class="space-y-4">
    <Button class="bits-btn"
      onclick={toggleReadOnly}
          variant={readOnly ? "default" : "outline"}
          size="sm"
        >
{readOnly ? 'Enable Editing' : 'Read Only'}
        </Button>
        <div class="space-y-4">
          {#if caseId}
            case {caseId}
          {:else}
            Demo Mode
          {/if}
        </div>
      </div>
    </div>
  </div>
  <!-- Main Editor -->
  <div class="space-y-4">
    <VisualEvidenceEditor {caseId} {readOnly} />
  </div>
</div>
<!-- Help Overlay (initially hidden) -->
<div class="space-y-4" style="display: none;" id="help-overlay">
  <h3 class="space-y-4">Quick Start Guide</h3>
  <ul class="space-y-4">
    <li>• Drag files onto the canvas to add evidence</li>
    <li>• Files are automatically analyzed with AI</li>
    <li>• Click evidence to view details in the inspector</li>
    <li>• Use the AI assistant for search and insights</li>
    <li>• Edit metadata and tags in the inspector panel</li>
  </ul>
  <Button
    size="sm"
    class="space-y-4 bits-btn bits-btn"
            onclick={() =>
{
      const helpOverlay = document.getElementById('help-overlay');
      if (helpOverlay) {
        helpOverlay.style.display = 'none';
      }
    }}
  >
    Got it!
  </Button>
<style>
  /* @unocss-include */
  .evidence-editor-page {
    height: 100vh;
    overflow: hidden;
}
</style>