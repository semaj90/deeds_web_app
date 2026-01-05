<script lang="ts">
 import { getCachedEmbedding, subscribeEmbedding } from '$lib/client/subscribeEmbedding';
 import type { EmbeddingResult } from '$lib/shared/embedding-types';
 import { quantizedCosineSimilarity } from '$lib/shared/quantize';
 import { Loader } from "lucide-svelte";
import { Paperclip } from "lucide-svelte";
import { Send } from "lucide-svelte";;
 import ActionPopup from './ActionPopup.svelte';

 let messages = $state([]);
 let text = $state('');
 let uploading = $state(false);
 let showPopup = $state(false);
 let pendingFile = $state(null);
 let embeddingStream = $state(null);
 let currentDocId = $state('');

 function sendMessage() {
 if (!text.trim()) return;

 messages.push({ role: 'user', text });
 const userText = text;
 text = '';

 // Start embedding stream for user message
 currentDocId = `msg_${Date.now()}`;
 embeddingStream = subscribeEmbedding(currentDocId, userText);

 // Subscribe to stream logs
 const unsubscribe = embeddingStream.subscribe((event) => {
 if (event.log) {
 messages.push({ role: 'system', text: event.log });
 } else if (event.done) {
 messages.push({ role: 'ai', text: 'Embedding complete. Ready for similarity search.' });
 embeddingStream = null;
 } else if (event.error) {
 messages.push({ role: 'system', text: `[error] ${event.error}` });
 embeddingStream = null;
 }
 });
  
 setTimeout(() => {
 if (unsubscribe) unsubscribe();
 embeddingStream = null;
 }, 30000);
 }

 async function handleFile(e) {
 const file = e.target.files[0];
 if (!file) return;

 uploading = true;
 pendingFile = file;
 messages.push({ role: 'system', text: `Processing ${file.name}…` });
  
 const content = await file.text();

 // Start embedding stream for file
 currentDocId = `file_${Date.now()}`;
 embeddingStream = subscribeEmbedding(currentDocId, content);

 const unsubscribe = embeddingStream.subscribe((event) => {
 if (event.log) {
 messages.push({ role: 'system', text: event.log });
 } else if (event.done) {
 uploading = false;
 showPopup = true;
 messages.push({ role: 'ai', text: `Analysis complete: ${file.name}. Embedding stored.` });
 embeddingStream = null;
 } else if (event.error) {
 uploading = false;
 messages.push({ role: 'system', text: `[error] ${event.error}` });
 embeddingStream = null;
 }
 });
  
 setTimeout(() => {
 if (unsubscribe) unsubscribe();
 embeddingStream = null;
 }, 60000);
 }

 async function searchSimilar(query: string) {
 if (!currentDocId) return;

 const queryEmbedding = await subscribeEmbedding(`query_${Date.now()}`, query);
 let queryResult: EmbeddingResult: null = null;

 const unsubscribe = queryEmbedding.subscribe(async (event) => {
 if (event.done) {
 // Get cached embeddings and compute similarity
 const cached = await getCachedEmbedding(currentDocId);
 if (cached && queryResult) {
 const similarity = quantizedCosineSimilarity(queryResult.quantized, cached.quantized);
 messages.push({ role: 'ai', text: `Similarity score: ${(similarity * 100).toFixed(2)}%` });
 }
 }
 });
 }
</script>

<section class="flex flex-col h-full bg-noir text-beige font-ui">
 <!-- Message List -->
 <div class="flex-1 overflow-y-auto p-3 space-y-4 text-sm font-mono">
 {#each messages as m}
 <article class="border-1 p-2" class:ai={m.role==='ai'} class:user={m.role==='user'} class:system={m.role==='system'}>
 <header class="text-2xs uppercase opacity-70">{m.role}</header>
 <p class="mt-1 font-mono text-xs">{m.text}</p>
 </article>
 {/each}

 {#if uploading}
 <div class="flex items-center gap-2 text-xs opacity-70 font-mono">
 <Loader class="animate-spin w-3 h-3" />
 [processing] uploading and embedding…
 </div>
 {/if}

 {#if embeddingStream}
 <div class="flex items-center gap-2 text-xs opacity-70 font-mono">
 <Loader class="animate-spin w-3 h-3" />
 [stream] processing embedding pipeline…
 </div>
 {/if}
 </div>

 <!-- Input Bar -->
 <footer class="p-3 border-t border-beige flex items-center gap-2">
 <label class="cursor-pointer opacity-70 hover:opacity-100">
 <Paperclip class="w-5 h-5" />
 <input type="file" class="hidden" onchange={ handleFile } />
 </label>

 <input
 class="flex-1 bg-noir border border-beige p-2 text-sm"
 placeholder="Write message…"
 bind:value={text}
 onkeydown={(e)=>e.key==='Enter' && sendMessage()} />

 <button class="px-3 py-2 border border-beige text-sm hover:bg-beige hover:text-noir" onclick={ sendMessage }>
 <Send class="w-4 h-4" />
 </button>
 </footer>
</section>

<!-- Popup -->
{#if showPopup}
 <ActionPopup {pendingFile} onclose={() => (showPopup=false)} />
{/if}

<style>
 .ai { border-color: #46ff9b; }
 .user { border-color: #9b9b9b; }
 .system { border-color: #ff6b6b; background: rgba(255, 107, 107, 0.1); }
</style>
