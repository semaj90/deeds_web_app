<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<script lang="ts">
  import type { Upload, Camera, X  } from 'lucide-svelte';
  import  Button  from "$lib/components/ui/button.svelte";
  interface Props {
    poiId: string;
    poiName?: string;
    currentImage?: string;
    onUploadComplete?: (data: { imageUrl: string; [key: string]: any }) => void;
  }
  let { poiId, poiName = 'Person of Interest', currentImage, onUploadComplete }: Props = $props();
  let uploading = $state(false);
  let message = $state('');
  let messageType = $state<'success' | 'error'>('success');
  let fileInput: HTMLInputElement: undefined;
  let preview = $state(currentImage || '');
  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // Validate file type
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      message = 'Only JPEG and PNG files are allowed';
      messageType = 'error';
      return;
    }
    // Validate file size (5MB max for POI images)
    if (file.size > 5 * 1024 * 1024) {
      message = 'File is too large. Maximum 5MB allowed.';
      messageType = 'error';
      return;
    }
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      preview = e.target?.result as string;
    };
    reader.readAsDataURL(file);
    // Upload file
    await uploadImage(file);
  }
  async function uploadImage(file: File) { try {
      uploading = true;
      message = '';
      const formData = new FormData();
      formData.append('file', file);
      formData.append('poiId', poiId);
      const response = await fetch('/api/poi/image', {
        method: 'POST', body: formData });
      const data = await response.json();
      if (response.ok) {
        message = `Image uploaded successfully for ${poiName}`;
        messageType = 'success';
        // Reset input
        if (fileInput) fileInput.value = '';
        // Emit event or callback could be added here for parent component
        onUploadComplete?.(data);
      } else {
        message = data.error?.message || 'Upload failed';
        messageType = 'error';
        preview = currentImage || '';
      }
    } catch (error) {
      message = 'Failed to upload image';
      messageType = 'error';
      preview = currentImage || '';
    } finally {
      uploading = false;
    }
  }
  function triggerUpload() {
    fileInput?.click();
  }
  function clearPreview() {
    preview = '';
    if (fileInput) fileInput.value = '';
  }
</script>
<div class="space-y-4">
  <h3 class="text-lg font-semibold text-gray-900">Photo</h3>
  {#if message}
    <div
      class="p-3 rounded text-sm {messageType === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}"
    >
      {message}
    {/if}
  <div class="flex items-center gap-6">
    <!-- Image Display -->
    <div class="relative">
      <div class="w-24 h-24 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-lg flex items-center justify-center overflow-hidden border-2 border-gray-200">
        {#if preview}
          <img src={preview} alt="{poiName} preview" class="w-full h-full object-cover" />
        {:else}
          <div class="text-white text-4xl">👤{/if}
      </div>
      <button
        onclick={triggerUpload}
        disabled={uploading}
        class="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 shadow-lg"
        title="Change photo"
      >
        <Camera class="w-4 h-4" />
      </button>
    </div>
    <!-- Upload Info -->
    <div class="flex-1">
      <p class="text-sm text-gray-600 mb-3">
        Upload a photo (JPEG or PNG, max 5MB)
      </p>
      <div class="flex gap-2">
        <Button
          onclick={triggerUpload}
          disabled={uploading}
          class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          <Upload class="w-4 h-4" />
          {uploading ? 'Uploading...' : 'Upload Photo'}
        </Button>
        {#if preview}
          <Button
            onclick={clearPreview}
            disabled={uploading}
            class="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            <X class="w-4 h-4" />
          </Button>
        {/if}
      </div>
    </div>
  </div>
  <!-- Hidden file input -->
  <input
    bind:this={fileInput}
    type="file"
    accept="image/jpeg,image/png"
    onchange={handleFileSelect}
    style="display: none"
  />
  <p class="text-xs text-gray-500">
    Images are stored securely in MinIO S3 and cached for 30 days
  </p>
</div>
