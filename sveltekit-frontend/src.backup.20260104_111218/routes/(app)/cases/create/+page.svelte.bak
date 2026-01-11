<script lang="ts">
  import type { goto  } from '$app/navigation';
  import { ArrowLeft } from "lucide-svelte";
import { Save } from "lucide-svelte";
import { X } from "lucide-svelte";;

  // Form state with Svelte 5 runes
  let title = $state('');
  let caseNumber = $state('');
  let description = $state('');
  let status = $state <'open' | 'pending' | 'closed'>('open');
  let tags = $state('');
  let assignedTo = $state('');

  // UI state
  let loading = $state(false);
  let error = $state <string | null>(null);
  let tagInput = $state('');

  // Computed properties
  let tagList = $derived(tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0));

  // Handle form submission
  async function handleSubmit(e: Event) {
    e.preventDefault();

    if (!title.trim() || !caseNumber.trim()) {
      error = 'Title and case number are required';
      return;
    }

    try {
      loading = true;
      error = null;

      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          case_number: caseNumber.trim(),
          description: description.trim(),
          status,
          tags: tagList,
          assigned_to: assignedTo.trim() || null,
        }),
      });

      if (response.ok) {
        const newCase = await response.json();
        goto(`/cases/${newCase.id}`);
      } else {
        const errorData = await response.json();
        error = errorData.error || 'Failed to create case';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      loading = false;
    }
  }

  // Handle cancel
  function handleCancel() {
    goto('/cases');
  }

  // Add tag
  function addTag() {
    if (tagInput.trim() && !tagList.includes(tagInput.trim())) {
      const currentTags = tags ? tags.split(',').map(t => t.trim()) : [];
      currentTags.push(tagInput.trim());
      tags = currentTags.join(', ');
      tagInput = '';
    }
  }

  // Remove tag
  function removeTag(tagToRemove: string) {
    const currentTags = tagList.filter(tag => tag !== tagToRemove);
    tags = currentTags.join(', ');
  }

  // Handle tag input enter
  function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  }
</script>

<svelte:head>
  <title>Create New Case - Legal AI Platform</title>
  <meta name="description" content="Create a new legal case" />
</svelte:head>

<div class="create-case">
  <!-- Header -->
  <header class="page-header">
    <div class="header-nav">
      <button class="btn btn-link" onclick={handleCancel}>
        <ArrowLeft size={16} />
        Back to Cases
      </button>
    </div>

    <div class="header-content">
      <h1 class="page-title">Create New Case</h1>
      <p class="page-subtitle">Fill in the details to create a new legal case</p>
    </div>
  </header>

  <!-- Form -->
  <div class="form-container">
    {#if error}
      <div class="error-banner">
        <X size={16} />
        <span>{error}</span>
        <button class="error-close" onclick={() => error = null} aria-label="Close error">
          <X size={14} />
        </button>
      </div>
    {/if}

    <form onsubmit={handleSubmit} class="case-form">
      <div class="form-grid">
        <!-- Basic Information -->
        <div class="form-section">
          <h2 class="section-title">Basic Information</h2>

          <div class="form-group">
            <label for="title" class="form-label required">Case Title</label>
            <input
              id="title"
              type="text"
              bind:value={title}
              placeholder="Enter case title"
              required
              class="form-input"
            />
            <p class="form-help">A descriptive title for the case</p>
          </div>

          <div class="form-group">
            <label for="caseNumber" class="form-label required">Case Number</label>
            <input
              id="caseNumber"
              type="text"
              bind:value={caseNumber}
              placeholder="Enter case number"
              required
              class="form-input"
            />
            <p class="form-help">Official case reference number</p>
          </div>

          <div class="form-group">
            <label for="status" class="form-label">Status</label>
            <select id="status" bind:value={status} class="form-select">
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
            </select>
            <p class="form-help">Current status of the case</p>
          </div>
        </div>

        <!-- Details -->
        <div class="form-section">
          <h2 class="section-title">Case Details</h2>

          <div class="form-group">
            <label for="description" class="form-label">Description</label>
            <textarea
              id="description"
              bind:value={description}
              placeholder="Enter case description"
              rows="4"
              class="form-textarea"
            ></textarea>
            <p class="form-help">Detailed description of the case</p>
          </div>

          <div class="form-group">
            <label for="assignedTo" class="form-label">Assigned To</label>
            <input
              id="assignedTo"
              type="text"
              bind:value={assignedTo}
              placeholder="Enter assignee name"
              class="form-input"
            />
            <p class="form-help">Person responsible for this case</p>
          </div>
        </div>

        <!-- Tags -->
        <div class="form-section">
          <h2 class="section-title">Tags</h2>

          <div class="form-group">
            <label for="tagInput" class="form-label">Add Tags</label>
            <div class="tag-input-group">
              <input
                id="tagInput"
                type="text"
                bind:value={tagInput}
                placeholder="Enter tag and press Enter"
                onkeydown={handleTagKeydown}
                class="form-input"
              />
              <button type="button" onclick={addTag} class="btn btn-secondary tag-add-btn">
                Add
              </button>
            </div>
            <p class="form-help">Tags help organize and find cases</p>
          </div>

          {#if tagList.length > 0}
            <div class="tags-display">
              <label class="form-label">Current Tags:</label>
              <div class="tag-list">
                {#each tagList as tag (tag)}
                  <span class="tag">
                    {tag}
                    <button
                      type="button"
                      onclick={() => removeTag(tag)}
                      class="tag-remove"
                      aria-label="Remove {tag} tag"
                    >
                      <X size={12} />
                    </button>
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Form Actions -->
      <div class="form-actions">
        <button type="button" onclick={handleCancel} class="btn btn-secondary" disabled={loading}>
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" disabled={loading}>
          {#if loading}
            <div class="spinner"></div>
          {:else}
            <Save size={16} />
          {/if}
          Create Case
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .create-case {
    min-height: 100vh;
    background: #f8f9fa;
    padding: 2rem;
  }

  .page-header {
    background: white;
    padding: 2rem;
    border-radius: 0.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    margin-bottom: 2rem;
  }

  .header-nav {
    margin-bottom: 1rem;
  }

  .page-title {
    font-size: 2rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    color: #212529;
  }

  .page-subtitle {
    margin: 0;
    color: #6c757d;
  }

  .form-container {
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    overflow: hidden;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: #f8d7da;
    color: #721c24;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #f5c6cb;
  }

  .error-close {
    background: none;
    border: none;
    color: #721c24;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    margin-left: auto;
  }

  .error-close:hover {
    background: rgba(114, 28, 36, 0.1);
  }

  .case-form {
    padding: 2rem;
  }

  .form-grid {
    display: grid;
    gap: 2rem;
  }

  .form-section {
    border-bottom: 1px solid #e9ecef;
    padding-bottom: 2rem;
  }

  .form-section:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .section-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0 0 1.5rem 0;
    color: #212529;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #212529;
    margin-bottom: 0.5rem;
  }

  .form-label.required::after {
    content: ' *';
    color: #dc3545;
  }

  .form-input,
  .form-textarea,
  .form-select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 0.375rem;
    font-size: 1rem;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .form-input:focus,
  .form-textarea:focus,
  .form-select:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
  }

  .form-textarea {
    resize: vertical;
    min-height: 100px;
  }

  .form-select {
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e");
    background-position: right 0.5rem center;
    background-repeat: no-repeat;
    background-size: 1.5em 1.5em;
    padding-right: 2.5rem;
  }

  .form-help {
    margin: 0.25rem 0 0 0;
    font-size: 0.75rem;
    color: #6c757d;
  }

  .tag-input-group {
    display: flex;
    gap: 0.5rem;
  }

  .tag-add-btn {
    flex-shrink: 0;
    padding: 0.75rem 1rem;
  }

  .tags-display {
    margin-top: 1rem;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: #e9ecef;
    color: #495057;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .tag-remove {
    background: none;
    border: none;
    color: #6c757d;
    cursor: pointer;
    padding: 0.125rem;
    border-radius: 0.125rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tag-remove:hover {
    background: rgba(108, 117, 125, 0.2);
    color: #495057;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid #e9ecef;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
    text-decoration: none;
  }

  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .btn-link {
    background: none;
    color: #007bff;
    border: none;
    padding: 0;
    text-decoration: underline;
  }

  .btn-link:hover {
    color: #0056b3;
  }

  .btn-secondary {
    background: #6c757d;
    color: white;
    border-color: #6c757d;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #545b62;
    border-color: #545b62;
  }

  .btn-primary {
    background: #007bff;
    color: white;
    border-color: #007bff;
  }

  .btn-primary:hover:not(:disabled) {
    background: #0056b3;
    border-color: #0056b3;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .create-case {
      padding: 1rem;
    }

    .page-header {
      padding: 1.5rem;
    }

    .case-form {
      padding: 1.5rem;
    }

    .form-grid {
      gap: 1.5rem;
    }

    .form-section {
      padding-bottom: 1.5rem;
    }

    .tag-input-group {
      flex-direction: column;
    }

    .tag-add-btn {
      align-self: flex-start;
    }

    .form-actions {
      flex-direction: column-reverse;
    }

    .btn {
      width: 100%;
      justify-content: center;
    }
  }
</style>
