<script lang="ts">
	import { evidenceCommandCenter } from '$lib/stores/evidenceCommandCenter.store.svelte';

	interface EvidenceRow {
		id: string;
		file_name?: string | null;
		evidence_type?: string | null;
		uploaded_at?: string | null;
		ai_summary?: string | null;
		ai_tags?: string[];
		tags?: string[];
		file_url?: string | null;
	}

	interface Props {
		evidenceRows?: EvidenceRow[];
		caseId: string;
	}

	const { evidenceRows = [], caseId }: Props = $props();

	const toggleEvidenceSelection = (id: string) => {
		evidenceCommandCenter.toggleEvidenceSelection(id);
	};
</script>

<div class="flex flex-col gap-3 h-full">
	<div class="flex-1 flex flex-col gap-2 overflow-hidden">
		<div class="flex items-center justify-between text-[11px] mb-1">
			<div class="uppercase tracking-[0.15em] text-[#ffdf6b]">
				Evidence Board
			</div>
			<div class="text-[10px] text-[#aaa]">
				Total: {evidenceRows.length}
			</div>
		</div>

		<div class="flex-1 overflow-auto pr-1">
			{#if evidenceRows.length === 0}
				<p class="text-[11px] text-[#ccc] italic">
					No evidence yet. Upload evidence from the upload page.
				</p>
			{:else}
				<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
					{#each evidenceRows as ev}
						<div
							class="group flex flex-col gap-1 p-2 rounded border border-[#f5f5f5] bg-[#101018] hover:bg-[#202030] cursor-pointer"
							role="button"
							tabindex="0"
							onclick={() => toggleEvidenceSelection(ev.id)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									toggleEvidenceSelection(ev.id);
								}
							}}
						>
							<div class="flex items-start justify-between gap-1">
								<div class="flex items-start gap-2">
									<input
										type="checkbox"
										checked={evidenceCommandCenter.selectedEvidenceIds.has(ev.id)}
										class="mt-[2px] h-3 w-3"
										tabindex="-1"
									/>
									<div>
										<div class="text-[11px] font-semibold line-clamp-2">
											{ev.file_name ?? 'Untitled evidence'}
										</div>
										<div class="text-[9px] uppercase tracking-[0.15em] text-[#ffdf6b]">
											{ev.evidence_type ?? 'unspecified'}
										</div>
									</div>
								</div>
								<div class="text-[9px] text-[#aaa]">
									{#if ev.uploaded_at}
										{new Date(ev.uploaded_at).toLocaleDateString()}
									{/if}
								</div>
							</div>

							{#if ev.ai_summary}
								<p class="text-[10px] text-[#b5ff6b] line-clamp-3">
									{ev.ai_summary}
								</p>
							{/if}

							{#if ev.ai_tags?.length}
								<div class="flex flex-wrap gap-1 mt-1">
									{#each ev.ai_tags as tag}
										<span class="text-[9px] px-1 py-[1px] rounded bg-[#262636] text-[#b5ff6b]">
											#{tag}
										</span>
									{/each}
								</div>
							{:else if ev.tags?.length}
								<div class="flex flex-wrap gap-1 mt-1">
									{#each ev.tags as tag}
										<span class="text-[9px] px-1 py-[1px] rounded bg-[#262636] text-[#eee]">
											#{tag}
										</span>
									{/each}
								</div>
							{/if}

							{#if ev.file_url}
								<a
									href={ev.file_url}
									target="_blank"
									rel="noreferrer"
									class="mt-1 text-[9px] text-[#6bffdf] underline underline-offset-2"
								>
									View file
								</a>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
