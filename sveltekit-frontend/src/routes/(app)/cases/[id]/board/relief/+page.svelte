<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import DepthReliefViewer from '$lib/components/evidence/DepthReliefViewer.svelte';

	let { data } = $props();

	let selectedId = $state<string | null>(null);
	const selected = $derived(data.items.find((i: { id: string }) => i.id === selectedId) ?? data.items.find((i: { depthUrl: string | null }) => i.depthUrl) ?? data.items[0] ?? null);
	const withDepth = $derived(data.items.filter((i: { depthUrl: string | null }) => i.depthUrl).length);
</script>

<svelte:head><title>Relief Demo · Evidence Board</title></svelte:head>

<main class="page">
	<header>
		<a class="back" href={`/cases/${data.caseId}/board`}>← Evidence board</a>
		<h1><Icon name="yorha-evidence" size={22} /> Relief demo</h1>
		<p>
			Textured 2.5D view of this case's image evidence. Shown only where a depth map is bound to the same source file
			({withDepth} of {data.items.length} images). Estimated geometry, not a measurement.
			<a href="/demos/depth-relief">Try the synthetic sample</a>.
		</p>
	</header>

	{#if data.loadError}
		<p class="err" role="alert" data-testid="relief-load-error"><Icon name="yorha-warning" size={16} /> {data.loadError}</p>
	{:else if data.items.length === 0}
		<p class="empty" data-testid="relief-empty">No image evidence in this case yet.</p>
	{:else}
		<div class="layout">
			<ul class="list" aria-label="Image evidence">
				{#each data.items as item (item.id)}
					<li>
						<button
							type="button"
							class:active={selected?.id === item.id}
							aria-pressed={selected?.id === item.id}
							data-testid="relief-item"
							onclick={() => (selectedId = item.id)}
						>
							<span class="t">{item.title}</span>
							<span class="b" class:ok={!!item.depthUrl}>{item.depthUrl ? 'depth' : 'no depth'}</span>
						</button>
					</li>
				{/each}
			</ul>

			<section class="stage">
				{#if selected?.depthUrl}
					{#key selected.id}
						<DepthReliefViewer imageUrl={selected.imageUrl} depthUrl={selected.depthUrl} />
					{/key}
				{:else if selected}
					<div class="nodepth" data-testid="relief-no-depth">
						<img src={selected.imageUrl} alt={selected.title} />
						<p><Icon name="yorha-warning" size={16} /> No source-bound depth map is stored for this image, so no relief is shown. A depth map from a different file is never substituted.</p>
					</div>
				{/if}
			</section>
		</div>
	{/if}
</main>

<style>
	.page { max-width: 1100px; margin: 0 auto; padding: 18px 16px 40px; color: #e5ebf6; background: #0a0f1a; min-height: 100%; }
	h1 { display: flex; align-items: center; gap: 8px; font-size: 21px; margin: 6px 0; letter-spacing: 0.04em; }
	p { margin: 0 0 10px; font-size: 13px; opacity: 0.85; }
	a { color: #7dd3fc; }
	.back { font-size: 12px; }
	.layout { display: grid; grid-template-columns: 260px 1fr; gap: 14px; margin-top: 12px; }
	.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; align-content: start; max-height: 520px; overflow: auto; }
	.list button { width: 100%; display: flex; justify-content: space-between; gap: 8px; text-align: left; cursor: pointer; background: #131c2e; color: #fff; border: 1px solid rgba(125, 211, 252, 0.3); border-radius: 8px; padding: 8px 10px; font-size: 12px; }
	.list button.active { border-color: #c59a2b; background: #1d2a44; }
	.t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.b { flex: none; font-size: 10px; padding: 1px 6px; border-radius: 99px; background: #3a2b2b; }
	.b.ok { background: #1d3b2c; }
	.stage { display: block; width: 100%; height: 520px; }
	.nodepth { height: 100%; display: grid; grid-template-rows: 1fr auto; gap: 8px; border: 1px solid rgba(125, 211, 252, 0.3); border-radius: 12px; padding: 10px; }
	.nodepth img { max-width: 100%; max-height: 100%; margin: auto; object-fit: contain; min-height: 0; }
	.nodepth p { display: flex; align-items: center; gap: 6px; }
	.err { color: #ffc4c4; display: flex; align-items: center; gap: 6px; }
	@media (max-width: 760px) { .layout { grid-template-columns: 1fr; } .stage { height: 380px; } }
</style>
