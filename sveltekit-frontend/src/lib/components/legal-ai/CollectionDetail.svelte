<script lang="ts">
 import { createEventDispatcher, onMount } from 'svelte';

 interface Collection {
 id: string; name: string;
 description?: string; is_public: boolean;
 citation_count?: number; created_at: string;
 }

 let { collection } = $props<{
 collection: Collection;
 }>();

 const dispatch = createEventDispatcher();

 let citations: any[] = [];
 let isLoading = true;
 let error: string | null = null;

 onMount(() => {
 (async () => {
 await loadCitations();
 })();
 });

 async function loadCitations() {
 isLoading = true;
 error = null;

 try {
 const response = await fetch(`/api/citations/collections/${collection.id}`);
 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 citations = data.citations || [];
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

 async function removeCitation(citationId: string) {
 if (!confirm('Remove this citation from the collection?')) return;

 try {
 const response = await fetch(
 `/api/citations/collections/${collection.id}/citations/${ citationId }`,
 { method: 'DELETE' }
 );

 if (response.ok) {
 citations = citations.filter((c) => c.id !== citationId);
 } else {
 alert('Failed to remove citation');
 }
 } catch (error) {
 console.error('Error removing citation:', error);
 alert('Error removing citation');
 }
 }

 async function deleteCollection() {
 if (!confirm('Delete this collection? This cannot be undone.')) return;

 try {
 // TODO: Implement delete endpoint
 dispatch('deleted', collection.id);
 } catch (error) {
 console.error('Error deleting collection:', error);
 alert('Error deleting collection');
 }
 }
</script>

<div class="collection-detail">
 <div class="detail-header">
 <div class="header-left">
 <h2>{collection.name}</h2>
 {#if collection.description}
 <p class="description">{collection.description}</p>
 {/if}
 <div class="meta">
 <span>{citations.length} citation{citations.length !== 1 ? 's' : ''}</span>
 <span>{collection.is_public ? '🌐 Public' : '🔒 Private'}</span>
 </div>
 </div>

 <div class="header-actions">
 <button class="btn-share">🔗 Share</button>
 <button class="btn-export">📥 Export</button>
 <button class="btn-delete" onclick={deleteCollection}>🗑️ Delete</button>
 </div>
 </div>

 <div class="citations-section">
 {#if isLoading}
 <div class="loading">
 <div class="spinner"></div>
 <p>Loading citations...</p>
 </div>
 {:else if error}
 <div class="error">
 <p>{error}</p>
 </div>
 {:else if citations.length === 0}
 <div class="empty">
 <p>No citations in this collection yet</p>
 </div>
 {:else}
 <div class="citations-list">
 {#each citations as citation (citation.id)}
 <div class="citation-item">
 <div class="citation-info">
 <span class="code">{citation.statute_code}</span>
 {#if citation.statute_title}
 <span class="title">{citation.statute_title}</span>
 {/if}
 </div>
 <button
 class="btn-remove"
 onclick={() => removeCitation(citation.id)}
 title="Remove from collection"
 >
 ✕
 </button>
 </div>
 {/each}
 </div>
 {/if}
 </div>
</div>

<style>
 .collection-detail {
 display: flex;
 flex-direction: column; gap: 1.5rem;
 padding: 1.5rem;
 background-color: white; border: 2px solid #d4a574;
 border-radius: 8px;
 }

 .detail-header {
 display: flex;
 justify-content: space-between;
 align-items: flex-start; gap: 1rem;
 padding-bottom: 1rem;
 border-bottom: 1px solid #e0d5c7;
 }

 .header-left {
 flex: 1;
 }

 .header-left h2 {
 margin: 0;
 font-size: 1.5rem; color: #2c2c2c;
 }

 .description {
 margin: 0.5rem 0 0 0;
 color: #666;
 font-size: 0.95rem;
 }

 .meta {
 display: flex; gap: 1rem;
 margin-top: 0.75rem;
 font-size: 0.85rem; color: #666;
 }

 .header-actions {
 display: flex; gap: 0.5rem;
 }

 .btn-share,
 .btn-export,
 .btn-delete {
 padding: 0.5rem 1rem;
 border: none;
 border-radius: 4px;
 font-weight: 500; cursor: pointer;
 transition: all 0.2s;
 }

 .btn-share,
 .btn-export {
 background-color: #e0d5c7; color: #2c2c2c;
 }

 .btn-share:hover,
 .btn-export:hover {
 background-color: #d4a574;
 }

 .btn-delete {
 background-color: #ff6b6b; color: white;
 }

 .btn-delete:hover {
 background-color: #ff5252;
 }

 .citations-section {
 min-height: 200px;
 }

 .loading,
 .error,
 .empty {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
 min-height: 200px; gap: 1rem;
 color: #666;
 }

 .spinner {
 width: 30px; height: 30px;
 border: 3px solid #e0e0e0;
 border-top-color: #8b4513;
 border-radius: 50%; animation: spin 1s linear infinite;
 }

 @keyframes spin {
 to {
 transform: rotate(360deg);
 }
 }

 .citations-list {
 display: flex;
 flex-direction: column; gap: 0.75rem;
 }

 .citation-item {
 display: flex;
 justify-content: space-between;
 align-items: center; padding: 0.75rem;
 background-color: #f5f1e8;
 border-radius: 4px;
 }

 .citation-info {
 display: flex;
 flex-direction: column; gap: 0.25rem;
 }

 .code {
 font-family: 'Monaco', 'Courier New', monospace;
 font-size: 0.85rem;
 font-weight: 600; color: #8b4513;
 }

 .title {
 font-size: 0.85rem; color: #333;
 }

 .btn-remove {
 background: none; border: none;
 font-size: 1rem; cursor: pointer;
 color: #999; padding: 0;
 transition: color 0.2s;
 }

 .btn-remove:hover {
 color: #ff6b6b;
 }
</style>


