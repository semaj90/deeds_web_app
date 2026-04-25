<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	let {
		loading = false,
		disabled = false,
		children,
		class: className,
		...rest
	}: {
		loading?: boolean;
		disabled?: boolean;
		children?: any;
		class?: string;
		[key: string]: any;
	} = $props();
</script>

<Button disabled={loading || disabled} class={className} {...rest}>
	{#if loading}
		<span class="i-lucide-loader-2 mr-2 h-4 w-4 animate-spin inline-block"></span>
	{/if}
	{@render children?.()}
</Button>

