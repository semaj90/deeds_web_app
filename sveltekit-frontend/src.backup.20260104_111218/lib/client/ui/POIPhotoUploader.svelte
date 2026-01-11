<script lang="ts">
 import Button from '$lib/components/ui/button';
 import { Camera } from "lucide-svelte";
import { Upload } from "lucide-svelte";;

 let { poiId, disabled = false, onUpload, onError } = $props<{ poiId: number; disabled?: boolean; onUpload: (data: any) => void; onError: (error: any) => void }>();

 let dragging = $state(false);
 let uploading = $state(false);

 async function handleDrop(event: DragEvent) {
 event.preventDefault();
 dragging = false;

 if (disabled || uploading) return;

 const files = event.dataTransfer?.files;
 if (files && files.length > 0) {
 await uploadFiles(Array.from(files));
 }
 }

 async function handleFileSelect(event: Event) {
 const target = event.target as HTMLInputElement;
 const files = target.files;
 if (files && files.length > 0) {
 await uploadFiles(Array.from(files));
 }
 // Reset input
 target.value = '';
 }

 async function uploadFiles(files: File[]) {
 uploading = true;

 try {
 for (const file of files) {
 if (!file.type.startsWith('image/')) {
 console.warn('Skipping non-image file:', file.name);
 continue;
 }

 const formData = new FormData();
 formData.append('file', file);
 formData.append('poiId', String(poiId));

 const response = await fetch('/api/v1/poi/photo', {
 method: 'POST',
 body: formData
 });

 if (!response.ok) {
 throw new Error(`Upload failed: ${response.statusText}`);
 }

 const result = await response.json();
 onUpload(result.data);
 }
 } catch (error) {
 console.error('Upload error:', error);
 onError({ error: error.message });
 } finally {
 uploading = false;
 }
 }

 function triggerFileSelect() {
 const input = document.createElement('input');
 input.type = 'file';
 input.multiple = true;
 input.accept = 'image/*';
 input.onchange = handleFileSelect;
 input.click();
 }
</script>

<div class="w-full">
 <!-- Drop Zone -->
 <div
 class="relative border-2 border-dashed rounded-lg p-8 text-center transition-colors"
 class:border-gray-300={!dragging && !disabled}
 class:border-blue-500={dragging && !disabled}
 class:border-gray-200={disabled}
 class:bg-gray-50={dragging && !disabled}
 class:bg-gray-100={disabled}
 role="button"
 tabindex="0"
 aria-label="Drop zone for POI photos"
 ondragover={(e) => { e.preventDefault(); if (!disabled && !uploading) dragging = true }}
 ondragleave={() => dragging = false}
 ondrop={handleDrop}
 >
 {#if uploading}
 <div class="flex flex-col items-center gap-4">
 <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
 <p class="text-gray-600">Uploading photos...</p>
 </div>
 {:else if disabled}
 <div class="flex flex-col items-center gap-4">
 <Camera class="w-12 h-12 text-gray-400" />
 <p class="text-gray-500">Photo upload disabled</p>
 </div>
 {:else}
 <div class="flex flex-col items-center gap-4">
 <Upload class="w-12 h-12 text-gray-400" />
 <div>
 <p class="text-lg font-medium text-gray-700">Drop POI photos here</p>
 <p class="text-gray-500">or</p>
 <Button
 type="button"
 variant="outline"
 onclick={triggerFileSelect}
 class="mt-2"
 >
 <Camera class="w-4 h-4 mr-2" />
 Browse Files
 </Button>
 </div>
 <p class="text-sm text-gray-500">Supports JPG, PNG, GIF up to 10MB each</p>
 </div>
 {/if}
 </div>
</div>
