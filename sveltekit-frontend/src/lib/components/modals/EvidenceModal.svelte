<!-- Evidence Modal Component - Bits UI v2 Dialog Primitives portaled to body (z-[9990+]) -->
<script lang="ts">
  import { Dialog } from 'bits-ui';
  import Button from '$lib/components/ui/Button.svelte';
  import RecommendationWidget from '$lib/components/recommendations/RecommendationWidget.svelte';
  import { createViewTracker } from '$lib/utils/tracking';
  import CitationHighlighter from '$lib/components/legal-ai/CitationHighlighter.svelte';
  import { researchTasks } from '$lib/stores/research-tasks.svelte.js';

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
    /** Whether the user is authenticated (needed by researchTasks.addTask) */
    isAuthenticated?: boolean;
  }

  let { item, open = $bindable(false), caseId = undefined, onSave, isAuthenticated = false }: Props = $props();

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

  function handleSaveCitation(citation: HighlightedCitation) {
    citations = [...citations, citation];
  }

  function handleRemoveCitation(citation: HighlightedCitation) {
    citations = citations.filter(c => c.startIndex !== citation.startIndex);
  }

  function handleSummarize(result: { text: string; summary: string; confidence: number }) {
    console.log('Citation summarized:', result);
  }

  /** Citation "→ Research" button: create a research task from selected text */
  async function handleResearch(data: { text: string; summary?: string; pipelineHint?: string }) {
    await researchTasks.addTask(
      {
        title:        `Research: ${data.text.slice(0, 60)}${data.text.length > 60 ? '…' : ''}`,
        selfPrompt:   data.text,
        pipelineHint: data.pipelineHint ?? 'ace',
        sourceText:   data.text,
        summary:      data.summary,
      },
      isAuthenticated,
    );
  }
</script>

<Dialog.Root
  bind:open
  onOpenChange={(next) => {
    if (!next) closeModal();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="evidence-dialog-backdrop" />
    <Dialog.Content class="evidence-dialog-content">
      <!-- Tactical Corner Notches -->
      <span class="hud-notch-tl" aria-hidden="true"></span>
      <span class="hud-notch-tr" aria-hidden="true"></span>
      <span class="hud-notch-bl" aria-hidden="true"></span>
      <span class="hud-notch-br" aria-hidden="true"></span>

      <!-- Gold Top Highlight -->
      <div class="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#f3d471] to-transparent opacity-80" aria-hidden="true"></div>

      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-sand/20 bg-black/40">
        <div class="flex items-center gap-2">
          <span class="i-lucide-file-text h-5 w-5 text-info/80 inline-block"></span>
          <Dialog.Title class="text-lg font-semibold text-white tracking-wide">
            Evidence Details
          </Dialog.Title>
        </div>
        <Dialog.Close onclick={closeModal} class="p-1 text-sand/40 hover:text-white hover:bg-white/10 rounded transition-colors cursor-pointer" aria-label="Close">
          <span class="i-lucide-x h-5 w-5 inline-block"></span>
        </Dialog.Close>
      </div>

      <!-- Content -->
      <div class="p-5 overflow-y-auto max-h-[calc(90vh-100px)]">
        {#if !isEditing}
          <div class="space-y-4">
            <div>
              <span class="block text-xs font-mono uppercase tracking-wider text-[#f3d471] mb-1">Title</span>
              <div class="text-white font-medium text-base">{title || 'Untitled'}</div>
            </div>
            <div>
              <span class="block text-xs font-mono uppercase tracking-wider text-sand/60 mb-1">Description (Select text to highlight & cite)</span>
              <CitationHighlighter
                content={description || 'No description'}
                citations={citations}
                onsave={handleSaveCitation}
                onremove={handleRemoveCitation}
                onsummarize={handleSummarize}
                onresearch={handleResearch}
              />
            </div>
            <div>
              <span class="block text-xs font-mono uppercase tracking-wider text-sand/60 mb-1">Type</span>
              <div class="text-sand/80 font-mono text-sm">{type || 'Not specified'}</div>
            </div>
            <div>
              <span class="block text-xs font-mono uppercase tracking-wider text-sand/60 mb-1">Tags</span>
              <div class="flex flex-wrap gap-1">
                {#if tagsString}
                  {#each tagsString.split(',').map(t => t.trim()).filter(Boolean) as tag}
                    <span class="px-2 py-0.5 bg-info/20 border border-info/30 text-info/90 text-xs rounded font-mono">{tag}</span>
                  {/each}
                {:else}
                  <span class="text-sand/60 text-xs">No tags</span>
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
            <Button variant="default" onclick={handleEdit} class="gap-2 bg-[#f3d471] hover:bg-[#ffe180] text-black font-bold">
              <span class="i-lucide-edit h-4 w-4 inline-block"></span>
              Edit
            </Button>
          </div>
        {:else}
          <form onsubmit={handleSave} class="space-y-4">
            <div>
              <label for="evidence-title" class="block text-xs font-mono uppercase tracking-wider text-sand/70 mb-1">Title</label>
              <input id="evidence-title" type="text" bind:value={title} placeholder="Evidence title"
                class="w-full px-3 py-2 bg-black/40 border border-sand/30 rounded-lg text-white placeholder-sand/40 focus:outline-none focus:border-[#f3d471]" />
            </div>
            <div>
              <label for="evidence-description" class="block text-xs font-mono uppercase tracking-wider text-sand/70 mb-1">Description</label>
              <textarea id="evidence-description" bind:value={description} placeholder="Evidence description" rows="3"
                class="w-full px-3 py-2 bg-black/40 border border-sand/30 rounded-lg text-white placeholder-sand/40 focus:outline-none focus:border-[#f3d471] resize-none"></textarea>
            </div>
            <div>
              <label for="evidence-type" class="block text-xs font-mono uppercase tracking-wider text-sand/70 mb-1">Type</label>
              <input id="evidence-type" type="text" bind:value={type} placeholder="Evidence type"
                class="w-full px-3 py-2 bg-black/40 border border-sand/30 rounded-lg text-white placeholder-sand/40 focus:outline-none focus:border-[#f3d471]" />
            </div>
            <div>
              <label for="evidence-tags" class="block text-xs font-mono uppercase tracking-wider text-sand/70 mb-1">Tags (comma-separated)</label>
              <input id="evidence-tags" type="text" bind:value={tagsString} placeholder="tag1, tag2, tag3"
                class="w-full px-3 py-2 bg-black/40 border border-sand/30 rounded-lg text-white placeholder-sand/40 focus:outline-none focus:border-[#f3d471]" />
            </div>
            <div class="flex justify-end gap-2 pt-4 border-t border-sand/20">
              <Button type="button" variant="ghost" onclick={handleCancel}>Cancel</Button>
              <Button type="submit" variant="default" class="gap-2 bg-[#f3d471] hover:bg-[#ffe180] text-black font-bold">
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
  :global(.evidence-dialog-backdrop) {
    position: fixed;
    inset: 0;
    z-index: 9990;
    background: rgba(4, 6, 12, 0.78);
    backdrop-filter: blur(14px) saturate(1.1);
  }

  :global(.evidence-dialog-content) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 9991;
    width: min(34rem, calc(100vw - 2rem));
    background: linear-gradient(180deg, rgba(19, 27, 42, 0.98) 0%, rgba(8, 12, 20, 0.99) 100%);
    border: 1px solid rgba(212, 199, 163, 0.28);
    border-radius: 14px;
    box-shadow:
      0 0 0 1px rgba(126, 231, 255, 0.05),
      0 28px 60px -18px rgba(0, 0, 0, 0.85),
      0 0 45px rgba(243, 212, 113, 0.1);
    backdrop-filter: blur(20px);
    overflow: hidden;
  }
</style>
