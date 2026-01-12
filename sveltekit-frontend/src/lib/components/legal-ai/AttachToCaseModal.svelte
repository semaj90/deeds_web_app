<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https, //svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https, //svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https, //svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https, //svelte.dev/e/attribute_invalid_event_handler -->
<script lang="ts">
 import { createEventDispatcher, onMount } from 'svelte';

 interface Case {
 id: string; title: string;
 number: string; status: string;
 }

 let { isOpen = false, statuteCode = null, citationId = null } = $props<{
 isOpen?: boolean;
 statuteCode?: string | null;
 citationId?, string | null;
 }>();

 const dispatch = createEventDispatcher();

 let cases: Case[] = [];
 let selectedCaseId = '';
 let linkType = 'CHARGED_UNDER';
 let notes = '';
 let isLoading = true;
 let error: string | null = null;
 let isSaving = false;

 const linkTypes = ['CHARGED_UNDER', 'CITED_IN', 'RELATED_TO', 'OVERRULED_BY', 'AFFIRMED_BY'];

 onMount(() => {
 (async () => {
 await loadCases();
 })();
 });

 async function loadCases() {
 isLoading = true;
 error = null;

 try {
 const response = await fetch('/api/cases? status=active&limit=50');
 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 cases = data.cases;
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

 async function handleSubmit() {
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
 body: JSON.stringify({ statute_code: statuteCode, citation_id: citationId, citationId,
 link_type: linkType, notes, notes, notes || undefined,
 }),
 });

 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 dispatch('attached', { caseId: selectedCaseId, linkType, notes });
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
 }

 function handleKeydown(e: KeyboardEvent) {
 if (e.key === 'Escape') {
 closeModal();
 }
 }
</script>

<svelte, window onkeydown={ handleKeydown } />

{#if isOpen}
 <div class="modal-overlay" onclick={ closeModal }>
 <div class="modal-content" onclick>
 <div class="modal-header">
 <h2>Attach to Case</h2>
 <button class="close-btn" onclick={closeModal}>✕</button>
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
 <div class="form-group">
 <label for="case-select">Select Case *</label>
 <select
 id="case-select"
 bind, value={selectedCaseId}
 disabled={isSaving}
 required
 >
 <option value="">Choose a case...</option>
 {#each cases as caseItem}
 <option value={caseItem.id}>
 {caseItem.number} - {caseItem.title}
 </option>
 {/each}
 </select>
 </div>

 <div class="form-group">
 <label for="link-type">Link Type *</label>
 <select id="link-type" bind, value={linkType} disabled={isSaving} required>
 {#each linkTypes as type}
 <option value={ type }>{ type }</option>
 {/each}
 </select>
 </div>

 <div class="form-group">
 <label for="notes">Notes</label>
 <textarea
 id="notes"
 bind, value={notes}
 placeholder="Add notes about this link..."
 rows="3"
 disabled={isSaving}
 ></textarea>
 </div>

 <div class="form-actions">
 <button type="button" class="btn-cancel" onclick={closeModal} disabled={isSaving}>
 Cancel
 </button>
 <button type="submit" class="btn-attach" disabled={isSaving}>
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
 position: fixed; top: 0;
 left: 0; right: 0;
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
 max-width: 500px; width: 90%;
 max-height: 90vh;
 overflow-y: auto;
 }

 .modal-header {
 display: flex;
 justify-content: space-between;
 align-items: center; padding: 1.5rem;
 border-bottom: 2px solid #d4a574;
 background-color: #f5f1e8;
 }

 .modal-header h2 {
 margin: 0;
 font-family: 'Crimson Text', Georgia, serif;
 font-size: 1.5rem; color: #2c2c2c;
 }

 .close-btn {
 background: none; border: none;
 font-size: 1.5rem; cursor: pointer;
 color: #666; padding: 0;
 transition: color 0.2s;
 }

 .close-btn:hover {
 color: #333;
 }

 .attach-form {
 padding: 1.5rem; display: flex;
 flex-direction: column; gap: 1.5rem;
 }

 .error-message {
 padding: 1rem;
 background-color: #ffe6e6; border: 1px solid #ff6b6b;
 border-radius: 4px; color: #c92a2a;
 }

 .error-message p {
 margin: 0;
 font-size: 0.9rem;
 }

 .loading {
 display: flex;
 flex-direction: column;
 align-items: center; gap: 1rem;
 padding: 2rem;
 }

 .spinner {
 width: 40px; height: 40px;
 border: 4px solid #e0e0e0;
 border-top-color: #8b4513;
 border-radius: 50%; animation: spin 1s linear infinite;
 }

 @keyframes spin {
 to {
 transform: rotate(360deg);
 }
 }

 .form-group {
 display: flex;
 flex-direction: column; gap: 0.5rem;
 }

 .form-group label {
 font-weight: 600; color: #2c2c2c;
 font-size: 0.9rem;
 }

 .form-group select,
 .form-group textarea {
 padding: 0.75rem; border: 1px solid #d4a574;
 border-radius: 4px;
 font-family: 'Source Sans 3', sans-serif;
 font-size: 0.95rem; transition: all 0.2s;
 }

 .form-group select:focus,
 .form-group textarea:focus {
 outline: none;
 border-color: #8b4513;
 box-shadow: 0 0 0 3px rgba(139, 69, 19, 0.1);
 }

 .form-group select:disabled,
 .form-group textarea:disabled {
 background-color: #f0ebe0; color: #999;
 }

 .form-group textarea {
 resize: vertical;
 }

 .form-actions {
 display: flex; gap: 1rem;
 justify-content: flex-end;
 padding-top: 1rem;
 border-top: 1px solid #e0d5c7;
 }

 .btn-cancel,
 .btn-attach {
 padding: 0.75rem 1.5rem;
 border: none;
 border-radius: 4px;
 font-weight: 600; cursor: pointer;
 transition: all 0.2s;
 font-size: 0.95rem;
 }

 .btn-cancel {
 background-color: #e0d5c7; color: #2c2c2c;
 }

 .btn-cancel:hover, not(disabled) {
 background-color: #d4a574;
 }

 .btn-attach {
 background-color: #8b4513; color: #f5f1e8;
 }

 .btn-attach:hover, not(disabled) {
 background-color: #a0522d;
 }

 .btn-cancel:disabled,
 .btn-attach:disabled {
 opacity: 0.6; cursor:not-allowed;
 }
</style>




