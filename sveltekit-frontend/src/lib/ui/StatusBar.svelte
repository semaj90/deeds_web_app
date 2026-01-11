<script lang="ts">
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="flex items-center gap-4 bg-ink text-neon font-mono text-sm p-3 border-b border-frame/20">
 {@render children?.()}
</div>

