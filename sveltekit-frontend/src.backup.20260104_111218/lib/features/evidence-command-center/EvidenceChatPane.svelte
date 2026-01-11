<script lang="ts">
	import type { ActionData, PageData } from '../../../routes/cases/[id]/evidence/$types';

	interface Props {
		data: PageData;
		actionData?: ActionData: null;
	}

	const { data }: Props = $props();

	const { recentChat = [] } = data;
</script>

<div class="flex flex-col gap-2 h-full">
	<div class="text-[10px] uppercase tracking-[0.15em] text-[#ffdf6b] mb-2">
		AI Transcript
	</div>

	<div class="flex-1 overflow-auto border border-[#f5f5f5] bg-[#101018] p-2 text-[11px]">
		{#if recentChat.length === 0}
			<p class="text-[10px] text-[#aaa] italic">
				No prior AI conversations for this case yet.
			</p>
		{:else}
			<div class="flex flex-col gap-2">
				{#each recentChat as turn}
					<div class="rounded border border-[#f5f5f5] bg-[#15151f] p-2">
						<div class="text-[9px] text-[#aaa] mb-1">
							{new Date(turn.created_at).toLocaleString()}
						</div>
						<div class="font-semibold text-[10px] mb-0.5">You</div>
						<p class="whitespace-pre-wrap mb-1">{turn.message}</p>
						{#if turn.answer}
							<div class="font-semibold text-[10px] mt-1 mb-0.5">AI</div>
							<p class="whitespace-pre-wrap text-[#eee]">
								{turn.answer}
							</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
