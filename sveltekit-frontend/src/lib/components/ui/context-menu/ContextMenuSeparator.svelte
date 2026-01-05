<script lang="ts">
	let className = $state<any>(undefined);

	import type { ContextMenuSeparatorProps } from './types';

	interface Props extends ContextMenuSeparatorProps {}

	let {
		class: className = '',
	}: Props = $props();

	const defaultClass = `
		-mx-1 my-1 h-px bg-muted
	`.replace(/\s+/g, ' ').trim();
</script>

<div class="{defaultClass} {className}" role="separator"></div>
