<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		open?: boolean;
		onclose?: () => void;
	}

	let { open = $bindable(false), onclose }: Props = $props();

	const shortcuts = [
		{ category: 'Navigation', icon: 'compass', items: [
			{ keys: ['Ctrl', '1'], action: 'Dashboard' },
			{ keys: ['Ctrl', '2'], action: 'Cases' },
			{ keys: ['Ctrl', '3'], action: 'Evidence' },
			{ keys: ['Ctrl', '4'], action: 'Search' },
			{ keys: ['Ctrl', '5'], action: 'Terminal' },
			{ keys: ['Escape'], action: 'Close Modal / Panel' },
		]},
		{ category: 'Cases', icon: 'briefcase', items: [
			{ keys: ['Ctrl', 'N'], action: 'New Case' },
			{ keys: ['Ctrl', 'P'], action: 'Print / Export Case' },
		]},
		{ category: 'Evidence', icon: 'file-text', items: [
			{ keys: ['Ctrl', 'U'], action: 'Upload Evidence' },
			{ keys: ['Ctrl', 'E'], action: 'Open Evidence Library' },
			{ keys: ['Ctrl', 'F'], action: 'Search Current Page' },
		]},
		{ category: 'AI / Chat', icon: 'bot', items: [
			{ keys: ['Enter'], action: 'Send Message' },
			{ keys: ['Shift', 'Enter'], action: 'New Line in Chat' },
			{ keys: ['Ctrl', 'L'], action: 'Clear Chat History' },
		]},
		{ category: 'Search', icon: 'search', items: [
			{ keys: ['Ctrl', 'K'], action: 'Open Global Search' },
			{ keys: ['Ctrl', '/'], action: 'Focus Terminal Input' },
			{ keys: ['/'], action: 'Quick Search Focus' },
		]},
		{ category: 'Research', icon: 'flask-conical', items: [
			{ keys: ['Alt', 'D'], action: 'Open Deep Research tab' },
			{ keys: ['Alt', 'T'], action: 'Toggle Task Panel' },
			{ keys: ['Alt', 'R'], action: 'Open Research Playground' },
		]},
		{ category: 'System', icon: 'settings', items: [
			{ keys: ['?'], action: 'Show This Panel' },
			{ keys: ['Ctrl', 'Shift', 'D'], action: 'Toggle Document Writer' },
			{ keys: ['Ctrl', 'Shift', 'G'], action: 'Toggle Analysis Panel' },
			{ keys: ['Ctrl', 'S'], action: 'Save Current Note' },
			{ keys: ['Ctrl', 'Z'], action: 'Undo' },
		]},
	];

	function handleBackdropClick() {
		open = false;
		onclose?.();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			onclose?.();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="shortcut-backdrop"
		onclick={handleBackdropClick}
		role="dialog"
		aria-modal="true"
		aria-label="Keyboard Shortcuts"
	>
		<div class="shortcut-dialog" onclick={(e) => e.stopPropagation()}>
			<!-- Header -->
			<div class="shortcut-header">
				<div class="shortcut-header-left">
					<Icon name="keyboard" size={18} />
					<span class="shortcut-header-title">KEYBOARD SHORTCUTS</span>
				</div>
				<button
					class="shortcut-close"
					onclick={() => { open = false; onclose?.(); }}
				>
					<Icon name="x" size={18} />
				</button>
			</div>

			<!-- Shortcuts Grid -->
			<div class="shortcut-body">
				<div class="shortcut-grid">
					{#each shortcuts as section}
						<div class="shortcut-section">
							<h3 class="section-title">
								<Icon name={section.icon} size={13} />
								{section.category}
							</h3>
							<div class="section-items">
								{#each section.items as shortcut}
									<div class="shortcut-row">
										<span class="shortcut-action">{shortcut.action}</span>
										<div class="shortcut-keys">
											{#each shortcut.keys as key, i}
												{#if i > 0}
													<span class="key-plus">+</span>
												{/if}
												<kbd class="key-badge">{key}</kbd>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Footer -->
			<div class="shortcut-footer">
				Press <kbd class="key-badge-sm">?</kbd> to toggle &middot; <kbd class="key-badge-sm">Esc</kbd> to close
			</div>
		</div>
	</div>
{/if}

<style>
	.shortcut-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
	}

	.shortcut-dialog {
		position: relative;
		width: 640px;
		max-width: 90vw;
		max-height: 80vh;
		background: #1c1917;
		border: 1px solid #44403c;
		border-radius: 8px;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.shortcut-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid #292524;
		color: #34d399;
	}

	.shortcut-header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.shortcut-header-title {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 0.8rem;
		color: #d6d3d1;
		letter-spacing: 0.1em;
	}

	.shortcut-close {
		color: #78716c;
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
	}

	.shortcut-close:hover {
		color: #fff;
	}

	.shortcut-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.25rem;
	}

	.shortcut-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
	}

	.shortcut-section {
		min-width: 0;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: #34d399;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		margin: 0 0 0.625rem 0;
		font-weight: 600;
	}

	.section-items {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.shortcut-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.3rem 0.5rem;
		border-radius: 4px;
	}

	.shortcut-row:hover {
		background: rgba(68, 64, 60, 0.35);
	}

	.shortcut-action {
		font-size: 0.8rem;
		color: #d6d3d1;
	}

	.shortcut-keys {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		flex-shrink: 0;
	}

	.key-plus {
		color: #57534e;
		font-size: 0.65rem;
	}

	.key-badge {
		display: inline-block;
		padding: 0.125rem 0.4rem;
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		background: #292524;
		border: 1px solid #57534e;
		border-radius: 3px;
		color: #d6d3d1;
		min-width: 1.4rem;
		text-align: center;
		line-height: 1.4;
	}

	.shortcut-footer {
		padding: 0.625rem 1.25rem;
		border-top: 1px solid #292524;
		font-size: 0.625rem;
		color: #57534e;
		text-align: center;
	}

	.key-badge-sm {
		display: inline-block;
		padding: 0 0.3rem;
		font-size: 0.6rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		background: #292524;
		border: 1px solid #44403c;
		border-radius: 3px;
		color: #a8a29e;
	}

	@media (max-width: 640px) {
		.shortcut-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
