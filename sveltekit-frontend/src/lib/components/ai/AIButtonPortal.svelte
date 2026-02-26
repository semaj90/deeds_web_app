<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
		show?: boolean;
		label?: string;
		onclick?: () => void;
	}

	let {
		position = 'bottom-right',
		show = true,
		label = 'AI Assistant',
		onclick
	}: Props = $props();
</script>

{#if show}
	<div
		class="fixed z-1000 pointer-events-auto"
		class:right-6={position === 'bottom-right' || position === 'top-right'}
		class:left-6={position === 'bottom-left' || position === 'top-left'}
		class:bottom-6={position === 'bottom-right' || position === 'bottom-left'}
		class:top-6={position === 'top-right' || position === 'top-left'}
	>
		<button
			class="flex items-center justify-center w-14 h-14 rounded-full border border-sand-dark bg-panel-soft text-accent cursor-pointer shadow-lg transition-transform hover:scale-110 hover:shadow-xl"
			onclick={() => onclick?.()}
			aria-label={label}
			title={label}
		>
			<Icon name="bot" size={22} />
		</button>
	</div>
{/if}
