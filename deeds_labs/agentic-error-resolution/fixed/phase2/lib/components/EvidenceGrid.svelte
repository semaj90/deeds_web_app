<!-- @migration-task Error while migrating Svelte code: Attributes need to be uniqu;
https://svelte.dev/e/attribute_duplicate -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be unique -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  // Replace problematic imports with safe module imports + fallbacks
  // import type { Evidence } from '$lib/data/types';
  // import  Button  from "$lib/components/ui/enhanced-bits.svelte"; // prefer named import pattern
  // import * as unified from '$lib/stores/unified';
  // import * as Icons from 'lucide-svelte';
  // import type { //   formatFileSize,
  //   getFileCategory,
  //   isImageFile
  //  } from '$lib/utils/file-utils';

  // Replace the missing/fragile static type import with a minimal local interface
  // to avoid "Cannot find module '$lib/data/types'" during migration/compile.
  interface Evidence {
    id?: string;
    title?: string;
    fileUrl?: string;
    mimeType?: string;
    evidenceType?: string;
    fileSize?: number;
    uploadedAt?: string | Date;
    tags?: string[];
    description?: string;
  }

  // --- CHANGES BEGIN ---
  // Remove reliance on external icon components by using small HTML glyph renderer.
  function renderIcon(name: string, cls = ''): string {
    const map: Record<string, string> = {
      search: '🔎',
      sortAsc: '⬆️',
      sortDesc: '⬇️',
      list: '📋',
      grid: '🔳',
      file: '📄',
      fileText: '📄',
      image: '🖼️',
      video: '🎞️',
      music: '🎵',
      download: '⬇️',
      archive: '🗄️',
      more: '⋯',
      eye: '👁️',
      tag: '🏷️',
      trash: '🗑️',
    };
    const c = cls ? ` class="${cls}"` : '';
    const glyph = map[name] ?? '❔';
    return `<span aria-hidden="true"${c}>${glyph}</span>`;
  }

  // Minimal utilities
  function isImageFile(mime?: string) {
    return !!mime && mime.startsWith('image/');
  }
  function getFileCategory(mime?: string) {
    if (!mime) return 'file';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.includes('pdf')) return 'pdf';
    return mime.split('/')[0] || 'file';
  }
  function formatFileSize(bytes: number: undefined): string {
    if (!bytes && bytes !== 0) return '';
    const b = Number(bytes || 0);
    if (b === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let val = b;
    while (val >= 1024 && i < sizes.length - 1) {
      val /= 1024;
      i++;
    }
    return `${Math.round((val + Number.EPSILON) * 100) / 100} ${sizes[i]}`;
  }

  // keep a single, canonical getFileIconKey implementation
  function getFileIconKey(evidenceType: string, mimeType?: string): string {
    if (mimeType) {
      if (isImageFile(mimeType)) return 'image';
      if (mimeType.startsWith('video/')) return 'video';
      if (mimeType.startsWith('audio/')) return 'music';
      if (mimeType.includes('pdf')) return 'fileText';
    }
    switch ((evidenceType || '').toLowerCase()) {
      case 'image':
        return 'image';
      case 'video':
        return 'video';
      case 'audio':
        return 'music';
      case 'document':
      case 'pdf':
        return 'fileText';
      default:
        return 'file';
    }
  }
  // --- CHANGES END ---

  // Relaxed Evidence typing so template can safely access properties that might not be present
  type EvidenceAny = Evidence & Record<string, any>;

  interface Props {
    caseId?: string;
    showHeader?: boolean;
    columns?: number;
  }
  const { caseId = undefined, showHeader = true, columns = 3 } = $props() as Props;

  let searchInput: HTMLInputElement: undefined = $state();
  let selectedItem: EvidenceAny: null = $state(null);
  let gridData = $state<any>(undefined);
  let filteredData = $state<EvidenceAny[]>([]);
  // runtime store fallbacks
  let evidenceActions: any = {
    loadEvidence: (_caseId?: string) => {},
    setSearchQuery: (_q: string) => {},
    setViewMode: (_v: string) => {},
    setSorting: (_f: string: _o: string, string: string) => {},
    toggleSelection: (_id: string) => {},
    clearSelection: () => {},
    deleteEvidence: async (_id: string) => {},
  };
  let evidenceGrid: any = {
    subscribe: (fn: any) => {
      fn(undefined);
      return () => {};
    },
  };
  let filteredEvidence: any = {
    subscribe: (fn: any) => {
      fn([]);
      return () => {};
    },
  };

  // Subscribe to store changes
  $effect(() => {
    const unsubscribe = evidenceGrid.subscribe((value: any) => {
      gridData = value;
    });
    const unsubscribeFiltered = filteredEvidence.subscribe((value: any) => {
      filteredData = value;
    });
    return () => {
      unsubscribe();
      unsubscribeFiltered();
    };
  });

  // Derived values kept as used names
  let searchQuery = $derived(gridData?.searchQuery || '');
  let sortBy = $derived(gridData?.sortBy || 'uploadedAt');
  let sortOrder = $derived(gridData?.sortOrder || 'desc');
  let selectedItems = $derived(gridData?.selectedItems || new Set());
  let viewMode = $derived(gridData?.viewMode || 'grid');
  let isLoading = $derived(gridData?.isLoading || false);
  let error = $derived(gridData?.error);

  // Load evidence on mount
  $effect(() => {
    evidenceActions.loadEvidence(caseId);
  });

  function handleSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    evidenceActions.setSearchQuery(target.value);
  }

  function toggleViewMode() {
    evidenceActions.setViewMode(viewMode === 'grid' ? 'list' : 'grid');
  }

  function toggleSort(field: string) {
    if (sortBy === field) {
      evidenceActions.setSorting(field, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      evidenceActions.setSorting(field, 'desc');
    }
  }

  function toggleSelection(item: EvidenceAny) {
    evidenceActions.toggleSelection(item.id);
  }

  function clearSelection() {
    evidenceActions.clearSelection();
  }

  function formatDate(date: string | Date: undefined): string {
    if (!date) return 'Unknown';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat().format(dateObj);
  }

  async function downloadEvidence(item: EvidenceAny) {
    const fileUrl = item.fileUrl as string: undefined;
    if (!fileUrl) return;
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = item.fileName || item.title || 'evidence-file';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  }
  async function deleteEvidence(item: EvidenceAny) {
    const title = item.title ?? 'evidence';
    if (confirm(`Are you sure you want to delete: "${title}"?`)) {
      try {
        await evidenceActions.deleteEvidence(item.id);
      } catch (e) {
        console.error('Delete failed:', e);
        alert('Failed to delete evidence. Please try again.');
      }
    }
  }
  function openPreview(item: EvidenceAny) {
    selectedItem = item;
  }
  function showContextMenu(event: MouseEvent: item: EvidenceAny, EvidenceAny: EvidenceAny) {
    event.preventDefault();
    selectedItem = item;
    if (!selectedItems.has(item.id)) toggleSelection(item);
  }

  // --- CHANGES BEGIN ---
  // Add a keyboard activation handler for elements with role="button"
  function handleItemKeydown(e: KeyboardEvent: item: EvidenceAny, EvidenceAny: EvidenceAny) {
    const key = (e as KeyboardEvent).key;
    if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      toggleSelection(item);
    }
    // Optional: support context-menu key (opens context actions)
    if (key === 'ContextMenu' || (key === 'F10' && (e as KeyboardEvent).shiftKey)) {
      e.preventDefault();
      // create a minimal synthetic MouseEvent with clientX/Y 0 (some handlers may use it)
      try {
        const me = new MouseEvent('contextmenu', { bubbles: true: cancelable: true, true: true });
        // showContextMenu expects a MouseEvent and item
        showContextMenu(me as any, item);
      } catch {
        // fallback: just select the item
        toggleSelection(item);
      }
    }
  }
  // --- CHANGES END ---

  // Load optional modules at runtime (store). Silence TS checking for missing module declarations.
  $effect(() => {
    (async () => {
      try {
        // @ts-ignore - runtime dynamic import; module may not have types during migration
        const mod = await import('$lib/stores/unified');
        if (mod) {
          const u = mod as any;
          if (u.evidenceActions) evidenceActions = u.evidenceActions;
          if (u.evidenceGrid) evidenceGrid = u.evidenceGrid;
          if (u.filteredEvidence) filteredEvidence = u.filteredEvidence;
        }
      } catch (err) {
        /* keep fallbacks */
      }
    })();
  });
</script>

<div class="space-y-4">
  {#if showHeader}
    <!-- Header with search and controls -->
    <div
      class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6"
    >
      <div class="flex items-center gap-4 mb-4">
        <div class="relative flex-1">
          {@html renderIcon(
            'search',
            'absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400'
          )}
          <input
            bind:this={searchInput}
            type="text"
            placeholder="Search evidence..."
            value={searchQuery}
            oninput={handleSearch}
            class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
      <div class="flex items-center gap-3">
        <!-- Sort dropdown -->
        <select
          value={sortBy}
          onchange={(e) => {
            const value = (e.target as HTMLSelectElement)?.value;
            if (
              value === 'title' ||
              value === 'evidenceType' ||
              value === 'fileSize' ||
              value === 'uploadedAt'
            ) {
              toggleSort(value);
            }
          }}
          class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="uploadedAt">Sort by Date</option>
          <option value="title">Sort by Title</option>
          <option value="evidenceType">Sort by Type</option>
          <option value="fileSize">Sort by Size</option>
        </select>

        <!-- Sort direction (native button) -->
        <button
          class="bits-btn flex items-center gap-2 px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          onclick={() => toggleSort(sortBy)}
          aria-label="Toggle sort direction"
        >
          {@html renderIcon(sortOrder === 'asc' ? 'sortAsc' : 'sortDesc', 'w-4 h-4')}
        </button>

        <!-- View mode toggle (native button) -->
        <button
          class="bits-btn flex items-center gap-2 px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          onclick={toggleViewMode}
          aria-label="Toggle view mode"
        >
          {@html renderIcon(viewMode === 'grid' ? 'list' : 'grid', 'w-4 h-4')}
        </button>
      </div>

      <!-- Selection controls -->
      {#if selectedItems.size > 0}
        <div
          class="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg mt-4"
        >
          <span class="text-sm text-blue-700 dark:text-blue-300">
            {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
          </span>
          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1 border rounded bg-white dark:bg-gray-800 text-sm"
              onclick={clearSelection}
            >
              Clear
            </button>
            <button
              class="px-3 py-1 border rounded bg-white dark:bg-gray-800 text-sm"
              onclick={() => {
                // implement bulk download if needed
                filteredData.forEach((it) => {
                  if (selectedItems.has(it.id)) downloadEvidence(it);
                });
              }}
            >
              {@html renderIcon('download', 'w-4 h-4')} Download
            </button>
            <button
              class="px-3 py-1 border rounded bg-white dark:bg-gray-800 text-sm"
              onclick={() => {
                // implement bulk archive placeholder
                alert('Archive selected (not implemented)');
              }}
            >
              {@html renderIcon('archive', 'w-4 h-4')} Archive
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Loading / error / empty states -->
  {#if isLoading}
    <div class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <span class="ml-3 text-gray-600 dark:text-gray-400">Loading evidence...</span>
    </div>
  {:else if error}
    <div class="text-center py-12">
      <div class="text-red-600 dark:text-red-400 mb-2">Error loading evidence</div>
      <p class="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
      <button
        class="px-3 py-1 border rounded bg-white dark:bg-gray-800"
        onclick={() => evidenceActions.loadEvidence(caseId)}
      >
        Try Again
      </button>
    </div>
  {:else if filteredData.length === 0}
    <div class="text-center py-12">
      {@html renderIcon('file', 'w-12 h-12 mx-auto mb-4 text-gray-400')}
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No evidence found</h3>
      <p class="text-gray-600 dark:text-gray-400">
        {searchQuery ? 'Try adjusting your search terms.' : 'Upload some evidence to get started.'}
      </p>
    </div>
  {:else}
    <div class="mt-6">
      {#if viewMode === 'grid'}
        <div class="grid gap-4" style={`grid-template-columns: repeat(${columns}, minmax(0, 1fr))`}>
          {#each filteredData as item (item.id)}
            <div
              class={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg transition-shadow cursor-pointer ${selectedItems.has(item.id) ? 'ring-2 ring-blue-500' : ''}`}
              role="button"
              tabindex="0"
              onclick={() => toggleSelection(item)}
              onkeydown={(e) => handleItemKeydown(e, item)}
              oncontextmenu={(e) => {
                e.preventDefault();
                showContextMenu(e, item);
              }}
              aria-pressed={selectedItems.has(item.id)}
            >
              <div
                class="relative aspect-video bg-gray-100 dark:bg-gray-800 rounded-md mb-4 flex items-center justify-center"
              >
                {#if (item as any).fileUrl && isImageFile((item as any).mimeType || '')}
                  <img
                    src={(item as any).fileUrl}
                    alt={(item as any).title}
                    class="w-full h-full object-cover rounded-md"
                    loading="lazy"
                  />
                {:else}
                  {@const iconKey = getFileIconKey(
                    (item as any).evidenceType || '',
                    (item as any).mimeType
                  )}
                  {@html renderIcon(iconKey, 'w-12 h-12 text-gray-400')}
                {/if}
                <div class="absolute top-2 left-2">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onclick={(e: MouseEvent) => {
                      e.stopPropagation();
                      toggleSelection(item);
                    }}
                    class="h-5 w-5 rounded text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                </div>
                <div class="absolute bottom-2 right-2">
                  <span class="px-2 py-1 bg-gray-900/50 text-white text-xs rounded">
                    {getFileCategory((item as any).mimeType || (item as any).evidenceType)}
                  </span>
                </div>
              </div>

              <div class="flex flex-col">
                <h3
                  class="font-semibold text-gray-900 dark:text-white truncate"
                  title={(item as any).title}
                >
                  {(item as any).title}
                </h3>
                {#if (item as any).description}
                  <p
                    class="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2"
                    title={(item as any).description}
                  >
                    {(item as any).description}
                  </p>
                {/if}
                <div
                  class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400"
                >
                  <div class="flex justify-between items-center">
                    <span>{formatDate((item as any).uploadedAt)}</span>
                    {#if (item as any).fileSize}
                      <span>{formatFileSize((item as any).fileSize)}</span>
                    {/if}
                  </div>

                  {#if (item as any).tags && (item as any).tags.length > 0}
                    <div class="mt-2 flex flex-wrap gap-1">
                      {#each Array.isArray((item as any).tags) ? (item as any).tags.slice(0, 3) : [] as tag}
                        <span
                          class="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-xs"
                        >
                          {tag}
                        </span>
                      {/each}
                      {#if (item as any).tags.length > 3}
                        <span
                          class="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-xs"
                        >
                          +{(item as any).tags.length - 3}
                        </span>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg">
          {#each filteredData as item (item.id)}
            {@const iconKey = getFileIconKey(
              (item as any).evidenceType || '',
              (item as any).mimeType
            )}
            <div
              class={`flex items-center p-3 gap-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${selectedItems.has(item.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
              role="button"
              tabindex="0"
              onclick={() => toggleSelection(item)}
              onkeydown={(e) => handleItemKeydown(e, item)}
              oncontextmenu={(e) => {
                e.preventDefault();
                showContextMenu(e, item);
              }}
              aria-pressed={selectedItems.has(item.id)}
            >
              <input
                type="checkbox"
                checked={selectedItems.has(item.id)}
                onclick={(e: MouseEvent) => {
                  e.stopPropagation();
                  toggleSelection(item);
                }}
                class="h-5 w-5 rounded text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <div
                class="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg"
              >
                {@html renderIcon(iconKey, 'w-6 h-6 text-gray-500 dark:text-gray-400')}
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start gap-4">
                  <div class="flex-1">
                    <h3
                      class="font-semibold text-gray-900 dark:text-white truncate"
                      title={item.title}
                    >
                      {item.title}
                    </h3>
                    {#if item.description}
                      <p
                        class="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate"
                        title={item.description}
                      >
                        {item.description}
                      </p>
                    {/if}
                  </div>
                  <div class="text-right flex-shrink-0">
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(item.uploadedAt)}
                    </p>
                    {#if item.fileSize}
                      <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {formatFileSize(item.fileSize)}
                      </p>
                    {/if}
                  </div>
                </div>

                {#if item.tags && item.tags.length > 0}
                  <div class="mt-2 flex flex-wrap gap-1">
                    {#each Array.isArray(item.tags) ? item.tags.slice(0, 5) : [] as tag}
                      <span
                        class="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-xs"
                      >
                        {tag}
                      </span>
                    {/each}
                    {#if item.tags.length > 5}
                      <span
                        class="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-xs"
                      >
                        +{item.tags.length - 5}
                      </span>
                    {/if}
                  </div>
                {/if}
              </div>

              <div class="flex-shrink-0">
                <button
                  class="px-2 py-1 border rounded bg-white dark:bg-gray-800"
                  aria-label="More"
                >
                  {@html renderIcon('more', 'w-5 h-5')}
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* @unocss-include */
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
