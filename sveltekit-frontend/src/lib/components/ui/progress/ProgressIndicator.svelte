<script lang="ts">
	interface Props {
		value?: number;
		class?: string;
	}

	let {
		value = 0,
		class: className = ''
	}: Props = $props();

	const percentage = $derived(Math.min(Math.max(value, 0), 100));
</script>

<div
	class="h-full w-full flex-1 bg-primary transition-all {className}"
	style="transform: translateX(-{100 - percentage}%)"
></div>