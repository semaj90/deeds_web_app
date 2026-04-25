import fs from 'fs';
import path from 'path';

const stubs = [
    'src/lib/components/ai/OllamaAutoComplete.svelte',
    'src/lib/components/ai/ProactiveAIAssistant.svelte',
    'src/lib/components/ai/RealtimeCommunicationDemo.svelte',
    'src/lib/components/chat/ContextualComposer.svelte',
    'src/lib/components/chat/LegalAIChat.svelte',
    'src/lib/components/citations/CitationEditor.svelte',
    'src/lib/components/layout/ContentSection.svelte',
    'src/lib/components/prosecutor/EnhancedAIChatAssistant.svelte',
    'src/lib/components/realtime/AdvancedMeltUIDemo.svelte',
    'src/lib/components/realtime/MeltUIDemo.svelte',
    'src/lib/components/scoring/CaseAIScoringCard.svelte',
    'src/lib/components/ui/CaseItem.svelte',
    'src/lib/components/ui/ContextMenuSeparator.svelte',
    'src/lib/components/ui/TooltipContent.svelte',
    'src/lib/components/upload/FileUploadProgress.svelte',
    'src/lib/components/upload/UploadProgress.svelte',
    'src/lib/components/validation/IntegrationValidator.svelte',
    'src/lib/components/yorha/TimelineReconstructionEngine.svelte',
    'src/lib/components/yorha/YoRHaDialogManager.svelte',
    'src/lib/components/yorha/YoRHaModalManager.svelte',
    'src/lib/components/yorha/YoRHaNavCard.svelte'
];

const template = (name) => `<script lang="ts">
  /**
   * ${name}
   * Restored base template for Phase 75
   */
  let { children, ...props } = $props();
</script>

<div class="component-restored ${name.split('/').pop().replace('.svelte', '').toLowerCase()}">
  <div class="p-4 border border-dashed border-gray-300 rounded-md">
    <h3 class="text-lg font-bold mb-2">${name.split('/').pop().replace('.svelte', '')} (Restored Phase 75)</h3>
    <p class="text-sm text-gray-600 mb-4">This component was restored to a functional state. UI logic needs investigation.</p>

    {#if children}
      {@render children()}
    {:else}
      <div class="p-2 bg-gray-50 rounded">Default Content Placeholder</div>
    {/if}
  </div>
</div>

<style>
  .component-restored {
    display: block;
    width: 100%;
  }
</style>
`;

async function main() {
    for (const stub of stubs) {
        const fullPath = path.resolve(stub);
        console.log('Populating ' + stub + '...');
        fs.writeFileSync(fullPath, template(stub));
    }
    console.log('✅ Done populating stubs.');
}

main();
