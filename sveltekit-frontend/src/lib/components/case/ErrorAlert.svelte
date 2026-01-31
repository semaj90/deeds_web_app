<script lang="ts">
	let {
		error = null,
		onDismiss = null,
		onRetry = null
	}: {
		error?: string | null;
		onDismiss?: (() => void) | null;
		onRetry?: (() => void) | null;
	} = $props();

	let localError = $state<string | null>(error);

	$effect(() => {
		localError = error;
	});

	function dismiss() {
		localError = null;
		onDismiss?.();
	}

	function retry() {
		onRetry?.();
	}
</script>

{#if localError}
	<div class="error-alert">
		<div class="error-content">
			<div class="error-icon">⚠️</div>
			<div class="error-message">
				<h4>Error</h4>
				<p>{localError}</p>
			</div>
		</div>
		<div class="error-actions">
			{#if onRetry}
				<button class="btn-retry" onclick={retry}>Retry</button>
			{/if}
			<button class="btn-dismiss" onclick={dismiss}>Dismiss</button>
		</div>
	</div>
{/if}

<style>
	.error-alert {
		background-color: #f8d7da;
		border: 1px solid #f5c6cb;
		border-radius: 4px;
		padding: 1rem;
		margin-bottom: 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.error-content {
		display: flex;
		gap: 1rem;
		flex: 1;
	}

	.error-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.error-message {
		flex: 1;
	}

	.error-message h4 {
		margin: 0 0 0.25rem 0;
		color: #721c24;
		font-size: 1rem;
	}

	.error-message p {
		margin: 0;
		color: #721c24;
		font-size: 0.9rem;
	}

	.error-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.btn-retry,
	.btn-dismiss {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.85rem;
		transition: all 0.2s;
	}

	.btn-retry {
		background-color: #721c24;
		color: white;
	}

	.btn-retry:hover {
		background-color: #5a1419;
	}

	.btn-dismiss {
		background-color: transparent;
		color: #721c24;
		border: 1px solid #721c24;
	}

	.btn-dismiss:hover {
		background-color: #721c24;
		color: white;
	}
</style>
