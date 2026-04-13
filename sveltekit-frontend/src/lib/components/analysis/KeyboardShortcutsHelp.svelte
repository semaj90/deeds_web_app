<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		open?: boolean;
		type: 'audio' | 'video' | 'document';
		onClose?: () => void;
	}

	let { open = $bindable(false), type, onClose }: Props = $props();

	const shortcuts = {
		audio: [
			{ key: 'ESC', description: 'Close editor' },
			{ key: '1-4', description: 'Switch tabs' },
			{ key: 'Space', description: 'Play/Pause audio' },
			{ key: 'Ctrl+E', description: 'Export to JSON' },
			{ key: '?', description: 'Toggle this help' }
		],
		video: [
			{ key: 'ESC', description: 'Close editor' },
			{ key: '1-5', description: 'Switch tabs' },
			{ key: '← →', description: 'Navigate frames (in Frames tab)' },
			{ key: 'Ctrl+E', description: 'Export to JSON' },
			{ key: '?', description: 'Toggle this help' }
		],
		document: [
			{ key: 'ESC', description: 'Clear search / Close editor' },
			{ key: '1-4', description: 'Switch sidebar panels' },
			{ key: 'Ctrl+F', description: 'Focus search' },
			{ key: 'Ctrl+B', description: 'Toggle sidebar' },
			{ key: 'Ctrl +/-', description: 'Adjust font size' },
			{ key: 'Ctrl+E', description: 'Export to JSON' },
			{ key: '?', description: 'Toggle this help' }
		]
	};

	function handleClose() {
		open = false;
		onClose?.();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	}
</script>

{#if open}
	<div class="help-overlay" onclick={handleBackdropClick} role="presentation">
		<div class="help-panel" role="dialog" aria-labelledby="help-title">
			<div class="help-header">
				<h2 id="help-title">
					<Icon name="keyboard" />
					Keyboard Shortcuts
				</h2>
				<button type="button" class="close-btn" onclick={handleClose} aria-label="Close help">
					<Icon name="x" />
				</button>
			</div>

			<div class="help-content">
				<div class="shortcuts-list">
					{#each shortcuts[type] as shortcut}
						<div class="shortcut-item">
							<kbd class="shortcut-key">{shortcut.key}</kbd>
							<span class="shortcut-desc">{shortcut.description}</span>
						</div>
					{/each}
				</div>

				<div class="help-footer">
					<p class="help-tip">
						<Icon name="lightbulb" />
						<span>Press <kbd>?</kbd> anytime to toggle this panel</span>
					</p>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.help-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.help-panel {
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.75rem;
		width: 90%;
		max-width: 500px;
		max-height: 80vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		animation: slideIn 0.3s cubic-bezier(0.22, 1, 0.36, 1);
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: scale(0.95) translateY(20px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.help-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid var(--t-border);
	}

	.help-header h2 {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
		color: var(--t-text);
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 0.375rem;
		background: transparent;
		border: none;
		color: var(--t-text-secondary);
		cursor: pointer;
		transition: all 0.2s;
	}

	.close-btn:hover {
		background: var(--t-bg);
		color: var(--t-text);
	}

	.help-content {
		padding: 1.5rem;
		overflow-y: auto;
	}

	.shortcuts-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.shortcut-item {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0.75rem 1rem;
		background: var(--t-bg);
		border-radius: 0.5rem;
		border: 1px solid var(--t-border);
	}

	.shortcut-key {
		display: inline-block;
		min-width: 80px;
		padding: 0.375rem 0.75rem;
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.375rem;
		font-family: monospace;
		font-size: 0.875rem;
		font-weight: 600;
		text-align: center;
		color: var(--t-accent);
		box-shadow: 0 2px 0 var(--t-border);
	}

	.shortcut-desc {
		flex: 1;
		font-size: 0.9375rem;
		color: var(--t-text-secondary);
	}

	.help-footer {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--t-border);
	}

	.help-tip {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.875rem;
		color: var(--t-text-secondary);
		margin: 0;
	}

	.help-tip kbd {
		padding: 0.25rem 0.5rem;
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.25rem;
		font-family: monospace;
		font-size: 0.75rem;
		font-weight: 600;
	}
</style>
