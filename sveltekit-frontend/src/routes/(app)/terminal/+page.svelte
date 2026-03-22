<script lang="ts">
	import { ChatSession } from '$lib/models/ChatSession.svelte.js';
	import TypewriterResponse from '$lib/components/ai/TypewriterResponse.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { analytics } from '$lib/stores/analytics.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { ttsService } from '$lib/services/tts';
	import { voiceCommands, COMMAND_PATTERNS } from '$lib/services/voice-commands';
	import AIRecommendation from '$lib/components/ai/AIRecommendation.svelte';
	import ChatContextPanel from '$lib/components/ChatContextPanel.svelte';
	import ThinkingStyleToggle from '$lib/components/ai/ThinkingStyleToggle.svelte';

	let session = $state<ChatSession | null>(null);
	let currentMessage = $state('');
	let showSettings = $state(false);
	let chatContainer: HTMLElement | undefined = $state(undefined);
	let lastCompletedIdx = $state<number | null>(null);

	// Voice state
	let enableVoice = $state(true);
	let isListening = $state(false);
	let speakingIdx = $state<number | null>(null);
	let handsFreeEnabled = $state(false);
	let ttsInitializing = $state(false);
	let recognition: any = $state(null);
	let sttSupported = $state(false);
	let conversationState = $state<'idle' | 'listening' | 'processing' | 'ai-thinking' | 'ai-speaking'>('idle');

	let ttsVolume = $state(1.0);
	let ttsRate = $state(1.0);

	let prefs = $state({
		enableThinking: true,
		typewriterSpeed: 40,
		autoScroll: true,
		forceServer: false,
		persona: 'neutral' as string,
		enableWebSearch: false,
		enableVoice: true,
		ttsVolume: 1.0,
		ttsRate: 1.0
	});

	$effect(() => {
		try {
			const saved = localStorage.getItem('terminal-prefs');
			if (saved) {
				Object.assign(prefs, JSON.parse(saved));
				enableVoice = prefs.enableVoice ?? true;
				ttsVolume = prefs.ttsVolume ?? 1.0;
				ttsRate = prefs.ttsRate ?? 1.0;
			}
		} catch { /* localStorage unavailable */ }
		const userId = page.data?.user?.id ?? 'anonymous';
		const chatId = `terminal-${userId}`;
		const s = new ChatSession(chatId, [], false);
		s.loadHistory();
		session = s;
		return () => { s.destroy(); };
	});

	$effect(() => {
		try {
			prefs.enableVoice = enableVoice;
			prefs.ttsVolume = ttsVolume;
			prefs.ttsRate = ttsRate;
			localStorage.setItem('terminal-prefs', JSON.stringify(prefs));
		} catch { /* localStorage unavailable */ }
	});

	$effect(() => {
		if (!browser) return;
		sttSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
		voiceCommands.register({ pattern: COMMAND_PATTERNS.SEND, action: () => sendMessage(), label: 'Send message', category: 'control' });
		voiceCommands.register({ pattern: COMMAND_PATTERNS.CLEAR, action: () => clearChat(), label: 'Clear chat', category: 'control' });
		voiceCommands.register({ pattern: COMMAND_PATTERNS.STOP_SPEAKING, action: () => stopSpeaking(), label: 'Stop speaking', category: 'tts' });
	});

	$effect(() => {
		const len = session?.messages?.length;
		if (len && len > 0 && prefs.autoScroll) {
			tick().then(() => {
				if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
			});
		}
	});

	let prevStatus = $state<string>('idle');
	$effect(() => {
		const status = session?.status ?? 'idle';
		if (prevStatus === 'streaming' && status === 'idle' && session) {
			const msgs = session.messages;
			for (let i = msgs.length - 1; i >= 0; i--) {
				if (msgs[i].role === 'assistant') { lastCompletedIdx = i; break; }
			}
		}
		prevStatus = status;
	});

	async function sendMessage() {
		if (!currentMessage.trim() || !session || session.status !== 'idle') return;
		const msg = currentMessage.trim();
		currentMessage = '';
		lastCompletedIdx = null;
		if (handsFreeEnabled) conversationState = 'ai-thinking';
		analytics.track('chat_query', { queryLength: msg.length, forceServer: prefs.forceServer });
		await session.sendMessage(msg, { forceServer: prefs.forceServer });
		if (handsFreeEnabled && session.messages.length > 0) {
			const lastMsg = session.messages[session.messages.length - 1];
			if (lastMsg.role === 'assistant') {
				const delay = prefs.enableThinking ? (lastMsg.content.length * prefs.typewriterSpeed) + 500 : 300;
				setTimeout(() => { speakMessage(lastMsg.content, session!.messages.length - 1); }, delay);
			}
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
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
		if (c > 0.8) return 'confidence-high';
		if (c > 0.6) return 'confidence-mid';
		return 'confidence-low';
	});

	let copiedIdx = $state<number | null>(null);
	async function copyMessage(content: string, idx: number) {
		if (!browser) return;
		try {
			await navigator.clipboard.writeText(content);
			copiedIdx = idx;
			setTimeout(() => { copiedIdx = null; }, 2000);
		} catch { /* clipboard unavailable */ }
	}

	const samplePrompts = [
		{ label: 'Analyze Evidence', text: 'Analyze the key evidence in this case and identify any inconsistencies.' },
		{ label: 'Legal Precedent', text: 'Find relevant legal precedents for a breach of contract dispute.' },
		{ label: 'Timeline', text: 'Help me construct a chronological timeline of events from the case documents.' },
		{ label: 'Statute Lookup', text: 'What statutes apply to property deed transfer in this jurisdiction?' },
		{ label: 'Draft Summary', text: 'Draft a case summary highlighting the strongest arguments for the plaintiff.' }
	];

	function useSamplePrompt(text: string) { currentMessage = text; }

	// ===== Voice Functions =====
	async function speakMessage(text: string, idx: number) {
		if (!enableVoice || !browser) return;
		if (speakingIdx === idx) { stopSpeaking(); return; }
		try {
			ttsInitializing = true;
			speakingIdx = idx;
			conversationState = 'ai-speaking';
			await ttsService.speak(text, { rate: ttsRate, volume: ttsVolume });
			speakingIdx = null;
			if (handsFreeEnabled) { conversationState = 'idle'; setTimeout(() => startListening(), 300); }
			else { conversationState = 'idle'; }
		} catch (err) {
			console.error('[Terminal] TTS error:', err);
			speakingIdx = null;
			conversationState = 'idle';
		} finally { ttsInitializing = false; }
	}

	function stopSpeaking() {
		ttsService.stop();
		speakingIdx = null;
		conversationState = 'idle';
	}

	function startListening() {
		if (!sttSupported || !enableVoice || !browser) return;
		if (isListening) { stopListening(); return; }
		try {
			const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
			recognition = new SpeechRecognition();
			recognition.continuous = false;
			recognition.interimResults = false;
			recognition.lang = 'en-US';
			recognition.onstart = () => { isListening = true; conversationState = 'listening'; };
			recognition.onresult = async (event: any) => {
				const transcript = event.results[0][0].transcript;
				conversationState = 'processing';
				const isCommand = await voiceCommands.execute(transcript);
				if (isCommand) { stopListening(); return; }
				currentMessage = transcript;
				stopListening();
				if (handsFreeEnabled) { conversationState = 'ai-thinking'; await sendMessage(); }
				else { conversationState = 'idle'; }
			};
			recognition.onerror = () => { stopListening(); };
			recognition.onend = () => {
				if (isListening) { isListening = false; if (conversationState === 'listening') conversationState = 'idle'; }
			};
			recognition.start();
		} catch (err) {
			console.error('[Terminal] Failed to start STT:', err);
			isListening = false;
			conversationState = 'idle';
		}
	}

	function stopListening() {
		if (recognition) { try { recognition.stop(); } catch { /* already stopped */ } }
		isListening = false;
		if (conversationState === 'listening' || conversationState === 'processing') conversationState = 'idle';
	}

	function toggleHandsFree() {
		handsFreeEnabled = !handsFreeEnabled;
		if (handsFreeEnabled) startListening();
		else { stopListening(); stopSpeaking(); conversationState = 'idle'; }
	}

	const stateLabels: Record<typeof conversationState, string> = {
		idle: 'IDLE', listening: 'LISTENING...', processing: 'PROCESSING...',
		'ai-thinking': 'AI ANALYZING...', 'ai-speaking': 'AI SPEAKING...'
	};
</script>

<div class="term-page">
	<!-- Header -->
	<header class="term-header">
		<div class="term-header-left">
			<Icon name="terminal" size={24} class="term-icon-emerald" />
			<div>
				<h1 class="term-title">&gt;_ AI CHAT INTERFACE</h1>
				<div class="term-status-line">
					<span
						class="term-status-dot"
						style:background={session?.connectionStatus === 'disconnected' ? '#ef4444' : '#10b981'}
						style:box-shadow={session?.connectionStatus === 'disconnected' ? '0 0 8px #ef4444' : '0 0 8px #10b981'}
					></span>
					{session?.connectionStatus === 'connected' ? 'SYSTEM ONLINE' : 'OFFLINE MODE'}
				</div>
			</div>
		</div>

		<div class="term-header-right">
			{#if enableVoice && sttSupported}
				<button
					onclick={toggleHandsFree}
					class="term-pill"
					class:term-pill-live={handsFreeEnabled}
					title={handsFreeEnabled ? 'Disable hands-free mode' : 'Enable hands-free mode'}
				>
					<Icon name={handsFreeEnabled ? 'radio' : 'headphones'} size={14} />
					{handsFreeEnabled ? 'LIVE' : 'VOICE'}
					{#if handsFreeEnabled}
						<span class="term-state-tag">({stateLabels[conversationState]})</span>
					{/if}
				</button>
			{/if}
			<button class="term-pill">TERMINAL</button>
			<button class="term-pill term-pill-active">AI CHAT</button>
			<button class="term-pill term-pill-danger" onclick={clearChat}>CLEAR</button>
			{#if prefs.persona !== 'neutral'}
				<div class="term-badge term-badge-amber">
					<Icon name="user-cog" size={12} />
					{prefs.persona.toUpperCase()}
				</div>
			{/if}
			{#if prefs.enableWebSearch}
				<div class="term-badge term-badge-blue">
					<Icon name="globe" size={12} />
					WEB
				</div>
			{/if}
			{#if session}
				<div class="term-badge term-badge-muted">
					<Icon name="cpu" size={12} />
					{session.lastSource === 'local-onnx' ? 'LOCAL' : 'SERVER'}
				</div>
				{#if session.lastConfidence < 1}
					<span class="term-badge {confidenceColor}">
						{Math.round(session.lastConfidence * 100)}%
					</span>
				{/if}
			{/if}
			<button
				class="term-icon-btn"
				onclick={() => showSettings = !showSettings}
				aria-label="Toggle settings panel"
				title="Settings"
			>
				<Icon name="settings" size={18} />
			</button>
		</div>
	</header>

	<!-- Settings Panel -->
	{#if showSettings}
		<div class="term-settings">
			<label class="term-setting-item">
				<input type="checkbox" bind:checked={prefs.enableThinking} class="term-checkbox" />
				Thinking animation
			</label>
			<label class="term-setting-item">
				Typewriter speed
				<input type="range" min="10" max="100" bind:value={prefs.typewriterSpeed} class="term-range" />
				<span>{prefs.typewriterSpeed}ms</span>
			</label>
			<label class="term-setting-item">
				<input type="checkbox" bind:checked={prefs.autoScroll} class="term-checkbox" />
				Auto-scroll
			</label>
			<label class="term-setting-item">
				<input type="checkbox" bind:checked={prefs.forceServer} class="term-checkbox" />
				Force server (Ollama)
			</label>
			<label class="term-setting-item">
				<input type="checkbox" bind:checked={prefs.enableWebSearch} class="term-checkbox" />
				Web search
			</label>
			<label class="term-setting-item">
				Persona
				<select bind:value={prefs.persona} class="term-select">
					<option value="neutral">Neutral Analyst</option>
					<option value="prosecutor">Prosecution Focus</option>
					<option value="defense">Defense Focus</option>
					<option value="plain-language">Plain Language</option>
					<option value="academic">Academic / Research</option>
				</select>
			</label>
			<div class="term-divider"></div>
			<label class="term-setting-item">
				<input type="checkbox" bind:checked={enableVoice} class="term-checkbox-amber" />
				<Icon name="volume-2" size={14} class="term-icon-amber" />
				Voice enabled
			</label>
			{#if enableVoice}
				<label class="term-setting-item">
					TTS Volume
					<input type="range" min="0" max="1" step="0.1" bind:value={ttsVolume} class="term-range-amber" />
					<span>{Math.round(ttsVolume * 100)}%</span>
				</label>
				<label class="term-setting-item">
					TTS Speed
					<input type="range" min="0.5" max="2" step="0.1" bind:value={ttsRate} class="term-range-amber" />
					<span>{ttsRate.toFixed(1)}x</span>
				</label>
			{/if}
			<div class="term-divider"></div>
			<Button onclick={clearChat} class="term-clear-btn">
				<Icon name="trash-2" size={14} />
				Clear chat
			</Button>
		</div>
	{/if}

	<!-- Chat Viewport -->
	<div class="term-viewport">
		<!-- 9S Header -->
		<div class="term-9s-header">
			<Icon name="bot" size={18} class="term-icon-emerald" />
			<div>
				<span class="term-9s-name">9S AI ASSISTANT</span>
				<p class="term-9s-subtitle">YoRHa AI Assistant Online — Detective Support System Active</p>
			</div>
		</div>
		<div class="term-messages" bind:this={chatContainer}>
			{#if !session || session.messages.length === 0}
				<div class="term-empty">
					<Icon name="bot" size={48} class="term-icon-emerald-dim" />
					<p class="term-empty-text">Initialize communication sequence...</p>
					<small class="term-empty-hint">Ask 9S about your investigation, or try a prompt below.</small>
					<div class="term-prompts">
						{#each samplePrompts as prompt}
							<button class="term-prompt-chip" onclick={() => useSamplePrompt(prompt.text)}>
								{prompt.label}
							</button>
						{/each}
					</div>
					<div class="term-recommendation">
						<AIRecommendation onselect={(text) => { currentMessage = text; }} />
					</div>
				</div>
			{:else}
				<ChatContextPanel />
				{#each session.messages as msg, idx (idx)}
					<div
						class="term-msg"
						class:term-msg-user={msg.role === 'user'}
						class:term-msg-assistant={msg.role === 'assistant'}
					>
						<div class="term-avatar" class:term-avatar-user={msg.role === 'user'} class:term-avatar-bot={msg.role === 'assistant'}>
							{#if msg.role === 'assistant'}
								<Icon name="bot" size={18} />
							{:else}
								<Icon name="user" size={18} />
							{/if}
						</div>

						<div class="term-msg-body">
							<div class="term-msg-meta">
								<span>{msg.role === 'user' ? 'DETECTIVE' : '9S ASSISTANT'}</span>
								<span>{formatTime(msg.timestamp)}</span>
								{#if msg.source}
									<span class="term-source-tag">
										{msg.source === 'local-onnx' ? 'LOCAL' : 'SERVER'}
									</span>
								{/if}
								<button
									class="term-meta-btn"
									onclick={() => copyMessage(msg.content, idx)}
									title={copiedIdx === idx ? 'Copied!' : 'Copy message'}
								>
									<Icon name={copiedIdx === idx ? 'check' : 'copy'} size={12} />
								</button>
								{#if msg.role === 'assistant' && enableVoice}
									<button
										class="term-meta-btn term-meta-btn-amber"
										onclick={() => speakMessage(msg.content, idx)}
										title={speakingIdx === idx ? 'Stop speaking' : 'Speak response'}
										disabled={ttsInitializing}
									>
										{#if ttsInitializing && speakingIdx === idx}
											<Icon name="loader-circle" size={12} class="animate-spin" />
										{:else if speakingIdx === idx}
											<Icon name="volume-x" size={12} />
										{:else}
											<Icon name="volume-2" size={12} />
										{/if}
									</button>
								{/if}
							</div>

							<div class="term-bubble" class:term-bubble-user={msg.role === 'user'} class:term-bubble-bot={msg.role !== 'user'}>
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
								<div class="term-msg-tags">
									<span class="term-source-tag">
										Confidence: {Math.round((msg.metadata.confidence ?? 0) * 100)}%
									</span>
									{#if msg.metadata.citations?.length}
										<span class="term-source-tag">
											{msg.metadata.citations.length} sources
										</span>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/each}

				{#if session.status === 'thinking'}
					<div class="term-msg term-msg-assistant">
						<div class="term-avatar term-avatar-bot">
							<Icon name="bot" size={18} />
						</div>
						<div class="term-msg-body">
							<div class="term-thinking">
								<Icon name="loader-circle" size={16} class="animate-spin" />
								<span>9S IS ANALYZING...</span>
							</div>
						</div>
					</div>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Error Display -->
	{#if session?.error}
		<div class="term-error">
			<Icon name="triangle-alert" size={14} />
			<span>{session.error}</span>
		</div>
	{/if}

	<!-- Input Area -->
	<footer class="term-footer">
		<div class="term-input-row">
			{#if enableVoice && sttSupported}
				<button
					onclick={startListening}
					disabled={!session || session.status === 'thinking' || handsFreeEnabled}
					class="term-mic-btn"
					class:term-mic-active={isListening}
					title={isListening ? 'Listening... (click to stop)' : 'Start voice input'}
					aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
				>
					<Icon name="mic" size={20} />
				</button>
			{/if}
			<textarea
				placeholder="Ask 9S about your investigation..."
				bind:value={currentMessage}
				onkeydown={handleKeydown}
				class="term-textarea"
				rows={1}
				disabled={!session || session.status === 'thinking'}
			></textarea>
			<Button
				onclick={sendMessage}
				disabled={!session || session.status !== 'idle' || !currentMessage.trim()}
				class="term-send-btn"
			>
				SEND
				<Icon name="send" size={14} />
			</Button>
		</div>
		<div class="term-footer-meta">
			<div class="term-footer-left">
				<span
					class="term-status-dot-sm"
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
	/* ── Page shell ── */
	.term-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		margin: -2.5rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		background: #0c0a09;
		color: #e7e5e4;
	}

	/* ── Header ── */
	.term-header {
		padding: 0.75rem 1.5rem;
		background: #1c1917;
		border-bottom: 2px solid #44403c;
		display: flex;
		justify-content: space-between;
		align-items: center;
		box-shadow: 0 2px 8px rgba(0,0,0,0.3);
		z-index: 10;
		flex-shrink: 0;
	}
	.term-header-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.term-header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	:global(.term-icon-emerald) { color: #34d399; }
	:global(.term-icon-emerald-dim) { color: #065f46; }
	:global(.term-icon-amber) { color: #fbbf24; }
	.term-title {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0;
		letter-spacing: 0.1em;
		color: #fafaf9;
	}
	.term-status-line {
		font-size: 0.7rem;
		color: #10b981;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.125rem;
	}
	.term-status-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 9999px;
		flex-shrink: 0;
	}
	.term-status-dot-sm {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 9999px;
		flex-shrink: 0;
	}

	/* ── Pills / badges ── */
	.term-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border-radius: 0.25rem;
		font-size: 0.7rem;
		font-family: inherit;
		letter-spacing: 0.1em;
		border: 1px solid #57534e;
		background: transparent;
		color: #a8a29e;
		cursor: pointer;
		transition: all 0.15s;
	}
	.term-pill:hover { border-color: #059669; color: #34d399; }
	.term-pill-active {
		border-color: #10b981;
		color: #34d399;
		background: #022c22;
	}
	.term-pill-danger {
		border-color: #991b1b;
		color: #f87171;
	}
	.term-pill-danger:hover { background: #450a0a; }
	.term-pill-live {
		border-color: #ef4444;
		background: #450a0a;
		color: #f87171;
	}
	.term-state-tag {
		font-size: 0.6rem;
		opacity: 0.7;
	}
	.term-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.65rem;
		padding: 0.25rem 0.625rem;
		border-radius: 0.25rem;
		border: 1px solid;
	}
	.term-badge-amber {
		color: #fbbf24;
		border-color: #92400e;
		background: rgba(120, 53, 15, 0.3);
	}
	.term-badge-blue {
		color: #60a5fa;
		border-color: #1e3a5f;
		background: rgba(30, 58, 95, 0.3);
	}
	.term-badge-muted {
		color: #78716c;
		border-color: #44403c;
	}
	.confidence-high { color: #4ade80; border-color: #44403c; }
	.confidence-mid { color: #facc15; border-color: #44403c; }
	.confidence-low { color: #f87171; border-color: #44403c; }

	/* ── Icon button ── */
	.term-icon-btn {
		background: transparent;
		border: 1px solid #44403c;
		color: #78716c;
		padding: 0.375rem;
		border-radius: 0.25rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		transition: all 0.15s;
	}
	.term-icon-btn:hover { color: #e7e5e4; border-color: #78716c; }

	/* ── Settings panel ── */
	.term-settings {
		background: #1c1917;
		border-bottom: 1px solid #44403c;
		padding: 0.625rem 1.5rem;
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		font-size: 0.8rem;
		color: #a8a29e;
		flex-shrink: 0;
		align-items: center;
	}
	.term-setting-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		cursor: pointer;
	}
	.term-checkbox { accent-color: #10b981; }
	.term-checkbox-amber { accent-color: #fbbf24; }
	.term-range { width: 5rem; accent-color: #10b981; }
	.term-range-amber { width: 5rem; accent-color: #fbbf24; }
	.term-select {
		background: #0c0a09;
		border: 1px solid #57534e;
		color: #d6d3d1;
		font-size: 0.7rem;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
	}
	.term-divider {
		width: 1px;
		height: 1.5rem;
		background: #57534e;
	}

	/* ── Chat viewport ── */
	.term-viewport {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		margin: 0.75rem 1rem;
		border: 1px solid rgba(6, 78, 59, 0.4);
		border-radius: 0.5rem;
		overflow: hidden;
	}
	.term-9s-header {
		padding: 0.625rem 1rem;
		background: #1c1917;
		border-bottom: 1px solid rgba(6, 78, 59, 0.3);
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.term-9s-name {
		font-size: 0.85rem;
		font-weight: 700;
		color: #34d399;
		letter-spacing: 0.1em;
	}
	.term-9s-subtitle {
		font-size: 0.6rem;
		color: #78716c;
		margin: 0;
	}
	.term-messages {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1.5rem;
	}

	/* ── Empty state ── */
	.term-empty {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: #57534e;
		gap: 1rem;
		text-align: center;
	}
	.term-empty-text {
		font-size: 1.1rem;
		margin: 0;
		color: #047857;
	}
	.term-empty-hint {
		font-size: 0.75rem;
		color: #57534e;
	}
	.term-prompts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.5rem;
		max-width: 32rem;
		justify-content: center;
	}
	.term-prompt-chip {
		padding: 0.375rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.7rem;
		font-family: inherit;
		border: 1px solid rgba(6, 78, 59, 0.3);
		color: #10b981;
		background: rgba(6, 78, 59, 0.2);
		cursor: pointer;
		transition: all 0.15s;
	}
	.term-prompt-chip:hover {
		background: rgba(6, 78, 59, 0.4);
		border-color: #059669;
	}
	.term-recommendation {
		width: 100%;
		max-width: 32rem;
		margin-top: 0.75rem;
	}

	/* ── Messages ── */
	.term-msg {
		display: flex;
		gap: 0.75rem;
		max-width: 85%;
		margin-bottom: 1.25rem;
		animation: fadeIn 0.3s ease-out;
	}
	.term-msg-user {
		margin-left: auto;
		flex-direction: row-reverse;
	}
	.term-msg-assistant {
		margin-right: auto;
	}
	.term-avatar {
		width: 2rem;
		height: 2rem;
		border-radius: 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.term-avatar-user {
		background: #2563eb;
		color: white;
	}
	.term-avatar-bot {
		background: #44403c;
		color: #e7e5e4;
		border: 1px solid #57534e;
	}
	.term-msg-body {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}
	.term-msg-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.65rem;
		color: #78716c;
	}
	.term-source-tag {
		font-size: 0.6rem;
		padding: 0.0625rem 0.375rem;
		border-radius: 0.25rem;
		background: #292524;
		border: 1px solid #44403c;
		color: #a8a29e;
	}
	.term-meta-btn {
		background: transparent;
		border: none;
		color: #57534e;
		cursor: pointer;
		padding: 0.125rem;
		border-radius: 0.125rem;
		transition: color 0.15s;
	}
	.term-meta-btn:hover { color: #34d399; }
	.term-meta-btn-amber:hover { color: #fbbf24; }
	.term-bubble {
		padding: 0.75rem 1rem;
		border-radius: 0.25rem;
		border: 1px solid;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: 0.85rem;
	}
	.term-bubble-user {
		background: #172554;
		border-color: #1e3a8a;
		color: white;
	}
	.term-bubble-bot {
		background: #1c1917;
		border-color: #292524;
		color: #d6d3d1;
	}
	.term-msg-tags {
		display: flex;
		gap: 0.375rem;
		margin-top: 0.25rem;
	}

	/* ── Thinking indicator ── */
	.term-thinking {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: #10b981;
		font-size: 0.85rem;
		padding: 0.75rem 1rem;
		background: #1c1917;
		border: 1px dashed rgba(6, 78, 59, 0.4);
		border-radius: 0.25rem;
	}

	/* ── Error ── */
	.term-error {
		padding: 0.5rem 1.5rem;
		background: #450a0a;
		border-top: 1px solid #991b1b;
		color: #fca5a5;
		font-size: 0.8rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	/* ── Footer / Input ── */
	.term-footer {
		padding: 1rem 1.5rem 1.25rem;
		background: #1c1917;
		border-top: 1px solid #292524;
		flex-shrink: 0;
	}
	.term-input-row {
		display: flex;
		gap: 0.75rem;
		max-width: 75rem;
		margin: 0 auto;
		align-items: flex-end;
	}
	.term-mic-btn {
		width: 3rem;
		height: 3rem;
		flex-shrink: 0;
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid #57534e;
		background: #292524;
		color: #d6d3d1;
		cursor: pointer;
		transition: all 0.15s;
	}
	.term-mic-btn:hover { background: #44403c; }
	.term-mic-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.term-mic-active {
		background: #dc2626;
		border-color: #ef4444;
		color: white;
	}
	.term-mic-active:hover { background: #b91c1c; }
	.term-textarea {
		flex: 1;
		background: #0c0a09;
		border: 1px solid #44403c;
		color: #e7e5e4;
		font-family: inherit;
		font-size: 0.85rem;
		padding: 0.75rem 1rem;
		border-radius: 0.25rem;
		resize: none;
		min-height: 3rem;
		outline: none;
	}
	.term-textarea:focus { border-color: #059669; }
	.term-textarea:disabled { opacity: 0.5; }
	.term-footer-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.6rem;
		color: #57534e;
		margin-top: 0.75rem;
		padding: 0 0.25rem;
	}
	.term-footer-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* ── Scrollbar ── */
	.term-messages::-webkit-scrollbar { width: 6px; }
	.term-messages::-webkit-scrollbar-track { background: transparent; }
	.term-messages::-webkit-scrollbar-thumb {
		background: rgba(6, 78, 59, 0.5);
		border-radius: 2px;
	}

	/* ── Animation ── */
	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(8px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
