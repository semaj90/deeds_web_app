<script lang="ts">
	import CommandCenterShell from '$lib/features/evidence-command-center/CommandCenterShell.svelte';
	import EvidenceBoardPane from '$lib/features/evidence-command-center/EvidenceBoardPane.svelte';
	import EvidenceChatPane from '$lib/features/evidence-command-center/EvidenceChatPane.svelte';
	import EvidenceCommandPalette from '$lib/features/evidence-command-center/EvidenceCommandPalette.svelte';
	import EvidenceGraphPane from '$lib/features/evidence-command-center/EvidenceGraphPane.svelte';
	import { evidenceCommandCenter } from '$lib/stores/evidenceCommandCenter.store.svelte';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	const caseId = $derived(data.caseData?.id ?? '');
	const caseTitle = $derived(data.caseData?.title ?? null);

	function handleKeydown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (e.key === 'g' || e.key === 'G') evidenceCommandCenter.setActiveView('graph');
		if (e.key === 'b' || e.key === 'B') evidenceCommandCenter.setActiveView('board');
		if (e.key === 'c' || e.key === 'C') evidenceCommandCenter.setActiveView('chat');
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<CommandCenterShell {caseId} {caseTitle}>
	{#if evidenceCommandCenter.activeView === 'board'}
		<EvidenceBoardPane evidenceRows={data.evidenceRows} {caseId} />
	{:else if evidenceCommandCenter.activeView === 'graph'}
		<EvidenceGraphPane evidenceRows={data.evidenceRows} />
	{:else if evidenceCommandCenter.activeView === 'chat'}
		<EvidenceChatPane recentChat={data.recentChat} />
	{/if}
</CommandCenterShell>

<EvidenceCommandPalette />