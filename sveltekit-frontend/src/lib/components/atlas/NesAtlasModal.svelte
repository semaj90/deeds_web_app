<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { AtlasCardDetail } from '$lib/types/atlas.js';

	interface Props {
		cardId: string | null;
		onclose?: () => void;
	}

	const { cardId, onclose }: Props = $props();

	// ── State ──────────────────────────────────────────────────────────────────
	let detail = $state<AtlasCardDetail | null>(null);
	let similar = $state<unknown[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// ── Fetch when cardId changes ──────────────────────────────────────────────
	$effect(() => {
		if (!cardId) {
			detail = null;
			similar = [];
			error = null;
			return;
		}
		loading = true;
		error = null;

		fetch(`/api/atlas/cards/${encodeURIComponent(cardId)}`)
			.then((r) => r.json())
			.then((data) => {
				if (data.ok) {
					detail = data.card as AtlasCardDetail;
					similar = data.similarCards ?? [];
				} else {
					error = data.error ?? 'Unknown error';
				}
			})
			.catch((e) => {
				error = e instanceof Error ? e.message : String(e);
			})
			.finally(() => {
				loading = false;
			});
	});

	function handleOpenChange(open: boolean) {
		if (!open) {
			onclose?.();
		}
	}
</script>

<Dialog.Root open={!!cardId} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay class="modal-backdrop fixed inset-0 z-[9990] bg-black/80 backdrop-blur-sm transition-opacity" />
		<Dialog.Content
			class="nes-modal fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9991] w-full max-w-[680px] max-h-[85vh] overflow-y-auto bg-[#0f172a] border-4 border-[#4ade80] shadow-[8px_8px_0_#166534] p-0 font-mono text-neutral-100 focus:outline-none"
		>
			<header class="nes-modal__header sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[#0a1628] border-b-2 border-[#1e3a2f]">
				<Dialog.Title class="nes-modal__title font-['Press_Start_2P',monospace] text-[0.7rem] text-[#4ade80] flex items-center gap-2">
					{#if detail}
						<span>{detail.kind === 'rag' ? '📄' : '🗂'}</span>
						<span>{detail.title ?? cardId}</span>
					{:else}
						Loading…
					{/if}
				</Dialog.Title>
				<Dialog.Close
					class="nes-modal__close bg-transparent border-2 border-[#4ade80] text-[#4ade80] hover:bg-[#166534] px-2 py-0.5 text-xs font-bold transition-colors cursor-pointer select-none focus:outline-none"
					aria-label="Close modal"
				>
					✕
				</Dialog.Close>
			</header>

			<div class="nes-modal__body p-4 sm:p-5">
				{#if loading}
					<div class="nes-modal__spinner font-mono text-[#94a3b8] text-sm py-4">
						<span class="blink">█</span> Loading card data…
					</div>
				{:else if error}
					<p class="nes-modal__error text-rose-400 font-mono text-sm">⚠ {error}</p>
				{:else if detail}
					<dl class="nes-modal__meta grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs mb-4">
						<dt class="font-['Press_Start_2P',monospace] text-[0.55rem] text-[#64748b] self-center">Feature</dt>
						<dd class="text-[#e2e8f0]">{detail.featureLabel}</dd>
						{#if detail.filePath}
							<dt class="font-['Press_Start_2P',monospace] text-[0.55rem] text-[#64748b] self-center">Path</dt>
							<dd class="mono text-xs text-neutral-300 break-all">{detail.filePath}</dd>
						{/if}
						{#if detail.clusterId !== undefined}
							<dt class="font-['Press_Start_2P',monospace] text-[0.55rem] text-[#64748b] self-center">Cluster</dt>
							<dd class="text-[#e2e8f0]">#{detail.clusterId} — {detail.centroidLabel}</dd>
						{/if}
						<dt class="font-['Press_Start_2P',monospace] text-[0.55rem] text-[#64748b] self-center">Created</dt>
						<dd class="text-[#e2e8f0]">{new Date(detail.createdAt).toLocaleDateString()}</dd>
					</dl>

					<section class="nes-modal__section mt-4 pt-3 border-t border-[#1e293b]">
						<h4 class="font-['Press_Start_2P',monospace] text-[0.6rem] text-[#4ade80] mb-2">Summary</h4>
						<p class="text-sm text-[#cbd5e1] leading-relaxed">{detail.summary}</p>
					</section>

					{#if detail.tags?.length || detail.topTags?.length}
						<section class="nes-modal__section mt-4 pt-3 border-t border-[#1e293b]">
							<h4 class="font-['Press_Start_2P',monospace] text-[0.6rem] text-[#4ade80] mb-2">Tags</h4>
							<div class="tag-row flex flex-wrap gap-1.5">
								{#each (detail.tags ?? detail.topTags ?? []) as tag (tag)}
									<span class="nes-tag font-mono text-xs bg-[#0f172a] border border-[#334155] text-[#7dd3fc] px-1.5 py-0.5">{tag}</span>
								{/each}
							</div>
						</section>
					{/if}

					{#if similar.length}
						<section class="nes-modal__section mt-4 pt-3 border-t border-[#1e293b]">
							<h4 class="font-['Press_Start_2P',monospace] text-[0.6rem] text-[#4ade80] mb-2">Similar (Qdrant)</h4>
							<ul class="similar-list list-none p-0 m-0 space-y-1.5">
								{#each similar as item, i (i)}
									<li class="similar-item font-mono text-xs text-[#94a3b8] border-l-2 border-[#334155] pl-2">{JSON.stringify(item).slice(0, 120)}…</li>
								{/each}
							</ul>
						</section>
					{/if}
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	@keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}

	.blink { animation: blink 1s step-start infinite; }
</style>
