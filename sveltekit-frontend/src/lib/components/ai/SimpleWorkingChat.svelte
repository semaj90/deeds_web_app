<script lang="ts">
	import { ChatSession } from '$lib/models/ChatSession.svelte.js';
	import TypewriterResponse from '$lib/components/ai/TypewriterResponse.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { ScrollArea } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { tick } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		chatId?: string;
		hasCaseContext?: boolean;
		height?: string;
		class?: string;
	}

	let {
		chatId = 'chat-' + Date.now(),
		hasCaseContext = false,
		height = '500px',
		class: className = ''
	}: Props = $props();

	let session = $state<ChatSession | null>(null);
	let currentMessage = $state('');
	let chatContainer: HTMLElement | undefined = $state(undefined);
	let lastCompletedIdx = $state<number | null>(null);
	let prevStatus = $state<string>('idle');

	$effect(() => {
		const s = new ChatSession(chatId, [], hasCaseContext);
		s.loadHistory();
		session = s;
		return () => { s.destroy(); };
	});

	$effect(() => {
		const len = session?.messages?.length;
		if (len && len > 0) {
			tick().then(() => {
				if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
			});
		}
	});

	$effect(() => {
		const status = session?.status ?? 'idle';
		if (prevStatus === 'streaming' && status === 'idle' && session) {
			const msgs = session.messages;
			for (let i = msgs.length - 1; i >= 0; i--) {
				if (msgs[i].role === 'assistant') {
					lastCompletedIdx = i;
					break;
				}
			}
		}
		prevStatus = status;
	});

	async function sendMessage() {
		if (!currentMessage.trim() || !session || session.status !== 'idle') return;
		const msg = currentMessage.trim();
		currentMessage = '';
		lastCompletedIdx = null;
		await session.sendMessage(msg);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function formatTime(ts?: string) {
		if (!ts) return '';
		return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	// Copy message to clipboard
	let copiedIdx = $state<number | null>(null);
	async function copyMessage(content: string, idx: number) {
		if (!browser) return;
		try {
			await navigator.clipboard.writeText(content);
			copiedIdx = idx;
			setTimeout(() => { copiedIdx = null; }, 2000);
		} catch { /* clipboard unavailable */ }
	}

	// Sample legal prompts
	const samplePrompts = [
		{ label: 'Analyze Evidence', text: 'Analyze the key evidence in this case and identify any inconsistencies.' },
		{ label: 'Legal Precedent', text: 'Find relevant legal precedents for a breach of contract dispute.' },
		{ label: 'Timeline', text: 'Help me construct a chronological timeline of events from the case documents.' },
		{ label: 'Statute Lookup', text: 'What statutes apply to property deed transfer in this jurisdiction?' },
		{ label: 'Draft Summary', text: 'Draft a case summary highlighting the strongest arguments for the plaintiff.' }
	];

	function useSamplePrompt(text: string) {
		currentMessage = text;
	}
</script>

<div class="flex flex-col border border-sand-dark rounded-lg bg-panel-soft overflow-hidden {className}" style:height>
	<!-- Messages -->
	<ScrollArea.Root class="flex-1 min-h-0">
		<ScrollArea.Viewport class="h-full p-4" bind:ref={chatContainer}>
			{#if !session || session.messages.length === 0}
				<div class="h-full flex flex-col items-center justify-center opacity-40 gap-3 text-center">
					<Icon name="message-circle" size={32} />
					<p class="text-sm m-0">Start a conversation, or try a prompt below.</p>
					<div class="flex flex-wrap gap-1.5 mt-1 max-w-sm justify-center">
						{#each samplePrompts as prompt}
							<button
								class="px-2.5 py-1 rounded-full text-[11px] border border-sand-dark bg-panel hover:bg-accent-soft hover:border-accent transition-colors cursor-pointer"
								onclick={() => useSamplePrompt(prompt.text)}
							>{prompt.label}</button>
						{/each}
					</div>
				</div>
			{:else}
				{#each session.messages as msg, idx (idx)}
					<div
						class="flex gap-2.5 mb-4 max-w-[90%]"
						class:ml-auto={msg.role === 'user'}
						class:flex-row-reverse={msg.role === 'user'}
					>
						<div
							class="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
							style:background={msg.role === 'user' ? '#2563eb' : 'rgba(255,255,255,0.06)'}
							class:text-white={msg.role === 'user'}
						>
							<Icon name={msg.role === 'user' ? 'user' : 'bot'} size={14} />
						</div>

						<div class="flex flex-col gap-0.5 min-w-0">
							<div class="flex items-center gap-2 text-[10px] opacity-40">
								<span>{msg.role === 'user' ? 'You' : 'AI'}</span>
								<span>{formatTime(msg.timestamp)}</span>
								{#if msg.source}
									<span class="px-1 py-px rounded bg-white/5 text-[9px]">
										{msg.source === 'local-onnx' ? 'LOCAL' : 'SERVER'}
									</span>
								{/if}
								<button
									class="ml-auto p-0.5 rounded bg-transparent border-none opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
									onclick={() => copyMessage(msg.content, idx)}
									title={copiedIdx === idx ? 'Copied!' : 'Copy message'}
								>
									<Icon name={copiedIdx === idx ? 'check' : 'copy'} size={11} />
								</button>
							</div>

							<div
								class="px-3 py-2 rounded-lg text-sm leading-relaxed whitespace-pre-wrap break-words"
								style:background={msg.role === 'user' ? '#2563eb' : 'rgba(255,255,255,0.04)'}
								class:text-white={msg.role === 'user'}
							>
								{#if msg.role === 'assistant' && idx === lastCompletedIdx}
									<TypewriterResponse
										text={msg.content}
										speed={40}
										enableThinking={true}
										showCursor={true}
										oncomplete={() => lastCompletedIdx = null}
									/>
								{:else}
									{msg.content}
								{/if}
							</div>

							{#if msg.role === 'assistant' && msg.metadata?.confidence}
								<span class="text-[10px] opacity-30 mt-0.5">
									{Math.round((msg.metadata.confidence ?? 0) * 100)}% confidence
								</span>
							{/if}
						</div>
					</div>
				{/each}

				{#if session.status === 'thinking'}
					<div class="flex gap-2.5 mb-4">
						<div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-white/6">
							<Icon name="bot" size={14} />
						</div>
						<div class="flex items-center gap-2 text-sm opacity-40 px-3 py-2">
							<Icon name="loader-2" size={14} class="animate-spin" />
							<span>Thinking...</span>
						</div>
					</div>
				{/if}
			{/if}
		</ScrollArea.Viewport>
		<ScrollArea.Scrollbar orientation="vertical" class="w-1.5 p-0.5">
			<ScrollArea.Thumb class="bg-white/10 rounded-sm" />
		</ScrollArea.Scrollbar>
	</ScrollArea.Root>

	<!-- Error -->
	{#if session?.error}
		<div class="px-4 py-2 border-t border-red-900/30 text-red-300 text-xs flex items-center gap-2" style:background="rgba(69, 10, 10, 0.5)">
			<Icon name="alert-triangle" size={12} />
			<span>{session.error}</span>
		</div>
	{/if}

	<!-- Input -->
	<div class="p-3 border-t border-sand-dark">
		<div class="flex gap-2 items-end">
			<textarea
				placeholder="Type a message..."
				bind:value={currentMessage}
				onkeydown={handleKeydown}
				class="flex-1 bg-panel border border-sand-dark text-inherit text-sm px-3 py-2 rounded-lg resize-none min-h-10 outline-none focus:border-accent"
				rows={1}
				disabled={!session || session.status === 'thinking'}
			></textarea>
			<Button
				onclick={sendMessage}
				disabled={!session || session.status !== 'idle' || !currentMessage.trim()}
				class="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center"
			>
				<Icon name="send" size={16} />
			</Button>
		</div>
		<div class="flex items-center gap-2 mt-1.5 px-1 text-[10px] opacity-30">
			<span
				class="w-1.5 h-1.5 rounded-full inline-block"
				style:background={session?.connectionStatus === 'disconnected' ? '#ef4444' : '#10b981'}
			></span>
			<span>{session?.connectionStatus === 'connected' ? 'Online' : 'Offline'}</span>
			{#if session?.lastSource}
				<span class="px-1 py-px rounded bg-white/5 text-[9px]">
					{session.lastSource === 'local-onnx' ? 'LOCAL' : 'SERVER'}
				</span>
			{/if}
		</div>
	</div>
</div>
