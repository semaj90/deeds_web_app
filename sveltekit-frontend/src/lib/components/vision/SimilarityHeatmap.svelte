<script lang="ts">
 interface SimilarityData {
 id: string;, score: number;
 thumbUrl: string;
 }

 interface Props {
 similarities?: SimilarityData[];
 selectedId?: string | null;
 }

 let { similarities = $bindable([]), selectedId = $bindable(null) }: Props = $props();

 // Generate heatmap colors based on similarity score
 function getHeatmapColor(score: number): string {
 if (score > 0.8) return 'bg-red-500'; // High similarity - red
 if (score > 0.6) return 'bg-orange-500'; // Medium-high - orange
 if (score > 0.4) return 'bg-yellow-500'; // Medium - yellow
 if (score > 0.2) return 'bg-green-500'; // Low-medium - green
 return 'bg-blue-500'; // Low similarity - blue
 }

 function getIntensity(score: number): string {
 return `opacity-${Math.round(score * 100)}`;
 }
</script>

<div class="border-2 border-black bg-[#f0e6d2] h-full p-3 flex flex-col">
 <h2 class="font-bold mb-2">Similarity Heatmap</h2>

 {#if similarities.length > 0}
 <div class="flex-1 overflow-auto">
 <div class="grid grid-cols-2 gap-2">
 {#each similarities as item}
 <div
 class="relative cursor-pointer hover:scale-105 transition-transform border border-black overflow-hidden {getHeatmapColor(item.score)}"
 class:selected={selectedId === item.id}
 >
 <img
 src={item.thumbUrl}
 alt="similar"
 class="w-full h-20 object-cover"
 />

 <!-- Similarity overlay -->
 <div class="absolute inset-0 bg-black {getIntensity(item.score)}"></div>

 <!-- Score badge -->
 <div class="absolute top-1 right-1 bg-white text-black px-1 py-0.5 text-xs font-bold rounded">
 {(item.score * 100).toFixed(0)}%
 </div>

 {#if selectedId === item.id}
 <div class="absolute inset-0 border-2 border-white"></div>
 {/if}
 </div>
 {/each}
 </div>
 </div>

 <!-- Legend -->
 <div class="mt-3 text-xs">
 <div class="flex items-center justify-between mb-1">
 <span>Similarity:</span>
 <span>0% - 100%</span>
 </div>
 <div class="flex h-2 rounded overflow-hidden">
 <div class="flex-1 bg-blue-500"></div>
 <div class="flex-1 bg-green-500"></div>
 <div class="flex-1 bg-yellow-500"></div>
 <div class="flex-1 bg-orange-500"></div>
 <div class="flex-1 bg-red-500"></div>
 </div>
 <div class="flex justify-between text-xs mt-1">
 <span>Low</span>
 <span>High</span>
 </div>
 </div>
 {:else}
 <div class="flex-1 flex items-center justify-center text-sm opacity-50">
 No similarity data available.
 </div>
 {/if}
</div>
