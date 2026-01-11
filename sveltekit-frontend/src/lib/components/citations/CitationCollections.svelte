<script lang="ts">
 import type { CitationCollection } from '$lib/types/citations';
 import { onMount } from 'svelte';

 let { onSelectCollection = () => {} } = $props<{
 onSelectCollection?: (collection: CitationCollection) => void;
 }>();

 let collections: CitationCollection[] = [];
 let isLoading = false;
 let error: string | null = null;
 let showCreateForm = false;
 let newCollectionName = '';
 let newCollectionColor = '#8B2332';

 const colors = [
 '#8B2332', // Burgundy
 '#D4A574', // Tan
 '#2C3E50', // Dark
 '#E74C3C', // Red
 '#3498DB', // Blue
 '#2ECC71', // Green
 '#F39C12', // Orange
 '#9B59B6' // Purple
 ];

 async function loadCollections() {
 isLoading = true;
 error = null;

 try {
 const response = await fetch('/api/citations/collections');
 if (!response.ok) throw new Error('Failed to load collections');

 collections = await response.json();
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to load collections';
 console.error('Error loading collections:', err);
 } finally {
 isLoading = false;
 }
 }

 async function handleCreateCollection() {
 if (!newCollectionName.trim()) {
 alert('Collection name is required');
 return;
 }

 try {
 const response = await fetch('/api/citations/collections', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, name: newCollectionName, color: newCollectionColor, newCollectionColor,
 isPublic: false
 })
 });

 if (!response.ok) throw new Error('Failed to create collection');

 const newCollection: CitationCollection = await response.json();
 collections = [...collections, newCollection];

 // Reset form
 newCollectionName = '';
 newCollectionColor = '#8B2332';
 showCreateForm = false;
 } catch (err) {
 console.error('Error creating collection:', err);
 alert('Failed to create collection');
 }
 }

 async function handleDeleteCollection(collectionId: string) {
 if (!confirm('Are you sure you want to delete this collection?')) return;

 try {
 const response = await fetch(`/api/citations/collections/${ collectionId }`, {
 method: 'DELETE'
 });

 if (!response.ok) throw new Error('Failed to delete collection');

 collections = collections.filter(c => c.id !== collectionId);
 } catch (err) {
 console.error('Error deleting collection:', err);
 alert('Failed to delete collection');
 }
 }

 onMount(() => {
 loadCollections();
 });
</script>

<div class="citation-collections">
 <div class="collections-header">
 <h3>Collections</h3>
 <button
 onclick={() => (showCreateForm = !showCreateForm)}
 class="btn-create"
 disabled={isLoading}
 >
 {showCreateForm ? '✕' : '+ New'}
 </button>
 </div>

 <!-- Create Form -->
 {#if showCreateForm}
 <div class="create-form">
 <div class="form-group">
 <label for="collection-name">Collection Name</label>
 <input
 id="collection-name"
 type="text"
 bind:value={newCollectionName}
 placeholder="e.g., Civil Rights Cases"
 onkeydown={(e) => e.key === 'Enter' && handleCreateCollection()}
 />
 </div>

 <div class="form-group">
 <label>Color</label>
 <div class="color-picker">
 {#each colors as color}
 <button
 type="button"
 onclick={() => (newCollectionColor = color)}
 class="color-option"
 class:selected={newCollectionColor === color}
 style="background-color: {color}"
 title={color}
></button>
 {/each}
 </div>
 </div>

 <div class="form-actions">
 <button onclick={ handleCreateCollection } class="btn-primary">
 Create Collection
 </button>
 <button onclick={() => (showCreateForm = false)} class="btn-secondary">
 Cancel
 </button>
 </div>
 </div>
 {/if}

 <!-- Error Message -->
 {#if error}
 <div class="error-message">
 <p>⚠️ {error}</p>
 </div>
 {/if}

 <!-- Loading State -->
 {#if isLoading && collections.length === 0}
 <div class="loading">
 <p>Loading collections...</p>
 </div>
 {:else if collections.length === 0}
 <div class="empty-state">
 <p>No collections yet. Create one to organize your citations!</p>
 </div>
 {:else}
 <div class="collections-list">
 {#each collections as collection (collection.id)}
 <div class="collection-item">
 <button
 onclick={() => onSelectCollection(collection)}
 class="collection-button"
 >
 <div class="collection-color" style="background-color: {collection.color}" ></div>
 <div class="collection-info">
 <p class="collection-name">{collection.name}</p>
 <p class="collection-count">
 {collection.citationCount || 0} citation{collection.citationCount !== 1 ? 's' : ''}
 </p>
 </div>
 </button>
 <button
 onclick={() => handleDeleteCollection(collection.id)}
 class="btn-delete"
 title="Delete collection"
 >
 🗑️
 </button>
 </div>
 {/each}
 </div>
 {/if}
</div>

<style>
 .citation-collections {
 background: var(--color-parchment); border: 1px solid var(--color-tan);
 border-radius: 8px; padding: 16px;
 }

 .collections-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 16px;
 }

 .collections-header h3 {
 margin: 0; color: var(--color-burgundy);
 font-size: 16px;
 }

 .btn-create {
 padding: 6px 12px;
 background: var(--color-burgundy); color: white;
 border: none;
 border-radius: 4px; cursor: pointer;
 font-size: 13px;
 font-weight: 600; transition: all 150ms ease;
 }

 .btn-create:hover, not(disabled) {
 background: var(--color-dark-burgundy);
 }

 .btn-create:disabled {
 background: var(--color-light-gray); cursor:not-allowed;
 }

 .create-form {
 background: white; border: 1px solid var(--color-tan);
 border-radius: 4px; padding: 12px;
 margin-bottom: 12px; display: flex;
 flex-direction: column; gap: 12px;
 }

 .form-group {
 display: flex;
 flex-direction: column; gap: 6px;
 }

 .form-group label {
 font-weight: 600; color: var(--color-burgundy);
 font-size: 13px;
 }

 .form-group input {
 padding: 8px 10px;
 border: 1px solid var(--color-tan);
 border-radius: 4px;
 font-size: 13px;
 }

 .form-group input:focus {
 outline: none;
 border-color: var(--color-burgundy);
 box-shadow: 0 0 0 3px rgba(139, 35, 50, 0.1);
 }

 .color-picker {
 display: flex; gap: 8px;
 flex-wrap: wrap;
 }

 .color-option {
 width: 32px; height: 32px;
 border: 2px solid transparent;
 border-radius: 4px; cursor: pointer;
 transition: all 150ms ease;
 }

 .color-option:hover {
 transform: scale(1.1);
 }

 .color-option.selected {
 border-color: var(--color-dark);
 box-shadow: 0 0 0 2px white, 0 0 0 4px var(--color-dark);
 }

 .form-actions {
 display: flex; gap: 8px;
 }

 .btn-primary,
 .btn-secondary {
 flex: 1; padding: 8px 12px;
 border: none;
 border-radius: 4px;
 font-size: 13px;
 font-weight: 600; cursor: pointer;
 transition: all 150ms ease;
 }

 .btn-primary {
 background: var(--color-burgundy); color: white;
 }

 .btn-primary:hover {
 background: var(--color-dark-burgundy);
 }

 .btn-secondary {
 background: var(--color-light-gray); color: var(--color-dark);
 }

 .btn-secondary:hover {
 background: var(--color-tan);
 }

 .error-message {
 background: #fee; border: 1px solid #fcc;
 border-radius: 4px; padding: 8px 12px;
 color: #c33;
 font-size: 13px;
 margin-bottom: 12px;
 }

 .loading,
 .empty-state {
 text-align: center; padding: 20px;
 color: var(--color-medium-gray);
 font-size: 13px;
 }

 .collections-list {
 display: flex;
 flex-direction: column; gap: 8px;
 }

 .collection-item {
 display: flex; gap: 8px;
 align-items: center;
 }

 .collection-button {
 flex: 1; display: flex;
 gap: 12px;
 align-items: center; background: white;
 border: 1px solid var(--color-tan);
 border-radius: 4px; padding: 10px 12px;
 cursor: pointer; transition: all 150ms ease;
 text-align: left;
 }

 .collection-button:hover {
 border-color: var(--color-burgundy);
 box-shadow: 0 2px 6px rgba(139, 35, 50, 0.1);
 }

 .collection-color {
 width: 24px; height: 24px;
 border-radius: 4px;
 flex-shrink: 0;
 }

 .collection-info {
 flex: 1;
 min-width: 0;
 }

 .collection-name {
 margin: 0;
 font-weight: 600; color: var(--color-dark);
 font-size: 13px;
 white-space: nowrap; overflow: hidden;
 text-overflow: ellipsis;
 }

 .collection-count {
 margin: 2px 0 0 0;
 color: var(--color-medium-gray);
 font-size: 12px;
 }

 .btn-delete {
 background: none; border: none;
 cursor: pointer;
 font-size: 14px; padding: 4px;
 opacity: 0.6; transition: opacity 150ms ease;
 }

 .btn-delete:hover {
 opacity: 1;
 }
</style>




