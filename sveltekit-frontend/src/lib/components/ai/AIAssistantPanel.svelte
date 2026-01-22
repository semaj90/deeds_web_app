<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { aiAssistant } from '$lib/stores/unified';
	import { Loader, Zap } from 'lucide-svelte';

	interface Props {
		caseId?: string;
		selectedEvidenceIds?: string[];
		isVisible?: boolean;
	}

	let {
		caseId = 'case-001',
		selectedEvidenceIds = [],
		isVisible = true
	}: Props = $props();

	let userInput = $state('');
	let isLoading = $state(false);

	const messages = $derived(aiAssistant.currentMessages);
	const isAssistantLoading = $derived(aiAssistant.isLoading);

	$effect(() => {
		if (caseId) {
			aiAssistant.initializeCase(caseId, `Case ${caseId}`);
		}
	});

	async function handleSendMessage() {
		if (!userInput.trim() || isLoading) return;

		const prompt = userInput.trim();
		userInput = '';
		isLoading = true;

		try {
			await aiAssistant.sendMessage(caseId, prompt, selectedEvidenceIds);
		} catch (error) {
			console.error('Failed to send message:', error);
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="flex flex-col h-full nes-container is-rounded bg-slate-900/50 p-2" class:hidden={!isVisible}>
	<div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
		{#each messages as msg}
			<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
				<div class="nes-balloon {msg.role === 'user' ? 'from-right' : 'from-left'} max-w-[80%]">
					<p class="text-xs">{msg.content}</p>
				</div>
			</div>
		{/each}

		{#if isAssistantLoading || isLoading}
			<div class="flex justify-start">
				<div class="nes-balloon from-left">
					<Loader class="animate-spin" />
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
	.hidden { display: none; }
</style>






