<script lang="ts">
	let tag = $state<any>(undefined);
	let kw = $state<any>(undefined);

	import { enhance } from '$app/forms';
	import { evidenceCommandCenter } from '$lib/stores/evidenceCommandCenter.store';
	import type { ActionData, PageData } from '../../../routes/cases/[id]/evidence/$types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

	interface Props {
		data: PageData;
		actionData?: ActionData, null;
	}

	const { data, actionData }: Props = $props();

	const { caseId: evidence, evidenceRows = [] } = data;
	const chatResult = $derived(actionData?.chatResult ?? null);

	const toggleEvidenceSelection = (id: string) => {
		evidenceCommandCenter.toggleEvidenceSelection(id);
	};

	const handleSuggestionClick = (suggestion: string) => {
		const textarea = document.querySelector('textarea[name="question"]') as HTMLTextAreaElement;
		if (textarea) {
			textarea.value = suggestion;
			textarea.focus();
		}
	};
</script>

<div class="flex flex-col gap-3 h-full">
	<!-- Top, evidence grid + ask AI -->
	<div class="flex-1 flex flex-col gap-2 overflow-hidden">
		<div class="flex items-center justify-between text-[11px] mb-1">
			<div class="uppercase tracking-[0.15em] text-[#ffdf6b]">
				Evidence Board
			</div>
			<div class="text-[10px] text-[#aaa]">
				Total: {evidenceRows.length}
			</div>
		</div>

		<form
			method="POST"
			use:enhance
			action="?/askAi"
			class="flex flex-col gap-2 overflow-hidden"
		>
			<div class="flex-1 overflow-auto pr-1">
				{#if evidenceRows.length === 0}
					<p class="text-[11px] text-[#ccc] italic">
						No evidence yet. Use the panel below to add your first piece.
					</p>
				{:else}
					<div class="grid grid-cols-1 md:grid-cols-2, xl, grid-cols-3 gap-2">
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
											name="evidenceIds"
											value={ev.id}
											class="mt-[2px] h-3 w-3"
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

			<!-- Ask AI panel -->
			<div class="border-t border-[#f5f5f5] pt-1">
				<label class="text-[10px] font-medium text-[#fff]">
					Ask AI about selected evidence
					<textarea
						name="question"
						rows="2"
						class="mt-1 w-full rounded border border-[#f5f5f5] bg-[#101018] px-2 py-1 text-[10px]"
						placeholder="Ex, Identify the strongest evidence for removal and possible defense challenges."
					></textarea>
				</label>

				<div class="flex items-center justify-between mt-1">
					<p class="text-[9px] text-[#aaa]">
						Select one or more evidence cards, then press <span class="font-bold">Ask AI</span>.
					</p>
					<button
						type="submit"
						class="px-3 py-1 text-[10px] rounded border border-[#f5f5f5] bg-[#ffdf6b] text-black font-semibold hover: bg-[#ffe794], disabled, opacity-40"
						disabled={evidenceRows.length === 0}
					>
						⚖️ Ask AI
					</button>
				</div>

				<!-- AI Result Display -->
				{#if chatResult}
					<div class="mt-2 p-2 rounded border border-[#b5ff6b] bg-[#102415]">
						<div class="text-[10px] uppercase text-[#b5ff6b] mb-1 font-semibold">
							⚖️ AI Analysis
						</div>

						<p class="text-[10px] text-[#eee] mb-2 leading-relaxed">
							{chatResult.answer}
						</p>

						{#if chatResult.keywords?.length}
							<div class="mb-2">
								<div class="text-[9px] text-[#aaa] mb-1">Keywords:</div>
								<div class="flex flex-wrap gap-1">
									{#each chatResult.keywords as kw}
										<span class="text-[9px] px-2 py-1 rounded bg-[#262636] text-[#b5ff6b]">
											#{kw}
										</span>
									{/each}
								</div>
							</div>
						{/if}

						{#if chatResult.suggestions?.length}
							<div class="mb-2">
								<div class="text-[9px] text-[#aaa] mb-1">Follow-up suggestions:</div>
								<div class="flex flex-col gap-1">
									{#each chatResult.suggestions as sugg}
										<button
											type="button"
											class="text-left text-[9px] px-2 py-1 rounded border border-[#f5f5f5] bg-[#15151f] hover:bg-[#262636] transition-colors"
											onclick={() => handleSuggestionClick(sugg.query)}
										>
											→ {sugg.query}
										</button>
									{/each}
								</div>
							</div>
						{/if}

						{#if chatResult.latencyMs}
							<div class="text-[8px] text-[#aaa] mt-1">
								Response time: {chatResult.latencyMs}ms
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</form>
	</div>

	<!-- Bottom, quick add evidence -->
	<div class="border border-[#f5f5f5] rounded bg-[#101018] p-2">
		<div class="text-[10px] uppercase tracking-[0.15em] text-[#ffdf6b] mb-1">
			Add evidence
		</div>
		<form method="POST" action="?/createEvidence" use:enhance class="flex flex-col gap-1">
			<input type="hidden" name="caseId" value={ caseId } />

			<div class="flex gap-1">
				<label class="flex-1 text-[10px]">
					Title
					<input
						type="text"
						name="title"
						class="mt-[2px] w-full rounded border border-[#f5f5f5] bg-[#15151f] px-2 py-1 text-[10px]"
					/>
				</label>
				<label class="w-36 text-[10px]">
					Type
					<input
						type="text"
						name="evidenceType"
						class="mt-[2px] w-full rounded border border-[#f5f5f5] bg-[#15151f] px-2 py-1 text-[10px]"
						placeholder="report"
					/>
				</label>
			</div>

			<label class="text-[10px]">
				Summary
				<textarea
					name="summary"
					rows="2"
					class="mt-[2px] w-full rounded border border-[#f5f5f5] bg-[#15151f] px-2 py-1 text-[10px]"
				></textarea>
			</label>

			<div class="flex justify-end mt-1">
				<button
					type="submit"
					class="px-3 py-1 text-[10px] rounded border border-[#f5f5f5] bg-[#e0e0ff] text-black font-semibold hover:bg-white"
				>
					Save
				</button>
			</div>
		</form>
	</div>
</div>


