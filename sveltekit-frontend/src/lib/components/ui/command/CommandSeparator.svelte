<script lang="ts">
	import type { CommandSeparatorProps } from './types';

	interface Props extends CommandSeparatorProps {}

	let {
		class: className = '',
	}: Props = $props();

	const defaultClass = `
		-mx-1 h-px bg-border
	`.replace(/\s+/g, ' ').trim();
</script>

<div class="{defaultClass} {className}" role="separator"></div>
