<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Dialog, DialogContent } from '$lib/components/ui/dialog';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
  import { Camera, ChevronLeft, ChevronRight, Download, Eye, X, ZoomIn, ZoomOut } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';

  export let photos: any[] = [];
  export let currentIndex: number = 0;
  export let open: boolean = false;

  const dispatch = createEventDispatcher();

  let zoomLevel = 1;
  let imageRef: HTMLImageElement;

  $: currentPhoto = photos[currentIndex];

  function close() {
    open = false;
    zoomLevel = 1;
    dispatch('close');
  }

  function nextPhoto() {
    if (currentIndex < photos.length - 1) {
      currentIndex++;
      zoomLevel = 1;
    }
  }

  function prevPhoto() {
    if (currentIndex > 0) {
      currentIndex--;
      zoomLevel = 1;
    }
  }

  function zoomIn() {
    zoomLevel = Math.min(zoomLevel * 1.2, 3);
  }

  function zoomOut() {
    zoomLevel = Math.max(zoomLevel / 1.2, 0.5);
  }

  function downloadPhoto() {
    if (currentPhoto) {
      const link = document.createElement('a');
      link.href = currentPhoto.url;
      link.download = currentPhoto.originalName;
      link.click();
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }
</script>

<Dialog bind:open>
  <DialogContent class="max-w-7xl h-[90vh] p-0 overflow-hidden">
    <div class="flex h-full">
      <!-- Main Image Viewer -->
      <div class="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        {#if currentPhoto}
          <img
            bind:this={imageRef}
            src={currentPhoto.url}
            alt={currentPhoto.originalName}
            class="max-w-full max-h-full object-contain transition-transform duration-200"
            style="transform: scale({zoomLevel})"
            on:keydown={(e) => {
              if (e.key === 'ArrowLeft') prevPhoto();
              if (e.key === 'ArrowRight') nextPhoto();
              if (e.key === '+') zoomIn();
              if (e.key === '-') zoomOut();
            }}
            tabindex="0"
          />

          <!-- Navigation Arrows -->
          {#if photos.length > 1}
            <button
              class="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
              on:click={prevPhoto}
              disabled={currentIndex === 0}
            >
              <ChevronLeft class="w-6 h-6" />
            </button>
            <button
              class="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
              on:click={nextPhoto}
              disabled={currentIndex === photos.length - 1}
            >
              <ChevronRight class="w-6 h-6" />
            </button>
          {/if}

          <!-- Zoom Controls -->
          <div class="absolute top-4 right-4 flex gap-2">
            <Button variant="secondary" size="sm" on:click={zoomOut} disabled={zoomLevel <= 0.5}>
              <ZoomOut class="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="sm" on:click={zoomIn} disabled={zoomLevel >= 3}>
              <ZoomIn class="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="sm" on:click={downloadPhoto}>
              <Download class="w-4 h-4" />
            </Button>
          </div>

          <!-- Photo Counter -->
          {#if photos.length > 1}
            <div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
              {currentIndex + 1} / {photos.length}
            </div>
          {/if}
        {/if}
      </div>

      <!-- Metadata Panel -->
      <div class="w-96 bg-gray-50 dark:bg-gray-900 border-l overflow-y-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">Photo Analysis</h3>
            <Button variant="ghost" size="sm" on:click={close}>
              <X class="w-4 h-4" />
            </Button>
          </div>

          {#if currentPhoto}
            <Tabs defaultValue="overview" class="w-full">
              <TabsList class="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" class="space-y-4">
                <Card>
                  <CardHeader class="pb-3">
                    <CardTitle class="text-sm flex items-center gap-2">
                      <Camera class="w-4 h-4" />
                      Photo Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent class="space-y-2 text-sm">
                    <div class="flex justify-between">
                      <span class="text-gray-600">Filename:</span>
                      <span class="font-mono">{currentPhoto.originalName}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-600">Size:</span>
                      <span>{formatFileSize(currentPhoto.size)}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-600">Type:</span>
                      <span>{currentPhoto.mimeType}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-600">Uploaded:</span>
                      <span>{formatDate(currentPhoto.uploadedAt)}</span>
                    </div>
                  </CardContent>
                </Card>

                {#if currentPhoto.forensicData?.dimensions}
                  <Card>
                    <CardHeader class="pb-3">
                      <CardTitle class="text-sm">Dimensions</CardTitle>
                    </CardHeader>
                    <CardContent class="text-sm">
                      <div class="flex justify-between">
                        <span class="text-gray-600">Resolution:</span>
                        <span>{currentPhoto.forensicData.dimensions.width} × {currentPhoto.forensicData.dimensions.height}</span>
                      </div>
                      {#if currentPhoto.forensicData.imageQuality}
                        <div class="flex justify-between">
                          <span class="text-gray-600">Quality:</span>
                          <Badge variant={currentPhoto.forensicData.imageQuality === 'high' ? 'default' : 'secondary'}>
                            {currentPhoto.forensicData.imageQuality}
                          </Badge>
                        </div>
                      {/if}
                    </CardContent>
                  </Card>
                {/if}
              </TabsContent>

              <TabsContent value="analysis" class="space-y-4">
                {#if currentPhoto.aiCaption}
                  <Card>
                    <CardHeader class="pb-3">
                      <CardTitle class="text-sm flex items-center gap-2">
                        <Eye class="w-4 h-4" />
                        AI Caption
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {currentPhoto.aiCaption}
                      </p>
                    </CardContent>
                  </Card>
                {/if}

                {#if currentPhoto.aiTags && currentPhoto.aiTags.length > 0}
                  <Card>
                    <CardHeader class="pb-3">
                      <CardTitle class="text-sm">AI Tags</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div class="flex flex-wrap gap-2">
                        {#each currentPhoto.aiTags as tag}
                          <Badge variant="outline">{tag}</Badge>
                        {/each}
                      </div>
                    </CardContent>
                  </Card>
                {/if}

                {#if currentPhoto.forensicData}
                  <Card>
                    <CardHeader class="pb-3">
                      <CardTitle class="text-sm">Forensic Analysis</CardTitle>
                    </CardHeader>
                    <CardContent class="space-y-2 text-sm">
                      {#if currentPhoto.forensicData.perceptualHash}
                        <div class="flex justify-between">
                          <span class="text-gray-600">Perceptual Hash:</span>
                          <span class="font-mono text-xs">{currentPhoto.forensicData.perceptualHash}</span>
                        </div>
                      {/if}
                      {#if currentPhoto.forensicData.lightingConditions}
                        <div class="flex justify-between">
                          <span class="text-gray-600">Lighting:</span>
                          <Badge variant="outline">{currentPhoto.forensicData.lightingConditions}</Badge>
                        </div>
                      {/if}
                    </CardContent>
                  </Card>
                {/if}
              </TabsContent>

              <TabsContent value="metadata" class="space-y-4">
                {#if currentPhoto.exifData && Object.keys(currentPhoto.exifData).length > 0}
                  <Card>
                    <CardHeader class="pb-3">
                      <CardTitle class="text-sm flex items-center gap-2">
                        <Camera class="w-4 h-4" />
                        EXIF Data
                      </CardTitle>
                    </CardHeader>
                    <CardContent class="space-y-2 text-sm">
                      {#each Object.entries(currentPhoto.exifData) as [key, value]}
                        <div class="flex justify-between">
                          <span class="text-gray-600">{key}:</span>
                          <span class="font-mono text-xs">{String(value)}</span>
                        </div>
                      {/each}
                    </CardContent>
                  </Card>
                {:else}
                  <Card>
                    <CardContent class="text-center py-8 text-gray-500">
                      <Camera class="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No EXIF data available</p>
                    </CardContent>
                  </Card>
                {/if}
              </TabsContent>
            </Tabs>
          {/if}
        </div>
      </div>
    </div>
  </DialogContent>
</Dialog>

<style>
  /* Ensure image doesn't overflow on zoom */
  img {
    image-rendering: -webkit-optimize-contrast;
    image-rendering: crisp-edges;
  }

  /* Custom scrollbar for metadata panel */
  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }

  .overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb {
    background: #cbd5e0;
    border-radius: 3px;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: #a0aec0;
  }
</style>