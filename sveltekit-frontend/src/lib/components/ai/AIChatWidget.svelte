<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import SimpleWorkingChat from './SimpleWorkingChat.svelte';

	interface Props {
		context?: { title?: string; description?: string } | null;
		caseId?: string | null;
		currentRoute?: string;
		class?: string;
	}

	let {
		context = null,
		caseId = null,
		currentRoute = '',
		class: className = ''
	}: Props = $props();

	let isOpen = $state(false);

	onMount(() => {
		const handleOpen = () => { isOpen = true; };
		window.addEventListener('yorha:open-chat', handleOpen);
		return () => window.removeEventListener('yorha:open-chat', handleOpen);
	});
	let widgetId = $state('widget-' + Math.random().toString(36).slice(2, 8));
	let chatId = $derived(caseId ? `widget-case-${caseId}` : widgetId);
</script>

<!-- Trigger Button -->
<div class="fixed bottom-6 right-6 z-50 {className}">
	<Button
		onclick={() => isOpen = !isOpen}
		class="w-14 h-14 rounded-full shadow-lg flex items-center justify-center"
	>
		<Icon name={isOpen ? 'x' : 'message-circle'} size={24} />
	</Button>
</div>

<!-- Chat Panel -->
{#if isOpen}
	<div class="fixed bottom-24 right-6 z-50 w-96 shadow-2xl rounded-xl overflow-hidden border border-sand-dark bg-panel" transition:fly={{ y: 20, duration: 200 }}>
		<div class="flex items-center justify-between px-4 py-3 border-b border-sand-dark">
			<div class="flex items-center gap-2">
				<Icon name="bot" size={18} />
				<span class="text-sm font-semibold">
					{context?.title ?? 'Legal AI Assistant'}
				</span>
			</div>
			<button
				class="opacity-40 hover:opacity-100 bg-transparent border-none cursor-pointer p-1 text-inherit"
				onclick={() => isOpen = false}
			>
				<Icon name="x" size={16} />
			</button>
		</div>
		<SimpleWorkingChat
			{chatId}
			hasCaseContext={!!caseId}
			{currentRoute}
			height="420px"
			class="border-0 rounded-none"
		/>
	</div>
{/if}
