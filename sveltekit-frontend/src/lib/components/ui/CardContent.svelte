<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children, class: className = '' } = $props<{ children: Snippet; class?: string }>();
</script>

<div class="p-6 pt-0 {className}">
	{@render children?.()}
</div>


