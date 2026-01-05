<script lang="ts">
	import { Tooltip } from 'bits-ui';
	import { fade } from 'svelte/transition';

	let {
		content = '',
		placement = 'top' as 'top' | 'bottom' | 'left' | 'right',
		children
	} = $props<{
		content?: string;
		placement?: 'top' | 'bottom' | 'left' | 'right';
		children?: import('svelte').Snippet;
	}>();
</script>

<Tooltip.Root delayDuration={400}>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<div {...props} class="tooltip-trigger-wrapper">
				{@render children?.()}
			</div>
		{/snippet}
	</Tooltip.Trigger>

	<Tooltip.Portal>
		<Tooltip.Content
			side={placement}
			sideOffset={8}
			class="z-50 overflow-hidden rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white shadow-md"
			transition={fade}
			transitionConfig={{ duration: 150 }}
		>
			{content}
			<Tooltip.Arrow class="fill-gray-900" />
		</Tooltip.Content>
	</Tooltip.Portal>
</Tooltip.Root>

<style>
	.tooltip-trigger-wrapper {
		display: inline-block;
	}
</style>
