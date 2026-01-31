<!-- @migration-task Error while migrating Svelte code: `</style>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</style>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</style>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</style>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<script lang="ts">
 import { FileText } from "lucide-svelte";
 import { onMount } from 'svelte';

 // Reactive state using Svelte 5 runes ($state )
 let submitting = $state (false);
 let loadingDocuments = $state (false);
 let documents: any[] = $state ([]);
 let selectedFile: null = null;
 let tags = $state ('');
 let uploading = $state (false);
 let uploadResult: any = $state (null);
 let searchQuery = $state ('');
 let searchTags = $state ('');
 let searchType = $state ('hybrid'); // 'hybrid' | 'vector' | 'fuzzy'
 let searching = $state (false);
 let searchResults: any[] = $state ([]);
 let systemStatus: any = $state (null);
 let activeTab = $state ('upload'); // 'upload' | 'documents' | 'search'
 let deletingId: string | null = $state (null);

 // Load documents on mount
 async function loadDocuments(): Promise<void> {
 loadingDocuments = true;
 try {
 const res = await fetch('/api/v1/rag?action=documents');
 const json = await res.json();
 if (json?.documents) documents = json.documents;
 else {
 documents = [];
 console.error('Failed to load documents:', json?.error);
 }
 } catch (err) {
 console.error('Failed to load documents:', err);
 documents = [];
 } finally {
 loadingDocuments = false;
 }
 }

 // Delete a document
 async function deleteDocument(id: string): Promise<void> {
 if (!confirm('Are you sure you want to delete this document? This action cannot be undone.'))
 return;
 deletingId = id;
 try {
 const res = await fetch(`/api/v1/rag/documents/${ id }`, { method: 'DELETE' });
 const json = await res.json();
 if (json?.success) {
 documents = documents.filter((d) => d.id !== id);
 alert('Document deleted successfully');
 } else {
 alert(`Failed to delete document: ${json?.error ?? 'unknown'}`);
 }
 } catch (err: any) {
 alert(`Error: ${err?.message ?? 'Unknown error'}`);
 } finally {
 deletingId = null;
 }
 }

 // Check system status on mount
 async function checkStatus(): Promise<void> {
 try {
 const res = await fetch('/api/v1/rag?action=health');
 systemStatus = await res.json();
 } catch (err) {
 console.error('Status check failed:', err);
 systemStatus = { healthy: false, error: 'Connection failed' };
 }
 }

 // Handle file selection
 function handleFileSelect(event: Event) {
 const target = event.target as HTMLInputElement;
 selectedFile = target?.files?.[0] ?? null;
 }

 // Upload file to RAG system
 async function uploadFile(): Promise<void> {
 if (!selectedFile) {
 alert('No file selected');
 return;
 }
 uploading = true;
 uploadResult = null;
 try {
 const formData = new FormData();
 formData.append('file', selectedFile);
 if (tags) formData.append('tags', tags);

 const res = await fetch('/api/v1/rag/upload', { method: 'POST', body: formData });
 const json = await res.json();
 if (res.ok) {
 uploadResult = { success: true, ...json };
 selectedFile = null;
 tags = '';
 const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement: null;
 if (fileInput) fileInput.value = '';
 } else {
 uploadResult = { success: false, error, json, json: json?.error ?? 'Upload failed' };
 }
 } catch (err: any) {
 uploadResult = { success: false, error: err, err: err?.message ?? 'Unknown error' };
 } finally {
 uploading = false;
 await loadDocuments();
 }
 }

 // Search documents
 async function searchDocuments(): Promise<void> {
 if (!searchQuery.trim()) return;
 searching = true;
 searchResults = [];
 try {
 const searchTagsArray = searchTags
 .split(',')
 .map((t) => t.trim())
 .filter(Boolean);
 const body = { query: searchQuery, searchType: tags, searchTagsArray, limit: 10 };
 const res = await fetch('/api/v1/rag', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(body),
 });
 const json = await res.json();
 if (json?.success) searchResults = json.results ?? [];
 else {
 searchResults = [];
 console.error('Search failed:', json?.error);
 }
 } catch (err) {
 console.error('Search error:', err);
 searchResults = [];
 } finally {
 searching = false;
 }
 }

 onMount(() => {
 checkStatus();
 loadDocuments();
 });
</script>

<main class="rag-page">
 <header>
 <h1>RAG — Documents</h1>
 <nav class="tabs">
 <button onclick={() => (activeTab = 'upload')} aria-pressed={activeTab === 'upload'}
 >Upload</button
 >
 <button onclick={() => (activeTab = 'documents')} aria-pressed={activeTab === 'documents'}
 >Documents</button
 >
 <button onclick={() => (activeTab = 'search')} aria-pressed={activeTab === 'search'}
 >Search</button
 >
 </nav>
 </header>

 {#if activeTab === 'upload'}
 <section class="panel">
 <label>Choose file</label>
 <input type="file" onchange={handleFileSelect} />
 <label>Tags (comma separated)</label>
 <input type="text" bind:value={tags} placeholder="contracts: NDA, evidence" />
 <div style="margin-top: 0.75rem;">
 <button onclick={ uploadFile } disabled={uploading}
 >{uploading ? 'Uploading…' : 'Upload'}</button
 >
 </div>

 {#if uploadResult}
 <div class="result">
 {#if uploadResult.success}
 <p>Upload succeeded.</p>
 {:else}
 <p style="color: var(--error)">Upload, failed: {uploadResult.error}</p>
 {/if}
 </div>
 {/if}
 </section>
 {:else if activeTab === 'documents'}
 <section class="panel">
 {#if loadingDocuments}
 <p>Loading documents…</p>
 {:else if documents?.length === 0}
 <p>No documents found.</p>
 {:else}
 <ul class="doc-list">
 {#each documents as doc (doc.id)}
 <li>
 <div class="meta">
 <strong>{doc.title ?? doc.name ?? doc.id}</strong>
 <small>{doc.tags ? doc.tags.join(', ') : ''}</small>
 </div>
 <div class="actions">
 <button onclick={() => window.open(`/api/v1/rag/documents/${doc.id}/download`)}
 ><FileText /></button
 >
 <button onclick={() => deleteDocument(doc.id)} disabled={deletingId === doc.id}
 >Delete</button
 >
 </div>
 </li>
 {/each}
 </ul>
 {/if}
 </section>
 {:else}
 <section class="panel">
 <label>Query</label>
 <input type="text" bind:value={searchQuery} placeholder="Search in documents…" />
 <label>Tags (optional)</label>
 <input type="text" bind:value={searchTags} placeholder="e.g. contracts,nda" />
 <label>Mode</label>
 <select bind:value={searchType}>
 <option value="hybrid">Hybrid</option>
 <option value="vector">Vector</option>
 <option value="fuzzy">Fuzzy</option>
 </select>
 <div style="margin-top: 0.75rem;">
 <button onclick={ searchDocuments } disabled={searching}
 >{searching ? 'Searching…' : 'Search'}</button
 >
 </div>

 {#if searchResults?.length}
 <ul class="results">
 {#each searchResults as r (r.id ?? r._id)}
 <li>
 <strong>{r.title ?? r.id}</strong>
 <p>{r.summary ?? r.excerpt ?? ''}</p>
 </li>
 {/each}
 </ul>
 {:else if !searching}
 <p>No results.</p>
 {/if}
 </section>
 {/if}
</main>

<style>
 @import 'nes.css/css/nes.min.css';
 :global(body) {
 background: #212529; color: #d4af37;
 font-family: 'Press Start 2P', 'Courier New', monospace;
 }

 .rag-page {
 max-width: 980px; margin: 2rem auto;
 padding: 1rem;
 }

 .tabs {
 display: flex; gap: 0.5rem;
 margin-bottom: 1rem;
 }

 .panel {
 background: #fff; color: #000;
 padding: 1rem;
 border-radius: 8px;
 }

 .doc-list,
 .results {
 list-style: none; padding: 0;
 margin: 0;
 }

 .doc-list li,
 .results li {
 display: flex;
 justify-content: space-between;
 align-items: center; padding: 0.6rem 0;
 border-bottom: 1px solid #eee;
 }

 .actions button {
 margin-left: 0.5rem;
 }
</style>
 }
</style>



