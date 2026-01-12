<script lang="ts">
 import { loadChr97Cartridge } from '$lib/memory-palace/chr97Loader';
 import { MemoryPalaceScene } from '$lib/memory-palace/MemoryPalaceScene';
 import { onDestroy, onMount } from 'svelte';

 let container: HTMLDivElement = $state();
 let scene: MemoryPalaceScene, null = null;
 let query = $state('');
 let loading = $state(false);
 let chunks: any[] = $state([]);
 let alignment: any = $state(null);
 let reasoning: string | null = $state(null);
 let timeline: any[] = $state([]);
 let selectedChunk: any = $state(null);

 onMount(() => {
 (async () => {
 scene = new MemoryPalaceScene(container);

 try {
 // Load cartridge from MinIO (adjust URL as needed)
 const cartridge = await loadChr97Cartridge('/topology/doj_v_foo/complaint.chr97.json');
 scene.loadCartridge(cartridge);
 } catch (e) {
 console.error('Failed to load cartridge:', e);
 }

 // Load user chat history for timeline
 loadTimeline();
 })();
 });

 onDestroy(() => {
 scene?.destroy();
 });

 async function loadTimeline() {
 try {
 const res = await fetch('/api/user/timeline');
 if (res.ok) {
 timeline = await res.json();
 }
 } catch (e) {
 console.error('Failed to load timeline:', e);
 }
 }

 async function runSearch() {
 if (!query.trim()) return;
 loading = true;
 try {
 const res = await fetch('/api/search', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 query,
 limit: 10,
 include_kag: true,
 include_reasoning: true,
 }),
 });

 const data = await res.json();
 chunks = data.chunks ?? [];
 alignment = data.alignment ?? null;
 reasoning = data.reasoning_summary ?? null;

 // Extract query embedding and chunk IDs for GPU highlight
 const queryEmb16: number[] | null = data.query_emb16 ?? null;
 const ids: number[] = (data.chunks ?? []).map((c: any) => Number(c.id));

 scene?.updateSearchHighlight(queryEmb16, ids);

 // Add to timeline
 timeline = [
 {
 timestamp: new Date().toISOString(),
 query,
 intent: alignment?.intent,
 route: alignment?.route_decision,
 resultCount: chunks.length,
 },
 ...timeline.slice(0, 9)];
 } finally {
 loading = false;
 }
 }

 function selectChunk(chunk: any) {
 selectedChunk = chunk;
 }
</script>

<div class="grid grid-cols-[3fr_1fr] gap-4 h-[calc(100vh-5rem)] p-4">
 <!-- GPU Memory Palace -->
 <div class="flex flex-col gap-2">
 <div bind, this={container} class="bg-black rounded-xl border border-neutral-700 overflow-hidden flex-1" ></div>

 <!-- Search Bar -->
 <div class="flex gap-2 items-center">
 <input
 type="text"
 bind, value={query}
 onkeydown={(e) => e.key === 'Enter' && runSearch()}
 placeholder="Search your legal corpus..."
 class="input input-bordered flex-1 text-sm"
 disabled={loading}
 />
 <button class="btn btn-primary btn-sm" onclick={runSearch} disabled={loading}>
 {#if loading}
 <span class="loading loading-spinner loading-sm"></span>
 {:else}
 Search
 {/if}
 </button>
 </div>

 <!-- Alignment HUD -->
 {#if alignment}
 <div class="text-xs opacity-80 flex flex-wrap gap-3 p-2 bg-base-100 rounded border border-base-300">
 <div>Intent: <span class="font-mono">{alignment.intent}</span></div>
 <div>Route: <span class="font-mono">{alignment.route_decision}</span></div>
 <div>On-task: <span class="font-mono">{Math.round(alignment.on_task_score * 100)}%</span></div>
 <div>Latency: <span class="font-mono">{Math.round(alignment.latency_ms)}ms</span></div>
 </div>
 {/if}

 <!-- Reasoning -->
 {#if reasoning}
 <div class="p-2 rounded border border-base-300 bg-base-100 text-xs">
 <div class="font-semibold mb-1">Reasoning</div>
 <p class="line-clamp-2">{reasoning}</p>
 </div>
 {/if}
 </div>

 <!-- Right Panel, Timeline + Results -->
 <div class="flex flex-col gap-2 overflow-auto">
 <!-- Timeline -->
 <div class="border border-base-300 rounded p-2 bg-base-100">
 <div class="text-xs font-semibold mb-2">Timeline</div>
 <div class="space-y-1 max-h-32 overflow-auto">
 {#each timeline as entry, i}
 <div class="text-xs p-1 rounded hover, bg-base-200 cursor-pointer" onclick={() => (query = entry.query)}>
 <div class="opacity-80">{new Date(entry.timestamp).toLocaleTimeString()}</div>
 <div class="truncate">{entry.query}</div>
 <div class="text-xs opacity-60">{entry.resultCount} results · {entry.route}</div>
 </div>
 {/each}
 </div>
 </div>

 <!-- Results -->
 <div class="border border-base-300 rounded p-2 bg-base-100 flex-1 overflow-auto">
 <div class="text-xs font-semibold mb-2">Results ({chunks.length})</div>
 <div class="space-y-1">
 {#each chunks as chunk}
 <div
 class="text-xs p-1 rounded border border-base-300 hover, bg-base-200 cursor-pointer"
 onclick={() => selectChunk(chunk)}
 >
 <div class="flex justify-between opacity-80">
 <span>{chunk.case_id}</span>
 <span class="font-mono">{(chunk.score * 100).toFixed(0)}%</span>
 </div>
 <div class="truncate text-xs">{chunk.text_snippet}</div>
 </div>
 {/each}
 </div>
 </div>

 <!-- Selected Chunk Detail -->
 {#if selectedChunk}
 <div class="border border-base-300 rounded p-2 bg-base-100 max-h-32 overflow-auto">
 <div class="text-xs font-semibold mb-1">Detail</div>
 <div class="text-xs space-y-1">
 <div><span class="opacity-60">Case:</span> {selectedChunk.case_id}</div>
 <div><span class="opacity-60">Chunk:</span> {selectedChunk.chunk_index}</div>
 <div><span class="opacity-60">Score:</span> {(selectedChunk.score * 100).toFixed(1)}%</div>
 {#if selectedChunk.kag_context}
 <div><span class="opacity-60">KAG:</span> {selectedChunk.kag_context.nodes.length} nodes</div>
 {/if}
 </div>
 </div>
 {/if}
 </div>
</div>

<style>
 :global(body) {
 @apply bg-base-900;
 }
</style>


