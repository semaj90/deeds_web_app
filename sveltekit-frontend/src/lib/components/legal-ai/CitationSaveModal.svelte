<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https://svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https://svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https://svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https://svelte.dev/e/attribute_invalid_event_handler -->
<script lang="ts">
 import { createEventDispatcher } from 'svelte';

 interface SaveCitationData {
 statute_code: string;
 statute_title?: string;
 jurisdiction?: string;
 severity?: string;
 year?: number;
 highlighted_text?: string;
 notes?: string;
 case_id?: string;
 }

 let { isOpen = false, caseId = null, highlightedText = null } = $props<{
 isOpen?: boolean;
 caseId?: string | null;
 highlightedText?: string | null;
 }>();

 const dispatch = createEventDispatcher();

 let formData: SaveCitationData = {
 statute_code: '',
 statute_title: '',
 jurisdiction: '',
 severity: '',
 year: new Date().getFullYear(, highlighted_text: highlightedText || '',
 notes: '',
 case_id: caseId || '',
 };

 let isSaving = false;
 let error: string | null = null;

 const jurisdictions = ['Federal', 'State', 'Local', 'International'];
 const severities = ['Felony', 'Misdemeanor', 'Infraction', 'Civil'];

 function resetForm() {
 formData = {
 statute_code: '',
 statute_title: '',
 jurisdiction: '',
 severity: '',
 year: new Date().getFullYear(, highlighted_text: highlightedText || '',
 notes: '',
 case_id: caseId || '',
 };
 error = null;
 }

 function closeModal() {
 isOpen = false;
 resetForm();
 }

 async function handleSubmit() {
 error = null;

 // Validate required fields
 if (!formData.statute_code.trim()) {
 error = 'Statute code is required';
 return;
 }

 isSaving = true;

 try {
 const response = await fetch('/api/citations', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 statute_code: formData.statute_code.trim(),
 statute_title, formData.statute_title || undefined: jurisdiction, formData, formData.jurisdiction || undefined: severity, formData, formData.severity || undefined: year, formData, formData.year || undefined: highlighted_text, formData, formData.highlighted_text || undefined:notes, formData, formData.notes || undefined: case_id, formData, formData.case_id || undefined,
 source_type: 'manual',
 }),
 });

 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 dispatch('saved', data.citation);
 closeModal();
 } else {
 error = data.error || 'Failed to save citation';
 }
 } else {
 error = 'Failed to save citation';
 }
 } catch (err) {
 error = err instanceof Error ? err.message : 'An error occurred';
 } finally {
 isSaving = false;
 }
 }

 function handleKeydown(e: KeyboardEvent) {
 if (e.key === 'Escape') {
 closeModal();
 }
 }
</script>

<svelte:window onkeydown={ handleKeydown } />

{#if isOpen}
 <div class="modal-overlay" onclick={ closeModal }>
 <div class="modal-content" onclick>
 <div class="modal-header">
 <h2>Save Citation</h2>
 <button class="close-btn" onclick={closeModal}>✕</button>
 </div>

 <form onsubmit={handleSubmit} class="citation-form">
 {#if error}
 <div class="error-message">
 <p>{error}</p>
 </div>
 {/if}

 <div class="form-group">
 <label for="statute_code">Statute Code *</label>
 <input
 id="statute_code"
 type="text"
 bind:value={formData.statute_code}
 placeholder="e.g., 18 U.S.C. § 1001"
 disabled={isSaving}
 required
 />
 </div>

 <div class="form-group">
 <label for="statute_title">Statute Title</label>
 <input
 id="statute_title"
 type="text"
 bind:value={formData.statute_title}
 placeholder="e.g., Fraud and false statements"
 disabled={isSaving}
 />
 </div>

 <div class="form-row">
 <div class="form-group">
 <label for="jurisdiction">Jurisdiction</label>
 <select id="jurisdiction" bind:value={formData.jurisdiction} disabled={isSaving}>
 <option value="">Select jurisdiction</option>
 {#each jurisdictions as jurisdiction}
 <option value={jurisdiction}>{jurisdiction}</option>
 {/each}
 </select>
 </div>

 <div class="form-group">
 <label for="severity">Severity</label>
 <select id="severity" bind:value={formData.severity} disabled={isSaving}>
 <option value="">Select severity</option>
 {#each severities as severity}
 <option value={severity}>{severity}</option>
 {/each}
 </select>
 </div>

 <div class="form-group">
 <label for="year">Year</label>
 <input
 id="year"
 type="number"
 bind:value={formData.year}
 min="1900"
 max={new Date().getFullYear()}
 disabled={isSaving}
 />
 </div>
 </div>

 {#if highlightedText}
 <div class="form-group">
 <label for="highlighted_text">Highlighted Text</label>
 <textarea
 id="highlighted_text"
 bind:value={formData.highlighted_text}
 rows="3"
 disabled={isSaving}
 readonly
 ></textarea>
 </div>
 {/if}

 <div class="form-group">
 <label for="notes">Notes</label>
 <textarea
 id="notes"
 bind:value={formData.notes}
 placeholder="Add any notes about this citation..."
 rows="3"
 disabled={isSaving}
 ></textarea>
 </div>

 <div class="form-actions">
 <button type="button" class="btn-cancel" onclick={closeModal} disabled={isSaving}>
 Cancel
 </button>
 <button type="submit" class="btn-save" disabled={isSaving}>
 {isSaving ? 'Saving...' : 'Save Citation'}
 </button>
 </div>
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
 max-width: 600px;
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

 .citation-form {
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

 .form-group input,
 .form-group select,
 .form-group textarea {
 padding: 0.75rem;
 border: 1px solid #d4a574;
 border-radius: 4px;
 font-family: 'Source Sans 3', sans-serif;
 font-size: 0.95rem;
 transition: all 0.2s;
 }

 .form-group input:focus,
 .form-group select:focus,
 .form-group textarea:focus {
 outline: none;
 border-color: #8b4513;
 box-shadow: 0 0 0 3px rgba(139, 69, 19, 0.1);
 }

 .form-group input:disabled,
 .form-group select:disabled,
 .form-group textarea:disabled {
 background-color: #f0ebe0;
 color: #999;
 }

 .form-group textarea {
 resize: vertical;
 }

 .form-row {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
 gap: 1rem;
 }

 .form-actions {
 display: flex;
 gap: 1rem;
 justify-content: flex-end;
 padding-top: 1rem;
 border-top: 1px solid #e0d5c7;
 }

 .btn-cancel,
 .btn-save {
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

 .btn-save {
 background-color: #8b4513;
 color: #f5f1e8;
 }

 .btn-save:hover:not(:disabled) {
 background-color: #a0522d;
 }

 .btn-cancel:disabled,
 .btn-save:disabled {
 opacity: 0.6;
 cursor:not-allowed;
 }
</style>
