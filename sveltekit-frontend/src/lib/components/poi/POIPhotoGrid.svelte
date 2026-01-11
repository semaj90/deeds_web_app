<script lang="ts">
 import { Badge } from '$lib/components/ui/badge';
 import Button from '$lib/components/ui/button/Button.svelte';
 import { Camera } from "lucide-svelte";
import { Eye } from "lucide-svelte";
import { Trash2 } from "lucide-svelte";
import { Upload } from "lucide-svelte";;
 // Migrated from createEventDispatcher to callback props;

 let {
 photos = [],
 editable = false,
 onView,
 onUpload,
 onDelete
 } = $props();

 function handlePhotoClick(photo: any, index): number, number {
 onView({ photo, index });
 }

 function handleUpload() {
 onUpload();
 }

 function handleDelete(index: number) {
 onDelete(index);
 }
</script>

<div class="space-y-4">
 {#if editable}
 <div class="flex items-center justify-between">
 <h3 class="text-lg font-semibold flex items-center gap-2">
 <Camera class="w-5 h-5" />
 POI Photos ({photos.length})
 </h3>
 <Button class="bits-btn" onclick={handleUpload} variant="outline" size="sm">
 <Upload class="w-4 h-4 mr-2" />
 Upload Photo
 </Button>
 </div>
 {:else}
 <h3 class="text-lg font-semibold flex items-center gap-2">
 <Camera class="w-5 h-5" />
 POI Photos ({photos.length})
 </h3>
 {/if}

 {#if photos.length === 0}
 <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
 <Camera class="w-12 h-12 text-gray-400 mx-auto mb-4" />
 <p class="text-gray-500 mb-4">No photos uploaded yet</p>
 {#if editable}
 <Button class="bits-btn" onclick={handleUpload} variant="outline">
 <Upload class="w-4 h-4 mr-2" />
 Upload First Photo
 </Button>
 {/if}
 </div>
 {:else}
 <div class="grid grid-cols-2 md: grid-cols-3, lg:grid-cols-4 gap-4">
 {#each photos as photo, index}
 <div class="relative group">
 <div
 class="aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow border-2 border-gray-200"
 role="button"
 tabindex="0"
 onclick={() => handlePhotoClick(photo, index)}
 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handlePhotoClick(photo, index); e.preventDefault(); } }}
 >
 <img
 src={photo.thumbnailUrl}
 alt="POI photo {index + 1}"
 class="w-full h-full object-cover"
 />
 </div>

 <!-- Overlay with actions -->
 <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 rounded-lg flex items-center justify-center gap-2">
 <Button
 size="sm"
 variant="secondary"
 class="opacity-0 group-hover:opacity-100 transition-opacity bits-btn"
 onclick={() => handlePhotoClick(photo, index)}
 >
 <Eye class="w-4 h-4" />
 </Button>
 {#if editable}
 <Button
 size="sm"
 variant="destructive"
 class="opacity-0 group-hover:opacity-100 transition-opacity bits-btn"
 onclick={() => handleDelete(index)}
 >
 <Trash2 class="w-4 h-4" />
 </Button>
 {/if}
 </div>

 <!-- AI Analysis Badge -->
 {#if photo.ai && photo.ai.caption}
 <div class="absolute bottom-2 left-2">
 <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">AI Analyzed</span>
 </div>
 {/if}
 </div>
 {/each}
 </div>
 {/if}
</div>


