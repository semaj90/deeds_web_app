<!--
Simple Report Editor Component
Provides basic report editing functionality for case documentation
-->
<script lang="ts">
  import type { Report } from '$lib/types';

  interface Props {
    report?: Report;
    caseId?: string;
    onclose?: () => void;
  }

  let { report, caseId, onclose }: Props = $props();

  let title = $state(report?.title || 'New Report');
  let content = $state(report?.content || '');
  let isEditing = $state(false);

  function handleSave() {
    // Mock save functionality
    console.log('Saving report:', { title, content, caseId });
    isEditing = false;
  }

  function handleEdit() {
    isEditing = true;
  }

  function handleCancel() {
    if (report) {
      title = report.title;
      content = report.content;
    }
    isEditing = false;
  }
</script>

<div class="report-editor nes-container is-dark">
  <div class="editor-header">
    <div class="title-section">
      {#if isEditing}
        <input
          class="nes-input"
          type="text"
          bind:value={title}
          placeholder="Report title..."
        />
      {:else}
        <h3 class="nes-text is-primary">{title}</h3>
      {/if}
    </div>

    <div class="editor-controls">
      {#if isEditing}
        <button class="nes-btn is-success" onclick={() => handleSave()}>
          Save
        </button>
        <button class="nes-btn is-warning" onclick={() => handleCancel()}>
          Cancel
        </button>
      {:else}
        <button class="nes-btn is-primary" onclick={() => handleEdit()}>
          Edit
        </button>
      {/if}
    </div>
  </div>

  <div class="editor-content">
    {#if isEditing}
      <div class="nes-field">
        <label class="nes-text" for="report-content">Report Content:</label>
        <textarea
          id="report-content"
          class="nes-textarea"
          bind:value={content}
          placeholder="Enter your report content here..."
          rows="15"
        ></textarea>
      </div>
    {:else}
      <div class="report-display nes-container">
        {#if content}
          <div class="report-text">
            {content}
          </div>
        {:else}
          <p class="nes-text is-disabled">No content available. Click Edit to add content.</p>
        {/if}
      </div>
    {/if}
  </div>

  {#if !isEditing && report}
    <div class="report-metadata">
      <div class="metadata-item">
        <span class="nes-text is-disabled">Created: {new Date(report.createdAt).toLocaleDateString()}</span>
      </div>
      {#if report.updatedAt}
        <div class="metadata-item">
          <span class="nes-text is-disabled">Updated: {new Date(report.updatedAt).toLocaleDateString()}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .report-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-height: 80vh;
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #495057;
    gap: 1rem;
  }

  .title-section {
    flex: 1;
  }

  .title-section input {
    width: 100%;
  }

  .title-section h3 {
    margin: 0;
  }

  .editor-controls {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .editor-content {
    flex: 1;
    overflow-y: auto;
  }

  .nes-field {
    margin-bottom: 0;
  }

  .nes-textarea {
    width: 100%;
    height: 100%;
    resize: vertical;
    min-height: 300px;
  }

  .report-display {
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    min-height: 300px;
  }

  .report-text {
    white-space: pre-wrap;
    line-height: 1.6;
    color: #e2e8f0;
  }

  .report-metadata {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #495057;
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .metadata-item {
    font-size: 0.875rem;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .editor-header {
      flex-direction: column;
      align-items: stretch;
    }

    .editor-controls {
      justify-content: flex-end;
    }

    .report-metadata {
      flex-direction: column;
      gap: 0.5rem;
    }
  }
</style>