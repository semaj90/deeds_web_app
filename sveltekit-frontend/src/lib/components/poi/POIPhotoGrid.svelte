<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  interface Photo {
    url?: string;
    thumbnailUrl?: string | null;
    aiCaption?: string | null;
    ai?: {
      caption?: string;
    };
  }

  interface Props {
    photos?: Photo[];
    editable?: boolean;
    onview?: (photo: Photo) => void;
    onupload?: () => void;
    ondelete?: (index: number) => void;
  }

  let {
    photos = [],
    editable = false,
    onview,
    onupload,
    ondelete
  }: Props = $props();

  let failedSrcs = $state(new Set<string>());

  function handlePhotoClick(photo: Photo, index: number) {
    onview?.(photo);
  }

  function handleUpload() {
    onupload?.();
  }

  function handleDelete(index: number) {
    ondelete?.(index);
  }
</script>

<div class="space-y-4">
  {#if editable}
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold flex items-center gap-2">
        <span class="i-lucide-camera w-5 h-5 inline-block"></span>
        POI Photos ({photos.length})
      </h3>
      <Button class="bits-btn" onclick={handleUpload} variant="outline" size="sm">
        <span class="i-lucide-upload w-4 h-4 mr-2 inline-block"></span>
        Upload Photo
      </Button>
    </div>
  {:else}
    <h3 class="text-lg font-semibold flex items-center gap-2">
      <span class="i-lucide-camera w-5 h-5 inline-block"></span>
      POI Photos ({photos.length})
    </h3>
  {/if}

  {#if photos.length === 0}
    <div class="border-2 border-dashed border-sand/20 rounded-lg p-8 text-center">
      <span class="i-lucide-camera w-12 h-12 text-sand/40 mx-auto mb-4 inline-block"></span>
      <p class="text-sand/60 mb-4">No photos uploaded yet</p>
      {#if editable}
        <Button class="bits-btn" onclick={handleUpload} variant="outline">
          <span class="i-lucide-upload w-4 h-4 mr-2 inline-block"></span>
          Upload First Photo
        </Button>
      {/if}
    </div>
  {:else}
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {#each photos as photo, index}
        <div class="relative group">
          <div
            class="aspect-square bg-sand/10 rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow border-2 border-sand/20"
            role="button"
            tabindex="0"
            onclick={() => handlePhotoClick(photo, index)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                handlePhotoClick(photo, index);
                e.preventDefault();
              }
            }}
          >
            {#if failedSrcs.has(photo.thumbnailUrl ?? photo.url ?? '')}
              <div class="w-full h-full flex flex-col items-center justify-center text-sand/40">
                <span class="i-lucide-image-off w-8 h-8 inline-block mb-1"></span>
                <span class="text-xs">Unavailable</span>
              </div>
            {:else}
              <img
                src={photo.thumbnailUrl ?? photo.url ?? ''}
                alt="POI photo {index + 1}"
                class="w-full h-full object-cover"
                onerror={() => { failedSrcs = new Set([...failedSrcs, photo.thumbnailUrl ?? photo.url ?? '']); }}
              />
            {/if}
          </div>

          <!-- Overlay with actions -->
          <div
            class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 rounded-lg flex items-center justify-center gap-2"
          >
            <Button
              size="sm"
              variant="secondary"
              class="opacity-0 group-hover:opacity-100 transition-opacity bits-btn"
              onclick={() => handlePhotoClick(photo, index)}
            >
              <span class="i-lucide-eye w-4 h-4 inline-block"></span>
            </Button>
            {#if editable}
              <Button
                size="sm"
                variant="destructive"
                class="opacity-0 group-hover:opacity-100 transition-opacity bits-btn"
                onclick={() => handleDelete(index)}
              >
                <span class="i-lucide-trash-2 w-4 h-4 inline-block"></span>
              </Button>
            {/if}
          </div>

          <!-- AI Analysis Badge -->
          {#if photo.ai?.caption || photo.aiCaption}
            <div class="absolute bottom-2 left-2">
              <span class="px-2 py-1 rounded text-xs font-medium bg-sand/10 text-sand/80"
                >AI Analyzed</span
              >
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
