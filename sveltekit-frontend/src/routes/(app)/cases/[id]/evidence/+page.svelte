<script lang="ts">
	import { page } from '$app/state';
	import CommandCenterShell from '$lib/features/evidence-command-center/CommandCenterShell.svelte';
	import EvidenceBoardPane from '$lib/features/evidence-command-center/EvidenceBoardPane.svelte';
	import EvidenceChatPane from '$lib/features/evidence-command-center/EvidenceChatPane.svelte';
	import EvidenceCommandPalette from '$lib/features/evidence-command-center/EvidenceCommandPalette.svelte';
	import EvidenceGraphPane from '$lib/features/evidence-command-center/EvidenceGraphPane.svelte';
	import EvidenceBoardRich from '$lib/components/evidence/EvidenceBoard.svelte';
	import { evidenceCommandCenter } from '$lib/stores/evidenceCommandCenter.store.svelte';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	const caseId = $derived(data.caseData?.id ?? '');
	const caseTitle = $derived(data.caseData?.title ?? null);

	// Feature flag — opt into the 1290-LoC rich EvidenceBoard via ?board=rich
	// (audit doc §3.16 consolidation recommendation). Default stays the minimal
	// 121-LoC pane so existing users see no UX change.
	const useRichBoard = $derived(page.url.searchParams.get('board') === 'rich');

	// Map the server's flat evidenceRows shape → EvidenceBoard's EvidenceNodeType
	// shape. Persistence (canvasPosition) is loaded by the board itself from its
	// own board-persistence.svelte.js layout store.
	const richNodes = $derived(
		(data.evidenceRows ?? []).map((ev) => ({
			id:             ev.id,
			caseId,
			title:          ev.file_name ?? 'Untitled evidence',
			description:    ev.ai_summary ?? undefined,
			evidenceType:   ev.evidence_type ?? 'document',
			fileName:       ev.file_name ?? undefined,
			fileUrl:        ev.file_url ?? undefined,
			canvasPosition: { x: 0, y: 0 },
			uploadedAt:     ev.uploaded_at ?? new Date().toISOString(),
			updatedAt:      ev.uploaded_at ?? new Date().toISOString(),
			x:              0,
			y:              0,
		}))
	);

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
		{#if useRichBoard}
			<EvidenceBoardRich {caseId} initialNodes={richNodes} />
		{:else}
			<EvidenceBoardPane evidenceRows={data.evidenceRows} {caseId} />
		{/if}
	{:else if evidenceCommandCenter.activeView === 'graph'}
		<EvidenceGraphPane evidenceRows={data.evidenceRows} />
	{:else if evidenceCommandCenter.activeView === 'chat'}
		<EvidenceChatPane recentChat={data.recentChat} />
	{/if}
</CommandCenterShell>

<EvidenceCommandPalette />