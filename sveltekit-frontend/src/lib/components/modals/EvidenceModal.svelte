<!-- Evidence Modal Component - Svelte 5 + bits-ui v2 -->
<script lang="ts">
  import { Dialog } from 'bits-ui';
  import Button from '$lib/components/ui/Button.svelte';
  import X from 'lucide-svelte/icons/x';
  import FileText from 'lucide-svelte/icons/file-text';
  import Edit from 'lucide-svelte/icons/edit';
  import Save from 'lucide-svelte/icons/save';

  // Props interface
  interface EvidenceItem {
    jsonData: {
      title: string;
      description: string;
      tags?: string[];
      tagsString?: string;
      type?: string;
    };
  }

  interface Props {
    item: EvidenceItem;
    open?: boolean;
    onSave?: (data: EvidenceItem) => void;
  }

  let { item, open = $bindable(false), onSave }: Props = $props();

  // State
  let isEditing = $state(false);
  let title = $state('');
  let description = $state('');
  let tagsString = $state('');
  let type = $state('');

  // Initialize form values from item
  $effect(() => {
    if (item?.jsonData) {
      title = item.jsonData.title || '';
      description = item.jsonData.description || '';
      tagsString = item.jsonData.tagsString ?? (item.jsonData.tags ?? []).join(', ');
      type = item.jsonData.type ?? '';
    }
  });

  function handleEdit() {
    isEditing = true;
  }

  function handleSave(event: SubmitEvent) {
    event.preventDefault();

    const updatedItem: EvidenceItem = {
      jsonData: {
        title,
        description,
        type,
        tagsString,
        tags: tagsString
          ? tagsString.split(',').map((t: string) => t.trim()).filter(Boolean)
          : []
      }
    };

    onSave?.(updatedItem);
    isEditing = false;
    open = false;
  }

  function handleCancel() {
    // Reset to original values
    if (item?.jsonData) {
      title = item.jsonData.title || '';
      description = item.jsonData.description || '';
      tagsString = item.jsonData.tagsString ?? (item.jsonData.tags ?? []).join(', ');
      type = item.jsonData.type ?? '';
    }
    isEditing = false;
  }

  function closeModal() {
    open = false;
    isEditing = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/60 z-40" />
    <Dialog.Content class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-gray-900 border border-gray-700 rounded-lg shadow-xl">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-gray-700">
        <div class="flex items-center gap-2">
          <FileText class="h-5 w-5 text-blue-400" />
          <Dialog.Title class="text-lg font-semibold text-white">
            Evidence Details
          </Dialog.Title>
        </div>
        <Dialog.Close>
          <button
            type="button"
            onclick={closeModal}
            class="p-1 hover:bg-gray-700 rounded transition-colors"
            aria-label="Close"
          >
            <X class="h-5 w-5 text-gray-400" />
          </button>
        </Dialog.Close>
      </div>

      <!-- Content -->
      <div class="p-4">
        {#if !isEditing}
          <!-- View Mode -->
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-400 mb-1">Title</label>
              <div class="text-white font-medium">{title || 'Untitled'}</div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-400 mb-1">Description</label>
              <div class="text-gray-300">{description || 'No description'}</div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-400 mb-1">Type</label>
              <div class="text-gray-300">{type || 'Not specified'}</div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-400 mb-1">Tags</label>
              <div class="flex flex-wrap gap-1">
                {#if tagsString}
                  {#each tagsString.split(',').map(t => t.trim()).filter(Boolean) as tag}
                    <span class="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded">{tag}</span>
                  {/each}
                {:else}
                  <span class="text-gray-500">No tags</span>
                {/if}
              </div>
            </div>
          </div>

          <!-- View Mode Actions -->
          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-700">
            <Button variant="ghost" onclick={closeModal}>
              Close
            </Button>
            <Button variant="default" onclick={handleEdit} class="gap-2">
              <Edit class="h-4 w-4" />
              Edit
            </Button>
          </div>
        {:else}
          <!-- Edit Mode -->
          <form onsubmit={handleSave} class="space-y-4">
            <div>
              <label for="evidence-title" class="block text-sm font-medium text-gray-300 mb-1">
                Title
              </label>
              <input
                id="evidence-title"
                type="text"
                bind:value={title}
                placeholder="Evidence title"
                class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label for="evidence-description" class="block text-sm font-medium text-gray-300 mb-1">
                Description
              </label>
              <textarea
                id="evidence-description"
                bind:value={description}
                placeholder="Evidence description"
                rows="3"
                class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              ></textarea>
            </div>

            <div>
              <label for="evidence-type" class="block text-sm font-medium text-gray-300 mb-1">
                Type
              </label>
              <input
                id="evidence-type"
                type="text"
                bind:value={type}
                placeholder="Evidence type"
                class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label for="evidence-tags" class="block text-sm font-medium text-gray-300 mb-1">
                Tags (comma-separated)
              </label>
              <input
                id="evidence-tags"
                type="text"
                bind:value={tagsString}
                placeholder="tag1, tag2, tag3"
                class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <!-- Edit Mode Actions -->
            <div class="flex justify-end gap-2 pt-4 border-t border-gray-700">
              <Button type="button" variant="ghost" onclick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit" variant="default" class="gap-2 bg-green-600 hover:bg-green-700">
                <Save class="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </form>
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* @unocss-include */
</style>
