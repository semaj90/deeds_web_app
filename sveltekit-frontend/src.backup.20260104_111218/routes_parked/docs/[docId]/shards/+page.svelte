<script lang="ts">
 import { page } from '$app/state';
 import type { ShardNode } from '$lib/types/evidence-board';
 import { onMount } from 'svelte';

 let shards = $state<ShardNode[]>([]);
 let selectedShard = $state<ShardNode | null>(null);
 let loading = $state(true);
 let error = $state('');

 let docId = $derived(page.params.docId);

 onMount(() => {
 (async () => {
 try {
 const response = await fetch(`/api/docs/${docId}/shards`);
 const data = await response.json();

 if (!response.ok) {
 throw new Error(data.error || 'Failed to fetch shards');
 }

 shards = data.shards || [];
 } catch (err) {
 error = err instanceof Error ? err.message : 'Unknown error';
 } finally {
 loading = false;
 }
 })();
 });

 function selectShard(shard: ShardNode) {
 selectedShard = shard;
 }

 function sendToChat() {
 if (!selectedShard) return;

 // Dispatch custom event for AI chat integration
 window.dispatchEvent(new CustomEvent('shardToChat', {
 detail: selectedShard
 }));
 }

 function statusColor(shard: ShardNode): string {
 switch (shard.status) {
 case 'analyzed': return 'bg-green-700 border-green-500';
 case 'embedded': return 'bg-blue-700 border-blue-500';
 case 'ready': return 'bg-yellow-600 border-yellow-500';
 case 'error': return 'bg-red-700 border-red-500';
 default: return 'bg-gray-700 border-gray-500';
 }
 }

 function statusLabel(shard: ShardNode): string {
 return shard.status.toUpperCase();
 }

 function riskColor(shard: ShardNode): string {
 if (!shard.riskScore) return 'text-gray-400';
 if (shard.riskScore > 0.7) return 'text-red-400';
 if (shard.riskScore > 0.4) return 'text-yellow-400';
 return 'text-green-400';
 }

 // Calculate arc position for each shard
 function getArcPosition(index: number, total: number, number): number: { left: string; top: string; transform: string } {
 if (total === 0) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

 // Arc parameters
 const centerX = 50; // Center X percentage
 const centerY = 70; // Center Y percentage
 const radius = 35; // Arc radius percentage

 // Calculate angle (spread across 180 degrees for semicircle)
 const startAngle = -90; // Start from bottom
 const endAngle = 90; // End at bottom
 const angleRange = endAngle - startAngle;
 const angle = startAngle + (angleRange * index) / Math.max(1, total - 1);

 // Convert to radians
 const radian = (angle * Math.PI) / 180;

 // Calculate position
 const x = centerX + radius * Math.cos(radian);
 const y = centerY + radius * Math.sin(radian);

 return {
 left: `${x}%`,
 top: `${y}%`,
 transform: 'translate(-50%, -50%)'
 };
 }
</script>

<section class="h-[calc(100vh-80px)] bg-[#13100c] text-[#f5f0e2] flex">
 <!-- Shard Arc Timeline -->
 <div class="relative flex-1 border-r border-[#3a352a] overflow-hidden">
 <div class="absolute inset-6">
 {#if loading}
 <div class="w-full h-full flex items-center justify-center text-sm opacity-70">
 Loading document shards...
 </div>
 {:else if error}
 <div class="p-4 text-red-400 text-sm">
 Error: {error}
 </div>
 {:else if shards.length === 0}
 <div class="w-full h-full flex items-center justify-center text-sm opacity-70">
 No shards found for this document
 </div>
 {:else}
 {#each shards as shard, index}
 {@const position = getArcPosition(index, shards.length)}
 <button
 class="absolute w-16 h-16 rounded-full shadow-lg border-2 transition-all hover:scale-110 hover:shadow-xl flex flex-col items-center justify-center text-[10px] {statusColor(shard)}"
 style="left: {position.left}; top: {position.top}; transform: {position.transform};"
 onclick={() => selectShard(shard)}
 >
 <div class="font-mono font-bold">
 {shard.shardId}
 </div>
 <div class="opacity-80 uppercase tracking-wider">
 {statusLabel(shard)}
 </div>
 </button>
 {/each}

 <!-- Arc guide line -->
 <svg class="absolute inset-0 w-full h-full pointer-events-none opacity-20">
 <path
 d="M 20% 70% Q 50% 35% 80% 70%"
 stroke="#3a352a"
 stroke-width="2"
 fill="none"
 ></path>
 </svg>
 {/if}
 </div>
 </div>

 <!-- Shard Details Panel -->
 <aside class="w-80 p-4 bg-[#1a1813] flex flex-col gap-4">
 <h2 class="font-mono text-sm tracking-wide">SHARD TIMELINE</h2>

 {#if selectedShard}
 <div class="text-xs space-y-3">
 <div class="space-y-1">
 <div class="font-semibold text-sm">Shard {selectedShard.shardId}</div>
 <div class="text-[10px] opacity-70">Document: {selectedShard.docId}</div>
 </div>

 <div class="grid grid-cols-2 gap-2 text-[10px]">
 <div>
 <div class="opacity-70">STATUS</div>
 <div class="font-mono uppercase">{selectedShard.status}</div>
 </div>
 <div>
 <div class="opacity-70">CHECKPOINT</div>
 <div class="font-mono">{selectedShard.checkpointMax}/3</div>
 </div>
 <div>
 <div class="opacity-70">CHUNKS</div>
 <div class="font-mono">{selectedShard.chunkCount}</div>
 </div>
 <div>
 <div class="opacity-70">RISK SCORE</div>
 <div class="font-mono {riskColor(selectedShard)}">
 {selectedShard.riskScore ? selectedShard.riskScore.toFixed(2) : 'N/A'}
 </div>
 </div>
 </div>

 <div class="space-y-2">
 <div class="opacity-70 text-[10px]">PROGRESS</div>
 <div class="w-full bg-[#3a352a] rounded-full h-2">
 <div
 class="bg-lime-500 h-2 rounded-full transition-all"
 style="width: {(selectedShard.checkpointMax / 3) * 100}%"
 ></div>
 </div>
 <div class="text-[9px] opacity-70">
 Checkpoint {selectedShard.checkpointMax} of 3 completed
 </div>
 </div>

 <button
 class="w-full mt-4 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-black text-xs font-bold uppercase tracking-wide transition-colors"
 onclick={sendToChat}
 >
 Load in AI Terminal
 </button>
 </div>
 {:else}
 <div class="text-xs opacity-70">
 Select a shard card on the timeline to view processing details and load its chunks into the AI terminal.
 </div>
 {/if}
 </aside>
</section>