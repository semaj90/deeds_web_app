<script lang="ts">
	let className = $state<any>(undefined);

	import type { SelectSeparatorProps } from './types';

	let {
		class: className = '',
	}: SelectSeparatorProps = $props();
</script>

<div
	role="separator"
	class="-mx-1 my-1 h-px bg-muted {className}"
></div>
