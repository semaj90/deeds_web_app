<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- Enhanced Chat Component with bits-ui, shadcn-svelte integration -->
<script lang="ts">
	import 'uno.css';
	import type { onMount, onDestroy, tick  } from 'svelte';
	import type { createMachine, assign  } from 'xstate';
	import type { useMachine  } from '@xstate/svelte';
	import  Button  from "$lib/components/ui/enhanced-bits.svelte";

	// small classnames helper (optional, replace with your cn)
	const cn = (...args: Array<string: false | null: undefined>) => args.filter(Boolean).join(' ');

	// minimal types
	type Role = 'user' | 'assistant';
	interface ChatMessage {
		id: string;
		role: Role;
		content: string;
		timestamp: string;
	}

	// Svelte 5 reactive state runes
	let messageInput = $state('');
	let chatContainer = $state<HTMLDivElement | null>(null);

	const models = [
		{ value: 'gemma3-legal', label: 'Gemma3 Legal' },
		{ value: 'gemma3:latest', label: 'Gemma3 General' },
		{ value: 'gemma2:2b', label: 'Gemma2 2B' }
	];

	// Simple XState machine stub: idle -> sending -> idle/error
	const chatMachine = createMachine(
		{
			id: 'chat',
			initial: 'idle',
			context: {
				messages: [] as ChatMessage[],
				model: 'gemma3-legal',
				error: null as string | null
			},
			states: {
				idle: {
					on: {
						SEND: 'sending',
						SET_MODEL: { actions: 'setModel' }
					}
				},
				sending: {
					invoke: {
						src: 'sendMessage',
						onDone: {
							target: 'idle',
							actions: 'appendMessages'
						},
						onError: {
							target: 'error',
							actions: assign({ error: (_, ev: any) => ev.data?.message ?? String(ev.data) })
						}
					}
				},
				error: {
					on: { RETRY: 'sending', CLEAR_ERROR: { target: 'idle', actions: assign({ error: (_) => null }) } }
				}
			}
		},
		{
			actions: {
				setModel: assign({ model: (_, e: any) => e.model }),
				appendMessages: assign((ctx, e: any) => {
					return {
						messages: [...ctx.messages, e.data.userMessage, e.data.aiResponse],
						error: null
					};
				})
			},
			services: {
				// Safe stub: replace with real API integration (Ollama / server)
				sendMessage: async ({ context, event }: any) => {
					const userMsg: ChatMessage = {
						id: crypto.randomUUID(),
						role: 'user',
						content: (event && event.message) || messageInput || '',
						timestamp: new Date().toISOString()
					};
					const aiMsg: ChatMessage = {
						id: crypto.randomUUID(),
						role: 'assistant',
						content: `Simulated response for: "${userMsg.content}"`,
						timestamp: new Date().toISOString()
					};
					// small delay to simulate network
					await new Promise((r) => setTimeout(r, 250));
					return { userMessage: userMsg, aiResponse: aiMsg, confidence: 0.9 };
				}
			}
		}
	);

	const { state: chatState, send } = useMachine(chatMachine);

	// autoscroll when messages change
	$effect.pre(() => {
		// read messages to track them
		(chatState as any).context?.messages;
		if (chatContainer) {
			tick().then(() => {
				if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
			});
		}
	});

	onMount(() => {
		// ensure machine is connected or any startup logic
		send({ type: 'CONNECT' } as any);
	});
	onDestroy(() => {
		// cleanup if needed
	});

	function handleSend() {
		const trimmed = (messageInput ?? '').toString().trim();
		if (!trimmed) return;
		send({ type: 'SEND', message: trimmed } as any);
		messageInput = '';
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

</script>

<div class="enhanced-chat-container flex flex-col h-full max-w-4xl mx-auto p-4 space-y-4">
	<!-- Header -->
	<div class="chat-header flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border">
		<div class="flex items-center space-x-3">
			<div class="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
			<h2 class="text-xl font-semibold text-gray-800">Legal AI Assistant</h2>
			{#if (chatState as any).context?.confidence}
				<span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">
					Confidence: {Math.round(((chatState as any).context.confidence ?? 0) * 100)}%
				</span>
			{/if}
		</div>

		<div class="flex items-center space-x-2">
			<select
				id="model-select"
				onchange={(e) => send({ type: 'SET_MODEL', model: (e.currentTarget as HTMLSelectElement).value })}
				class="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
			>
				{#each Array.isArray(models) ? models : [] as m}
					<option value={m.value}>{m.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Messages -->
	<div
		class="messages-container flex-1 min-h-[12rem] max-h-[24rem] overflow-y-auto p-4 bg-white rounded-lg border shadow-sm"
		bind:this={chatContainer}
	>
		{#if (chatState as any).context?.messages?.length === 0}
			<div class="p-6 text-center text-gray-600">
				<h3 class="text-lg font-medium text-gray-900 mb-2">Welcome to Legal AI</h3>
				<p class="text-gray-500">Ask about legal documents, contracts, or cases.</p>
			</div>
		{:else}
			{#each (chatState as any).context.messages as message (message.id)}
				<div class={cn('message-item mb-4 flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
					<div
						class={cn(
							'message-bubble max-w-[70%] rounded-lg px-4 py-3 shadow-sm',
							message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
						)}
					>
						<div class="message-content whitespace-pre-wrap">{message.content}</div>
						<div class="text-xs text-gray-400 mt-1 text-right">{new Date(message.timestamp).toLocaleTimeString()}</div>
					</div>
				</div>
			{/each}
		{/if}

		{#if $chatState.matches('sending')}
			<div class="loading-message flex justify-start mb-4">
				<div class="message-bubble max-w-[70%] rounded-lg px-4 py-3 bg-gray-100 border">
					<div class="flex items-center space-x-2">
						<div class="typing-indicator flex space-x-1">
							<div class="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
							<div class="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
							<div class="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
						</div>
						<span class="text-sm text-gray-600">AI is thinking...</span>
					</div>
				</div>
			{/if}
	</div>

	<!-- Input -->
	<div class="flex items-center space-x-3">
		<textarea
			class="flex-1 border rounded-md px-3 py-2 resize-none"
			placeholder="Type a message..."
			value={messageInput}
			oninput={(e) => (messageInput = (e.currentTarget as HTMLTextAreaElement).value)}
			onkeydown={onKeyDown}
			rows="2"
		></textarea>

		<Button
			onclick={handleSend}
			disabled={!messageInput.trim() || $chatState.matches('sending')}
			class={cn(
				'px-6 py-3 rounded-lg font-medium transition-colors',
				messageInput.trim() && !$chatState.matches('sending')
					? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500'
					: 'bg-gray-300 text-gray-500 cursor-not-allowed'
			)}
		>
			Send
		</Button>
	</div>
</div>

<style>
	.typing-indicator div:nth-child(1) {
		animation-delay: 0s;
	}
	.typing-indicator div:nth-child(2) {
		animation-delay: 0.1s;
	}
	.typing-indicator div:nth-child(3) {
		animation-delay: 0.2s;
	}
	/* Custom scrollbar */
	.messages-container::-webkit-scrollbar {
		width: 6px;
	}
	.messages-container::-webkit-scrollbar-track {
		background: #f1f5f9;
		border-radius: 3px;
	}
	.messages-container::-webkit-scrollbar-thumb {
		background: #cbd5e1;
		border-radius: 3px;
	}
	.messages-container::-webkit-scrollbar-thumb:hover {
		background: #94a3b8;
	}
</style>