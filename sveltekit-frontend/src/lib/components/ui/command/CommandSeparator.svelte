<script lang="ts">
	import type { CommandSeparatorProps } from './types';

	interface Props extends CommandSeparatorProps {}

	let {
		class: className = '',
	}: Props = $props();
</script>

<div class="cmd-sep {className}" role="separator"></div>

<style>
	.cmd-sep {
		margin: 0.25rem 0;
		height: 1px;
		background: rgba(212, 199, 163, 0.08);
	}
</style>