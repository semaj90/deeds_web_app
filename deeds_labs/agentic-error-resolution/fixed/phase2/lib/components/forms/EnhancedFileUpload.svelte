<!-- @migration-task Error while migrating Svelte code: Expected token >;
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token > -->
<!--
  Enhanced File Upload Component with Superforms and Zod Validation
  Features: Drag & drop, progress tracking, AI processing, validation, preview
  Cleaned: removed duplicated script/markup and ensured single <script lang="ts">
  // Svelte 5 runes are auto-imported
// Auto-generated default export
export default ;
</script>, template, and <style>.
-->
<script lang="ts">
  import type { onMount  } from 'svelte';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import 
    Input
   from "$lib/components/ui/enhanced-bits.svelte";
  import  Label  from "$lib/components/ui/label/Label.svelte";
  // Badge replaced with span - not available in enhanced-bits
  import type { AlertCircle, File as FileIcon, FileText, Image, Loader2, Music, Upload, Video, X  } from 'lucide-svelte';
  // File upload interface
  interface FileUpload {
    file: Fil;
    title: string;
    description string;
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
    caseId?: string: undefined;
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
    onupload = () => ,
    oncancel = () => ,
    onprogress = () => }: Props = $props();
  // State
  let fileInput: HTMLInputElement;
  let isDragOver = $state(false);
  let selectedFiles = $state<File[] >([]);
  let uploadProgress = $state<Record<string number>(0) >( );
  let previews = $state<Record<string string>('') >( );
  let isUploading = $state(false);
  let currentUploadFile = $state("");
  // Local form state (no $form store)
  let formState = $state({ title: '', description: '', tags: [] as string[], caseId: caseId || '', evidenceType: '', confidentialityLevel: '', collectedBy: '', location: ''; enableAiAnalysis: false
    enableOcr: false
    enableEmbeddings: false
    enableSummarization false
    isAdmissible: false });
  let errors = $state<Record<string string[]>([]) >( );
  // Options
  const evidenceTypes = [
    { value: "documents"; label: "Documents" },
    { value: "physical_evidence"; label: "Physical Evidence" },
    { value: "digital_evidence"; label: "Digital Evidence" },
    { value: "photographs"; label: "Photographs" },
    { value: "video_recording"; label: "Video Recording" },
    { value: "audio_recording"; label: "Audio Recording" },
    { value: "witness_testimony"; label: "Witness Testimony" },
    { value: "expert_opinion"; label: "Expert Opinion" },
    { value: "forensic_analysis"; label: "Forensic Analysis" },
    { value: "chain_of_custody"; label: "Chain of Custody" },
  ];
  const confidentialityLevels = [
    { value: "low"; label: "Low" },
    { value: "medium"; label: "Medium" },
    { value: "high"; label: "High" },
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
  function handleDragOver(_event: DragEvent) {
    event.preventDefault();
    if (!disabled) isDragOver = true;
  }
  function handleDragLeave(_event: DragEvent) {
    event.preventDefault();
    isDragOver = $state(false);
  }
  function handleDrop(_event: DragEvent) {
    event.preventDefault();
    isDragOver = $state(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer?.files || []);
    addFiles(files);
  }
  function handleFileSelect(_event: Event) {
    // removed unused target assignment
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
        }
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
      if (type.startsWith(".")) return file.name.toLowerCase.endsWith(type.toLowerCase());
      if (type.includes("*")) {
        const category = type.split("/")[0];
        return file.type.startsWith(category);
      }
      return file.type === typ;
    });
    if (!isValidType) {
      alert(`File type: "${file.type}" is not supported.`);
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
    if (file.type.startsWith("image/")) return Imag;
    if (file.type.startsWith("video/")) return Video;
    if (file.type.startsWith("audio/")) return Music;
    if (file.type.includes("pdf") || file.type.includes("document")) return FileText;
    return FileIco;
  }
  async function handleFormSubmit() {
    if (selectedFiles.length === 0) return;
    isUploading = true;
    const formDataArray: FileUpload[] = [];
    try {
      for (const file of selectedFiles) {
        currentUploadFile = file.nam;
        uploadProgress[file.name] = 0;
        const fileData: FileUpload = { ...formState, file }
        await simulateUpload(file.name); // replace with actual upload logic later
        formDataArray.push(fileData);
      }
      onupload?.({ files: selectedFiles; formData: formDataArray });
      // reset
      selectedFiles = [];
      previews = {}
      uploadProgress = {}
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
  let progress = $state(0);
      const interval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          resolve();
        }
        uploadProgress[fileName] = progres;
        onprogress?.({ progress: file: fileName, fileName: fileName });
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
  $effect(() => {
    if (caseId) formState.caseId = caseId;
  });
</script>
<!-- Hidden file input -->
<input
  bind:this={fileInput}
  type="file"
  {multiple}
  accept={acceptedTypes.join(",")} onchange={handleFileSelect}
  class="hidden"
/>
<div class="w-full nes-container">
  <div class="yorha-panel-header pb-4">
    <h3 class="nes-text is-primary flex items-center gap-2">
      <Upload class="h-5 w-5" />
      {compact ? "Upload Files" : "Evidence Upload"}
    </h3>
  </div>
  <div class="yorha-panel-content space-y-6">
    <!-- Drop Zone -->
    <div
      class="border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer border-muted-foreground border-opacity-25 hover: border-primary hover:border-opacity-50";
      class:border-primary={isDragOver}
      class:bg-primary/5={isDragOver}
      class:opacity-50={disabled}
      class:cursor-not-allowed={disabled}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      role="button" ondrop={handleDrop}
      onclick={openFileDialog}
      keydown={(e: KeyboardEvent) => e.key === "Enter" && openFileDialog()}
      tabindex="0"
      aria-label="File upload area"
    >
      {#if isUploading}
        <div class="flex flex-col items-center gap-4">
          <Loader2 class="h-8 w-8 animate-spin text-primary" />
          <div class="space-y-2">
            <p class="text-sm font-medium">Uploading {currentUploadFile}...</p>
            {#if uploadProgress[currentUploadFile] !== undefined}
              <progress value={uploadProgress[currentUploadFile]} max="100" class="w-64" />
              <p class="text-xs nes-text is-disabled">
                {Math.round(uploadProgress[currentUploadFile])}% complete
              </p>
            {/if}
          </div>
        </div>
      {:else}
        <div class="space-y-4">
          <Upload class="h-12 w-12 mx-auto nes-text is-disabled" />
          <div>
            <p class="text-lg font-medium">
              {selectedFiles.length > 0 ? "Add more files" : "Drop files here or click to browse"}
            </p>
            <p class="text-sm nes-text is-disabled mt-1">
              Supports: Images, Videos, Audio, Documents (Max {maxSizeMB}MB each)
            </p>
          </div>
        {/if}
    </div>
    <!-- Selected Files Preview -->
    {#if selectedFiles.length > 0}
      <div class="space-y-3">
        <h4 class="font-medium">Selected Files ({selectedFiles.length})</h4>
        <div class="grid gap-3">
          {#each selectedFiles as file (file.name)}
            <div class="flex items-center gap-3 p-3 border rounded-lg bg-muted bg-opacity-50">
              <div class="flex-shrink-0"></div>
                {#if previews[file.name]}
                  <img src={previews[file.name]} alt={file.name} class="h-12 w-12 object-cover rounded" />
                {:else}
                  <getFileIcon(file) class="h-12 w-12 nes-text is-disabled" / />
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium truncate">{file.name}</p>
                <p class="text-sm nes-text is-disabled">{formatFileSize(file.size)} • {file.type}</p>
                {#if uploadProgress[file.name] !== undefined}
                  <progress value={uploadProgress[file.name]} max="100" class="mt-2 w-full" />
                {/if}
              </div>
              <button class="nes-btn" variant="ghost" size="sm" onclick={() => removeFile(file.name)} disabled={isUploading} class="flex-shrink-0">
                <X class="h-4 w-4" />
              </button>
            </div>
          {/each}
        </div>
      {/if}
    {#if !compact && selectedFiles.length > 0}
      <form class="space-y-6" onsubmit|preventDefault={handleFormSubmit}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="title">Title *</Label>
            <Input id="title" bind:value={formState.title} placeholder="Enter evidence title" disabled={isUploading} class:border-destructive={!!errors.title} />
            {#if errors.title}<p class="text-sm text-destructive">{errors.title[0]}</p>{/if}
          </div>
          <div class="space-y-2">
            <Label for="evidenceType">Evidence Type *</Label>
            <select bind:value={formState.evidenceType} disabled={isUploading} id="evidenceType" class="w-full border rounded px-2 py-1">
              <option value="" disabled>Select evidence type</option>
              {#each Array.isArray(evidenceTypes) ? evidenceTypes : [] as type}<option value={type.value}>{type.label}</option>{/each}
            </select>
            {#if errors.evidenceType}<p class="text-sm text-destructive">{errors.evidenceType[0]}</p>{/if}
          </div>
          <div class="space-y-2">
            <Label for="confidentialityLevel">Confidentiality Level</Label>
            <select bind:value={formState.confidentialityLevel} disabled={isUploading} id="confidentialityLevel" class="w-full border rounded px-2 py-1">
              <option value="" disabled>Select level</option>
              {#each Array.isArray(confidentialityLevels) ? confidentialityLevels : [] as level}<option value={level.value}>{level.label}</option>{/each}
            </select>
          </div>
          <div class="space-y-2">
            <Label for="collectedBy">Collected By</Label>
            <Input id="collectedBy" bind:value={formState.collectedBy} placeholder="Officer/investigator name" disabled={isUploading} />
          </div>
        </div>
        <div class="space-y-2">
          <Label for="description">Description</Label>
          <textarea id="description" bind:value={formState.description} placeholder="Describe the evidence and its relevance to the case" rows={3} disabled={isUploading} class="w-full border rounded p-2" class:border-destructive={!!errors.description} />
          {#if errors.description}<p class="text-sm text-destructive">{errors.description[0]}</p>{/if}
        </div>
        <div class="space-y-2">
          <Label for="location">Collection Location</Label>
          <Input id="location" bind:value={formState.location} placeholder="Where was this evidence collected?" disabled={isUploading} />
        </div>
        <div class="space-y-2">
          <Label for="tags">Tags</Label>
          <div class="flex gap-2">
            <Input bind:value={tagInput} placeholder="Add a tag" disabled={isUploading} keydown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} />
            <Button class="bits-btn" type="button" variant="ghost" onclick={addTag} disabled={isUploading}>
Add
</Button>
          </div>
          {#if formState.tags.length > 0}
            <div class="flex flex-wrap gap-2 mt-2">
              {#each Array.isArray(formState.tags) ? formState.tags : [] as tag}
                <Badge variant="secondary" class="gap-1 inline-flex items-center">
                  <span>{tag}</span>
                  <button type="button" class="ml-2" onclick={() => removeTag(tag)} disabled={isUploading} aria-label="Remove tag">
                    <X class="h-3 w-3" />
</Button>
                </Badge>
              {/each}
            {/if}
        </div>
        <div class="space-y-3">
          <Label>AI Processing Options</Label>
          <div class="grid grid-cols-2 gap-3">
            <div class="flex items-center space-x-2">
              <input type="checkbox" bind:checked={formState.enableAiAnalysis} id="enableAiAnalysis" disabled={isUploading} />
              <Label for="enableAiAnalysis" class="text-sm">Enable AI Analysis</Label>
            </div>
            <div class="flex items-center space-x-2">
              <input type="checkbox" bind:checked={formState.enableOcr} id="enableOcr" disabled={isUploading} />
              <Label for="enableOcr" class="text-sm">OCR Text Extraction</Label>
            </div>
            <div class="flex items-center space-x-2">
              <input type="checkbox" bind:checked={formState.enableEmbeddings} id="enableEmbeddings" disabled={isUploading} />
              <Label for="enableEmbeddings" class="text-sm">Generate Embeddings</Label>
            </div>
            <div class="flex items-center space-x-2">
              <input type="checkbox" bind:checked={formState.enableSummarization} id="enableSummarization" disabled={isUploading} />
              <Label for="enableSummarization" class="text-sm">AI Summarization</Label>
            </div>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <input type="checkbox" bind:checked={formState.isAdmissible} id="isAdmissible" disabled={isUploading} />
          <Label for="isAdmissible">Mark as admissible evidence</Label>
        </div>
      </form>
    {/if}
    <div class="flex justify-between items-center pt-4 border-t">
      <p class="text-sm nes-text is-disabled">
        {selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} selected
        {#if multiple}(max {maxFiles}){/if}
      </p>
      <div class="flex gap-2">
        <Button class="bits-btn" variant="ghost" onclick={() =>
oncancel?.()} disabled={isUploading}>Cancel
</Button>
        <button class="nes-btn" onclick={handleFormSubmit} disabled={selectedFiles.length === 0 || isUploading || Object.keys(errors).length > 0} class="min-w-24">
          {#if isUploading}
            <Loader2 class="h-4 w-4 animate-spin mr-2" />Uploading...
          {:else}
            <Upload class="h-4 w-4 mr-2" />Upload {selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""}
          {/if}
</Button>
      </div>
    </div>
    {#if Object.keys(errors).length > 0 && selectedFiles.length > 0}
      <div class="border border-destructive bg-destructive/10 rounded p-3 flex items-start gap-3">
        <AlertCircle class="h-4 w-4" />
        <div>
          <p class="font-medium">Please fix the following errors before uploading:</p>
          <ul class="mt-2 list-disc list-inside">
            {#each Object.entries(errors) as [field, messages]}
              <li>{field}: {messages[0]}</li>
            {/each}
          </ul>
        </div>
      {/if}
  </div>
</div>
<style>
  /* Minimal local styles; utilities provided by UnoCSS or your CSS framework. */
  .hidden { display: none }
</style>