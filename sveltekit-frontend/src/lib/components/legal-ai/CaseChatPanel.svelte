<script lang="ts">
	import { untrack } from 'svelte';
	import { ChatSession, type ChatMessage, type GlossaryMatch } from '$lib/models/ChatSession.svelte.js';
	import { onDestroy } from 'svelte';

	interface Props {
		caseId?: string;
	}

	let { caseId }: Props = $props();

	function createSession(id?: string) {
		return new ChatSession(id ? `case-${id}` : `chat-${Date.now()}`, [
			{
				role: 'system',
				content:
					'This assistant cannot determine guilt or innocence. Verify all outputs against official sources (.gov, DA/AG).',
				timestamp: new Date().toISOString()
			},
			{
				role: 'assistant',
				content:
					'Hello. I am your Legal AI Assistant. How can I help you with this case?',
				timestamp: new Date().toISOString()
			}
		], !!id);
	}

	// Create a ChatSession keyed by caseId (or a generic session)
	// $effect below handles re-creation when caseId changes
	let session = $state<ChatSession>(untrack(() => createSession(caseId)));

	// Recreate session if caseId changes
	$effect(() => {
		if (caseId) {
			const newId = `case-${caseId}`;
			if (session.chatId !== newId) {
				session.destroy();
				savingGlossaryKeys = {};
				savedGlossaryKeys = {};
				glossaryActionErrors = {};
				session = new ChatSession(newId, [
					{
						role: 'system',
						content:
							'This assistant cannot determine guilt or innocence. Verify all outputs against official sources (.gov, DA/AG).',
						timestamp: new Date().toISOString()
					},
					{
						role: 'assistant',
						content:
							'Hello. I am your Legal AI Assistant. How can I help you with this case?',
						timestamp: new Date().toISOString()
					}
				], true);
			}
		}
	});

	// Try loading persisted history from IndexedDB on mount
	$effect(() => {
		session.loadHistory();
	});

	onDestroy(() => {
		session.destroy();
	});

	let inputValue = $state('');
	let pendingAttachment = $state<File | null>(null);
	let messagesContainer: HTMLElement;
	let savingGlossaryKeys = $state<Record<string, boolean>>({});
	let savedGlossaryKeys = $state<Record<string, boolean>>({});
	let glossaryActionErrors = $state<Record<string, string>>({});

	let isLoading = $derived(
		session.status === 'thinking' || session.status === 'streaming'
	);

	function scrollToBottom() {
		if (messagesContainer) {
			setTimeout(() => {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}, 0);
		}
	}

	// Auto-scroll when messages change
	$effect(() => {
		if (session.messages.length > 0) {
			scrollToBottom();
		}
	});

	async function sendMessage() {
		if ((!inputValue.trim() && !pendingAttachment) || isLoading) return;

		const content = inputValue.trim() || (pendingAttachment
			? `Please analyze the attached document "${pendingAttachment.name}".`
			: '');
		const attachment = pendingAttachment;
		inputValue = '';
		pendingAttachment = null;

		await session.sendMessage(content, {
			attachment,
			forceServer: !!attachment
		});
		scrollToBottom();
	}

	function handleAttachmentChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		pendingAttachment = target.files?.[0] ?? null;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function formatTime(timestamp?: string): string {
		if (!timestamp) return '';
		return new Date(timestamp).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function glossaryKey(match: GlossaryMatch): string {
		return [match.term, match.source, match.citation ?? '', match.sourceNodeId ?? '']
			.join('::')
			.toLowerCase();
	}

	async function saveGlossaryMatch(match: GlossaryMatch) {
		if (!caseId) return;

		const key = glossaryKey(match);
		if (savingGlossaryKeys[key] || savedGlossaryKeys[key]) return;

		savingGlossaryKeys = { ...savingGlossaryKeys, [key]: true };
		glossaryActionErrors = { ...glossaryActionErrors, [key]: '' };

		try {
			await session.saveGlossaryConcept(match);
			savedGlossaryKeys = { ...savedGlossaryKeys, [key]: true };
		} catch (error) {
			glossaryActionErrors = {
				...glossaryActionErrors,
				[key]: error instanceof Error ? error.message : 'Failed to save concept'
			};
		} finally {
			savingGlossaryKeys = { ...savingGlossaryKeys, [key]: false };
		}
	}

	function getContextDocIds(message: ChatMessage): string[] {
		const metadata = message.metadata;
		if (!metadata) return [];

		if (metadata.contextDocIds && metadata.contextDocIds.length > 0) {
			return metadata.contextDocIds;
		}

		return (metadata.citations ?? []).filter((citation) => citation.includes(':'));
	}

	function summarizeContextCollections(docIds: string[]): Array<{ label: string; count: number }> {
		const counts = new Map<string, number>();

		for (const docId of docIds) {
			const [collection] = docId.split(':');
			counts.set(collection, (counts.get(collection) ?? 0) + 1);
		}

		const labels: Record<string, string> = {
			evidence_vectors: 'Uploaded Evidence',
			case_chunks: 'Reports / Case Files',
			law_sections: 'Law & Statutes',
			legal_documents: 'ACE Context Docs'
		};

		return Array.from(counts.entries()).map(([collection, count]) => ({
			label: labels[collection] ?? 'Related Records',
			count
		}));
	}

	function formatContextDocId(docId: string): string {
		const [collection, rawId = 'unknown'] = docId.split(':');
		const shortId = rawId.length > 18 ? `${rawId.slice(0, 8)}...${rawId.slice(-4)}` : rawId;

		switch (collection) {
			case 'evidence_vectors':
				return `Evidence ${shortId}`;
			case 'case_chunks':
				return `Report ${shortId}`;
			case 'law_sections':
				return `Law ${shortId}`;
			case 'legal_documents':
				return `ACE Doc ${shortId}`;
			default:
				return docId;
		}
	}

	function formatRelevanceSummary(message: ChatMessage): string | null {
		const factors = message.metadata?.confidenceFactors;
		if (!factors) return null;

		const parts = [factors.caseContext ? 'Case-linked' : 'General context'];
		parts.push(`RAG hits: ${factors.ragHits}`);

		if (factors.topScore !== null) {
			parts.push(`Top match: ${factors.topScore.toFixed(2)}`);
		}

		return parts.join(' · ');
	}

	function displayRole(role: string): string {
		if (role === 'user') return 'Prosecutor';
		if (role === 'assistant') return 'AI Legal Assistant';
		return 'System';
	}

	function clearChat() {
		session.destroy();
		savingGlossaryKeys = {};
		savedGlossaryKeys = {};
		glossaryActionErrors = {};
		session = new ChatSession(
			caseId ? `case-${caseId}` : `chat-${Date.now()}`,
			[
				{
					role: 'system',
					content:
						'This assistant cannot determine guilt or innocence. Verify all outputs against official sources (.gov, DA/AG).',
					timestamp: new Date().toISOString()
				},
				{
					role: 'assistant',
					content:
						'Hello. I am your Legal AI Assistant. How can I help you with this case?',
					timestamp: new Date().toISOString()
				}
			],
			!!caseId
		);
	}
</script>

<div class="case-chat-panel" data-testid="case-chat-panel">
	<!-- Header -->
	<div class="chat-header">
		<div class="chat-header-copy">
			<h3 class="chat-title">Case Analysis Chat</h3>
			{#if caseId}
				<div class="case-session-meta" data-testid="case-chat-case-id">Case ID: {caseId}</div>
			{/if}
		</div>
		<div class="header-actions">
			<button class="header-btn" title="Clear chat" onclick={clearChat}>
				🗑️
			</button>
			{#if session.error}
				<span class="error-badge" title={session.error}>⚠️</span>
			{/if}
		</div>
	</div>

	<!-- Disclaimer -->
	<div class="disclaimer-banner">
		<span class="disclaimer-icon">⚠️</span>
		<span class="disclaimer-text">
			This assistant cannot determine guilt or innocence. Verify all outputs
			against official sources (.gov, DA/AG).
		</span>
	</div>

	<!-- Messages -->
	<div class="messages-container" bind:this={messagesContainer}>
		{#each session.messages as message, i (i)}
			{@const contextDocIds = getContextDocIds(message)}
			{@const contextCollections = summarizeContextCollections(contextDocIds)}
			{@const relevanceSummary = formatRelevanceSummary(message)}
			<div
				class="message"
				class:system={message.role === 'system'}
				class:prosecutor={message.role === 'user'}
				class:ai={message.role === 'assistant'}
				data-testid="case-chat-message"
				data-role={message.role}
			>
				<div class="message-header">
					<span class="message-role">
						{#if message.role === 'user'}
							👨‍⚖️ {displayRole(message.role)}
						{:else if message.role === 'assistant'}
							🤖 {displayRole(message.role)}
						{:else}
							⚙️ {displayRole(message.role)}
						{/if}
					</span>
					<span class="message-time">{formatTime(message.timestamp)}</span>
				</div>
				<div class="message-content">
					{message.content}
					{#if message.role === 'assistant' && message.metadata?.glossaryMatches && message.metadata.glossaryMatches.length > 0}
						<div class="glossary-panel" data-testid="case-chat-glossary-matches">
							<div class="glossary-header">
								<span>Legal Definitions Used</span>
								{#if caseId}
									<span class="glossary-header-note">Save to case context</span>
								{/if}
							</div>
							<div class="glossary-list">
								{#each message.metadata.glossaryMatches as match}
									{@const matchKey = glossaryKey(match)}
									<div class="glossary-card">
										<div class="glossary-card-top">
											<div>
												<div class="glossary-term">{match.term}</div>
												<div class="glossary-definition">{match.definition}</div>
											</div>
											{#if caseId}
												<button
													type="button"
													class:saved={savedGlossaryKeys[matchKey]}
													class="glossary-save-btn"
													onclick={() => saveGlossaryMatch(match)}
													disabled={savingGlossaryKeys[matchKey] || savedGlossaryKeys[matchKey]}
												>
													{#if savedGlossaryKeys[matchKey]}
														Saved
													{:else if savingGlossaryKeys[matchKey]}
														Saving...
													{:else}
														Save
													{/if}
												</button>
											{/if}
										</div>
										<div class="glossary-meta-row">
											<span class="glossary-chip">{match.source}</span>
											{#if match.jurisdiction}
												<span class="glossary-chip">{match.jurisdiction}</span>
											{/if}
											{#if match.citation}
												<span class="glossary-chip">{match.citation}</span>
											{/if}
											{#if match.confidence !== undefined && match.confidence !== null}
												<span class="glossary-chip">{Math.round(match.confidence * 100)}%</span>
											{/if}
										</div>
										{#if glossaryActionErrors[matchKey]}
											<div class="glossary-error">{glossaryActionErrors[matchKey]}</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
					{#if message.metadata?.citations && message.metadata.citations.length > 0}
						<div class="context-badge">
							📚 {message.metadata.citations.length} source{message.metadata
								.citations.length === 1
								? ''
								: 's'} referenced
						</div>
					{/if}
					{#if message.metadata?.confidence !== undefined}
						<div class="confidence-badge">
							Confidence: {(message.metadata.confidence * 100).toFixed(0)}%
						</div>
					{/if}
					{#if message.role === 'assistant' && (relevanceSummary || contextCollections.length > 0 || contextDocIds.length > 0 || (message.metadata?.extractedCitations?.length ?? 0) > 0)}
						<div class="case-context-panel" data-testid="case-response-context">
							{#if caseId}
								<div class="case-context-row" data-testid="case-response-case-id">Case ID: {caseId}</div>
							{/if}
							{#if relevanceSummary}
								<div class="case-context-row" data-testid="case-relevance">{relevanceSummary}</div>
							{/if}
							{#if contextCollections.length > 0}
								<div class="case-context-chip-row" data-testid="case-context-collections">
									{#each contextCollections as collection}
										<span class="case-context-chip" data-testid="case-context-collection">
											{collection.label}: {collection.count}
										</span>
									{/each}
								</div>
							{/if}
							{#if contextDocIds.length > 0}
								<div class="case-context-chip-row" data-testid="case-context-docids">
									{#each contextDocIds as docId}
										<span class="case-context-chip case-context-chip-muted">
											{formatContextDocId(docId)}
										</span>
									{/each}
								</div>
							{/if}
							{#if message.metadata?.extractedCitations && message.metadata.extractedCitations.length > 0}
								<div class="case-context-chip-row" data-testid="case-extracted-citations">
									{#each message.metadata.extractedCitations as citation}
										<span class="case-context-chip case-context-chip-source">
											[Source {citation.sourceNum}] {formatContextDocId(citation.documentId)} ({citation.similarity.toFixed(2)})
										</span>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/each}

		{#if isLoading}
			<div class="message loading ai">
				<div class="message-header">
					<span class="message-role">🤖 AI Legal Assistant</span>
				</div>
				<div class="message-content">
					{#if session.status === 'streaming'}
						<span class="streaming-text">Generating response...</span>
					{:else}
						<div class="typing-indicator">
							<span></span>
							<span></span>
							<span></span>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Input -->
	<div class="chat-input-area">
		<div class="chat-toolbar">
			<label class="attach-btn" aria-label="Attach file">
				📎
				<input type="file" class="hidden-file-input" onchange={handleAttachmentChange} />
			</label>
			{#if pendingAttachment}
				<span class="attachment-pill">{pendingAttachment.name}</span>
			{/if}
		</div>
		<textarea
			bind:value={inputValue}
			onkeydown={handleKeydown}
			placeholder="Ask a legal question about this case..."
			class="chat-input"
			disabled={isLoading}
			data-testid="case-chat-input"
		></textarea>
		<button
			class="send-btn"
			onclick={sendMessage}
			disabled={isLoading || (!inputValue.trim() && !pendingAttachment)}
			data-testid="case-chat-send"
		>
			{#if isLoading}
				⏳
			{:else}
				📤
			{/if}
		</button>
	</div>
</div>

<style>
	.case-chat-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background-color: white;
		border: 2px solid #d4a574;
		border-radius: 6px;
		overflow: hidden;
	}

	.chat-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background-color: #f5f1e8;
		border-bottom: 2px solid #d4a574;
	}

	.chat-header-copy {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.chat-title {
		font-family: 'Crimson Text', Georgia, serif;
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0;
		color: #2c2c2c;
	}

	.case-session-meta {
		font-size: 0.8rem;
		color: #6b7280;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.header-btn {
		background: none;
		border: none;
		font-size: 1.1rem;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.header-btn:hover {
		background-color: #e0d5c7;
	}

	.error-badge {
		font-size: 1rem;
	}

	.disclaimer-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background-color: #fff3cd;
		border-bottom: 1px solid #ffc107;
		font-size: 0.85rem;
		color: #856404;
	}

	.disclaimer-icon {
		font-size: 1rem;
		flex-shrink: 0;
	}

	.disclaimer-text {
		line-height: 1.4;
	}

	.messages-container {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.message {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		animation: slideIn 0.3s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.message.system {
		background-color: #f0ebe0;
		padding: 0.75rem;
		border-radius: 4px;
		border-left: 3px solid #ffc107;
	}

	.message-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.8rem;
	}

	.message-role {
		font-weight: 600;
		color: #2c2c2c;
	}

	.message-time {
		color: #999;
		font-size: 0.75rem;
	}

	.message-content {
		font-size: 0.95rem;
		line-height: 1.5;
		color: #333;
		padding: 0.75rem;
		background-color: #f9f7f4;
		border-radius: 4px;
		border-left: 3px solid #d4a574;
		white-space: pre-wrap;
	}

	.message.prosecutor .message-content {
		background-color: #e8f4f8;
		border-left-color: #0066cc;
	}

	.message.ai .message-content {
		background-color: #f0ebe0;
		border-left-color: #8b4513;
	}

	.context-badge {
		margin-top: 0.5rem;
		font-size: 0.8rem;
		color: #6b7280;
		padding: 0.25rem 0.5rem;
		background: rgba(139, 69, 19, 0.08);
		border-radius: 3px;
		display: inline-block;
	}

	.confidence-badge {
		margin-top: 0.25rem;
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.case-context-panel {
		margin-top: 0.75rem;
		padding: 0.75rem;
		background: rgba(139, 69, 19, 0.06);
		border: 1px solid rgba(139, 69, 19, 0.14);
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.case-context-row {
		font-size: 0.78rem;
		color: #5b4636;
	}

	.case-context-chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.case-context-chip {
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.5rem;
		border-radius: 999px;
		font-size: 0.72rem;
		background: rgba(139, 69, 19, 0.12);
		color: #5b4636;
	}

	.case-context-chip-muted {
		background: rgba(107, 114, 128, 0.12);
		color: #4b5563;
	}

	.case-context-chip-source {
		background: rgba(0, 102, 204, 0.12);
		color: #1d4ed8;
	}

	.glossary-panel {
		margin-top: 0.75rem;
		padding: 0.75rem;
		background: rgba(14, 116, 144, 0.08);
		border: 1px solid rgba(14, 116, 144, 0.18);
		border-radius: 6px;
	}

	.glossary-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #0f5f73;
		margin-bottom: 0.6rem;
	}

	.glossary-header-note {
		font-size: 0.68rem;
		letter-spacing: normal;
		text-transform: none;
		color: #6b7280;
	}

	.glossary-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.glossary-card {
		padding: 0.7rem;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.7);
		border: 1px solid rgba(14, 116, 144, 0.12);
	}

	.glossary-card-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.glossary-term {
		font-size: 0.82rem;
		font-weight: 700;
		color: #0f5f73;
	}

	.glossary-definition {
		margin-top: 0.35rem;
		font-size: 0.78rem;
		line-height: 1.45;
		color: #374151;
	}

	.glossary-save-btn {
		flex-shrink: 0;
		padding: 0.35rem 0.65rem;
		border-radius: 999px;
		border: 1px solid rgba(14, 116, 144, 0.28);
		background: rgba(14, 116, 144, 0.1);
		color: #0f5f73;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		cursor: pointer;
	}

	.glossary-save-btn.saved {
		background: rgba(34, 197, 94, 0.12);
		border-color: rgba(34, 197, 94, 0.28);
		color: #15803d;
	}

	.glossary-save-btn:disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	.glossary-meta-row {
		margin-top: 0.55rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.glossary-chip {
		display: inline-flex;
		align-items: center;
		padding: 0.2rem 0.45rem;
		border-radius: 999px;
		font-size: 0.68rem;
		background: rgba(107, 114, 128, 0.1);
		color: #4b5563;
	}

	.glossary-error {
		margin-top: 0.45rem;
		font-size: 0.72rem;
		color: #b91c1c;
	}

	.streaming-text {
		color: #8b4513;
		font-style: italic;
	}

	.typing-indicator {
		display: flex;
		gap: 0.25rem;
		align-items: center;
	}

	.typing-indicator span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: #8b4513;
		animation: typing 1.4s infinite;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing {
		0%,
		60%,
		100% {
			opacity: 0.5;
			transform: translateY(0);
		}
		30% {
			opacity: 1;
			transform: translateY(-8px);
		}
	}

	.chat-input-area {
		display: flex;
		gap: 0.75rem;
		padding: 1rem;
		background-color: #f5f1e8;
		border-top: 2px solid #d4a574;
		flex-wrap: wrap;
	}

	.chat-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
	}

	.attach-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		background: #f0ebe0;
		border: 1px solid #d4a574;
		cursor: pointer;
	}

	.hidden-file-input {
		display: none;
	}

	.attachment-pill {
		font-size: 0.78rem;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		background: #e8f4f8;
		color: #0f4c81;
		border: 1px solid #9fc3dd;
	}

	.chat-input {
		flex: 1;
		padding: 0.75rem;
		border: 1px solid #d4a574;
		border-radius: 4px;
		font-family: 'Source Sans 3', sans-serif;
		font-size: 0.9rem;
		color: #2c2c2c;
		resize: none;
		max-height: 100px;
	}

	.chat-input:focus {
		outline: none;
		border-color: #8b4513;
		box-shadow: 0 0 0 3px rgba(139, 69, 19, 0.1);
	}

	.chat-input:disabled {
		background-color: #e0d5c7;
		color: #999;
	}

	.send-btn {
		padding: 0.75rem 1rem;
		background-color: #8b4513;
		color: #f5f1e8;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.send-btn:hover:not(:disabled) {
		background-color: #a0522d;
	}

	.send-btn:disabled {
		background-color: #d4a574;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.chat-input-area {
			flex-direction: column;
		}

		.send-btn {
			width: 100%;
		}
	}
</style>
