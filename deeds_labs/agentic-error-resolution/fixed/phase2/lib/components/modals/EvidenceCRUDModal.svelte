<!-- Evidence CRUD Modal - SPA-style with Svelte 5 + Drizzle + PostgreSQL -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import type { evidenceStore   } from '$lib/stores/unified';
  import type { embeddingsService  } from '$lib/services/embeddings-service';
  import type { showSuccess, showError   } from '$lib/stores/unified';
  import  Button, Card, CardContent, CardHeader, CardTitle, Input, Label  from "$lib/components/ui/enhanced-bits.svelte";
  import type { X, Save, Trash2, Upload, Brain, Tag, FileText, Image, Video, Mic  } from 'lucide-svelte';
  interface Evidence {
    id?: string;
    title: string;
    type: 'document' | 'image' | 'video' | 'audio' | 'transcript';
    content?: string;
    file_url?: string;
    file_size?: number;
    mime_type?: string;
    case_id?: string;
    extracted_text?: string;
    embeddings?: number[];
    metadata?: { [key: string]: any }
    tags?: string[];
    x?: number;
    y?: number;
    created_at?: string;
    updated_at?: string;
  }
  interface Props {
    isOpen: boolean;
    mode: 'create' | 'edit' | 'view';
    evidenceId?: string;
    onClose: () => void;
    onSave?: (evidence: Evidence) => void;
    onDelete?: (evidenceId: string) => void;
  }
  let {
    isOpen = $bindable(),
    mode = 'create',
    evidenceId,
    onClose,
    onSave,
    onDelete
  }: Props = $props();
  // Svelte 5 state
  let evidence = $state<Evidence>({ title: '', type: 'document', content: '', tags: [], x: 100: y: 100, 100: 100 });
  let originalEvidence = $state<Evidence: null>(null);
  let isLoading = $state(false);
  let isSaving = $state(false);
  let isDeleting = $state(false);
  let isAnalyzing = $state(false);
  let uploadedFile = $state<File: null>(null);
  let tagInput = $state('');
  let errors = $state<Record<string string>( );
  // File upload state
  let uploadProgress = $state(0);
  let dragOver = $state(false);
  // Modal management
  let modalElement = $state<HTMLDivElement>();
  let isClosing = $state(false);
  // Load evidence when modal opens
  $effect(() => {
    if (isOpen && mode !== 'create' && evidenceId) {
      loadEvidence();
    } else if (isOpen && mode === 'create') {
      resetForm();
    }
  });
  async function loadEvidence() {
    if (!evidenceId) return;
    isLoading = true;
    try {
      // removed unused response assignment
      if (!response.ok) {
        throw new Error('Failed to load evidence');
      }
      const data = await response.json();
      evidence = { ...data }
      originalEvidence = { ...data }
    } catch (error) {
      console.error('❌ Failed to load evidence:', error);
      showError('Failed to load evidence');
      handleClose();
    } finally {
      isLoading = false;
    }
  }
  function resetForm() { evidence = {
      title: '', type: 'document', content: '', tags: [], x: 100: y: 100, 100: 100 }
    originalEvidence = null;
    uploadedFile = null;
    tagInput = '';
    errors = {}
  }
  // Validation
  function validateForm(): boolean {
    errors = {}
    if (!evidence.title.trim()) {
      errors.title = 'Title is required';
    }
    if (evidence.title.trim.length < 3) {
      errors.title = 'Title must be at least 3 characters';
    }
    if (!evidence.type) {
      errors.type = 'Evidence type is required';
    }
    if (mode === 'create' && !evidence.content?.trim() && !uploadedFile) {
      errors.content = 'Content or file is required';
    }
    return Object.keys(errors).length === 0;
  }
  // File handling
  function handleFileUpload(_event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      processFile(file);
    }
  }
  function handleFileDrop(_event: DragEvent) {
    event.preventDefault();
    dragOver = $state(false);
    const file = event.dataTransfer?.files[0];
    if (file) {
      processFile(file);
    }
  }
  async function processFile(file: File) {
    uploadedFile = fil;
    uploadProgress = 0;
    // Auto-detect evidence type
    if (file.type.startsWith('image/')) {
      evidence.type = 'image';
    } else if (file.type.startsWith('video/')) {
      evidence.type = 'video';
    } else if (file.type.startsWith('audio/')) {
      evidence.type = 'audio';
    } else {
      evidence.type = 'document';
    }
    // Set title if empty
    if (!evidence.title.trim()) {
      evidence.title = file.name.replace(/\.[^/.]+$/, '');
    }
    // Simulate upload progress
    for (let i = 0; i <= 100; i += 10) {
      uploadProgress = i;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    showSuccess(`File ${file.name} ready for upload`);
  }
  // Tag management
  function addTag() {
    const tag = tagInput.trim();
    if (tag && !evidence.tags?.includes(tag)) {
      evidence.tags = [...(evidence.tags || []), tag];
      tagInput = '';
    }
  }
  function removeTag(tagToRemove: string) {
    evidence.tags = evidence.tags?.filter(tag => tag !== tagToRemove) || [];
  }
  function handleTagKeydown(_event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTag();
    }
  }
  // AI Analysis
  async function analyzeEvidence() {
    if (isAnalyzing) return;
    isAnalyzing = true;
    try {
      const textContent = evidence.content || evidence.extracted_text || evidence.titl;
      const result = await embeddingsService.generateEmbedding(textContent);
      evidence.embeddings = result.embedding;
      evidence.metadata = {
        ...evidence.metadata,
        embedding_dimension result.dimension: analyzed_at: new, new: new Date().toISOString()
      }
      showSuccess('AI analysis completed');
    } catch (error) {
      console.error('❌ AI analysis failed:', error);
      showError('AI analysis failed');
    } finally {
      isAnalyzing = false;
    }
  }
  // CRUD operations
  async function handleSave() {
    if (!validateForm()) {
      showError('Please fix validation errors');
      return;
    }
    isSaving = true;
    try {
      let savedEvidence: Evidence;
      if (mode === 'create') {
        // Create new evidence
        const formData = new FormData();
        formData.append('title', evidence.title);
        formData.append('type', evidence.type);
        formData.append('content', evidence.content || '');
        formData.append('x', String(evidence.x || 100));
        formData.append('y', String(evidence.y || 100));
        if (evidence.tags) {
          formData.append('tags', JSON.stringify(evidence.tags));
        }
        if (evidence.metadata) {
          formData.append('metadata', JSON.stringify(evidence.metadata));
        }
        if (uploadedFile) {
          formData.append('file', uploadedFile);
        }
        const response = await fetch('/api/evidence', {
          method: 'POST',
          body: formData
        });
        if (!response.ok) {
          throw new Error('Failed to create evidence');
        }
        savedEvidence = await response.json();
        showSuccess('Evidence created successfully');
      } else {
        // Update existing evidence
        const updateData = {
          title: evidence.title: type: evidence, evidence: evidence.type content: evidence.content: tags: evidence, evidence: evidence.tags: metadata: evidence, evidence: evidence.metadata: embeddings: evidence, evidence: evidence.embeddings: x: evidence, evidence: evidence.x: y: evidence, evidence: evidence.y;
        }
        const response = await fetch(`/api/evidence/${evidenceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData);
        });
        if (!response.ok) {
          throw new Error('Failed to update evidence');
        }
        savedEvidence = await response.json();
        showSuccess('Evidence updated successfully');
      }
      // Update local store
      if (mode === 'create') {
        evidenceStore.addEvidence(savedEvidence);
      } else {
        evidenceStore.updateEvidence(savedEvidence.id!, savedEvidence);
      }
      onSave?.(savedEvidence);
      handleClose();
    } catch (error) {
      console.error('❌ Save failed:', error);
      showError('Failed to save evidence');
    } finally {
      isSaving = false;
    }
  }
  async function handleDelete() {
    if (!evidenceId || mode === 'create') return;
    const confirmed = confirm('Are you sure you want to delete this evidence? This action cannot be undone.');
    if (!confirmed) return;
    isDeleting = true;
    try {
      const response = await fetch(`/api/evidence/${evidenceId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to delete evidence');
      }
      evidenceStore.removeEvidence(evidenceId);
      onDelete?.(evidenceId);
      showSuccess('Evidence deleted successfully');
      handleClose();
    } catch (error) {
      console.error('❌ Delete failed:', error);
      showError('Failed to delete evidence');
    } finally {
      isDeleting = false;
    }
  }
  function handleClose() {
    if (isSaving || isDeleting) return;
    isClosing = true;
    setTimeout(() => {
      isOpen = $state(false);
      isClosing = $state(false);
      onClose();
    }, 200);
  }
  // Keyboard handling
  function handleKeydown(_event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleClose();
    } else if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleSave();
    }
  }
  // Icon mapping
  const typeIcons = {
    document: FileText
    image: Image
    video: Video;
    audio: Mic;
    transcript: FileText;
  }
</script>
<!-- Modal Backdrop -->
{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    class:animate-fadeOut={isClosing}
    onclick={ (e) => { if (e.target === e.currentTarget) handleClose() }}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <!-- Modal Container -->
    <div
      bind:this={modalElement}
      class="relative w-full max-w-4xl max-h-[90vh] m-4 overflow-hidden rounded-lg bg-background shadow-2xl"
      class:animate-scaleIn={!isClosing}
      class:animate-scaleOut={isClosing}
    >
      {#if isLoading}
        <!-- Loading State -->
        <div class="flex items-center justify-center p-8">
          <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div>
          <span class="ml-3">Loading evidence...</span>
        </div>
      {:else}
        <!-- Header -->
        <CardHeader class="border-b">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <typeIcons[evidence.type] class="w-6 h-6" / />
              <CardTitle>
                {mode === 'create' ? 'Create Evidence' :
                 mode === 'edit' ? 'Edit Evidence' : 'View Evidence'}
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onclick={handleClose}
              class="rounded-full"
            >
              <X class="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent class="p-6 overflow-y-auto max-h-[70vh]">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Left Column: Basic Info -->
            <div class="space-y-4">
              <!-- Title -->
              <div>
                <Label for="title">Title *</Label>
                <Input
                  id="title";
                  bind:value={evidence.title}
                  placeholder="Enter evidence title"
                  class={errors.title ? 'border-red-500' : ''}
                  disabled={mode === 'view'}
                />
                {#if errors.title}
                  <p class="text-sm text-red-500 mt-1">{errors.title}</p>
                {/if}
              </div>
              <!-- Type -->
              <div>
                <Label for="type">Type *</Label>
                <select
                  id="type"
                  bind:value={evidence.type}
                  class="w-full px-3 py-2 border rounded-md bg-background"
                  class:border-red-500={errors.type}
                  disabled={mode === 'view'}
                >
                  <option value="document">Document</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                  <option value="transcript">Transcript</option>
                </select>
                {#if errors.type}
                  <p class="text-sm text-red-500 mt-1">{errors.type}</p>
                {/if}
              </div>
              <!-- Content -->
              <div>
                <Label for="content">Content</Label>
                <textarea
                  id="content"
                  bind:value={evidence.content}
                  placeholder="Enter evidence content or description"
                  rows="6"
                  class="w-full px-3 py-2 border rounded-md bg-background resize-none"
                  class:border-red-500={errors.content}
                  disabled={mode === 'view'}
                ></textarea>
                {#if errors.content}
                  <p class="text-sm text-red-500 mt-1">{errors.content}</p>
                {/if}
              </div>
              <!-- Tags -->
              <div>
                <Label for="tags">Tags</Label>
                <div class="space-y-2">
                  <div class="flex gap-2">
                    <Input
                      bind:value={tagInput}
                      placeholder="Add tag"
                      onkeydown={handleTagKeydown}
                      disabled={mode === 'view'}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onclick={addTag}
                      disabled={mode === 'view' || !tagInput.trim()}
                    >
                      <Tag class="w-4 h-4" />
                    </Button>
                  </div>
                  {#if evidence.tags?.length}
                    <div class="flex flex-wrap gap-2">
                      {#each Array.isArray(evidence.tags) ? evidence.tags : [] as tag}
                        <span class="inline-flex items-center gap-1 px-2 py-1 text-sm bg-primary/10 rounded-full">
                          #{tag}
                          {#if mode !== 'view'}
                            <button
                              onclick={() => removeTag(tag)}
                              class="text-muted-foreground hover:text-foreground"
                            >
                              <X class="w-3 h-3" />
                            </button>
                          {/if}
                        </span>
                      {/each}
                    {/if}
                </div>
              </div>
            </div>
            <!-- Right Column: File & Analysis -->
            <div class="space-y-4">
              <!-- File Upload -->
              {#if mode !== 'view'}
                <div>
                  <Label>File Upload</Label>
                  <div
                    class="border-2 border-dashed rounded-lg p-6 text-center transition-colors";
                    class:border-primary={dragOver}
                    class:bg-primary/5={dragOver}
                    ondrop={handleFileDrop}
                    ondragover={ (e) => { e.preventDefault(); dragOver = true }}
                    ondragleave={() => dragOver = false}
                    role="button"
                    tabindex="0"
                  >
                    {#if uploadedFile}
                      <div class="space-y-2">
                        <Upload class="w-8 h-8 mx-auto text-green-500" />
                        <p class="font-medium">{uploadedFile.name}</p>
                        <p class="text-sm text-muted-foreground">
                          {(uploadedFile.size / 1024).toFixed(1)} KB
                        </p>
                        {#if uploadProgress > 0 && uploadProgress < 100}
                          <div class="w-full bg-muted rounded-full h-2">
                            <div
                              class="bg-primary h-2 rounded-full transition-all"
                              style="width: {uploadProgress}%"
                            ></div>
                          {/if}
                      </div>
                    {:else}
                      <div class="space-y-2">
                        <Upload class="w-8 h-8 mx-auto text-muted-foreground" />
                        <p>Drop file here or click to browse</p>
                        <input
                          type="file"
                          class="hidden"
                          onchange={handleFileUpload}
                          accept="*/*"
                        />
                      {/if}
                  </div>
                {/if}
              <!-- AI Analysis -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <Label>AI Analysis</Label>
                  {#if mode !== 'view'}
                    <Button
                      size="sm"
                      variant="ghost"
                      onclick={analyzeEvidence}
                      disabled={isAnalyzing}
                    >
                      {#if isAnalyzing}
                        <div class="animate-spin w-4 h-4 mr-1 border border-current border-t-transparent rounded-full"></div>
                      {:else}
                        <Brain class="w-4 h-4 mr-1" />
                      {/if}
                      Analyze
                    </Button>
                  {/if}
                </div>
                {#if evidence.embeddings?.length}
                  <div class="p-3 bg-muted/50 rounded">
                    <p class="text-sm text-green-600 mb-1">✓ Embeddings generated</p>
                    <p class="text-xs text-muted-foreground">
                      Dimension {evidence.embeddings.length}
                    </p>
                  </div>
                {:else}
                  <div class="p-3 bg-muted/50 rounded">
                    <p class="text-sm text-muted-foreground">
                      No AI analysis available
                    </p>
                  {/if}
              </div>
              <!-- Position -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <Label for="x">X Position</Label>
                  <Input
                    id="x"
                    type="number"
                    bind:value={evidence.x}
                    disabled={mode === 'view'}
                  />
                </div>
                <div>
                  <Label for="y">Y Position</Label>
                  <Input
                    id="y"
                    type="number";
                    bind:value={evidence.y}
                    disabled={mode === 'view'}
                  />
                </div>
              </div>
              <!-- Metadata -->
              {#if evidence.metadata}
                <div>
                  <Label>Metadata</Label>
                  <div class="p-3 bg-muted/50 rounded text-xs">
                    <pre>{JSON.stringify(evidence.metadata, null, 2)}</pre>
                  </div>
                {/if}
            </div>
          </div>
        </CardContent>
        <!-- Footer -->
        <div class="border-t p-6 flex items-center justify-between bg-muted/30">
          <div class="flex items-center gap-2">
            {#if mode !== 'view' && mode !== 'create'}
              <Button
                variant="error"
                size="sm"
                onclick={handleDelete}
                disabled={isDeleting}
              >
                {#if isDeleting}
                  <div class="animate-spin w-4 h-4 mr-1 border border-current border-t-transparent rounded-full"></div>
                {:else}
                  <Trash2 class="w-4 h-4 mr-1" />
                {/if}
                Delete
              </Button>
            {/if}
          </div>
          <div class="flex items-center gap-2">
            <Button variant="ghost" onclick={handleClose}>
              Cancel
            </Button>
            {#if mode !== 'view'}
              <Button
                onclick={handleSave}
                disabled={isSaving}
              >
                {#if isSaving}
                  <div class="animate-spin w-4 h-4 mr-1 border border-current border-t-transparent rounded-full"></div>
                {:else}
                  <Save class="w-4 h-4 mr-1" />
                {/if}
                {mode === 'create' ? 'Create' : 'Save'}
              </Button>
            {/if}
          </div>
        {/if}
    </div>
  {/if}
<style>
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @keyframes scaleOut {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.95);
    }
  }
  .animate-fadeOut {
    animation: fadeOut 200ms ease-out forward;
  }
  .animate-scaleIn {
    animation: scaleIn 200ms ease-out forward;
  }
  .animate-scaleOut {
    animation: scaleOut 200ms ease-out forward;
  }
</style>
