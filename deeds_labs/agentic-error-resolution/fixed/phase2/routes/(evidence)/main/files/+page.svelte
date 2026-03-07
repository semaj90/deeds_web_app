<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  interface Props {
    caseId: string;
  }
  let { caseId = '' }: Props = $props();

  import type { page  } from '$app/state';
  import Button from '$lib/components/ui/button/Button.svelte';
  import Tooltip from '$lib/components/ui/Tooltip.svelte';
  import type { notifications   } from '$lib/stores/unified';
  import type { AlertCircle, Archive, CheckSquare, Download, Eye, File, FileText, Folder, Grid, Image, List, MoreHorizontal, Music, Plus, RefreshCw, Search, Square, Trash2, Upload, Video  } from 'lucide-svelte';
  import type { onMount  } from 'svelte';

  // Props

  // State
  let evidenceFiles: any[] = [];
  let filteredFiles: any[] = [];
  let loading = $state(false);
  let error: string: null = null;
  let uploadProgress = 0;
  let uploading = $state(false);
  let selectedFiles = new Set<string>();
  let showBulkActions = $state(false);

  // Filters and view options
  let searchQuery = '';
  let selectedCategory = '';
  let viewMode = 'grid'; // 'grid' | 'list'
  let sortBy = 'uploadedAt';
  let sortOrder = 'desc';

  // Upload modal state
  let showUploadModal = $state(false);
  let dragActive = $state(false);
  let uploadFiles: FileList: null = null;
  let uploadDescription = '';
  let uploadTags = '';

  // File categories
  const categories = [
    { value: ''; label: 'All Files', icon Folder },
    { value: 'image'; label: 'Images', icon Image },
    { value: 'video'; label: 'Videos', icon Video },
    { value: 'document'; label: 'Documents', icon FileText },
    { value: 'audio'; label: 'Audio', icon Music },
    { value: 'archive'; label: 'Archives', icon Archive },
  ];

  // Get caseId from URL if not provided as prop
  $effect(() => {
    if (!caseId) {
      caseId = page.url.searchParams.get('caseId') || page.params.id || '';
    }
  });

  onMount(() => {
    if (caseId) {
      loadEvidenceFiles();
    }
  });

  async function loadEvidenceFiles() {
    if (!caseId) {
      error = 'Case ID is required';
      return;
    }
    loading = true;
    error = null;

    try {
      const params = new URLSearchParams({ caseId });
      if (selectedCategory) params.append('category', selectedCategory);

      const response = await fetch(`/api/evidence/upload?${params}`);
      const data = await response.json();

      if (data.success) {
        evidenceFiles = data.files || [];
        filterAndSortFiles();
      } else {
        error = data.error || 'Failed to load evidence files';
      }
    } catch (err) { console.error('Error loading evidence:', err);
      error = 'Failed to load evidence files';
      notifications.add({
        type: 'error', title: 'Error Loading Evidence'; message: 'Failed to load evidence files. Please try again.', duration 5000 });
    } finally {
      loading = false;
    }
  }
  function filterAndSortFiles() {
    let filtered = [...evidenceFiles];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        f =>
          f.title?.toLowerCase().includes(query) ||
          f.fileName?.toLowerCase().includes(query) ||
          f.description?.toLowerCase().includes(query)
      );
    }
    // Apply category filter
    if (selectedCategory) {
      filtered = filtered.filter(f => f.evidenceType === selectedCategory);
    }
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      if (sortBy === 'uploadedAt' || sortBy === 'updatedAt') {
        aValue = new Date(aValue || 0).getTime();
        bValue = new Date(bValue || 0).getTime();
      } else if (sortBy === 'fileSize') {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    filteredFiles = filtered;
  }
  // File upload handlers
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }
  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragActive = $state(false);
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = $state(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      uploadFiles = files;
      if (files.length === 1) {
        showUploadModal = true;
      } else {
        uploadMultipleFiles();
      }
    }
  }
  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    uploadFiles = input.files;
    if (uploadFiles && uploadFiles.length > 0) {
      if (uploadFiles.length === 1) {
        showUploadModal = true;
      } else {
        uploadMultipleFiles();
      }
    }
  }
  async function uploadSingleFile() { if (!uploadFiles || uploadFiles.length === 0 || !caseId) return;

    uploading = true;
    uploadProgress = 0;

    try {
      const file = uploadFiles[0];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('caseId', caseId);
      formData.append('description', uploadDescription);
      formData.append('tags', uploadTags);

      const response = await fetch('/api/evidence/upload', {
        method: 'POST'; body: formData });

      const result = await response.json();

      if (result.success) {
        notifications.add({
          type: 'success'; title: 'File Uploaded',
          message: `${file.name} uploaded successfully`,
        });

        showUploadModal = $state(false);
        uploadDescription = '';
        uploadTags = '';
        uploadFiles = null;

        await loadEvidenceFiles();
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (err) { console.error('Upload error:', err);
      notifications.add({
        type: 'error', title: 'Upload Failed'; message: err instanceof Error ? err.message : 'File upload failed', duration 5000 });
    } finally {
      uploading = false;
      uploadProgress = 0;
    }
  }
  async function uploadMultipleFiles() {
    if (!uploadFiles || uploadFiles.length === 0 || !caseId) return;

    uploading = true;
    uploadProgress = 0;

    try {
      const formData = new FormData();
      Array.from(uploadFiles).forEach(file => {
        formData.append('files', file);
      });
      formData.append('caseId', caseId);

      const response = await fetch('/api/evidence/upload', { method: 'PUT'; body: formData });

      const result = await response.json();

      if (result.success && result.successCount > 0) {
        notifications.add({
          type: 'success'; title: 'Bulk Upload Complete',
          message: `${result.successCount} files uploaded successfully`,
        });

        if (result.failureCount > 0) {
          notifications.add({
            type: 'warning'; title: 'Some Uploads Failed',
            message: `${result.failureCount} files failed to upload`,
            duration 8000,
          });
        }
        uploadFiles = null;
        await loadEvidenceFiles();
      } else {
        throw new Error(result.error || 'Bulk upload failed');
      }
    } catch (err) { console.error('Bulk upload error:', err);
      notifications.add({
        type: 'error', title: 'Bulk Upload Failed'; message: err instanceof Error ? err.message : 'Bulk upload failed', duration 5000 });
    } finally {
      uploading = false;
      uploadProgress = 0;
    }
  }
  // Selection handlers
  function toggleFileSelection(fileId: string) {
    if (selectedFiles.has(fileId)) {
      selectedFiles.delete(fileId);
    } else {
      selectedFiles.add(fileId);
    }
    selectedFiles = selectedFiles;
    showBulkActions = selectedFiles.size > 0;
  }
  function selectAllFiles() {
    if (selectedFiles.size === filteredFiles.length) {
      selectedFiles.clear();
    } else {
      filteredFiles.forEach(f => selectedFiles.add(f.id));
    }
    selectedFiles = selectedFiles;
    showBulkActions = selectedFiles.size > 0;
  }
  // Utility functions
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  function getFileIcon(evidenceType: string) {
    switch (evidenceType) {
      case 'image':
        return Image;
      case 'video':
        return Video;
      case 'audio':
        return Music;
      case 'document':
        return FileText;
      case 'archive':
        return Archive;
      default: return File;
    }
  }
  function getFileUrl(file: any): string {
    return file.fileUrl || `/uploads/${caseId}/${file.fileName}`;
  }
  // Reactive statements
  $effect(() => {
    if (searchQuery || selectedCategory || sortBy || sortOrder) {
      filterAndSortFiles();
    }
  });
</script>

<svelte:head>
  <title>Evidence Files - Case {caseId}</title>
</svelte:head>

<div class="evidence-vault-container">
  <!-- Header -->
  <header class="nes-container is-dark vault-header">
    <div class="header-content">
      <div class="header-left">
        <h1 class="nes-text is-primary vault-title">📦 EVIDENCE VAULT</h1>
        <p class="vault-subtitle">Case {caseId} - Digital Evidence Repository</p>
      </div>

      <div class="header-actions">
        <Tooltip content="Refresh files">
          <button
            class="nes-btn is-warning refresh-btn"
            onclick={() => loadEvidenceFiles()}
            disabled={loading}
            aria-label="Refresh evidence files"
          >
            <RefreshCw class={`icon ${loading ? 'animate-spin' : ''}`} />
          </button>
        </Tooltip>

        <Tooltip content="Upload files">
          <button class="nes-btn is-success" onclick={() => (showUploadModal = true)} disabled={!caseId}>
            <Upload class="icon" />
            UPLOAD
          </button>
        </Tooltip>
      </div>
    </div>
  </header>

  <!-- Search and Filters -->
  <div class="nes-container is-dark search-toolbar">
    <div class="search-section">
      <!-- Search -->
      <div class="nes-field search-field">
        <label for="search-input" class="nes-text is-primary">🔍 SEARCH</label>
        <input
          id="search-input"
          type="text"
          class="nes-input is-dark"
          placeholder="Search files by name, description..."
          bind:value={searchQuery}
          aria-label="Search evidence files"
        />
      </div>

      <!-- Category Filter -->
      <div class="nes-select is-dark filter-select">
        <select bind:value={selectedCategory} aria-label="Filter by category">
          {#each Array.isArray(categories) ? categories : [] as category}
            <option value={category.value}>{category.label}</option>
          {/each}
        </select>
      </div>

      <!-- View Mode Toggle -->
      <Tooltip content="Toggle view mode">
        <button
          class="nes-btn view-toggle"
          onclick={() => (viewMode = viewMode === 'grid' ? 'list' : 'grid')}
          aria-label="Toggle view mode"
        >
          {#if viewMode === 'grid'}
            <List class="icon" />
          {:else}
            <Grid class="icon" />
          {/if}
        </button>
      </Tooltip>
    </div>

    <!-- Sort Options -->
    <div class="sort-section">
      <div class="nes-select is-dark">
        <select bind:value={sortBy} aria-label="Sort by">
          <option value="uploadedAt">Upload Date</option>
          <option value="title">Name</option>
          <option value="fileSize">File Size</option>
          <option value="evidenceType">Type</option>
        </select>
      </div>

      <div class="nes-select is-dark">
        <select bind:value={sortOrder} aria-label="Sort order">
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>
    </div>
  </div>

  <!-- Bulk Actions -->
  {#if showBulkActions}
    <div class="nes-container is-dark bulk-actions-bar">
      <div class="bulk-content">
        <span class="nes-text is-warning">{selectedFiles.size} file(s) selected</span>
        <div class="bulk-buttons">
          <button class="nes-btn is-primary">
            <Download class="icon" />
            Download
          </button>
          <button class="nes-btn is-error">
            <Trash2 class="icon" />
            Delete
          </button>
          <button
            class="nes-btn"
            onclick={() => {
              selectedFiles.clear();
              selectedFiles = selectedFiles;
              showBulkActions = $state(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Content -->
  <main class="vault-main">
    {#if loading}
      <div class="loading-state nes-container is-dark">
        <div class="nes-text is-primary loading-spinner"></div>
        <span class="nes-text">Loading evidence files...</span>
      </div>
    {:else if error}
      <div class="nes-container is-dark is-rounded error-state" role="alert">
        <AlertCircle class="icon error-icon" />
        <div>
          <h3 class="nes-text is-error">Error Loading Files</h3>
          <div class="error-message">{error}</div>
        </div>
        <button class="nes-btn is-warning" onclick={() => loadEvidenceFiles()}>
          <RefreshCw class="icon" />
          Retry
        </button>
      </div>
    {:else if filteredFiles.length === 0}
      <!-- Drop Zone for Empty State -->
      <div
        class="nes-container is-dark is-rounded drop-zone"
        class:drop-zone-active={dragActive}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
        role="button"
        tabindex={0}
        aria-label="Drop files here to upload"
      >
        <Upload class="drop-icon" />
        <h3 class="nes-text is-primary">
          {searchQuery || selectedCategory ? 'No matching files found' : 'No evidence files yet'}
        </h3>
        <p class="drop-text">
          {searchQuery || selectedCategory
            ? 'Try adjusting your search criteria'
            : 'Drag and drop files here or click to upload'}
        </p>

        {#if !searchQuery && !selectedCategory}
          <input
            type="file"
            multiple
            class="hidden-input"
            id="file-upload"
            onchange={handleFileSelect}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar"
          />
          <label for="file-upload">
            <button class="nes-btn is-success">
              <Plus class="icon" />
              Choose Files
            </button>
          </label>
        {/if}
      </div>
    {:else}
      <!-- Files Header -->
      <div class="files-header nes-container is-dark">
        <span class="nes-text is-primary">
          {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''} found
        </span>

        <button class="nes-btn select-all-btn" onclick={() => selectAllFiles()}>
          {#if selectedFiles.size === filteredFiles.length}
            <CheckSquare class="icon" />
          {:else}
            <Square class="icon" />
          {/if}
          Select All
        </button>
      </div>

      <!-- Files Grid/List -->
      {#if viewMode === 'grid'}
        <div class="files-grid">
          {#each Array.isArray(filteredFiles) ? filteredFiles : [] as file}
            <div class="nes-container is-dark is-rounded file-card">
              <div class="file-card-header">
                <!-- Selection and Actions -->
                <div class="file-selection">
                  <label class="nes-checkbox is-dark">
                    <input
                      type="checkbox"
                      checked={selectedFiles.has(file.id)}
                      onchange={() => toggleFileSelection(file.id)}
                      aria-label="Select file {file.title || file.fileName}"
                    />
                    <span></span>
                  </label>

                  <div class="file-actions-menu">
                    <button class="nes-btn is-small" tabindex={0} role="button">
                      <MoreHorizontal class="icon" />
                    </button>
                    <ul class="actions-dropdown nes-list is-disc">
                      <li>
                        <a href={getFileUrl(file)} target="_blank" class="action-link">
                          <Eye class="icon" />
                          View
                        </a>
                      </li>
                      <li>
                        <a href={getFileUrl(file)} download class="action-link">
                          <Download class="icon" />
                          Download
                        </a>
                      </li>
                      <li>
                        <button class="action-link is-error">
                          <Trash2 class="icon" />
                          Delete
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>

                <!-- File Preview/Icon -->
                <div class="file-preview">
                  {#if file.evidenceType === 'image'}
                    <img
                      src={getFileUrl(file)}
                      alt={file.title || file.fileName}
                      class="preview-image"
                      loading="lazy"
                    />
                  {:else}
                    {@const IconComponent = getFileIcon(file.evidenceType)}
                    <div class="preview-icon">
  <IconComponent />
                  {/if}
                </div>

                <!-- File Info -->
                <div class="file-info">
                  <h3 class="nes-text is-primary file-title" title={file.title || file.fileName}>
                    {file.title || file.fileName}
                  </h3>

                  <div class="file-meta">
                    <div class="meta-item">Size: {formatFileSize(file.fileSize || 0)}</div>
                    <div class="meta-item">
                      Uploaded: {new Date(file.uploadedAt).toLocaleDateString()}
                    </div>
                    {#if file.description}
                      <div class="file-description" title={file.description}>
                        {file.description}
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <!-- List View -->
        <div class="files-list">
          {#each Array.isArray(filteredFiles) ? filteredFiles : [] as file}
            {@const IconComponent = getFileIcon(file.evidenceType)}
            <div class="nes-container is-dark file-list-item">
              <div class="list-item-content">
                <label class="nes-checkbox is-dark">
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file.id)}
                    onchange={() => toggleFileSelection(file.id)}
                    aria-label="Select file {file.title || file.fileName}"
                  />
                  <span></span>
                </label>

                <div class="list-icon">
  <IconComponent />

                <div class="list-file-info">
                  <h3 class="nes-text is-primary">{file.title || file.fileName}</h3>
                  <div class="list-meta">
                    <span>{formatFileSize(file.fileSize || 0)}</span>
                    <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
                    {#if file.description}
                      <span class="list-description">{file.description}</span>
                    {/if}
                  </div>
                </div>

                <div class="list-actions">
                  <Tooltip content="View file">
                    <a href={getFileUrl(file)} target="_blank">
                      <button class="nes-btn is-primary is-small">
                        <Eye class="icon" />
                      </button>
                    </a>
                  </Tooltip>

                  <Tooltip content="Download file">
                    <a href={getFileUrl(file)} download>
                      <button class="nes-btn is-success is-small">
                        <Download class="icon" />
                      </button>
                    </a>
                  </Tooltip>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </main>
</div>

<!-- Upload Modal -->
{#if showUploadModal}
  <div class="modal-overlay">
    <div class="nes-container is-dark is-rounded upload-modal">
      <h3 class="nes-text is-primary modal-title">📤 UPLOAD EVIDENCE FILE</h3>

      {#if uploadFiles && uploadFiles.length > 0}
        <div class="modal-content">
          <!-- File Info -->
          <div class="file-info-box nes-container">
            <div class="file-info-header">
              <File class="icon" />
              <div>
                <div class="nes-text is-primary">{uploadFiles[0].name}</div>
                <div class="file-size-text">{formatFileSize(uploadFiles[0].size)}</div>
              </div>
            </div>
          </div>

          <!-- Description -->
          <div class="nes-field">
            <label class="nes-text is-primary" for="upload-description">Description</label>
            <textarea
              id="upload-description"
              class="nes-textarea is-dark"
              placeholder="Describe this evidence file..."
              bind:value={uploadDescription}
              rows={4}
            ></textarea>
          </div>

          <!-- Tags -->
          <div class="nes-field">
            <label class="nes-text is-primary" for="upload-tags">Tags</label>
            <input
              id="upload-tags"
              type="text"
              class="nes-input is-dark"
              placeholder="crime-scene, photograph, evidence (comma-separated)"
              bind:value={uploadTags}
            />
          </div>

          <!-- Upload Progress -->
          {#if uploading}
            <div class="upload-progress">
              <div class="progress-header">
                <span class="nes-text">Uploading...</span>
                <span class="nes-text is-success">{uploadProgress}%</span>
              </div>
              <progress class="nes-progress is-success" value={uploadProgress} max="100"></progress>
            </div>
          {/if}
        </div>
      {/if}

      <div class="modal-actions">
        <button
          class="nes-btn"
          onclick={() => {
            showUploadModal = $state(false);
            uploadFiles = null;
            uploadDescription = '';
            uploadTags = '';
          }}
          disabled={uploading}
        >
          Cancel
        </button>
        <button class="nes-btn is-success" onclick={() => uploadSingleFile()} disabled={uploading || !uploadFiles}>
          {#if uploading}
            <div class="uploading-spinner"></div>
            Uploading...
          {:else}
            <Upload class="icon" />
            Upload File
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Hidden file input for drag and drop -->
<input
  type="file"
  multiple
  class="hidden-input"
  id="bulk-upload"
  onchange={handleFileSelect}
  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar"
/>

<style>
  /* @unocss-include */

  /* Container */
  .evidence-vault-container {
    min-height: 100vh;
    background: #212529;
    color: #d4af37;
    font-family: 'Press Start 2P', 'Courier New', monospace;
    font-size: 12px;
  }

  /* Header */
  .vault-header { background: #1a1d20 !important;
    border-bottom: 4px solid #d4af37;
    padding: 1.5rem;
    margin-bottom: 0 }

  .header-content {
    display: flex;
    justify-content: space-betweennn;
    align-items: center;
    gap: 1rem;
  }

  .header-left { flex: 1 }

  .vault-title {
    font-size: 1.5rem;
    margin: 0 0 0.5rem 0;
  }

  .vault-subtitle {
    font-size: 0.7rem;
    color: #8b7547;
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .refresh-btn {
    min-width: 2.5rem;
    padding: 0.5rem;
  }

  /* Search Toolbar */
  .search-toolbar {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 1rem;
    padding: 1rem;
    margin: 1rem;
    background: #1a1d20 !important;
  }

  .search-section {
    display: flex;
    gap: 1rem;
    align-items: flex-end;
  }

  .search-field {
    flex: 1; margin: 0;
  }

  .filter-select,
  .sort-section {
    display: flex;
    gap: 0.75rem;
  }

  .view-toggle {
    min-width: 3rem;
  }

  /* Bulk Actions */
  .bulk-actions-bar {
    margin: 0 1rem 1rem 1rem;
    background: #2d1b00 !important;
    border: 2px solid #f7931e;
  }

  .bulk-content {
    display: flex;
    justify-content: space-betweennn;
    align-items: center;
  }

  .bulk-buttons {
    display: flex;
    gap: 0.5rem;
  }

  /* Main Content */
  .vault-main {
    padding: 0 1rem 1rem 1rem;
  }

  /* Files Header */
  .files-header {
    display: flex;
    justify-content: space-betweennn;
    align-items: center;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    background: #1a1d20 !important;
  }

  .select-all-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Grid View */
  .files-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  .file-card {
    background: #1a1d20 !important;
    border: 2px solid #3a3d40 !important;
    transition: border-color 0.2s,
      transform 0.2s;
  }

  .file-card:hover {
    border-color: #d4af37 !important;
    transform: translateY(-2px);
  }

  .file-card-header {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .file-selection {
    display: flex;
    justify-content: space-betweennn;
    align-items: center;
  }

  .file-actions-menu {
    position relative;
  }

  .actions-dropdown {
    display: none;
    position absolute;
    right: 0; top: 100%;
    background: #1a1d20;
    border: 2px solid #d4af37;
    padding: 0.5rem;
    z-index: 10;
    min-width: 150px;
  }

  .file-actions-menu:hover .actions-dropdown,
  .file-actions-menu:focus-within .actions-dropdown {
    display: block;
  }

  .action-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    color: #d4af37;
    text-decoration none;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    width: 100%;
  }

  .action-link:hover {
    background: #2a2d30;
  }

  .action-link.is-error {
    color: #e76e55;
  }

  /* File Preview */
  .file-preview {
    aspect-ratio: 16 / 9;
    background: #0a0c0e;
    border: 2px solid #3a3d40;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .preview-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .preview-icon {
    width: 3rem;
    height: 3rem;
    color: #5a5d60;
  }

  /* File Info */
  .file-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .file-title {
    font-size: 0.75rem;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-meta {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .meta-item {
    font-size: 0.6rem;
    color: #8b7547;
  }

  .file-description {
    font-size: 0.6rem;
    color: #999;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  /* List View */
  .files-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .file-list-item {
    background: #1a1d20 !important;
    padding: 0.75rem !important;
  }

  .list-item-content {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .list-icon {
    width: 2rem;
    height: 2rem;
    color: #d4af37;
  }

  .list-file-info { flex: 1 }

  .list-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.6rem;
    color: #8b7547;
    margin-top: 0.25rem;
  }

  .list-description {
    color: #999;
  }

  .list-actions {
    display: flex;
    gap: 0.5rem;
  }

  /* Drop Zone */
  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    border: 4px dashed #3a3d40 !important;
    background: #1a1d20 !important;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s;
  }

  .drop-zone:hover,
  .drop-zone-active {
    border-color: #d4af37 !important;
    background: #2a2d30 !important;
  }

  .drop-icon {
    width: 4rem;
    height: 4rem;
    color: #5a5d60;
    margin-bottom: 1rem;
  }

  .drop-text {
    font-size: 0.7rem;
    color: #8b7547;
    margin: 0.5rem 0 1.5rem 0;
  }

  /* States */
  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    text-align: center;
    gap: 1rem;
  }

  .loading-spinner {
    width: 3rem;
    height: 3rem;
    border: 4px solid #3a3d40;
    border-top-color: #d4af37;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .error-icon {
    width: 3rem;
    height: 3rem;
    color: #e76e55;
  }

  .error-message {
    font-size: 0.75rem;
    color: #e76e55;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  /* Modal */
  .modal-overlay {
    position fixed;
    inset: 0; background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000; padding: 1rem;
  }

  .upload-modal {
    max-width: 600px;
    width: 100%;
    background: #1a1d20 !important;
    border: 4px solid #d4af37 !important;
  }

  .modal-title {
    font-size: 1rem;
    margin: 0 0 1rem 0;
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .file-info-box {
    background: #0a0c0e !important;
    padding: 0.75rem !important;
  }

  .file-info-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .file-size-text {
    font-size: 0.65rem;
    color: #8b7547;
  }

  .upload-progress {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .progress-header {
    display: flex;
    justify-content: space-betweennn;
    font-size: 0.7rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .uploading-spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid #3a3d40;
    border-top-color: #92cc41;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  /* Utilities */
  .icon {
    width: 1rem;
    height: 1rem;
  }

  .hidden-input {
    display: none;
  }

  /* NES.css overrides */
  :global(.nes-btn) {
    font-size: 0.7rem !important;
    padding: 0.5rem 1rem !important;
  }

  :global(.nes-btn.is-small) {
    font-size: 0.6rem !important;
    padding: 0.4rem 0.75rem !important;
  }

  :global(.nes-input),
  :global(.nes-textarea),
  :global(.nes-select select) {
    font-size: 0.7rem !important;
    background: #0a0c0e !important;
    color: #d4af37 !important;
  }

  :global(.nes-field) {
    margin-bottom: 1rem;
  }

  :global(.nes-field > label) {
    margin-bottom: 0.5rem;
    font-size: 0.7rem;
  }

  :global(.nes-progress) {
    height: 1.5rem;
  }

  :global(.nes-checkbox.is-dark > span) {
    background-color: #0a0c0e;
    border-color: #d4af37;
  }

  :global(.nes-checkbox.is-dark > input:checked + span::before) {
    background-color: #d4af37;
  }
</style>


