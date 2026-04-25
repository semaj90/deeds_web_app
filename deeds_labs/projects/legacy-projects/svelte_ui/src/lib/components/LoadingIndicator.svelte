<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	export let isLoading = false;
	export let message = 'Loading...';
	export let progress = 0; // 0-100
	export let showProgress = false;
	export let type: 'spinner' | 'dots' | 'pulse' | 'bars' = 'spinner';
	export let size: 'small' | 'medium' | 'large' = 'medium';
	export let color = '#ff6b6b';

	let dots = '';
	let dotInterval: number;

	// Animate dots for dot type
	$effect(() => {
		if (type === 'dots' && isLoading) {
			if (!dotInterval) {
				dotInterval = setInterval(() => {
					dots = dots.length >= 3 ? '' : dots + '.';
				}, 500);
			}
		} else if (dotInterval) {
			clearInterval(dotInterval);
			dotInterval = 0;
			dots = '';
		}
	});

	onMount(() => {
		return () => {
			if (dotInterval) {
				clearInterval(dotInterval);
			}
		};
	});
</script>

{#if isLoading}
	<div class="loading-indicator" transition:fade={{ duration: 200 }}>
		<div class="loading-container" class:{size}>
			<!-- Spinner -->
			{#if type === 'spinner'}
				<div class="spinner" style="border-color: {color}; border-top-color: transparent;"></div>
			{/if}

			<!-- Dots -->
			{#if type === 'dots'}
				<div class="dots">
					{#each Array(3) as _, i}
						<div
							class="dot"
							class:active={dots.length > i}
							style="background-color: {color};"
						></div>
					{/each}
				</div>
			{/if}

			<!-- Pulse -->
			{#if type === 'pulse'}
				<div class="pulse" style="background-color: {color};"></div>
			{/if}

			<!-- Bars -->
			{#if type === 'bars'}
				<div class="bars">
					{#each Array(5) as _, i}
						<div
							class="bar"
							style="background-color: {color}; animation-delay: {i * 0.1}s;"
						></div>
					{/each}
				</div>
			{/if}

			<!-- Message -->
			<div class="loading-message">
				{message}{dots}
			</div>

			<!-- Progress Bar -->
			{#if showProgress}
				<div class="progress-container">
					<div class="progress-bar">
						<div
							class="progress-fill"
							style="width: {progress}%; background-color: {color};"
						></div>
					</div>
					<div class="progress-text">{progress}%</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.loading-indicator {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		backdrop-filter: blur(2px);
	}

	.loading-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 2rem;
		background: #2a2a2a;
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		min-width: 200px;
	}

	.loading-container.small {
		padding: 1.5rem;
		min-width: 150px;
	}

	.loading-container.large {
		padding: 3rem;
		min-width: 300px;
	}

	/* Spinner */
	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.loading-container.small .spinner {
		width: 30px;
		height: 30px;
		border-width: 3px;
	}

	.loading-container.large .spinner {
		width: 60px;
		height: 60px;
		border-width: 6px;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* Dots */
	.dots {
		display: flex;
		gap: 0.5rem;
	}

	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		opacity: 0.3;
		transition: opacity 0.3s ease;
	}

	.loading-container.small .dot {
		width: 8px;
		height: 8px;
	}

	.loading-container.large .dot {
		width: 16px;
		height: 16px;
	}

	.dot.active {
		opacity: 1;
		animation: dot-pulse 1.5s ease-in-out infinite;
	}

	@keyframes dot-pulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.2); }
	}

	/* Pulse */
	.pulse {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		animation: pulse 1.5s ease-in-out infinite;
	}

	.loading-container.small .pulse {
		width: 30px;
		height: 30px;
	}

	.loading-container.large .pulse {
		width: 60px;
		height: 60px;
	}

	@keyframes pulse {
		0%, 100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.1);
			opacity: 0.7;
		}
	}

	/* Bars */
	.bars {
		display: flex;
		gap: 0.25rem;
		align-items: end;
	}

	.bar {
		width: 6px;
		height: 20px;
		border-radius: 3px;
		animation: bar-wave 1.2s ease-in-out infinite;
	}

	.loading-container.small .bar {
		width: 4px;
		height: 15px;
	}

	.loading-container.large .bar {
		width: 8px;
		height: 30px;
	}

	@keyframes bar-wave {
		0%, 60%, 100% {
			transform: scaleY(1);
		}
		30% {
			transform: scaleY(1.5);
		}
	}

	/* Message */
	.loading-message {
		color: #e0e0e0;
		font-size: 1rem;
		font-weight: 500;
		text-align: center;
		font-family: 'Courier New', monospace;
	}

	.loading-container.small .loading-message {
		font-size: 0.9rem;
	}

	.loading-container.large .loading-message {
		font-size: 1.2rem;
	}

	/* Progress */
	.progress-container {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.progress-bar {
		width: 100%;
		height: 8px;
		background: #444;
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		transition: width 0.3s ease;
		border-radius: 4px;
	}

	.progress-text {
		color: #4ecdc4;
		font-size: 0.9rem;
		font-weight: bold;
		font-family: 'Courier New', monospace;
	}

	/* Noir Detective Theme Overrides */
	.loading-indicator {
		background: rgba(26, 26, 26, 0.95);
	}

	.loading-container {
		background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
		border: 1px solid #444;
	}

	.loading-message {
		color: #ff6b6b;
		text-shadow: 0 0 10px rgba(255, 107, 107, 0.3);
	}

	.progress-text {
		color: #4ecdc4;
		text-shadow: 0 0 10px rgba(78, 205, 196, 0.3);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.loading-container {
			padding: 1.5rem;
			min-width: 180px;
		}

		.loading-container.large {
			padding: 2rem;
			min-width: 250px;
		}
	}
</style>