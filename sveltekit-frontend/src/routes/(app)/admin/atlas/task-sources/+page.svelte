<script lang="ts">
	import * as Bits from 'bits-ui';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let activeTab = $state('tasks');
	let tabsReady = $state(false);
	let selectedSourceRefs = $state<string[]>([]);
	let selectionNotice = $state('');
	const MAX_PREFILL_SOURCES = 20;
	onMount(() => { tabsReady = true; });
	const pages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
	const selectedRows = $derived(data.rows.filter((row) => selectedSourceRefs.includes(row.sourceRef)));
	const allCurrentPageSelected = $derived(data.rows.length > 0 && data.rows.every((row) => selectedSourceRefs.includes(row.sourceRef)));
	const previousHref = $derived(`?${new URLSearchParams({ q: data.query, identity: data.identity, page: String(Math.max(1, data.page - 1)) })}`);
	const nextHref = $derived(`?${new URLSearchParams({ q: data.query, identity: data.identity, page: String(Math.min(pages, data.page + 1)) })}`);

	function toggleSource(sourceRef: string, checked: boolean) {
		if (!checked) {
			selectedSourceRefs = selectedSourceRefs.filter((selected) => selected !== sourceRef);
			selectionNotice = '';
			return;
		}
		if (selectedSourceRefs.length >= MAX_PREFILL_SOURCES) {
			selectionNotice = `Batch preview is limited to ${MAX_PREFILL_SOURCES} sources.`;
			return;
		}
		selectedSourceRefs = [...new Set([...selectedSourceRefs, sourceRef])];
		selectionNotice = '';
	}

	function toggleCurrentPage(checked: boolean) {
		const currentRefs = new Set<string>(data.rows.map((row) => row.sourceRef));
		const currentRefsList: string[] = Array.from(currentRefs);
		selectedSourceRefs = checked
			? [...new Set([...selectedSourceRefs, ...currentRefsList.slice(0, MAX_PREFILL_SOURCES)])].slice(0, MAX_PREFILL_SOURCES)
			: selectedSourceRefs.filter((sourceRef) => !currentRefs.has(sourceRef));
		selectionNotice = checked && currentRefs.size > MAX_PREFILL_SOURCES
			? `Selected the first ${MAX_PREFILL_SOURCES} sources on this page; batch preview is bounded.`
			: '';
	}

	function downloadPrefillDescriptor() {
		if (!data.snapshot || selectedRows.length === 0) return;
		const descriptor = {
			schema: 'atlas.task-source-batch-prefill-descriptor.v1',
			mode: 'PREVIEW_ONLY',
			dispatchable: false,
			canonicalAuthority: false,
			snapshot: {
				id: data.snapshot.id,
				workspaceRevision: data.snapshot.workspaceRevision,
				inputChecksum: data.snapshot.inputChecksum,
				currentness: data.snapshot.currentness,
				sourceRevision: data.snapshot.sourceRevision,
			},
			sources: selectedRows.map((row) => ({
				sourceRef: row.sourceRef,
				sourceLine: row.sourceLine,
				taskHash: row.taskHash,
				identityStatus: row.identityStatus,
				canonicalTaskKeyCandidate: row.canonicalTaskKeyCandidate,
				reviewRequired: true,
			})),
			modelRouting: 'NOT_INVOKED',
			createdAt: new Date().toISOString(),
		};
		const blob = new Blob([JSON.stringify(descriptor, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `atlas-task-prefill-preview-${data.snapshot.id}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	function downloadBatchDagPrefill() {
		if (!data.snapshot || selectedRows.length === 0) return;
		const prefillPayload = {
			schema: 'atlas.task-source-batch-recommendations-dag-prefill.v1',
			targetModel: 'ornith-1.5-9b',
			mode: 'CONTROL_PLANE_DAG_PREFILL_ONLY',
			canonicalAuthority: false,
			databaseWrites: false,
			snapshot: {
				id: data.snapshot.id,
				workspaceRevision: data.snapshot.workspaceRevision,
				inputChecksum: data.snapshot.inputChecksum,
				currentness: data.snapshot.currentness,
				sourceRevision: data.snapshot.sourceRevision,
			},
			tasks: selectedRows.map((row) => ({
				sourceRef: row.sourceRef,
				changeId: row.changeId,
				sourceLine: row.sourceLine,
				taskHash: row.taskHash,
				taskText: row.taskText,
				identityStatus: row.identityStatus,
				candidateKey: row.canonicalTaskKeyCandidate,
				dagPlan: {
					action: 'INVESTIGATE_AND_PREFILL',
					dependencies: [],
					contextLimitTokens: 2000,
				},
			})),
			generatedAt: new Date().toISOString(),
		};
		const blob = new Blob([JSON.stringify(prefillPayload, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `atlas-batch-dag-prefill-${data.snapshot.id}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>OpenSpec Task Sources // Parent Atlas</title>
	<meta name="description" content="Read-only, revision-qualified source index for open OpenSpec task lines." />
</svelte:head>

<main class="min-h-screen bg-[#171613] px-4 py-6 text-[#efede4] md:px-8">
	<div class="mx-auto max-w-7xl space-y-5">
		<header class="flex flex-wrap items-start justify-between gap-4 border-b border-[#3f3e37] pb-4">
			<div>
				<p class="text-xs font-bold uppercase tracking-[0.22em] text-[#8b9dbb]">Parent Atlas / Admin</p>
				<h1 class="mt-2 text-2xl font-bold">OpenSpec task source index</h1>
				<p class="mt-1 max-w-3xl text-sm text-[#a39f90]">Searchable source locators, not an executable Kanban queue. Task files remain authoritative; identity candidates are not promoted.</p>
			</div>
			<a href="/admin/atlas" class="border border-[#5c594c] px-3 py-2 text-xs font-bold uppercase tracking-wider hover:border-[#8b9dbb]">Back to Atlas Studio</a>
		</header>

		{#if data.snapshot}
			<section class="grid gap-3 md:grid-cols-3" aria-label="Source index snapshot">
				<div class="border border-[#3f3e37] bg-[#23221c] p-4">
					<p class="text-xs uppercase text-[#a39f90]">Indexed open source lines</p>
					<p class="mt-2 text-2xl font-bold">{data.snapshot.indexedRows.toLocaleString()}</p>
				</div>
				<div class="border border-[#3f3e37] bg-[#23221c] p-4">
					<p class="text-xs uppercase text-[#a39f90]">Current result set</p>
					<p class="mt-2 text-2xl font-bold">{data.total.toLocaleString()}</p>
				</div>
				<div class="border border-[#3f3e37] bg-[#23221c] p-4">
					<p class="text-xs uppercase text-[#a39f90]">Snapshot</p>
					<p class="mt-2 break-all font-mono text-xs">{data.snapshot.id}</p>
				</div>
			</section>
			<p class="border border-amber-700/60 bg-amber-950/20 p-3 text-xs text-amber-200" role="status">
				Snapshot freshness is not verified against the current workspace, and per-source revisions are not recorded. Treat these rows and exported prefill descriptors as historical, advisory source locators only; refresh and verify the index before relying on them.
			</p>

			<Bits.Tabs.Root bind:value={activeTab} class="space-y-3">
				<Bits.Tabs.List class="flex gap-2 border-b border-[#3f3e37]" aria-label="Task source views">
					<Bits.Tabs.Trigger value="tasks" disabled={!tabsReady} class="border-b-2 border-[#8b9dbb] px-3 py-2 text-xs font-bold uppercase tracking-wider">Open task sources</Bits.Tabs.Trigger>
					<Bits.Tabs.Trigger value="snapshot" disabled={!tabsReady} class="px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#a39f90]">Snapshot details</Bits.Tabs.Trigger>
				</Bits.Tabs.List>
				<Bits.Tabs.Content value="tasks" class="space-y-4">
					<form method="GET" class="flex flex-wrap items-end gap-3 border border-[#3f3e37] bg-[#23221c] p-4">
						<label class="grid min-w-[16rem] flex-1 gap-1 text-xs uppercase text-[#a39f90]">Search task text or source ref
							<input name="q" value={data.query} maxlength="120" class="min-h-10 border border-[#5c594c] bg-[#171613] px-3 text-sm text-[#efede4] outline-none focus:border-[#8b9dbb]" />
						</label>
						<label class="grid gap-1 text-xs uppercase text-[#a39f90]">Identity status
							<select name="identity" value={data.identity} class="min-h-10 border border-[#5c594c] bg-[#171613] px-3 text-sm text-[#efede4]">
								<option value="ALL">All</option><option value="DECLARED_ID">Declared</option><option value="DERIVED_ID">Derived</option><option value="AMBIGUOUS">Ambiguous</option>
							</select>
						</label>
						<button class="min-h-10 border border-[#8b9dbb] bg-[#8b9dbb] px-4 text-xs font-bold uppercase text-[#171613] hover:bg-[#a9b8d0]">Search</button>
					</form>
					<section class="flex flex-wrap items-center justify-between gap-3 border border-[#3f3e37] bg-[#23221c] p-4" aria-label="Batch DAG prefill preview">
						<div>
						<p class="text-sm font-semibold">Batch DAG prefill preview</p>
						<p class="mt-1 max-w-3xl text-xs text-[#a39f90]">Select source locators and export a snapshot-bound descriptor. Freshness is unverified. This does not call a model, LangExtract, or LangGraph, execute a DAG, promote task identities, or write to the database.</p>
							<p class="mt-1 text-xs text-[#8b9dbb]">{selectedRows.length} selected on this page · maximum {MAX_PREFILL_SOURCES} per preview</p>
							{#if selectionNotice}<p class="mt-1 text-xs text-amber-300" role="status">{selectionNotice}</p>{/if}
						</div>
						<div class="flex flex-wrap gap-2">
							<button type="button" onclick={downloadPrefillDescriptor} disabled={!selectedRows.length || !data.snapshot} class="min-h-10 border border-[#8b9dbb] px-4 text-xs font-bold uppercase text-[#efede4] enabled:hover:bg-[#2a2d31] disabled:cursor-not-allowed disabled:opacity-50">Export preview JSON</button>
							<button type="button" onclick={downloadBatchDagPrefill} disabled={!selectedRows.length || !data.snapshot} class="min-h-10 border border-[#bfa15f] bg-[#2d281a] px-4 text-xs font-bold uppercase text-[#e5c986] enabled:hover:bg-[#3d3622] disabled:cursor-not-allowed disabled:opacity-50">Batch recommendations DAG prefill</button>
						</div>
					</section>

					<div class="overflow-x-auto border border-[#3f3e37]">
						<table class="w-full min-w-[60rem] border-collapse text-left text-sm">
							<thead class="bg-[#23221c] text-xs uppercase tracking-wider text-[#a39f90]"><tr><th scope="col" class="p-3"><input aria-label="Select all task sources on this page" type="checkbox" checked={allCurrentPageSelected} onchange={(event) => toggleCurrentPage((event.currentTarget as HTMLInputElement).checked)} /></th><th scope="col" class="p-3">Source ref</th><th scope="col" class="p-3">Task</th><th scope="col" class="p-3">Identity</th><th scope="col" class="p-3">Candidate key (advisory)</th></tr></thead>
							<tbody>
								{#each data.rows as row (row.sourceRef)}
									<tr class="border-t border-[#3f3e37] align-top hover:bg-[#23221c]"><td class="p-3"><input aria-label={`Select ${row.sourceRef}`} type="checkbox" checked={selectedSourceRefs.includes(row.sourceRef)} onchange={(event) => toggleSource(row.sourceRef, (event.currentTarget as HTMLInputElement).checked)} /></td><td class="p-3 font-mono text-xs text-[#8b9dbb]">{row.sourceRef}</td><td class="max-w-3xl whitespace-pre-wrap p-3">{row.taskText}</td><td class="p-3"><span class="border border-[#5c594c] px-2 py-1 text-[0.65rem] font-bold">{row.identityStatus}</span></td><td class="p-3 font-mono text-[0.68rem] text-[#a39f90]">{row.canonicalTaskKeyCandidate ?? '—'}</td></tr>
								{:else}
									<tr><td colspan="5" class="p-8 text-center text-[#a39f90]">No matching task source lines.</td></tr>
								{/each}
							</tbody>
						</table>
					</div>
					<div class="flex items-center justify-between text-xs text-[#a39f90]">
						<span>Page {data.page} of {pages} · {data.pageSize} rows per page</span>
						<div class="flex gap-2"><a aria-disabled={data.page <= 1} href={previousHref} class="border border-[#5c594c] px-3 py-2 hover:border-[#8b9dbb]">Previous</a><a aria-disabled={data.page >= pages} href={nextHref} class="border border-[#5c594c] px-3 py-2 hover:border-[#8b9dbb]">Next</a></div>
					</div>
				</Bits.Tabs.Content>
				<Bits.Tabs.Content value="snapshot" class="grid gap-3 border border-[#3f3e37] bg-[#23221c] p-4 text-xs md:grid-cols-2">
					<p><span class="text-[#a39f90]">Workspace snapshot:</span><br /><code class="break-all">{data.snapshot.workspaceRevision}</code></p>
					<p><span class="text-[#a39f90]">Input census checksum:</span><br /><code class="break-all">{data.snapshot.inputChecksum}</code></p>
					<p><span class="text-[#a39f90]">Captured:</span><br />{data.snapshot.createdAt}</p>
					<p><span class="text-[#a39f90]">Currentness:</span><br />{data.snapshot.currentness}</p>
					<p><span class="text-[#a39f90]">Per-source revision:</span><br />{data.snapshot.sourceRevision}</p>
					<p><span class="text-[#a39f90]">Authority:</span><br />Repository task source lines; source revision intentionally deferred.</p>
				</Bits.Tabs.Content>
			</Bits.Tabs.Root>
		{:else}
			<section class="border border-[#3f3e37] bg-[#23221c] p-8 text-center">
				<h2 class="font-bold">No task-source snapshot is indexed</h2>
				<p class="mt-2 text-sm text-[#a39f90]">Run the governed source-index refresh before using this view.</p>
			</section>
		{/if}
	</div>
</main>
