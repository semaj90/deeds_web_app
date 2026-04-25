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

<div class="p-3 border border-sand-dark rounded-lg bg-panel-soft flex flex-col gap-2 {className}">
	<div class="flex items-center gap-2">
		<Icon name="radio" size={16} />
		<h3 class="flex-1 text-sm font-semibold m-0">Realtime SSE Communication</h3>
		<span
			class="w-2 h-2 rounded-full transition-colors"
			style:background={connected ? 'rgb(34, 197, 94)' : 'rgba(255, 255, 255, 0.2)'}
			style:box-shadow={connected ? '0 0 6px rgba(34, 197, 94, 0.4)' : 'none'}
		></span>
	</div>

	<div class="flex items-center gap-2">
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
		<span class="ml-auto text-xs opacity-50">{messages.length} messages</span>
	</div>

	{#if error}
		<p class="text-[13px] text-danger m-0">{error}</p>
	{/if}

	<div class="h-60 overflow-y-auto p-2 rounded-md bg-black/20 font-mono text-xs flex flex-col gap-1" bind:this={messageContainer}>
		{#each messages as msg (msg.id)}
			<div class="flex items-baseline gap-2">
				<span
					class="font-semibold min-w-14"
					class:text-info={msg.type !== 'system' && msg.type !== 'error'}
					class:text-warning={msg.type === 'system'}
					class:text-danger={msg.type === 'error'}
				>{msg.type}</span>
				<span class="flex-1 break-words">{msg.content}</span>
				<span class="opacity-40 whitespace-nowrap">
					{new Date(msg.timestamp).toLocaleTimeString()}
				</span>
			</div>
		{/each}
		{#if messages.length === 0}
			<p class="text-[13px] opacity-40 my-auto text-center">Click Connect to start receiving events</p>
		{/if}
	</div>
</div>
