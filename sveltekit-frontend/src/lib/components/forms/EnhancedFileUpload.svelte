<!--
  Enhanced File Upload Component with Superforms and Zod Validation
  Features: Drag & drop, progress tracking, AI processing, validation, preview
-->
<script lang="ts">
  import { onMount } from "svelte";
  import Button from '$lib/components/ui/Button.svelte';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import FileIcon from '@lucide/svelte/icons/file';
  import FileText from '@lucide/svelte/icons/file-text';
  import ImageIcon from '@lucide/svelte/icons/image';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import Music from '@lucide/svelte/icons/music';
  import Upload from '@lucide/svelte/icons/upload';
  import Video from '@lucide/svelte/icons/video';
  import X from '@lucide/svelte/icons/x';

  // File upload interface
  interface FileUpload {
    file: File;
    title: string;
    description: string;
    tags: string[];
    caseId?: string;
    evidenceType?: string;
    confidentialityLevel?: string;
    collectedBy?: string;
    location?: string;
    enableAiAnalysis?: boolean;
    enableOcr?: boolean;
    enableEmbeddings?: boolean;
    enableSummarization?: boolean;
    isAdmissible?: boolean;
  }

  // Props interface
  interface Props {
    caseId?: string | undefined;
    multiple?: boolean;
    compact?: boolean;
    disabled?: boolean;
    maxFiles?: number;
    maxSizeMB?: number;
    acceptedTypes?: string[];
    onupload?: (data: { files: File[]; formData: FileUpload[] }) => void;
    oncancel?: () => void;
    onprogress?: (data: { progress: number; file: string }) => void;
  }

  let {
    caseId = undefined,
    multiple = false,
    compact = false,
    disabled = false,
    maxFiles = multiple ? 10 : 1,
    maxSizeMB = 100,
    acceptedTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.txt'],
    onupload = () => {},
    oncancel = () => {},
    onprogress = () => {}
  }: Props = $props();

  // State
  let fileInput: HTMLInputElement;
  let isDragOver = $state(false);
  let selectedFiles = $state<File[]>([]);
  let uploadProgress = $state<Record<string, number>>({});
  let previews = $state<Record<string, string>>({});
  let isUploading = $state(false);
  let currentUploadFile = $state("");

  // Local form state
  let formState = $state({
    title: '',
    description: '',
    tags: [] as string[],
    caseId: caseId || '',
    evidenceType: '',
    confidentialityLevel: '',
    collectedBy: '',
    location: '',
    enableAiAnalysis: false,
    enableOcr: false,
    enableEmbeddings: false,
    enableSummarization: false,
    isAdmissible: false,
  });
  let errors = $state<Record<string, string[]>>({});

  // Options
  const evidenceTypes = [
    { value: "documents", label: "Documents" },
    { value: "physical_evidence", label: "Physical Evidence" },
    { value: "digital_evidence", label: "Digital Evidence" },
    { value: "photographs", label: "Photographs" },
    { value: "video_recording", label: "Video Recording" },
    { value: "audio_recording", label: "Audio Recording" },
    { value: "witness_testimony", label: "Witness Testimony" },
    { value: "expert_opinion", label: "Expert Opinion" },
    { value: "forensic_analysis", label: "Forensic Analysis" },
    { value: "chain_of_custody", label: "Chain of Custody" },
  ];

  const confidentialityLevels = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ];

  // Helpers
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // File handling
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (!disabled) isDragOver = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    if (disabled) return;
    const files = Array.from(event.dataTransfer?.files || []);
    addFiles(files);
  }

  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) addFiles(Array.from(target.files));
  }

  function addFiles(files: File[]) {
    const validFiles = files.filter((file) => validateFile(file));
    if (multiple) {
      const totalFiles = selectedFiles.length + validFiles.length;
      if (totalFiles > maxFiles) validFiles.splice(maxFiles - selectedFiles.length);
      selectedFiles = [...selectedFiles, ...validFiles];
    } else {
      selectedFiles = validFiles.slice(0, 1);
    }

    validFiles.forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          previews[file.name] = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      }
    });

    if (validFiles.length > 0 && !formState.title) {
      const firstFile = validFiles[0];
      formState.title = firstFile.name.replace(/\.[^/.]+$/, "");
    }
  }

  function validateFile(file: File): boolean {
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`File "${file.name}" is too large. Maximum size is ${maxSizeMB}MB.`);
      return false;
    }

    const isValidType = acceptedTypes.some((type) => {
      if (type.startsWith(".")) return file.name.toLowerCase().endsWith(type.toLowerCase());
      if (type.includes("*")) {
        const category = type.split("/")[0];
        return file.type.startsWith(category);
      }
      return file.type === type;
    });

    if (!isValidType) {
      alert(`File type "${file.type}" is not supported.`);
      return false;
    }
    return true;
  }

  function removeFile(fileName: string) {
    selectedFiles = selectedFiles.filter((f) => f.name !== fileName);
    delete previews[fileName];
    delete uploadProgress[fileName];
  }

  function getFileIcon(file: File) {
    if (file.type.startsWith("image/")) return ImageIcon;
    if (file.type.startsWith("video/")) return Video;
    if (file.type.startsWith("audio/")) return Music;
    if (file.type.includes("pdf") || file.type.includes("document")) return FileText;
    return FileIcon;
  }

  async function handleFormSubmit() {
    if (selectedFiles.length === 0) return;
    isUploading = true;
    const formDataArray: FileUpload[] = [];

    try {
      for (const file of selectedFiles) {
        currentUploadFile = file.name;
        uploadProgress[file.name] = 0;
        const fileData: FileUpload = { ...formState, file };
        await simulateUpload(file.name);
        formDataArray.push(fileData);
      }

      onupload?.({ files: selectedFiles, formData: formDataArray });

      // reset
      selectedFiles = [];
      previews = {};
      uploadProgress = {};
      if (fileInput) fileInput.value = "";
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      isUploading = false;
      currentUploadFile = "";
    }
  }

  async function simulateUpload(fileName: string): Promise<void> {
    return new Promise((resolve) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          resolve();
        }
        uploadProgress[fileName] = progress;
        onprogress?.({ progress, file: fileName });
      }, 100);
    });
  }

  function openFileDialog() {
    if (!disabled) fileInput?.click();
  }

  // Tags
  let tagInput = $state("");
  function addTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !formState.tags.includes(trimmed)) {
      formState.tags = [...formState.tags, trimmed];
      tagInput = "";
    }
  }
  function removeTag(tag: string) {
    formState.tags = formState.tags.filter((t) => t !== tag);
  }

  onMount(() => {
    if (caseId) formState.caseId = caseId;
  });
</script>

<!-- Hidden file input -->
<input
  bind:this={fileInput}
  type="file"
  {multiple}
  accept={acceptedTypes.join(",")}
  onchange={handleFileSelect}
  class="hidden"
/>

<div class="w-full">
  <div class="border rounded-lg overflow-hidden">
    <div class="px-4 py-3 border-b bg-gray-50">
      <h3 class="font-medium flex items-center gap-2">
        <Upload class="h-5 w-5" />
        {compact ? "Upload Files" : "Evidence Upload"}
      </h3>
    </div>

    <div class="p-4 space-y-6">
      <!-- Drop Zone -->
      <div
        class="border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer border-gray-300 hover:border-blue-400"
        class:border-blue-500={isDragOver}
        class:bg-blue-50={isDragOver}
        class:opacity-50={disabled}
        class:cursor-not-allowed={disabled}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
        onclick={openFileDialog}
        onkeydown={(e: KeyboardEvent) => e.key === "Enter" && openFileDialog()}
        role="button"
        tabindex="0"
        aria-label="File upload area"
      >
        {#if isUploading}
          <div class="flex flex-col items-center gap-4">
            <Loader2 class="h-8 w-8 animate-spin text-blue-500" />
            <div class="space-y-2">
              <p class="text-sm font-medium">Uploading {currentUploadFile}...</p>
              {#if uploadProgress[currentUploadFile] !== undefined}
                <progress value={uploadProgress[currentUploadFile]} max="100" class="w-64" />
                <p class="text-xs text-gray-500">
                  {Math.round(uploadProgress[currentUploadFile])}% complete
                </p>
              {/if}
            </div>
          </div>
        {:else}
          <div class="space-y-4">
            <Upload class="h-12 w-12 mx-auto text-gray-400" />
            <div>
              <p class="text-lg font-medium">
                {selectedFiles.length > 0 ? "Add more files" : "Drop files here or click to browse"}
              </p>
              <p class="text-sm text-gray-500 mt-1">
                Supports: Images, Videos, Audio, Documents (Max {maxSizeMB}MB each)
              </p>
            </div>
          </div>
        {/if}
      </div>

      <!-- Selected Files Preview -->
      {#if selectedFiles.length > 0}
        <div class="space-y-3">
          <h4 class="font-medium">Selected Files ({selectedFiles.length})</h4>
          <div class="grid gap-3">
            {#each selectedFiles as file (file.name)}
              <div class="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
                <div class="flex-shrink-0">
                  {#if previews[file.name]}
                    <img src={previews[file.name]} alt={file.name} class="h-12 w-12 object-cover rounded" />
                  {:else}
                    <svelte:component this={getFileIcon(file)} class="h-12 w-12 text-gray-400" />
                  {/if}
                </div>

                <div class="flex-1 min-w-0">
                  <p class="font-medium truncate">{file.name}</p>
                  <p class="text-sm text-gray-500">{formatFileSize(file.size)} &bull; {file.type}</p>
                  {#if uploadProgress[file.name] !== undefined}
                    <progress value={uploadProgress[file.name]} max="100" class="mt-2 w-full" />
                  {/if}
                </div>

                <button onclick={() => removeFile(file.name)} disabled={isUploading} class="flex-shrink-0 p-1 hover:bg-gray-200 rounded">
                  <X class="h-4 w-4" />
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if !compact && selectedFiles.length > 0}
        <form class="space-y-6" onsubmit={(e) => { e.preventDefault(); handleFormSubmit(); }}>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <label for="title" class="block text-sm font-medium">Title *</label>
              <input id="title" bind:value={formState.title} placeholder="Enter evidence title" disabled={isUploading}
                class="w-full border rounded px-3 py-2 text-sm" class:border-red-500={!!errors.title} />
              {#if errors.title}<p class="text-sm text-red-500">{errors.title[0]}</p>{/if}
            </div>

            <div class="space-y-2">
              <label for="evidenceType" class="block text-sm font-medium">Evidence Type *</label>
              <select bind:value={formState.evidenceType} disabled={isUploading} id="evidenceType" class="w-full border rounded px-2 py-2 text-sm">
                <option value="" disabled>Select evidence type</option>
                {#each evidenceTypes as type}<option value={type.value}>{type.label}</option>{/each}
              </select>
              {#if errors.evidenceType}<p class="text-sm text-red-500">{errors.evidenceType[0]}</p>{/if}
            </div>

            <div class="space-y-2">
              <label for="confidentialityLevel" class="block text-sm font-medium">Confidentiality Level</label>
              <select bind:value={formState.confidentialityLevel} disabled={isUploading} id="confidentialityLevel" class="w-full border rounded px-2 py-2 text-sm">
                <option value="" disabled>Select level</option>
                {#each confidentialityLevels as level}<option value={level.value}>{level.label}</option>{/each}
              </select>
            </div>

            <div class="space-y-2">
              <label for="collectedBy" class="block text-sm font-medium">Collected By</label>
              <input id="collectedBy" bind:value={formState.collectedBy} placeholder="Officer/investigator name" disabled={isUploading}
                class="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>

          <div class="space-y-2">
            <label for="description" class="block text-sm font-medium">Description</label>
            <textarea id="description" bind:value={formState.description} placeholder="Describe the evidence and its relevance to the case"
              rows={3} disabled={isUploading} class="w-full border rounded p-2 text-sm" class:border-red-500={!!errors.description}></textarea>
            {#if errors.description}<p class="text-sm text-red-500">{errors.description[0]}</p>{/if}
          </div>

          <div class="space-y-2">
            <label for="location" class="block text-sm font-medium">Collection Location</label>
            <input id="location" bind:value={formState.location} placeholder="Where was this evidence collected?" disabled={isUploading}
              class="w-full border rounded px-3 py-2 text-sm" />
          </div>

          <div class="space-y-2">
            <label class="block text-sm font-medium">Tags</label>
            <div class="flex gap-2">
              <input bind:value={tagInput} placeholder="Add a tag" disabled={isUploading}
                onkeydown={(e: KeyboardEvent) => e.key === "Enter" && (e.preventDefault(), addTag())}
                class="flex-1 border rounded px-3 py-2 text-sm" />
              <Button type="button" onclick={addTag} disabled={isUploading}>Add</Button>
            </div>

            {#if formState.tags.length > 0}
              <div class="flex flex-wrap gap-2 mt-2">
                {#each formState.tags as tag}
                  <span class="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-sm">
                    <span>{tag}</span>
                    <button type="button" class="ml-1" onclick={() => removeTag(tag)} disabled={isUploading} aria-label="Remove tag">
                      <X class="h-3 w-3" />
                    </button>
                  </span>
                {/each}
              </div>
            {/if}
          </div>

          <div class="space-y-3">
            <label class="block text-sm font-medium">AI Processing Options</label>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex items-center space-x-2">
                <input type="checkbox" bind:checked={formState.enableAiAnalysis} id="enableAiAnalysis" disabled={isUploading} />
                <label for="enableAiAnalysis" class="text-sm">Enable AI Analysis</label>
              </div>
              <div class="flex items-center space-x-2">
                <input type="checkbox" bind:checked={formState.enableOcr} id="enableOcr" disabled={isUploading} />
                <label for="enableOcr" class="text-sm">OCR Text Extraction</label>
              </div>
              <div class="flex items-center space-x-2">
                <input type="checkbox" bind:checked={formState.enableEmbeddings} id="enableEmbeddings" disabled={isUploading} />
                <label for="enableEmbeddings" class="text-sm">Generate Embeddings</label>
              </div>
              <div class="flex items-center space-x-2">
                <input type="checkbox" bind:checked={formState.enableSummarization} id="enableSummarization" disabled={isUploading} />
                <label for="enableSummarization" class="text-sm">AI Summarization</label>
              </div>
            </div>
          </div>

          <div class="flex items-center space-x-2">
            <input type="checkbox" bind:checked={formState.isAdmissible} id="isAdmissible" disabled={isUploading} />
            <label for="isAdmissible" class="text-sm font-medium">Mark as admissible evidence</label>
          </div>
        </form>
      {/if}

      <div class="flex justify-between items-center pt-4 border-t">
        <p class="text-sm text-gray-500">
          {selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} selected
          {#if multiple}(max {maxFiles}){/if}
        </p>

        <div class="flex gap-2">
          <Button onclick={() => oncancel?.()} disabled={isUploading}>Cancel</Button>

          <Button onclick={handleFormSubmit} disabled={selectedFiles.length === 0 || isUploading || Object.keys(errors).length > 0} class="min-w-24">
            {#if isUploading}
              <Loader2 class="h-4 w-4 animate-spin mr-2" />Uploading...
            {:else}
              <Upload class="h-4 w-4 mr-2" />Upload {selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""}
            {/if}
          </Button>
        </div>
      </div>

      {#if Object.keys(errors).length > 0 && selectedFiles.length > 0}
        <div class="border border-red-300 bg-red-50 rounded p-3 flex items-start gap-3">
          <AlertCircle class="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p class="font-medium text-red-800">Please fix the following errors before uploading:</p>
            <ul class="mt-2 list-disc list-inside text-sm text-red-700">
              {#each Object.entries(errors) as [field, messages]}
                <li>{field}: {messages[0]}</li>
              {/each}
            </ul>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .hidden { display: none; }
</style>
