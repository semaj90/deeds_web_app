<script lang="ts">
	import { onMount } from 'svelte';

	type EvidenceOption = { id: string; title?: string; name?: string };
	type FacetKind = 'WHO' | 'WHAT' | 'WHY' | 'HOW';
	type LinkedEvidence = { evidenceId: string; title: string; fileName: string | null; summary: string | null; relevance: number; note: string | null };
	type Facet = { id: string; facetKind: FacetKind; claimText: string; status: string; confidence: number | null; evidence: LinkedEvidence[] };
	type SummaryExport = { id: string; revision: number; summaryMarkdown: string; citations: string[]; modelId: string; createdAt: string; summarySha256: string; inputManifestSha256: string; status: 'DRAFT' | 'APPROVED' | 'REJECTED'; latestReview: { decision: string; reviewedBy: number; reviewedAt: string; note: string | null } | null };

	let {
		caseId,
		evidenceItems = [] as EvidenceOption[]
	}: { caseId: string; evidenceItems?: EvidenceOption[] } = $props();

	const KINDS: FacetKind[] = ['WHO', 'WHAT', 'WHY', 'HOW'];
	const KIND_HINT: Record<FacetKind, string> = {
		WHO: 'Subjects, suspects, victims, witnesses',
		WHAT: 'The act or event that occurred',
		WHY: 'Motive or purpose',
		HOW: 'Method and sequence'
	};

	let facets = $state<Facet[]>([]);
	let exportsList = $state<SummaryExport[]>([]);
	let loading = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);

	let newKind = $state<FacetKind>('WHO');
	let newClaim = $state('');
	let linkTarget = $state<Record<string, string>>({});

	const latest = $derived(exportsList[0] ?? null);
	const evidenceLabel = (item: EvidenceOption) => item.title ?? item.name ?? item.id;
	const base = $derived(`/api/cases/${encodeURIComponent(caseId)}/investigation`);

	async function call(path: string, init?: RequestInit) {
		const response = await fetch(`${base}${path}`, {
			...init,
			headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
		});
		const body = await response.json().catch(() => null);
		if (!response.ok || !body?.success) {
			throw new Error(body?.message ?? `Request failed (${response.status})`);
		}
		return body.data;
	}

	async function refresh() {
		loading = true;
		error = null;
		try {
			const data = await call('');
			facets = data.facets ?? [];
			exportsList = data.exports ?? [];
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not load investigation';
		} finally {
			loading = false;
		}
	}

	async function run(action: () => Promise<unknown>) {
		busy = true;
		error = null;
		try {
			await action();
			await refresh();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Action failed';
		} finally {
			busy = false;
		}
	}

	function addFacet() {
		const claim = newClaim.trim();
		if (!claim) return;
		run(async () => {
			await call('/facets', { method: 'POST', body: JSON.stringify({ facetKind: newKind, claimText: claim }) });
			newClaim = '';
		});
	}

	function linkTo(facetId: string) {
		const evidenceId = linkTarget[facetId];
		if (!evidenceId) return;
		run(async () => {
			await call(`/facets/${facetId}/evidence`, { method: 'POST', body: JSON.stringify({ evidenceId }) });
			linkTarget[facetId] = '';
		});
	}

	function unlink(facetId: string, evidenceId: string) {
		run(() => call(`/facets/${facetId}/evidence/${evidenceId}`, { method: 'DELETE' }));
	}

	function exportSummary() {
		run(() => call('/summary-exports', { method: 'POST', body: JSON.stringify({ commandId: crypto.randomUUID() }) }));
	}

	/** Four-eyes: the server rejects a review by the export's author, and the error is shown here. */
	function reviewExport(exportId: string, decision: 'APPROVED' | 'REJECTED') {
		run(() => call(`/summary-exports/${exportId}/review`, { method: 'POST', body: JSON.stringify({ decision }) }));
	}

	onMount(refresh);
</script>

<section class="investigation" aria-label="Investigation: who, what, why and how">
	<header class="inv-header">
		<h2>Investigation</h2>
		<a class="inv-btn" href="/cases/{caseId}/crime-scene">Crime scene</a>
		<button type="button" class="inv-btn primary" onclick={exportSummary} disabled={busy || loading}>
			{busy ? 'Working…' : 'Export AI summary'}
		</button>
	</header>

	{#if error}
		<p class="inv-error" role="alert">{error}</p>
	{/if}

	<form class="inv-add" onsubmit={(event) => { event.preventDefault(); addFacet(); }}>
		<select bind:value={newKind} aria-label="Facet kind">
			{#each KINDS as kind (kind)}
				<option value={kind}>{kind}</option>
			{/each}
		</select>
		<input type="text" bind:value={newClaim} maxlength="2000" placeholder="Claim, e.g. who had access to the vault" aria-label="Claim text" />
		<button type="submit" class="inv-btn" disabled={busy || !newClaim.trim()}>Add</button>
	</form>

	<div class="inv-grid">
		{#each KINDS as kind (kind)}
			<div class="inv-column">
				<h3>{kind} <small>{KIND_HINT[kind]}</small></h3>
				{#each facets.filter((facet) => facet.facetKind === kind) as facet (facet.id)}
					<article class="inv-facet">
						<p class="claim">{facet.claimText}</p>
						<p class="meta">
							<span class="status">{facet.status}</span>
							{#if facet.confidence !== null}<span>confidence {facet.confidence}</span>{/if}
						</p>
						<ul class="links">
							{#each facet.evidence as link (link.evidenceId)}
								<li>
									<span>{link.title}</span>
									<button type="button" class="inv-link-x" onclick={() => unlink(facet.id, link.evidenceId)} disabled={busy} aria-label="Unlink {link.title}">×</button>
								</li>
							{:else}
								<li class="empty">No evidence linked</li>
							{/each}
						</ul>
						<div class="inv-link-row">
							<select bind:value={linkTarget[facet.id]} aria-label="Evidence to link">
								<option value="">Select evidence…</option>
								{#each evidenceItems as item (item.id)}
									<option value={item.id}>{evidenceLabel(item)}</option>
								{/each}
							</select>
							<button type="button" class="inv-btn" onclick={() => linkTo(facet.id)} disabled={busy || !linkTarget[facet.id]}>Link</button>
						</div>
					</article>
				{:else}
					<p class="empty">No {kind} facets yet</p>
				{/each}
			</div>
		{/each}
	</div>

	<section class="inv-summary" aria-label="Latest AI summary">
		<h3>AI summary {#if latest}<small>revision {latest.revision} · {latest.modelId}</small>{/if}</h3>
		{#if latest}
			<!-- Rendered as text, never as HTML: model output is untrusted. -->
			<pre class="summary-text">{latest.summaryMarkdown}</pre>
			<p class="meta">
				Status <strong>{latest.status}</strong>
				{#if latest.latestReview}· reviewed by user {latest.latestReview.reviewedBy}{/if}
				· {latest.citations.length} cited evidence item(s) · manifest {latest.inputManifestSha256.slice(0, 12)}…
			</p>
			<div class="inv-link-row">
				<button type="button" class="inv-btn" onclick={() => reviewExport(latest.id, 'APPROVED')} disabled={busy || latest.status === 'APPROVED'}>Approve</button>
				<button type="button" class="inv-btn" onclick={() => reviewExport(latest.id, 'REJECTED')} disabled={busy || latest.status === 'REJECTED'}>Reject</button>
			</div>
		{:else}
			<p class="empty">No summary exported yet. Link evidence to a facet, then export.</p>
		{/if}
	</section>
</section>

<style>
	.investigation { display: grid; gap: 12px; padding: 12px; color: #1f2430; }
	.inv-header { display: flex; align-items: center; justify-content: space-between; }
	.inv-header h2 { margin: 0; font-size: 16px; }
	.inv-add { display: flex; gap: 8px; }
	.inv-add input { flex: 1; min-width: 0; }
	.inv-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
	.inv-column h3 { font-size: 13px; margin: 0 0 6px; }
	.inv-column h3 small { font-weight: 400; color: #6b7280; margin-left: 4px; }
	.inv-facet { border: 1px solid #d6d9e0; border-radius: 6px; padding: 8px; margin-bottom: 8px; background: #fff; }
	.claim { margin: 0 0 4px; font-size: 13px; }
	.meta { margin: 0 0 6px; font-size: 11px; color: #6b7280; display: flex; gap: 8px; }
	.status { font-weight: 600; }
	.links { list-style: none; padding: 0; margin: 0 0 6px; font-size: 12px; }
	.links li { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; }
	.inv-link-x { border: none; background: none; cursor: pointer; color: #b91c1c; }
	.inv-link-row { display: flex; gap: 6px; }
	.inv-link-row select { flex: 1; min-width: 0; }
	.inv-btn { padding: 4px 10px; border: 1px solid #9ca3af; border-radius: 4px; background: #f9fafb; cursor: pointer; }
	.inv-btn.primary { background: #1f2430; color: #fff; border-color: #1f2430; }
	.inv-btn:disabled { opacity: 0.5; cursor: default; }
	.inv-error { color: #b91c1c; margin: 0; font-size: 12px; }
	.empty { color: #6b7280; font-size: 12px; font-style: italic; }
	.inv-summary h3 { font-size: 13px; margin: 0 0 6px; }
	.inv-summary h3 small { font-weight: 400; color: #6b7280; margin-left: 6px; }
	.summary-text { white-space: pre-wrap; word-break: break-word; font: 13px/1.5 system-ui, sans-serif; background: #f8fafc; border: 1px solid #d6d9e0; border-radius: 6px; padding: 10px; margin: 0; max-height: 360px; overflow: auto; }
</style>
