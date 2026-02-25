<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface SSEMessage {
		id: string;
		type: string;
		content: string;
		timestamp: number;
	}

	interface Props {
		endpoint?: string;
		class?: string;
	}

	let {
		endpoint = '/api/sse/chat',
		class: className = ''
	}: Props = $props();

	let messages = $state<SSEMessage[]>([]);
	let connected = $state(false);
	let connecting = $state(false);
	let error = $state<string | null>(null);
	let eventSource = $state<EventSource | null>(null);
	let messageContainer: HTMLElement | undefined = $state();

	function connect() {
		if (eventSource) disconnect();
		connecting = true;
		error = null;

		try {
			const source = new EventSource(endpoint);
			eventSource = source;

			source.onopen = () => {
				connected = true;
				connecting = false;
				addMessage('system', 'Connected to SSE stream');
			};

			source.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					addMessage(data.type ?? 'data', data.content ?? event.data);
				} catch {
					addMessage('data', event.data);
				}
			};

			source.onerror = () => {
				if (source.readyState === EventSource.CLOSED) {
					connected = false;
					connecting = false;
					error = 'Connection closed';
					addMessage('system', 'Connection closed');
				}
			};
		} catch (e) {
			connecting = false;
			error = e instanceof Error ? e.message : 'Connection failed';
		}
	}

	function disconnect() {
		eventSource?.close();
		eventSource = null;
		connected = false;
		connecting = false;
		addMessage('system', 'Disconnected');
	}

	function addMessage(type: string, content: string) {
		messages = [...messages, {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			type,
			content,
			timestamp: Date.now()
		}];

		// Auto-scroll
		setTimeout(() => {
			if (messageContainer) {
				messageContainer.scrollTop = messageContainer.scrollHeight;
			}
		}, 50);
	}

	function clearMessages() {
		messages = [];
	}
</script>

<div class="sse-demo {className}">
	<div class="demo-header">
		<Icon name="radio" size={16} />
		<h3>Realtime SSE Communication</h3>
		<div class="status-indicator" class:active={connected}></div>
	</div>

	<div class="demo-controls">
		{#if connected}
			<Button variant="destructive" size="sm" onclick={disconnect}>
				Disconnect
			</Button>
		{:else}
			<Button size="sm" onclick={connect} disabled={connecting}>
				{connecting ? 'Connecting...' : 'Connect'}
			</Button>
		{/if}
		<Button variant="ghost" size="sm" onclick={clearMessages}>
			Clear
		</Button>
		<span class="message-count">{messages.length} messages</span>
	</div>

	{#if error}
		<p class="demo-error">{error}</p>
	{/if}

	<div class="message-stream" bind:this={messageContainer}>
		{#each messages as msg (msg.id)}
			<div class="stream-msg" data-type={msg.type}>
				<span class="msg-type">{msg.type}</span>
				<span class="msg-content">{msg.content}</span>
				<span class="msg-time">
					{new Date(msg.timestamp).toLocaleTimeString()}
				</span>
			</div>
		{/each}
		{#if messages.length === 0}
			<p class="stream-empty">Click Connect to start receiving events</p>
		{/if}
	</div>
</div>

<style>
	.sse-demo {
		padding: 0.75rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		background: var(--color-panel-soft, #1c1917);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.demo-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.demo-header h3 {
		flex: 1;
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0;
	}
	.status-indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
		transition: background 0.2s;
	}
	.status-indicator.active {
		background: var(--color-accent, #22c55e);
		box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
	}
	.demo-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.message-count {
		margin-left: auto;
		font-size: 0.75rem;
		opacity: 0.5;
	}
	.demo-error {
		font-size: 0.8125rem;
		color: var(--color-danger, #ef4444);
		margin: 0;
	}
	.message-stream {
		height: 240px;
		overflow-y: auto;
		padding: 0.5rem;
		border-radius: 0.375rem;
		background: rgba(0, 0, 0, 0.2);
		font-family: monospace;
		font-size: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.stream-msg {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.msg-type {
		font-weight: 600;
		min-width: 3.5rem;
		color: var(--color-info, #3b82f6);
	}
	[data-type='system'] .msg-type {
		color: var(--color-warning, #eab308);
	}
	[data-type='error'] .msg-type {
		color: var(--color-danger, #ef4444);
	}
	.msg-content {
		flex: 1;
		word-break: break-word;
	}
	.msg-time {
		opacity: 0.4;
		white-space: nowrap;
	}
	.stream-empty {
		font-size: 0.8125rem;
		opacity: 0.4;
		margin: auto 0;
		text-align: center;
	}
</style>
