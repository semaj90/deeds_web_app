<script lang="ts">
	import { ChatSession } from '$lib/models/ChatSession.svelte.js';
	import TypewriterResponse from '$lib/components/ai/TypewriterResponse.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { ScrollArea } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { tick } from 'svelte';
	import { browser } from '$app/environment';
	import { ttsService } from '$lib/services/tts.js';

	interface Props {
		chatId?: string;
		hasCaseContext?: boolean;
		height?: string;
		class?: string;
		enableVoice?: boolean;
		handsFree?: boolean; // NEW: Start in hands-free mode
		silenceThreshold?: number; // NEW: Auto-send after N ms of silence
	}

	let {
		chatId = 'chat-' + Date.now(),
		hasCaseContext = false,
		height = '500px',
		class: className = '',
		enableVoice = true,
		handsFree = false,
		silenceThreshold = 2000
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

		// Update conversation state
		if (handsFreeEnabled) {
			conversationState = 'ai-thinking';
		}

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

	// ═══════════════════════════════════════════════════════════════
	// TTS (Text-to-Speech) — Speak AI responses
	// ═══════════════════════════════════════════════════════════════
	let speakingIdx = $state<number | null>(null);
	let ttsInitializing = $state(false);

	async function speakMessage(content: string, idx: number) {
		if (speakingIdx === idx) {
			// Stop current speech
			ttsService.stop();
			speakingIdx = null;
			if (handsFreeEnabled) {
				conversationState = 'listening';
				toggleListening(); // Restart listening after manual stop
			}
			return;
		}

		try {
			// Initialize TTS on first use
			if (!ttsService.isReady()) {
				ttsInitializing = true;
			}

			speakingIdx = idx;
			if (handsFreeEnabled) {
				conversationState = 'ai-speaking';
			}

			await ttsService.speak(content, { rate: 1.0, volume: 0.8 });
			speakingIdx = null;

			// In hands-free mode, restart listening after TTS finishes
			if (handsFreeEnabled && conversationState === 'ai-speaking') {
				conversationState = 'listening';
				setTimeout(() => {
					if (handsFreeEnabled && !isListening) {
						toggleListening();
					}
				}, 500); // 500ms delay before listening
			}
		} catch (err) {
			console.error('[SimpleWorkingChat] TTS error:', err);
			speakingIdx = null;
			if (handsFreeEnabled) {
				conversationState = 'idle';
			}
		} finally {
			ttsInitializing = false;
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// STT (Speech-to-Text) — Voice input via Web Speech API
	// ═══════════════════════════════════════════════════════════════
	let isListening = $state(false);
	let interimTranscript = $state('');
	let recognition: any = $state(null);
	let sttSupported = $state(false);
	let silenceTimer: NodeJS.Timeout | null = null;

	$effect(() => {
		if (browser && enableVoice) {
			// Check for Web Speech API support
			const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
			sttSupported = !!SpeechRecognition;

			if (sttSupported) {
				recognition = new SpeechRecognition();
				recognition.continuous = false;
				recognition.interimResults = true;
				recognition.lang = 'en-US';

				recognition.onresult = (event: any) => {
					let interim = '';
					let final = '';

					for (let i = event.resultIndex; i < event.results.length; i++) {
						const transcript = event.results[i][0].transcript;
						if (event.results[i].isFinal) {
							final += transcript;
						} else {
							interim += transcript;
						}
					}

					if (final) {
						currentMessage = (currentMessage + ' ' + final).trim();
						interimTranscript = '';

						// VAD: Reset silence timer on final speech
						if (handsFreeEnabled) {
							clearTimeout(silenceTimer!);
							silenceTimer = setTimeout(() => {
								if (currentMessage.trim() && handsFreeEnabled) {
									conversationState = 'processing';
									sendMessage();
								}
							}, silenceThreshold);
						}
					} else {
						interimTranscript = interim;

						// VAD: Clear and reset silence timer on interim speech
						if (handsFreeEnabled) {
							clearTimeout(silenceTimer!);
						}
					}
				};

				recognition.onend = () => {
					isListening = false;
					interimTranscript = '';
					clearTimeout(silenceTimer!);

					// In hands-free mode, restart listening unless we're done
					if (handsFreeEnabled && conversationState === 'listening') {
						setTimeout(() => {
							if (handsFreeEnabled && !isListening && conversationState === 'listening') {
								recognition.start();
								isListening = true;
							}
						}, 200);
					}
				};

				recognition.onerror = (event: any) => {
					console.error('[STT] Recognition error:', event.error);
					isListening = false;
					interimTranscript = '';
					clearTimeout(silenceTimer!);

					// Don't restart on permission denied or other fatal errors
					if (event.error === 'no-speech' && handsFreeEnabled) {
						// Restart on no-speech timeout in hands-free mode
						setTimeout(() => {
							if (handsFreeEnabled && !isListening) {
								toggleListening();
							}
						}, 500);
					}
				};
			}
		}

		return () => {
			if (recognition) {
				recognition.abort();
			}
			clearTimeout(silenceTimer!);
		};
	});

	function toggleListening() {
		if (!recognition || !session || session.status !== 'idle') return;

		if (isListening) {
			recognition.stop();
			isListening = false;
			clearTimeout(silenceTimer!);
			if (handsFreeEnabled) {
				conversationState = 'idle';
			}
		} else {
			recognition.start();
			isListening = true;
			if (handsFreeEnabled) {
				conversationState = 'listening';
			}
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// HANDS-FREE CONVERSATION MODE
	// ═══════════════════════════════════════════════════════════════
	type ConversationState = 'idle' | 'listening' | 'processing' | 'ai-thinking' | 'ai-speaking';
	let conversationState = $state<ConversationState>('idle');
	let handsFreeEnabled = $state(handsFree);

	// Persist hands-free preference
	$effect(() => {
		if (browser) {
			const saved = localStorage.getItem(`handsFree-${chatId}`);
			if (saved !== null) {
				handsFreeEnabled = saved === 'true';
			}
		}
	});

	$effect(() => {
		if (browser && handsFreeEnabled !== undefined) {
			localStorage.setItem(`handsFree-${chatId}`, String(handsFreeEnabled));
		}
	});

	function toggleHandsFree() {
		handsFreeEnabled = !handsFreeEnabled;

		if (handsFreeEnabled) {
			// Start listening when enabling hands-free
			conversationState = 'listening';
			if (!isListening) {
				toggleListening();
			}
		} else {
			// Stop everything when disabling hands-free
			conversationState = 'idle';
			if (isListening) {
				toggleListening();
			}
			if (speakingIdx !== null) {
				ttsService.stop();
				speakingIdx = null;
			}
			clearTimeout(silenceTimer!);
		}
	}

	// Auto-speak AI responses in hands-free mode
	$effect(() => {
		if (handsFreeEnabled && session?.status === 'idle' && conversationState === 'ai-thinking') {
			const lastMsg = session.messages[session.messages.length - 1];
			if (lastMsg?.role === 'assistant') {
				// Wait for typewriter to finish before speaking
				setTimeout(() => {
					if (handsFreeEnabled && conversationState === 'ai-thinking') {
						speakMessage(lastMsg.content, session.messages.length - 1);
					}
				}, 500);
			}
		}
	});

	// Interrupt detection: Stop TTS if user starts speaking
	$effect(() => {
		if (handsFreeEnabled && isListening && speakingIdx !== null) {
			// User started speaking while AI is talking → interrupt
			ttsService.stop();
			speakingIdx = null;
			conversationState = 'listening';
		}
	});

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

	// Conversation state labels for UI
	const stateLabels: Record<ConversationState, string> = {
		idle: 'Idle',
		listening: 'Listening...',
		processing: 'Processing speech...',
		'ai-thinking': 'AI thinking...',
		'ai-speaking': 'AI speaking...'
	};
</script>

<div class="flex flex-col border border-sand-dark rounded-lg bg-panel-soft overflow-hidden {className}" style:height>
	<!-- Header with Hands-Free Toggle -->
	{#if enableVoice && sttSupported}
		<div class="flex items-center justify-between px-3 py-2 border-b border-sand-dark bg-panel">
			<div class="flex items-center gap-2 text-xs">
				{#if handsFreeEnabled}
					<span
						class="flex items-center gap-1.5 px-2 py-1 rounded-full animate-pulse"
						style:background={conversationState === 'ai-speaking' ? 'rgba(255,215,0,0.15)' : conversationState === 'listening' ? 'rgba(34,197,94,0.15)' : 'rgba(100,100,100,0.1)'}
						style:color={conversationState === 'ai-speaking' ? '#ffd700' : conversationState === 'listening' ? '#22c55e' : '#888'}
					>
						<span class="w-1.5 h-1.5 rounded-full" style:background={conversationState === 'ai-speaking' ? '#ffd700' : conversationState === 'listening' ? '#22c55e' : '#888'}></span>
						<span>{stateLabels[conversationState]}</span>
					</span>
				{/if}
			</div>
			<button
				onclick={toggleHandsFree}
				class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-panel border border-sand-dark hover:border-accent transition-colors cursor-pointer"
				class:bg-accent-soft={handsFreeEnabled}
				class:border-accent={handsFreeEnabled}
				title={handsFreeEnabled ? 'Disable hands-free mode' : 'Enable hands-free mode'}
			>
				<Icon name={handsFreeEnabled ? 'radio' : 'headphones'} size={12} />
				<span>{handsFreeEnabled ? '🔴 Live' : '🎧 Hands-Free'}</span>
			</button>
		</div>
	{/if}

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
									class="p-0.5 rounded bg-transparent border-none opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
									onclick={() => copyMessage(msg.content, idx)}
									title={copiedIdx === idx ? 'Copied!' : 'Copy message'}
								>
									<Icon name={copiedIdx === idx ? 'check' : 'copy'} size={11} />
								</button>
								<!-- TTS Speak Button (Assistant messages only) -->
								{#if msg.role === 'assistant' && enableVoice}
									<button
										class="p-0.5 rounded bg-transparent border-none opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
										onclick={() => speakMessage(msg.content, idx)}
										title={speakingIdx === idx ? 'Stop speaking' : 'Speak response'}
										disabled={ttsInitializing}
									>
										{#if ttsInitializing && speakingIdx === idx}
											<Icon name="loader-2" size={11} class="animate-spin" />
										{:else if speakingIdx === idx}
											<Icon name="volume-x" size={11} />
										{:else}
											<Icon name="volume-2" size={11} />
										{/if}
									</button>
								{/if}
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
		<!-- Interim transcript indicator (while listening) -->
		{#if isListening && interimTranscript}
			<div class="mb-2 px-3 py-1.5 rounded bg-blue-950/40 border border-blue-800/30 text-xs text-blue-200 flex items-center gap-2">
				<Icon name="mic" size={12} class="animate-pulse" />
				<span class="opacity-60">Listening:</span>
				<span class="italic">{interimTranscript}</span>
			</div>
		{/if}

		<!-- Hands-free hint -->
		{#if handsFreeEnabled && conversationState === 'listening' && !currentMessage.trim()}
			<div class="mb-2 px-3 py-1.5 rounded bg-green-950/40 border border-green-800/30 text-xs text-green-200 flex items-center gap-2">
				<Icon name="radio" size={12} class="animate-pulse" />
				<span>Speak now — will auto-send after {silenceThreshold/1000}s of silence</span>
			</div>
		{/if}

		<div class="flex gap-2 items-end">
			<textarea
				placeholder={isListening ? "Listening... speak now" : handsFreeEnabled ? "Voice mode active..." : "Type a message..."}
				bind:value={currentMessage}
				onkeydown={handleKeydown}
				class="flex-1 bg-panel border border-sand-dark text-inherit text-sm px-3 py-2 rounded-lg resize-none min-h-10 outline-none focus:border-accent"
				class:border-blue-500={isListening}
				class:border-green-500={handsFreeEnabled && !isListening}
				rows={1}
				disabled={!session || session.status === 'thinking'}
			></textarea>

			<!-- Voice Input Button (STT) -->
			{#if enableVoice && sttSupported && !handsFreeEnabled}
				<Button
					onclick={toggleListening}
					disabled={!session || session.status !== 'idle'}
					class="{isListening ? 'bg-red-600 hover:bg-red-700' : ''} h-10 w-10 shrink-0 rounded-lg flex items-center justify-center"
					title={isListening ? 'Stop listening' : 'Voice input'}
				>
					<Icon name={isListening ? 'mic-off' : 'mic'} size={16} />
				</Button>
			{/if}

			<!-- Send Button -->
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
			{#if enableVoice && !sttSupported}
				<span class="px-1 py-px rounded bg-orange-900/30 text-orange-400 text-[9px]">
					Voice input unavailable (Chrome/Edge only)
				</span>
			{/if}
			{#if handsFreeEnabled}
				<span class="px-1 py-px rounded bg-green-900/30 text-green-400 text-[9px]">
					🔴 Hands-Free Active
				</span>
			{/if}
		</div>
	</div>
</div>