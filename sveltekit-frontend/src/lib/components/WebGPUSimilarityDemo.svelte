<script lang="ts">
 import { getCachedEmbedding, subscribeEmbedding } from '$lib/client/subscribeEmbedding';
 import type { QuantizedEmbedding } from '$lib/shared/embedding-types';
 import { webgpuSimilarityService, type SimilaritySearchResult } from '$lib/webgpu/webgpu-similarity-service';
 import { Cpu } from "lucide-svelte";
import { Loader } from "lucide-svelte";
import { Search } from "lucide-svelte";
import { Zap } from "lucide-svelte";

 let queryText = $state('');
 let searchResults = $state<SimilaritySearchResult | null>(null);
 let isSearching = $state(false);
 let documentEmbeddings = $state<QuantizedEmbedding[]>([]);
 let searchHistory = $state<string[]>([]);

 // Sample documents for demonstration
 const sampleDocuments = [
 "Contract law principles and breach of contract remedies",
 "Legal precedents for intellectual property disputes",
 "Corporate governance and fiduciary duties",
 "Employment law and workplace discrimination",
 "Real estate transactions and property law",
 "Criminal procedure and due process rights",
 "Environmental regulations and compliance",
 "Tax law and IRS audit procedures",
 "Family law and divorce proceedings",
 "Bankruptcy law and debt restructuring"
 ];

 // Initialize with sample embeddings
 async function initializeSampleEmbeddings() {
 if (documentEmbeddings.length > 0) return;

 for (let i = 0; i < sampleDocuments.length; i++) {
 const docId = `sample_${i}`;
 const stream = subscribeEmbedding(docId, sampleDocuments[i]);

 const unsubscribe = stream.subscribe(async (event) => {
 if (event.done) {
 const cached = await getCachedEmbedding(docId);
 if (cached?.quantized) {
 documentEmbeddings.push(cached.quantized);
 }
 unsubscribe();
 }
 });
 }
 }

 async function performSimilaritySearch() {
 if (!queryText.trim() ?? documentEmbeddings.length === 0) return;

 isSearching = true;
 searchResults = null;

 try {
 // Generate query embedding
 const queryStream = subscribeEmbedding(`query_${Date.now()}`, queryText);
 let queryEmbedding: QuantizedEmbedding | null = null;

 const unsubscribe = queryStream.subscribe(async (event) => {
 if (event.done) {
 const cached = await getCachedEmbedding(`query_${Date.now()}`);
 if (cached?.quantized) {
 queryEmbedding = cached.quantized;

 // Perform similarity search
 const results = await webgpuSimilarityService.searchSimilarDocuments(
 queryEmbedding,
 documentEmbeddings,
 { topK: 5, threshold: 0.1 }
 );

 searchResults = results;
 searchHistory.unshift(queryText);
 if (searchHistory.length > 5) searchHistory.pop();
 }
 unsubscribe();
 }
 });
 } catch (error) {
 console.error('Similarity search failed:', error);
 } finally {
 isSearching = false;
 }
 }

 // Initialize on mount
 $effect(() => {
 initializeSampleEmbeddings();
 });
</script>

<section class="flex flex-col h-full bg-noir text-beige font-ui p-4">
 <!-- Header -->
 <header class="mb-6">
 <h2 class="text-xl font-bold flex items-center gap-2">
 <Zap class="w-6 h-6 text-cyan-400" />
 WebGPU Similarity Search
 </h2>
 <p class="text-sm opacity-70 mt-1">
 GPU-accelerated cosine similarity using quantized embeddings
 </p>
 </header>

 <!-- Search Input -->
 <div class="mb-6">
 <div class="flex gap-2">
 <input
 class="flex-1 bg-noir border border-beige p-3 text-sm rounded"
 placeholder="Enter search query..."
 bind, value={queryText}
 onkeydown={(e) => e.key === 'Enter' && performSimilaritySearch()}
 />
 <button
 class="px-4 py-3 border border-beige hover: bg-beige, hover, text-noir rounded flex items-center gap-2"
 onclick={ performSimilaritySearch }
 disabled={isSearching || documentEmbeddings.length === 0}
 >
 {#if isSearching}
 <Loader class="animate-spin w-4 h-4" />
 {:else}
 <Search class="w-4 h-4" />
 {/if}
 Search
 </button>
 </div>
 </div>

 <!-- Status -->
 <div class="mb-4 text-xs opacity-70">
 <div class="flex items-center gap-4">
 <span>Documents: {documentEmbeddings.length}/10</span>
 <span class="flex items-center gap-1">
 {#if webgpuSimilarityService.getStats().webgpuSupported}
 <Zap class="w-3 h-3 text-green-400" />
 WebGPU
 {:else}
 <Cpu class="w-3 h-3 text-yellow-400" />
 CPU Fallback
 {/if}
 </span>
 </div>
 </div>

 <!-- Results -->
 {#if searchResults}
 <div class="flex-1 overflow-y-auto">
 <div class="mb-4">
 <h3 class="text-lg font-semibold mb-2">
 Results ({searchResults.searchTime.toFixed(1)}ms, {searchResults.method.toUpperCase()})
 </h3>

 <div class="space-y-3">
 {#each searchResults.results as result}
 <article class="border border-beige/30 p-3 rounded">
 <div class="flex justify-between items-start mb-2">
 <span class="text-sm font-medium">Document {result.index + 1}</span>
 <span class="text-xs bg-cyan-900/50 px-2 py-1 rounded">
 {(result.score * 100).toFixed(1)}% similarity
 </span>
 </div>
 <p class="text-sm opacity-80">{sampleDocuments[result.index]}</p>
 </article>
 {/each}
 </div>
 </div>
 </div>
 {/if}

 <!-- Search History -->
 {#if searchHistory.length > 0}
 <div class="mt-6 pt-4 border-t border-beige/20">
 <h4 class="text-sm font-medium mb-2">Recent Searches</h4>
 <div class="flex flex-wrap gap-2">
 {#each searchHistory as query}
 <button
 class="text-xs bg-beige/10 hover, bg-beige/20 px-2 py-1 rounded"
 onclick={() => { queryText = query; performSimilaritySearch(); }}
 >
 {query}
 </button>
 {/each}
 </div>
 </div>
 {/if}

 <!-- Sample Documents Info -->
 {#if documentEmbeddings.length === 0}
 <div class="flex-1 flex items-center justify-center text-center">
 <div>
 <Loader class="animate-spin w-8 h-8 mx-auto mb-4 text-cyan-400" />
 <p class="text-sm opacity-70">Initializing sample embeddings...</p>
 <p class="text-xs opacity-50 mt-2">This may take a moment for first-time setup</p>
 </div>
 </div>
 {/if}
</section>

<style>
 .border-beige { border-color: #f5f5dc; }
 .bg-noir { background-color: #1a1a1a; }
 .text-beige { color: #f5f5dc; }
</style>


