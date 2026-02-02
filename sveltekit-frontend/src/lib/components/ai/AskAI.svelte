<script lang="ts">
	import { browser } from '$app/environment';
	import { AlertCircle, Brain, Loader2, MessageCircle, Mic, MicOff } from 'lucide-svelte';

	interface AIResponse {
		answer: string;
		references?: Array<{ id: string; title: string; relevance: number }>;
		confidence: number;
		searchResults: number;
		model: string;
		processingTime: number;
	}

	interface ConversationMessage {
		id: string;
		type: 'user' | 'ai';
		content: string;
		timestamp: number;
		references?: AIResponse['references'];
		confidence?: number;
		metadata?: Record<string, unknown>;
	}

	// Props
	let {
		caseId = undefined,
		evidenceIds = [],
		placeholder = 'Ask AI about this case...',
		maxHeight = '400px',
		showReferences = true,
		enableVoiceInput = false,
		enableVoiceOutput = false
	}: {
		caseId?: string;
		evidenceIds?: string[];
		placeholder?: string;
		maxHeight?: string;
		showReferences?: boolean;
		enableVoiceInput?: boolean;
		enableVoiceOutput?: boolean;
	} = $props();

	// State
	let query = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let conversation = $state<ConversationMessage[]>([]);
	let textareaRef = $state<HTMLTextAreaElement | undefined>();
	let messagesContainer = $state<HTMLDivElement | undefined>();

	// Advanced options
	let showAdvancedOptions = $state(false);
	let selectedModel = $state<'openai' | 'ollama'>('openai');
	let searchThreshold = $state(0.7);
	let maxResults = $state(10);
	let temperature = $state(0.7);

	// Voice input
	let isListening = $state(false);
	let recognition = $state<any>(null);

	// Generate unique ID
	function generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	// Load conversation history
	$effect(() => {
		if (browser && enableVoiceInput && 'webkitSpeechRecognition' in window) {
			recognition = new (window as any).webkitSpeechRecognition();
			recognition.continuous = false;
			recognition.interimResults = false;
			recognition.lang = 'en-US';

			recognition.onresult = (event: any) => {
				const transcript = event.results[0][0].transcript;
				query = transcript;
				textareaRef?.focus();
			};

			recognition.onerror = () => {
				isListening = false;
			};

			recognition.onend = () => {
				isListening = false;
			};
		}

		loadConversationHistory();
	});

	async function loadConversationHistory() {
		if (!browser) return;

		try {
			const contextKey = caseId ? `case_${caseId}` : 'general';
			const stored = localStorage.getItem(`ai_conversation_${contextKey}`);
			if (stored) {
				const history = JSON.parse(stored);
				if (Array.isArray(history)) {
					conversation = history.slice(-10);
				}
			}
		} catch (err) {
			console.warn('Failed to load conversation history:', err);
		}
	}

	async function saveConversationHistory() {
		if (!browser) return;

		try {
			const contextKey = caseId ? `case_${caseId}` : 'general';
			localStorage.setItem(`ai_conversation_${contextKey}`, JSON.stringify(conversation));
		} catch (err) {
			console.warn('Failed to save conversation history:', err);
		}
	}

	async function askAI() {
		if (!query.trim() || isLoading) return;

		const userMessage: ConversationMessage = {
			id: generateId(),
			type: 'user',
			content: query.trim(),
			timestamp: Date.now()
		};

		conversation = [...conversation, userMessage];
		const currentQuery = query;
		query = '';
		isLoading = true;
		error = '';

		const aiMessage: ConversationMessage = {
			id: generateId(),
			type: 'ai',
			content: '',
			timestamp: Date.now(),
			references: [],
			confidence: undefined,
			metadata: {}
		};

		conversation = [...conversation, aiMessage];

		try {
			const response = await fetch('/api/ai/ask', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					question: currentQuery,
					context: {
						caseId,
						evidenceIds,
						maxResults,
						searchThreshold
					},
					model: selectedModel,
					temperature
				})
			});

			if (!response.ok) {
				throw new Error(`API error: ${response.statusText}`);
			}

			const result: AIResponse = await response.json();

			// Update AI message
			const index = conversation.findIndex((m) => m.id === aiMessage.id);
			if (index !== -1) {
				conversation[index].content = result.answer;
				conversation[index].references = result.references;
				conversation[index].confidence = result.confidence;
				conversation[index].metadata = {
					model: result.model,
					processingTime: result.processingTime,
					searchResults: result.searchResults
				};
			}

			await saveConversationHistory();

			// Scroll to bottom
			setTimeout(() => {
				if (messagesContainer) {
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
			}, 100);
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
			console.error('AI request failed:', err);
		} finally {
			isLoading = false;
		}
	}

	function toggleVoiceInput() {
		if (!recognition) return;

		if (isListening) {
			recognition.stop();
			isListening = false;
		} else {
			recognition.start();
			isListening = true;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			askAI();
		}
	}
</script>

<div class="ask-ai-container" style="max-height: {maxHeight}">
	<!-- Conversation -->
	<div bind:this={messagesContainer} class="messages-container">
		{#if conversation.length === 0}
			<div class="empty-state">
				<MessageCircle size={48} class="text-gray-400" />
				<p class="text-gray-500">Ask a question to get started</p>
			</div>
		{/if}

		{#each conversation as message}
			<div class="message {message.type}">
				<div class="message-icon">
					{#if message.type === 'user'}
						<MessageCircle size={20} />
					{:else}
						<Brain size={20} />
					{/if}
				</div>

				<div class="message-content">
					<p>{message.content}</p>

					{#if message.type === 'ai' && message.confidence !== undefined}
						<div class="confidence">
							Confidence: {Math.round(message.confidence * 100)}%
						</div>
					{/if}

					{#if showReferences && message.references && message.references.length > 0}
						<div class="references">
							<strong>References:</strong>
							<ul>
								{#each message.references as ref}
									<li>{ref.title} ({Math.round(ref.relevance * 100)}%)</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			</div>
		{/each}

		{#if isLoading}
			<div class="message ai loading">
				<div class="message-icon">
					<Loader2 size={20} class="animate-spin" />
				</div>
				<div class="message-content">
					<p>Thinking...</p>
				</div>
			</div>
		{/if}
	</div>

	<!-- Error message -->
	{#if error}
		<div class="error-banner">
			<AlertCircle size={16} />
			<span>{error}</span>
		</div>
	{/if}

	<!-- Input area -->
	<div class="input-container">
		<textarea
			bind:this={textareaRef}
			bind:value={query}
			{placeholder}
			rows="2"
			onkeydown={handleKeyDown}
			disabled={isLoading}
		></textarea>

		<div class="input-actions">
			{#if enableVoiceInput && recognition}
				<button
					type="button"
					class="voice-btn"
					onclick={toggleVoiceInput}
					aria-label={isListening ? 'Stop listening' : 'Start voice input'}
				>
					{#if isListening}
						<MicOff size={20} />
					{:else}
						<Mic size={20} />
					{/if}
				</button>
			{/if}

			<button
				type="button"
				class="send-btn"
				onclick={askAI}
				disabled={!query.trim() || isLoading}
			>
				{#if isLoading}
					<Loader2 size={20} class="animate-spin" />
				{:else}
					Send
				{/if}
			</button>
		</div>
	</div>

	<!-- Advanced options toggle -->
	<button
		type="button"
		class="advanced-toggle"
		onclick={() => (showAdvancedOptions = !showAdvancedOptions)}
	>
		{showAdvancedOptions ? 'Hide' : 'Show'} Advanced Options
	</button>

	{#if showAdvancedOptions}
		<div class="advanced-options">
			<label>
				Model:
				<select bind:value={selectedModel}>
					<option value="openai">OpenAI</option>
					<option value="ollama">Ollama (Local)</option>
				</select>
			</label>

			<label>
				Search Threshold: {searchThreshold}
				<input type="range" bind:value={searchThreshold} min="0" max="1" step="0.1" />
			</label>

			<label>
				Max Results: {maxResults}
				<input type="range" bind:value={maxResults} min="1" max="20" step="1" />
			</label>

			<label>
				Temperature: {temperature}
				<input type="range" bind:value={temperature} min="0" max="1" step="0.1" />
			</label>
		</div>
	{/if}
</div>

<style>
	.ask-ai-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		height: 100%;
		overflow: hidden;
	}

	.messages-container {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem;
		text-align: center;
	}

	.message {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.message.user {
		flex-direction: row-reverse;
	}

	.message-icon {
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background-color: #f3f4f6;
	}

	.message.user .message-icon {
		background-color: #3b82f6;
		color: white;
	}

	.message-content {
		flex: 1;
		padding: 0.75rem;
		border-radius: 0.5rem;
		background-color: #f9fafb;
	}

	.message.user .message-content {
		background-color: #eff6ff;
	}

	.confidence {
		margin-top: 0.5rem;
		font-size: 0.875rem;
		color: #6b7280;
	}

	.references {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid #e5e7eb;
		font-size: 0.875rem;
	}

	.references ul {
		margin-top: 0.5rem;
		padding-left: 1.5rem;
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background-color: #fee2e2;
		color: #991b1b;
		border-radius: 0.375rem;
	}

	.input-container {
		padding: 0 1rem 1rem;
	}

	textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		resize: vertical;
		font-family: inherit;
		font-size: 0.875rem;
	}

	textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.input-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
		justify-content: flex-end;
	}

	.voice-btn,
	.send-btn {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		transition:all 0.2s;
	}

	.voice-btn {
		background-color: #f3f4f6;
	}

	.voice-btn:hover {
		background-color: #e5e7eb;
	}

	.send-btn {
		background-color: #3b82f6;
		color: white;
	}

	.send-btn:hover:not(:disabled) {
		background-color: #2563eb;
	}

	.send-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.advanced-toggle {
		margin: 0 1rem;
		padding: 0.5rem;
		border: none;
		background: none;
		color: #3b82f6;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.advanced-options {
		padding: 1rem;
		background-color: #f9fafb;
		border-radius: 0.375rem;
		margin: 0 1rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.advanced-options label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.875rem;
	}

	.advanced-options select,
	.advanced-options input[type='range'] {
		padding: 0.5rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.25rem;
	}
</style>






