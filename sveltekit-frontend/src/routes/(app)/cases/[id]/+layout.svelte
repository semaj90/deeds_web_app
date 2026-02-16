<script lang="ts">
	import { page } from '$app/state';

	const { data, children } = $props();
	const caseData = $derived(data?.caseData);

	const tabs = [
		{ slug: 'overview', label: 'Overview' },
	{ slug: 'canvas', label: 'Evidence Canvas' },
	{ slug: 'reports', label: 'Reports' }
	];
</script>

<div class="min-h-screen flex flex-col bg-slate-950 text-slate-50">
	<!-- Header -->
	<header class="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
		<div>
			<div class="text-xs uppercase tracking-[0.25em] text-slate-400">Case File</div>
			<div class="text-lg font-semibold">
				{caseData?.title ?? `Case #${caseData?.id ?? '…'}`}
			</div>
			{#if caseData?.status}
				<div class="text-xs mt-1 text-slate-400">
					Status: <span class="uppercase">{caseData.status}</span>
				</div>
			{/if}
		</div>

		<div class="flex gap-2">
			<span class="text-xs text-slate-400">
				Jurisdiction: {caseData?.jurisdiction ?? 'N/A'}
			</span>
		</div>
	</header>

	<!-- Tabs -->
	<nav class="cl-tab-bar">
		{#each tabs as tab}
			{@const isActive = page.url.pathname.endsWith(`/${tab.slug}`)}
			<a
				href={`/cases/${caseData?.id ?? ''}/${tab.slug}`}
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
		border-bottom: 1px solid #1e293b;
		overflow-x: auto;
	}
	.cl-tab {
		position: relative;
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.2em;
		color: #94a3b8;
		text-decoration: none;
		transition: color 0.15s;
	}
	.cl-tab:hover, .cl-tab.active {
		color: #fcd34d;
		font-weight: 600;
	}
	.cl-tab-underline {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 2px;
		width: 100%;
		background: #fbbf24;
	}
</style>
