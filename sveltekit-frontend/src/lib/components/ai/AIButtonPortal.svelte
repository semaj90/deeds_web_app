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
	<div class="ai-portal" data-position={position}>
		<button
			class="ai-portal-btn"
			onclick={() => onclick?.()}
			aria-label={label}
			title={label}
		>
			<Icon name="bot" size={22} />
		</button>
	</div>
{/if}

<style>
	.ai-portal {
		position: fixed;
		z-index: 1000;
		pointer-events: auto;
	}
	[data-position='bottom-right'] {
		right: 1.5rem;
		bottom: 1.5rem;
	}
	[data-position='bottom-left'] {
		left: 1.5rem;
		bottom: 1.5rem;
	}
	[data-position='top-right'] {
		right: 1.5rem;
		top: 1.5rem;
	}
	[data-position='top-left'] {
		left: 1.5rem;
		top: 1.5rem;
	}
	.ai-portal-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 50%;
		border: 1px solid var(--color-sand-dark, #44403c);
		background: var(--color-panel-soft, #1c1917);
		color: var(--color-accent, #a51c30);
		cursor: pointer;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		transition: transform 0.2s, box-shadow 0.2s;
	}
	.ai-portal-btn:hover {
		transform: scale(1.08);
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
	}
</style>
