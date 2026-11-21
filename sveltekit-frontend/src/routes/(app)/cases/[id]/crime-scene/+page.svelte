<script lang="ts">
	import type { PageData } from './$types';
	import SceneVideoEventBindings from '$lib/components/evidence/SceneVideoEventBindings.svelte';
	import CaseStorybook from '$lib/components/evidence/CaseStorybook.svelte';
	import { storybookSavedChapterHrefV1 } from '$lib/shared/storybook-video-chapter-v1.js';
	import { savedImageChapterHrefV1, storybookRelativeDepthHrefV1, type StorybookImageChapterV1 } from '$lib/shared/storybook-image-chapter-v1.js';
	import { STORYBOOK_REGION_GRID_SIZE } from '$lib/shared/storybook-region-review-v1.js';
	import StorybookAuthorities from '$lib/components/evidence/StorybookAuthorities.svelte';
	import StorybookScenePalette from '$lib/components/evidence/StorybookScenePalette.svelte';
	import CaseScenePlanBuilder from '$lib/components/reconstruction/CaseScenePlanBuilder.svelte';
	import type { ScenePalettePreviewV1 } from '$lib/splat/indexed-palette-artifact-v1.js';
	import type { StorybookVideoCitationV1 } from '$lib/shared/storybook-video-chapter-v1.js';

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

	function seconds(ms: number) { return `${(ms / 1000).toFixed(3)} s`; }

	function savedFrameHref(binding: { evidenceId: string; sourceRevision: string; analysisRevision: string }, citation: Exclude<StorybookVideoCitationV1, { kind: 'transcript_segment' }>) {
		const query = new URLSearchParams({ sourceRevision: binding.sourceRevision, analysisRevision: binding.analysisRevision, artifactSha256: citation.artifactSha256 });
		return `/api/evidence/${encodeURIComponent(binding.evidenceId)}/video-frame/${citation.frameIndex}?${query}`;
	}

	function savedMaskHref(chapter: StorybookImageChapterV1, observationId: string) {
		const query = new URLSearchParams({ maskObservation: observationId, sourceRevision: chapter.sourceRevision,
			analysisRevision: chapter.analysisRevision, observationRevision: chapter.observationRevision });
		return `/api/evidence/${encodeURIComponent(chapter.evidenceId)}/multimodal-analysis?${query}`;
	}
	let openDepthRevision = $state<string | null>(null);
	let scenePalette = $state<{ chapterKey: string; preview: ScenePalettePreviewV1 } | null>(null);
	const coverageLabels = { RECORDED: 'Recorded', NOT_RUN: 'Did not run', NOT_RECORDED: 'Not recorded', FAILED_OR_UNAVAILABLE: 'Failed or unavailable' };

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
		<a class="case-action" href={`/cases/${encodeURIComponent(data.caseId)}/board?view=detective`}>Place and save evidence marker</a>
	</nav>

	{#key data.caseId}
		<CaseScenePlanBuilder caseId={data.caseId} caseSceneIntake={data.caseSceneIntake} evidenceItems={data.availableEvidence}
			setSceneRequest={data.setSceneRequest} setSceneRequestError={data.setSceneRequestError}
			scenePersistenceEnabled={data.scenePersistenceEnabled} />
	{/key}
	{#if data.sceneSources.some((scene) => scene.proceduralPreview)}
		<section aria-label="Saved procedural drafts">
			<h2>Saved scene drafts</h2>
			<ul>
				{#each data.sceneSources.filter((scene) => scene.proceduralPreview) as scene (scene.sceneId)}
					<li><a data-sveltekit-reload href={`?previewScene=${scene.sceneId}&previewRevision=${scene.revision}#scene-builder-title`}>
						{scene.proceduralPreview === 'four-bedroom-house' ? 'Four-bedroom house' : scene.proceduralPreview}
						· Revision {scene.revision} · {scene.sceneId.slice(0, 8)}
					</a></li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.loadError}
		<p class="load-error" role="status">{data.loadError}</p>
	{/if}
	{#key data.storybookChapter?.id}
		<CaseStorybook caseId={data.caseId} chapters={data.storybookChapters} chapter={data.storybookChapter}
			video={data.videoStorybook} unavailable={data.storybookUnavailable} />
	{/key}

	{#if data.savedChapterRequested || data.sceneSources.some((scene) => scene.storybookChapters.length || scene.imageStorybookChapters.length)}
		<section id="saved-storybook-chapter" aria-labelledby="saved-storybook-heading">
			<h2 id="saved-storybook-heading">Saved storybook chapters</h2>
			<ul>
				{#each data.sceneSources as scene (scene.sceneId)}
					{#each scene.storybookChapters as chapter (chapter.eventId)}
						<li><a href={storybookSavedChapterHrefV1({ caseId: data.caseId, sceneId: scene.sceneId, revision: scene.revision, eventId: chapter.eventId })}>
							{chapter.title} · Revision {scene.revision}
						</a> · <a href={`/cases/${data.caseId}/evidence/${chapter.evidenceId}`}>Exhibit</a></li>
					{/each}
					{#each scene.imageStorybookChapters as chapter (chapter.chapterId)}
						<li><a href={savedImageChapterHrefV1({ caseId: data.caseId, sceneId: scene.sceneId, revision: scene.revision, chapterId: chapter.chapterId })}>
							{chapter.title} · Revision {scene.revision} · Still image
						</a></li>
					{/each}
				{/each}
			</ul>
			{#if data.savedChapter}
				{@const saved = data.savedChapter}
				<h3>{saved.chapter.title}</h3>
				<p>Scene revision {saved.revision} · {seconds(saved.binding.startMs)}–{seconds(saved.binding.endMs)} · Sampled frames and excerpts</p>
				<p class="note">Cells use this exhibit’s image coordinates. Review links observations for inspection.</p>
				{#if saved.sourceState === 'CHANGED'}
					<p role="status">The source analysis or review changed after this chapter was saved. These references describe the saved revision.</p>
				{:else if saved.sourceState === 'UNAVAILABLE'}
					<p role="status">The source exhibit is unavailable. These references describe the saved revision.</p>
				{/if}
				<ul>
					{#each saved.chapter.citations as citation (citation.referenceId)}
						<li>
							{#if citation.kind === 'transcript_segment'}
								Transcript · {seconds(citation.startMs)}–{seconds(citation.endMs)}
							{:else}
								{#if citation.kind === 'frame_detection'}
									Detector: {citation.label} · Cell {String.fromCharCode(65 + citation.imageCell.column)}{citation.imageCell.row + 1}
								{:else}Frame OCR{/if}
								· {seconds(citation.timestampMs)}
								{#if saved.sourceState === 'CURRENT'}<a href={savedFrameHref(saved.binding, citation)}>Open cited frame</a>{/if}
							{/if}
						</li>
					{/each}
				</ul>
				{#if saved.chapter.unresolvedReferenceIds.length}<p>{saved.chapter.unresolvedReferenceIds.length} observation references were unresolved at save time.</p>{/if}
			{:else if data.savedImageChapter}
				{@const saved = data.savedImageChapter}
				{@const paletteKey = `${data.caseId}:${saved.sceneId}:${saved.revision}:${saved.chapter.sourceRevision}`}
				{@const depthUrl = storybookRelativeDepthHrefV1(saved.chapter)}
				<h3>{saved.chapter.title}</h3>
				<p>Scene revision {saved.revision} · Reviewed hypothesis · Image coordinates</p>
				<details>
					<summary>Analysis coverage at save time</summary>
					<ul>
						<li>Detection · {coverageLabels[saved.chapter.coverage.detection]}</li>
						<li>Segmentation · {coverageLabels[saved.chapter.coverage.mask]}</li>
						<li>Scene description · {coverageLabels[saved.chapter.coverage.sceneContext]}</li>
						{#if saved.chapter.coverage.ocr}
							<li>OCR · {saved.chapter.coverage.ocr === 'COMPLETED' ? 'Text recorded' : saved.chapter.coverage.ocr === 'EMPTY' ? 'No text returned' : 'Failed'}</li>
						{/if}
						{#if saved.chapter.coverage.unresolvedMaskCount}<li>Unlinked masks · {saved.chapter.coverage.unresolvedMaskCount}</li>{/if}
					</ul>
				</details>
				{#if saved.sourceState === 'CURRENT'}
					<a href={`?${new URLSearchParams({ chapter: saved.chapter.evidenceId })}#case-storybook`}>Inspect source exhibit</a>
					{#key paletteKey}
						<StorybookScenePalette caseId={data.caseId} evidenceId={saved.chapter.evidenceId}
							sourceRevision={saved.chapter.sourceRevision} runId={saved.sceneId} sequenceId={saved.revision}
							onPreview={(preview) => {
								if (preview) scenePalette = { chapterKey: paletteKey, preview };
								else if (scenePalette?.chapterKey === paletteKey) scenePalette = null;
							}} />
					{/key}
				{:else if saved.sourceState === 'CHANGED'}
					<p role="status">The source, analysis, or review decisions changed. These observations belong to the saved revision.</p>
				{:else}
					<p role="status">The source is unavailable. These observations belong to the saved revision.</p>
				{/if}
				{#if saved.chapter.relativeDepth && depthUrl}
					{@const depth = saved.chapter.relativeDepth}
					{@const depthKey = `${saved.sceneId}:${saved.revision}:${depth.artifactSha256}`}
					<h4>Relative 2.5D preview</h4>
					<p>Single-image depth estimate · {depth.modelId} · No measured scale</p>
					{#if saved.sourceState === 'CURRENT'}
						<button type="button" aria-expanded={openDepthRevision === depthKey}
							onclick={() => { openDepthRevision = openDepthRevision === depthKey ? null : depthKey; }}>
							{openDepthRevision === depthKey ? 'Close relative preview' : 'Open relative preview'}
						</button>
						{#if openDepthRevision === depthKey}
							{#await import('$lib/components/evidence/DepthReliefViewer.svelte')}
								<p role="status">Loading preview…</p>
							{:then { default: DepthReliefViewer }}
								<DepthReliefViewer imageUrl={`/api/evidence/${encodeURIComponent(saved.chapter.evidenceId)}/download?${new URLSearchParams({
									caseId: data.caseId, sourceRevision: saved.chapter.sourceRevision, inline: '1',
								})}`} {depthUrl} artifactDigests={{ image: saved.chapter.sourceRevision, depth: depth.artifactSha256 }}
								palettePreview={scenePalette?.chapterKey === paletteKey ? scenePalette.preview : null} />
							{:catch}
								<p role="status">The preview could not be opened.</p>
							{/await}
						{/if}
					{:else}
						<p>The pinned depth preview is unavailable for this source state.</p>
					{/if}
				{/if}
				{#if saved.chapter.sceneCells}
					<h4>Saved image-space scene cells</h4>
					<div class="chapter-grid" aria-hidden="true" style:grid-template-columns={`repeat(${STORYBOOK_REGION_GRID_SIZE}, minmax(0, 1fr))`}>
						{#each Array.from({ length: STORYBOOK_REGION_GRID_SIZE ** 2 }, (_, index) => index) as index (index)}
							{@const markers = saved.chapter.sceneCells.flatMap(({ placedCell }, marker) =>
								placedCell.row * STORYBOOK_REGION_GRID_SIZE + placedCell.column === index ? [marker + 1] : [])}
							<span class:occupied={markers.length > 0}>{markers.join(', ')}</span>
						{/each}
					</div>
					<ol>
						{#each saved.chapter.sceneCells as cell (cell.observationId)}
							{@const citation = saved.chapter.citations.find((item) => item.observationId === cell.observationId)}
							<li>{citation && 'label' in citation ? citation.label : 'Observation'} ·
								Placed at {String.fromCharCode(65 + cell.placedCell.column)}{cell.placedCell.row + 1} ·
								Source cell {String.fromCharCode(65 + cell.sourceCell.column)}{cell.sourceCell.row + 1}</li>
						{/each}
					</ol>
				{/if}
				<ol>
					{#each saved.chapter.beats as beat}
						<li><p>{beat.what}</p><p>{beat.how}</p>
							<ul>
								{#each beat.observationIds as id (id)}
									{@const citation = saved.chapter.citations.find((item) => item.observationId === id)}
									{#if citation?.kind === 'scene_context'}
										<li>Unreviewed scene description · {citation.description}</li>
									{:else if citation?.kind === 'image_ocr_span'}
										<li>Unreviewed OCR · {citation.text}{citation.truncated ? ' (excerpt)' : ''}</li>
									{:else if citation}
										<li>{citation.kind === 'detection' ? 'Detection' : 'Mask'} · {citation.label} · Cell {String.fromCharCode(65 + citation.imageCell.column)}{citation.imageCell.row + 1}
											{#if citation.kind === 'segmentation_mask' && saved.sourceState === 'CURRENT'}
												<a href={savedMaskHref(saved.chapter, id)} target="_blank" rel="noreferrer">Open cited mask</a>
											{/if}
										</li>
									{/if}
								{/each}
							</ul>
						</li>
					{/each}
				</ol>
			{:else if data.savedChapterRequested}
				<p role="status">This saved chapter could not be opened.</p>
			{/if}
		</section>
	{/if}

	{#key data.caseId}<StorybookAuthorities caseId={data.caseId} />{/key}

	<section aria-labelledby="markers-heading">
		<h2 id="markers-heading">Evidence markers <small>{data.markers.length} placed</small></h2>
		{#if data.markers.length === 0}
			<div class="empty-state">
				<p class="empty">No saved case-scene markers yet. Evidence Board pins and local 3D preflight placements are separate and do not appear here. Choose an uploaded exhibit, then use Detective Mode’s “Place marker” action to save an evidence-linked position.</p>
				<a class="case-action primary" href={`/cases/${encodeURIComponent(data.caseId)}/board?view=detective`}>Choose exhibit · place marker</a>
			</div>
		{:else}
			<table>
				<thead>
					<tr><th>Scene</th><th>Marker</th><th>Evidence</th><th>Saved location</th><th>Source binding</th><th></th></tr>
				</thead>
				<tbody>
					{#each data.markers as marker (marker.id)}
						<tr>
							<td>{marker.sceneKey}</td>
							<td>{marker.label ?? marker.markerKey}</td>
							<td>{marker.evidenceTitle}</td>
							<td>
								{#if marker.anchorKind === 'IMAGE_UV' && marker.anchorU !== null && marker.anchorV !== null}
									Image point (u, v): {marker.anchorU.toFixed(3)}, {marker.anchorV.toFixed(3)}
								{:else}
									Legacy scene position: {marker.posX.toFixed(2)}, {marker.posY.toFixed(2)}, {marker.posZ.toFixed(2)}
								{/if}
							</td>
							<td>
								{marker.anchorKind ?? 'Unanchored'} · {marker.anchorStatus}
								{#if marker.sourceRevision}
									<br /><small>Source {marker.sourceRevision.slice(0, 19)}…</small>
								{:else}
									<br /><small>Source revision not recorded</small>
								{/if}
							</td>
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
							<dt>Anchor</dt><dd>{marker.anchorKind === 'IMAGE_UV' && marker.anchorU !== null && marker.anchorV !== null ? `Image UV ${marker.anchorU.toFixed(4)}, ${marker.anchorV.toFixed(4)}` : marker.anchorKind ?? 'No source anchor'}</dd>
							<dt>Source revision</dt><dd>{marker.sourceRevision ?? 'Not recorded'}</dd>
						</dl>
						<button type="submit">Close</button>
					</form>
				</dialog>
			{/each}
		{/if}
	</section>

	<section aria-labelledby="add-evidence-heading">
		<h2 id="add-evidence-heading">Add evidence to the scene</h2>
		<p class="note">Choose an uploaded exhibit to open Detective Mode with it selected. The marker is saved only after you place it and receive a save confirmation.</p>
		{#if data.availableEvidence.length === 0}
			<p class="empty">No uploaded evidence is available in this case yet.</p>
			<a class="case-action primary" href={`/cases/${encodeURIComponent(data.caseId)}/evidence/upload`}>Upload evidence</a>
		{:else}
			<ul class="available-evidence">
				{#each data.availableEvidence as item (item.id)}
					<li>
						<span>{item.title ?? 'Untitled evidence'}</span>
						<a class="case-action" href={`/cases/${encodeURIComponent(data.caseId)}/board?view=detective&evidenceId=${encodeURIComponent(item.id)}`}>Place in scene</a>
					</li>
				{/each}
			</ul>
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

	<section aria-labelledby="motion-review-heading" data-testid="case-scene-motion-review">
		<h2 id="motion-review-heading">Video motion and event review</h2>
		<p class="note">Only source-linked items saved in a verified scene revision appear here. Pixel-change cues and image-space poses remain review aids; this panel does not turn them into 3D body motion.</p>
		{#if data.sceneSourcesUnavailable}
			<p class="load-error" role="status">Saved scene source bindings could not be verified. Other case scene data remains available.</p>
		{:else}
			{@const boundScenes = data.sceneSources.filter((scene) => scene.videoEventBindings.length > 0 || scene.groundPlaneTrackProposals.length > 0)}
			{#if boundScenes.length > 0}
				{#each boundScenes as scene (scene.sceneId)}
					<details class="scene-source-revision">
						<summary>
							Scene revision {scene.revision} · {scene.videoEventBindings.length} event link(s) · {scene.groundPlaneTrackProposals.length} motion proposal(s)
						</summary>
						<p class="note"><code>{scene.manifestSha256.slice(0, 16)}…</code> · bindings were loaded from the hash-verified saved manifest.</p>
						<SceneVideoEventBindings
							sceneRevision={{ caseId: data.caseId, sceneId: scene.sceneId, revision: scene.revision }}
							caseId={data.caseId}
							bindings={scene.videoEventBindings}
							groundPlaneTrackProposals={scene.groundPlaneTrackProposals}
							sceneAnimationBindings={scene.sceneAnimationBindings}
						/>
					</details>
				{/each}
			{:else if data.unavailableSceneRevisionCount > 0}
				<p class="load-error" role="status">{data.unavailableSceneRevisionCount} saved scene revision(s) did not pass readback validation and were omitted.</p>
			{:else}
				<p class="empty">No source-linked video events or reviewed motion proposals are saved to a scene revision yet.</p>
			{/if}
		{/if}
	</section>

	<p class="evidence-count">{linkedEvidenceIds.size} evidence item(s) linked to facets.</p>
</main>

<style>
	.chapter-grid { display: grid; width: min(100%, 22rem); border: 1px solid var(--dossier-hairline, #dacdb9); margin-block: .75rem; }
	.chapter-grid span { display: grid; place-items: center; min-height: 2rem; border: 1px solid var(--dossier-hairline, #dacdb9); font-size: .75rem; }
	.chapter-grid .occupied { background: #f6e3a7; color: #3d3019; font-weight: 700; }
	.crime-scene { padding: 20px; width: min(100% - 32px, 1320px); margin: 20px auto; color: var(--dossier-text-main, #141312); background: var(--dossier-bg-card, #faf6f0); border: 1px solid var(--dossier-hairline, #e2d7c9); border-radius: var(--dossier-radius-card, 10px); box-shadow: var(--dossier-shadow-card, 0 1px 2px rgba(60, 40, 20, .04)); font: 14px/1.5 system-ui, sans-serif; }
	.case-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 20px; }
	.available-evidence { display: grid; gap: 8px; padding: 0; list-style: none; }
	.available-evidence li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--dossier-hairline, #e2d7c9); }
	.scene-source-revision { margin-top: 10px; padding: 10px 12px; background: #fffdf9; border: 1px solid var(--dossier-hairline, #e2d7c9); border-radius: 8px; }
	.scene-source-revision summary { cursor: pointer; color: var(--dossier-text-main, #30261b); font-weight: 650; }
	.scene-source-revision summary:focus-visible { outline: 2px solid var(--dossier-gold, #c9a86a); outline-offset: 3px; }
	.scene-source-revision code { overflow-wrap: anywhere; }
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
