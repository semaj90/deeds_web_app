<script lang="ts">
  import { Dialog } from 'bits-ui';
  import type { FileLabel } from '$lib/server/atlas/contracts/file-understanding.js';
  import { FilePurposeEnum, ThoroughnessEnum, AppCriticalityEnum } from '$lib/server/atlas/contracts/file-understanding.js';
  import Button from '$lib/components/ui/Button.svelte';

  interface Props {
    file: FileLabel;
    open?: boolean;
  }

  const {
    file = $bindable(),
    open = $bindable(false),
  }: Props = $props();

  let editMode = $state(false);
  let localFile = $state<FileLabel>({ ...file });
  let saveLoading = $state(false);

  // Watch for external open changes
  $effect(() => {
    if (open && localFile.packet_key !== file.packet_key) {
      localFile = { ...file };
      editMode = false;
    }
  });

  async function handleSave() {
    saveLoading = true;
    try {
      const res = await fetch('/api/atlas/file-understanding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packet_key: localFile.packet_key,
          file_purpose: localFile.file_purpose,
          thoroughness: localFile.thoroughness,
          app_criticality: localFile.app_criticality,
          test_coverage_pct: localFile.test_coverage_pct,
          reasoning: `Manual override from dashboard`,
        }),
      });

      if (res.ok) {
        // Update parent state
        Object.assign(file, localFile);
        editMode = false;
      }
    } finally {
      saveLoading = false;
    }
  }

  function handleCancel() {
    localFile = { ...file };
    editMode = false;
  }
</script>

<Dialog.Root bind:open>
  {#snippet child({ props })}
    <div {...props}>
      <!-- Portal + Overlay for modal stacking -->
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 bg-black/50 z-40" />

        <!-- Modal Content -->
        <div class="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <Dialog.Content class="bg-white dark:bg-neutral-950 rounded-lg shadow-lg max-w-2xl w-full mx-4 pointer-events-auto">
            <!-- Header -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
              <div>
                <Dialog.Title class="text-lg font-semibold">{localFile.source_ref}</Dialog.Title>
                <p class="text-sm text-neutral-500 dark:text-neutral-400">
                  {localFile.packet_key}
                </p>
              </div>
              <Dialog.Close class="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
                ✕
              </Dialog.Close>
            </div>

            <!-- Body -->
            <div class="px-6 py-4 space-y-6">
              <!-- Read-Only Info -->
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="text-neutral-500 dark:text-neutral-400">Method</span>
                  <p class="font-medium">{localFile.method}</p>
                </div>
                <div>
                  <span class="text-neutral-500 dark:text-neutral-400">Confidence</span>
                  <p class="font-medium">{localFile.confidence.toFixed(2)}</p>
                </div>
                <div class="col-span-2">
                  <span class="text-neutral-500 dark:text-neutral-400">Computed At</span>
                  <p class="font-medium text-xs">
                    {localFile.computed_at ? new Date(localFile.computed_at).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>

              <!-- Editable Labels -->
              {#if editMode}
                <div class="space-y-4 border-t border-neutral-200 dark:border-neutral-800 pt-4">
                  <!-- Purpose Select -->
                  <div>
                    <label class="block text-sm font-medium mb-2">File Purpose</label>
                    <select
                      bind:value={localFile.file_purpose}
                      class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900"
                    >
                      {#each FilePurposeEnum.options as purpose}
                        <option value={purpose}>{purpose}</option>
                      {/each}
                    </select>
                  </div>

                  <!-- Thoroughness Scale (1-5) -->
                  <div>
                    <label class="block text-sm font-medium mb-2">Thoroughness (1-5)</label>
                    <div class="flex gap-2">
                      {#each [1, 2, 3, 4, 5] as level}
                        <button
                          type="button"
                          class={`flex-1 py-2 rounded font-medium transition ${
                            localFile.thoroughness === level
                              ? 'bg-blue-600 text-white'
                              : 'bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700'
                          }`}
                          onclick={() => (localFile.thoroughness = level)}
                        >
                          {level}
                        </button>
                      {/each}
                    </div>
                    <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                      {localFile.thoroughness === 1 && 'Stub: Empty or <20 lines'}
                      {localFile.thoroughness === 2 && 'Outline: Basic structure, <40% implemented'}
                      {localFile.thoroughness === 3 && 'Partial: 40-80% complete, may have TODOs'}
                      {localFile.thoroughness === 4 && 'Feature Complete: >80%, ready for use'}
                      {localFile.thoroughness === 5 && 'Battle Tested: Production-hardened, >90%'}
                    </p>
                  </div>

                  <!-- Criticality Select -->
                  <div>
                    <label class="block text-sm font-medium mb-2">App Criticality</label>
                    <select
                      bind:value={localFile.app_criticality}
                      class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900"
                    >
                      {#each AppCriticalityEnum.options as crit}
                        <option value={crit}>{crit}</option>
                      {/each}
                    </select>
                  </div>

                  <!-- Test Coverage % -->
                  <div>
                    <label class="block text-sm font-medium mb-2">Test Coverage %</label>
                    <div class="flex gap-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        bind:value={localFile.test_coverage_pct}
                        class="flex-1"
                      />
                      <span class="w-12 text-right font-medium">{localFile.test_coverage_pct}%</span>
                    </div>
                  </div>
                </div>
              {:else}
                <!-- Read-Only Display -->
                <div class="space-y-3 border-t border-neutral-200 dark:border-neutral-800 pt-4">
                  <div class="flex justify-between items-center">
                    <span class="text-neutral-500 dark:text-neutral-400">Purpose</span>
                    <span class="font-medium px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 rounded text-sm">
                      {localFile.file_purpose}
                    </span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-neutral-500 dark:text-neutral-400">Thoroughness</span>
                    <div class="flex gap-1">
                      {#each [1, 2, 3, 4, 5] as level}
                        <div
                          class={`w-4 h-4 rounded ${
                            level <= localFile.thoroughness
                              ? 'bg-yellow-500'
                              : 'bg-neutral-300 dark:bg-neutral-700'
                          }`}
                        />
                      {/each}
                    </div>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-neutral-500 dark:text-neutral-400">Criticality</span>
                    <span class={`font-medium text-sm ${
                      localFile.app_criticality === 'core' || localFile.app_criticality === 'high_risk'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}>
                      {localFile.app_criticality}
                    </span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-neutral-500 dark:text-neutral-400">Test Coverage</span>
                    <span class="font-medium">{localFile.test_coverage_pct}%</span>
                  </div>
                </div>
              {/if}

              <!-- Reasoning (if from Gemma4) -->
              {#if localFile.method === 'gemma4' && localFile.reasoning}
                <div class="bg-neutral-50 dark:bg-neutral-900 p-4 rounded border border-neutral-200 dark:border-neutral-800">
                  <p class="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">Gemma4 Reasoning</p>
                  <p class="text-sm text-neutral-700 dark:text-neutral-300 italic">{localFile.reasoning}</p>
                </div>
              {/if}
            </div>

            <!-- Footer -->
            <div class="flex justify-end gap-2 px-6 py-4 border-t border-neutral-200 dark:border-neutral-800">
              {#if editMode}
                <Button variant="outline" disabled={saveLoading} onclick={handleCancel}>
                  Cancel
                </Button>
                <Button disabled={saveLoading} onclick={handleSave}>
                  {saveLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              {:else}
                <Button onclick={() => (editMode = true)}>
                  Edit Labels
                </Button>
                <Button variant="outline" onclick={() => (open = false)}>
                  Close
                </Button>
              {/if}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </div>
  {/snippet}
</Dialog.Root>

<style>
  /* Ensure proper z-indexing for stacked modals */
  :global(.bits-dialog-overlay) {
    z-index: 40;
  }

  :global(.bits-dialog-content) {
    z-index: 50;
  }
</style>
