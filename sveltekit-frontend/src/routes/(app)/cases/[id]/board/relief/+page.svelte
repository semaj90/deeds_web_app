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
	.page {
		max-width: 1180px;
		margin: 0 auto;
		padding: 24px 20px 48px;
		color: #1e2430;
		background: #faf6f0;
		min-height: 100%;
		font-family: inherit;
	}
	header {
		background: #fcfbf9;
		border: 1px solid #d5c6ac;
		box-shadow: 2px 2px 0px rgba(45, 49, 57, 0.06), inset 0 1px 0 #ffffff;
		border-radius: 6px;
		padding: 16px 20px;
		margin-bottom: 16px;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 20px;
		margin: 8px 0 6px;
		letter-spacing: 0.04em;
		font-weight: 700;
		color: #141820;
		text-transform: uppercase;
	}
	p {
		margin: 0 0 8px;
		font-size: 13px;
		line-height: 1.5;
		color: #4b5563;
	}
	a {
		color: #67140f;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	a:hover {
		color: #c59e2b;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #67140f;
		margin-bottom: 4px;
	}
	.layout {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: 16px;
		margin-top: 14px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 8px;
		display: grid;
		gap: 8px;
		align-content: start;
		max-height: 560px;
		overflow-y: auto;
		background: #fcfbf9;
		border: 1px solid #d5c6ac;
		border-radius: 6px;
		box-shadow: 2px 2px 0px rgba(45, 49, 57, 0.05);
	}
	.list button {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		text-align: left;
		cursor: pointer;
		background: #fdfdfc;
		color: #1f2937;
		border: 1px solid #e0d7c7;
		box-shadow: 1px 1px 0px rgba(45, 49, 57, 0.04);
		border-radius: 4px;
		padding: 10px 12px;
		font-size: 12px;
		font-family: inherit;
		transition: all 0.15s ease;
	}
	.list button:hover {
		background: #f6f0e4;
		border-color: #c59e2b;
	}
	.list button.active {
		border-color: #67140f;
		background: #f7ede8;
		box-shadow: inset 2px 0 0 #67140f, 1px 1px 0px rgba(45, 49, 57, 0.08);
		font-weight: 600;
	}
	.t {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.b {
		flex: none;
		font-size: 10px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 2px 8px;
		border-radius: 3px;
		background: #eee8dc;
		color: #57534e;
		border: 1px solid #d5c6ac;
	}
	.b.ok {
		background: #eef8f2;
		color: #166534;
		border-color: #bbf7d0;
		font-weight: 600;
	}
	.stage {
		display: block;
		width: 100%;
		height: 560px;
		background: #10141d;
		border: 1px solid #2d3139;
		border-radius: 6px;
		box-shadow: 2px 2px 0px rgba(45, 49, 57, 0.08);
		overflow: hidden;
		position: relative;
	}
	.nodepth {
		height: 100%;
		display: grid;
		grid-template-rows: 1fr auto;
		gap: 12px;
		background: #fcfbf9;
		border: 1px solid #d5c6ac;
		border-radius: 6px;
		padding: 16px;
	}
	.nodepth img {
		max-width: 100%;
		max-height: 100%;
		margin: auto;
		object-fit: contain;
		min-height: 0;
		border: 1px solid #e0d7c7;
		border-radius: 4px;
		background: #f5eedc;
	}
	.nodepth p {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #78350f;
		background: #fef3c7;
		border: 1px solid #fde68a;
		padding: 8px 12px;
		border-radius: 4px;
		font-size: 12px;
		margin: 0;
	}
	.err {
		color: #991b1b;
		background: #fee2e2;
		border: 1px solid #fecaca;
		border-radius: 6px;
		padding: 10px 14px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}
	.empty {
		color: #57534e;
		background: #fcfbf9;
		border: 1px dashed #d5c6ac;
		border-radius: 6px;
		padding: 32px;
		text-align: center;
		font-size: 14px;
	}
	@media (max-width: 760px) {
		.layout { grid-template-columns: 1fr; }
		.stage { height: 380px; }
	}
</style>
