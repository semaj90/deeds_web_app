<script lang="ts">
	import { page } from '$app/state';

	let id = $derived(page.params.id);
	let messages = $state<any[]>([]);
	let input = $state('');
	let loading = $state(false);

	const quickActions = [
		{ label: 'Summarize Case', prompt: 'Summarize this case so far' },
		{ label: 'Suggest Charges', prompt: 'What charges should be filed based on the evidence?' },
		{ label: 'Find Weaknesses', prompt: 'What are the weaknesses in the current evidence?' },
		{ label: 'Draft Probable Cause', prompt: 'Draft a probable cause statement' }
	];

	async function sendMessage(prompt?: string) {
		const messageText = prompt || input;
		if (!messageText.trim()) return;

		messages = [...messages, { role: 'user', content: messageText }];
		input = '';
		loading = true;

		try {
			const params = new URLSearchParams({ q: messageText, mode: 'ollama' });
			if (id) params.set('caseId', id);

			const res = await fetch(`/api/chat/stream?${params}`);
			if (!res.ok || !res.body) throw new Error('Stream failed');

			messages = [...messages, { role: 'assistant', content: '' }];
			const assistantIdx = messages.length - 1;

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let assistantContent = '';
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					try {
						const data = JSON.parse(line.slice(6));
						if (data.type === 'token' && data.content) {
							assistantContent += data.content;
							messages[assistantIdx] = { role: 'assistant', content: assistantContent };
							messages = messages;
						}
					} catch {
						/* skip malformed SSE */
					}
				}
			}

			if (!assistantContent) {
				messages[assistantIdx] = { role: 'assistant', content: 'No response received.' };
				messages = messages;
			}
		} catch (err) {
			console.error('Failed to send message:', err);
			messages = [
				...messages,
				{
					role: 'assistant',
					content: 'Error: Failed to get response. Is the AI server running?'
				}
			];
		} finally {
			loading = false;
		}
	}
</script>

<div class="ai-tab">
	<div class="ai-header">
		<h2>AI Legal Assistant</h2>
	</div>

	<div class="quick-actions">
		{#each quickActions as action}
			<button onclick={() => sendMessage(action.prompt)}>
				{action.label}
			</button>
		{/each}
	</div>

	<div class="messages">
		{#each messages as message}
			<div class="message {message.role}">
				<div class="content">{message.content}</div>
			</div>
		{/each}
		{#if loading}
			<div class="message assistant">
				<div class="typing">Thinking...</div>
			</div>
		{/if}
	</div>

	<div class="input-area">
		<input
			type="text"
			bind:value={input}
			placeholder="Ask the AI assistant..."
			onkeydown={(e) => e.key === 'Enter' && sendMessage()}
			disabled={loading}
		/>
		<button onclick={() => sendMessage()} disabled={loading || !input.trim()}> Send </button>
	</div>
</div>

<style>
	.ai-tab {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.ai-header {
		padding: 1rem;
		border-bottom: 1px solid var(--sand-dark, #3a3a3a);
	}

	.ai-header h2 {
		margin: 0;
	}

	.quick-actions {
		display: flex;
		gap: 0.5rem;
		padding: 1rem;
		border-bottom: 1px solid var(--sand-dark, #3a3a3a);
		overflow-x: auto;
	}

	.quick-actions button {
		padding: 0.5rem 1rem;
		white-space: nowrap;
		border: 1px solid var(--sand-dark, #3a3a3a);
		border-radius: 4px;
		background: var(--panel-soft, #1a1a1a);
		color: inherit;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.quick-actions button:hover {
		background: var(--accent-soft, #2a2a2a);
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.message {
		display: flex;
		gap: 0.5rem;
	}

	.message.user {
		justify-content: flex-end;
	}

	.message.user .content {
		background: var(--accent, #3b82f6);
		color: white;
		padding: 0.75rem;
		border-radius: 4px;
		max-width: 80%;
	}

	.message.assistant .content {
		background: var(--panel-soft, #1a1a1a);
		padding: 0.75rem;
		border-radius: 4px;
		max-width: 80%;
	}

	.input-area {
		display: flex;
		gap: 0.5rem;
		padding: 1rem;
		border-top: 1px solid var(--sand-dark, #3a3a3a);
	}

	.input-area input {
		flex: 1;
		padding: 0.5rem;
		border: 1px solid var(--sand-dark, #3a3a3a);
		border-radius: 4px;
		background: var(--panel, #111);
		color: inherit;
	}

	.input-area button {
		padding: 0.5rem 1rem;
		background: var(--accent, #3b82f6);
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.input-area button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.typing {
		opacity: 0.6;
		font-style: italic;
	}
</style>
