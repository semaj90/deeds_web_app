<!-- Evidence Modal Component - Svelte 5 native <dialog> (bits-ui Dialog removed for TDZ fix) -->
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import RecommendationWidget from '$lib/components/recommendations/RecommendationWidget.svelte';
  import { createViewTracker } from '$lib/utils/tracking';
  import CitationHighlighter from '$lib/components/legal-ai/CitationHighlighter.svelte';

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

  let dialogEl: HTMLDialogElement | undefined = $state(undefined);
  let isEditing = $state(false);
  let title = $state('');
  let description = $state('');
  let tagsString = $state('');
  let type = $state('');
  let viewTracker: ReturnType<typeof createViewTracker> | null = null;

  interface HighlightedCitation {
    text: string;
    startIndex: number;
    endIndex: number;
    summary?: string;
    confidence?: number;
  }
  let citations = $state<HighlightedCitation[]>([]);

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) dialogEl.showModal();
    else if (!open && dialogEl.open) dialogEl.close();
  });

  $effect(() => {
    if (item?.jsonData) {
      title = item.jsonData.title || '';
      description = item.jsonData.description || '';
      tagsString = item.jsonData.tagsString ?? (item.jsonData.tags ?? []).join(', ');
      type = item.jsonData.type ?? '';
    }
  });

  $effect(() => {
    if (open && item?.id) {
      viewTracker = createViewTracker(item.id, caseId);
    } else if (!open && viewTracker) {
      viewTracker.complete();
      viewTracker = null;
    }
  });

  function handleEdit() { isEditing = true; }

  function handleSave(event: SubmitEvent) {
    event.preventDefault();
    const updatedItem: EvidenceItem = {
      jsonData: {
        title, description, type, tagsString,
        tags: tagsString ? tagsString.split(',').map((t: string) => t.trim()).filter(Boolean) : []
      }
    };
    onSave?.(updatedItem);
    isEditing = false;
    open = false;
  }

  function handleCancel() {
    if (item?.jsonData) {
      title = item.jsonData.title || '';
      description = item.jsonData.description || '';
      tagsString = item.jsonData.tagsString ?? (item.jsonData.tags ?? []).join(', ');
      type = item.jsonData.type ?? '';
    }
    isEditing = false;
  }

  function closeModal() { open = false; isEditing = false; }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogEl) closeModal();
  }

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

{#if open}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialogEl}
  class="evidence-dialog"
  onclick={handleBackdropClick}
  oncancel={(e) => { e.preventDefault(); closeModal(); }}
>
  <div class="dialog-panel">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-sand/20">
      <div class="flex items-center gap-2">
        <span class="i-lucide-file-text h-5 w-5 text-info/80 inline-block" />
        <h2 class="text-lg font-semibold text-white">Evidence Details</h2>
      </div>
      <button type="button" onclick={closeModal} class="p-1 hover:bg-panelSoft rounded transition-colors" aria-label="Close">
        <span class="i-lucide-x h-5 w-5 text-sand/40 inline-block" />
      </button>
    </div>

    <!-- Content -->
    <div class="p-4">
      {#if !isEditing}
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
        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-sand/20">
          <Button variant="ghost" onclick={closeModal}>Close</Button>
          <Button variant="default" onclick={handleEdit} class="gap-2">
            <span class="i-lucide-edit h-4 w-4 inline-block"></span>
            Edit
          </Button>
        </div>
      {:else}
        <form onsubmit={handleSave} class="space-y-4">
          <div>
            <label for="evidence-title" class="block text-sm font-medium text-sand/40 mb-1">Title</label>
            <input id="evidence-title" type="text" bind:value={title} placeholder="Evidence title"
              class="w-full px-3 py-2 bg-panelSoft border border-sand/30 rounded-lg text-white placeholder-sand/40 focus:outline-none focus:ring-2 focus:ring-info" />
          </div>
          <div>
            <label for="evidence-description" class="block text-sm font-medium text-sand/40 mb-1">Description</label>
            <textarea id="evidence-description" bind:value={description} placeholder="Evidence description" rows="3"
              class="w-full px-3 py-2 bg-panelSoft border border-sand/30 rounded-lg text-white placeholder-sand/40 focus:outline-none focus:ring-2 focus:ring-info resize-none"></textarea>
          </div>
          <div>
            <label for="evidence-type" class="block text-sm font-medium text-sand/40 mb-1">Type</label>
            <input id="evidence-type" type="text" bind:value={type} placeholder="Evidence type"
              class="w-full px-3 py-2 bg-panelSoft border border-sand/30 rounded-lg text-white placeholder-sand/40 focus:outline-none focus:ring-2 focus:ring-info" />
          </div>
          <div>
            <label for="evidence-tags" class="block text-sm font-medium text-sand/40 mb-1">Tags (comma-separated)</label>
            <input id="evidence-tags" type="text" bind:value={tagsString} placeholder="tag1, tag2, tag3"
              class="w-full px-3 py-2 bg-panelSoft border border-sand/30 rounded-lg text-white placeholder-sand/40 focus:outline-none focus:ring-2 focus:ring-info" />
          </div>
          <div class="flex justify-end gap-2 pt-4 border-t border-sand/20">
            <Button type="button" variant="ghost" onclick={handleCancel}>Cancel</Button>
            <Button type="submit" variant="default" class="gap-2 bg-accent hover:bg-accent/60">
              <span class="i-lucide-save h-4 w-4 inline-block"></span>
              Save Changes
            </Button>
          </div>
        </form>
      {/if}
    </div>
  </div>
</dialog>
{/if}

<style>
  .evidence-dialog {
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
  .evidence-dialog::backdrop {
    background: rgba(0, 0, 0, 0.6);
  }
  .dialog-panel {
    width: 100%;
    max-width: 32rem;
    background: var(--panel, #1c1917);
    border: 1px solid var(--sand-dark, rgba(168, 162, 158, 0.2));
    border-radius: 0.5rem;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    max-height: 90vh;
    overflow-y: auto;
  }
</style>
