<script lang="ts">
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children: children }: Props = $props();
</script>

<div class="panel p-4">
 {@render children?.()}
</div>
