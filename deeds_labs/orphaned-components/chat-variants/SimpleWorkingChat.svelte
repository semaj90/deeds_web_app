<script lang="ts">
	import { ChatSession, type ChatMessage } from '$lib/models/ChatSession.svelte.js';
	import TypewriterResponse from '$lib/components/ai/TypewriterResponse.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { ScrollArea } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { tick } from 'svelte';

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
	let viewport: HTMLElement | undefined = $state(undefined);
	let lastCompletedIdx = $state<number | null>(null);

	// Create session on mount
	$effect(() => {
		const s = new ChatSession(chatId, [], hasCaseContext);
		s.loadHistory();
		session = s;
		return () => { s.destroy(); };
	});

	// Auto-scroll
	$effect(() => {
		const len = session?.messages?.length;
		if (len && len > 0) {
			tick().then(() => {
				if (viewport) viewport.scrollTop = viewport.scrollHeight;
			});
		}
	});

	// Track streaming completion for typewriter
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
</script>

<div class="chat-panel {className}" style="height: {height};">
	<!-- Messages -->
	<ScrollArea.Root class="chat-messages-root">
		<ScrollArea.Viewport class="chat-messages-viewport" bind:ref={viewport}>
			{#if !session || session.messages.length === 0}
				<div class="chat-empty">
					<Icon name="message-circle" size={32} />
					<p>Start a conversation</p>
				</div>
			{:else}
				<div class="messages-list">
					{#each session.messages as msg, idx (idx)}
						<div class="msg {msg.role}">
							<div class="msg-avatar {msg.role}">
								<Icon name={msg.role === 'user' ? 'user' : 'bot'} size={14} />
							</div>
							<div class="msg-content">
								<div class="msg-header">
									<span class="msg-role">{msg.role === 'user' ? 'You' : 'AI'}</span>
									<span class="msg-time">{formatTime(msg.timestamp)}</span>
									{#if msg.source}
										<span class="msg-source">{msg.source === 'local-onnx' ? 'Local' : 'Server'}</span>
									{/if}
								</div>
								<div class="msg-text">
									{#if msg.role === 'assistant' && idx === lastCompletedIdx}
										<TypewriterResponse
											text={msg.content}
											speed={40}
											enableThinking={true}
											oncomplete={() => lastCompletedIdx = null}
										/>
									{:else}
										{msg.content}
									{/if}
								</div>
								{#if msg.role === 'assistant' && msg.metadata?.confidence}
									<div class="msg-meta">
										<span>Confidence: {Math.round((msg.metadata.confidence ?? 0) * 100)}%</span>
									</div>
								{/if}
							</div>
						</div>
					{/each}

					{#if session.status === 'thinking'}
						<div class="msg assistant">
							<div class="msg-avatar assistant">
								<Icon name="bot" size={14} />
							</div>
							<div class="msg-content">
								<div class="thinking-dots">
									<Icon name="loader-2" size={14} class="animate-spin" />
									<span>Thinking...</span>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</ScrollArea.Viewport>
		<ScrollArea.Scrollbar orientation="vertical" class="chat-scrollbar">
			<ScrollArea.Thumb class="chat-scrollbar-thumb" />
		</ScrollArea.Scrollbar>
	</ScrollArea.Root>

	<!-- Error -->
	{#if session?.error}
		<div class="chat-error">
			<Icon name="alert-triangle" size={12} />
			{session.error}
		</div>
	{/if}

	<!-- Input -->
	<div class="chat-input-row">
		<textarea
			bind:value={currentMessage}
			onkeydown={handleKeydown}
			placeholder="Type a message..."
			rows={1}
			disabled={!session || session.status === 'thinking'}
			class="chat-input"
		></textarea>
		<Button
			onclick={sendMessage}
			disabled={!session || session.status !== 'idle' || !currentMessage.trim()}
			class="chat-send-btn"
		>
			<Icon name="send" size={16} />
		</Button>
	</div>
</div>

<style>
	.chat-panel {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-sand-20, #44403c);
		border-radius: 8px;
		overflow: hidden;
		background: var(--color-panel, #1c1917);
	}

	:global(.chat-messages-root) {
		flex: 1;
		min-height: 0;
	}

	:global(.chat-messages-viewport) {
		height: 100%;
		padding: 1rem;
	}

	:global(.chat-scrollbar) {
		width: 4px;
		padding: 1px;
	}

	:global(.chat-scrollbar-thumb) {
		background: var(--color-sand-40, #78716c);
		border-radius: 2px;
	}

	.chat-empty {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: var(--color-sand-60, #57534e);
		gap: 0.5rem;
	}

	.chat-empty p {
		margin: 0;
		font-size: 0.9rem;
	}

	.messages-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.msg {
		display: flex;
		gap: 0.5rem;
		max-width: 85%;
	}

	.msg.user {
		margin-left: auto;
		flex-direction: row-reverse;
	}

	.msg-avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.msg-avatar.user {
		background: var(--color-info, #2563eb);
		color: white;
	}

	.msg-avatar.assistant {
		background: var(--color-sand-20, #44403c);
		color: var(--color-sand-80, #d6d3d1);
	}

	.msg-content {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.msg-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
		color: var(--color-sand-60, #78716c);
	}

	.msg-source {
		font-size: 0.6rem;
		padding: 0.05rem 0.3rem;
		background: var(--color-sand-10, #292524);
		border: 1px solid var(--color-sand-20, #44403c);
		border-radius: 3px;
	}

	.msg-text {
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		font-size: 0.85rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		background: var(--color-sand-10, #292524);
		color: var(--color-sand-80, #d6d3d1);
	}

	.msg.user .msg-text {
		background: var(--color-info, #2563eb);
		color: white;
	}

	.msg-meta {
		font-size: 0.65rem;
		color: var(--color-sand-60, #78716c);
	}

	.thinking-dots {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--color-sand-60, #78716c);
		padding: 0.5rem 0.75rem;
		background: var(--color-sand-10, #292524);
		border-radius: 6px;
		border: 1px dashed var(--color-sand-20, #44403c);
	}

	.chat-error {
		padding: 0.4rem 1rem;
		background: rgba(239, 68, 68, 0.1);
		border-top: 1px solid rgba(239, 68, 68, 0.3);
		color: #fca5a5;
		font-size: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.chat-input-row {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem;
		border-top: 1px solid var(--color-sand-20, #44403c);
		background: var(--color-panel, #1c1917);
		flex-shrink: 0;
	}

	.chat-input {
		flex: 1;
		background: var(--color-sand-5, #0c0a09);
		border: 1px solid var(--color-sand-20, #44403c);
		color: var(--color-sand-80, #d6d3d1);
		font-family: inherit;
		font-size: 0.85rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		resize: none;
		min-height: 38px;
		outline: none;
	}

	.chat-input:focus {
		border-color: var(--color-info, #2563eb);
	}

	.chat-input:disabled {
		opacity: 0.5;
	}

	:global(.chat-send-btn) {
		height: 38px !important;
		width: 38px !important;
		flex-shrink: 0;
		background: var(--color-info, #2563eb) !important;
		border-radius: 6px !important;
		display: flex !important;
		align-items: center !important;
		justify-content: center !important;
	}

	:global(.animate-spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
