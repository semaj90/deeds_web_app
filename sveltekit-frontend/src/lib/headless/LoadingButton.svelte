<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import Loader2 from '@lucide/svelte/icons/loader-2';

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
		<Loader2 class="mr-2 h-4 w-4 animate-spin" />
	{/if}
	{@render children?.()}
</Button>


