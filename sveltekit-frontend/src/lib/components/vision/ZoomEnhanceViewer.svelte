<script lang="ts">
 interface Props {
 zoomSrc?: string | null;
 }

 let { zoomSrc = $bindable(null) }: Props = $props();

 let enhanced = $state(false);

 function toggleEnhance() {
 enhanced = !enhanced;
 }
</script>

<div class="border-2 border-black bg-[#eaddb4] h-full p-3 flex flex-col">
 <h2 class="font-bold mb-2">Inspector</h2>

 {#if zoomSrc}
 <div class="relative flex-1 flex items-center justify-center border border-black bg-white overflow-hidden">
 <img
 src={zoomSrc}
 alt="zoom"
 class="max-h-full max-w-full transition-all duration-300 object-contain"
 style="
 filter: {enhanced ? 'contrast(1.4) saturate(1.2) brightness(1.1)' : 'none'};
 image-rendering: {enhanced ? 'auto' : 'auto'};
 "
 />

 {#if enhanced}
 <div class="absolute top-2 right-2 bg-warning text-black px-2 py-1 text-xs font-bold rounded">
 ENHANCED
 </div>
 {/if}
 </div>

 <div class="mt-3 flex gap-3">
 <button
 onclick={toggleEnhance}
 class="px-3 py-1 border border-black bg-warning/10 hover:bg-warning/60 transition-colors"
 >
 {enhanced ? 'Remove Enhance' : 'Enhance'}
 </button>
 </div>
 {:else}
 <div class="flex-1 flex items-center justify-center text-sm opacity-50 border border-black bg-white">
 Select an image or frame to inspect.
 </div>
 {/if}
</div>


