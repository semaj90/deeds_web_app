<script lang="ts">
	import { Dialog } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { castCards, proposalForCard } from '$lib/courtroom/courtroom-cast-v1.js';

	let {
		open = $bindable(false),
		proposal = null
	}: {
		open?: boolean;
		proposal?: { actorId: string; text: string; intent: string; evidenceIds: readonly string[]; modelRevision: string } | null;
	} = $props();

	const cards = castCards();
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/70" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(46rem,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border-2 border-[#bad0ff]/30 border-t-[#f3d471]/70 p-4 text-[#e7efff] border-[#bad0ff]/22 bg-linear-to-br from-[#141d30]/85 to-[#0a0d1b]/80 backdrop-blur-md shadow-[0_10px_28px_rgba(0,0,0,0.4),0_0_24px_rgba(120,160,255,0.08)]"
		>
			<div class="mb-3 flex items-center justify-between gap-3 border-b border-[#bad0ff]/25 pb-2">
				<div>
					<Dialog.Title class="text-sm font-bold uppercase tracking-widest text-[#f3d471]">In the room</Dialog.Title>
					<Dialog.Description class="text-[0.65rem] uppercase tracking-wider text-zinc-400">
						Seats on the courtroom floor plan. Cell is column, row on the 0.5 m grid.
					</Dialog.Description>
				</div>
				<Dialog.Close
					aria-label="Close"
					class="!rounded-none border-2 border-white px-2 py-1 text-xs uppercase hover:bg-white hover:text-black focus-visible:outline-2 focus-visible:outline-yorha-accent"
				>
					Close
				</Dialog.Close>
			</div>

			<ul class="grid gap-3 sm:grid-cols-2">
				{#each cards as card (card.id)}
					<li
						class="border-2 bg-[#0a1526]/70 p-3 {card.you ? 'border-[#f3d471] shadow-[0_0_14px_rgba(243,212,113,0.25)]' : card.inScene ? 'border-[#bad0ff]/40' : 'border-dashed border-[#bad0ff]/25'}"
					>
						<div class="flex items-start gap-3">
							<div class="grid size-12 shrink-0 place-items-center border-2 border-[#bad0ff]/40 bg-[#0a0d1b] text-[#c2aaff]">
								<Icon name={card.icon} size={28} />
							</div>
							<div class="min-w-0">
								<h3 class="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider">
									{card.title}
									{#if card.you}<span class="bg-[#f3d471] px-1 text-[0.55rem] text-black">YOU</span>{/if}
									{#if !card.inScene}<span class="border border-white/40 px-1 text-[0.55rem] text-zinc-400">NOT IN SCENE YET</span>{/if}
								</h3>
								<p class="mt-1 text-[0.7rem] leading-snug text-zinc-300">{card.blurb}</p>
							</div>
						</div>
						<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-2 border-t-2 border-white/20 pt-2 text-[0.6rem] uppercase tracking-wider text-zinc-400">
							<dt>Seat</dt>
							<dd class="normal-case text-zinc-200">{card.where}</dd>
							<dt>Cell</dt>
							<dd class="font-mono text-zinc-200">{card.cell.col}, {card.cell.row}</dd>
						</dl>
						{#if proposalForCard(proposal, card.id)}
							{@const pc = proposalForCard(proposal, card.id)}
							<div class="mt-2 border-2 border-dashed border-yorha-accent p-2 text-[0.65rem] leading-snug" data-testid="cast-proposal">
								<p class="uppercase tracking-wider text-yorha-accent">Suggested line (not played)</p>
								<p class="mt-1 normal-case text-zinc-100">{pc?.text}</p>
								<p class="mt-1 font-mono text-[0.55rem] text-zinc-400">{pc?.intent} | {pc?.evidenceCount} evidence | {pc?.modelRevision}</p>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
