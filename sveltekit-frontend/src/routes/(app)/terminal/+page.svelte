<script lang="ts">
	import { ChatSession } from '$lib/models/ChatSession.svelte.js';
	import TypewriterResponse from '$lib/components/ai/TypewriterResponse.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { ScrollArea } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { browser } from '$app/environment';

	// Chat session — tied to user via server-provided userId
	let session = $state<ChatSession | null>(null);
	let currentMessage = $state('');
	let showSettings = $state(false);
	let chatContainer: HTMLElement | undefined = $state(undefined);

	// Track which message just completed streaming (for typewriter animation)
	let lastCompletedIdx = $state<number | null>(null);

	// localStorage preferences
	let prefs = $state({
		enableThinking: true,
		typewriterSpeed: 40,
		autoScroll: true,
		forceServer: false,
		persona: 'neutral' as string,
		enableWebSearch: false
	});

	// Initialize session and load prefs
	$effect(() => {
		try {
			const saved = localStorage.getItem('terminal-prefs');
			if (saved) Object.assign(prefs, JSON.parse(saved));
		} catch { /* localStorage unavailable */ }

		const userId = page.data?.user?.id ?? 'anonymous';
		const chatId = `terminal-${userId}`;
		const s = new ChatSession(chatId, [], false);
		s.loadHistory();
		session = s;
		return () => { s.destroy(); };
	});

	// Persist prefs to localStorage
	$effect(() => {
		try {
			localStorage.setItem('terminal-prefs', JSON.stringify(prefs));
		} catch { /* localStorage unavailable */ }
	});

	// Auto-scroll on new messages
	$effect(() => {
		const len = session?.messages?.length;
		if (len && len > 0 && prefs.autoScroll) {
			tick().then(() => {
				if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
			});
		}
	});

	// Track when streaming completes to trigger typewriter on last message
	let prevStatus = $state<string>('idle');
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
		await session.sendMessage(msg, { forceServer: prefs.forceServer });
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function clearChat() {
		if (!session) return;
		const userId = page.data?.user?.id ?? 'anonymous';
		const chatId = `terminal-${userId}-${Date.now()}`;
		session.destroy();
		const s = new ChatSession(chatId, [], false);
		session = s;
		lastCompletedIdx = null;
	}

	function formatTime(ts?: string) {
		if (!ts) return '';
		return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	let confidenceColor = $derived.by(() => {
		if (!session) return '';
		const c = session.lastConfidence;
		if (c > 0.8) return 'text-green-400';
		if (c > 0.6) return 'text-yellow-400';
		return 'text-red-400';
	});

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

	// Sample legal prompts for quick-start
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

<div class="flex flex-col h-screen font-mono bg-[#0c0a09] text-stone-200">
	<!-- Header -->
	<header class="px-6 py-4 bg-[#1c1917] border-b-2 border-[#44403c] flex justify-between items-center shadow-md z-10 shrink-0">
		<div class="flex items-center gap-4">
			<Icon name="terminal" size={24} class="text-emerald-400" />
			<div>
				<h1 class="text-xl m-0 tracking-widest text-stone-50">&gt;_ AI CHAT INTERFACE</h1>
				<div class="text-xs text-emerald-500 flex items-center gap-2 mt-1">
					<span
						class="w-2 h-2 rounded-full"
						style:background={session?.connectionStatus === 'disconnected' ? '#ef4444' : '#10b981'}
						style:box-shadow={session?.connectionStatus === 'disconnected' ? '0 0 8px #ef4444' : '0 0 8px #10b981'}
					></span>
					{session?.connectionStatus === 'connected' ? 'SYSTEM ONLINE' : 'OFFLINE MODE'}
				</div>
			</div>
		</div>

		<div class="flex items-center gap-3">
			<button
				class="px-3 py-1.5 rounded text-xs font-mono tracking-wider border border-stone-600 text-stone-400 bg-transparent hover:border-emerald-600 hover:text-emerald-400 transition-colors"
			>TERMINAL</button>
			<button
				class="px-3 py-1.5 rounded text-xs font-mono tracking-wider border border-emerald-500 text-emerald-400 bg-emerald-950 transition-colors"
			>AI CHAT</button>
			<button
				class="px-3 py-1.5 rounded text-xs font-mono tracking-wider border border-red-800 text-red-400 hover:bg-red-950 transition-colors"
				onclick={clearChat}
			>CLEAR</button>
			{#if prefs.persona !== 'neutral'}
				<div class="text-[11px] text-amber-400 border border-amber-800 bg-amber-950/50 px-2.5 py-1 rounded flex items-center gap-1.5">
					<Icon name="user-cog" size={12} />
					{prefs.persona.toUpperCase()}
				</div>
			{/if}
			{#if prefs.enableWebSearch}
				<div class="text-[11px] text-blue-400 border border-blue-800 bg-blue-950/50 px-2 py-1 rounded flex items-center gap-1">
					<Icon name="globe" size={12} />
					WEB
				</div>
			{/if}
			{#if session}
				<div class="text-[11px] text-stone-500 border border-[#44403c] px-2.5 py-1 rounded flex items-center gap-1.5 ml-1">
					<Icon name="cpu" size={12} />
					{session.lastSource === 'local-onnx' ? 'LOCAL' : 'SERVER'}
				</div>
				{#if session.lastConfidence < 1}
					<span class="text-[11px] px-2 py-1 rounded border border-[#44403c] {confidenceColor}">
						{Math.round(session.lastConfidence * 100)}%
					</span>
				{/if}
			{/if}
			<button
				class="bg-transparent border border-[#44403c] text-stone-500 p-1.5 rounded cursor-pointer flex items-center hover:text-stone-200 hover:border-stone-500"
				onclick={() => showSettings = !showSettings}
			>
				<Icon name="settings" size={18} />
			</button>
		</div>
	</header>

	<!-- Settings Panel -->
	{#if showSettings}
		<div class="bg-[#1c1917] border-b border-stone-800 px-6 py-3 flex flex-wrap gap-4 text-[13px] text-stone-400 shrink-0">
			<label class="flex items-center gap-1.5 cursor-pointer">
				<input type="checkbox" bind:checked={prefs.enableThinking} style:accent-color="#10b981" />
				Thinking animation
			</label>
			<label class="flex items-center gap-1.5 cursor-pointer">
				Typewriter speed
				<input type="range" min="10" max="100" bind:value={prefs.typewriterSpeed} class="w-20" style:accent-color="#10b981" />
				<span>{prefs.typewriterSpeed}ms</span>
			</label>
			<label class="flex items-center gap-1.5 cursor-pointer">
				<input type="checkbox" bind:checked={prefs.autoScroll} style:accent-color="#10b981" />
				Auto-scroll
			</label>
			<label class="flex items-center gap-1.5 cursor-pointer">
				<input type="checkbox" bind:checked={prefs.forceServer} style:accent-color="#10b981" />
				Force server (Ollama)
			</label>
			<label class="flex items-center gap-1.5 cursor-pointer">
				<input type="checkbox" bind:checked={prefs.enableWebSearch} style:accent-color="#10b981" />
				Web search
			</label>
			<label class="flex items-center gap-1.5 cursor-pointer">
				Persona
				<select bind:value={prefs.persona} class="bg-[#0c0a09] border border-stone-700 text-stone-300 text-xs px-2 py-1 rounded">
					<option value="neutral">Neutral Analyst</option>
					<option value="prosecutor">Prosecution Focus</option>
					<option value="defense">Defense Focus</option>
					<option value="plain-language">Plain Language</option>
					<option value="academic">Academic / Research</option>
				</select>
			</label>
			<Button onclick={clearChat} class="text-xs px-2 py-1">
				<Icon name="trash-2" size={14} />
				Clear chat
			</Button>
		</div>
	{/if}

	<!-- Chat Viewport -->
	<div class="flex-1 min-h-0 flex flex-col mx-4 my-3 border border-emerald-900/60 rounded-lg overflow-hidden">
		<!-- 9S Header -->
		<div class="px-4 py-2.5 bg-[#1c1917] border-b border-emerald-900/40 flex items-center gap-3">
			<Icon name="bot" size={18} class="text-emerald-400" />
			<div>
				<span class="text-sm font-bold text-emerald-400 tracking-wider">9S AI ASSISTANT</span>
				<p class="text-[10px] text-stone-500 m-0">YoRHa AI Assistant Online — Detective Support System Active</p>
			</div>
		</div>
		<ScrollArea.Root class="flex-1 min-h-0">
		<ScrollArea.Viewport class="h-full p-6" bind:ref={chatContainer}>
			{#if !session || session.messages.length === 0}
				<div class="h-full flex flex-col items-center justify-center text-stone-600 gap-4 text-center">
					<Icon name="bot" size={48} class="text-emerald-800" />
					<p class="text-xl m-0 text-emerald-700">Initialize communication sequence...</p>
					<small>Ask 9S about your investigation, or try a prompt below.</small>
					<div class="flex flex-wrap gap-2 mt-2 max-w-lg justify-center">
						{#each samplePrompts as prompt}
							<button
								class="px-3 py-1.5 rounded-full text-xs font-mono border border-emerald-900/40 text-emerald-500 bg-emerald-950/50 hover:bg-emerald-900/40 hover:border-emerald-600 transition-colors cursor-pointer"
								onclick={() => useSamplePrompt(prompt.text)}
							>{prompt.label}</button>
						{/each}
					</div>
				</div>
			{:else}
				{#each session.messages as msg, idx (idx)}
					<div
						class="message-fade flex gap-3 max-w-[85%] mb-5"
						class:ml-auto={msg.role === 'user'}
						class:flex-row-reverse={msg.role === 'user'}
						class:mr-auto={msg.role === 'assistant'}
					>
						<div
							class="w-8 h-8 rounded flex items-center justify-center shrink-0"
							style:background={msg.role === 'user' ? '#2563eb' : '#44403c'}
							class:text-white={msg.role === 'user'}
							class:text-stone-200={msg.role === 'assistant'}
							class:border={msg.role === 'assistant'}
							class:border-stone-600={msg.role === 'assistant'}
						>
							{#if msg.role === 'assistant'}
								<Icon name="bot" size={18} />
							{:else}
								<Icon name="user" size={18} />
							{/if}
						</div>

						<div class="flex flex-col gap-1 min-w-0">
							<div class="flex items-center gap-2 text-[11px] text-stone-500">
								<span>{msg.role === 'user' ? 'DETECTIVE' : '9S ASSISTANT'}</span>
								<span>{formatTime(msg.timestamp)}</span>
								{#if msg.source}
									<span class="text-[10px] px-1.5 py-px rounded bg-stone-800 border border-[#44403c] text-stone-400">
										{msg.source === 'local-onnx' ? 'LOCAL' : 'SERVER'}
									</span>
								{/if}
								<button
									class="ml-auto p-0.5 rounded bg-transparent border-none text-stone-600 hover:text-emerald-400 cursor-pointer transition-colors"
									onclick={() => copyMessage(msg.content, idx)}
									title={copiedIdx === idx ? 'Copied!' : 'Copy message'}
								>
									<Icon name={copiedIdx === idx ? 'check' : 'copy'} size={12} />
								</button>
							</div>

							<div
								class="px-4 py-3 rounded border leading-relaxed whitespace-pre-wrap break-words text-sm"
								style:background={msg.role === 'user' ? '#172554' : '#1c1917'}
								class:border-blue-800={msg.role === 'user'}
								class:text-white={msg.role === 'user'}
								class:border-stone-800={msg.role !== 'user'}
								class:text-stone-300={msg.role !== 'user'}
							>
								{#if msg.role === 'assistant' && idx === lastCompletedIdx && prefs.enableThinking}
									<TypewriterResponse
										text={msg.content}
										speed={prefs.typewriterSpeed}
										enableThinking={prefs.enableThinking}
										showCursor={true}
										oncomplete={() => lastCompletedIdx = null}
									/>
								{:else}
									{msg.content}
								{/if}
							</div>

							{#if msg.role === 'assistant' && msg.metadata?.confidence}
								<div class="flex gap-1.5 mt-1">
									<span class="text-[10px] px-1.5 py-px rounded bg-stone-800 border border-[#44403c] text-stone-500">
										Confidence: {Math.round((msg.metadata.confidence ?? 0) * 100)}%
									</span>
									{#if msg.metadata.citations?.length}
										<span class="text-[10px] px-1.5 py-px rounded bg-stone-800 border border-[#44403c] text-stone-500">
											{msg.metadata.citations.length} sources
										</span>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/each}

				{#if session.status === 'thinking'}
					<div class="flex gap-3 max-w-[85%] mb-5 mr-auto">
						<div class="w-8 h-8 rounded flex items-center justify-center shrink-0 bg-[#44403c] text-stone-200 border border-stone-600">
							<Icon name="bot" size={18} />
						</div>
						<div class="flex flex-col gap-1 min-w-0">
							<div class="flex items-center gap-3 text-emerald-500 text-sm px-4 py-3 bg-[#1c1917] border border-dashed border-emerald-900/60 rounded">
								<Icon name="loader-2" size={16} class="animate-spin" />
								<span>9S IS ANALYZING...</span>
							</div>
						</div>
					</div>
				{/if}
			{/if}
		</ScrollArea.Viewport>
		<ScrollArea.Scrollbar orientation="vertical" class="w-1.5 p-0.5">
			<ScrollArea.Thumb class="bg-emerald-900/50 rounded-sm" />
		</ScrollArea.Scrollbar>
	</ScrollArea.Root>
	</div>

	<!-- Error Display -->
	{#if session?.error}
		<div class="px-6 py-2 bg-red-950 border-t border-red-900 text-red-300 text-[13px] flex items-center gap-2 shrink-0">
			<Icon name="alert-triangle" size={14} />
			<span>{session.error}</span>
		</div>
	{/if}

	<!-- Input Area -->
	<footer class="px-6 py-5 bg-[#1c1917] border-t border-stone-800 shrink-0">
		<div class="flex gap-3 max-w-[1200px] mx-auto items-end">
			<textarea
				placeholder="Ask 9S about your investigation..."
				bind:value={currentMessage}
				onkeydown={handleKeydown}
				class="flex-1 bg-[#0c0a09] border border-[#44403c] text-stone-200 font-mono text-sm px-4 py-3 rounded resize-none min-h-12 outline-none focus:border-emerald-600 disabled:opacity-50"
				rows={1}
				disabled={!session || session.status === 'thinking'}
			></textarea>
			<Button
				onclick={sendMessage}
				disabled={!session || session.status !== 'idle' || !currentMessage.trim()}
				class="h-12 px-5 shrink-0 rounded flex items-center justify-center gap-2 font-mono text-xs tracking-wider"
			>
				SEND
				<Icon name="send" size={14} />
			</Button>
		</div>
		<div class="flex justify-between items-center text-[10px] text-stone-600 mt-3 px-1">
			<div class="flex items-center gap-2">
				<span
					class="w-1.5 h-1.5 rounded-full"
					style:background={session?.connectionStatus === 'disconnected' ? '#ef4444' : '#10b981'}
				></span>
				<span>{session?.connectionStatus === 'connected' ? 'Online' : 'Offline'}</span>
				<span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
			</div>
			<span>System: Operational</span>
		</div>
	</footer>
</div>

<style>
	.message-fade {
		animation: fadeIn 0.3s ease-out;
	}
	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(8px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
