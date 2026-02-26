<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface ChatMessage {
		id: string;
		role: 'user' | 'assistant' | 'system';
		content: string;
		timestamp: number;
		streaming?: boolean;
		evidenceIds?: string[];
		suggestions?: { title: string; action: string }[];
		insights?: { title: string; description: string; confidence: number }[];
	}

	interface GPUStatus {
		available: boolean;
		utilization: number;
		model: string;
		backend: 'ollama' | 'tensorrt' | 'onnx' | 'none';
	}

	interface Props {
		caseId?: string;
		evidenceIds?: string[];
		onSuggestionClick?: (action: string) => void;
	}

	let { caseId = '', evidenceIds = [], onSuggestionClick }: Props = $props();

	let messages = $state<ChatMessage[]>([]);
	let input = $state('');
	let isStreaming = $state(false);
	let gpuStatus = $state<GPUStatus>({ available: false, utilization: 0, model: 'none', backend: 'none' });
	let chatContainer: HTMLDivElement | undefined = $state();

	const quickActions = [
		{ label: 'Analyze Evidence', icon: 'search', action: 'Analyze the selected evidence items and identify key findings, patterns, and connections.' },
		{ label: 'Next Steps', icon: 'list-checks', action: 'Based on the current evidence, what are the recommended next investigation steps?' },
		{ label: 'Find Gaps', icon: 'alert-triangle', action: 'What gaps or missing information exist in the current evidence collection?' },
		{ label: 'Timeline', icon: 'clock', action: 'Construct a chronological timeline of events from the available evidence.' },
	];

	$effect(() => {
		checkGPUStatus();
		const interval = setInterval(checkGPUStatus, 30000);
		addSystemMessage('Detective Mode active. GPU-accelerated evidence analysis ready. Select evidence and ask questions.');
		return () => clearInterval(interval);
	});

	async function checkGPUStatus() {
		try {
			const res = await fetch('/api/health/capabilities', { signal: AbortSignal.timeout(3000) });
			if (res.ok) {
				const data = await res.json();
				gpuStatus = {
					available: data.ollama || data.tensorrt || false,
					utilization: 0,
					model: data.models?.[0] ?? 'gemma3-legal:latest',
					backend: data.tensorrt ? 'tensorrt' : data.ollama ? 'ollama' : 'none',
				};
			}
		} catch {
			gpuStatus = { available: false, utilization: 0, model: 'none', backend: 'none' };
		}
	}

	function addSystemMessage(content: string) {
		messages = [...messages, {
			id: crypto.randomUUID(),
			role: 'system',
			content,
			timestamp: Date.now(),
		}];
	}

	async function sendMessage(text?: string) {
		const msg = (text ?? input).trim();
		if (!msg || isStreaming) return;
		input = '';

		// Add user message
		messages = [...messages, {
			id: crypto.randomUUID(),
			role: 'user',
			content: msg,
			timestamp: Date.now(),
			evidenceIds: evidenceIds.length > 0 ? [...evidenceIds] : undefined,
		}];

		// Create assistant placeholder
		const assistantId = crypto.randomUUID();
		messages = [...messages, {
			id: assistantId,
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			streaming: true,
		}];

		isStreaming = true;
		scrollToBottom();

		try {
			// Build context with evidence IDs
			const contextParts = [msg];
			if (caseId) contextParts.push(`[Case: ${caseId}]`);
			if (evidenceIds.length > 0) contextParts.push(`[Evidence: ${evidenceIds.join(', ')}]`);

			const query = contextParts.join(' ');

			// SSE streaming via /api/sse/chat
			const url = `/api/sse/chat?query=${encodeURIComponent(query)}&caseId=${encodeURIComponent(caseId)}`;
			const eventSource = new EventSource(url);
			let fullText = '';

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					if (data.token) {
						fullText += data.token;
						updateMessage(assistantId, fullText, true);
					}
					if (data.done) {
						updateMessage(assistantId, fullText, false);
						eventSource.close();
						isStreaming = false;
					}
				} catch {
					// Non-JSON text token
					fullText += event.data;
					updateMessage(assistantId, fullText, true);
				}
			};

			eventSource.onerror = () => {
				eventSource.close();
				if (!fullText) {
					// Fallback to non-streaming
					fallbackChat(assistantId, query);
				} else {
					updateMessage(assistantId, fullText, false);
					isStreaming = false;
				}
			};
		} catch (err) {
			updateMessage(assistantId, `Error: ${err instanceof Error ? err.message : 'Unknown error'}`, false);
			isStreaming = false;
		}
	}

	async function fallbackChat(messageId: string, query: string) {
		try {
			const res = await fetch('/api/ai/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: query, model: 'gemma3-legal:latest' }),
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const data = await res.json();
			updateMessage(messageId, data.response ?? data.message ?? 'No response', false);
		} catch (err) {
			updateMessage(messageId, `Fallback failed: ${err instanceof Error ? err.message : 'Unknown'}`, false);
		}
		isStreaming = false;
	}

	function updateMessage(id: string, content: string, streaming: boolean) {
		messages = messages.map((m) => m.id === id ? { ...m, content, streaming } : m);
		scrollToBottom();
	}

	function scrollToBottom() {
		setTimeout(() => {
			if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
		}, 50);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function getStatusColor(): string {
		if (!gpuStatus.available) return 'text-danger';
		return 'text-green-500';
	}
</script>

<div class="flex flex-col h-full border border-sand-dark rounded-lg overflow-hidden">
	<!-- Header -->
	<div class="flex items-center justify-between px-3 py-2 border-b border-sand-dark bg-panel-soft">
		<div class="flex items-center gap-2">
			<Icon name="shield" size={18} />
			<span class="text-sm font-semibold">Detective Mode</span>
		</div>
		<div class="flex items-center gap-2 text-[11px]">
			<span class={getStatusColor()}>
				<Icon name="cpu" size={12} />
				{gpuStatus.backend === 'none' ? 'Offline' : gpuStatus.backend.toUpperCase()}
			</span>
			{#if gpuStatus.available}
				<span class="opacity-50">{gpuStatus.model}</span>
			{/if}
			{#if evidenceIds.length > 0}
				<span class="px-1.5 py-0.5 rounded bg-accent/20 text-accent">
					{evidenceIds.length} evidence
				</span>
			{/if}
		</div>
	</div>

	<!-- Messages -->
	<div bind:this={chatContainer} class="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[400px]">
		{#each messages as msg (msg.id)}
			<div class="flex gap-2" class:flex-row-reverse={msg.role === 'user'}>
				{#if msg.role !== 'user'}
					<div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 {msg.role === 'assistant' ? 'bg-accent-soft' : 'bg-panel-soft'}">
						<Icon name={msg.role === 'assistant' ? 'bot' : 'info'} size={14} />
					</div>
				{/if}

				<div class="max-w-[80%] rounded-lg px-3 py-2 text-sm {msg.role === 'user' ? 'bg-accent-soft' : msg.role === 'system' ? 'bg-panel-soft opacity-60 text-xs' : 'bg-panel'}">
					<p class="m-0 whitespace-pre-wrap">{msg.content}{#if msg.streaming}<span class="inline-block w-1.5 h-3.5 bg-accent ml-0.5 animate-pulse"></span>{/if}</p>

					{#if msg.evidenceIds?.length}
						<div class="flex flex-wrap gap-1 mt-1.5">
							{#each msg.evidenceIds as eid}
								<span class="px-1.5 py-0.5 text-[10px] rounded bg-info/15 text-info">{eid}</span>
							{/each}
						</div>
					{/if}

					{#if msg.suggestions?.length}
						<div class="mt-2 space-y-1">
							{#each msg.suggestions as s}
								<button
									onclick={() => { onSuggestionClick?.(s.action); sendMessage(s.action); }}
									class="block w-full text-left px-2 py-1.5 text-xs border border-accent/20 rounded bg-transparent hover:bg-accent/10 cursor-pointer transition-colors"
								>
									<Icon name="lightbulb" size={10} /> {s.title}
								</button>
							{/each}
						</div>
					{/if}

					{#if msg.insights?.length}
						<div class="mt-2 space-y-1">
							{#each msg.insights as insight}
								<div class="px-2 py-1.5 text-xs border border-sand-dark rounded">
									<div class="flex items-center gap-1">
										<Icon name="trending-up" size={10} />
										<span class="font-medium">{insight.title}</span>
										<span class="opacity-50">({Math.round(insight.confidence * 100)}%)</span>
									</div>
									<p class="m-0 mt-0.5 opacity-70">{insight.description}</p>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				{#if msg.role === 'user'}
					<div class="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center shrink-0 text-xs font-bold">
						U
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Quick Actions -->
	<div class="px-3 py-1.5 border-t border-sand-dark flex flex-wrap gap-1.5">
		{#each quickActions as qa}
			<button
				onclick={() => sendMessage(qa.action)}
				disabled={isStreaming}
				class="flex items-center gap-1 px-2 py-1 text-[11px] border border-sand-dark rounded bg-transparent hover:border-accent cursor-pointer transition-colors disabled:opacity-40"
			>
				<Icon name={qa.icon} size={11} />
				{qa.label}
			</button>
		{/each}
	</div>

	<!-- Input -->
	<div class="flex items-center gap-2 px-3 py-2 border-t border-sand-dark">
		<input
			type="text"
			bind:value={input}
			onkeydown={handleKeydown}
			disabled={isStreaming}
			placeholder="Ask about evidence, connections, or investigation steps..."
			class="flex-1 p-2 text-sm border border-sand-dark rounded-lg bg-panel-soft focus:border-accent focus:outline-none disabled:opacity-50"
		/>
		<Button onclick={() => sendMessage()} disabled={!input.trim() || isStreaming} size="sm" class="bits-btn">
			{#if isStreaming}
				<Icon name="loader-2" size={16} />
			{:else}
				<Icon name="send" size={16} />
			{/if}
		</Button>
	</div>
</div>
