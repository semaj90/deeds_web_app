<script lang="ts">
 import { onMount } from 'svelte';

 interface Citation {
 id: string;
 statute_code: string;
 statute_title?: string;
 jurisdiction?: string;
 severity?: string;
 source_type: 'manual' | 'auto_extracted';
 notes?: string;
 created_at: string;
 }

 let { caseId = null, limit = 20 } = $props<{
 caseId?: string | null;
 limit?: number;
 }>();


 let citations: Citation[] = $state([]);
 let isLoading = $state(true);
 let error: string | null = $state(null);
 let selectedCitation: Citation | null = $state(null);

 onMount(() => {
 (async () => {
 await loadCitations();
 })();
 });

 async function loadCitations() {
 isLoading = true;
 error = null;

 try {
 const params = new URLSearchParams({
 limit: limit.toString(),
 });

 if (caseId) {
 params.append('case_id', caseId);
 }

 const response = await fetch(`/api/citations?${params}`);

 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 citations = data.citations;
 } else {
 error = data.error || 'Failed to load citations';
 }
 } else {
 error = 'Failed to load citations';
 }
 } catch (err) {
 error = err instanceof Error ? err.message : 'An error occurred';
 } finally {
 isLoading = false;
 }
 }

 async function deleteCitation(id: string) {
 if (!confirm('Are you sure you want to delete this citation?')) return;

 try {
 const response = await fetch(`/api/citations/${ id }`, {
 method: 'DELETE',
 });

 if (response.ok) {
 citations = citations.filter((c) => c.id !== id);
 selectedCitation = null;
 } else {
 alert('Failed to delete citation');
 }
 } catch (err) {
 alert('Error deleting citation');
 }
 }

 function getSourceBadgeColor(sourceType: string): string {
 return sourceType === 'auto_extracted' ? '#dcfce7' : '#e0d5c7';
 }

 function getSourceBadgeTextColor(sourceType: string): string {
 return sourceType === 'auto_extracted' ? '#166534' : '#2c2c2c';
 }
</script>

<div class="citation-list-container">
 <div class="list-header">
 <h3>Saved Citations</h3>
 <button class="refresh-btn" onclick={ loadCitations } disabled={isLoading}>
 🔄
 </button>
 </div>

 {#if isLoading}
 <div class="loading">
 <div class="spinner"></div>
 <p>Loading citations...</p>
 </div>
 {:else if error}
 <div class="error">
 <p>{error}</p>
 <button onclick={ loadCitations }>Retry</button>
 </div>
 {:else if citations.length === 0}
 <div class="empty-state">
 <p>No citations saved yet</p>
 </div>
 {:else}
 <div class="citations-grid">
 {#each citations as citation (citation.id)}
 <div
 class="citation-card"
 class:selected={selectedCitation?.id === citation.id}
 onclick={() => (selectedCitation = citation)}
 >
 <div class="card-header">
 <span class="statute-code">{citation.statute_code}</span>
 <span
 class="source-badge"
 style="background-color: {getSourceBadgeColor(citation.source_type)}; color: {getSourceBadgeTextColor(citation.source_type)}"
 >
 {citation.source_type === 'auto_extracted' ? 'Auto' : 'Manual'}
 </span>
 </div>

 {#if citation.statute_title}
 <p class="statute-title">{citation.statute_title}</p>
 {/if}

 <div class="card-meta">
 {#if citation.jurisdiction}
 <span class="meta-item">{citation.jurisdiction}</span>
 {/if}
 {#if citation.severity}
 <span class="meta-item">{citation.severity}</span>
 {/if}
 </div>

 {#if citation.notes}
 <p class="notes">{citation.notes}</p>
 {/if}

 <div class="card-footer">
 <span class="date">
 {new Date(citation.created_at).toLocaleDateString()}
 </span>
 <button
 class="delete-btn"
 onclick={() => deleteCitation(citation.id)}
 >
 🗑️
 </button>
 </div>
 </div>
 {/each}
 </div>
 {/if}

 {#if selectedCitation}
 <div class="detail-panel">
 <div class="detail-header">
 <h4>Citation Details</h4>
 <button class="close-btn" onclick={() => (selectedCitation = null)}>✕</button>
 </div>

 <div class="detail-content">
 <div class="detail-item">
 <span class="label">Code:</span>
 <span class="value">{selectedCitation.statute_code}</span>
 </div>

 {#if selectedCitation.statute_title}
 <div class="detail-item">
 <span class="label">Title:</span>
 <span class="value">{selectedCitation.statute_title}</span>
 </div>
 {/if}

 {#if selectedCitation.jurisdiction}
 <div class="detail-item">
 <span class="label">Jurisdiction:</span>
 <span class="value">{selectedCitation.jurisdiction}</span>
 </div>
 {/if}

 {#if selectedCitation.severity}
 <div class="detail-item">
 <span class="label">Severity:</span>
 <span class="value">{selectedCitation.severity}</span>
 </div>
 {/if}

 {#if selectedCitation.notes}
 <div class="detail-item">
 <span class="label">Notes:</span>
 <p class="value">{selectedCitation.notes}</p>
 </div>
 {/if}

 <div class="detail-item">
 <span class="label">Source:</span>
 <span class="value">{selectedCitation.source_type === 'auto_extracted' ? 'Auto-extracted' : 'Manually saved'}</span>
 </div>
 </div>
 </div>
 {/if}
</div>

<style>
 .citation-list-container {
 display: flex;
 flex-direction: column;
 gap: 1rem;
 }

 .list-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding-bottom: 0.75rem;
 border-bottom: 2px solid #d4a574;
 }

 .list-header h3 {
 margin: 0;
 font-family: 'Crimson Text', Georgia, serif;
 font-size: 1.3rem;
 color: #2c2c2c;
 }

 .refresh-btn {
 background: none;
 border: none;
 font-size: 1.2rem;
 cursor: pointer;
 transition: transform 0.2s;
 }

 .refresh-btn:hover:not(:disabled) {
 transform: rotate(180deg);
 }

 .refresh-btn:disabled {
 opacity: 0.5;
 cursor: not-allowed;
 }

 .loading,
 .error,
 .empty-state {
 padding: 2rem;
 text-align: center;
 color: #666;
 }

 .spinner {
 width: 30px;
 height: 30px;
 border: 3px solid #e0e0e0;
 border-top-color: #8b4513;
 border-radius: 50%;
 animation: spin 1s linear infinite;
 margin: 0 auto 1rem;
 }

 @keyframes spin {
 to {
 transform: rotate(360deg);
 }
 }

 .error button {
 margin-top: 1rem;
 padding: 0.5rem 1rem;
 background-color: #8b4513;
 color: white;
 border: none;
 border-radius: 4px;
 cursor: pointer;
 }

 .citations-grid {
 display: grid;
 grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
 gap: 1rem;
 }

 .citation-card {
 padding: 1rem;
 background-color: white;
 border: 2px solid #e0d5c7;
 border-radius: 6px;
 cursor: pointer;
 transition: all 0.2s;
 }

 .citation-card:hover {
 border-color: #d4a574;
 box-shadow: 0 2px 8px rgba(139, 69, 19, 0.1);
 }

 .citation-card.selected {
 border-color: #8b4513;
 background-color: #f5f1e8;
 }

 .card-header {
 display: flex;
 justify-content: space-between;
 align-items: flex-start;
 margin-bottom: 0.75rem;
 gap: 0.5rem;
 }

 .statute-code {
 font-family: 'Monaco', 'Courier New', monospace;
 font-size: 0.9rem;
 font-weight: 600;
 color: #8b4513;
 }

 .source-badge {
 padding: 0.25rem 0.5rem;
 border-radius: 3px;
 font-size: 0.75rem;
 font-weight: 600;
 white-space: nowrap;
 }

 .statute-title {
 margin: 0 0 0.5rem 0;
 font-size: 0.95rem;
 font-weight: 500;
 color: #2c2c2c;
 }

 .card-meta {
 display: flex;
 flex-wrap: wrap;
 gap: 0.5rem;
 margin-bottom: 0.75rem;
 }

 .meta-item {
 padding: 0.25rem 0.5rem;
 background-color: #f0ebe0;
 border-radius: 3px;
 font-size: 0.8rem;
 color: #666;
 }

 .notes {
 margin: 0.75rem 0;
 font-size: 0.85rem;
 color: #666;
 line-height: 1.4;
 }

 .card-footer {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding-top: 0.75rem;
 border-top: 1px solid #e0d5c7;
 font-size: 0.8rem;
 }

 .date {
 color: #999;
 }

 .delete-btn {
 background: none;
 border: none;
 font-size: 1rem;
 cursor: pointer;
 opacity: 0.6;
 transition: opacity 0.2s;
 }

 .delete-btn:hover {
 opacity: 1;
 }

 .detail-panel {
 padding: 1rem;
 background-color: #f0ebe0;
 border: 1px solid #d4a574;
 border-radius: 6px;
 }

 .detail-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 1rem;
 padding-bottom: 0.75rem;
 border-bottom: 1px solid #d4a574;
 }

 .detail-header h4 {
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
 }

 .detail-content {
 display: flex;
 flex-direction: column;
 gap: 0.75rem;
 }

 .detail-item {
 display: flex;
 gap: 0.75rem;
 }

 .label {
 font-weight: 600;
 color: #2c2c2c;
 min-width: 100px;
 }

 .value {
 color: #333;
 word-break: break-word;
 }
</style>
