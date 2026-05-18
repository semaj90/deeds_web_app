<script lang="ts">
	let { refs }: { refs: string[] } = $props();

	let copied = $state<string | null>(null);

	async function copy(ref: string) {
		try {
			await navigator.clipboard.writeText(ref);
			copied = ref;
			setTimeout(() => {
				if (copied === ref) copied = null;
			}, 1500);
		} catch {
			/* clipboard unavailable */
		}
	}

	function icon(ref: string): string {
		if (ref.endsWith('.svelte')) return '⬡';
		if (ref.endsWith('.ts') || ref.endsWith('.js')) return '⚙';
		if (ref.endsWith('.md')) return '📄';
		if (ref.startsWith('http')) return '🌐';
		return '▸';
	}
</script>

<div class="flex flex-col gap-0.5 px-3 py-2">
	{#if refs.length === 0}
		<span class="text-sand-7 text-xs">No source refs</span>
	{:else}
		<div class="text-[10px] text-sand-7 mb-1">
			{refs.length} source {refs.length === 1 ? 'ref' : 'refs'}
		</div>
		{#each refs as ref}
			<div class="flex items-center gap-1.5 group">
				<span class="text-sand-7 text-xs flex-shrink-0">{icon(ref)}</span>
				<span
					class="flex-1 font-mono text-[10px] text-sand-9 truncate"
					title={ref}
				>{ref}</span>
				<button
					class="text-[9px] text-sand-7 opacity-0 group-hover:opacity-100
					       hover:text-accent transition-all flex-shrink-0"
					onclick={() => copy(ref)}
				>{copied === ref ? '✓' : 'copy'}</button>
			</div>
		{/each}
	{/if}
</div>