<script lang="ts">
	import { ChatSession, type ChatMessage } from '$lib/models/ChatSession.svelte.js';
	import TypewriterResponse from '$lib/components/ai/TypewriterResponse.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { ScrollArea } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { tick } from 'svelte';
	import { page } from '$app/state';

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
		forceServer: false
	});

	// Initialize session and load prefs
	$effect(() => {
		// Load persisted prefs
		try {
			const saved = localStorage.getItem('terminal-prefs');
			if (saved) Object.assign(prefs, JSON.parse(saved));
		} catch { /* localStorage unavailable */ }

		// Create chat session linked to user
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
			// Streaming just completed — mark last assistant message for typewriter
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
</script>

<div class="terminal-container">
	<!-- Header -->
	<header class="terminal-header">
		<div class="header-left">
			<Icon name="bot" size={24} />
			<div>
				<h1>YoRHa COMMAND TERMINAL</h1>
				<div class="status">
					<span class="status-dot" class:offline={session?.connectionStatus === 'disconnected'}></span>
					{session?.connectionStatus === 'connected' ? 'SYSTEM ONLINE' : 'OFFLINE MODE'}
				</div>
			</div>
		</div>

		<div class="header-controls">
			{#if session}
				<div class="session-chip">
					<Icon name="cpu" size={12} />
					{session.lastSource === 'local-onnx' ? 'LOCAL' : 'SERVER'}
				</div>
				{#if session.lastConfidence < 1}
					<span class="confidence-chip {confidenceColor}">
						{Math.round(session.lastConfidence * 100)}%
					</span>
				{/if}
			{/if}
			<button class="settings-btn" onclick={() => showSettings = !showSettings}>
				<Icon name="settings" size={18} />
			</button>
		</div>
	</header>

	<!-- Settings Panel -->
	{#if showSettings}
		<div class="settings-panel">
			<div class="settings-row">
				<label>
					<input type="checkbox" bind:checked={prefs.enableThinking} />
					Thinking animation
				</label>
			</div>
			<div class="settings-row">
				<label>
					Typewriter speed
					<input type="range" min="10" max="100" bind:value={prefs.typewriterSpeed} />
					<span>{prefs.typewriterSpeed}ms</span>
				</label>
			</div>
			<div class="settings-row">
				<label>
					<input type="checkbox" bind:checked={prefs.autoScroll} />
					Auto-scroll
				</label>
			</div>
			<div class="settings-row">
				<label>
					<input type="checkbox" bind:checked={prefs.forceServer} />
					Force server (Ollama)
				</label>
			</div>
			<div class="settings-row">
				<Button onclick={clearChat} class="clear-btn">
					<Icon name="trash-2" size={14} />
					Clear chat
				</Button>
			</div>
		</div>
	{/if}

	<!-- Chat Viewport -->
	<ScrollArea.Root class="chat-scroll-root">
		<ScrollArea.Viewport class="chat-viewport" bind:ref={chatContainer}>
			{#if !session || session.messages.length === 0}
				<div class="empty-state">
					<Icon name="bot" size={48} />
					<p>Initialize communication sequence...</p>
					<small>Type a command or query to begin.</small>
				</div>
			{:else}
				{#each session.messages as msg, idx (idx)}
					<div class="message-row {msg.role}">
						<div class="avatar {msg.role}">
							{#if msg.role === 'assistant'}
								<Icon name="bot" size={18} />
							{:else}
								<Icon name="user" size={18} />
							{/if}
						</div>

						<div class="message-body">
							<div class="sender-line">
								<span class="sender">{msg.role === 'user' ? 'OPERATOR' : 'YoRHa UNIT'}</span>
								<span class="time">{formatTime(msg.timestamp)}</span>
								{#if msg.source}
									<span class="source-badge">{msg.source === 'local-onnx' ? 'LOCAL' : 'SERVER'}</span>
								{/if}
							</div>

							<div class="message-text">
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
								<div class="meta-badges">
									<span class="meta-badge">
										Confidence: {Math.round((msg.metadata.confidence ?? 0) * 100)}%
									</span>
									{#if msg.metadata.citations?.length}
										<span class="meta-badge">
											{msg.metadata.citations.length} sources
										</span>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/each}

				{#if session.status === 'thinking'}
					<div class="message-row assistant">
						<div class="avatar assistant">
							<Icon name="bot" size={18} />
						</div>
						<div class="message-body">
							<div class="thinking-indicator">
								<Icon name="loader-2" size={16} class="animate-spin" />
								<span>Processing input stream...</span>
							</div>
						</div>
					</div>
				{/if}
			{/if}
		</ScrollArea.Viewport>
		<ScrollArea.Scrollbar orientation="vertical" class="chat-scrollbar">
			<ScrollArea.Thumb class="chat-scrollbar-thumb" />
		</ScrollArea.Scrollbar>
	</ScrollArea.Root>

	<!-- Error Display -->
	{#if session?.error}
		<div class="error-bar">
			<Icon name="alert-triangle" size={14} />
			<span>{session.error}</span>
		</div>
	{/if}

	<!-- Input Area -->
	<footer class="input-area">
		<div class="input-wrapper">
			<textarea
				placeholder="Enter command execution parameters..."
				bind:value={currentMessage}
				onkeydown={handleKeydown}
				class="terminal-input"
				rows={1}
				disabled={!session || session.status === 'thinking'}
			></textarea>
			<Button
				onclick={sendMessage}
				disabled={!session || session.status !== 'idle' || !currentMessage.trim()}
				class="send-btn"
			>
				<Icon name="send" size={18} />
			</Button>
		</div>
		<div class="disclaimer">
			CAUTION: System responses generated by AI models. Verify critical legal information manually.
		</div>
	</footer>
</div>

<style>
	.terminal-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		font-family: 'JetBrains Mono', 'Monaco', 'Menlo', monospace;
		background-color: #0c0a09;
		color: #e7e5e4;
	}

	.terminal-header {
		padding: 1rem 1.5rem;
		background: #1c1917;
		border-bottom: 2px solid #44403c;
		display: flex;
		justify-content: space-between;
		align-items: center;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
		z-index: 10;
		flex-shrink: 0;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	h1 {
		font-size: 1.25rem;
		margin: 0;
		letter-spacing: 0.1em;
		color: #fafaf9;
	}

	.status {
		font-size: 0.75rem;
		color: #10b981;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		background: #10b981;
		border-radius: 50%;
		box-shadow: 0 0 8px #10b981;
	}

	.status-dot.offline {
		background: #ef4444;
		box-shadow: 0 0 8px #ef4444;
	}

	.header-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.session-chip {
		font-size: 0.7rem;
		color: #78716c;
		border: 1px solid #44403c;
		padding: 0.2rem 0.6rem;
		border-radius: 4px;
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.confidence-chip {
		font-size: 0.7rem;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		border: 1px solid #44403c;
	}

	.settings-btn {
		background: none;
		border: 1px solid #44403c;
		color: #78716c;
		padding: 0.35rem;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
	}

	.settings-btn:hover {
		color: #e7e5e4;
		border-color: #78716c;
	}

	.settings-panel {
		background: #1c1917;
		border-bottom: 1px solid #292524;
		padding: 0.75rem 1.5rem;
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		font-size: 0.8rem;
		color: #a8a29e;
		flex-shrink: 0;
	}

	.settings-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.settings-row label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
	}

	.settings-row input[type="checkbox"] {
		accent-color: #2563eb;
	}

	.settings-row input[type="range"] {
		width: 80px;
		accent-color: #2563eb;
	}

	:global(.clear-btn) {
		font-size: 0.75rem !important;
		padding: 0.25rem 0.5rem !important;
		background: #292524 !important;
		color: #a8a29e !important;
		border: 1px solid #44403c !important;
	}

	:global(.chat-scroll-root) {
		flex: 1;
		min-height: 0;
	}

	:global(.chat-viewport) {
		height: 100%;
		padding: 1.5rem;
	}

	:global(.chat-scrollbar) {
		width: 6px;
		padding: 2px;
	}

	:global(.chat-scrollbar-thumb) {
		background: #44403c;
		border-radius: 3px;
	}

	.empty-state {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: #57534e;
		gap: 1rem;
		text-align: center;
	}

	.empty-state p {
		font-size: 1.25rem;
		margin: 0;
	}

	.message-row {
		display: flex;
		gap: 0.75rem;
		max-width: 85%;
		margin-bottom: 1.25rem;
		animation: fadeIn 0.3s ease-out;
	}

	.message-row.user {
		margin-left: auto;
		flex-direction: row-reverse;
	}

	.message-row.assistant {
		margin-right: auto;
	}

	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(8px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.avatar {
		width: 32px;
		height: 32px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.avatar.user {
		background: #2563eb;
		color: white;
	}

	.avatar.assistant {
		background: #44403c;
		color: #e7e5e4;
		border: 1px solid #57534e;
	}

	.message-body {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.sender-line {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		color: #78716c;
	}

	.source-badge {
		font-size: 0.6rem;
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
		background: #292524;
		border: 1px solid #44403c;
		color: #a8a29e;
	}

	.message-text {
		background: #1c1917;
		padding: 0.75rem 1rem;
		border-radius: 4px;
		border: 1px solid #292524;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
		color: #d6d3d1;
		font-size: 0.9rem;
	}

	.user .message-text {
		background: #1e3a8a;
		border-color: #1e40af;
		color: white;
	}

	.meta-badges {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.25rem;
	}

	.meta-badge {
		font-size: 0.65rem;
		padding: 0.15rem 0.4rem;
		border-radius: 3px;
		background: #292524;
		border: 1px solid #44403c;
		color: #78716c;
	}

	.thinking-indicator {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: #78716c;
		font-size: 0.875rem;
		padding: 0.75rem 1rem;
		background: #1c1917;
		border: 1px dashed #44403c;
		border-radius: 4px;
	}

	.error-bar {
		padding: 0.5rem 1.5rem;
		background: #450a0a;
		border-top: 1px solid #7f1d1d;
		color: #fca5a5;
		font-size: 0.8rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.input-area {
		padding: 1.25rem 1.5rem;
		background: #1c1917;
		border-top: 1px solid #292524;
		flex-shrink: 0;
	}

	.input-wrapper {
		display: flex;
		gap: 0.75rem;
		max-width: 1200px;
		margin: 0 auto;
		align-items: flex-end;
	}

	.terminal-input {
		flex: 1;
		background: #0c0a09;
		border: 1px solid #44403c;
		color: #e7e5e4;
		font-family: 'JetBrains Mono', 'Monaco', 'Menlo', monospace;
		font-size: 0.9rem;
		padding: 0.75rem 1rem;
		border-radius: 4px;
		resize: none;
		min-height: 48px;
		outline: none;
	}

	.terminal-input:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
	}

	.terminal-input:disabled {
		opacity: 0.5;
	}

	:global(.send-btn) {
		height: 48px !important;
		width: 48px !important;
		flex-shrink: 0;
		background: #2563eb !important;
		border-radius: 4px !important;
		display: flex !important;
		align-items: center !important;
		justify-content: center !important;
	}

	:global(.send-btn:hover:not(:disabled)) {
		background: #1d4ed8 !important;
	}

	.disclaimer {
		text-align: center;
		font-size: 0.65rem;
		color: #44403c;
		margin-top: 0.75rem;
	}

	:global(.animate-spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
