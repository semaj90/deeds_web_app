<script lang="ts">
	import {
	  CommandCenterShell,
	  EvidenceBoardPane,
	  EvidenceChatPane,
	  EvidenceCommandPalette,
	  EvidenceGraphPane
	} from '$lib/features/evidence-command-center';
	import { evidenceCommandCenter } from '$lib/stores/evidenceCommandCenter.store';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form?: ActionData | null;
	}

	const { data, form = null }: Props = $props();
</script>

<CommandCenterShell caseId={data.caseId}>
	{#if $evidenceCommandCenter.activeView === 'board'}
		<EvidenceBoardPane {data} actionData={form} />
	{:else if $evidenceCommandCenter.activeView === 'graph'}
		<EvidenceGraphPane {data} />
	{:else if $evidenceCommandCenter.activeView === 'chat'}
		<EvidenceChatPane {data} actionData={form} />
	{/if}
</CommandCenterShell>

<EvidenceCommandPalette />
