<script lang="ts">
	let className = $state<any>(undefined);

	import type { DropdownMenuSeparatorProps } from './types';

	let {
		class: className = '',
	}: DropdownMenuSeparatorProps = $props();
</script>

<div
	role="separator"
	class="-mx-1 my-1 h-px bg-muted {className}"
></div>
