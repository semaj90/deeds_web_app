<script lang="ts">
	import type { PageData } from './$types';

	type VocabularyRow = {
		groupId: string;
		groupLabel: string;
		parentGroupId: string | null;
		description: string | null;
		taxonomyLevel: number;
		confidence: number;
		examples: string[];
		updatedAt: string;
	};

	type ResolutionResult = {
		schemaVersion: string;
		label: string;
		resolutionState: 'RESOLVED' | 'UNRESOLVED' | 'AMBIGUOUS' | 'RESOLUTION_UNAVAILABLE';
		conceptId: string | null;
		candidateConceptIds: string[];
		matchMethod: string | null;
		ontologyRevision: string | null;
	};

	type OakSearchMatch = { entityId: string; label: string | null };

	let { data }: { data: PageData } = $props();

	let testLabel = $state('');
	let testResult = $state<ResolutionResult | null>(null);
	let testError = $state<string | null>(null);
	let testPending = $state(false);

	let oakQuery = $state('');
	let oakMatches = $state<OakSearchMatch[] | null>(null);
	let oakError = $state<string | null>(null);
	let oakPending = $state(false);

	const vocabulary = $derived((data.vocabulary as VocabularyRow[]) ?? []);
	const topLevel = $derived(vocabulary.filter((row) => row.parentGroupId === null));
	const childrenByParent = $derived.by(() => {
		const map = new Map<string, VocabularyRow[]>();
		for (const row of vocabulary) {
			if (!row.parentGroupId) continue;
			const list = map.get(row.parentGroupId) ?? [];
			list.push(row);
			map.set(row.parentGroupId, list);
		}
		return map;
	});

	async function runResolverTest() {
		if (!testLabel.trim()) return;
		testPending = true;
		testError = null;
		testResult = null;
		try {
			const res = await fetch('/api/admin/atlas/ontology-resolution', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ label: testLabel.trim() }),
			});
			const body = await res.json();
			if (!res.ok || !body.ok) {
				testError = body.error ?? `Request failed (${res.status})`;
			} else {
				testResult = body.result;
			}
		} catch (err) {
			testError = err instanceof Error ? err.message : String(err);
		} finally {
			testPending = false;
		}
	}

	async function runOakSearch() {
		if (!oakQuery.trim()) return;
		oakPending = true;
		oakError = null;
		oakMatches = null;
		try {
			const res = await fetch('/api/admin/atlas/ontology-resolution/oak-search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: oakQuery.trim(), limit: 20 }),
			});
			const body = await res.json();
			if (!res.ok || !body.ok) {
				oakError = body.error ?? `Request failed (${res.status})`;
			} else {
				oakMatches = body.result.matches ?? [];
			}
		} catch (err) {
			oakError = err instanceof Error ? err.message : String(err);
		} finally {
			oakPending = false;
		}
	}

	const stateColor: Record<string, string> = {
		RESOLVED: 'text-green-600',
		UNRESOLVED: 'text-sand-500',
		AMBIGUOUS: 'text-warning',
		RESOLUTION_UNAVAILABLE: 'text-danger',
	};
</script>

<div class="app-bg p-6 flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Ontology Resolution Boundary</h1>
		<p class="text-sm opacity-70">
			Phase 1/2 of parent-atlas-ontology-oaklib-fanout-bitmap — the OAKLIB-equivalent
			concept vocabulary root (<code>atlas_domain_ontology</code>) and
			<code>feature_ontology_tuples</code> resolution-state coverage.
		</p>
	</div>

	{#if !data.migrationApplied}
		<div class="panel p-4 border border-warning">
			<strong>Phase 2 migration not yet applied.</strong> <code>feature_ontology_tuples</code>
			doesn't have <code>resolved_concept_id</code>/<code>resolution_state</code> columns yet
			— resolution stats below are unavailable, but the concept vocabulary and the live
			resolver test tool still work.
		</div>
	{:else}
		<div class="panel p-4">
			<h2 class="text-lg font-medium mb-2">Resolution coverage ({data.totalTuples} tuples)</h2>
			<div class="flex gap-6 flex-wrap">
				{#each Object.entries(data.resolutionStats ?? {}) as [state, count]}
					<div class="flex flex-col">
						<span class="text-2xl font-semibold {stateColor[state] ?? ''}">{count}</span>
						<span class="text-xs opacity-70">{state}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="panel p-4">
		<h2 class="text-lg font-medium mb-3">Concept vocabulary ({vocabulary.length} concepts)</h2>
		<div class="flex flex-col gap-3">
			{#each topLevel as parent (parent.groupId)}
				<div>
					<div class="flex items-baseline gap-2">
						<span class="tag">{parent.groupId}</span>
						<span class="font-medium">{parent.groupLabel}</span>
					</div>
					{#if parent.examples.length > 0}
						<p class="text-xs opacity-60 ml-1">{parent.examples.join(', ')}</p>
					{/if}
					{#if childrenByParent.get(parent.groupId)?.length}
						<ul class="ml-6 mt-1 flex flex-col gap-1">
							{#each childrenByParent.get(parent.groupId) ?? [] as child (child.groupId)}
								<li class="flex items-baseline gap-2">
									<span class="tag">{child.groupId}</span>
									<span>{child.groupLabel}</span>
									{#if child.examples.length > 0}
										<span class="text-xs opacity-60">({child.examples.join(', ')})</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<div class="panel p-4">
		<h2 class="text-lg font-medium mb-3">Test the resolver</h2>
		<div class="flex gap-2">
			<input
				class="border rounded px-2 py-1 flex-1"
				placeholder="e.g. Postgres, vector search, sveltekit"
				bind:value={testLabel}
				onkeydown={(e) => e.key === 'Enter' && runResolverTest()}
			/>
			<button class="btn-primary" disabled={testPending} onclick={runResolverTest}>
				{testPending ? 'Resolving…' : 'Resolve'}
			</button>
		</div>

		{#if testError}
			<p class="text-danger mt-2">{testError}</p>
		{/if}

		{#if testResult}
			<div class="mt-3 flex flex-col gap-1 text-sm">
				<div>
					State: <span class="font-medium {stateColor[testResult.resolutionState] ?? ''}">
						{testResult.resolutionState}
					</span>
				</div>
				<div>Concept ID: <code>{testResult.conceptId ?? '(none)'}</code></div>
				{#if testResult.candidateConceptIds.length > 0}
					<div>Candidates: {testResult.candidateConceptIds.join(', ')}</div>
				{/if}
				<div>Match method: {testResult.matchMethod ?? '(none)'}</div>
			</div>
		{/if}
	</div>

	<div class="panel p-4">
		<h2 class="text-lg font-medium mb-1">OAK kernel (concept-level, port 8095)</h2>
		<p class="text-xs opacity-60 mb-3">
			A separate system this page does not own — real <code>oaklib</code> behind
			<code>python/atlas_oak_kernel.py</code>, owned by
			<code>openspec/changes/parent-atlas-ontology-kernel</code>. Resolves against
			<code>atlas_ontology_concepts</code>/<code>atlas_ontology_relations</code> (currently
			empty), not the <code>atlas_domain_ontology</code> vocabulary above.
		</p>

		{#if data.oakKernel.reachable}
			<div class="text-sm flex flex-wrap gap-x-6 gap-y-1 mb-3">
				<span>oaklib: <strong>{data.oakKernel.oaklibVersion ?? 'unknown'}</strong></span>
				<span>adapter: <strong>{data.oakKernel.adapterType ?? '(none)'}</strong></span>
				<span>mode: <strong>{data.oakKernel.mode ?? 'unknown'}</strong></span>
			</div>
		{:else}
			<div class="text-warning text-sm mb-3">Sidecar unreachable (is miniforge-nlp-sidecar running on :8095?)</div>
		{/if}

		<div class="flex gap-2">
			<input
				class="border rounded px-2 py-1 flex-1"
				placeholder="concept-level search, e.g. postgres"
				bind:value={oakQuery}
				onkeydown={(e) => e.key === 'Enter' && runOakSearch()}
			/>
			<button class="btn-primary" disabled={oakPending} onclick={runOakSearch}>
				{oakPending ? 'Searching…' : 'Search'}
			</button>
		</div>

		{#if oakError}
			<p class="text-danger mt-2">{oakError}</p>
		{/if}

		{#if oakMatches}
			{#if oakMatches.length === 0}
				<p class="text-xs opacity-60 mt-2">No matches (expected — atlas_ontology_concepts has 0 rows today).</p>
			{:else}
				<ul class="mt-2 text-sm">
					{#each oakMatches as match (match.entityId)}
						<li><code>{match.entityId}</code> — {match.label ?? '(no label)'}</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</div>
