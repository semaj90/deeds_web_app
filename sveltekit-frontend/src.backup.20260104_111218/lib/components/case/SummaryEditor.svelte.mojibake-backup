<script lang="ts">
  import type { CaseSummary } from '$lib/types/case-summary';
  import CitationDetail from '../legal-ai/CitationDetail.svelte';
  import CitationList from '../legal-ai/CitationList.svelte';
  import CitationSearch from '../legal-ai/CitationSearch.svelte';

  let { summary, caseId = null } = $props<{
    summary: CaseSummary;
    caseId?: string | null;
  }>();

  let isEditing = false;
  let editedText = summary.text;
  let showCitationPanel = false;
  let selectedCitation: any = null;
  let showCitationSearch = false;
</script>

<div class="summary-editor">
  <div class="header">
    <h2>Case Summary</h2>
    <div class="meta">
      <span class="version">v{summary.version}</span>
      <span class="date">{new Date(summary.createdAt).toLocaleDateString()}</span>
    </div>
  </div>

  {#if isEditing}
    <textarea bind:value={editedText} class="editor" ></textarea>
    <div class="editor-actions">
      <button class="btn-save" onclick={() => (isEditing = false)}>Save</button>
      <button class="btn-cancel" onclick={() => (isEditing = false)}>Cancel</button>
    </div>
  {:else}
    <div class="content">
      <div class="text">
        {summary.text}
      </div>

      {#if summary.holding}
        <div class="section">
          <h3>Holding</h3>
          <p>{summary.holding}</p>
        </div>
      {/if}

      {#if summary.citations && summary.citations.length > 0}
        <div class="section">
          <h3>Citations</h3>
          <ul class="citations">
            {#each summary.citations as citation}
              <li>
                <a href="#" class="citation-link">
                  {citation.code} ({citation.jurisdiction})
                </a>
                <span class="citation-title">{citation.title}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>

    <div class="actions">
      <button class="btn-edit" onclick={() => (isEditing = true)}>Edit</button>
      <button class="btn-citations" onclick={() => (showCitationPanel = !showCitationPanel)}>
        {showCitationPanel ? 'Hide' : 'Show'} Citations
      </button>
    </div>

    {#if showCitationPanel}
      <div class="citation-panel">
        <div class="citation-panel-header">
          <h3>Citation Management</h3>
          <button class="close-btn" onclick={() => (showCitationPanel = false)}>✕</button>
        </div>

        <div class="citation-panel-content">
          {#if selectedCitation}
            <div class="citation-detail-view">
              <button class="back-btn" onclick={() => (selectedCitation = null)}>← Back</button>
              <CitationDetail
                citation={selectedCitation}
                showActions={true}
                onupdated={() => (selectedCitation = null)}
                ondelete={() => (selectedCitation = null)}
              />
            </div>
          {:else}
            <div class="citation-list-view">
              <div class="search-section">
                <h4>Search Citations</h4>
                <CitationSearch
                  onselect={(e) => (selectedCitation = e.detail)}
                />
              </div>

              <div class="list-section">
                <CitationList
                  {caseId}
                  limit={10}
                  showFilters={true}
                  onview={(e) => (selectedCitation = e.detail)}
                  onedit={(e) => (selectedCitation = e.detail)}
                  ondeleted={() => {}}
                />
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .summary-editor {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    padding: 1.5rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid #f0f0f0;
    padding-bottom: 1rem;
  }

  .header h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .meta {
    display: flex;
    gap: 1rem;
    font-size: 0.85rem;
    color: #666;
  }

  .version {
    background-color: #f0f0f0;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
  }

  .content {
    margin-bottom: 1.5rem;
  }

  .text {
    line-height: 1.6;
    color: #333;
    margin-bottom: 1.5rem;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .section {
    margin-bottom: 1.5rem;
  }

  .section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    color: #333;
  }

  .section p {
    margin: 0;
    color: #666;
    line-height: 1.5;
  }

  .citations {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .citations li {
    padding: 0.5rem 0;
    border-bottom: 1px solid #f5f5f5;
  }

  .citations li:last-child {
    border-bottom: none;
  }

  .citation-link {
    color: #007bff;
    text-decoration: none;
    font-weight: 500;
  }

  .citation-link:hover {
    text-decoration: underline;
  }

  .citation-title {
    display: block;
    font-size: 0.85rem;
    color: #666;
    margin-top: 0.25rem;
  }

  .editor {
    width: 100%;
    min-height: 300px;
    padding: 1rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.9rem;
    resize: vertical;
  }

  .editor-actions,
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .btn-save,
  .btn-cancel,
  .btn-edit {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .btn-save {
    background-color: #28a745;
    color: white;
  }

  .btn-save:hover {
    background-color: #218838;
  }

  .btn-cancel {
    background-color: #6c757d;
    color: white;
  }

  .btn-cancel:hover {
    background-color: #545b62;
  }

  .btn-edit {
    background-color: #007bff;
    color: white;
  }

  .btn-edit:hover {
    background-color: #0056b3;
  }

  .btn-citations {
    background-color: #8b4513;
    color: white;
  }

  .btn-citations:hover {
    background-color: #a0522d;
  }

  .citation-panel {
    margin-top: 1.5rem;
    border: 2px solid #d4a574;
    border-radius: 6px;
    background-color: #f5f1e8;
    overflow: hidden;
  }

  .citation-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background-color: #e0d5c7;
    border-bottom: 1px solid #d4a574;
  }

  .citation-panel-header h3 {
    margin: 0;
    font-size: 1rem;
    color: #2c2c2c;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: #666;
    padding: 0;
  }

  .close-btn:hover {
    color: #333;
  }

  .citation-panel-content {
    padding: 1rem;
  }

  .citation-detail-view {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .back-btn {
    align-self: flex-start;
    padding: 0.4rem 0.8rem;
    background-color: #e0d5c7;
    border: 1px solid #d4a574;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .back-btn:hover {
    background-color: #d4a574;
  }

  .citation-list-view {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .search-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .search-section h4 {
    margin: 0;
    font-size: 0.95rem;
    color: #2c2c2c;
  }

  .list-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
</style>
