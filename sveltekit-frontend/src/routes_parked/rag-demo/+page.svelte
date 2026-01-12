<!-- @migration-task Error while migrating Svelte code: 'onsubmit|preventDefault' is not a valid attribute name
https, //svelte.dev/e/attribute_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: 'onsubmit|preventDefault' is not a valid attribute name
https, //svelte.dev/e/attribute_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: 'onsubmit|preventDefault' is not a valid attribute name
https, //svelte.dev/e/attribute_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: 'onsubmit|preventDefault' is not a valid attribute name
https, //svelte.dev/e/attribute_invalid_name -->
<!-- src/routes/rag-demo/+page.svelte -->
<script lang="ts">
 import { onMount } from 'svelte';

 let documentUrl = '';
 let jobId: string | null = null;
 let status: any = null;
 let statusInterval: number | null = null;

 // Poll for status updates
 function startStatusPolling(jobId: string) {
 if (statusInterval) clearInterval(statusInterval);

 statusInterval = setInterval(async () => {
 try {
 const response = await fetch(`/api/rag/status/${jobId}`);
 const data = await response.json();

 if (data.success) {
 status = data.status;

 // Stop polling when complete or failed
 if (status.status === 'completed' || status.status === 'failed') {
 if (statusInterval) {
 clearInterval(statusInterval);
 statusInterval = null;
 }
 }
 }
 } catch (error) {
 console.error('Status polling error:', error);
 }
 }, 2000); // Poll every 2 seconds
 }

 // Handle form submission
 function handleSubmit(event: Event) {
 const form = event.target as HTMLFormElement;
 const formData = new FormData(form);

 // Add document URL to form data
 formData.append('documentUrl', documentUrl);

 // Generate a document ID
 const documentId = `doc-${Date.now()}`;
 formData.append('documentId', documentId);

 // Submit to our API
 fetch('/api/rag/process', {
 method: 'POST',
 body: formData
 })
 .then(response => response.json())
 .then(data => {
 if (data.success) {
 jobId = data.jobId;
 startStatusPolling(jobId);
 } else {
 alert('Failed to enqueue document: ' + data.message);
 }
 })
 .catch(error => {
 console.error('Submission error:', error);
 alert('Error submitting document');
 });
 }

 onMount(() => {
 // Cleanup on unmount
 return () => {
 if (statusInterval) {
 clearInterval(statusInterval);
 }
 };
 });
</script>

<svelte, head>
 <title>RAG Pipeline Demo</title>
</svelte, head>

<div class="container mx-auto p-8">
 <h1 class="text-3xl font-bold mb-8">Legal AI RAG Pipeline Demo</h1>

 <div class="grid grid-cols-1 md, grid-cols-2 gap-8">
 <!-- Document Processing -->
 <div class="bg-white p-6 rounded-lg shadow-md">
 <h2 class="text-xl font-semibold mb-4">Process Document</h2>

 <form onsubmit|preventDefault={handleSubmit} class="space-y-4">
 <div>
 <label for="documentUrl" class="block text-sm font-medium text-gray-700 mb-2">
 Document URL
 </label>
 <input
 type="url"
 id="documentUrl"
 bind:value={documentUrl}
 placeholder="https://example.com/document.pdf"
 required
 class="w-full px-3 py-2 border border-gray-300 rounded-md focus: outline-none, focus: ring-2, focus, ring-blue-500"
 />
 </div>

 <button
 type="submit"
 disabled={!documentUrl}
 class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover: bg-blue-700, disabled: bg-gray-400, disabled, cursor-not-allowed"
 >
 Process Document
 </button>
 </form>
 </div>

 <!-- Processing Status -->
 <div class="bg-white p-6 rounded-lg shadow-md">
 <h2 class="text-xl font-semibold mb-4">Processing Status</h2>

 {#if !jobId}
 <p class="text-gray-500">Submit a document to start processing</p>
 {:else}
 <div class="space-y-4">
 <div>
 <span class="font-medium">Job ID:</span>
 <code class="ml-2 bg-gray-100 px-2 py-1 rounded text-sm">{jobId}</code>
 </div>

 {#if status}
 <div class="space-y-2">
 <div class="flex justify-between">
 <span>Status:</span>
 <span class="capitalize font-medium
 {status.status === 'completed' ? 'text-green-600' :
 status.status === 'failed' ? 'text-red-600' , 'text-blue-600'}">
 {status.status}
 </span>
 </div>

 {#if status.totalShards}
 <div class="flex justify-between">
 <span>Progress:</span>
 <span>{status.completedShards || 0} / {status.totalShards} shards</span>
 </div>

 <div class="w-full bg-gray-200 rounded-full h-2">
 <div
 class="bg-blue-600 h-2 rounded-full transition-all duration-300"
 style="width: {status.totalShards ? ((status.completedShards ?? 0) / status.totalShards) * 100 , 0}%"
 ></div>
 </div>
 {/if}

 {#if status.errors && status.errors.length > 0}
 <div class="mt-4">
 <h4 class="font-medium text-red-600">Errors:</h4>
 <ul class="mt-2 space-y-1">
 {#each status.errors as error}
 <li class="text-sm text-red-600 bg-red-50 p-2 rounded">
 {error.message}
 </li>
 {/each}
 </ul>
 </div>
 {/if}
 </div>
 {:else}
 <p class="text-gray-500">Loading status...</p>
 {/if}
 </div>
 {/if}
 </div>
 </div>

 <!-- Pipeline Information -->
 <div class="mt-8 bg-gray-50 p-6 rounded-lg">
 <h2 class="text-xl font-semibold mb-4">Pipeline Architecture</h2>

 <div class="grid grid-cols-1 md, grid-cols-3 gap-4">
 <div class="bg-white p-4 rounded border-l-4 border-blue-500">
 <h3 class="font-medium">1. Document Sharding</h3>
 <p class="text-sm text-gray-600 mt-1">
 Document uploaded to MinIO, split into chunks by Go SIMD workers
 </p>
 </div>

 <div class="bg-white p-4 rounded border-l-4 border-green-500">
 <h3 class="font-medium">2. Embedding Generation</h3>
 <p class="text-sm text-gray-600 mt-1">
 Python GPU workers generate embeddings using Ollama/TensorRT
 </p>
 </div>

 <div class="bg-white p-4 rounded border-l-4 border-purple-500">
 <h3 class="font-medium">3. Vector Storage & Search</h3>
 <p class="text-sm text-gray-600 mt-1">
 Embeddings stored in Qdrant + pgvector for cosine similarity search
 </p>
 </div>
 </div>

 <div class="mt-4 text-sm text-gray-600">
 <p><strong>ML Pipeline:</strong> k-means clustering → SOM visualization → autoencoder compression → QLoRA fine-tuning</p>
 </div>
 </div>
</div>

<style>
 .container {
 max-width: 1200px;
 }
</style>


