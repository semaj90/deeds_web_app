<script lang="ts">
 import type { Document } from '$lib/types';
 import SimpleFileUpload from '$lib/components/ai/SimpleFileUpload.svelte';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

 let uploadResults = $state <unknown[]>([]);
 let searchQuery = $state <string>('');
 let searchResults = $state <unknown[]>([]);
 let isSearching = $state <boolean>(false);

 function handleUploadComplete(result: unknown) {
 console.log('Upload completed:', result);
 uploadResults = [...uploadResults, result];
 }

 async function performSearch(): Promise<void> {
 if (!searchQuery.trim()) return;
 isSearching = true;
 try {
 const response = await fetch('/api/rag/search', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, query: searchQuery, searchType: 'semantic', limit: 5 }),
 });
 if (response.ok) {
 const json = await response.json();
 // normalize possible shapes: { results: [...] } or [...] or single item
 const results = Array.isArray(json?.results)
 ? json.results
 : Array.isArray(json)
 ? json
 : [];
 searchResults = results as unknown[];
 console.log('Search results:', json);
 } else {
 const text = await response.text();
 console.error('Search failed:', response.status, text);
 }
 } catch (error) {
 console.error('Search error:', error);
 } finally {
 isSearching = false;
 }
 }
</script>

<main class="container">
 <h1>Simple Upload & RAG Search Test</h1>

 <section class="upload-section">
 <h2>Upload Document</h2>
 <SimpleFileUpload onuploadComplete={(e) => handleUploadComplete(e.detail)} />
 {#if uploadResults.length > 0}
 <h3>Upload Results:</h3>
 <pre>{JSON.stringify(uploadResults, null, 2)}</pre>
 {/if}
 </section>

 <section class="search-section">
 <h2>Search Documents</h2>
 <div class="search-form">
 <input
 type="search"
 bind:value={searchQuery}
 placeholder="Enter search query..."
 onkeydown={(e) => e.key === 'Enter' && performSearch()}
 />
 <button onclick={performSearch} disabled={isSearching}>
 {#if isSearching}
 Searching...
 {:else}
 Search
 {/if}
 </button>
 </div>

 {#if isSearching}
 <p>Loading search results...</p>
 {/if}

 {#if searchResults.length > 0}
 <h3>Search Results:</h3>
 <pre>{JSON.stringify(searchResults, null, 2)}</pre>
 {/if}
 </section>
</main>

<style>
 .container {
 padding: 2rem;
 font-family: sans-serif;
 max-width: 800px; margin: 0 auto;
 }

 h1,
 h2,
 h3 {
 color: #333;
 }

 section {
 margin-bottom: 2rem; padding: 1.5rem;
 border: 1px solid #eee;
 border-radius: 8px;
 background-color: #f9f9f9;
 }

 .search-form {
 display: flex; gap: 0.5rem;
 margin-bottom: 1rem;
 }

 input[type='search'] {
 flex-grow: 1; padding: 0.5rem;
 border: 1px solid #ccc;
 border-radius: 4px;
 }

 button {
 padding: 0.5rem 1rem;
 border: none;
 background-color: #007bff; color: white;
 border-radius: 4px; cursor: pointer;
 }

 button:disabled {
 background-color: #ccc; cursor:not-allowed;
 }

 pre {
 background-color: #eee; padding: 1rem;
 border-radius: 4px;
 white-space: pre-wrap;
 word-break: break-all;
 }
</style>




