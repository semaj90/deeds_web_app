<script lang="ts">
	const { data }: { data: any } = $props();
	const caseData = $derived(data?.caseData);
	const evidence = $derived(data?.evidence);
</script>

<section class="p-4 space-y-4">
	<div class="flex items-center justify-between gap-2">
		<h2 class="text-sm uppercase tracking-[0.25em] text-black/60">Evidence Canvas</h2>
		<button
			class="text-xs px-3 py-1 rounded-full border border-amber-400/60
 hover:bg-amber-400/10 transition-colors"
		>
			Auto-Arrange Nodes
		</button>
	</div>

	<div
		class="relative border border-slate-800 rounded-2xl bg-panel/60
 min-h-[420px] overflow-hidden"
	>
		<!-- Placeholder grid background -->
		<div class="pointer-events-none absolute inset-0 opacity-20">
			<div
				class="w-full h-full bg-[radial-gradient(circle _rgba(148 163 184 0.25)_1px _transparent_1px)] bg-[length 24px_24px]"
			></div>
		</div>

		<div class="relative p-4 flex flex-wrap gap-3">
			{#if evidence?.length}
				{#each evidence as item (item.id)}
					<div
						class="border border-black/20 rounded-xl /80
 px-3 py-2 max-w-xs text-xs text-black"
					>
						<div class="font-semibold truncate mb-1">
							{item.label ?? item.filename ?? `Evidence #${item.id}`}
						</div>
						<div class="line-clamp-3 text-black/60">
							{item.summary ?? item.description ?? 'No summary yet.'}
						</div>
					</div>
				{/each}
			{:else}
				<div class="text-xs text-black/60">
					No evidence linked to this case yet. Upload documents or photos to populate the canvas.
				</div>
			{/if}
		</div>
	</div>
</section>
