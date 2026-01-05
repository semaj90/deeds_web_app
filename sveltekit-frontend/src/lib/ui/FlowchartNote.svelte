<script lang="ts">
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children: children }: Props = $props();
</script>

<div class="p-4 border-2 border-ink bg-white font-serif text-sm rounded-lg shadow-lg rotate-[-1deg] relative">
 <!-- Tape effect -->
 <div class="absolute -top-2 left-1/2 transform -translate-x-1/2 w-8 h-4 bg-yellow-300 rounded-t-full"></div>
 <div class="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-8 h-4 bg-yellow-300 rounded-b-full"></div>
 {@render children?.()}
</div>
