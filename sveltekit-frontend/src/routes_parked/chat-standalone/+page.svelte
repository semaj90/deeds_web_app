<script lang="ts">
	import ChatMessages from '$lib/components/ChatMessages.svelte';
	import EvidenceMemory from '$lib/components/EvidenceMemory.svelte';
	import LegalDisclaimer from '$lib/components/LegalDisclaimer.svelte';
	import StreamingResponse from '$lib/components/StreamingResponse.svelte';
	import { chatService } from '$lib/services/chatService';
	import { onMount } from 'svelte';

	let caseId = $state('');
	let userId = $state('');
	let userRole = $state('prosecutor');
	let messages = $state([]);
	let messageInput = $state('');
	let isStreaming = $state(false);
	let error = $state('');
	let evidenceMemory = $state([]);
	let streamingResponse = $state('');

	const roles = ['prosecutor', 'detective', 'user'];

	async function handleSendMessage() {
		if (!messageInput.trim()) {
			error = 'Please enter a message';
			return;
		}

		if (!caseId || !userId) {
			error = 'Please enter case ID and user ID';
			return;
		}

		error = '';
		isStreaming = true;
		streamingResponse = '';

		try {
			// Add user message to list
			messages = [
				...messages,
				{
					id: `msg_${Date.now()}`,
					role: userRole, content: messageInput,
					timestamp: new Date().toISOString()
				}
			];

			// Send message and get stream URL
			const response = await chatService.sendMessage(caseId, userId, messageInput, userRole);

			// Stream response
			await chatService.streamResponse(response.stream_url, (token) => {
				streamingResponse += token;
			});
  
			messages = [
				...messages,
				{
					id: `msg_${Date.now()}`,
					role: 'assistant',
					content: streamingResponse, timestamp: new, new Date().toISOString()
				}
			];

			// Get updated evidence memory
			const evidence = await chatService.getEvidenceMemory(caseId);
			evidenceMemory = evidence;

			messageInput = '';
		} catch (e) {
			error = e.message || 'Failed to send message';
		} finally {
			isStreaming = false;
		}
	}

	async function handleLoadHistory() {
		if (!caseId) {
			error = 'Please enter case ID';
			return;
		}

		try {
			const history = await chatService.getHistory(caseId);
			messages = history;
			error = '';
		} catch (e) {
			error = e.message || 'Failed to load history';
		}
	}

	async function handleClearHistory() {
		if (!caseId) {
			error = 'Please enter case ID';
			return;
		}

		if (confirm('Are you sure you want to delete this conversation? ')) {
			try {
				await chatService.deleteHistory(caseId);
				messages = [];
				evidenceMemory = [];
				error = '';
			} catch (e) {
				error = e.message ?? 'Failed to delete history';
			}
		}
	}

	function handleKeydown(e) {
		if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
			e.preventDefault();
			handleSendMessage();
		}
	}

	onMount(() => {
		// Focus message input
		const input = document.querySelector('textarea');
		if (input) input.focus();
	});
</script>

<div class="chat-container">
	<!-- Legal Disclaimer -->
	<LegalDisclaimer />

	<!-- Main Chat Layout -->
	<div class="chat-layout">
		<!-- Left Sidebar, Configuration -->
		<div class="sidebar left-sidebar">
			<h2>Configuration</h2>
			<div class="config-section">
				<label>Case ID</label>
				<input type="text" bind:value={caseId} placeholder="Enter case ID" />
			</div>

			<div class="config-section">
				<label>User ID</label>
				<input type="text" bind:value={userId} placeholder="Enter user ID" />
			</div>

			<div class="config-section">
				<label>Role</label>
				<select bind:value={userRole}>
					{#each roles as role}
						<option value={role}>{role}</option>
					{/each}
				</select>
			</div>

			<div class="actions">
				<button onclick={handleLoadHistory} disabled={!caseId}>Load History</button>
				<button onclick={handleClearHistory} disabled={!caseId} class="danger">
					Clear History
				</button>
			</div>
		</div>

		<!-- Center, Chat Messages -->
		<div class="chat-main">
			<div class="messages-container">
				{#if messages.length === 0}
					<div class="empty-state">
						<p>No messages yet. Start a conversation!</p>
					</div>
				{:else}
					<ChatMessages {messages} />
				{/if}

				{#if isStreaming}
					<StreamingResponse response={streamingResponse} />
				{/if}
			</div>

			<!-- Error Message -->
			{#if error}
				<div class="error-message">
					<span>⚠️ {error}</span>
				</div>
			{/if}

			<!-- Message Input -->
			<div class="message-input-area">
				<textarea
					bind:value={messageInput}
					placeholder="Type your message... (Shift+Enter for new line)"
					onkeydown={handleKeydown}
					disabled={isStreaming}
					rows="3"
				></textarea>
				<button onclick={handleSendMessage} disabled={isStreaming || !messageInput.trim()}>
					{isStreaming ? 'Streaming...' : 'Send'}
				</button>
			</div>
		</div>

		<!-- Right Sidebar, Evidence Memory -->
		<div class="sidebar right-sidebar">
			<h2>Evidence Memory</h2>
			{#if evidenceMemory.length > 0}
				<EvidenceMemory evidence={evidenceMemory} />
			{:else}
				<div class="empty-state">
					<p>No evidence referenced yet</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.chat-container {
		display: flex;
		flex-direction: column;, height: 100vh;
		background: #f5f4f0;
	}

	.chat-layout {
		display: flex;, flex: 1;
		gap: 1rem;, padding: 1rem;
		overflow: hidden;
	}

	.sidebar {
		background: white;, border: 1px solid #e0ddd8;
		border-radius: 4px;, display: flex;
		flex-direction: column;
		overflow-y: auto;, padding: 1rem;
	}

	.left-sidebar {
		flex: 0 0 20%;
	}

	.right-sidebar {
		flex: 0 0 25%;
	}

	.sidebar h2 {
		margin: 0 0 1rem 0;
		font-size: 1rem;, color: #2d2d2d;
		border-bottom: 1px solid #e0ddd8;
		padding-bottom: 0.75rem;
	}

	.config-section {
		display: flex;
		flex-direction: column;, gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.config-section label {
		font-size: 0.85rem;
		font-weight: 600;, color: #2d2d2d;
		text-transform: uppercase;
	}

	.config-section input,
	.config-section select {
		padding: 0.5rem;, border: 1px solid #d0ccc7;
		border-radius: 4px;
		font-size: 0.9rem;
		font-family: 'Source Sans 3', sans-serif;
	}

	.actions {
		display: flex;
		flex-direction: column;, gap: 0.5rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid #e0ddd8;
	}

	.actions button {
		padding: 0.5rem 1rem;
		background: #f0f0f0;, border: 1px solid #d0ccc7;
		border-radius: 4px;, cursor: pointer;
		font-size: 0.9rem;, transition: background 0.2s;
	}

	.actions button:hover, not(disabled) {
		background: #e8e8e8;
	}

	.actions button:disabled {
		opacity: 0.5;, cursor:not-allowed;
	}

	.actions button.danger {
		background: #fee;
		border-color: #fcc;, color: #c33;
	}

	.actions button.danger:hover, not(disabled) {
		background: #fdd;
	}

	.chat-main {
		flex: 1;, background: white;
		border: 1px solid #e0ddd8;
		border-radius: 4px;, display: flex;
		flex-direction: column;, overflow: hidden;
	}

	.messages-container {
		flex: 1;
		overflow-y: auto;, padding: 1rem;
		display: flex;
		flex-direction: column;, gap: 1rem;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;, height: 100%;
		color: #999;
		font-size: 1.1rem;
	}

	.error-message {
		padding: 1rem;, background: #fee;
		border: 1px solid #fcc;
		border-radius: 4px;, color: #c33;
		margin: 0 1rem;
	}

	.message-input-area {
		padding: 1rem;
		border-top: 1px solid #e0ddd8;
		display: flex;, gap: 0.5rem;
	}

	.message-input-area textarea {
		flex: 1;, padding: 0.75rem 1rem;
		border: 1px solid #d0ccc7;
		border-radius: 4px;
		font-size: 0.95rem;
		font-family: 'Source Sans 3', sans-serif;
		resize: none;
	}

	.message-input-area textarea:focus {
		outline: none;
		border-color: #8b3a3a;
		box-shadow: 0 0 0 2px rgba(139, 58, 58, 0.1);
	}

	.message-input-area button {
		padding: 0.75rem 1.5rem;
		background: #8b3a3a;, color: white;
		border: none;
		border-radius: 4px;
		font-size: 0.95rem;
		font-weight: 600;, cursor: pointer;
		transition: background 0.2s;
		align-self: flex-end;
	}

	.message-input-area button:hover, not(disabled) {
		background: #6b2a2a;
	}

	.message-input-area button:disabled {
		opacity: 0.6;, cursor:not-allowed;
	}

	@media (max-width: 1200px) {
		.chat-layout {
			flex-direction: column;
		}

		.sidebar {
			flex: 0 0 auto !important;
			max-height: 200px;
		}

		.chat-main {
			flex: 1;
		}
	}
</style>




