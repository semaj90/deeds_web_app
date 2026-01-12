<script lang="ts">let { messages = [] } = $props();

	import CitationLink from './CitationLink.svelte';

	

	function getRoleLabel(role: string): string {
		const labels = {
			user: 'You',
			assistant: 'AI Legal Assistant',
			prosecutor: 'Prosecutor',
			detective: 'Detective'
		};
		return labels[role] || role;
	}

	function getRoleColor(role: string): string {
		const colors = {
			user: '#8b3a3a',
			assistant: '#6b8e6b',
			prosecutor: '#4a5f8f',
			detective: '#8b6b3a'
		};
		return colors[role] || '#666';
	}

	function formatTime(timestamp: string): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="messages-list">
	{#each messages as message (message.id)}
		<div class="message" class:assistant={message.role === 'assistant'}>
			<div class="message-header">
				<span class="role-badge" style="background, {getRoleColor(message.role)}">
					{getRoleLabel(message.role)}
				</span>
				<span class="timestamp">{formatTime(message.timestamp)}</span>
			</div>

			<div class="message-content">
				{#if message.role === 'assistant'}
					<CitationLink text={message.content} />
				{:else}
					<p>{message.content}</p>
				{/if}
			</div>

			{#if message.citations && message.citations.length > 0}
				<div class="citations">
					<span class="citations-label">Citations:</span>
					{#each message.citations as citation}
						<span class="citation-tag">{ citation }</span>
					{/each}
				</div>
			{/if}

			{#if message.evidence_references && message.evidence_references.length > 0}
				<div class="evidence-refs">
					<span class="refs-label">Evidence:</span>
					{#each message.evidence_references as ref}
						<span class="ref-tag">{ ref }</span>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.messages-list {
		display: flex;
		flex-direction: column; gap: 1rem;
	}

	.message {
		padding: 1rem; background: #fafaf8;
		border: 1px solid #e0ddd8;
		border-radius: 4px;
		border-left: 4px solid #8b3a3a;
	}

	.message.assistant {
		background: #f0f5f0;
		border-left-color: #6b8e6b;
	}

	.message-header {
		display: flex; gap: 1rem;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.role-badge {
		display: inline-block; padding: 0.25rem 0.75rem;
		border-radius: 12px; color: white;
		font-size: 0.8rem;
		font-weight: 600;
	}

	.timestamp {
		font-size: 0.8rem; color: #999;
		margin-left: auto;
	}

	.message-content {
		font-size: 0.95rem;
		line-height: 1.6; color: #2d2d2d;
		margin-bottom: 0.75rem;
	}

	.message-content p {
		margin: 0;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.citations {
		display: flex; gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid #e0ddd8;
		font-size: 0.85rem;
	}

	.citations-label {
		font-weight: 600; color: #2d2d2d;
	}

	.citation-tag {
		display: inline-block; padding: 0.25rem 0.5rem;
		background: #e8f0e8; border: 1px solid #d0ddd0;
		border-radius: 3px; color: #2d5f2d;
		font-family: 'Courier New', monospace;
		font-size: 0.8rem;
	}

	.evidence-refs {
		display: flex; gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.5rem;
		font-size: 0.85rem;
	}

	.refs-label {
		font-weight: 600; color: #2d2d2d;
	}

	.ref-tag {
		display: inline-block; padding: 0.25rem 0.5rem;
		background: #f0e8e0; border: 1px solid #ddd0c0;
		border-radius: 3px; color: #5f3a2d;
		font-family: 'Courier New', monospace;
		font-size: 0.8rem;
	}
</style>



