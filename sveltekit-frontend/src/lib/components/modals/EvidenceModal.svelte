<!-- Evidence Modal Component - Svelte 5 + bits-ui v2 -->
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import { Dialog } from "bits-ui";
  import RecommendationWidget from '$lib/components/recommendations/RecommendationWidget.svelte';
  import { createViewTracker } from '$lib/utils/tracking';
  import CitationHighlighter from '$lib/components/legal-ai/CitationHighlighter.svelte';

  // Props interface
  interface EvidenceItem {
    id?: string;
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
    caseId?: string;
    onSave?: (data: EvidenceItem) => void;
  }

  let { item, open = $bindable(false), caseId = undefined, onSave }: Props = $props();

  // State
  let isEditing = $state(false);
  let title = $state('');
  let description = $state('');
  let tagsString = $state('');
  let type = $state('');
  let viewTracker: ReturnType<typeof createViewTracker> | null = null;

  // Citation highlighting
  interface HighlightedCitation {
    text: string;
    startIndex: number;
    endIndex: number;
    summary?: string;
    confidence?: number;
  }
  let citations = $state<HighlightedCitation[]>([]);

  // Initialize form values from item
  $effect(() => {
    if (item?.jsonData) {
      title = item.jsonData.title || '';
      description = item.jsonData.description || '';
      tagsString = item.jsonData.tagsString ?? (item.jsonData.tags ?? []).join(', ');
      type = item.jsonData.type ?? '';
    }
  });

  // Track view when modal opens
  $effect(() => {
    if (open && item?.id) {
      // Start tracking view
      viewTracker = createViewTracker(item.id, caseId);
    } else if (!open && viewTracker) {
      // Complete tracking when modal closes
      viewTracker.complete();
      viewTracker = null;
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

  // Citation handlers
  function handleSaveCitation(citation: HighlightedCitation) {
    citations = [...citations, citation];
  }

  function handleRemoveCitation(citation: HighlightedCitation) {
    citations = citations.filter(c => c.startIndex !== citation.startIndex);
  }

  function handleSummarize(result: { text: string; summary: string; confidence: number }) {
    console.log('Citation summarized:', result);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/60 z-40" />
    <Dialog.Content class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-panel border border-sand/20 rounded-lg shadow-xl">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-sand/20">
        <div class="flex items-center gap-2">
          <span class="i-lucide-file-text h-5 w-5 text-info/80 inline-block" />
          <Dialog.Title class="text-lg font-semibold text-white">
            Evidence Details
          </Dialog.Title>
        </div>
        <Dialog.Close>
          <button
            type="button"
            onclick={closeModal}
            class="p-1 hover:bg-panelSoft rounded transition-colors"
            aria-label="Close"
          >
            <span class="i-lucide-x h-5 w-5 text-sand/40 inline-block" />
          </button>
        </Dialog.Close>
      </div>

      <!-- Content -->
      <div class="p-4">
        {#if !isEditing}
          <!-- View Mode -->
          <div class="space-y-4">
            <div>
              <span class="block text-sm font-medium text-sand/40 mb-1">Title</span>
              <div class="text-white font-medium">{title || 'Untitled'}</div>
            </div>

            <div>
              <span class="block text-sm font-medium text-sand/40 mb-1">Description (Select text to highlight & cite)</span>
              <CitationHighlighter
                content={description || 'No description'}
                citations={citations}
                onsave={handleSaveCitation}
                onremove={handleRemoveCitation}
                onsummarize={handleSummarize}
              />
            </div>

            <div>
              <span class="block text-sm font-medium text-sand/40 mb-1">Type</span>
              <div class="text-sand/40">{type || 'Not specified'}</div>
            </div>

            <div>
              <span class="block text-sm font-medium text-sand/40 mb-1">Tags</span>
              <div class="flex flex-wrap gap-1">
                {#if tagsString}
                  {#each tagsString.split(',').map(t => t.trim()).filter(Boolean) as tag}
                    <span class="px-2 py-1 bg-info/20 text-info/80 text-xs rounded">{tag}</span>
                  {/each}
                {:else}
                  <span class="text-sand/60">No tags</span>
                {/if}
              </div>
            </div>

            <!-- Recommendations Section -->
            {#if title}
              <div class="pt-4 border-t border-sand/20">
                <RecommendationWidget
                  query={title + ' ' + (description || '')}
                  tags={tagsString ? tagsString.split(',').map(t => t.trim()).filter(Boolean) : []}
                  limit={3}
                  compact={true}
                />
              </div>
            {/if}
          </div>

          <!-- View Mode Actions -->
          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-sand/20">
            <Button variant="ghost" onclick={closeModal}>
              Close
            </Button>
            <Button variant="default" onclick={handleEdit} class="gap-2">
              <span class="i-lucide-edit h-4 w-4 inline-block"></span>
              Edit
            </Button>
          </div>
        {:else}
          <!-- Edit Mode -->
          <form onsubmit={handleSave} class="space-y-4">
            <div>
              <label for="evidence-title" class="block text-sm font-medium text-sand/40 mb-1">
                Title
              </label>
              <input
                id="evidence-title"
                type="text"
                bind:value={title}
                placeholder="Evidence title"
                class="w-full px-3 py-2 bg-panelSoft border border-sand/30 rounded-lg text-white placeholder-sand/40 focus:outline-none focus:ring-2 focus:ring-info"
              />
            </div>

            <div>
              <label for="evidence-description" class="block text-sm font-medium text-sand/40 mb-1">
                Description
              </label>
              <textarea
                id="evidence-description"
                bind:value={description}
                placeholder="Evidence description"
                rows="3"
                class="w-full px-3 py-2 bg-panelSoft border border-sand/30 rounded-lg text-white placeholder-sand/40 focus:outline-none focus:ring-2 focus:ring-info resize-none"
              ></textarea>
            </div>

            <div>
              <label for="evidence-type" class="block text-sm font-medium text-sand/40 mb-1">
                Type
              </label>
              <input
                id="evidence-type"
                type="text"
                bind:value={type}
                placeholder="Evidence type"
                class="w-full px-3 py-2 bg-panelSoft border border-sand/30 rounded-lg text-white placeholder-sand/40 focus:outline-none focus:ring-2 focus:ring-info"
              />
            </div>

            <div>
              <label for="evidence-tags" class="block text-sm font-medium text-sand/40 mb-1">
                Tags (comma-separated)
              </label>
              <input
                id="evidence-tags"
                type="text"
                bind:value={tagsString}
                placeholder="tag1, tag2, tag3"
                class="w-full px-3 py-2 bg-panelSoft border border-sand/30 rounded-lg text-white placeholder-sand/40 focus:outline-none focus:ring-2 focus:ring-info"
              />
            </div>

            <!-- Edit Mode Actions -->
            <div class="flex justify-end gap-2 pt-4 border-t border-sand/20">
              <Button type="button" variant="ghost" onclick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit" variant="default" class="gap-2 bg-accent hover:bg-accent/60">
                <span class="i-lucide-save h-4 w-4 inline-block"></span>
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
