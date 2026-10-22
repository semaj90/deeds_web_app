<script lang="ts">
	let { data } = $props();
	const view = $derived(data.view);
</script>

<svelte:head>
	<title>Feature labels (read-only)</title>
</svelte:head>

<main class="mx-auto max-w-6xl p-4 space-y-6">
	<header>
		<h1 class="text-xl font-semibold">Feature labels — read-only</h1>
		<p class="text-sm opacity-75">
			Status: {view.status}{view.error ? ` — ${view.error}` : ''} · Approved labels table: {view.approvedLabelsTable}
		</p>
		<p class="text-sm opacity-75">
			Approved labels come only from reviewed revisions. Candidate labels and ontology tuples are not approved.
		</p>
	</header>

	<section>
		<h2 class="font-medium">Feature IDs ({view.featureIds.length})</h2>
		<table class="w-full text-sm">
			<thead><tr><th class="text-left">feature_id</th><th class="text-left">namespace</th><th class="text-left">type</th></tr></thead>
			<tbody>
				{#each view.featureIds as f (f.featureId)}
					<tr><td>{f.featureId}</td><td>{f.featureNamespace}</td><td>{f.featureType}</td></tr>
				{:else}
					<tr><td colspan="3">No rows in atlas_features.</td></tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section>
		<h2 class="font-medium">Approved labels ({view.approvedLabels.length})</h2>
		<table class="w-full text-sm">
			<thead><tr><th class="text-left">feature_id</th><th>rev</th><th class="text-left">label</th><th class="text-left">domain</th><th class="text-left">capability</th><th class="text-left">concept</th><th class="text-left">reviewed by</th></tr></thead>
			<tbody>
				{#each view.approvedLabels as a (a.featureId)}
					<tr><td>{a.featureId}</td><td>{a.labelRevision}</td><td>{a.featureLabel}</td><td>{a.domainClass ?? '—'}</td><td>{a.capability ?? '—'}</td><td>{a.conceptId ?? '—'}</td><td>{a.reviewedBy ?? '—'}</td></tr>
				{:else}
					<tr><td colspan="7">No approved labels.</td></tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section>
		<h2 class="font-medium">Candidate labels — unreviewed ({view.candidateLabels.length})</h2>
		<table class="w-full text-sm">
			<thead><tr><th class="text-left">feature_id</th><th class="text-left">candidate label</th><th class="text-left">domain</th><th class="text-left">status</th></tr></thead>
			<tbody>
				{#each view.candidateLabels as c (c.featureId)}
					<tr><td>{c.featureId}</td><td>{c.featureLabel ?? '—'}</td><td>{c.domain ?? '—'}</td><td>{c.status ?? '—'} ({c.authority})</td></tr>
				{:else}
					<tr><td colspan="4">No candidate rows.</td></tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section>
		<h2 class="font-medium">Source mappings ({view.sourceMappings.length})</h2>
		<table class="w-full text-sm">
			<thead><tr><th class="text-left">normalized_path</th><th class="text-left">source_ref</th><th class="text-left">feature_id</th></tr></thead>
			<tbody>
				{#each view.sourceMappings as m (m.normalizedPath)}
					<tr><td>{m.normalizedPath}</td><td>{m.sourceRef ?? '—'}</td><td>{m.featureId ?? '—'}</td></tr>
				{:else}
					<tr><td colspan="3">No mapping rows.</td></tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section>
		<h2 class="font-medium">Ontology crosswalk (tuples by resolution state)</h2>
		<ul class="text-sm list-disc pl-5">
			{#each view.ontologyCrosswalks as o (o.resolutionState)}
				<li>{o.resolutionState ?? 'NULL'}: {o.tuples}</li>
			{:else}
				<li>No ontology tuples.</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2 class="font-medium">Unresolved evidence ({view.unresolvedEvidence.length})</h2>
		<ul class="text-sm list-disc pl-5">
			{#each view.unresolvedEvidence as e (`${e.sourceRef}|${e.packetKey}`)}
				<li>{e.sourceRef ?? '—'} · {e.language ?? '—'}</li>
			{:else}
				<li>No evidence rows.</li>
			{/each}
		</ul>
	</section>
</main>
