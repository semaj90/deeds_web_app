<script lang="ts">
 let { nodes, viewport } = $props();
</script>

<div class="fixed bottom-4 right-4 w-48 h-48 bg-gray-900 border border-cyan-400 p-1 opacity-90">
 <svg width="100%" height="100%">
 {#each nodes as n}
 <circle cx={n.x} cy={n.y} r="2" fill="#67e8f9"/>
 {/each}

 <!-- viewport frame -->
 <rect
 x={viewport.x} y={viewport.y}
 width={viewport.w} height={viewport.h}
 fill="none" stroke="#ffe066" stroke-width="2"
 />
 </svg>
</div>


