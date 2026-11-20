<script lang="ts">
	import { z } from 'zod';

	let { caseId }: { caseId: string } = $props();
	const endpoint = $derived(`/api/cases/${encodeURIComponent(caseId)}/storybook-authorities`);
	const jurisdictionSchema = z.object({ code: z.string(), name: z.string() });
	const resultSchema = z.object({
		status: z.enum(['READY_FOR_REVIEW', 'NO_VERIFIED_PASSAGES']),
		jurisdiction: z.string(),
		coverage: z.object({ matched: z.number(), verified: z.number(), shown: z.number(), matchLimit: z.number() }),
		citationManifestSha256: z.string().nullable(),
		authorities: z.array(z.object({
			chunkId: z.uuid(), documentId: z.uuid(), documentRevision: z.uuid(), documentTitle: z.string(),
			sourceHash: z.string(), chunkHash: z.string(), quote: z.string(), pageStart: z.number().nullable(),
			charStart: z.number(), excerptCharEnd: z.number(),
			authority: z.object({ kind: z.string(), citation: z.string(), jurisdiction: z.string() }),
		})).max(6),
	});
	let visible = $state(false);
	let jurisdictions = $state<z.infer<typeof jurisdictionSchema>[]>([]);
	let jurisdiction = $state('');
	let question = $state('');
	let state = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let searching = $state(false);
	let error = $state('');
	let result = $state<z.infer<typeof resultSchema> | null>(null);
	let citing = $state<z.infer<typeof resultSchema> | null>(null);
	let citingTarget = $state('');
	let checkingCites = $state(false);
	let citingError = $state('');

	async function open() {
		visible = !visible;
		if (!visible || state === 'ready' || state === 'loading') return;
		state = 'loading';
		try {
			const response = await fetch(endpoint, { cache: 'no-store' });
			if (!response.ok) throw new Error();
			jurisdictions = z.object({ jurisdictions: z.array(jurisdictionSchema).max(100) }).parse(await response.json()).jurisdictions;
			jurisdiction = jurisdictions.length === 1 ? jurisdictions[0].code : '';
			state = 'ready';
		} catch {
			state = 'error';
		}
	}

	async function search() {
		if (!question.trim() || !jurisdiction || searching || checkingCites) return;
		searching = true;
		result = null;
		citing = null;
		citingTarget = '';
		citingError = '';
		error = '';
		try {
			const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question, jurisdiction }) });
			if (!response.ok) throw new Error();
			result = resultSchema.parse(await response.json());
		} catch {
			error = 'Case authority search is unavailable.';
		} finally {
			searching = false;
		}
	}

	async function findCiting(entry: z.infer<typeof resultSchema>['authorities'][number]) {
		if (!result || searching || checkingCites) return;
		checkingCites = true;
		citing = null;
		citingError = '';
		citingTarget = entry.authority.citation;
		try {
			const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jurisdiction: result.jurisdiction, targetChunkId: entry.chunkId,
					targetRevision: entry.documentRevision, targetChunkHash: entry.chunkHash,
				}) });
			if (response.status === 409) {
				citingError = 'That citation changed or is unavailable. Search again to check the current revision.';
			} else if (response.ok) {
				citing = resultSchema.parse(await response.json());
			} else {
				throw new Error();
			}
		} catch {
			citingError = 'Citing passages are unavailable.';
		} finally {
			checkingCites = false;
		}
	}
</script>

{#snippet sourcePassage(entry: z.infer<typeof resultSchema>['authorities'][number])}
	<h3>{entry.authority.citation}</h3>
	<p>{entry.documentTitle} · {entry.authority.kind}{entry.pageStart ? ` · Page ${entry.pageStart}` : ''}</p>
	<blockquote>{entry.quote}</blockquote>
	<a href={`/library/${encodeURIComponent(entry.documentId)}`}>Open library source</a>
	<details><summary>Citation provenance</summary>
		<dl>
			<dt>Document revision</dt><dd>{entry.documentRevision}</dd>
			<dt>Source SHA-256</dt><dd>{entry.sourceHash}</dd>
			<dt>Chunk SHA-256</dt><dd>{entry.chunkHash}</dd>
			<dt>Excerpt offsets (UTF-16)</dt><dd>{entry.charStart}–{entry.excerptCharEnd}</dd>
		</dl>
	</details>
{/snippet}

<section aria-labelledby="storybook-authorities">
	<h2 id="storybook-authorities">Legal research</h2>
	<button type="button" aria-expanded={visible} onclick={open}>{visible ? 'Close authority search' : 'Search linked authorities'}</button>
	{#if visible}
		{#if state === 'loading'}
			<p role="status">Checking linked jurisdictions…</p>
		{:else if state === 'error'}
			<p role="status">Linked jurisdictions are unavailable.</p>
		{:else if !jurisdictions.length}
			<p>No official authorities with a registered jurisdiction are linked to this case.</p>
		{:else}
			<form onsubmit={(event) => { event.preventDefault(); void search(); }}>
				<label>Research jurisdiction
					<select bind:value={jurisdiction} required disabled={searching}>
						<option value="">Choose a jurisdiction</option>
						{#each jurisdictions as item (item.code)}<option value={item.code}>{item.name} ({item.code})</option>{/each}
					</select>
				</label>
				<label>Research question
					<input bind:value={question} maxlength="500" required disabled={searching} />
				</label>
				<button type="submit" disabled={searching || checkingCites || !jurisdiction || !question.trim()}>{searching ? 'Searching…' : 'Find passages'}</button>
			</form>
		{/if}
		{#if error}<p role="status">{error}</p>{/if}
		{#if result}
			<p role="status">{result.status === 'READY_FOR_REVIEW' ? 'Passages ready for review' : 'No verified passages found'} · {result.jurisdiction}</p>
			<p>{result.coverage.shown} shown from {result.coverage.verified} verified passages and {result.coverage.matched} matches.
				Search covers up to {result.coverage.matchLimit} passages linked to this case. Contrary authority and later history require review.</p>
			{#each result.authorities as entry (entry.chunkId)}
				<article>
					{@render sourcePassage(entry)}
					<button type="button" aria-label={`Find passages citing ${entry.authority.citation}`}
						disabled={checkingCites} onclick={() => void findCiting(entry)}>Find citing passages</button>
				</article>
			{/each}
		{/if}
		{#if citingTarget}
			<h3>Citing passages for {citingTarget}</h3>
			<p>Scope covers indexed citations in this case and jurisdiction. Review each passage for how it treats the authority.</p>
			{#if checkingCites}<p role="status">Checking citation links…</p>{/if}
			{#if citingError}<p role="status">{citingError}</p>{/if}
			{#if citing}
				<p role="status">{citing.coverage.shown} shown from {citing.coverage.verified} verified citing passages and {citing.coverage.matched} matches.</p>
				{#each citing.authorities as entry (entry.chunkId)}
					<article>{@render sourcePassage(entry)}</article>
				{/each}
			{/if}
		{/if}
	{/if}
</section>

<style>
	form { display: flex; flex-wrap: wrap; align-items: end; gap: .75rem; margin-block: .75rem; }
	label { display: grid; gap: .25rem; }
	label:has(input) { flex: 1 1 15rem; }
	input, select, button { font: inherit; color: inherit; padding: .4rem; border: 1px solid var(--dossier-hairline-strong, #cdbfa9); border-radius: .35rem; background: var(--dossier-bg-card, #faf6ee); }
	article { border-top: 1px solid var(--dossier-hairline, #dacdb9); margin-top: .75rem; padding-top: .65rem; overflow-wrap: anywhere; }
	h3, article p { margin: 0 0 .35rem; }
	blockquote { white-space: pre-wrap; margin: .6rem 0; padding-inline-start: .75rem; border-inline-start: 2px solid var(--dossier-hairline-strong, #cdbfa9); }
	dd { margin-inline-start: 0; }
</style>
