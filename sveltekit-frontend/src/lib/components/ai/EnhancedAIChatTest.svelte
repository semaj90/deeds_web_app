<!-- Enhanced AI Chat Test Component - Svelte 5 with bits-ui -->
<script lang="ts">
	import type { Case, User } from '$lib/types';
	import type { Document } from '$lib/types';
	import { browser } from '$app/environment';
	import { tick } from 'svelte';
	import { Dialog } from "bits-ui";
import Button from "$lib/components/ui/Button.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Card from "$lib/components/ui/card/Card.svelte";
	import CardHeader from "$lib/components/ui/card/CardHeader.svelte";
	import CardTitle from "$lib/components/ui/card/CardTitle.svelte";
	import CardContent from "$lib/components/ui/card/CardContent.svelte";
	import ScrollArea from "$lib/components/ui/scrollarea/ScrollArea.svelte";
	import Bot from 'lucide-svelte/icons/bot';
	import UserIcon from 'lucide-svelte/icons/user';
	import Send from 'lucide-svelte/icons/send';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import CheckCircle from 'lucide-svelte/icons/check-circle';
	import XCircle from 'lucide-svelte/icons/x-circle';
	import MessageCircle from 'lucide-svelte/icons/message-circle';
	import Download from 'lucide-svelte/icons/download';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import { getOllamaHealthEndpoint } from '$lib/utils/ollama-endpoint';
	import type { ChatMessage } from '$lib/types/chat';

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
							model: 'gemma3-legal-enhanced'
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
				const ollamaResponse = await fetch(getOllamaHealthEndpoint());
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
				const ollamaResponse = await fetch(getOllamaHealthEndpoint());
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
					model: 'gemma3-legal-enhanced',
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
					model: 'gemma3-legal-enhanced'
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
	function getStatusIcon() {
		switch (connectionStatus) {
			case 'checking':
				return Loader2;
			case 'connected':
				return CheckCircle;
			case 'error':
				return XCircle;
			default:
				return XCircle;
		}
	}

	function getStatusColor() {
		switch (connectionStatus) {
			case 'checking':
				return 'text-yellow-500';
			case 'connected':
				return 'text-green-500';
			case 'error':
				return 'text-red-500';
			default:
				return 'text-gray-500';
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		<Button variant="ghost" class="gap-2">
			<MessageCircle class="h-4 w-4" />
			{title}
		</Button>
	</Dialog.Trigger>

	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 bg-black/50" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl max-h-[80vh] z-50 flex flex-col bg-white dark:bg-gray-900 rounded-lg shadow-xl"
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b dark:border-gray-700">
				<div class="flex items-center gap-3">
					<Bot class="h-5 w-5 text-blue-600 dark:text-blue-400" />
					<Dialog.Title class="text-lg font-semibold dark:text-white">
						{title}
					</Dialog.Title>
					{#if caseId}
						<span class="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
							Case {caseId}
						</span>
					{/if}
				</div>

				<div class="flex items-center gap-2">
					<!-- Status Indicator -->
					<div class="flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-md">
						{#snippet statusIndicator()}
							{@const StatusIcon = getStatusIcon()}
							<StatusIcon class="h-4 w-4 {getStatusColor()}" />
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
						<Download class="h-4 w-4" />
					</Button>

					<Button variant="ghost" size="sm" onclick={clearMessages} disabled={messages.length <= 1}>
						<Trash2 class="h-4 w-4" />
					</Button>

					<Dialog.Close>
						<Button variant="ghost" size="sm">✕</Button>
					</Dialog.Close>
				</div>
			</div>

			<!-- Messages -->
			<ScrollArea class="flex-1 p-4">
				<div bind:this={messagesContainer} class="space-y-4">
					{#each messages as message (message.id)}
						<div class="flex gap-3 {message.role === 'user' ? 'flex-row-reverse' : ''}">
							{#if message.role === 'assistant'}
								<div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
									<Bot class="h-4 w-4 text-blue-600 dark:text-blue-400" />
								</div>
							{/if}

							<div
								class="max-w-[80%] rounded-lg p-3 {message.role === 'user'
									? 'bg-blue-600 text-white'
									: message.error
										? 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100'
										: 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'}"
							>
								<div class="text-sm whitespace-pre-wrap">
									{message.content}
								</div>

								{#if message.metadata}
									<div class="flex items-center gap-2 mt-2 pt-2 border-t border-current/20">
										<span class="px-2 py-1 bg-black/10 rounded text-xs font-medium">
											{message.metadata.model ?? 'AI'}
										</span>
										{#if message.metadata.provider}
											<span class="px-2 py-1 bg-black/10 rounded text-xs font-medium">
												{message.metadata.provider}
											</span>
										{/if}
										{#if message.metadata.gpu}
											<span class="px-2 py-1 bg-black/10 rounded text-xs font-medium">
												{message.metadata.gpu}
											</span>
										{/if}
									</div>
								{/if}

								<div class="text-xs opacity-70 mt-1">
									{message.timestamp.toLocaleTimeString()}
								</div>
							</div>

							{#if message.role === 'user'}
								<div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
									<UserIcon class="h-4 w-4 text-white" />
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</ScrollArea>

			<!-- Input -->
			<div class="p-4 border-t dark:border-gray-700">
				<div class="flex gap-2">
					<input
						type="text"
						bind:this={inputElement}
						bind:value={currentMessage}
						placeholder={isConnected ? 'Ask your legal question...' : 'Connecting to AI service...'}
						disabled={!isConnected || isLoading}
						class="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50 dark:text-white"
						onkeydown={handleKeydown}
					/>

					<Button
						onclick={sendMessage}
						disabled={!currentMessage.trim() || !isConnected || isLoading}
						class="px-4"
					>
						{#if isLoading}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							<Send class="h-4 w-4" />
						{/if}
					</Button>
				</div>

				<div class="flex items-center justify-between mt-2">
					<div class="text-xs text-gray-600 dark:text-gray-400">
						{#if isConnected}
							🟢 Ready • Gemma3 Legal Enhanced • RTX 3060 Ti GPU
						{:else}
							🔴 Checking connection to Ollama service...
						{/if}
					</div>
					<div class="text-xs text-gray-500">Enter to send • Shift+Enter for new line</div>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

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