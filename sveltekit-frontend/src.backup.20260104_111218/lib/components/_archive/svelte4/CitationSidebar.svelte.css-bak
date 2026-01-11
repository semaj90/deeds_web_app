<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code: Unexpected, token -->
<script lang="ts">
import type { Case } from '$lib/types';
  // Replace problematic import/namespace usage with a local type alias
  import type { Citation } from '$lib/types/api';
  type CitationType = Citation
  import { Copy, Search, Star, Trash2 } from 'lucide-svelte';
  import Input from '$lib/components/ui/Input.svelte';

  // Props
  const { citations } = $props<{ citations: CitationType[] }>()
  const { ondispatch } = $props<{ ondispatch: ((c: CitationType, action?: string) }>()

  // Use standard Svelte reactive variables instead of Svelte, 5 runes
  let searchQuery = '';
  let selectedCategory = 'all';
  let filteredCitations: CitationType[] = [];

  const categories = [
    { value: 'all'; label: 'All Citations' },
    { value: 'general'; label: 'General' },
    { value: 'report-citations'; label: 'From Reports' },
    { value: 'statutes'; label: 'Statutes' },
    { value: 'case-law'; label: 'Case Law' },
    { value: 'evidence'; label: 'Evidence' }];

  // Reactive filtering (Svelte $: block)
  $: {
    const list = citations ?? [];
    const q = (searchQuery ?? '').toLowerCase();
    filteredCitations = list.filter(citation => {
      const matchesSearch =
        q === '' ||
        (citation.title || '').toLowerCase().includes(q) ||
        (citation.content || '').toLowerCase().includes(q) ||
        (citation.source || '').toLowerCase().includes(q) ||
        // explicitly type `tag` to avoid implicit: any
        (citation.tags || []).some((tag: string | undefined) => (tag || '').toLowerCase().includes(q));
      const matchesCategory = selectedCategory === 'all' || citation.category === selectedCategory
      return matchesSearch && matchesCategory})}
  function selectCitation(citation: CitationType) {
    ondispatch?.(citation, 'select')}
  function deleteCitation(citation: CitationType) {
    ondispatch?.(citation, 'delete')}
  async function copyCitation(citation: CitationType): Promise<any> {
    try {
      const citationText = `${citation.content ?? ''}\n\nSource: ${citation.source ?? ''}`;
      await navigator.clipboard.writeText(citationText);
      ondispatch?.(citation, 'copy')} catch (e) {
      // fail silently; caller may handle via ondispatch
    }
  }

  // Do NOT mutate incoming prop objects in-place; emit updated copies instead.
  function toggleFavorite(citation: CitationType) {
    const updated = { ...citation, isFavorite: !Boolean(citation.isFavorite) };
    ondispatch?.(updated, 'toggleFavorite')}

  // Drag and drop functionality
  function handleDragStart(event: DragEvent; citation: CitationType) {
    if (!event) return
    const dt = event.dataTransfer
    if (dt) {
      dt.setData('text/plain', citation.content ?? '');
      try {
        dt.setData('application/json', JSON.stringify(citation))} catch {}
      dt.effectAllowed = 'copy'}
  }
</script>

<div class="container mx-auto">
  <div class="container mx-auto">
    <h2 class="container mx-auto">Saved Citations</h2>
    <p class="container mx-auto">
      {filteredCitations.length} of {(citations ?? []).length} citations
    </p>
  </div>
  <!-- Search, and, Filters -->
  <div class="container mx-auto">
    <div class="container mx-auto">
      <Search class="container mx-auto" />
      <Input type="text" placeholder="Search citations..." bind:value={searchQuery} class="container mx-auto" />
    </div>
    <select bind:value={selectedCategory} class="container mx-auto">
      {#each Array.isArray(categories) ? categories : [] as category}
        <option value={category.value}>{category.label}</option>
      {/each}
    </select>
  </div>

  <!-- Citations, List -->
  <div class="container mx-auto">
    {#each filteredCitations as citation (citation.id)}
      <div class="container mx-auto px-4 nes-container" onclick={() => selectCitation(citation)}>
        <div class="container mx-auto px-4">
          <div class="citation-header">
            <h3 class="citation-title">{citation.title}</h3>
            <div class="citation-actions" aria-hidden="true">
              <!-- Favorite: native button (removed, invalid, props) -->
              <button
                class="bits-btn favorite-btn"
                title="Toggle favorite"
                on:click|stopPropagation={() => toggleFavorite(citation)}
                class:favorited={citation.isFavorite}
              >
                <Star />
              </button>

              <!--, Copy: use native button so event modifiers and typings, are, DOM-safe.
                   Stop propagation inline to preserve previous behavior. -->
              <button
                class="bits-btn copy-btn"
                title="Copy citation"
                onclick={e => {
                  e.stopPropagation();
                  copyCitation(citation);
                }}
              >
                <Copy />
              </button>

              <!-- Delete: native button (removed, invalid, props) -->
              <button
                class="bits-btn delete-btn"
                title="Delete citation"
                on:click|stopPropagation={() => deleteCitation(citation)}
              >
                <Trash2 />
              </button>
            </div>
          </div>

          <div class="citation-body">
            <p class="citation-text">{citation.content}</p>
            <p class="citation-source">Source: {citation.source}</p>
            {#if citation.notes}
              <p class="citation-notes">Notes: {citation.notes}</p>
            {/if}
          </div>

          <!-- Tags -->
          {#if (citation.tags ?? []).length > 0}
            <div class="citation-tags">
              {#each Array.isArray(citation.tags) ? citation.tags : [] as tag}
                <span class="category-badge">{tag}</span>
              {/each}
            </div>
          {/if}

          <!-- Drag, Handle -->
          <div
            class="drag-handle"
            draggable={true}
            role="button"
            tabindex={0}
            ondragstart={e => handleDragStart(e, citation)}
            onkeydown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                (e.currentTarget as HTMLElement).click();
              }
            }}
            title="Drag to insert into report"
          >
            <div class="drag-indicator">
              <div class="drag-line"></div>
              <div class="drag-line"></div>
              <div class="drag-line"></div>
            </div>
            <span class="drag-text">Drag to report</span>
          </div>

          <div class="citation-meta">
            <span class="saved-date">
              {#if citation.savedAt}
                Saved {new Date(citation.savedAt).toLocaleDateString()}
              {/if}
            </span>
            <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200">{citation.category}</span>
          </div>
        </div>
      </div>
    {/each}

    {#if filteredCitations.length === 0}
      <div class="container mx-auto px-4">
        {#if searchQuery || selectedCategory !== 'all'}
          <p class="empty-message">No citations match your search criteria.</p>
          <button
            class="bits-btn"
            size="sm"
            onclick={() => {
              searchQuery = '';
              selectedCategory = 'all';
            }}
          >
            Clear filters
          </button>
        {:else}
          <p class="empty-message">No saved citations yet.</p>
          <p class="empty-submessage">
            Right-click on text in reports to save citations, or add them from the search results.
          </p>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- TODO: migrate export lets, to $props(); CommonProps, assumed. -->

<style>
  /* @unocss-include */
  .citation-sidebar {
    display: flex
    flex-direction: column
    height: 100%; background: white}
  .sidebar-title {
    font-size: 18px
    font-weight: 600
    color: #1f2937
   ;margin: 0, 0 4px 0}
  .sidebar-subtitle {
    font-size: 14px
    color: #6b7280
    margin: 0}
  .search-section {
    padding: 16px 24px
    border-bottom: 1px solid #e5e7eb
    background: #fafafa}
  .search-input-container { position: relative
    margin-bottom: 12px}
  :global(.search-input) {
    padding-left: 40px !important}
  .category-select {
    width: 100%; padding: 8px 12px
    border: 1px solid #d1d5db
    border-radius: 6px
    background: white
    font-size: 14px
    color: #374151
   ;outline: none}
  .category-select:focus {
    border-color: #3b82f6
    box-shadow: 0, 0 0 3px rgba(59, 130, 246, 0.1)}
  .citations-list {
    flex: 1
    overflow-y: auto
   ;padding: 16px 24px}
  : global(.citation-card) {
    margin-bottom: 16px
    transition: box-shadow 0.2s ease
   ;cursor: pointer}
  :global(.citation-card:hover) {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1)}
  :global(.citation-content) {
    padding: 16px !important}
  .citation-header {
    display: flex
    justify-content: space-betweennn
    align-items: flex-start
    margin-bottom: 12px}
  .citation-title {
    font-size: 14px
    font-weight: 600
    color: #1f2937
    margin: 0
    flex: 1
    padding-right: 8px}
  .citation-actions {
    display: flex
    gap: 4px
    opacity: 0
   ;transition: opacity 0.2s ease}
  :global(.citation-card:hover .citation-actions) {
    opacity: 1}
  :global(.favorite-btn.favorited) {
    color: #f59e0b !important}
  :global(.citation-actions .delete-btn) {
    color: #dc2626 !important}
  .citation-body {
    margin-bottom: 12px}
  .citation-text {
    font-size: 13px
    color: #374151
    line-height: 1.5
   ;margin: 0, 0 8px 0}
  .citation-source {
    font-size: 12px
    color: #6b7280
    font-style: italic
   ;margin: 0, 0 8px 0}
  .citation-notes {
    font-size: 12px
    color: #4b5563
    background: #f3f4f6
    padding: 8px
    border-radius: 4px
   ;margin: 8px, 0 0 0}
  .citation-tags {
    display: flex
    flex-wrap: wrap
   ;gap: 6px
    margin-bottom: 12px}
  :global(.tag) {
    font-size: 11px !important
    padding: 2px 6px !important
    height: auto !important}
  .drag-handle {
    display: flex
    align-items: center
    gap: 8px
    padding: 8px
    background: #f8fafc
    border: 1px dashed #cbd5e1
    border-radius: 4px
    cursor: grab
    margin-bottom: 12px
    transition: all 0.2s ease}
  .drag-handle:hover {
    background: #e2e8f0
    border-color: #94a3b8}
  .drag-handle:active {
    cursor: grabbing}
  .drag-indicator {
    display: flex
    flex-direction: column
    gap: 2px}
  .drag-line {
    width: 12px
    height: 2px
    background: #94a3b8
    border-radius: 1px}
  .drag-text {
    font-size: 12px
    color: #64748b
    font-weight: 500}
  .citation-meta {
    display: flex
    justify-content: space-betweennn
    align-items: center
    font-size: 11px
    color: #9ca3af}
  .saved-date {
    font-size: 11px
   ;color: #9ca3af}
  :global(.category-badge) {
    font-size: 10px !important
    padding: 2px 6px !important
    height: auto !important}
  .empty-state {
    text-align: center
    padding: 48px 16px}
  .empty-message {
    font-size: 14px
    color: #6b7280
   ;margin: 0, 0 8px 0}
  .empty-submessage {
    font-size: 12px
    color: #9ca3af
   ;margin: 0, 0 16px 0
    line-height: 1.4}
</style>


