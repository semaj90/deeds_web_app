<script lang="ts">
	import { onMount } from 'svelte';

	interface TensorRTHealth {
		status: string;
		tensorrt_available?: boolean;
		cuda_available?: boolean;
		gpu_name?: string;
		error?: string;
	}

	// Svelte 5 runes
	let health = $state<TensorRTHealth>({ status: 'checking' });
	let isConnected = $state(false);

	async function checkHealth() {
		try {
			const response = await fetch('/api/tensorrt');
			const data = await response.json();
			health = data;
			isConnected = data.status === 'connected';
		} catch (error) {
			health = {
				status: 'error',
				error: error instanceof Error ? error.message : 'Connection failed'
			};
			isConnected = false;
		}
	}

	onMount(() => {
		checkHealth();
		// Check health every 30 seconds
		const interval = setInterval(checkHealth, 30000);
		return () => clearInterval(interval);
	});
</script>

<div class="tensorrt-status">
	<div class="status-header">
		<h3>🚀 TensorRT-LLM Server</h3>
		<div class="status-indicator" class:connected={isConnected} class:disconnected={!isConnected}>
			{isConnected ? '🟢 Connected' : '🔴 Disconnected'}
		</div>
	</div>

	{#if health}
		<div class="health-details">
			{#if health.status === 'connected'}
				<div class="health-item">
					<span class="label">Status:</span>
					<span class="value success">✅ Healthy</span>
				</div>

				{#if health.cuda_available}
					<div class="health-item">
						<span class="label">CUDA:</span>
						<span class="value success">✅ Available</span>
					</div>
				{/if}

				{#if health.gpu_name}
					<div class="health-item">
						<span class="label">GPU:</span>
						<span class="value">{health.gpu_name}</span>
					</div>
				{/if}

				{#if health.tensorrt_available}
					<div class="health-item">
						<span class="label">TensorRT:</span>
						<span class="value success">✅ Ready</span>
					</div>
				{/if}
			{:else}
				<div class="health-item">
					<span class="label">Status:</span>
					<span class="value error">❌ {health.status}</span>
				</div>

				{#if health.error}
					<div class="health-item">
						<span class="label">Error:</span>
						<span class="value error">{health.error}</span>
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<button onclick={checkHealth} class="refresh-btn">
		🔄 Refresh Status
	</button>
</div>

<style>
	.tensorrt-status {
		background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
		border-radius: 12px;
		padding: 1.5rem;
		color: white;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.status-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.status-header h3 {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 600;
	}

	.status-indicator {
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-size: 0.9rem;
		font-weight: 500;
	}

	.status-indicator.connected {
		background: rgba(34, 197, 94, 0.2);
		border: 1px solid #22c55e;
	}

	.status-indicator.disconnected {
		background: rgba(239, 68, 68, 0.2);
		border: 1px solid #ef4444;
	}

	.health-details {
		display: grid;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.health-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.health-item:last-child {
		border-bottom: none;
	}

	.label {
		font-weight: 500;
		opacity: 0.9;
	}

	.value {
		font-family: 'Monaco', 'Menlo', monospace;
		font-size: 0.9rem;
	}

	.value.success {
		color: #22c55e;
	}

	.value.error {
		color: #ef4444;
	}

	.refresh-btn {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.9rem;
		transition: all 0.2s ease;
		width: 100%;
	}

	.refresh-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: translateY(-1px);
	}
</style>


