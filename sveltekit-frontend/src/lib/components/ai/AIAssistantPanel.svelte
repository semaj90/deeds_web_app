<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { aiAssistantStore } from '$lib/stores/unified/ai-assistant-store.svelte.js';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import Zap from 'lucide-svelte/icons/zap';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

	let {
		caseId = 'case-001',
		selectedEvidenceIds = [],
		isVisible = true
	} = $props<{
		caseId?: string;
		selectedEvidenceIds?: string[];
		isVisible?: boolean }>();

	let userInput = $state('');
	let isLoading = $state(false);

	const messages = $derived(aiAssistantStore.messages);
	const isAssistantLoading = $derived(aiAssistantStore.isProcessing);

	$effect(() => {
		if (caseId) {
			aiAssistantStore.initializeCase(caseId, `Case ${caseId}`);
		}
	});

	async function handleSendMessage() {
		if (!userInput.trim() || isLoading) return;

		const prompt = userInput.trim();
		userInput = '';
		isLoading = true;

		try {
			await aiAssistantStore.sendMessage(prompt, caseId, selectedEvidenceIds);
		} catch (error) {
			console.error('Failed to send message:', error);
		} finally {
			isLoading = false }
	}
</script>

<div class="flex flex-col h-full nes-container is-rounded bg-slate-900/50 p-2" class:hidden={!isVisible}>
	<div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
		{#each messages as msg}
			<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
				<div class="nes-balloon {msg.role === 'user' ? 'from-right' : 'from-left'} is-dark text-xs max-w-[80%]">
					<p>{msg.content}</p>
				</div>
			</div>
		{/each}

		{#if isAssistantLoading || isLoading}
			<div class="flex justify-start">
				<div class="nes-balloon from-left">
					<Loader2 class="animate-spin" />
				</div>
			</div>
		{/if}
	</div>

	<div class="p-2 border-t border-primary/20 flex gap-2">
		<input
			type="text"
			class="nes-input is-dark flex-1 text-xs"
			placeholder="Ask about this case..."
			bind:value={userInput}
			onkeydown={(e) => e.key === 'Enter' && handleSendMessage()}
		/>
		<Button onclick={handleSendMessage} disabled={isLoading || !userInput.trim()}>
			<Zap size={16} />
		</Button>
	</div>
</div>

<style>
	.hidden { display: none;}
</style>






