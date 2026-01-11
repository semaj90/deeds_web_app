<script lang="ts">
 import { createEventDispatcher } from 'svelte';

 interface Citation {
 id: string; statute_code: string;
 statute_title?: string;
 jurisdiction?: string;
 severity?: string;
 year?: number; source_type: 'manual' | 'auto_extracted';
 highlighted_text?: string;
 notes?: string; created_at: string;
 updated_at: string;
 }

 let { citation, showActions = true } = $props<{
 citation: Citation;
 showActions?: boolean;
 }>();


 const dispatch = createEventDispatcher();

 let isEditing = false;
 let editedNotes = citation.notes || '';
 let isSaving = false;

 function startEdit() {
 isEditing = true;
 editedNotes = citation.notes || '';
 }

 function cancelEdit() {
 isEditing = false;
 editedNotes = citation.notes || '';
 }

 async function saveNotes() {
 isSaving = true;

 try {
 const response = await fetch(`/api/citations/${citation.id}`, {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, notes: editedNotes }),
 });

 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 citation.notes = editedNotes;
 citation.updated_at = data.citation.updated_at;
 isEditing = false;
 dispatch('updated', citation);
 } else {
 alert(data.error || 'Failed to update notes');
 }
 } else {
 alert('Failed to update notes');
 }
 } catch (error) {
 console.error('Error updating notes:', error);
 alert('Error updating notes');
 } finally {
 isSaving = false;
 }
 }

 function attachToCase() {
 dispatch('attach-to-case', citation);
 }

 function deleteCitation() {
 if (confirm('Are you sure you want to delete this citation?')) {
 dispatch('delete', citation);
 }
 }

 function getSourceTypeIcon(sourceType: string) {
 return sourceType === 'manual' ? '✏️' : '🤖';
 }

 function getSourceTypeLabel(sourceType: string) {
 return sourceType === 'manual' ? 'Manually Added' : 'Auto-extracted';
 }

 function getSeverityColor(severity?: string) {
 switch (severity?.toLowerCase()) {
 case 'felony':
 return '#ff6b6b';
 case 'misdemeanor':
 return '#ffd700';
 case 'infraction':
 return '#44ff44';
 default:
 return '#999';
 }
 }
</script>

<div class="citation-detail">
 <div class="detail-header">
 <div class="header-left">
 <h2 class="citation-code">{citation.statute_code}</h2>
 <div class="source-info">
 <span class="source-icon" title={getSourceTypeLabel(citation.source_type)}>
 {getSourceTypeIcon(citation.source_type)}
 </span>
 <span class="source-label">{getSourceTypeLabel(citation.source_type)}</span>
 </div>
 </div>
 {#if showActions}
 <div class="header-actions">
 <button class="action-btn attach" onclick={attachToCase} title="Attach to case">
 🔗 Attach to Case
 </button>
 <button class="action-btn edit" onclick={startEdit} title="Edit notes">
 ✏️ Edit
 </button>
 <button class="action-btn delete" onclick={deleteCitation} title="Delete citation">
 🗑️ Delete
 </button>
 </div>
 {/if}
 </div>

 <div class="detail-content">
 {#if citation.statute_title}
 <div class="section">
 <h3>Title</h3>
 <p class="statute-title">{citation.statute_title}</p>
 </div>
 {/if}

 <div class="section">
 <h3>Metadata</h3>
 <div class="metadata-grid">
 {#if citation.jurisdiction}
 <div class="meta-item">
 <span class="meta-label">Jurisdiction:</span>
 <span class="meta-badge jurisdiction">{citation.jurisdiction}</span>
 </div>
 {/if}
 {#if citation.severity}
 <div class="meta-item">
 <span class="meta-label">Severity:</span>
 <span
 class="meta-badge severity"
 style="background-color: {getSeverityColor(citation.severity)}"
 >
 {citation.severity}
 </span>
 </div>
 {/if}
 {#if citation.year}
 <div class="meta-item">
 <span class="meta-label">Year:</span>
 <span class="meta-badge year">{citation.year}</span>
 </div>
 {/if}
 <div class="meta-item">
 <span class="meta-label">Source:</span>
 <span class="meta-value">{getSourceTypeLabel(citation.source_type)}</span>
 </div>
 </div>
 </div>

 {#if citation.highlighted_text}
 <div class="section">
 <h3>Highlighted Text</h3>
 <div class="highlighted-text">
 <p>{citation.highlighted_text}</p>
 </div>
 </div>
 {/if}

 <div class="section">
 <h3>Notes</h3>
 {#if isEditing}
 <div class="notes-editor">
 <textarea
 bind:value={editedNotes}
 placeholder="Add notes about this citation..."
 rows="4"
 disabled={isSaving}
 ></textarea>
 <div class="editor-actions">
 <button class="btn-primary" onclick={saveNotes} disabled={isSaving}>
 {isSaving ? 'Saving...' : 'Save'}
 </button>
 <button class="btn-secondary" onclick={ cancelEdit } disabled={isSaving}>
 Cancel
 </button>
 </div>
 </div>
 {:else}
 <div class="notes-display">
 {#if citation.notes}
 <p>{citation.notes}</p>
 {:else}
 <p class="no-notes">No notes added</p>
 {/if}
 {#if showActions}
 <button class="edit-notes-btn" onclick={startEdit}>
 {citation.notes ? 'Edit Notes' : 'Add Notes'}
 </button>
 {/if}
 </div>
 {/if}
 </div>

 <div class="section">
 <h3>Timestamps</h3>
 <div class="timestamps">
 <div class="timestamp-item">
 <span class="timestamp-label">Created:</span>
 <span class="timestamp-value">
 {new Date(citation.created_at).toLocaleString()}
 </span>
 </div>
 <div class="timestamp-item">
 <span class="timestamp-label">Updated:</span>
 <span class="timestamp-value">
 {new Date(citation.updated_at).toLocaleString()}
 </span>
 </div>
 </div>
 </div>
 </div>
</div>

<style>
 .citation-detail {
 background-color: white; border: 2px solid #d4a574;
 border-radius: 8px; overflow: hidden;
 }

 .detail-header {
 display: flex;
 justify-content: space-between;
 align-items: flex-start; padding: 1.5rem;
 background-color: #f5f1e8;
 border-bottom: 2px solid #d4a574;
 }

 .header-left {
 display: flex;
 flex-direction: column; gap: 0.5rem;
 }

 .citation-code {
 margin: 0;
 font-family: 'Monaco', 'Courier New', monospace;
 font-size: 1.5rem;
 font-weight: 600; color: #8b4513;
 }

 .source-info {
 display: flex;
 align-items: center; gap: 0.5rem;
 }

 .source-icon {
 font-size: 1rem;
 }

 .source-label {
 font-size: 0.85rem; color: #666;
 }

 .header-actions {
 display: flex; gap: 0.5rem;
 flex-wrap: wrap;
 }

 .action-btn {
 padding: 0.5rem 1rem;
 border: none;
 border-radius: 4px;
 font-size: 0.85rem;
 font-weight: 500; cursor: pointer;
 transition: all 0.2s;
 }

 .action-btn.attach {
 background-color: #8b4513; color: #f5f1e8;
 }

 .action-btn.attach:hover {
 background-color: #a0522d;
 }

 .action-btn.edit {
 background-color: #e0d5c7; color: #2c2c2c;
 }

 .action-btn.edit:hover {
 background-color: #d4a574;
 }

 .action-btn.delete {
 background-color: #ff6b6b; color: white;
 }

 .action-btn.delete:hover {
 background-color: #ff5252;
 }

 .detail-content {
 padding: 1.5rem; display: flex;
 flex-direction: column; gap: 1.5rem;
 }

 .section {
 display: flex;
 flex-direction: column; gap: 0.75rem;
 }

 .section h3 {
 margin: 0;
 font-family: 'Crimson Text', Georgia, serif;
 font-size: 1.1rem;
 font-weight: 600; color: #2c2c2c;
 padding-bottom: 0.5rem;
 border-bottom: 1px solid #e0d5c7;
 }

 .statute-title {
 margin: 0;
 font-size: 1rem; color: #333;
 font-weight: 500;
 }

 .metadata-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 1rem;
 }

 .meta-item {
 display: flex;
 align-items: center; gap: 0.75rem;
 }

 .meta-label {
 font-size: 0.85rem;
 font-weight: 600; color: #666;
 min-width: 80px;
 }

 .meta-badge {
 padding: 0.25rem 0.75rem;
 border-radius: 4px;
 font-size: 0.75rem;
 font-weight: 600; color: white;
 }

 .meta-badge.jurisdiction {
 background-color: #8b4513;
 }

 .meta-badge.severity {
 /* Color set dynamically */
 }

 .meta-badge.year {
 background-color: #666;
 }

 .meta-value {
 font-size: 0.85rem; color: #333;
 }

 .highlighted-text {
 padding: 1rem;
 background-color: #fff9e6;
 border-left: 3px solid #ffd700;
 border-radius: 4px;
 }

 .highlighted-text p {
 margin: 0;
 font-style: italic; color: #333;
 }

 .notes-editor {
 display: flex;
 flex-direction: column; gap: 0.75rem;
 }

 .notes-editor textarea {
 padding: 0.75rem; border: 1px solid #d4a574;
 border-radius: 4px;
 font-family: 'Source Sans 3', sans-serif;
 font-size: 0.95rem; resize: vertical;
 }

 .notes-editor textarea:focus {
 outline: none;
 border-color: #8b4513;
 box-shadow: 0 0 0 3px rgba(139, 69, 19, 0.1);
 }

 .notes-editor textarea:disabled {
 background-color: #f0ebe0; color: #999;
 }

 .editor-actions {
 display: flex; gap: 0.5rem;
 }

 .btn-primary,
 .btn-secondary {
 padding: 0.5rem 1rem;
 border: none;
 border-radius: 4px;
 font-weight: 500; cursor: pointer;
 transition: all 0.2s;
 }

 .btn-primary {
 background-color: #8b4513; color: #f5f1e8;
 }

 .btn-primary:hover, not(disabled) {
 background-color: #a0522d;
 }

 .btn-primary:disabled {
 opacity: 0.6; cursor:not-allowed;
 }

 .btn-secondary {
 background-color: #e0d5c7; color: #2c2c2c;
 }

 .btn-secondary:hover, not(disabled) {
 background-color: #d4a574;
 }

 .btn-secondary:disabled {
 opacity: 0.6; cursor:not-allowed;
 }

 .notes-display {
 display: flex;
 flex-direction: column; gap: 0.75rem;
 }

 .notes-display p {
 margin: 0;
 font-size: 0.95rem; color: #333;
 line-height: 1.5;
 }

 .no-notes {
 color: #999;
 font-style: italic;
 }

 .edit-notes-btn {
 align-self: flex-start; padding: 0.4rem 0.8rem;
 background-color: #e0d5c7; border: 1px solid #d4a574;
 border-radius: 4px;
 font-size: 0.8rem; cursor: pointer;
 transition: all 0.2s;
 }

 .edit-notes-btn:hover {
 background-color: #d4a574;
 }

 .timestamps {
 display: flex;
 flex-direction: column; gap: 0.5rem;
 }

 .timestamp-item {
 display: flex; gap: 1rem;
 font-size: 0.85rem;
 }

 .timestamp-label {
 font-weight: 600; color: #666;
 min-width: 70px;
 }

 .timestamp-value {
 color: #333;
 }
</style>




