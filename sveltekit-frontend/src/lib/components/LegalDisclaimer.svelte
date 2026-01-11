<script lang="ts">
	let isDismissed = $state(false);

	function handleDismiss() {
		isDismissed = true;
		// Store in localStorage so it doesn't show again this session
		localStorage.setItem('legal-disclaimer-dismissed', 'true');
	}

	// Check if previously dismissed
	if (typeof window !== 'undefined') {
		isDismissed = localStorage.getItem('legal-disclaimer-dismissed') === 'true';
	}
</script>

{#if !isDismissed}
	<div class="disclaimer-stripe">
		<div class="disclaimer-content">
			<div class="disclaimer-icon">⚠️</div>
			<div class="disclaimer-text">
				<strong>Legal Disclaimer:</strong>
				This AI assistant cannot determine guilt or innocence. It provides legal analysis based on evidence and statutes.
				Always verify conclusions with official sources and consult with qualified legal professionals.
			</div>
			<button class="dismiss-btn" onclick={handleDismiss}>✕</button>
		</div>
	</div>
{/if}

<style>
	.disclaimer-stripe {
		background: linear-gradient(135deg, #fee 0%, #fdd 100%);
		border-bottom: 2px solid #c33;
		padding: 1rem 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.disclaimer-content {
		display: flex; gap: 1rem;
		align-items: center;
		max-width: 1400px; width: 100%;
	}

	.disclaimer-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.disclaimer-text {
		flex: 1;
		font-size: 0.9rem; color: #c33;
		line-height: 1.4;
	}

	.disclaimer-text strong {
		color: #933;
	}

	.dismiss-btn {
		background: none; border: none;
		font-size: 1.2rem; color: #c33;
		cursor: pointer; padding: 0;
		width: 24px; height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0; transition: color 0.2s;
	}

	.dismiss-btn:hover {
		color: #933;
	}

	@media (max-width: 768px) {
		.disclaimer-stripe {
			padding: 0.75rem 1rem;
		}

		.disclaimer-content {
			gap: 0.75rem;
		}

		.disclaimer-text {
			font-size: 0.85rem;
		}

		.disclaimer-icon {
			font-size: 1.2rem;
		}
	}
</style>


