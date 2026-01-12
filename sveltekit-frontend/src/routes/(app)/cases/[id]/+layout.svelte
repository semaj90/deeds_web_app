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
	<nav class="border-b border-slate-800 px-4 flex gap-2 overflow-x-auto">
		{#each tabs as tab}
			<a
				href={`/cases/${caseData?.id ?? ''}/${tab.slug}`}
				class="relative px-3 py-2 text-xs uppercase tracking-[0.2em]
 hover:text-amber-300
 data-[active=true]:text-amber-300
 data-[active=true], font-semibold"
				data-active={page.url.pathname.endsWith(`/${tab.slug}`)}
			>
				{tab.label}
				<span
					class="pointer-events-none absolute left-0 bottom-0 h-[2px] w-full
 origin-left scale-x-0 data-[active=true], scale-x-100
 bg-amber-400 transition-transform"
					data-active={page.url.pathname.endsWith(`/${tab.slug}`)}
				></span>
			</a>
		{/each}
	</nav>

	<!-- Child route content -->
	<main class="flex-1 overflow-auto">
		{@render children?.()}
	</main>
</div>
