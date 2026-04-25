<script lang="ts">
	import type { ContextMenuSeparatorProps } from './types';

	interface Props extends ContextMenuSeparatorProps {}

	let {
		class: className = '',
	}: Props = $props();
</script>

<div class="ctx-sep {className}" role="separator"></div>

<style>
	.ctx-sep {
		margin: 0.25rem -0.375rem;
		height: 1px;
		background: rgba(212, 199, 163, 0.08);
	}
</style>