<!-- Evidence CRUD Modal - Svelte 5 + Drizzle + PostgreSQL -->
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
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
    metadata?: Record<string, any>;
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
  let evidence = $state<Evidence>({
    title: '',
    type: 'document',
    content: '',
    tags: [],
    x: 100,
    y: 100
  });

  let originalEvidence = $state<Evidence | null>(null);
  let isLoading = $state(false);
  let isSaving = $state(false);
  let isDeleting = $state(false);
  let isAnalyzing = $state(false);
  let uploadedFile = $state<File | null>(null);
  let tagInput = $state('');
  let errors = $state<Record<string, string>>({});
  let uploadProgress = $state(0);
  let dragOver = $state(false);
  let modalElement = $state<HTMLDivElement>();
  let isClosing = $state(false);
  let fileInputElement = $state<HTMLInputElement | null>(null);

  // Derived values
  let isReadonly = $derived(mode === 'view');
  let modalTitle = $derived.by(() => {
    switch (mode) {
      case 'create': return 'Create Evidence';
      case 'edit': return 'Edit Evidence';
      default: return 'View Evidence';
    }
  });

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
      const response = await fetch(`/api/evidence/${evidenceId}`);
      if (!response.ok) throw new Error('Failed to load evidence');
      const data = await response.json();
      evidence = { ...data };
      originalEvidence = { ...data };
    } catch (error) {
      console.error('Failed to load evidence:', error);
      handleClose();
    } finally {
      isLoading = false;
    }
  }

  function resetForm() {
    evidence = {
      title: '',
      type: 'document',
      content: '',
      tags: [],
      x: 100,
      y: 100
    };
    originalEvidence = null;
    uploadedFile = null;
    tagInput = '';
    errors = {};
  }

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};
    if (!evidence.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (evidence.title.trim().length < 3) {
      newErrors.title = 'Title must be at least 3 characters';
    }
    if (!evidence.type) {
      newErrors.type = 'Evidence type is required';
    }
    if (mode === 'create' && !evidence.content?.trim() && !uploadedFile) {
      newErrors.content = 'Content or file is required';
    }
    errors = newErrors;
    return Object.keys(newErrors).length === 0;
  }

  function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) processFile(file);
  }

  function handleFileDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
    const file = event.dataTransfer?.files[0];
    if (file) processFile(file);
  }

  async function processFile(file: File) {
    uploadedFile = file;
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
  }

  // Tag management
  function addTag() {
    const tag = tagInput.trim();
    if (tag && !evidence.tags?.includes(tag)) {
      evidence.tags = [...(evidence.tags ?? []), tag];
      tagInput = '';
    }
  }

  function removeTag(tagToRemove: string) {
    evidence.tags = evidence.tags?.filter(t => t !== tagToRemove) ?? [];
  }

  function handleTagKeydown(event: KeyboardEvent) {
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
      const textContent = evidence.content || evidence.extracted_text || evidence.title;
      const response = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textContent })
      });
      if (!response.ok) throw new Error('Analysis failed');
      const result = await response.json();
      evidence.embeddings = result.embedding;
      evidence.metadata = {
        ...evidence.metadata,
        embedding_dimension: result.dimension,
        analyzed_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('AI analysis failed:', error);
    } finally {
      isAnalyzing = false;
    }
  }

  // CRUD operations
  async function handleSave() {
    if (!validateForm()) return;
    isSaving = true;
    try {
      let savedEvidence: Evidence;

      if (mode === 'create') {
        const formData = new FormData();
        formData.append('title', evidence.title);
        formData.append('type', evidence.type);
        formData.append('content', evidence.content || '');
        formData.append('x', String(evidence.x || 100));
        formData.append('y', String(evidence.y || 100));
        if (evidence.tags) formData.append('tags', JSON.stringify(evidence.tags));
        if (evidence.metadata) formData.append('metadata', JSON.stringify(evidence.metadata));
        if (uploadedFile) formData.append('file', uploadedFile);

        const response = await fetch('/api/evidence', { method: 'POST', body: formData });
        if (!response.ok) throw new Error('Failed to create evidence');
        savedEvidence = await response.json();
      } else {
        const updateData = {
          title: evidence.title,
          type: evidence.type,
          content: evidence.content,
          tags: evidence.tags,
          metadata: evidence.metadata,
          embeddings: evidence.embeddings,
          x: evidence.x,
          y: evidence.y
        };
        const response = await fetch(`/api/evidence/${evidenceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
        if (!response.ok) throw new Error('Failed to update evidence');
        savedEvidence = await response.json();
      }

      onSave?.(savedEvidence);
      handleClose();
    } catch (error) {
      console.error('Save failed:', error);
      errors = { submit: 'Failed to save evidence' };
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
      if (!response.ok) throw new Error('Failed to delete evidence');
      onDelete?.(evidenceId);
      handleClose();
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      isDeleting = false;
    }
  }

  function handleClose() {
    if (isSaving || isDeleting) return;
    isClosing = true;
    setTimeout(() => {
      isOpen = false;
      isClosing = false;
      onClose();
    }, 200);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleClose();
    } else if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleSave();
    }
  }

  function openFileUploadPicker() {
    if (!isReadonly) {
      fileInputElement?.click();
    }
  }

  function handleUploadZoneKeydown(event: KeyboardEvent) {
    if (isReadonly) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFileUploadPicker();
    }
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="crud-modal-overlay"
    class:animate-fadeOut={isClosing}
    onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <!-- Modal Container -->
    <div
      bind:this={modalElement}
      class="crud-modal-card"
      class:animate-scaleIn={!isClosing}
      class:animate-scaleOut={isClosing}
    >
      {#if isLoading}
        <div class="flex items-center justify-center p-12">
          <div class="animate-spin w-8 h-8 border-2 border-info border-t-transparent rounded-full"></div>
          <span class="ml-3 text-sand/60">Loading evidence...</span>
        </div>
      {:else}
        <!-- Header -->
        <div class="crud-modal-header">
          <div class="flex items-center gap-2">
            {#if evidence.type === 'image'}
              <span class="i-lucide-image w-5 h-5 text-sand/60 inline-block"></span>
            {:else if evidence.type === 'video'}
              <span class="i-lucide-video w-5 h-5 text-sand/60 inline-block"></span>
            {:else if evidence.type === 'audio'}
              <span class="i-lucide-mic w-5 h-5 text-sand/60 inline-block"></span>
            {:else}
              <span class="i-lucide-file-text w-5 h-5 text-sand/60 inline-block"></span>
            {/if}
            <h2 class="text-lg font-semibold text-sand">{modalTitle}</h2>
          </div>
          <Button variant="ghost" size="sm" onclick={handleClose} class="crud-modal-close">
            <span class="i-lucide-x w-4 h-4 inline-block"></span>
          </Button>
        </div>

        <!-- Body -->
        <div class="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {#if errors.submit}
            <div class="mb-4 p-3 bg-danger/5 border border-danger/20 rounded-lg text-danger text-sm">
              {errors.submit}
            </div>
          {/if}

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Left Column: Basic Info -->
            <div class="space-y-4">
              <!-- Title -->
              <div class="space-y-1">
                <label for="evidence-title" class="block text-sm font-medium text-sand/80">
                  Title <span class="text-danger">*</span>
                </label>
                <input
                  id="evidence-title"
                  type="text"
                  bind:value={evidence.title}
                  placeholder="Enter evidence title"
                  class="w-full px-3 py-2 border rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-info {errors.title ? 'border-danger/30' : ''}"
                  disabled={isReadonly}
                />
                {#if errors.title}
                  <p class="text-sm text-danger">{errors.title}</p>
                {/if}
              </div>

              <!-- Type -->
              <div class="space-y-1">
                <label for="evidence-type" class="block text-sm font-medium text-sand/80">
                  Type <span class="text-danger">*</span>
                </label>
                <select
                  id="evidence-type"
                  bind:value={evidence.type}
                  class="w-full px-3 py-2 border rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-info {errors.type ? 'border-danger/30' : ''}"
                  disabled={isReadonly}
                >
                  <option value="document">Document</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                  <option value="transcript">Transcript</option>
                </select>
                {#if errors.type}
                  <p class="text-sm text-danger">{errors.type}</p>
                {/if}
              </div>

              <!-- Content -->
              <div class="space-y-1">
                <label for="evidence-content" class="block text-sm font-medium text-sand/80">Content</label>
                <textarea
                  id="evidence-content"
                  bind:value={evidence.content}
                  placeholder="Enter evidence content or description"
                  rows={6}
                  class="w-full px-3 py-2 border rounded-md bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-info {errors.content ? 'border-danger/30' : ''}"
                  disabled={isReadonly}
                ></textarea>
                {#if errors.content}
                  <p class="text-sm text-danger">{errors.content}</p>
                {/if}
              </div>

              <!-- Tags -->
              <div class="space-y-1">
                <label class="block text-sm font-medium text-sand/80">Tags</label>
                <div class="space-y-2">
                  {#if !isReadonly}
                    <div class="flex gap-2">
                      <input
                        type="text"
                        bind:value={tagInput}
                        placeholder="Add tag"
                        onkeydown={handleTagKeydown}
                        class="flex-1 px-3 py-2 border rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-info"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={addTag}
                        disabled={!tagInput.trim()}
                      >
                        <span class="i-lucide-tag w-4 h-4 inline-block"></span>
                      </Button>
                    </div>
                  {/if}
                  {#if evidence.tags && evidence.tags.length > 0}
                    <div class="flex flex-wrap gap-1.5">
                      {#each evidence.tags as tag (tag)}
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-info/10 text-info rounded-full">
                          #{tag}
                          {#if !isReadonly}
                            <button
                              onclick={() => removeTag(tag)}
                              class="hover:text-danger transition-colors"
                            >
                              <span class="i-lucide-x w-3 h-3 inline-block"></span>
                            </button>
                          {/if}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            </div>

            <!-- Right Column: File & Analysis -->
            <div class="space-y-4">
              <!-- File Upload -->
              {#if !isReadonly}
                <div class="space-y-1">
                  <label class="block text-sm font-medium text-sand/80">File Upload</label>
                  <div
                    class="crud-upload-zone"
                    class:dragging={dragOver}
                    ondrop={handleFileDrop}
                    ondragover={(e) => { e.preventDefault(); dragOver = true; }}
                    ondragleave={() => { dragOver = false; }}
                    onclick={openFileUploadPicker}
                    onkeydown={handleUploadZoneKeydown}
                    role="button"
                    tabindex={isReadonly ? -1 : 0}
                    aria-disabled={isReadonly}
                  >
                    <input
                      bind:this={fileInputElement}
                      type="file"
                      class="hidden"
                      onchange={handleFileUpload}
                      accept="*/*"
                    />
                    {#if uploadedFile}
                      <div class="crud-upload-stack">
                        <span class="i-lucide-upload w-8 h-8 mx-auto text-sand/40 inline-block"></span>
                        <p class="font-medium text-sm text-sand">{uploadedFile.name}</p>
                        <p class="text-xs text-sand/60">
                          {(uploadedFile.size / 1024).toFixed(1)} KB
                        </p>
                        {#if uploadProgress > 0 && uploadProgress < 100}
                          <div class="crud-upload-progress">
                            <div
                              class="crud-upload-progress-bar"
                              style="width: {uploadProgress}%"
                            ></div>
                          </div>
                        {/if}
                      </div>
                    {:else}
                      <div class="crud-upload-stack">
                        <span class="i-lucide-upload w-8 h-8 mx-auto text-sand/40 inline-block"></span>
                        <p class="text-sm text-sand/60">Drop file here or click to browse</p>
                        <p class="crud-upload-note">Documents, images, audio, or video assets</p>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}

              <!-- AI Analysis -->
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <label class="block text-sm font-medium text-sand/80">AI Analysis</label>
                  {#if !isReadonly}
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={analyzeEvidence}
                      disabled={isAnalyzing}
                    >
                      {#if isAnalyzing}
                        <div class="animate-spin w-4 h-4 mr-1 border-2 border-current border-t-transparent rounded-full"></div>
                      {:else}
                        <span class="i-lucide-brain w-4 h-4 mr-1 inline-block"></span>
                      {/if}
                      Analyze
                    </Button>
                  {/if}
                </div>
                {#if evidence.embeddings && evidence.embeddings.length > 0}
                  <div class="p-3 bg-accent/5 rounded-md border border-accent/20">
                    <p class="text-sm text-accent font-medium">Embeddings generated</p>
                    <p class="text-xs text-accent mt-0.5">
                      Dimension: {evidence.embeddings.length}
                    </p>
                  </div>
                {:else}
                  <div class="p-3 bg-sand/5 rounded-md border border-sand/20">
                    <p class="text-sm text-sand/60">No AI analysis available</p>
                  </div>
                {/if}
              </div>

              <!-- Position -->
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1">
                  <label for="evidence-x" class="block text-sm font-medium text-sand/80">X Position</label>
                  <input
                    id="evidence-x"
                    type="number"
                    bind:value={evidence.x}
                    class="w-full px-3 py-2 border rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-info"
                    disabled={isReadonly}
                  />
                </div>
                <div class="space-y-1">
                  <label for="evidence-y" class="block text-sm font-medium text-sand/80">Y Position</label>
                  <input
                    id="evidence-y"
                    type="number"
                    bind:value={evidence.y}
                    class="w-full px-3 py-2 border rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-info"
                    disabled={isReadonly}
                  />
                </div>
              </div>

              <!-- Metadata -->
              {#if evidence.metadata && Object.keys(evidence.metadata).length > 0}
                <div class="space-y-1">
                  <label class="block text-sm font-medium text-sand/80">Metadata</label>
                  <div class="p-3 bg-sand/5 rounded-md border border-sand/20 overflow-auto max-h-40">
                    <pre class="text-xs text-sand/80 whitespace-pre-wrap">{JSON.stringify(evidence.metadata, null, 2)}</pre>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="border-t px-6 py-4 flex items-center justify-between">
          <div>
            {#if mode === 'edit' && evidenceId}
              <Button
                variant="ghost"
                size="sm"
                onclick={handleDelete}
                disabled={isDeleting}
                class="text-danger hover:text-danger hover:bg-danger/5"
              >
                {#if isDeleting}
                  <div class="animate-spin w-4 h-4 mr-1 border-2 border-current border-t-transparent rounded-full"></div>
                {:else}
                  <span class="i-lucide-trash-2 w-4 h-4 mr-1 inline-block"></span>
                {/if}
                Delete
              </Button>
            {/if}
          </div>
          <div class="flex items-center gap-2">
            <Button variant="ghost" onclick={handleClose}>
              Cancel
            </Button>
            {#if !isReadonly}
              <Button onclick={handleSave} disabled={isSaving}>
                {#if isSaving}
                  <div class="animate-spin w-4 h-4 mr-1 border-2 border-white border-t-transparent rounded-full"></div>
                {:else}
                  <span class="i-lucide-save w-4 h-4 mr-1 inline-block"></span>
                {/if}
                {mode === 'create' ? 'Create' : 'Save'}
              </Button>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .crud-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background:
      radial-gradient(circle at top, rgba(126, 231, 255, 0.14), transparent 26%),
      radial-gradient(circle at bottom right, rgba(255, 212, 121, 0.12), transparent 24%),
      rgba(4, 8, 15, 0.82);
    backdrop-filter: blur(16px) saturate(1.12);
  }

  .crud-modal-card {
    position: relative;
    width: min(100%, 64rem);
    max-height: 90vh;
    margin: 1rem;
    overflow: hidden;
    border-radius: var(--shell-radius-curve, 26px 26px 18px 18px / 22px 22px 30px 30px);
    background: linear-gradient(180deg, rgba(19, 27, 42, 0.96) 0%, rgba(8, 12, 20, 0.98) 100%);
    border: 1px solid var(--shell-border, rgba(120, 160, 220, 0.18));
    box-shadow:
      0 0 0 1px rgba(126, 231, 255, 0.04),
      0 28px 56px -18px rgba(0, 0, 0, 0.72),
      0 0 72px rgba(0, 0, 0, 0.36),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    color: var(--shell-text, rgba(233, 240, 255, 0.88));
  }

  .crud-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid rgba(126, 231, 255, 0.08);
  }

  :global(.crud-modal-close) {
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(120, 160, 220, 0.14);
    color: rgba(214, 226, 248, 0.64);
    transition: all 0.15s ease;
  }

  :global(.crud-modal-close)::before {
    content: none;
  }

  :global(.crud-modal-close:hover) {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(126, 231, 255, 0.18);
    color: rgba(240, 248, 255, 0.92);
  }

  .crud-upload-zone {
    position: relative;
    overflow: hidden;
    padding: 1.5rem;
    border: 1px dashed var(--shell-border, rgba(120, 160, 220, 0.2));
    border-radius: 24px;
    text-align: center;
    cursor: pointer;
    transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease;
    background:
      radial-gradient(circle at top, rgba(126, 231, 255, 0.08), transparent 42%),
      linear-gradient(180deg, rgba(13, 19, 31, 0.84) 0%, rgba(7, 10, 17, 0.94) 100%);
    box-shadow:
      0 18px 34px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .crud-upload-zone::before {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.04);
    pointer-events: none;
  }

  .crud-upload-zone:hover,
  .crud-upload-zone.dragging {
    border-color: var(--shell-border-strong, rgba(126, 231, 255, 0.3));
    background:
      radial-gradient(circle at top, rgba(126, 231, 255, 0.14), transparent 46%),
      radial-gradient(circle at bottom right, rgba(255, 212, 121, 0.1), transparent 34%),
      linear-gradient(180deg, rgba(16, 24, 39, 0.94) 0%, rgba(8, 12, 20, 0.98) 100%);
    box-shadow:
      0 22px 42px rgba(0, 0, 0, 0.24),
      0 0 0 1px rgba(126, 231, 255, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    transform: translateY(-1px);
  }

  .crud-upload-zone:focus-visible {
    outline: 2px solid rgba(126, 231, 255, 0.32);
    outline-offset: 2px;
  }

  .crud-upload-stack {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
  }

  .crud-upload-note {
    margin: 0;
    font-size: 0.75rem;
    color: rgba(184, 198, 226, 0.54);
  }

  .crud-upload-progress {
    width: 100%;
    height: 0.5rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .crud-upload-progress-bar {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #7ee7ff 0%, #53b7ff 45%, #ffd479 100%);
    transition: width 0.2s ease;
  }

  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes scaleOut {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(0.95); }
  }
  .animate-fadeOut {
    animation: fadeOut 200ms ease-out forwards;
  }
  .animate-scaleIn {
    animation: scaleIn 200ms ease-out forwards;
  }
  .animate-scaleOut {
    animation: scaleOut 200ms ease-out forwards;
  }
</style>
