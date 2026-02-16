<script lang="ts">
	import { ChatSession } from '$lib/models/ChatSession.svelte.js';
	import { onDestroy } from 'svelte';

	interface Props {
		caseId?: string;
	}

	let { caseId }: Props = $props();

	function createSession(id?: string) {
		return new ChatSession(id ? `case-${id}` : `chat-${Date.now()}`, [
			{
				role: 'system',
				content:
					'This assistant cannot determine guilt or innocence. Verify all outputs against official sources (.gov, DA/AG).',
				timestamp: new Date().toISOString()
			},
			{
				role: 'assistant',
				content:
					'Hello. I am your Legal AI Assistant. How can I help you with this case?',
				timestamp: new Date().toISOString()
			}
		]);
	}

	// Create a ChatSession keyed by caseId (or a generic session)
	// eslint-disable-next-line -- intentionally captures initial caseId for session init
	let session = $state<ChatSession>(createSession(caseId));

	// Recreate session if caseId changes
	$effect(() => {
		if (caseId) {
			const newId = `case-${caseId}`;
			if (session.chatId !== newId) {
				session.destroy();
				session = new ChatSession(newId, [
					{
						role: 'system',
						content:
							'This assistant cannot determine guilt or innocence. Verify all outputs against official sources (.gov, DA/AG).',
						timestamp: new Date().toISOString()
					},
					{
						role: 'assistant',
						content:
							'Hello. I am your Legal AI Assistant. How can I help you with this case?',
						timestamp: new Date().toISOString()
					}
				]);
			}
		}
	});

	onDestroy(() => {
		session.destroy();
	});

	let inputValue = $state('');
	let messagesContainer: HTMLElement;

	let isLoading = $derived(
		session.status === 'thinking' || session.status === 'streaming'
	);

	function scrollToBottom() {
		if (messagesContainer) {
			setTimeout(() => {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}, 0);
		}
	}

	// Auto-scroll when messages change
	$effect(() => {
		if (session.messages.length > 0) {
			scrollToBottom();
		}
	});

	async function sendMessage() {
		if (!inputValue.trim() || isLoading) return;

		const content = inputValue;
		inputValue = '';

		await session.sendMessage(content);
		scrollToBottom();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function formatTime(timestamp?: string): string {
		if (!timestamp) return '';
		return new Date(timestamp).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function displayRole(role: string): string {
		if (role === 'user') return 'Prosecutor';
		if (role === 'assistant') return 'AI Legal Assistant';
		return 'System';
	}

	function clearChat() {
		session.destroy();
		session = new ChatSession(
			caseId ? `case-${caseId}` : `chat-${Date.now()}`,
			[
				{
					role: 'system',
					content:
						'This assistant cannot determine guilt or innocence. Verify all outputs against official sources (.gov, DA/AG).',
					timestamp: new Date().toISOString()
				},
				{
					role: 'assistant',
					content:
						'Hello. I am your Legal AI Assistant. How can I help you with this case?',
					timestamp: new Date().toISOString()
				}
			]
		);
	}
</script>

<div class="case-chat-panel">
	<!-- Header -->
	<div class="chat-header">
		<h3 class="chat-title">Case Analysis Chat</h3>
		<div class="header-actions">
			<button class="header-btn" title="Clear chat" onclick={clearChat}>
				🗑️
			</button>
			{#if session.error}
				<span class="error-badge" title={session.error}>⚠️</span>
			{/if}
		</div>
	</div>

	<!-- Disclaimer -->
	<div class="disclaimer-banner">
		<span class="disclaimer-icon">⚠️</span>
		<span class="disclaimer-text">
			This assistant cannot determine guilt or innocence. Verify all outputs
			against official sources (.gov, DA/AG).
		</span>
	</div>

	<!-- Messages -->
	<div class="messages-container" bind:this={messagesContainer}>
		{#each session.messages as message, i (i)}
			<div
				class="message"
				class:system={message.role === 'system'}
				class:prosecutor={message.role === 'user'}
				class:ai={message.role === 'assistant'}
			>
				<div class="message-header">
					<span class="message-role">
						{#if message.role === 'user'}
							👨‍⚖️ {displayRole(message.role)}
						{:else if message.role === 'assistant'}
							🤖 {displayRole(message.role)}
						{:else}
							⚙️ {displayRole(message.role)}
						{/if}
					</span>
					<span class="message-time">{formatTime(message.timestamp)}</span>
				</div>
				<div class="message-content">
					{message.content}
					{#if message.metadata?.citations && message.metadata.citations.length > 0}
						<div class="context-badge">
							📚 {message.metadata.citations.length} source{message.metadata
								.citations.length === 1
								? ''
								: 's'} referenced
						</div>
					{/if}
					{#if message.metadata?.confidence !== undefined}
						<div class="confidence-badge">
							Confidence: {(message.metadata.confidence * 100).toFixed(0)}%
						</div>
					{/if}
				</div>
			</div>
		{/each}

		{#if isLoading}
			<div class="message loading ai">
				<div class="message-header">
					<span class="message-role">🤖 AI Legal Assistant</span>
				</div>
				<div class="message-content">
					{#if session.status === 'streaming'}
						<span class="streaming-text">Generating response...</span>
					{:else}
						<div class="typing-indicator">
							<span></span>
							<span></span>
							<span></span>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Input -->
	<div class="chat-input-area">
		<textarea
			bind:value={inputValue}
			onkeydown={handleKeydown}
			placeholder="Ask a legal question about this case..."
			class="chat-input"
			disabled={isLoading}
		></textarea>
		<button
			class="send-btn"
			onclick={sendMessage}
			disabled={isLoading || !inputValue.trim()}
		>
			{#if isLoading}
				⏳
			{:else}
				📤
			{/if}
		</button>
	</div>
</div>

<style>
	.case-chat-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background-color: white;
		border: 2px solid #d4a574;
		border-radius: 6px;
		overflow: hidden;
	}

	.chat-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background-color: #f5f1e8;
		border-bottom: 2px solid #d4a574;
	}

	.chat-title {
		font-family: 'Crimson Text', Georgia, serif;
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0;
		color: #2c2c2c;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.header-btn {
		background: none;
		border: none;
		font-size: 1.1rem;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.header-btn:hover {
		background-color: #e0d5c7;
	}

	.error-badge {
		font-size: 1rem;
	}

	.disclaimer-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background-color: #fff3cd;
		border-bottom: 1px solid #ffc107;
		font-size: 0.85rem;
		color: #856404;
	}

	.disclaimer-icon {
		font-size: 1rem;
		flex-shrink: 0;
	}

	.disclaimer-text {
		line-height: 1.4;
	}

	.messages-container {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.message {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		animation: slideIn 0.3s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.message.system {
		background-color: #f0ebe0;
		padding: 0.75rem;
		border-radius: 4px;
		border-left: 3px solid #ffc107;
	}

	.message-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.8rem;
	}

	.message-role {
		font-weight: 600;
		color: #2c2c2c;
	}

	.message-time {
		color: #999;
		font-size: 0.75rem;
	}

	.message-content {
		font-size: 0.95rem;
		line-height: 1.5;
		color: #333;
		padding: 0.75rem;
		background-color: #f9f7f4;
		border-radius: 4px;
		border-left: 3px solid #d4a574;
		white-space: pre-wrap;
	}

	.message.prosecutor .message-content {
		background-color: #e8f4f8;
		border-left-color: #0066cc;
	}

	.message.ai .message-content {
		background-color: #f0ebe0;
		border-left-color: #8b4513;
	}

	.context-badge {
		margin-top: 0.5rem;
		font-size: 0.8rem;
		color: #6b7280;
		padding: 0.25rem 0.5rem;
		background: rgba(139, 69, 19, 0.08);
		border-radius: 3px;
		display: inline-block;
	}

	.confidence-badge {
		margin-top: 0.25rem;
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.streaming-text {
		color: #8b4513;
		font-style: italic;
	}

	.typing-indicator {
		display: flex;
		gap: 0.25rem;
		align-items: center;
	}

	.typing-indicator span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: #8b4513;
		animation: typing 1.4s infinite;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing {
		0%,
		60%,
		100% {
			opacity: 0.5;
			transform: translateY(0);
		}
		30% {
			opacity: 1;
			transform: translateY(-8px);
		}
	}

	.chat-input-area {
		display: flex;
		gap: 0.75rem;
		padding: 1rem;
		background-color: #f5f1e8;
		border-top: 2px solid #d4a574;
	}

	.chat-input {
		flex: 1;
		padding: 0.75rem;
		border: 1px solid #d4a574;
		border-radius: 4px;
		font-family: 'Source Sans 3', sans-serif;
		font-size: 0.9rem;
		color: #2c2c2c;
		resize: none;
		max-height: 100px;
	}

	.chat-input:focus {
		outline: none;
		border-color: #8b4513;
		box-shadow: 0 0 0 3px rgba(139, 69, 19, 0.1);
	}

	.chat-input:disabled {
		background-color: #e0d5c7;
		color: #999;
	}

	.send-btn {
		padding: 0.75rem 1rem;
		background-color: #8b4513;
		color: #f5f1e8;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.send-btn:hover:not(:disabled) {
		background-color: #a0522d;
	}

	.send-btn:disabled {
		background-color: #d4a574;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.chat-input-area {
			flex-direction: column;
		}

		.send-btn {
			width: 100%;
		}
	}
</style>
