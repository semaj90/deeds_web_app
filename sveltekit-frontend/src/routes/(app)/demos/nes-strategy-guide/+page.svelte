<script lang="ts">
	import type { PageData } from './$types.js';
	import Icon from '$lib/components/ui/Icon.svelte';

	const { data }: { data: PageData } = $props();

	let selectedCard = $state<PageData['cards'][number] | null>(null);
	let proposalReceipt = $state<{ status: string; itemCount: number; cardId: string; payloadSha256: string } | null>(null);
	let proposalError = $state<string | null>(null);
	let proposalSubmitting = $state(false);
	let filteredCards = $derived(data.cards ?? []);
	let clusters = $derived(data.clusters ?? []);

	async function submitProposal(event: SubmitEvent) {
		event.preventDefault();
		proposalError = null;
		proposalReceipt = null;
		proposalSubmitting = true;
		try {
			const formData = new FormData(event.currentTarget as HTMLFormElement);
			const response = await fetch('/api/cartridge/upsert-receipt', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					schema: 'atlas.neschrom97.upsert-request.v1',
					items: [{ cardId: formData.get('cardId') }]
				})
			});
			const body: unknown = await response.json();
			if (!body || typeof body !== 'object') throw new Error('INVALID_RECEIPT_RESPONSE');
			const result = body as { error?: unknown; status?: unknown; receipt?: unknown };
			if (!response.ok || !result.receipt || typeof result.receipt !== 'object') {
				throw new Error(typeof result.error === 'string' ? result.error : 'RECEIPT_REQUEST_FAILED');
			}
			const receipt = result.receipt as { itemCount?: unknown; payloadSha256?: unknown; items?: unknown };
			const firstItem = Array.isArray(receipt.items) ? receipt.items[0] as { cardId?: unknown } | undefined : undefined;
			if (typeof result.status !== 'string' || typeof receipt.itemCount !== 'number' || typeof receipt.payloadSha256 !== 'string' || typeof firstItem?.cardId !== 'string') {
				throw new Error('INVALID_RECEIPT_RESPONSE');
			}
			proposalReceipt = { status: result.status, itemCount: receipt.itemCount, cardId: firstItem.cardId, payloadSha256: receipt.payloadSha256 };
		} catch (error) {
			proposalError = error instanceof Error ? error.message : 'RECEIPT_REQUEST_FAILED';
		} finally {
			proposalSubmitting = false;
		}
	}

	function metadataTilePixel(cardId: string, cluster: number | null, pixel: number) {
		let seed = (cluster ?? 0) + 0x9e3779b9;
		for (let index = 0; index < cardId.length; index++) seed = Math.imul(seed ^ cardId.charCodeAt(index), 0x45d9f3b);
		for (let index = 0; index <= pixel; index++) {
			seed ^= seed << 13;
			seed ^= seed >>> 17;
			seed ^= seed << 5;
		}
		return ['#141820', '#254b62', '#b4773e', '#e8ce85'][seed & 3];
	}
</script>

<svelte:head>
	<title>NES CHROM 97 Strategy Guide & Cartridge Registry</title>
</svelte:head>

<div class="strategy-guide-page p-6 max-w-7xl mx-auto">
	<header class="mb-6 border-b border-sand/20 pb-4">
		<div class="flex items-center gap-3 mb-2">
			<span class="text-3xl">🎮</span>
			<div>
				<h1 class="text-2xl font-bold tracking-tight">NES CHROM 97 Strategy Guide</h1>
				<p class="text-sm text-sand/70">
					{#if data.registryAvailable}
						Interactive {data.totalCards.toLocaleString()}-Card Registry Explorer, 8×8 Metadata Tile Matrix & Proposal Receipts
					{:else}
						Registry unavailable; live registry metrics and proposal receipts are disabled
					{/if}
				</p>
			</div>
		</div>

		{#if data.registryAvailable}
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs font-mono">
				<div class="p-3 bg-panel rounded border border-sand/20">
					<span class="text-sand/60">Total Registry Cards:</span>
					<div class="text-xl font-bold text-accent">{data.metadata?.card_store_size?.toLocaleString() ?? data.totalCards.toLocaleString()}</div>
				</div>
				<div class="p-3 bg-panel rounded border border-sand/20">
					<span class="text-sand/60">Mapped Primary Cards:</span>
					<div class="text-xl font-bold text-green-600">{data.metadata?.mapped_count ?? 'Not reported'}</div>
				</div>
				<div class="p-3 bg-panel rounded border border-sand/20">
					<span class="text-sand/60">Background CHR Tiles:</span>
					<div class="text-xl font-bold text-blue-600">{data.metadata?.unmapped_count?.toLocaleString() ?? 'Not reported'}</div>
					<div class="text-[10px] text-sand/50">unresolved legacy projections</div>
				</div>
				<div class="p-3 bg-panel rounded border border-sand/20">
					<span class="text-sand/60">Duplicate Anomalies:</span>
					<div class="text-xl font-bold text-amber-600">{data.metadata?.duplicate_cards ?? 'Not reported'}</div>
				</div>
			</div>
		{:else}
			<p class="mt-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm" role="status">
				Registry data could not be loaded. No card totals, mapping counts, or duplicate status are being inferred.
			</p>
		{/if}
	</header>

	<!-- Action Receipt Alert -->
	{#if proposalReceipt}
		<div class="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-700">
			<div class="font-bold flex items-center gap-2 mb-1">
				<Icon name="check-circle" size={16} /> Proposal receipt created ({proposalReceipt.status})
			</div>
				<div class="font-mono text-xs break-all">
				<strong>Card:</strong> {proposalReceipt.cardId} | <strong>Items:</strong> {proposalReceipt.itemCount} | <strong>Payload:</strong> {proposalReceipt.payloadSha256}
			</div>
		</div>
	{/if}
	{#if proposalError}<div class="mb-6 p-3 rounded border border-red-500/30 bg-red-500/10 text-sm" role="alert">Receipt refused: {proposalError}</div>{/if}

	<!-- Controls & Filters -->
	<form method="GET" class="controls bg-panel p-4 rounded-lg border border-sand/20 mb-6 flex flex-wrap gap-4 items-center">
		<div class="flex-1 min-w-[240px]">
			<input
				name="q"
				type="text"
				placeholder="Filter card ID, source ref, or tag..."
				value={data.query}
				class="w-full px-3 py-2 bg-sand/5 border border-sand/20 rounded text-sm font-mono"
			/>
		</div>

		<div class="flex items-center gap-2">
			<span class="text-xs font-semibold text-sand/60">Temp:</span>
			<select name="temperature" value={data.temperature} class="px-2.5 py-1 bg-sand/5 border border-sand/20 rounded text-xs font-mono">
				<option value="all">All</option><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option>
			</select>
		</div>

		<div class="flex items-center gap-2">
			<span class="text-xs font-semibold text-sand/60">SOM Cluster:</span>
			<select name="cluster" value={data.cluster} class="px-2.5 py-1 bg-sand/5 border border-sand/20 rounded text-xs font-mono">
				<option value="all">All Clusters</option>
				{#each clusters as cl}
					<option value={String(cl)}>Cluster #{cl}</option>
				{/each}
			</select>
		</div>
		<input type="hidden" name="page" value="1" />
		<button type="submit" class="px-3 py-2 rounded bg-accent text-white text-xs font-semibold">Search registry</button>
	</form>

	<!-- Cards & Retro Tile Layout -->
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Left: Interactive Card Registry Table -->
		<div class="lg:col-span-2 bg-panel rounded-lg border border-sand/20 p-4 overflow-hidden">
			<h2 class="text-base font-bold mb-3 flex items-center justify-between">
				<span>Registry Cards ({data.resultCount.toLocaleString()} matches)</span>
				<span class="text-xs font-normal text-sand/60">Page {data.page} / {data.pageCount}</span>
			</h2>

			<div class="overflow-x-auto max-h-[500px]">
				<table class="w-full text-xs text-left border-collapse">
					<thead>
						<tr class="border-b border-sand/20 font-mono text-sand/60">
							<th class="p-2">Tile Preview</th>
							<th class="p-2">Card ID</th>
							<th class="p-2">Cluster</th>
							<th class="p-2">Temp</th>
							<th class="p-2">Source Ref</th>
							<th class="p-2">Action</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-sand/10 font-mono">
						{#each filteredCards as card}
							{@const pixels = Array.from({ length: 64 }, (_, index) => metadataTilePixel(card.card_id, card.som_cluster, index))}
							<tr
								class="hover:bg-sand/5 cursor-pointer transition"
								class:bg-sand-10={selectedCard?.card_id === card.card_id}
								onclick={() => selectedCard = card}
							>
								<td class="p-2">
									<div class="grid grid-cols-8 w-8 h-8 border border-accent/40" aria-label="Metadata-derived cluster visualization, not source CHR pixels">
										{#each pixels as color, index}<span style={`background-color:${color}`} aria-hidden="true" data-pixel={index}></span>{/each}
									</div>
								</td>
								<td class="p-2 font-bold">{card.card_id.slice(0, 8)}...</td>
								<td class="p-2">#{card.som_cluster ?? '—'}</td>
								<td class="p-2">
									<span class="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold"
										class:bg-red-500-20={card.retrieval_temperature === 'hot'}
										class:text-red-500={card.retrieval_temperature === 'hot'}
										class:bg-amber-500-20={card.retrieval_temperature === 'warm'}
										class:text-amber-500={card.retrieval_temperature === 'warm'}
										class:bg-blue-500-20={card.retrieval_temperature === 'cold'}
										class:text-blue-500={card.retrieval_temperature === 'cold'}
									>
										{card.retrieval_temperature}
									</span>
								</td>
								<td class="p-2 max-w-[200px] truncate" title={card.source_ref}>{card.source_ref}</td>
								<td class="p-2">
									<button class="px-2 py-0.5 bg-accent/10 text-accent rounded hover:bg-accent hover:text-white transition">
										Inspect
									</button>
								</td>
							</tr>
						{/each}
						{#if filteredCards.length === 0}<tr><td colspan="6" class="p-6 text-center text-sand/60">No registry cards match these filters.</td></tr>{/if}
					</tbody>
				</table>
			</div>
			<div class="mt-3 flex items-center justify-between text-xs">
				<span class="text-sand/60">Showing {filteredCards.length} of {data.resultCount.toLocaleString()} matches</span>
				<div class="flex gap-2">
					{#if data.page > 1}<a class="px-3 py-1 rounded bg-sand/10" href={`?q=${encodeURIComponent(data.query)}&temperature=${data.temperature}&cluster=${data.cluster}&page=${data.page - 1}`}>Previous</a>{/if}
					{#if data.page < data.pageCount}<a class="px-3 py-1 rounded bg-sand/10" href={`?q=${encodeURIComponent(data.query)}&temperature=${data.temperature}&cluster=${data.cluster}&page=${data.page + 1}`}>Next</a>{/if}
				</div>
			</div>
		</div>

		<!-- Right: Tile Strategy Inspector & Proposal Receipt Form -->
		<div class="bg-panel rounded-lg border border-sand/20 p-4">
			<h2 class="text-base font-bold mb-3 flex items-center gap-2">
				<Icon name="cpu" size={16} /> Tile Strategy Inspector
			</h2>

			{#if selectedCard}
				<div class="space-y-3 text-xs">
					<div class="p-3 bg-sand/5 rounded border border-sand/10 space-y-1 font-mono">
						<div><strong>Card ID:</strong> {selectedCard.card_id}</div>
						<div><strong>Source Ref:</strong> <span class="break-all">{selectedCard.source_ref}</span></div>
						<div><strong>SOM Cluster:</strong> #{selectedCard.som_cluster}</div>
						<div><strong>Temperature:</strong> {selectedCard.retrieval_temperature}</div>
						<div><strong>Tags:</strong> {(selectedCard.tags || []).join(', ') || 'none'}</div>
						<div><strong>Created:</strong> {selectedCard.created_at}</div>
					</div>

					<div class="text-[10px] text-sand/60">Preview colors are derived from card ID and cluster metadata; they are not recovered CHR graphics.</div>
					<form onsubmit={submitProposal} class="space-y-2 pt-2 border-t border-sand/20">
						<input type="hidden" name="cardId" value={selectedCard.card_id} />

						<button
							type="submit"
							disabled={proposalSubmitting || !data.registryAvailable}
							class="w-full py-2 px-3 bg-accent text-white font-bold rounded hover:bg-accent/90 transition flex items-center justify-center gap-2"
						>
							<Icon name="check" size={14} /> {proposalSubmitting ? 'Validating…' : 'Create proposal receipt'}
						</button>
						<p class="text-[10px] text-sand/60 text-center font-mono">
							PROPOSAL_ONLY · no database/cache write · SHA-256 digest
						</p>
					</form>
				</div>
			{:else}
				<div class="p-8 text-center text-sand/50 text-xs">
					Select a registry card to inspect its projection metadata and create a non-persistent proposal receipt.
				</div>
			{/if}
		</div>
	</div>
</div>
