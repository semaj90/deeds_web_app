<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		messageIndex: number;
		source?: string;
		onfeedback: (index: number, helpful: boolean) => void;
	}

	let { messageIndex, source = 'unknown', onfeedback }: Props = $props();

	let selected = $state<'up' | 'down' | null>(null);

	function rate(helpful: boolean) {
		const value = helpful ? 'up' : 'down';
		if (selected === value) return; // Already rated
		selected = value;
		onfeedback(messageIndex, helpful);
	}
</script>

<span class="inline-flex items-center gap-0.5 ml-1">
	<button
		class="p-0.5 rounded bg-transparent border-none cursor-pointer transition-opacity"
		class:opacity-100={selected === 'up'}
		class:opacity-30={selected !== 'up'}
		onclick={() => rate(true)}
		title="Helpful"
		disabled={selected !== null}
	>
		<Icon name="thumbs-up" size={10} />
	</button>
	<button
		class="p-0.5 rounded bg-transparent border-none cursor-pointer transition-opacity"
		class:opacity-100={selected === 'down'}
		class:opacity-30={selected !== 'down'}
		onclick={() => rate(false)}
		title="Not helpful"
		disabled={selected !== null}
	>
		<Icon name="thumbs-down" size={10} />
	</button>
	{#if selected}
		<span class="text-[9px] opacity-40 ml-0.5">
			{selected === 'up' ? 'Thanks!' : 'Noted'}
		</span>
	{/if}
</span>
