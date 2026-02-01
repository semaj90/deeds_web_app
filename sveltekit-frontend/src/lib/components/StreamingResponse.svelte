<script lang="ts">
	let { response = '' } = $props();

	function getDisplayText(): string {
		return response;
	}
</script>

<div class="streaming-response">
	<div class="message assistant">
		<div class="message-header">
			<span class="role-badge">AI Legal Assistant</span>
			<span class="status">Streaming...</span>
		</div>

		<div class="message-content">
			<p>{getDisplayText()}<span class="cursor">▌</span></p>
		</div>

		<div class="loading-indicator">
			<div class="spinner"></div>
			<span>Generating response...</span>
		</div>
	</div>
</div>

<style>
	.streaming-response {
		display: flex;
		flex-direction: column;
	gap: 1rem;
	}

	.message {
		padding: 1rem;
	background: #f0f5f0;
		border: 1px solid #e0ddd8;
		border-radius: 4px;
		border-left: 4px solid #6b8e6b;
	}

	.message-header {
		display: flex;
	gap: 1rem;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.role-badge {
		display: inline-block;
	padding: 0.25rem 0.75rem;
		border-radius: 12px;
	color: white;
		background: #6b8e6b;
		font-size: 0.8rem;
		font-weight: 600;
	}

	.status {
		font-size: 0.8rem;
	color: #6b8e6b;
		margin-left: auto;
		font-weight: 600;
	}

	.message-content {
		font-size: 0.95rem;
		line-height: 1.6;
	color: #2d2d2d;
		margin-bottom: 0.75rem;
		min-height: 2rem;
	}

	.message-content p {
		margin: 0;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.cursor {
		animation: blink 1s infinite;
		margin-left: 2px;
	}

	@keyframes blink {
		0%, 49% {
			opacity: 1;
		}
		50%, 100% {
			opacity: 0;
		}
	}

	.loading-indicator {
		display: flex;
	gap: 0.75rem;
		align-items: center;
		font-size: 0.85rem;
	color: #6b8e6b;
		padding-top: 0.75rem;
		border-top: 1px solid #e0ddd8;
	}

	.spinner {
		width: 16px;
	height: 16px;
		border: 2px solid #e0ddd8;
		border-top-color: #6b8e6b;
		border-radius: 50%;
	animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
