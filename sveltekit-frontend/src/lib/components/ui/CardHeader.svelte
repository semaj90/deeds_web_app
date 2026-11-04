<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children, class: className = '' } = $props<{ children: Snippet; class?: string }>();
</script>

<div class="flex flex-col space-y-1.5 p-6 {className}">
	{@render children?.()}
</div>


