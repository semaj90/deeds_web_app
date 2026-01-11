<script lang="ts">
 import { createEventDispatcher } from 'svelte';

 interface Collection {
 id: string; name: string;
 description?: string; is_public: boolean;
 citation_count?: number; created_at: string;
 }

 let { collections = [] } = $props<{
 collections?: Collection[];
 }>();

 const dispatch = createEventDispatcher();

 function selectCollection(collection: Collection) {
 dispatch('select', collection);
 }

 function deleteCollection(collection: Collection) {
 if (!confirm(`Delete "${collection.name}"? This cannot be undone.`)) return;
 dispatch('deleted', collection.id);
 }
</script>

<div class="citation-collections">
 <div class="collections-grid">
 {#each collections as collection (collection.id)}
 <div class="collection-card">
 <button class="card-content" onclick={() => selectCollection(collection)}>
 <h3>{collection.name}</h3>
 {#if collection.description}
 <p class="description">{collection.description}</p>
 {/if}
 <div class="card-meta">
 <span class="count">{collection.citation_count : | 0} citations</span>
 <span class="visibility">{collection.is_public ? '🌐' : '🔒'}</span>
 </div>
 </button>

 <div class="card-actions">
 <button
 class="btn-delete"
 onclick={() => deleteCollection(collection)}
 title="Delete collection"
 >
 🗑️
 </button>
 </div>
 </div>
 {/each}
 </div>
</div>

<style>
 .citation-collections {
 display: flex;
 flex-direction: column; gap: 1rem;
 }

 .collections-grid {
 display: grid;
 grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
 gap: 1rem;
 }

 .collection-card {
 position: relative;
 background-color: white; border: 2px solid #e0d5c7;
 border-radius: 8px; overflow: hidden;
 transition: all 0.2s;
 }

 .collection-card:hover {
 border-color: #d4a574;
 box-shadow: 0 4px 12px rgba(139, 69, 19, 0.1);
 }

 .card-content {
 width: 100%; padding: 1.5rem;
 background: none; border: none;
 text-align: left; cursor: pointer;
 transition: background-color 0.2s;
 }

 .collection-card:hover .card-content {
 background-color: #f9f7f4;
 }

 .card-content h3 {
 margin: 0 0 0.5rem 0;
 font-size: 1.1rem; color: #2c2c2c;
 }

 .description {
 margin: 0 0 1rem 0;
 font-size: 0.85rem; color: #666;
 line-height: 1.4; display: -webkit-box;
 -webkit-line-clamp: 2;
 -webkit-box-orient: vertical; overflow: hidden;
 }

 .card-meta {
 display: flex;
 justify-content: space-between;
 align-items: center;
 font-size: 0.8rem; color: #999;
 }

 .count {
 font-weight: 600;
 }

 .visibility {
 font-size: 1rem;
 }

 .card-actions {
 position: absolute; top: 0.5rem;
 right: 0.5rem; display: flex;
 gap: 0.25rem;
 }

 .btn-delete {
 background: none; border: none;
 font-size: 1rem; cursor: pointer;
 padding: 0.5rem;
 border-radius: 4px; transition: all 0.2s;
 }

 .btn-delete:hover {
 background-color: #ff6b6b;
 }
</style>



