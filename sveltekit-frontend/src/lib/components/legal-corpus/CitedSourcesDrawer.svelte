<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { Dialog } from 'bits-ui';
	import { fly } from 'svelte/transition';

	interface Props {
		open: boolean;
		citedSources?: string[];
		citation?: string;
		statuteTitle?: string;
		sourceUrl?: string | null;
	}

	let {
		open = $bindable(false),
		citedSources = [],
		citation = '',
		statuteTitle = '',
		sourceUrl = null,
	}: Props = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
		<Dialog.Content class="fixed right-0 top-0 z-50 h-full w-[380px] max-w-[90vw] overflow-y-auto" >
			<div class="h-full bg-panel/95 backdrop-blur-xl border-l border-white/10 p-5" transition:fly={{ x: 380, duration: 250 }}>
				<!-- Header -->
				<div class="flex items-center justify-between mb-5">
					<h2 class="text-sm font-semibold text-white/85 flex items-center gap-2">
						<Icon name="bookmark" size={15} />
						Cited Sources
					</h2>
					<Dialog.Close class="p-1 rounded hover:bg-white/8 text-white/50 hover:text-white/80 transition-colors">
						<Icon name="x" size={16} />
					</Dialog.Close>
				</div>

				<!-- Primary Citation -->
				{#if citation}
					<div class="glass-soft p-3 mb-4">
						<div class="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-1">Primary Citation</div>
						<div class="text-sm text-orange-300/90 font-mono">{citation}</div>
						{#if sourceUrl}
							<a href={sourceUrl} target="_blank" rel="noopener noreferrer"
								class="inline-flex items-center gap-1 mt-2 text-xs text-orange-400/70 hover:text-orange-300 no-underline">
								<Icon name="external-link" size={11} />
								View Official Source
							</a>
						{/if}
					</div>
				{/if}

				<!-- Sources List -->
				{#if citedSources.length > 0}
					<div class="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-2">
						Referenced Sources ({citedSources.length})
					</div>
					<div class="flex flex-col gap-2">
						{#each citedSources as source, i}
							<div class="glass-soft p-3 flex gap-3 items-start">
								<span class="shrink-0 w-5 h-5 rounded-full bg-orange-400/15 text-orange-300 text-[10px] flex items-center justify-center font-bold">
									{i + 1}
								</span>
								<span class="text-xs text-white/70 leading-relaxed">{source}</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="text-center py-8 text-white/30 text-xs">
						<Icon name="sparkles" size={20} />
						<p class="mt-2">Run AI Analysis to extract cited sources.</p>
					</div>
				{/if}

				<!-- Disclaimer -->
				<div class="mt-5 pt-3 border-t border-white/6 text-[10px] text-white/25 leading-relaxed">
					Sources extracted by AI from {statuteTitle || 'this statute'}. Always verify citations against official publications.
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>