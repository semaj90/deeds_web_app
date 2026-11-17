<script lang="ts">
	import type { PageData } from './$types.js';
	import {
		decodeChrTile8x8,
		getDomainIconTileIndex,
		renderNametableToRgba,
		resolveChrPaletteForNesHex,
	} from '$lib/atlas/chr-glyph-atlas-v1.js';

	let { data }: { data: PageData } = $props();

	let selectedRank = $state(0);
	let scale = $state(3);
	let bannerCanvas: HTMLCanvasElement | undefined = $state();
	let tileCanvas: HTMLCanvasElement | undefined = $state();

	const chrBank = $derived(Uint8Array.from(data.chr.chrBankArray));
	const selectedRecord = $derived(data.report.sortedRecords[selectedRank] ?? data.report.sortedRecords[0]!);
	const selectedTileId = $derived(getDomainIconTileIndex(selectedRecord.primaryLutByte));
	const selectedTilePixels = $derived(Array.from(decodeChrTile8x8(chrBank, selectedTileId)));
	const selectedTileHex = $derived.by(() => {
		const offset = selectedTileId * 16;
		const low = Array.from(chrBank.subarray(offset, offset + 8), (b) => b.toString(16).padStart(2, '0')).join(' ');
		const high = Array.from(chrBank.subarray(offset + 8, offset + 16), (b) => b.toString(16).padStart(2, '0')).join(' ');
		return { low, high };
	});
	const activePalette = $derived(resolveChrPaletteForNesHex(selectedRecord.nesHex));

	$effect(() => {
		if (!bannerCanvas) return;
		const rendered = renderNametableToRgba(
			chrBank,
			Uint16Array.from(data.chr.nametableTiles),
			data.chr.nametableColumns,
			data.chr.nametableRows,
			selectedRecord.nesHex
		);
		bannerCanvas.width = rendered.width;
		bannerCanvas.height = rendered.height;
		const ctx = bannerCanvas.getContext('2d');
		if (!ctx) return;
		ctx.putImageData(new ImageData(new Uint8ClampedArray(rendered.rgba), rendered.width, rendered.height), 0, 0);
	});

	$effect(() => {
		if (!tileCanvas) return;
		const tileNametable = Uint16Array.from([selectedTileId]);
		const rendered = renderNametableToRgba(chrBank, tileNametable, 1, 1, selectedRecord.nesHex);
		tileCanvas.width = rendered.width;
		tileCanvas.height = rendered.height;
		const ctx = tileCanvas.getContext('2d');
		if (!ctx) return;
		ctx.putImageData(new ImageData(new Uint8ClampedArray(rendered.rgba), rendered.width, rendered.height), 0, 0);
	});
</script>

<svelte:head>
	<title>Parent Atlas — NES 8 KiB CHR & Native FSM Runtime Slice</title>
</svelte:head>

<main class="min-h-screen bg-[#0c0e16] p-6 font-mono text-slate-200">
	<div class="mx-auto max-w-6xl space-y-6">
		<header class="border border-slate-700 bg-slate-900/80 p-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p class="text-xs uppercase tracking-widest text-amber-400">
						PARENT-ATLAS-NES-FSM-NATIVE-RUNTIME-01 · PROPOSAL-ONLY · CPU-ONLY
					</p>
					<h1 class="mt-1 text-xl font-bold text-white">
						NES 16-Byte 2bpp CHR Glyph Atlas &amp; Native FSM Vertical Slice
					</h1>
				</div>
				<div class="flex gap-2 text-xs">
					<span class="border border-emerald-700 bg-emerald-950 px-2 py-1 text-emerald-300">
						canonicalAuthority={String(data.report.canonicalAuthority)}
					</span>
					<span class="border border-sky-700 bg-sky-950 px-2 py-1 text-sky-300">
						promotionEligible={String(data.report.promotionEligible)}
					</span>
					<span class="border border-amber-700 bg-amber-950 px-2 py-1 text-amber-300">
						writesPerformed={String(data.report.writesPerformed)}
					</span>
				</div>
			</div>
		</header>

		<section class="grid gap-4 lg:grid-cols-3">
			<div class="border border-slate-700 bg-slate-900/70 p-4 lg:col-span-2">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-sm font-semibold uppercase tracking-wider text-slate-300">
						8 KiB NROM CHR-ROM Banner ({data.chr.bankByteLength} bytes · 512 × 16B tiles)
					</h2>
					<div class="flex items-center gap-2 text-xs">
						<span>Zoom:</span>
						{#each [2, 3, 4] as s}
							<button
								type="button"
								class="border px-2 py-0.5 {scale === s ? 'border-amber-400 bg-amber-950 text-amber-200' : 'border-slate-700 bg-slate-800 text-slate-300'}"
								onclick={() => (scale = s)}
							>
								{s}x
							</button>
						{/each}
					</div>
				</div>
				<div class="overflow-x-auto border border-slate-800 bg-black p-3">
					<canvas
						bind:this={bannerCanvas}
						style="image-rendering: pixelated; width: {data.chr.nametableColumns * 8 * scale}px; height: {data.chr.nametableRows * 8 * scale}px;"
					></canvas>
				</div>
				<p class="mt-2 text-xs text-slate-400">
					Active Palette ({selectedRecord.featureLabel} / LUT {selectedRecord.primaryLutByte} / visual {selectedRecord.nesHex}):
					{#each activePalette as rgba, idx}
						<span class="ml-2 inline-flex items-center gap-1">
							<span
								class="inline-block h-3 w-3 border border-slate-500"
								style="background-color: rgb({rgba[0]}, {rgba[1]}, {rgba[2]});"
							></span>
							<span>{idx}</span>
						</span>
					{/each}
				</p>
			</div>

			<div class="border border-slate-700 bg-slate-900/70 p-4">
				<h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
					16B CHR Pixel Tile vs 8B NESCHROM97
				</h2>
				<div class="space-y-3 text-xs">
					<div class="border border-emerald-800/70 bg-emerald-950/20 p-2">
						<div class="font-semibold text-emerald-300">1. CHR_TILE_16B (Pixel Atlas)</div>
						<p class="mt-1 text-slate-400">Tile #{selectedTileId} (16 bytes = 8B low plane + 8B high plane)</p>
						<div class="mt-2 flex items-center gap-3">
							<canvas
								bind:this={tileCanvas}
								style="image-rendering: pixelated; width: 64px; height: 64px; border: 1px solid #475569;"
							></canvas>
							<div class="text-[10px] leading-tight text-slate-300">
								<div>P0: {selectedTileHex.low}</div>
								<div class="mt-1">P1: {selectedTileHex.high}</div>
								<div class="mt-1 text-slate-400">Row0 2bpp: [{selectedTilePixels.slice(0, 8).join(',')}]</div>
							</div>
						</div>
					</div>

					<div class="border border-amber-800/70 bg-amber-950/20 p-2">
						<div class="font-semibold text-amber-300">2. NESCHROM97_META_8B (Derived Metadata Only)</div>
						<p class="mt-1 text-slate-400">
							{data.chr.chrom97Bytes} bytes · isPixelTile={String(data.chr.chrom97Sample.isPixelTile)} · canonicalAuthority={String(data.chr.chrom97Sample.canonicalAuthority)}
						</p>
						<div class="mt-1 text-[11px] text-slate-300">
							hex: {data.chr.chrom97Sample.hex}
						</div>
						<div class="mt-1 text-[11px] text-slate-400">
							domainClass={data.chr.chrom97Sample.domainClass}, complexity={data.chr.chrom97Sample.complexity}, cluster={data.chr.chrom97Sample.latentCluster}, conf={data.chr.chrom97Sample.confidence}
						</div>
					</div>
				</div>
			</div>
		</section>

		<section class="grid gap-4 md:grid-cols-2">
			<div class="border border-slate-700 bg-slate-900/70 p-4 text-xs">
				<h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
					Native Binary Descriptor &amp; Buffer Swap Telemetry
				</h2>
				<dl class="grid grid-cols-[170px_1fr] gap-y-1">
					<dt class="text-slate-400">Binary Schema:</dt>
					<dd>{data.report.binarySchemaRevision}</dd>
					<dt class="text-slate-400">Endianness / Align:</dt>
					<dd>{data.report.endianness} / {data.report.alignmentBytes}-byte aligned ({data.report.descriptorByteLength} bytes)</dd>
					<dt class="text-slate-400">Input Checksum:</dt>
					<dd class="truncate">{data.report.inputBufferChecksum}</dd>
					<dt class="text-slate-400">Ordinal Map Checksum:</dt>
					<dd class="truncate">{data.report.candidateOrdinalMapChecksum}</dd>
					<dt class="text-slate-400">Output Checksum:</dt>
					<dd class="truncate text-emerald-300">{data.report.outputBufferChecksum}</dd>
					<dt class="text-slate-400">Buffer Swap:</dt>
					<dd>swapped={String(data.report.bufferSwap.bufferSwapped)} count={data.report.bufferSwap.swapCount} readbackVerified={String(data.report.bufferSwap.readbackVerified)}</dd>
					<dt class="text-slate-400">FSM Transition:</dt>
					<dd>{data.report.taskTransition.fromState} -&gt; {data.report.taskTransition.toState} (NesFeatureFsm: {data.report.nesFeatureFsmState})</dd>
					<dt class="text-slate-400">CSR Traversal:</dt>
					<dd>totalVisited={data.report.csrResult.totalVisited} depth={data.report.csrResult.depthCompleted}</dd>
					<dt class="text-slate-400">BitFrost Residency:</dt>
					<dd>RESIDENT={data.report.bitfrostResidentOrdinals.length}, ADMITTED={data.report.bitfrostAdmittedOrdinals.length}, released={data.report.bitfrostLeaseReleasedCount}</dd>
				</dl>
			</div>

			<div class="border border-slate-700 bg-slate-900/70 p-4 text-xs">
				<h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
					Native Guards &amp; Blocked Production Gates
				</h2>
				<div class="space-y-1 text-emerald-300">
					<div>addonLoaded: {String(data.report.nativeGuards.addonLoaded)}</div>
					<div>max65536RowsEnforced: {String(data.report.nativeGuards.max65536RowsEnforced)}</div>
					<div>duplicateOrdinalsEnforced: {String(data.report.nativeGuards.duplicateOrdinalsEnforced)}</div>
					<div>somBmuRange400Enforced: {String(data.report.nativeGuards.somBmuRange400Enforced)}</div>
				</div>
				<h3 class="mt-3 text-[11px] font-semibold uppercase text-amber-300">Blocked Production Admission Gates</h3>
				<ul class="mt-1 list-disc space-y-1 pl-4 text-[11px] text-slate-400">
					{#each data.report.blockedProductionGates as gate}
						<li>{gate}</li>
					{/each}
				</ul>
			</div>
		</section>

		<section class="border border-slate-700 bg-slate-900/70 p-4 text-xs">
			<h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
				Radix-Sorted Candidate Batch (Click Row to Inspect Tile &amp; NES Palette)
			</h2>
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-left">
					<thead>
						<tr class="border-b border-slate-700 text-slate-400">
							<th class="p-1.5">Rank</th>
							<th class="p-1.5">Ordinal</th>
							<th class="p-1.5">Cluster</th>
							<th class="p-1.5">SOM</th>
							<th class="p-1.5">LUT</th>
							<th class="p-1.5">Mask</th>
							<th class="p-1.5">Visual Hex</th>
							<th class="p-1.5">Label</th>
							<th class="p-1.5">BitFrost</th>
						</tr>
					</thead>
					<tbody>
						{#each data.report.sortedRecords as rec}
							<tr
								class="cursor-pointer border-b border-slate-800 hover:bg-slate-800/60 {selectedRank === rec.sortedRank ? 'bg-slate-800 text-amber-200' : ''}"
								onclick={() => (selectedRank = rec.sortedRank)}
							>
								<td class="p-1.5">{rec.sortedRank}</td>
								<td class="p-1.5 font-semibold">{rec.candidateOrdinal}</td>
								<td class="p-1.5">{rec.kmeansClusterId}</td>
								<td class="p-1.5">{rec.somBmuId}</td>
								<td class="p-1.5">{rec.primaryLutByte}</td>
								<td class="p-1.5">0x{rec.domainBitmask.toString(16).padStart(4, '0')}</td>
								<td class="p-1.5">{rec.nesHex}</td>
								<td class="p-1.5">{rec.featureLabel}</td>
								<td class="p-1.5">
									<span class="px-1.5 py-0.5 text-[10px] {rec.bitfrostState === 'RESIDENT' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-300'}">
										{rec.bitfrostState}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</main>
