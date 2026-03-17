<script lang="ts">
	import { page } from '$app/state';

	const { data, children } = $props();
	const caseData = $derived(data?.caseData);
	const caseId = $derived(caseData?.id ?? page.params.id ?? '');

	const tabs = [
		{ slug: 'overview', label: 'Overview' },
		{ slug: 'notes', label: 'Notes' },
		{ slug: 'canvas', label: 'Evidence Canvas' },
		{ slug: 'reports', label: 'Reports' }
	];
</script>

<div class="min-h-screen flex flex-col bg-panel text-black">
	<!-- Header -->
	<header class="border-b-2 border-black/20 px-4 py-3 flex items-center justify-between">
		<div>
			<div class="text-xs uppercase tracking-[0.25em] text-black/60 font-bold">Case File</div>
			<div class="text-lg font-semibold text-black">
				{caseData?.title ?? `Case #${caseId || '…'}`}
			</div>
			{#if caseData?.status}
				<div class="text-xs mt-1 text-black/60">
					Status: <span class="uppercase font-bold">{caseData.status}</span>
				</div>
			{/if}
		</div>

		<div class="flex gap-2">
			<span class="text-xs text-black/60">
				Jurisdiction: {caseData?.jurisdiction ?? 'N/A'}
			</span>
		</div>
	</header>

	<!-- Tabs -->
	<nav class="cl-tab-bar">
		{#each tabs as tab}
			{@const isActive = page.url.pathname.endsWith(`/${tab.slug}`)}
			<a
				href={`/cases/${caseId}/${tab.slug}`}
				class="cl-tab"
				class:active={isActive}
			>
				{tab.label}
				{#if isActive}
					<span class="cl-tab-underline"></span>
				{/if}
			</a>
		{/each}
	</nav>

	<!-- Child route content -->
	<main class="flex-1 overflow-auto">
		{@render children?.()}
	</main>
</div>

<style>
	.cl-tab-bar {
		display: flex;
		gap: 4px;
		padding: 0 1rem;
		border-bottom: 2px solid rgba(0, 0, 0, 0.2);
		overflow-x: auto;
		background: rgba(212, 199, 163, 0.1);
	}
	.cl-tab {
		position: relative;
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.2em;
		color: rgba(0, 0, 0, 0.6);
		text-decoration: none;
		transition: color 0.15s;
		font-weight: 600;
	}
	.cl-tab:hover, .cl-tab.active {
		color: #4ade80;
		font-weight: 700;
	}
	.cl-tab-underline {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 2px;
		width: 100%;
		background: #4ade80;
	}
</style>