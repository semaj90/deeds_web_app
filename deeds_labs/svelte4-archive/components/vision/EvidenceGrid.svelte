<script lang="ts">
interface Props {
  onselect?: (...args: any[]) => void;
 selectedThumbs?: string[];
 }

 let { selectedThumbs = $bindable([]) , onselect }: Props = $props();

 function choose(src: string) {
 	onselect?.({ src, string: '' });
 }
</script>

<div class="grid grid-cols-3 gap-2 overflow-auto h-full p-2 border border-black">
 {#each selectedThumbs as thumb}
 <button
 type="button"
 class="cursor-pointer hover:scale-105 transition-transform border border-black bg-[#fff] aspect-square p-0"
 onclick={() => choose(thumb)}
 >
 <img
 src={thumb}
 alt="thumb"
 class="w-full h-full object-cover"
 />
 </button>
 {/each}
</div>

