<script lang="ts">
	import { z } from 'zod';
	import { untrack } from 'svelte';
	import { STORYBOOK_REGION_GRID_SIZE, storybookRegionDecisionLabels, storybookRegionReviewV1Schema, type StorybookRegionReviewV1 } from '$lib/shared/storybook-region-review-v1.js';

	type Cell = Pick<Extract<StorybookRegionReviewV1, { column: number }>, 'column' | 'row'>;
	type Source = Pick<StorybookRegionReviewV1, 'analysisRevision' | 'width' | 'height'> & (
		{ frameIndex: number; artifactSha256: string; timestampMs: number } | { observationRevision: string; observationId?: string }
	);
	let { caseId, evidenceId, sourceRevision, target, previewReady, acceptEnabled = true, onCellChange, onReviewSaved }: {
		caseId: string; evidenceId: string; sourceRevision: string; target: Source; previewReady: boolean;
		onCellChange?: (cell: Cell) => void;
		acceptEnabled?: boolean;
		onReviewSaved?: () => void;
	} = $props();

	const rowSchema = z.object({ id: z.uuid(), version: z.number().int().positive(), metadata: z.object({
		schema: z.literal('atlas.evidence-annotation-revision.v1'), evidenceId: z.uuid(), caseId: z.uuid(), parentSha256: z.string(),
		annotationSha256: z.string(), annotation: z.object({ storybookRegionReview: storybookRegionReviewV1Schema }),
	}) });
	const receiptSchema = z.object({ ok: z.literal(true), committed: z.literal(true), versionId: z.uuid(), annotationSha256: z.string() });
	const historySchema = z.object({ evidenceId: z.uuid(), versions: z.array(z.unknown()).max(200), reviewEnabled: z.boolean(), error: z.string().optional() });
	const grid = Array.from({ length: STORYBOOK_REGION_GRID_SIZE }, (_, index) => index);
	const observationId = $derived('observationId' in target ? target.observationId : undefined);
	const reviewLabel = $derived(observationId ? 'Observation review' : 'Image region review');
	const decisions = $derived(observationId ? ['UNCERTAIN', 'ACCEPTED', 'REJECTED'] as const
		: ['UNCLASSIFIED', 'NOT_REVIEWED', 'NO_OBJECT_OBSERVED'] as const);
	let column = $state(0);
	let row = $state(0);
	let decision = $state<StorybookRegionReviewV1['decision']>(untrack(() => decisions[0]));
	let notes = $state('');
	let reviews = $state<Array<z.infer<typeof rowSchema>>>([]);
	let historyStatus = $state<'loading' | 'ready' | 'unavailable'>('loading');
	let reviewEnabled = $state(false);
	let saving = $state(false);
	let status = $state('');
	let lastAttempt: { key: string; reviewId: string } | null = null;
	const selected = $derived(reviews.find(({ metadata }) => {
		const review = metadata.annotation.storybookRegionReview;
		return 'observationId' in review ? review.observationId === observationId
			: !observationId && review.column === column && review.row === row;
	}));
	const endpoint = $derived(`/api/evidence/${encodeURIComponent(evidenceId)}/versions`);

	function sameSource(review: StorybookRegionReviewV1, source: Source) {
		if (review.analysisRevision !== source.analysisRevision || review.width !== source.width || review.height !== source.height) return false;
		if ('observationRevision' in source) {
			return 'observationRevision' in review && review.observationRevision === source.observationRevision;
		}
		return 'frameIndex' in review && review.frameIndex === source.frameIndex &&
			review.artifactSha256 === source.artifactSha256 && review.timestampMs === source.timestampMs;
	}

	async function loadReviews(signal?: AbortSignal) {
		const source = { ...target };
		const expectedCase = caseId;
		const expectedEvidence = evidenceId;
		const expectedRevision = sourceRevision;
		const expectedCell = { column, row };
		const locator = 'observationRevision' in source
			? { regionImage: source.observationRevision }
			: { regionFrame: String(source.frameIndex), artifactSha256: source.artifactSha256 };
		const itemId = 'observationId' in source ? source.observationId : undefined;
		const query = new URLSearchParams({ ...locator, analysisRevision: source.analysisRevision, sourceRevision: expectedRevision, limit: '25' });
		if (itemId) query.set('observationId', itemId);
		else {
			query.set('regionColumn', String(expectedCell.column));
			query.set('regionRow', String(expectedCell.row));
		}
		const response = await fetch(`${endpoint}?${query}`, { signal, cache: 'no-store' });
		const result = historySchema.safeParse(await response.json());
		if (!response.ok || !result.success || result.data.error || result.data.evidenceId !== expectedEvidence) {
			throw new Error('Region review history is unavailable.');
		}
		const rows = result.data.versions.flatMap((entry) => {
			const item = rowSchema.safeParse(entry);
			if (!item.success) return [];
			const { metadata } = item.data;
			const review = metadata.annotation.storybookRegionReview;
			return metadata.caseId === expectedCase && metadata.evidenceId === expectedEvidence && metadata.parentSha256 === expectedRevision &&
				sameSource(review, source) && ('observationId' in review ? review.observationId === itemId
					: !itemId && review.column === expectedCell.column && review.row === expectedCell.row) ? [item.data] : [];
		}).sort((a, b) => b.version - a.version);
		if (!signal?.aborted) {
			reviewEnabled = result.data.reviewEnabled;
			reviews = rows;
			historyStatus = 'ready';
		}
		return rows;
	}

	$effect(() => {
		const controller = new AbortController();
		historyStatus = 'loading';
		void loadReviews(controller.signal).catch(() => {
			if (!controller.signal.aborted) historyStatus = 'unavailable';
		});
		return () => controller.abort();
	});

	async function saveReview() {
		if (!reviewEnabled || !previewReady || saving || (decision === 'ACCEPTED' && !acceptEnabled)) return;
		const form = { ...target, ...(observationId ? {} : { column, row }), decision, notes: notes.trim() };
		const key = JSON.stringify(form);
		if (lastAttempt?.key !== key) lastAttempt = { key, reviewId: crypto.randomUUID() };
		const parsed = storybookRegionReviewV1Schema.safeParse({ ...form, reviewId: lastAttempt.reviewId, schema: 'atlas.storybook-region-review.v1' });
		if (!parsed.success) { status = 'This review is incomplete.'; return; }
		saving = true;
		status = '';
		try {
			const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
				schema: 'atlas.evidence-annotation-revision-request.v1', caseId, parentSha256: sourceRevision,
				annotation: { schema: 'atlas.evidence-annotation.v1', modality: 'observationRevision' in form ? 'image' : 'video', annotations: [], storybookRegionReview: parsed.data },
			}) });
			const body: unknown = await response.json();
			const receipt = receiptSchema.safeParse(body);
			if (!response.ok || !receipt.success) {
				const problem = z.object({ error: z.string().max(300) }).safeParse(body);
				throw new Error(problem.success ? problem.data.error : 'The region review could not be recorded.');
			}
			const recorded = (await loadReviews()).some(({ id, metadata }) => {
				const saved = metadata.annotation.storybookRegionReview;
				return id === receipt.data.versionId && metadata.annotationSha256 === receipt.data.annotationSha256 &&
					saved.reviewId === parsed.data.reviewId && saved.decision === parsed.data.decision && saved.notes === parsed.data.notes;
			});
			if (!recorded) throw new Error('The saved review could not be confirmed. Retry to check it again.');
			lastAttempt = null;
			status = observationId ? 'Observation review recorded.' : 'Region review recorded.';
			onReviewSaved?.();
			notes = '';
		} catch (cause) {
			status = cause instanceof Error ? cause.message : 'The region review could not be recorded.';
		} finally {
			saving = false;
		}
	}
</script>

<section aria-label={reviewLabel}>
	<h4>{reviewLabel}</h4>
	{#if !observationId}
	<div class="region-fields">
		<label>Column <select bind:value={column} onchange={(event) => onCellChange?.({ column: Number((event.currentTarget as HTMLSelectElement).value), row })} disabled={saving}>
			{#each grid as index}<option value={index}>{String.fromCharCode(65 + index)}</option>{/each}
		</select></label>
		<label>Row <select bind:value={row} onchange={(event) => onCellChange?.({ column, row: Number((event.currentTarget as HTMLSelectElement).value) })} disabled={saving}>
			{#each grid as index}<option value={index}>{index + 1}</option>{/each}
		</select></label>
		<button type="button" onclick={() => onCellChange?.({ column, row })} disabled={!previewReady}>Show region</button>
	</div>
	{/if}
	{#if historyStatus === 'loading'}
		<p>Loading region history…</p>
	{:else if historyStatus === 'unavailable'}
		<p>Region review history is unavailable.</p>
	{:else if selected}
		{@const review = selected.metadata.annotation.storybookRegionReview}
		<p>Latest decision: {storybookRegionDecisionLabels[review.decision]} · Revision {selected.version}</p>
		{#if review.notes}<p>{review.notes}</p>{/if}
	{:else}
		<p>No review recorded for this {observationId ? 'observation' : 'cell'}.</p>
	{/if}
	{#if reviewEnabled}
		<form onsubmit={(event) => { event.preventDefault(); void saveReview(); }}>
			<label>Decision <select bind:value={decision} disabled={saving}>
				{#each decisions as value}<option {value}>{storybookRegionDecisionLabels[value]}</option>{/each}
			</select></label>
			<label>Notes <textarea bind:value={notes} maxlength="600" rows="2" disabled={saving}></textarea></label>
			<button type="submit" disabled={!previewReady || saving || historyStatus !== 'ready' || (decision === 'ACCEPTED' && !acceptEnabled)}>{saving ? 'Saving…' : observationId ? 'Record observation review' : 'Record region review'}</button>
			{#if decision === 'ACCEPTED' && !acceptEnabled}<p>Open the mask preview before accepting it.</p>{/if}
		</form>
	{/if}
	{#if status}<p role="status">{status}</p>{/if}
</section>

<style>
	section { margin: 1rem 0; padding: .75rem; border: 1px solid var(--dossier-hairline, #dacdb9); border-radius: .35rem; }
	h4 { margin: 0 0 .5rem; }
	p { margin: .5rem 0; overflow-wrap: anywhere; }
	.region-fields, form { display: flex; flex-wrap: wrap; align-items: end; gap: .5rem; }
	label { display: grid; gap: .2rem; }
	select, textarea, button { padding: .4rem; border: 1px solid var(--dossier-hairline, #dacdb9); border-radius: .35rem; background: transparent; color: inherit; font: inherit; }
</style>
