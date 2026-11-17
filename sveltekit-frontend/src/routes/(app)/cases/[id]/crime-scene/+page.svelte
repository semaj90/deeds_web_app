<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Native <dialog> mini-modals. Their content is server-rendered from PostgreSQL; the click
	// handler only opens the dialog that already exists in the HTML.
	function openDialog(id: string) {
		const dialog = document.getElementById(id);
		if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
	}

	function formatBytes(bytes: number) {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	const KINDS = ['WHO', 'WHAT', 'WHY', 'HOW'] as const;
	const linkedEvidenceIds = $derived(
		new Set(data.facets.flatMap((facet) => facet.evidence.map((item) => item.evidenceId)))
	);
	const exportStatus = $derived(data.latestExport?.status ?? 'NONE');
</script>

<svelte:head>
	<title>Crime scene · {data.caseTitle}</title>
</svelte:head>

<main class="crime-scene">
	<header>
		<h1>Crime scene{data.caseNumber ? ` · ${data.caseNumber}` : ''}</h1>
		<p class="case-title">{data.caseTitle}</p>
		<p class="export-state">
			Latest AI summary:
			{#if data.latestExport}
				revision {data.latestExport.revision} · <strong>{exportStatus}</strong>
			{:else}
				none exported
			{/if}
		</p>
	</header>

	<nav class="case-actions" aria-label="Case scene actions">
		<a class="case-action primary" href={`/cases/${encodeURIComponent(data.caseId)}/evidence/upload`}>Upload evidence</a>
		<a class="case-action" href={`/cases/${encodeURIComponent(data.caseId)}/board`}>Open evidence board</a>
		<a class="case-action" href={`/cases/${encodeURIComponent(data.caseId)}/board?view=detective`}>Add evidence to scene</a>
	</nav>

	{#if data.loadError}
		<p class="load-error" role="status">{data.loadError}</p>
	{/if}

	<section aria-labelledby="markers-heading">
		<h2 id="markers-heading">Evidence markers <small>{data.markers.length} placed</small></h2>
		{#if data.markers.length === 0}
			<div class="empty-state">
				<p class="empty">No saved case markers yet. Local preflight placements are not saved; choose a saved case exhibit and place its marker in Detective Mode.</p>
				<a class="case-action primary" href={`/cases/${encodeURIComponent(data.caseId)}/board?view=detective`}>Choose exhibit and place marker</a>
			</div>
		{:else}
			<table>
				<thead>
					<tr><th>Scene</th><th>Marker</th><th>Evidence</th><th>Position (x, y, z)</th><th>Anchor</th><th></th></tr>
				</thead>
				<tbody>
					{#each data.markers as marker (marker.id)}
						<tr>
							<td>{marker.sceneKey}</td>
							<td>{marker.label ?? marker.markerKey}</td>
							<td>{marker.evidenceTitle}</td>
							<td>{marker.posX.toFixed(2)}, {marker.posY.toFixed(2)}, {marker.posZ.toFixed(2)}</td>
							<td>{marker.anchorKind ?? 'legacy'} · {marker.anchorStatus}</td>
							<td><button type="button" onclick={() => openDialog(`marker-${marker.id}`)}>Inspect</button></td>
						</tr>
					{/each}
				</tbody>
			</table>

			{#each data.markers as marker (marker.id)}
				<dialog id="marker-{marker.id}" class="mini-modal" aria-labelledby="marker-title-{marker.id}">
					<form method="dialog">
						<h3 id="marker-title-{marker.id}">{marker.label ?? marker.markerKey}</h3>
						<dl>
							<dt>Scene</dt><dd>{marker.sceneKey}</dd>
							<dt>Evidence</dt><dd>{marker.evidenceTitle}</dd>
							<dt>Summary</dt><dd>{marker.evidenceAiSummary ?? marker.evidenceSummary ?? 'No summary recorded'}</dd>
							<dt>Revision</dt><dd>{marker.revision}</dd>
						</dl>
						<button type="submit">Close</button>
					</form>
				</dialog>
			{/each}
		{/if}
	</section>

	<section aria-labelledby="facets-heading">
		<h2 id="facets-heading">Who, what, why, how</h2>
		{#each KINDS as kind (kind)}
			{@const items = data.facets.filter((facet) => facet.facetKind === kind)}
			<h3>{kind}</h3>
			{#if items.length === 0}
				<p class="empty">No {kind} facets recorded.</p>
			{:else}
				<ul class="facet-list">
					{#each items as facet (facet.id)}
						<li>
							<span class="claim">{facet.claimText}</span>
							<span class="status">{facet.status}</span>
							<button type="button" onclick={() => openDialog(`facet-${facet.id}`)}>Details</button>
						</li>
					{/each}
				</ul>
			{/if}
		{/each}

		{#each data.facets as facet (facet.id)}
			<dialog id="facet-{facet.id}" class="mini-modal" aria-labelledby="facet-title-{facet.id}">
				<form method="dialog">
					<h3 id="facet-title-{facet.id}">{facet.facetKind}: {facet.claimText}</h3>
					<p>Status {facet.status}{facet.confidence !== null ? ` · confidence ${facet.confidence}` : ''}</p>
					<h4>Linked evidence</h4>
					<ul>
						{#each facet.evidence as item (item.evidenceId)}
							<li>{item.title} <small>relevance {item.relevance}</small></li>
						{:else}
							<li>None linked</li>
						{/each}
					</ul>
					<h4>Case notes</h4>
					<ul>
						{#each facet.notes as note (note.noteId)}
							<li>{note.title ?? 'Untitled note'}{note.isAi ? ' (AI)' : ''}</li>
						{:else}
							<li>None linked</li>
						{/each}
					</ul>
					<button type="submit">Close</button>
				</form>
			</dialog>
		{/each}
	</section>

	<section aria-labelledby="assets-heading">
		<h2 id="assets-heading">Scene assets <small>{data.assets.length} registered</small></h2>
		{#if data.assets.length === 0}
			<p class="empty">No scene assets registered for this case.</p>
		{:else}
			<ul>
				{#each data.assets as asset (asset.assetId)}
					<li>{asset.format} · {formatBytes(asset.byteLength)} · <code>{asset.sha256.slice(0, 12)}…</code> · {new Date(asset.createdAt).toLocaleDateString()}</li>
				{/each}
			</ul>
		{/if}
		<p class="note">Markers are keyed by scene key and assets by scene identifier; the two are not yet joined in the schema.</p>
	</section>

	<p class="evidence-count">{linkedEvidenceIds.size} evidence item(s) linked to facets.</p>
</main>

<style>
	.crime-scene { padding: 20px; width: min(100% - 32px, 1320px); margin: 20px auto; color: var(--dossier-text-main, #141312); background: var(--dossier-bg-card, #faf6f0); border: 1px solid var(--dossier-hairline, #e2d7c9); border-radius: var(--dossier-radius-card, 10px); box-shadow: var(--dossier-shadow-card, 0 1px 2px rgba(60, 40, 20, .04)); font: 14px/1.5 system-ui, sans-serif; }
	.case-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 20px; }
	.case-action { display: inline-flex; align-items: center; min-height: 38px; padding: 8px 13px; border: 1px solid var(--dossier-hairline-strong, #cdbfa9); border-radius: 6px; background: #fffdf9; color: #30261b; font-weight: 600; text-decoration: none; }
	.case-action:hover, .case-action:focus-visible { border-color: var(--dossier-gold, #c9a86a); outline: 2px solid var(--dossier-gold, #c9a86a); outline-offset: 2px; }
	.case-action.primary { background: #483d36; color: #faf4ec; border-color: #483d36; }
	.crime-scene section { margin-top: 14px; padding: 14px 16px; background: linear-gradient(180deg, #fffcf9 0%, #faf4ec 100%); border: 1px solid var(--dossier-hairline, #e2d7c9); border-radius: var(--dossier-radius-card, 10px); }
	h1 { font-size: 20px; margin: 0; }
	h2 { font-size: 16px; margin: 20px 0 8px; }
	h2 small { font-weight: 400; color: #6b7280; margin-left: 6px; }
	.case-title, .export-state { margin: 2px 0; color: var(--dossier-text-muted-aa, #6b6150); }
	table { width: 100%; border-collapse: collapse; font-size: 13px; }
	th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--dossier-hairline, #e2d7c9); }
	button { padding: 6px 10px; border: 1px solid var(--dossier-hairline-strong, #cdbfa9); border-radius: 6px; background: #fffdf9; color: #30261b; cursor: pointer; }
	.facet-list { list-style: none; padding: 0; margin: 0 0 8px; }
	.facet-list li { display: flex; gap: 8px; align-items: center; padding: 4px 0; }
	.claim { flex: 1; }
	.status { font-size: 12px; font-weight: 600; color: #374151; }
	.empty, .note, .evidence-count { color: var(--dossier-text-muted-aa, #6b6150); font-size: 13px; }
	.load-error { color: #b91c1c; }
	dialog.mini-modal { border: 1px solid var(--dossier-hairline-strong, #cdbfa9); border-radius: 10px; padding: 16px; max-width: 480px; width: calc(100% - 32px); background: var(--dossier-bg-card, #faf6f0); color: var(--dossier-text-main, #141312); }
	dialog.mini-modal::backdrop { background: rgb(15 23 42 / 0.45); }
	dialog.mini-modal dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0 0 12px; }
	dialog.mini-modal dt { color: #6b7280; }
	dialog.mini-modal dd { margin: 0; }
	code { font-size: 12px; }
</style>
