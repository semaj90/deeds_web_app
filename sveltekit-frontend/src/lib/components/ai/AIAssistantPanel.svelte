<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import { aiAssistantStore } from '$lib/stores/unified/ai-assistant-store.svelte.js';
	import { buildSetTheSceneHrefV1, SetTheSceneRequestV1Schema } from '$lib/reconstruction/set-the-scene-workflow-v1.js';
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
	let sceneMode = $state<'blockout' | 'evidence'>('evidence');

	const messages = $derived(aiAssistantStore.messages);
	const isAssistantLoading = $derived(aiAssistantStore.isProcessing);
	const latestUserPrompt = $derived([...messages].reverse().find((message) => message.role === 'user')?.content ?? '');
	const canSetScene = $derived([...messages].reverse().find((message) => message.role === 'assistant' || message.role === 'user')?.role === 'assistant' && !isAssistantLoading && !isLoading &&
		SetTheSceneRequestV1Schema.safeParse({ schema: 'parent-atlas.set-the-scene-request/v1', caseId, mode: sceneMode,
			prompt: latestUserPrompt, sourceEvidenceIds: selectedEvidenceIds }).success);

	function openSceneBuilder() {
		const request = SetTheSceneRequestV1Schema.safeParse({ schema: 'parent-atlas.set-the-scene-request/v1', caseId,
			mode: sceneMode, prompt: latestUserPrompt, sourceEvidenceIds: selectedEvidenceIds });
		if (!request.success) return;
		void goto(buildSetTheSceneHrefV1(request.data));
	}

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

<div class="flex flex-col h-full nes-container is-rounded bg-panel/50 p-2" class:hidden={!isVisible}>
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
					<span class="i-lucide-loader-2 animate-spin inline-block"></span>
				</div>
			</div>
		{/if}
		{#if canSetScene}
			<div class="scene-action" aria-label="Start a scene from this case conversation">
				<label>Start with
					<select bind:value={sceneMode}>
						<option value="evidence">Selected evidence</option>
						<option value="blockout">Illustrative blockout</option>
					</select>
				</label>
				<button type="button" onclick={openSceneBuilder}>Set the Scene</button>
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
			<span class="i-lucide-zap w-4 h-4 inline-block"></span>
		</Button>
	</div>
</div>

<style>
	.hidden { display: none;}
	.scene-action { display:flex; flex-wrap:wrap; align-items:end; gap:.5rem; margin:.5rem 0; padding:.6rem; border:1px solid #557078; border-radius:.35rem; background:#10232a; color:#eef4f4; }
	.scene-action label { display:grid; gap:.2rem; font-size:.72rem; }
	.scene-action select,.scene-action button { min-height:2.2rem; padding:.35rem .6rem; }
</style>

