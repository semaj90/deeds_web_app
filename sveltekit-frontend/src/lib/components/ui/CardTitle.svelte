<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children, class: className = '' } = $props<{ children: Snippet; class?: string }>();
</script>

<h3 class="text-2xl font-semibold leading-none tracking-tight {className}">
	{@render children?.()}
</h3>


