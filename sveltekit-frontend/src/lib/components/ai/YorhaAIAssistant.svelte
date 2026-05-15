<script lang="ts">
	import { tick } from 'svelte';
	import { browser } from '$app/environment';
	import Button from '$lib/components/ui/Button.svelte';
	type ChatMessage = {
		id: string;
		role: 'user' | 'assistant' | 'system';
		content: string;
		timestamp: Date;
		streaming?: boolean;
		confidence?: number;
		metadata?: Record<string, unknown>;
	};

	type ChatSession = {
		id: string;
		userID: string;
		messages: ChatMessage[];
		context: {
			caseID?: string;
			userIntent?: string;
			confidence?: number;
		};
	};

	type Transport = 'websocket' | 'sse' | 'none';

	interface Props {
		userID: string;
		caseID?: string;
		initialOpen?: boolean;
		theme?: 'light' | 'dark' | 'yorha';
		enableGPUAcceleration?: boolean;
	}

	let {
		userID,
		caseID = '',
		initialOpen = false,
		theme = 'yorha',
		enableGPUAcceleration = true
	}: Props = $props();

	let isOpen = $state(false);
	$effect(() => { isOpen = initialOpen; });
	let currentMessage = $state('');
	let chatContainer = $state<HTMLElement | null>(null);
	let chatSocket = $state<WebSocket | null>(null);
	let transport = $state<Transport>('none');
	let isConnecting = $state(false);
	let isStreaming = $state(false);
	let sseAbortController = $state<AbortController | null>(null);

	const isConnected = $derived(transport !== 'none');

	let chatSession = $state<ChatSession>({
		id: `session_${Date.now()}`,
		userID: '',
		messages: [],
		context: {
			userIntent: 'general',
			confidence: 0.8
		}
	});
	$effect(() => {
		chatSession.userID = userID;
		chatSession.context.caseID = caseID;
	});

	// Build conversationId for SSE endpoint (case-scoped if available)
	const conversationId = $derived(
		caseID ? `case-${caseID}` : `chat-${chatSession.id}`
	);

	// Connection management: try WebSocket first, fall back to SSE
	$effect(() => {
		if (!isOpen || !browser) {
			chatSocket?.close();
			chatSocket = null;
			transport = 'none';
			return;
		}

		isConnecting = true;
		connectWebSocket();

		return () => {
			chatSocket?.close();
			chatSocket = null;
			sseAbortController?.abort();
		};
	});

	function connectWebSocket() {
		const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
		const wsHost = `${location.hostname}:8099`;
		const wsUrl = `${wsProtocol}://${wsHost}/ws/chat?user_id=${encodeURIComponent(userID)}&session_id=${encodeURIComponent(chatSession.id)}`;

		const socket = new WebSocket(wsUrl);

		// If WebSocket doesn't connect within 3s, fall back to SSE
		const wsTimeout = setTimeout(() => {
			if (socket.readyState !== WebSocket.OPEN) {
				socket.close();
				fallbackToSSE();
			}
		}, 3000);

		socket.onopen = () => {
			clearTimeout(wsTimeout);
			chatSocket = socket;
			transport = 'websocket';
			isConnecting = false;
			addSystemMessage('Connected via WebSocket.');
		};

		socket.onmessage = (event) => {
			const raw = event.data;
			if (!raw) return;

			if (typeof raw === 'string') {
				try {
					handleChatResponse(JSON.parse(raw));
				} catch {
					handleChatResponse({ streaming: true, token: raw });
				}
				return;
			}

			try {
				const text = new TextDecoder().decode(raw as ArrayBuffer);
				try {
					handleChatResponse(JSON.parse(text));
				} catch {
					handleChatResponse({ streaming: true, token: text });
				}
			} catch (err) {
				console.error('Unhandled chat message format:', err);
			}
		};

		socket.onclose = () => {
			clearTimeout(wsTimeout);
			chatSocket = null;
			if (transport === 'websocket') {
				fallbackToSSE();
				addSystemMessage('WebSocket disconnected. Switched to SSE.');
			}
		};

		socket.onerror = () => {
			clearTimeout(wsTimeout);
			socket.close();
		};
	}

	function fallbackToSSE() {
		transport = 'sse';
		isConnecting = false;
		const lastMsg = chatSession.messages[chatSession.messages.length - 1];
		if (!lastMsg || lastMsg.content !== 'Connected via SSE (Server-Sent Events).') {
			addSystemMessage('Connected via SSE (Server-Sent Events).');
		}
	}

	function addSystemMessage(content: string) {
		chatSession.messages.push({
			id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
			role: 'system',
			content,
			timestamp: new Date()
		});
	}

	// Auto-scroll
	$effect(() => {
		if (chatSession.messages.length && chatContainer) {
			tick().then(() => {
				if (chatContainer) {
					chatContainer.scrollTop = chatContainer.scrollHeight;
				}
			});
		}
	});

	function handleChatResponse(data: Record<string, unknown>) {
		if (!data) return;

		const isStream = !!data.streaming;
		const token = typeof data.token === 'string' ? data.token : '';
		const responseText =
			typeof data.response === 'string'
				? data.response
				: typeof data.content === 'string'
					? (data.content as string)
					: '';
		const status = data.status as string | undefined;
		const confidence = typeof data.confidence === 'number' ? data.confidence : undefined;

		if (isStream || status === 'streaming') {
			isStreaming = true;
			const streamingMessage = chatSession.messages.find((m) => m.streaming);
			if (!streamingMessage) {
				chatSession.messages.push({
					id: `streaming_${Date.now()}`,
					role: 'assistant',
					content: status === 'streaming' ? responseText : token,
					timestamp: new Date(),
					streaming: true,
					metadata: { gpu_accelerated: enableGPUAcceleration }
				});
			} else {
				if (status === 'streaming') {
					// SSE sends full accumulated content each time
					streamingMessage.content = responseText;
				} else {
					// WebSocket sends incremental tokens
					streamingMessage.content += token;
				}
			}
		} else if (status === 'done') {
			isStreaming = false;
			const streamingMsg = chatSession.messages.find((m) => m.streaming);
			if (streamingMsg) {
				streamingMsg.streaming = false;
				streamingMsg.content = responseText || streamingMsg.content;
				if (confidence !== undefined) {
					streamingMsg.confidence = confidence;
				}
			}
		} else if (status === 'error') {
			isStreaming = false;
			const streamingMsg = chatSession.messages.find((m) => m.streaming);
			if (streamingMsg) {
				streamingMsg.streaming = false;
				streamingMsg.content = responseText || 'An error occurred.';
			}
		} else if (status === 'thinking') {
			isStreaming = true;
		} else {
			// Generic non-streaming response (WebSocket)
			isStreaming = false;
			const streamingIndex = chatSession.messages.findIndex((m) => m.streaming);
			if (streamingIndex !== -1) {
				chatSession.messages[streamingIndex].streaming = false;
			}
			if (responseText) {
				chatSession.messages.push({
					id: `msg_${Date.now()}`,
					role: 'assistant',
					content: responseText,
					timestamp: new Date()
				});
			}
		}
	}

	function handleSubmit(e?: Event) {
		e?.preventDefault();
		const message = currentMessage.trim();
		if (!message || !isConnected) return;

		chatSession.messages.push({
			id: `msg_${Date.now()}`,
			role: 'user',
			content: message,
			timestamp: new Date()
		});
		currentMessage = '';

		if (transport === 'websocket') {
			sendViaWebSocket(message);
		} else if (transport === 'sse') {
			sendViaSSE(message);
		}
	}

	function sendViaWebSocket(message: string) {
		const sock = chatSocket;
		if (!sock) {
			fallbackToSSE();
			sendViaSSE(message);
			return;
		}

		try {
			sock.send(
				JSON.stringify({
					message,
					user_id: userID,
					session_id: chatSession.id,
					case_id: caseID,
					context: chatSession.context,
					stream: true
				})
			);
		} catch (err) {
			console.error('WebSocket send failed, falling back to SSE:', err);
			fallbackToSSE();
			sendViaSSE(message);
		}
	}

	async function sendViaSSE(message: string) {
		sseAbortController?.abort();
		const controller = new AbortController();
		sseAbortController = controller;

		isStreaming = true;

		try {
			const res = await fetch('/api/sse/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message,
					model: 'gemma4-legal:latest',
					conversationId
				}),
				signal: controller.signal
			});

			if (!res.ok || !res.body) {
				throw new Error(`SSE error: ${res.status}`);
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						try {
							const data = JSON.parse(line.slice(6));
							handleChatResponse(data);
						} catch {
							// Skip malformed SSE data lines
						}
					}
				}
			}

			// Process remaining buffer
			if (buffer.startsWith('data: ')) {
				try {
					const data = JSON.parse(buffer.slice(6));
					handleChatResponse(data);
				} catch {
					// Skip
				}
			}
		} catch (err) {
			if ((err as Error).name === 'AbortError') return;
			console.error('SSE chat error:', err);
			addSystemMessage('Failed to send message via SSE.');
			isStreaming = false;
		}

		sseAbortController = null;
	}

	function formatTimestamp(date: Date): string {
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function togglePanel() {
		isOpen = !isOpen;
	}

	function getConfidenceLabel(confidence: number): string {
		if (confidence >= 0.85) return 'High';
		if (confidence >= 0.70) return 'Medium';
		if (confidence >= 0.50) return 'Low';
		return 'Marginal';
	}
</script>

<!-- Floating trigger button -->
{#if !isOpen}
	<button class="trigger-btn" onclick={togglePanel} aria-label="Open YoRHa AI Assistant">
		<span class="i-lucide-bot w-6 h-6 inline-block"></span>
	</button>
{/if}

<!-- Slide-out panel -->
{#if isOpen}
	<div class="backdrop" onclick={togglePanel} role="presentation"></div>

	<div class="panel" role="dialog" aria-label="YoRHa AI Assistant">
		<!-- Header -->
		<div class="panel-header">
			<div class="header-title">
				<span class="i-lucide-bot w-5 h-5 inline-block"></span>
				<span>YoRHa AI Assistant</span>
			</div>
			<div class="header-status">
				{#if isConnecting}
					<span class="status connecting"><span class="i-lucide-loader-2 w-3.5 h-3.5 inline-block"></span> Connecting...</span>
				{:else if transport === 'websocket'}
					<span class="status connected"><span class="i-lucide-wifi w-3.5 h-3.5 inline-block"></span> WebSocket</span>
				{:else if transport === 'sse'}
					<span class="status sse"><span class="i-lucide-radio w-3.5 h-3.5 inline-block"></span> SSE</span>
				{:else}
					<span class="status disconnected"><span class="i-lucide-wifi-off w-3.5 h-3.5 inline-block"></span> Offline</span>
				{/if}
				<button class="close-btn" onclick={togglePanel} aria-label="Close">
					<span class="i-lucide-x w-4.5 h-4.5 inline-block"></span>
				</button>
			</div>
		</div>

		<!-- Messages -->
		<div class="messages-area" bind:this={chatContainer}>
			{#each chatSession.messages as message (message.id)}
				{#if message.role === 'system'}
					<div class="system-msg">{message.content}</div>
				{:else}
					<div class="msg-row" class:user={message.role === 'user'}>
						{#if message.role === 'assistant'}
							<div class="avatar">
								<span class="i-lucide-bot w-4 h-4 inline-block"></span>
							</div>
						{/if}
						<div
							class="bubble"
							class:user-bubble={message.role === 'user'}
							class:assistant-bubble={message.role === 'assistant'}
						>
							<p class="bubble-text">{message.content}</p>
							<div class="bubble-footer">
								{#if message.confidence !== undefined}
									<span
										class="confidence-badge"
										class:high={message.confidence >= 0.85}
										class:medium={message.confidence >= 0.70 && message.confidence < 0.85}
										class:low={message.confidence >= 0.50 && message.confidence < 0.70}
										class:marginal={message.confidence < 0.50}
									>
										{getConfidenceLabel(message.confidence)} ({Math.round(message.confidence * 100)}%)
									</span>
								{/if}
								<span class="bubble-time">{formatTimestamp(message.timestamp)}</span>
							</div>
						</div>
					</div>
				{/if}
			{/each}

			{#if isStreaming && !chatSession.messages.some((m) => m.streaming)}
				<div class="msg-row">
					<div class="avatar">
						<span class="i-lucide-bot w-4 h-4 inline-block"></span>
					</div>
					<div class="bubble assistant-bubble">
						<span class="typing-indicator"><span class="i-lucide-loader-2 w-4 h-4 inline-block"></span></span>
					</div>
				</div>
			{/if}
		</div>

		<!-- Input -->
		<div class="input-area">
			<form onsubmit={handleSubmit} class="input-form">
				<input
					type="text"
					class="chat-input"
					bind:value={currentMessage}
					placeholder="Ask a legal question..."
					disabled={!isConnected || isConnecting}
				/>
				<Button
					type="submit"
					class="send-btn"
					disabled={!isConnected || isConnecting || !currentMessage.trim()}
				>
					<span class="i-lucide-send w-4 h-4 inline-block"></span>
				</Button>
			</form>
		</div>
	</div>
{/if}

<style>
	.trigger-btn {
		position: fixed;
		bottom: 1rem;
		right: 1rem;
		z-index: 50;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 9999px;
		border: 2px solid rgba(194, 178, 128, 0.4);
		background: var(--color-panel, #1a1a2e);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		transition: all 0.2s;
	}
	.trigger-btn:hover {
		border-color: rgba(194, 178, 128, 0.8);
		transform: scale(1.05);
	}

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: rgba(0, 0, 0, 0.3);
	}

	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 50;
		width: 440px;
		max-width: 100vw;
		display: flex;
		flex-direction: column;
		background: var(--color-panel, #1a1a2e);
		border-left: 1px solid rgba(194, 178, 128, 0.2);
		box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
		animation: slide-in 0.2s ease-out;
	}

	@keyframes slide-in {
		from { transform: translateX(100%); }
		to { transform: translateX(0); }
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid rgba(194, 178, 128, 0.2);
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		color: white;
	}

	.header-status {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.status {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
	}
	.status.connecting { color: rgba(194, 178, 128, 0.6); }
	.status.connected { color: #48bb78; }
	.status.sse { color: #63b3ed; }
	.status.disconnected { color: #f56565; }

	.close-btn {
		background: none;
		border: none;
		color: rgba(194, 178, 128, 0.6);
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 0.25rem;
	}
	.close-btn:hover {
		color: white;
		background: rgba(194, 178, 128, 0.1);
	}

	.messages-area {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.system-msg {
		text-align: center;
		font-size: 0.75rem;
		color: rgba(194, 178, 128, 0.5);
		padding: 0.25rem 0;
	}

	.msg-row {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}
	.msg-row.user {
		justify-content: flex-end;
	}

	.avatar {
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: rgba(99, 179, 237, 0.2);
		color: #63b3ed;
	}

	.bubble {
		max-width: 75%;
		border-radius: 0.5rem;
		padding: 0.75rem;
		font-size: 0.875rem;
	}
	.user-bubble {
		background: rgba(99, 179, 237, 0.2);
		color: white;
	}
	.assistant-bubble {
		background: rgba(194, 178, 128, 0.1);
		color: rgba(194, 178, 128, 0.9);
	}

	.bubble-text {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.bubble-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}

	.bubble-time {
		font-size: 0.625rem;
		color: rgba(194, 178, 128, 0.4);
	}

	.confidence-badge {
		font-size: 0.625rem;
		padding: 0.125rem 0.375rem;
		border-radius: 9999px;
		font-weight: 500;
	}
	.confidence-badge.high {
		background: rgba(72, 187, 120, 0.15);
		color: #48bb78;
	}
	.confidence-badge.medium {
		background: rgba(99, 179, 237, 0.15);
		color: #63b3ed;
	}
	.confidence-badge.low {
		background: rgba(236, 201, 75, 0.15);
		color: #ecc94b;
	}
	.confidence-badge.marginal {
		background: rgba(245, 101, 101, 0.15);
		color: #f56565;
	}

	.typing-indicator {
		display: flex;
		align-items: center;
		color: rgba(194, 178, 128, 0.5);
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.input-area {
		padding: 1rem;
		border-top: 1px solid rgba(194, 178, 128, 0.2);
	}

	.input-form {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.chat-input {
		flex: 1;
		padding: 0.625rem 0.75rem;
		background: rgba(194, 178, 128, 0.05);
		border: 1px solid rgba(194, 178, 128, 0.2);
		border-radius: 0.375rem;
		color: white;
		font-size: 0.875rem;
		outline: none;
	}
	.chat-input::placeholder {
		color: rgba(194, 178, 128, 0.4);
	}
	.chat-input:focus {
		border-color: rgba(194, 178, 128, 0.5);
	}
	.chat-input:disabled {
		opacity: 0.5;
	}
</style>
