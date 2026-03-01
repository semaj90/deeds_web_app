<script lang="ts">
  interface Case {
    id: string;
    title: string;
    number: string;
    status: string;
  }

  interface Props {
    isOpen?: boolean;
    statuteCode?: string | null;
    citationId?: string | null;
    onattached?: (data: { caseId: string; linkType: string; notes: string }) => void;
  }

  let { isOpen = false, statuteCode = null, citationId = null, onattached }: Props = $props();

  let cases: Case[] = $state([]);
  let selectedCaseId = $state('');
  let linkType = $state('CHARGED_UNDER');
  let notes = $state('');
  let isLoading = $state(true);
  let error: string | null = $state(null);
  let isSaving = $state(false);
  let searchQuery = $state('');

  const linkTypes = ['CHARGED_UNDER', 'CITED_IN', 'RELATED_TO', 'OVERRULED_BY', 'AFFIRMED_BY'];

  // Filter cases based on search query
  let filteredCases = $derived.by(() => {
    if (!searchQuery.trim()) return cases;
    const query = searchQuery.toLowerCase();
    return cases.filter(
      (c) =>
        c.title.toLowerCase().includes(query) ||
        c.number.toLowerCase().includes(query) ||
        c.status.toLowerCase().includes(query)
    );
  });

  $effect(() => {
    (async () => {
      await loadCases();
    })();
  });

  async function loadCases() {
    isLoading = true;
    error = null;

    try {
      const response = await fetch('/api/cases?status=active&limit=50');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          cases = data.data;
        } else {
          error = data.error ?? 'Failed to load cases';
        }
      } else {
        error = 'Failed to load cases';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      isLoading = false;
    }
  }

  async function handleSubmit(e?: Event) {
    e?.preventDefault();
    error = null;

    if (!selectedCaseId) {
      error = 'Please select a case';
      return;
    }

    isSaving = true;

    try {
      const endpoint = statuteCode
        ? `/api/cases/${selectedCaseId}/laws`
        : `/api/cases/${selectedCaseId}/citations`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statute_code: statuteCode,
          citation_id: citationId,
          link_type: linkType,
          notes: notes || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          onattached?.({ caseId: selectedCaseId, linkType, notes });
          closeModal();
        } else {
          error = data.error || 'Failed to attach';
        }
      } else {
        error = 'Failed to attach';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      isSaving = false;
    }
  }

  function closeModal() {
    isOpen = false;
    selectedCaseId = '';
    linkType = 'CHARGED_UNDER';
    notes = '';
    error = null;
    searchQuery = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeModal();
    }
  }

  // Keyboard navigation for case list
  function handleListKeydown(e: KeyboardEvent) {
    const items = filteredCases;
    const currentIndex = items.findIndex((c) => c.id === selectedCaseId);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (currentIndex < items.length - 1) {
          selectedCaseId = items[currentIndex + 1].id;
        } else if (currentIndex === -1 && items.length > 0) {
          selectedCaseId = items[0].id;
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (currentIndex > 0) {
          selectedCaseId = items[currentIndex - 1].id;
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedCaseId) {
          handleSubmit();
        }
        break;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="modal-overlay" onclick={closeModal} onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); closeModal(); } }} role="button" tabindex="0">
    <div class="modal-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="presentation">
      <div class="modal-header">
        <h2>Attach to Case</h2>
        <button class="close-btn" onclick={closeModal}>&#10005;</button>
      </div>

      <form onsubmit={handleSubmit} class="attach-form">
        {#if error}
          <div class="error-message">
            <p>{error}</p>
          </div>
        {/if}

        {#if isLoading}
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading cases...</p>
          </div>
        {:else}
          <!-- Search Input -->
          <div class="form-group">
            <label for="case-search">Select Case *</label>
            <input
              type="text"
              id="case-search"
              bind:value={searchQuery}
              placeholder="Search by case number or title..."
              class="search-input"
              disabled={isSaving}
              onkeydown={handleListKeydown}
            />
          </div>

          <!-- Searchable Case List -->
          <div class="case-list-container">
            <div class="case-list" onkeydown={handleListKeydown} role="listbox" tabindex="0">
              {#if filteredCases.length === 0}
                <div class="no-results">
                  <p>No cases found matching "{searchQuery}"</p>
                </div>
              {:else}
                {#each filteredCases as caseItem}
                  <button
                    type="button"
                    class="case-item"
                    class:selected={selectedCaseId === caseItem.id}
                    onclick={() => (selectedCaseId = caseItem.id)}
                    disabled={isSaving}
                    role="option"
                    aria-selected={selectedCaseId === caseItem.id}
                  >
                    <div class="case-number">{caseItem.number}</div>
                    <div class="case-title">{caseItem.title}</div>
                    <div class="case-status">{caseItem.status}</div>
                  </button>
                {/each}
              {/if}
            </div>
            <div class="case-count">
              {filteredCases.length} of {cases.length} {cases.length === 1 ? 'case' : 'cases'}
            </div>
          </div>

          <div class="form-group">
            <label for="link-type">Link Type *</label>
            <select id="link-type" bind:value={linkType} disabled={isSaving} required>
              {#each linkTypes as type}
                <option value={type}>{type}</option>
              {/each}
            </select>
          </div>

          <div class="form-group">
            <label for="notes">Notes</label>
            <textarea
              id="notes"
              bind:value={notes}
              placeholder="Add notes about this link..."
              rows="3"
              disabled={isSaving}
            ></textarea>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-cancel" onclick={closeModal} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" class="btn-attach" disabled={isSaving || !selectedCaseId}>
              {isSaving ? 'Attaching...' : 'Attach'}
            </button>
          </div>
        {/if}
      </form>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 2px solid #d4a574;
    background-color: #f5f1e8;
  }

  .modal-header h2 {
    margin: 0;
    font-family: 'Crimson Text', Georgia, serif;
    font-size: 1.5rem;
    color: #2c2c2c;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #666;
    padding: 0;
    transition: color 0.2s;
  }

  .close-btn:hover {
    color: #333;
  }

  .attach-form {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .error-message {
    padding: 1rem;
    background-color: #ffe6e6;
    border: 1px solid #ff6b6b;
    border-radius: 4px;
    color: #c92a2a;
  }

  .error-message p {
    margin: 0;
    font-size: 0.9rem;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #e0e0e0;
    border-top-color: #8b4513;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-weight: 600;
    color: #2c2c2c;
    font-size: 0.9rem;
  }

  .search-input {
    padding: 0.75rem;
    border: 1px solid #d4a574;
    border-radius: 4px;
    font-family: 'Source Sans 3', sans-serif;
    font-size: 0.95rem;
    transition: all 0.2s;
  }

  .search-input:focus {
    outline: none;
    border-color: #8b4513;
    box-shadow: 0 0 0 3px rgba(139, 69, 19, 0.1);
  }

  .search-input:disabled {
    background-color: #f0ebe0;
    color: #999;
  }

  .case-list-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .case-list {
    max-height: 250px;
    overflow-y: auto;
    border: 1px solid #d4a574;
    border-radius: 4px;
    background-color: white;
  }

  .case-list:focus {
    outline: none;
    border-color: #8b4513;
    box-shadow: 0 0 0 3px rgba(139, 69, 19, 0.1);
  }

  .case-item {
    width: 100%;
    text-align: left;
    padding: 0.75rem 1rem;
    border: none;
    border-bottom: 1px solid #e0d5c7;
    background-color: white;
    cursor: pointer;
    transition: background-color 0.2s;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .case-item:last-child {
    border-bottom: none;
  }

  .case-item:hover:not(:disabled) {
    background-color: #f5f1e8;
  }

  .case-item.selected {
    background-color: #e8dcc5;
    border-left: 3px solid #8b4513;
  }

  .case-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .case-number {
    font-weight: 600;
    color: #8b4513;
    font-size: 0.85rem;
  }

  .case-title {
    color: #2c2c2c;
    font-size: 0.95rem;
  }

  .case-status {
    font-size: 0.8rem;
    color: #666;
    text-transform: capitalize;
  }

  .case-count {
    text-align: right;
    font-size: 0.8rem;
    color: #666;
  }

  .no-results {
    padding: 2rem;
    text-align: center;
    color: #666;
  }

  .no-results p {
    margin: 0;
  }

  .form-group select,
  .form-group textarea {
    padding: 0.75rem;
    border: 1px solid #d4a574;
    border-radius: 4px;
    font-family: 'Source Sans 3', sans-serif;
    font-size: 0.95rem;
    transition: all 0.2s;
  }

  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #8b4513;
    box-shadow: 0 0 0 3px rgba(139, 69, 19, 0.1);
  }

  .form-group select:disabled,
  .form-group textarea:disabled {
    background-color: #f0ebe0;
    color: #999;
  }

  .form-group textarea {
    resize: vertical;
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding-top: 1rem;
    border-top: 1px solid #e0d5c7;
  }

  .btn-cancel,
  .btn-attach {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.95rem;
  }

  .btn-cancel {
    background-color: #e0d5c7;
    color: #2c2c2c;
  }

  .btn-cancel:hover:not(:disabled) {
    background-color: #d4a574;
  }

  .btn-attach {
    background-color: #8b4513;
    color: #f5f1e8;
  }

  .btn-attach:hover:not(:disabled) {
    background-color: #a0522d;
  }

  .btn-cancel:disabled,
  .btn-attach:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
