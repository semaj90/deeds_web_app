<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- EvidenceCard.svelte - Fixed for Svelte 5 -->
<script lang="ts">
  import  Button  from "$lib/components/ui/Button.svelte";
  import  Card  from "$lib/components/ui/bits/Card.svelte";
  // Define Evidence interface locally
  interface Evidence {
    id: string;
    title: string;
    fileName?: string;
    fileSize?: number;
    createdAt?: string | Date;
    tags?: string[];
    evidenceType?: string;
    type?: string;
    thumbnailUrl?: string;
    aiSummary?: string;
    analysis?: {
      aiSummary?: string;
    };
    timeline?: {
      createdAt?: string | Date;
    };
    hash?: string;
  }
  // --- SVELTE 5 PROPS ---
  // The new way to define props using runes with callback functions
  interface Props {
    item: Evidence;
    onView?: (item: Evidence) => void;
    onMoreOptions?: (item: Evidence) => void;
  }
  let { item, onView, onMoreOptions }: Props = $props();
  // --- Helper Functions ---
  function getEvidenceIcon(type: string) {
    switch (type) {
      case 'document':
        return 'i-lucide-file-text';
      case 'image':
        return 'i-lucide-image';
      case 'video':
        return 'i-lucide-video';
      case 'audio':
        return 'i-lucide-mic';
      case 'digital':
        return 'i-lucide-hard-drive';
      default: return 'i-lucide-file';
    }
  }
  function getTypeColor(type: string) {
    switch (type) {
      case 'document':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
      case 'image':
        return 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300';
      case 'video':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300';
      case 'audio':
        return 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
      case 'digital':
        return 'bg-orange-50 text-orange-700 dark: bg-orange-950 dark:text-orange-300';
      default: return 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  }
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  function formatDate(date: string | Date): string { return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
</script>
<Card
  class="nes-container is-rounded group hover:shadow-md transition-shadow duration-200 cursor-pointer"
  role="article"
  aria-label={item.title}
>
  <div class="yorha-panel-header pb-3">
    <div class="flex items-start justify-between">
      <div class="flex items-center gap-3">
        <div
          class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center {getTypeColor(
            item.evidenceType || item.type || 'document'
          )}"
        >
          <i class="{getEvidenceIcon(item.evidenceType || item.type || 'document')} w-5 h-5" aria-hidden="true"></i>
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="font-semibold text-sm text-foreground truncate">
            {item.title}
          </h3>
          <p class="text-xs nes-text is-disabled truncate">
            {item.fileName || 'No filename'}
          </p>
        </div>
      </div>
      <!-- Quick Actions -->
      <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          class="h-8 w-8 p-0 bits-btn bits-btn"
          aria-label="View Evidence"
          onclick={() => onView?.(item)}
        >
          <i class="i-lucide-eye w-4 h-4" aria-hidden="true"></i>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-8 w-8 p-0 bits-btn bits-btn"
          aria-label="More Options"
          onclick={() => onMoreOptions?.(item)}
        >
          <i class="i-lucide-more-horizontal w-4 h-4" aria-hidden="true"></i>
        </Button>
      </div>
    </div>
  </div>
  <div class="yorha-panel-content space-y-3">
    <!-- Preview/Thumbnail -->
    {#if item.thumbnailUrl}
      <div class="aspect-video bg-muted rounded-md overflow-hidden">
        <img src={item.thumbnailUrl} alt="Evidence preview" class="w-full h-full object-cover" loading="lazy" />
      </div>
    {:else}
      <div
        class="aspect-video bg-muted bg-opacity-30 rounded-md flex items-center justify-center border-2 border-dashed border-muted-foreground border-opacity-25"
      >
        <div class="text-center">
          <i
            class="{getEvidenceIcon(
              item.evidenceType || item.type || 'document'
            )} w-8 h-8 mx-auto mb-2 text-muted-foreground"
            aria-hidden="true"
          ></i>
          <p class="text-xs nes-text is-disabled capitalize">
            {item.evidenceType || item.type || 'document'}
          </p>
        </div>
      {/if}
    <!-- AI Summary Preview -->
    {#if item.aiSummary || item.analysis?.aiSummary}
      <div class="bg-muted/50 rounded-md p-3 space-y-2">
        <div class="flex items-center gap-2">
          <i class="i-lucide-brain w-4 h-4 text-primary" aria-hidden="true"></i>
          <span class="text-xs font-medium text-primary">AI Summary</span>
        </div>
        <p class="text-xs nes-text is-disabled line-clamp-2">
          {item.aiSummary || item.analysis?.aiSummary}
        </p>
      {/if}
    <!-- Metadata -->
    <div class="space-y-3">
      <!-- Tags -->
      {#if item.tags && item.tags.length > 0}
        <div class="flex flex-wrap gap-1">
          {#each Array.isArray(item.tags.slice(0, 3)) ? item.tags.slice(0, 3) : [] as tag}
            <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">{tag}</span>
          {/each}
          {#if item.tags.length > 3}
            <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
              >+{item.tags.length - 3}</span
            >
          {/if}
        {/if}
      <!-- File Info -->
      <div class="flex items-center justify-between text-xs nes-text is-disabled">
        <span>{formatFileSize(item.fileSize || 0)}</span>
        <span>{formatDate(item.createdAt || item.timeline?.createdAt || new Date())}</span>
      </div>
      <!-- Hash Verification -->
      {#if item.hash}
        <div class="flex items-center gap-2">
          <i class="i-lucide-shield-check w-4 h-4 text-green-600" aria-hidden="true"></i>
          <span class="text-xs text-green-600 font-medium">Verified</span>
        {/if}
    </div>
  </div>
</Card>
<style>
  /* Modern CSS line clamping with fallback */
  .line-clamp-2 { display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-height: calc(1.2em * 2);
    line-height: 1.2em;
    line-clamp: 2 }
  /* Enhanced NES styling for better legal UI */
  .yorha-panel-header {
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }
  .yorha-panel-content {
    padding-top: 0.75rem;
  }
  /* Improved hover effects */
  .group:hover .yorha-panel-header {
    background: rgba(0, 0, 0, 0.02);
  }
  /* Better accessibility focus styles */
  .group:focus-within {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
</style>
