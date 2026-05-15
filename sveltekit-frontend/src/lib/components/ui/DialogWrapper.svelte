<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open?: boolean;
		title?: string;
		description?: string;
		analyticsLog?: (event: Record<string, unknown>) => void;
		onClose?: () => void;
		children?: Snippet;
	}

	let {
		children,
		open = $bindable(false),
		title = '',
		description = '',
		analyticsLog = () => {},
		onClose = () => {},
	}: Props = $props();

	$effect(() => {
		if (open) {
			analyticsLog({ event: 'dialog_opened', title, timestamp: Date.now() });
		} else {
			analyticsLog({ event: 'dialog_closed', timestamp: Date.now() });
		}
	});

	function handleClose() {
		open = false;
		onClose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" role="presentation" onclick={handleClose}></div>
	<div
		class="modal-content"
		role="dialog"
		aria-modal="true"
		aria-labelledby={title ? 'dialog-title' : undefined}
		aria-describedby={description ? 'dialog-desc' : undefined}
	>
		{#if title}
			<h2 id="dialog-title" class="modal-title">{title}</h2>
		{/if}
		{#if description}
			<p id="dialog-desc" class="modal-description">{description}</p>
		{/if}
		<div class="modal-body">
			{#if children}
				{@render children()}
			{/if}
		</div>
		<button class="modal-close" type="button" onclick={handleClose} aria-label="Close dialog">
			&times;
		</button>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 40;
	}

	.modal-content {
		position: fixed;
		left: 50%;
		top: 50%;
		z-index: 50;
		width: 100%;
		max-width: 28rem;
		transform: translate(-50%, -50%);
		background: var(--nier-surface, #0f172a);
		border: 1px solid var(--nier-border, #334155);
		border-radius: 0.5rem;
		padding: 1.5rem;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
	}

	.modal-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--nier-accent, #38bdf8);
		margin-bottom: 0.5rem;
	}

	.modal-description {
		color: var(--nier-text-muted, #cbd5e1);
		margin-bottom: 1rem;
	}

	.modal-close {
		position: absolute;
		top: 1rem;
		right: 1rem;
		width: 2rem;
		height: 2rem;
		border-radius: 9999px;
		background: var(--nier-surface-light, #1f2937);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--nier-text-muted, #94a3b8);
		cursor: pointer;
		transition: background-color 0.15s ease, color 0.15s ease;
	}

	.modal-close:hover {
		background: var(--nier-surface-lighter, #374151);
		color: var(--nier-white, #ffffff);
	}
</style>
