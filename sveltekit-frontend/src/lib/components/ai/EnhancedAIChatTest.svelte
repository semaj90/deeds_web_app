<!-- Enhanced AI Chat Test Component - Svelte 5 with bits-ui -->
<script lang="ts">
	import type { Case, User } from '$lib/types';
	import type { Document } from '$lib/types';
	import { browser } from '$app/environment';
	import { tick } from 'svelte';
	import { DialogRoot, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogClose } from "$lib/components/ui/dialog";
import Button from "$lib/components/ui/Button.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Card from "$lib/components/ui/card/Card.svelte";
	import CardHeader from "$lib/components/ui/card/CardHeader.svelte";
	import CardTitle from "$lib/components/ui/card/CardTitle.svelte";
	import CardContent from "$lib/components/ui/card/CardContent.svelte";
	// ScrollArea is a stub — using plain div with overflow
	import { getOllamaEndpoint } from '$lib/utils/ollama-endpoint';
	import type { ChatMessage as BaseChatMessage } from '$lib/types/chat';

	type ChatMessage = BaseChatMessage & { loading?: boolean; error?: boolean };

	// Props using Svelte 5 runes
	let {
		open = $bindable(false),
		caseId = undefined,
		title = 'Enhanced AI Legal Assistant'
	}: {
		open?: boolean;
		caseId?: string;
		title?: string;
	} = $props();

	// State using Svelte 5 runes
	let messages = $state<ChatMessage[]>([]);
	let currentMessage = $state<string>('');
	let isLoading = $state<boolean>(false);
	let isConnected = $state<boolean>(false);
	let connectionStatus = $state<'checking' | 'connected' | 'error'>('checking');
	let messagesContainer: HTMLElement | undefined = $state(undefined);
	let inputElement: HTMLInputElement | undefined = $state(undefined);

	// Check system status on mount
	$effect(() => {
		if (browser) {
			(async () => {
				await checkSystemHealth();

				// Add welcome message
				messages = [
					{
						id: 'welcome',
						role: 'assistant',
						content: `Hello! I'm your enhanced AI legal assistant powered by Gemma3 running on your RTX 3060 Ti GPU. I can help you with:

• Legal research and case analysis
• Document review and interpretation
• Evidence analysis and timeline creation
• Legal precedent research
• Case strategy development

What would you like to explore today?`,
						timestamp: new Date(),
						metadata: {
							provider: 'local',
							model: 'gemma4-legal-enhanced'
						}
					}
				];

				// Auto-focus input
				await tick();
				if (inputElement) {
					inputElement.focus();
				}
			})();
		}
	});

	// Check system health
	async function checkSystemHealth(): Promise<void> {
		try {
			connectionStatus = 'checking';

			// First, try the SvelteKit API health endpoint
			const response = await fetch('/api/health/status');

			if (response.ok) {
				const data = await response.json();
				isConnected = data.services?.ollama?.status === 'connected';
				connectionStatus = isConnected ? 'connected' : 'error';
			} else {
				// Fallback: try to reach Ollama directly
				const ollamaResponse = await fetch(getOllamaEndpoint());
				if (ollamaResponse.ok) {
					isConnected = true;
					connectionStatus = 'connected';
				} else {
					isConnected = false;
					connectionStatus = 'error';
				}
			}
		} catch (error) {
			console.error('Health check failed:', error);

			// Try direct Ollama connection as fallback
			try {
				const ollamaResponse = await fetch(getOllamaEndpoint());
				if (ollamaResponse.ok) {
					isConnected = true;
					connectionStatus = 'connected';
				} else {
					throw error;
				}
			} catch (fallbackError) {
				connectionStatus = 'error';
				isConnected = false;
			}
		}
	}

	// Send message to AI
	async function sendMessage(): Promise<void> {
		if (!currentMessage.trim() || isLoading) return;

		const userMessage: ChatMessage = {
			id: crypto.randomUUID(),
			role: 'user',
			content: currentMessage.trim(),
			timestamp: new Date()
		};

		const loadingMessage: ChatMessage = {
			id: 'loading',
			role: 'assistant',
			content: 'Thinking...',
			timestamp: new Date(),
			loading: true
		};

		// Add messages and clear input
		messages = [...messages, userMessage, loadingMessage];
		const messageContent = currentMessage;
		currentMessage = '';
		isLoading = true;

		// Scroll to bottom
		await tick();
		scrollToBottom();

		try {
			const response = await fetch('/api/contextual/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					caseId,
					messages: [
						{
							role: 'system',
							content: `You are an expert legal AI assistant with access to legal databases and case law. You are running locally on an RTX 3060 Ti GPU using the Gemma3-legal-enhanced model. Provide accurate, helpful legal information while noting that you provide general information only and not legal advice.${caseId ? ` Context: Case ID ${caseId}` : ''}`
						},
						...messages
							.filter((m) => !m.loading && !m.error)
							.map((m) => ({
								role: m.role,
								content: m.content
							})),
						{
							role: 'user',
							content: messageContent
						}
					]
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			// Handle streaming response
			const reader = response.body?.getReader();
			const decoder = new TextDecoder();

			// Remove loading message
			messages = messages.filter((m) => m.id !== 'loading');

			// Create assistant message
			const assistantMessage: ChatMessage = {
				id: crypto.randomUUID(),
				role: 'assistant',
				content: '',
				timestamp: new Date(),
				metadata: {
					provider: 'local',
					model: 'gemma4-legal-enhanced',
					gpu: 'RTX 3060 Ti'
				}
			};

			messages = [...messages, assistantMessage];

			if (reader) {
				let fullContent = '';

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					const lines = chunk.split('\n');

					for (const line of lines) {
						if (line.trim() && line.startsWith('data: ')) {
							try {
								const data = JSON.parse(line.slice(6));
								if (data.message?.content) {
									fullContent += data.message.content;

									// Update the last message
									messages = messages.map((m) =>
										m.id === assistantMessage.id ? { ...m, content: fullContent } : m
									);

									await tick();
									scrollToBottom();
								}
							} catch (e) {
								// Ignore JSON parse errors for streaming
							}
						}
					}
				}
			}
		} catch (error: any) {
			console.error('Failed to send message:', error);

			// Remove loading message and add error
			messages = messages.filter((m) => m.id !== 'loading');
			messages = [
				...messages,
				{
					id: crypto.randomUUID(),
					role: 'assistant',
					content: `I apologize, but I encountered an error: ${error.message}. Please check that the Ollama service is running and try again.`,
					timestamp: new Date(),
					error: true
				}
			];
		} finally {
			isLoading = false;
		}
	}

	// Handle Enter key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	// Scroll to bottom of messages
	function scrollToBottom() {
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	// Clear conversation
	function clearMessages() {
		messages = [
			{
				id: 'welcome',
				role: 'assistant',
				content: 'Conversation cleared. How can I help you today?',
				timestamp: new Date(),
				metadata: {
					provider: 'local',
					model: 'gemma4-legal-enhanced'
				}
			}
		];
	}

	// Download conversation
	function downloadConversation() {
		const data = {
			timestamp: new Date().toISOString(),
			caseId,
			messages: messages.filter((m) => !m.loading)
		};

		const blob = new Blob([JSON.stringify(data, null, 2)], {
			type: 'application/json'
		});

		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `ai-chat-${caseId || 'session'}-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Connection status helpers
	function getStatusIcon(): string { switch (connectionStatus) { case 'checking': return 'loader-circle'; case 'connected': return 'circle-check'; case 'error': return 'circle-x'; default: return 'circle-x'; } }

	function getStatusColor() {
		switch (connectionStatus) {
			case 'checking':
				return 'text-warning';
			case 'connected':
				return 'text-accent';
			case 'error':
				return 'text-danger';
			default:
				return 'text-sand/60';
		}
	}
</script>

<DialogRoot bind:open>
	<DialogTrigger>
		<Button variant="ghost" class="gap-2">
			<span class="i-lucide-message-circle h-4 w-4 inline-block"></span>
			{title}
		</Button>
	</DialogTrigger>

	<DialogPortal>
		<DialogOverlay class="fixed inset-0 bg-black/50" />
		<DialogContent
			class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl max-h-[80vh] z-50 flex flex-col bg-white dark:bg-panel rounded-lg shadow-xl"
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b dark:border-sand/20">
				<div class="flex items-center gap-3">
					<span class="i-lucide-bot h-5 w-5 text-info dark:text-info/80 inline-block"></span>
					<DialogTitle class="text-lg font-semibold dark:text-white">
						{title}
					</DialogTitle>
					{#if caseId}
						<span class="px-2 py-1 bg-info/10 dark:bg-info/20 text-info dark:text-info/60 rounded text-xs font-medium">
							Case {caseId}
						</span>
					{/if}
				</div>

				<div class="flex items-center gap-2">
					<!-- Status Indicator -->
					<div class="flex items-center gap-2 px-2 py-1 bg-sand/10 dark:bg-panelSoft rounded-md">
						{#snippet statusIndicator()}
							<span class={`i-lucide-${getStatusIcon()} h-4 w-4 ${getStatusColor()} inline-block`}></span>
							<span class="text-xs {getStatusColor()}">
								{connectionStatus === 'checking'
									? 'Checking...'
									: connectionStatus === 'connected'
										? 'Connected'
										: 'Offline'}
							</span>
						{/snippet}
						{@render statusIndicator()}
					</div>

					<!-- Action Buttons -->
					<Button
						variant="ghost"
						size="sm"
						onclick={downloadConversation}
						disabled={messages.length <= 1}
					>
						<span class="i-lucide-download h-4 w-4 inline-block"></span>
					</Button>

					<Button variant="ghost" size="sm" onclick={clearMessages} disabled={messages.length <= 1}>
						<span class="i-lucide-trash-2 h-4 w-4 inline-block"></span>
					</Button>

					<DialogClose>
						<Button variant="ghost" size="sm">✕</Button>
					</DialogClose>
				</div>
			</div>

			<!-- Messages -->
			<div class="flex-1 p-4 overflow-y-auto">
				<div bind:this={messagesContainer} class="space-y-4">
					{#each messages as message (message.id)}
						<div class="flex gap-3 {message.role === 'user' ? 'flex-row-reverse' : ''}">
							{#if message.role === 'assistant'}
								<div class="flex-shrink-0 w-8 h-8 rounded-full bg-info/10 dark:bg-info/20 flex items-center justify-center">
									<span class="i-lucide-bot h-4 w-4 text-info dark:text-info/80 inline-block"></span>
								</div>
							{/if}

							<div
								class="max-w-[80%] rounded-lg p-3 {message.role === 'user'
									? 'bg-info text-white'
									: message.error
										? 'bg-danger/10 dark:bg-danger/20 text-danger dark:text-danger/20'
										: 'bg-sand/10 dark:bg-panelSoft text-sand dark:text-sand/20'}"
							>
								<div class="text-sm whitespace-pre-wrap">
									{message.content}
								</div>

								{#if message.metadata}
									{@const meta = message.metadata as Record<string, any>}
									<div class="flex items-center gap-2 mt-2 pt-2 border-t border-current/20">
										<span class="px-2 py-1 bg-black/10 rounded text-xs font-medium">
											{meta.model ?? 'AI'}
										</span>
										{#if meta.provider}
											<span class="px-2 py-1 bg-black/10 rounded text-xs font-medium">
												{meta.provider}
											</span>
										{/if}
										{#if meta.gpu}
											<span class="px-2 py-1 bg-black/10 rounded text-xs font-medium">
												{meta.gpu}
											</span>
										{/if}
									</div>
								{/if}

								<div class="text-xs opacity-70 mt-1">
									{message.timestamp.toLocaleTimeString()}
								</div>
							</div>

							{#if message.role === 'user'}
								<div class="flex-shrink-0 w-8 h-8 rounded-full bg-info flex items-center justify-center">
									<span class="i-lucide-user h-4 w-4 text-white inline-block"></span>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- Input -->
			<div class="p-4 border-t dark:border-sand/20">
				<div class="flex gap-2">
					<input
						type="text"
						bind:this={inputElement}
						bind:value={currentMessage}
						placeholder={isConnected ? 'Ask your legal question...' : 'Connecting to AI service...'}
						disabled={!isConnected || isLoading}
						class="flex-1 px-4 py-2 bg-sand/10 dark:bg-panelSoft border border-sand/20 dark:border-sand/30 rounded-lg focus:ring-2 focus:ring-info focus:border-transparent outline-none disabled:opacity-50 dark:text-white"
						onkeydown={handleKeydown}
					/>

					<Button
						onclick={sendMessage}
						disabled={!currentMessage.trim() || !isConnected || isLoading}
						class="px-4"
					>
						{#if isLoading}
							<span class="i-lucide-loader-2 h-4 w-4 animate-spin inline-block"></span>
						{:else}
							<span class="i-lucide-send h-4 w-4 inline-block"></span>
						{/if}
					</Button>
				</div>

				<div class="flex items-center justify-between mt-2">
					<div class="text-xs text-sand/60 dark:text-sand/40">
						{#if isConnected}
							🟢 Ready • Gemma3 Legal Enhanced • RTX 3060 Ti GPU
						{:else}
							🔴 Checking connection to Ollama service...
						{/if}
					</div>
					<div class="text-xs text-sand/60">Enter to send • Shift+Enter for new line</div>
				</div>
			</div>
		</DialogContent>
	</DialogPortal>
</DialogRoot>

<style>
	/* Custom styles for enhanced appearance */
	:global(.chat-message-content) {
		line-height: 1.6;
	}

	:global(.chat-message-content p) {
		margin-bottom: 0.5rem;
	}

	:global(.chat-message-content p:last-child) {
		margin-bottom: 0;
	}

	:global(.chat-message-content ul, .chat-message-content ol) {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
	}

	:global(.chat-message-content code) {
		background: rgba(0, 0, 0, 0.1);
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		font-family: 'Courier New', monospace;
		font-size: 0.875em;
	}

	:global(.chat-message-content blockquote) {
		border-left: 4px solid currentColor;
		padding-left: 1rem;
		margin: 0.5rem 0;
		opacity: 0.8;
	}
</style>