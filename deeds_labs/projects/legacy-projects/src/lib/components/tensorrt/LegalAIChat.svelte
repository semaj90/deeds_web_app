<script lang="ts">
	import { onMount } from 'svelte';

	interface ChatMessage {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		timestamp: Date;
		inference_time_ms?: number;
		model?: string;
	}

	// Svelte 5 runes
	let messages = $state<ChatMessage[]>([]);
	let input = $state('');
	let isLoading = $state(false);
	let chatContainer: HTMLElement;

	const models = [
		{ id: 'gemma3-legal', name: '⚖️ Gemma3 Legal' },
		{ id: 'tensorrt-optimized', name: '🚀 TensorRT Optimized' },
		{ id: 'embedding-analysis', name: '🔍 Embedding Analysis' }
	];

	let selectedModel = $state(models[0].id);

	async function sendMessage() {
		if (!input.trim() || isLoading) return;

		const userMessage: ChatMessage = {
			id: crypto.randomUUID(),
			role: 'user',
			content: input.trim(),
			timestamp: new Date()
		};

		messages = [...messages, userMessage];
		const userInput = input;
		input = '';
		isLoading = true;

		try {
			const startTime = Date.now();

			const response = await fetch('/api/tensorrt', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: userInput,
					model: selectedModel
				})
			});

			const data = await response.json();
			const inferenceTime = Date.now() - startTime;

			if (data.success) {
				const assistantMessage: ChatMessage = {
					id: crypto.randomUUID(),
					role: 'assistant',
					content: data.result || 'TensorRT-LLM processing completed',
					timestamp: new Date(),
					inference_time_ms: data.inference_time_ms || inferenceTime,
					model: data.model
				};

				messages = [...messages, assistantMessage];
			} else {
				throw new Error(data.error || 'TensorRT inference failed');
			}
		} catch (error) {
			const errorMessage: ChatMessage = {
				id: crypto.randomUUID(),
				role: 'assistant',
				content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
				timestamp: new Date()
			};

			messages = [...messages, errorMessage];
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function clearChat() {
		messages = [];
	}

	// Auto-scroll to bottom when new messages arrive - Svelte 5 effect
	$effect(() => {
		if (messages.length > 0 && chatContainer) {
			setTimeout(() => {
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}, 100);
		}
	});

	onMount(() => {
		// Add welcome message
		const welcomeMessage: ChatMessage = {
			id: crypto.randomUUID(),
			role: 'assistant',
			content: '🚀 TensorRT-LLM Legal AI is ready! Ask me about legal documents, contracts, or any legal analysis.',
			timestamp: new Date(),
			model: 'system'
		};
		messages = [welcomeMessage];
	});
</script>

<div class="legal-ai-chat">
	<div class="chat-header">
		<div class="title-section">
			<h2>⚖️ Legal AI Chat</h2>
			<span class="subtitle">Powered by TensorRT-LLM</span>
		</div>

		<div class="controls">
			<select bind:value={selectedModel} class="model-select">
				{#each models as model}
					<option value={model.id}>{model.name}</option>
				{/each}
			</select>

			<button onclick={clearChat} class="clear-btn">
				🗑️ Clear
			</button>
		</div>
	</div>

	<div class="chat-messages" bind:this={chatContainer}>
		{#each messages as message (message.id)}
			<div class="message" class:user={message.role === 'user'} class:assistant={message.role === 'assistant'}>
				<div class="message-header">
					<span class="role">
						{message.role === 'user' ? '👤 You' : '🤖 Legal AI'}
					</span>
					<span class="timestamp">
						{message.timestamp.toLocaleTimeString()}
					</span>
				</div>

				<div class="message-content">
					{message.content}
				</div>

				{#if message.inference_time_ms}
					<div class="message-meta">
						⚡ {message.inference_time_ms}ms
						{#if message.model}
							• 🎯 {message.model}
						{/if}
					</div>
				{/if}
			</div>
		{/each}

		{#if isLoading}
			<div class="message assistant loading">
				<div class="message-header">
					<span class="role">🤖 Legal AI</span>
					<span class="timestamp">Processing...</span>
				</div>
				<div class="message-content">
					<div class="typing-indicator">
						<span></span>
						<span></span>
						<span></span>
					</div>
					TensorRT-LLM is analyzing your request...
				</div>
			</div>
		{/if}
	</div>

	<div class="chat-input">
		<div class="input-container">
			<textarea
				bind:value={input}
				onkeydown={handleKeydown}
				placeholder="Ask about legal documents, contracts, compliance..."
				rows="3"
				disabled={isLoading}
			></textarea>

			<button
				onclick={sendMessage}
				disabled={!input.trim() || isLoading}
				class="send-btn"
			>
				{isLoading ? '⏳' : '🚀'} Send
			</button>
		</div>

		<div class="input-hints">
			💡 Try: "Analyze this contract clause" • "What are the risks in this agreement?" • "Draft a liability disclaimer"
		</div>
	</div>
</div>

<style>
	.legal-ai-chat {
		display: flex;
		flex-direction: column;
		height: 600px;
		background: white;
		border-radius: 12px;
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
		overflow: hidden;
	}

	.chat-header {
		background: linear-gradient(135deg, #1e40af 0%, #3730a3 100%);
		color: white;
		padding: 1rem 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.title-section h2 {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 600;
	}

	.subtitle {
		font-size: 0.85rem;
		opacity: 0.9;
	}

	.controls {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.model-select {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		font-size: 0.85rem;
	}

	.model-select option {
		background: #1e40af;
		color: white;
	}

	.clear-btn {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		transition: background 0.2s ease;
	}

	.clear-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		background: #f8fafc;
	}

	.message {
		max-width: 80%;
		align-self: flex-start;
	}

	.message.user {
		align-self: flex-end;
	}

	.message.user .message-content {
		background: #3b82f6;
		color: white;
	}

	.message.assistant .message-content {
		background: white;
		color: #374151;
		border: 1px solid #e5e7eb;
	}

	.message-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		font-size: 0.8rem;
		color: #6b7280;
	}

	.role {
		font-weight: 600;
	}

	.message-content {
		padding: 0.75rem 1rem;
		border-radius: 12px;
		line-height: 1.5;
		word-wrap: break-word;
	}

	.message-meta {
		margin-top: 0.5rem;
		font-size: 0.75rem;
		color: #9ca3af;
		font-family: 'Monaco', 'Menlo', monospace;
	}

	.loading .message-content {
		background: #f3f4f6;
		border: 1px solid #d1d5db;
	}

	.typing-indicator {
		display: inline-flex;
		gap: 0.25rem;
		margin-right: 0.5rem;
	}

	.typing-indicator span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #6b7280;
		animation: typing 1.4s infinite ease-in-out;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing {
		0%, 80%, 100% {
			transform: scale(0.8);
			opacity: 0.5;
		}
		40% {
			transform: scale(1);
			opacity: 1;
		}
	}

	.chat-input {
		background: white;
		border-top: 1px solid #e5e7eb;
		padding: 1rem 1.5rem;
	}

	.input-container {
		display: flex;
		gap: 0.75rem;
		align-items: flex-end;
	}

	textarea {
		flex: 1;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		padding: 0.75rem;
		font-size: 0.9rem;
		line-height: 1.4;
		resize: none;
		font-family: inherit;
	}

	textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.send-btn {
		background: #3b82f6;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 500;
		transition: background 0.2s ease;
		height: fit-content;
	}

	.send-btn:hover:not(:disabled) {
		background: #2563eb;
	}

	.send-btn:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	.input-hints {
		margin-top: 0.75rem;
		font-size: 0.8rem;
		color: #6b7280;
		line-height: 1.4;
	}
</style>


