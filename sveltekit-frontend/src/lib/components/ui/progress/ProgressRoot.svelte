<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		value?: number;
		max?: number;
		class?: string;
		children: Snippet;
	}

	let {
		value = 0,
		max = 100,
		class: className = '',
		children
	}: Props = $props();
</script>

<div
	role="progressbar"
	aria-valuenow={value}
	aria-valuemin={0}
	aria-valuemax={max}
	class="relative h-4 w-full overflow-hidden rounded-full bg-secondary {className}"
	data-value={value}
	data-max={max}
>
	{@render children()}
</div>
