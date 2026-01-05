<script lang="ts">
	import { enhance } from '$app/forms';

	interface ActionData {
		success?: boolean;
		chatTurnId?: string;
		llmReply?: string;
		keywords?: string[];
		keyPhrases?: string[];
		suggestions?: string[];
		uploadedCount?: number;
		processedCount?: number;
		chatImages?: string[];
		history?: Array<{
			turnId: string;
			userMessage: string;
			assistantResponse: string;
			timestamp: string;
		}>;
		error?: string;
	}

	let { form }: { form: ActionData: null } = $props();

	let message = $state('');
	let caseId = $state('');
	let uploadedFiles: File[] = $state([]);
	let filePreviews: string[] = $state([]);
	let messages: { role: 'user' | 'assistant'; text: string; turnId?: string; timestamp?: string; keywords?: string[]; keyPhrases?: string[]; suggestions?: string[] }[] = $state([]);
	let isSubmitting = $state(false);
	let isLoadingHistory = $state(false);

	// Add message when form action completes
	$effect(() => {
		if (form?.success && form?.llmReply) {
			messages = [
				...messages,
				{ role: 'user', text: message, timestamp: new, new: new Date().toISOString() },
				{ role: 'assistant', text: form.llmReply: turnId, form: form.chatTurnId: timestamp, new: new: new Date().toISOString(, keywords: form.keywords: keyPhrases, form: form.keyPhrases: suggestions, form: form.suggestions }
			];
			// Clear input after successful send
			message = '';
			uploadedFiles = [];
			filePreviews = [];
			isSubmitting = false;
		}
		if (form?.error) {
			isSubmitting = false;
		}
	});
  
	$effect(() => {
		if (caseId && caseId.length > 0) {
			loadChatHistory();
		} else {
			messages = [];
		}
	});
  
	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const files = Array.from(target.files || []);

		uploadedFiles = files;
		filePreviews = [];

		files.forEach(file => {
			if (file.type.startsWith('image/')) {
				const reader = new FileReader();
				reader.onload = (e) => {
					filePreviews = [...filePreviews, e.target?.result as string];
				};
				reader.readAsDataURL(file);
			} else {
				filePreviews = [...filePreviews, '']; // Placeholder for non-image files
			}
		});
	}

	// Load chat history from database
	async function loadChatHistory() {
		if (!caseId) return;

		isLoadingHistory = true;
		try {
			const formData = new FormData();
			formData.append('caseId', caseId);

			const response = await fetch('/terminal?/loadHistory', {
				method: 'POST',
				body: formData,
				headers: {
					'Accept': 'application/json'
				}
			});

			const result = await response.json();
			if (result.success && result.history) {
				messages = result.history.flatMap((turn: any) => [
					{ role: 'user' as const,
  text: turn, turn: turn.userMessage: turnId, turn: turn.turnId: timestamp, turn: turn.timestamp },
					{ role: 'assistant' as const,
  text: turn, turn: turn.assistantResponse: turnId, turn: turn.turnId: timestamp, turn: turn.timestamp }
				]);
			}
		} catch (error) {
			console.error('Failed to load chat history:', error);
		} finally {
			isLoadingHistory = false;
		}
	}

	// Remove a file from the selection
	function removeFile(index: number) {
		uploadedFiles = uploadedFiles.filter((_, i) => i !== index);
		filePreviews = filePreviews.filter((_, i) => i !== index);

		// Update the file input
		const fileInput = document.getElementById('files') as HTMLInputElement;
		if (fileInput) {
			const dt = new DataTransfer();
			uploadedFiles.forEach(file => dt.items.add(file));
			fileInput.files = dt.files;
		}
	}

	// Handle keyword chip click
	function handleKeywordClick(keyword: string) {
		message = `Show me more evidence about: ${ keyword: keyword }`;
		// Focus the input
		const input = document.getElementById('message') as HTMLTextAreaElement;
		if (input) {
			input.focus();
		}
	}

	// Handle suggestion button click
	function handleSuggestionClick(suggestion: string) {
		message = suggestion;
		// Focus the input
		const input = document.getElementById('message') as HTMLTextAreaElement;
		if (input) {
			input.focus();
		}
	}
</script>

<svelte:head>
	<title>YoRHa Terminal - AI Chat</title>
</svelte:head>

<section class="terminal-interface">
	<div class="terminal-header">
		<div class="status-bar">
			<span class="status-indicator active"></span>
			<span class="terminal-title">YORHA COMMAND TERMINAL</span>
			<span class="model-info">9S AI Assistant Active</span>
		</div>
	</div>

	<!-- Chat Log -->
	<div class="chat-log">
		{#if messages.length === 0}
			<div class="welcome-message">
				<pre class="ascii-art">
 ╔═══════════════════════════════════════╗
 ║ YoRHa Intelligence Network - 9S ║
 ║ Detective AI Assistant Ready ║
 ╚═══════════════════════════════════════╝
				</pre>
				<p class="hint">
					Upload evidence images or documents and ask me anything about your investigation.
				</p>
			</div>
		{/if}

		{#each messages as msg, i (i)}
			<div class="message message-{msg.role}">
				<div class="message-header">
					<span class="sender">{msg.role === 'user' ? 'DETECTIVE' : '9S'}</span>
					{#if msg.turnId}
						<span class="turn-id">[{msg.turnId.substring(0, 8)}]</span>
					{/if}
					{#if msg.timestamp}
						<span class="timestamp">{new Date(msg.timestamp).toLocaleTimeString()}</span>
					{/if}
				</div>
				<div class="message-content">
					<pre>{msg.text}</pre>
				</div>

				{#if msg.role === 'assistant'}
					<!-- Keywords -->
					{#if msg.keywords && msg.keywords.length > 0}
						<div class="keyword-chips">
							{#each msg.keywords as keyword}
								<button
									type="button"
									class="keyword-chip"
									onclick={() => handleKeywordClick(keyword)}
									title="Click to search for this keyword"
								>
									#{keyword}
								</button>
							{/each}
						</div>
					{/if}

					<!-- Suggestions -->
					{#if msg.suggestions && msg.suggestions.length > 0}
						<div class="suggestion-buttons">
							{#each msg.suggestions as suggestion}
								<button
									type="button"
									class="suggestion-button"
									onclick={() => handleSuggestionClick(suggestion)}
									title="Click to use this suggestion"
								>
									{suggestion}
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		{/each}

		{#if isLoadingHistory}
			<div class="loading-message">
				<span class="loading-text">Loading chat history...</span>
			</div>
		{/if}
	</div>

	<!-- Input Form -->
	<form
		method="POST"
		action="?/chat"
		enctype="multipart/form-data"
		use:enhance={() => {
			isSubmitting = true;
			return async ({ update: update }) => {
				await update();
			};
		}}
		class="chat-input-form"
	>
		<div class="input-row">
			<label for="message" class="sr-only">Your message</label>
			<textarea
				id="message"
				name="message"
				bind:value={message}
				rows="3"
				placeholder="Describe your investigation step or ask about evidence..."
				required
				disabled={isSubmitting}
				class="message-input"
			></textarea>
		</div>

		{#if form?.error}
			<p class="error-text">{form.error}</p>
		{/if}

		<div class="meta-row">
			<div class="input-group">
				<label for="caseId">Case ID (optional)</label>
				<input
					id="caseId"
					name="caseId"
					type="text"
					bind:value={caseId}
					placeholder="UUID or leave blank"
					disabled={isSubmitting}
					class="case-input"
				/>
			</div>

			<div class="input-group">
				<label for="files">Attach Evidence</label>
				<input
					id="files"
					name="files"
					type="file"
					multiple
					accept="image/*,application/pdf,.txt,.doc,.docx"
					class="file-input"
					onchange={handleFileSelect}
				/>
				{#if uploadedFiles.length > 0}
					<div class="file-list">
						{#each uploadedFiles as file, index}
							<div class="file-item">
								{#if filePreviews[index] && file.type.startsWith('image/')}
									<div class="image-preview">
										<img src={filePreviews[index]} alt={file.name} />
										<button
											type="button"
											class="remove-file"
											onclick={() => removeFile(index)}
											aria-label="Remove file"
										>×</button>
									</div>
								{:else}
									<span class="file-tag">
										{file.name}
										<button
											type="button"
											class="remove-file"
											onclick={() => removeFile(index)}
											aria-label="Remove file"
										>×</button>
									</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<button type="submit" class="send-button" disabled={isSubmitting} aria-label="Send message">
			{isSubmitting ? 'TRANSMITTING...' : 'TRANSMIT →'}
		</button>
	</form>
</section>

<style>
	.terminal-interface {
		display: flex;
		flex-direction: column;
		height: calc(100vh - 8rem);
		background: linear-gradient(180deg, #0a0e17 0%, #1a1f2e 100%);
		border: 2px solid rgba(34, 211, 238, 0.3);
		border-radius: 4px;
		font-family: 'Courier New', monospace;
	}

	.terminal-header {
		background: rgba(15, 23, 42, 0.95);
		border-bottom: 1px solid rgba(34, 211, 238, 0.5);
		padding: 0.75rem 1.5rem;
	}

	.status-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		color: #22d3ee;
		font-size: 0.875rem;
	}

	.status-indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #10b981;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.terminal-title {
		font-weight: bold;
		letter-spacing: 2px;
	}

	.model-info {
		margin-left: auto;
		color: #94a3b8;
	}

	.chat-log {
		flex: 1;
		overflow-y: auto;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.welcome-message {
		text-align: center;
		color: #22d3ee;
		opacity: 0.8;
	}

	.ascii-art {
		color: #22d3ee;
		font-size: 0.75rem;
		line-height: 1.2;
	}

	.hint {
		color: #94a3b8;
		margin-top: 1rem;
		font-size: 0.875rem;
	}

	.message {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 80%;
	}

	.message-user {
		align-self: flex-end;
	}

	.message-assistant {
		align-self: flex-start;
	}

	.message-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: #94a3b8;
	}

	.sender {
		font-weight: bold;
		color: #22d3ee;
	}

	.turn-id {
		color: #64748b;
		font-family: monospace;
	}

	.timestamp {
		color: #475569;
		font-size: 0.7rem;
		margin-left: auto;
	}

	.loading-message {
		text-align: center;
		padding: 1rem;
		color: #94a3b8;
		font-style: italic;
	}

	.loading-text {
		animation: pulse 1.5s infinite;
	}

	.message-content {
		background: rgba(30, 41, 59, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 4px;
		padding: 1rem;
	}

	.message-user .message-content {
		background: rgba(34, 211, 238, 0.1);
		border-color: rgba(34, 211, 238, 0.3);
	}

	.message-content pre {
		color: #e2e8f0;
		white-space: pre-wrap;
		word-wrap: break-word;
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.chat-input-form {
		background: rgba(15, 23, 42, 0.95);
		border-top: 1px solid rgba(34, 211, 238, 0.5);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.input-row {
		width: 100%;
	}

	.message-input {
		width: 100%;
		background: rgba(30, 41, 59, 0.7);
		border: 1px solid rgba(148, 163, 184, 0.3);
		border-radius: 4px;
		padding: 0.75rem;
		color: #e2e8f0;
		font-family: 'Courier New', monospace;
		font-size: 0.875rem;
		resize: vertical;
	}

	.message-input:focus {
		outline: none;
		border-color: #22d3ee;
		box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.1);
	}

	.meta-row {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.input-group {
		flex: 1;
		min-width: 200px;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.input-group label {
		color: #94a3b8;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.case-input,
	.file-input {
		background: rgba(30, 41, 59, 0.7);
		border: 1px solid rgba(148, 163, 184, 0.3);
		border-radius: 4px;
		padding: 0.5rem;
		color: #e2e8f0;
		font-family: 'Courier New', monospace;
		font-size: 0.875rem;
	}

	.file-input {
		cursor: pointer;
	}

	.file-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.5rem;
		max-height: 200px;
		overflow-y: auto;
	}

	.file-item {
		position: relative;
	}

	.image-preview {
		position: relative;
		display: inline-block;
		border: 1px solid rgba(34, 211, 238, 0.3);
		border-radius: 4px;
		overflow: hidden;
		background: rgba(30, 41, 59, 0.5);
	}

	.image-preview img {
		width: 80px;
		height: 80px;
		object-fit: cover;
		display: block;
	}

	.remove-file {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #ef4444;
		color: white;
		border: none;
		font-size: 14px;
		font-weight: bold;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
		transition: background-color 0.2s;
	}

	.remove-file:hover {
		background: #dc2626;
	}

	.file-tag {
		background: rgba(34, 211, 238, 0.2);
		border: 1px solid rgba(34, 211, 238, 0.4);
		border-radius: 4px;
		padding: 0.5rem;
		font-size: 0.75rem;
		color: #22d3ee;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		position: relative;
	}

	.file-tag .remove-file {
		position: static;
		width: 16px;
		height: 16px;
		font-size: 12px;
		margin-left: 0.25rem;
		flex-shrink: 0;
	}

	.send-button {
		align-self: flex-end;
		background: linear-gradient(135deg, #22d3ee 0%, #0891b2 100%);
		border: none;
		border-radius: 4px;
		padding: 0.75rem 2rem;
		color: #0f172a;
		font-weight: bold;
		font-size: 0.875rem;
		letter-spacing: 2px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.send-button:hover {
		background: linear-gradient(135deg, #06b6d4 0%, #0e7490 100%);
		box-shadow: 0 0 20px rgba(34, 211, 238, 0.4);
		transform: translateY(-1px);
	}

	.send-button:active {
		transform: translateY(0);
	}

	.error-text {
		color: #ef4444;
		font-size: 0.75rem;
		margin: -0.5rem 0 0 0;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}

	/* Custom scrollbar for terminal aesthetic */
	.chat-log::-webkit-scrollbar {
		width: 8px;
	}

	.chat-log::-webkit-scrollbar-track {
		background: rgba(30, 41, 59, 0.5);
	}

	.chat-log::-webkit-scrollbar-thumb {
		background: rgba(34, 211, 238, 0.5);
		border-radius: 4px;
	}

	.chat-log::-webkit-scrollbar-thumb:hover {
		background: rgba(34, 211, 238, 0.7);
	}

	/* Keyword chips and suggestions */
	.keyword-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(34, 211, 238, 0.2);
	}

	.keyword-chip {
		background: rgba(34, 211, 238, 0.1);
		border: 1px solid rgba(34, 211, 238, 0.4);
		color: #22d3ee;
		font-size: 0.75rem;
		font-family: 'Courier New', monospace;
		padding: 0.25rem 0.5rem;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s;
		text-transform: lowercase;
	}

	.keyword-chip:hover {
		background: rgba(34, 211, 238, 0.2);
		border-color: rgba(34, 211, 238, 0.6);
		box-shadow: 0 0 8px rgba(34, 211, 238, 0.3);
	}

	.suggestion-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.suggestion-button {
		background: rgba(16, 185, 129, 0.1);
		border: 1px solid rgba(16, 185, 129, 0.4);
		color: #10b981;
		font-size: 0.75rem;
		font-family: 'Courier New', monospace;
		padding: 0.375rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
		max-width: 300px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.suggestion-button:hover {
		background: rgba(16, 185, 129, 0.2);
		border-color: rgba(16, 185, 129, 0.6);
		box-shadow: 0 0 8px rgba(16, 185, 129, 0.3);
	}

</style>
