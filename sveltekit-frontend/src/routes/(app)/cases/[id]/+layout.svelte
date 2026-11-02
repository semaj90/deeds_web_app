<script lang="ts">
	import { page } from '$app/state';

	const { data, children } = $props();
	const caseData = $derived(data?.caseData);
	const caseId = $derived(caseData?.id ?? page.params.id ?? '');
	const isCaseRoot = $derived(
		page.url.pathname === `/cases/${caseId}` || page.url.pathname === `/cases/${caseId}/`
	);

	const tabs = [
		{ slug: '', label: 'Dossier Hub' },
		{ slug: 'chat', label: '✦ AI Counsel Chat' },
		{ slug: 'overview', label: 'Overview' },
		{ slug: 'notes', label: 'Notes' },
		{ slug: 'canvas', label: 'Evidence Canvas' },
		{ slug: 'reports', label: 'Reports' }
	];
</script>

<div class="min-h-screen flex flex-col">
	{#if !isCaseRoot}
		<header class="bg-[#0b0e15] border-b border-[#c59e2b]/35 px-5 py-3 flex items-center justify-between">
			<div>
				<div class="text-[10px] font-mono uppercase tracking-[0.2em] text-[#c59e2b]">Case File</div>
				<div class="text-base font-bold text-[#f8f5ee]">
					{caseData?.title ?? `Case #${caseId ? caseId.slice(0, 8) : '…'}`}
				</div>
			</div>
			<div class="flex items-center gap-2">
				{#if caseData?.status}
					<span class="px-2 py-0.5 rounded bg-[#c59e2b]/15 border border-[#c59e2b]/45 text-[10px] font-mono uppercase text-[#f3d471]">
						{caseData.status}
					</span>
				{/if}
				<span class="text-[11px] font-mono text-slate-400">
					Jurisdiction: {caseData?.jurisdiction ?? 'N/A'}
				</span>
			</div>
		</header>

		<nav class="cl-tab-bar" aria-label="Case sub-pages">
			{#each tabs as tab}
				{@const href = tab.slug ? `/cases/${caseId}/${tab.slug}` : `/cases/${caseId}`}
				{@const isActive = tab.slug ? page.url.pathname.endsWith(`/${tab.slug}`) : isCaseRoot}
				<a {href} class="cl-tab" class:active={isActive}>
					{tab.label}
					{#if isActive}
						<span class="cl-tab-underline"></span>
					{/if}
				</a>
			{/each}
		</nav>
	{/if}

	<div class="flex-1">
		{@render children?.()}
	</div>
</div>

<style>
	.cl-tab-bar {
		display: flex;
		gap: 4px;
		padding: 0 1.25rem;
		border-bottom: 1px solid rgba(197, 158, 43, 0.28);
		overflow-x: auto;
		background: #111520;
	}
	.cl-tab {
		position: relative;
		padding: 0.5rem 0.75rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #94a3b8;
		text-decoration: none;
		transition: color 0.15s;
		font-weight: 600;
		white-space: nowrap;
	}
	.cl-tab:hover, .cl-tab.active {
		color: #f3d471;
	}
	.cl-tab-underline {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 2px;
		width: 100%;
		background: #c59e2b;
	}
</style>