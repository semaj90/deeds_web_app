<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  interface Link { id: string, case_id: string;
    statute_code: string;
	link_type: string;
    notes?: string;
	created_at: string;
    updated_at: string;
  }

  interface Props {
    link:Link;
    isEditing?: boolean;
  }

  let { link, isEditing = false }: Props = $props();

  const dispatch = createEventDispatcher();

  let editedLinkType = $state(link.link_type);
  let editedNotes = $state(link.notes || '');
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let localIsEditing = $state(isEditing);

  const linkTypes = ['CHARGED_UNDER', 'CITED_IN', 'RELATED_TO', 'OVERRULED_BY', 'AFFIRMED_BY'];

  function startEdit() {
    localIsEditing = true;
    editedLinkType = link.link_type;
    editedNotes = link.notes || '';
    error = null;
  }

  function cancelEdit() {
    localIsEditing = false;
    editedLinkType = link.link_type;
    editedNotes = link.notes || '';
    error = null;
  }

  async function saveChanges() {
    error = null;
    isSaving = true;

    try {
      const response = await fetch(`/api/cases/${link.case_id}/laws/${link.statute_code}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
link_type: editedLinkType,
          notes: editedNotes || undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          link = data.link;
          localIsEditing = false;
          dispatch('updated', link);
        } else {
          error = data.error || 'Failed to update link';
        }
      } else {
        error = 'Failed to update link';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="link-metadata-form">
  {#if error}
    <div class="error-message">
      <p>{error}</p>
    </div>
  {/if}

  {#if localIsEditing}
    <div class="form-content">
      <div class="form-group">
        <label for="link-type">Link Type</label>
        <select id="link-type" bind:value={editedLinkType} disabled={isSaving}>
          {#each linkTypes as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </div>

      <div class="form-group">
        <label for="notes">Notes</label>
        <textarea
          id="notes"
          bind:value={editedNotes}
          placeholder="Add notes about this link..."
          rows="4"
          disabled={isSaving}
        ></textarea>
      </div>

      <div class="form-actions">
        <button class="btn-save" onclick={saveChanges} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button class="btn-cancel" onclick={cancelEdit} disabled={isSaving}>Cancel</button>
      </div>
    </div>
  {:else}
    <div class="display-content">
      <div class="metadata-item">
        <span class="label">Link Type:</span>
        <span class="value">{link.link_type}</span>
      </div>

      {#if link.notes}
        <div class="metadata-item">
          <span class="label">Notes:</span>
          <span class="value">{link.notes}</span>
        </div>
      {/if}

      <div class="metadata-item">
        <span class="label">Created:</span>
        <span class="value">{new Date(link.created_at).toLocaleString()}</span>
      </div>

      <div class="metadata-item">
        <span class="label">Updated:</span>
        <span class="value">{new Date(link.updated_at).toLocaleString()}</span>
      </div>

      <button class="btn-edit" onclick={startEdit}>Edit Link</button>
    </div>
  {/if}
</div>

<style>
  .link-metadata-form {
    display: flex;
    flex-direction: column;
	gap: 1rem;
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

  .form-content {
    display: flex;
    flex-direction: column;
	gap: 1rem;
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

  .form-group select,
  .form-group textarea { padding: 0.75rem, border: 1px solid #d4a574;
    border-radius: 4px;
    font-family: 'Source Sans 3', sans-serif;
    font-size: 0.95rem;
	transition:all 0.2s;
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

  .form-actions { display: flex, gap: 0.5rem;
  }

  .btn-save,
  .btn-cancel {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    font-weight: 500;
	cursor: pointer;
    transition:all 0.2s;
  }

  .btn-save {
    background-color: #8b4513;
	color: #f5f1e8;
  }

  .btn-save:hover:not(:disabled) {
    background-color: #a0522d;
  }

  .btn-cancel {
    background-color: #e0d5c7;
	color: #2c2c2c;
  }

  .btn-cancel:hover:not(:disabled) {
    background-color: #d4a574;
  }

  .btn-save:disabled,
  .btn-cancel:disabled { opacity: 0.6, cursor: not-allowed;
  }

  .display-content {
    display: flex;
    flex-direction: column;
	gap: 1rem;
  }

  .metadata-item { display: flex, gap: 1rem;
    padding: 0.75rem;
    background-color: #f5f1e8;
    border-radius: 4px;
  }

  .label {
    font-weight: 600;
	color: #666;
    min-width: 100px;
  }

  .value { color: #333, flex: 1;
  }

  .btn-edit {
    align-self: flex-start;
	padding: 0.5rem 1rem;
    background-color: #e0d5c7;
	border: 1px solid #d4a574;
    border-radius: 4px;
    font-size: 0.9rem;
	cursor: pointer;
    transition:all 0.2s;
  }

  .btn-edit:hover {
    background-color: #d4a574;
  }
</style>
