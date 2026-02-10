<script lang="ts">
	let thumb = $state<any>(undefined);
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
 <div
 class="cursor-pointer hover:scale-105 transition-transform border border-black bg-[#fff] aspect-square"
 onclick={() => choose(thumb)}
 >
 <img
 src={thumb}
 alt="thumb"
 class="w-full h-full object-cover"
 />
 </div>
 {/each}
</div>

