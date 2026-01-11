<script lang="ts">
	import ContextMenuSeparator from './ContextMenuSeparator.svelte';

	interface Props {
		[key: string]: any;
	}

	let { ...rest }: Props = $props();
</script>

<ContextMenuSeparator {...rest} />


