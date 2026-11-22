<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog } from 'bits-ui';

	let {
		open = $bindable(false),
		title,
		description = '',
		children,
		footer
	}: {
		open?: boolean;
		title: string;
		description?: string;
		children?: Snippet;
		footer?: Snippet;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="dossier-brutal-backdrop" />
		<Dialog.Content class="dossier-brutal-modal" data-testid="dossier-brutal-modal">
			<header class="dossier-brutal-header">
				<Dialog.Title class="dossier-brutal-title">{title}</Dialog.Title>
				<Dialog.Close class="dossier-brutal-close" aria-label="Close">×</Dialog.Close>
			</header>
			{#if description}
				<Dialog.Description class="dossier-brutal-description">{description}</Dialog.Description>
			{/if}
			<div class="dossier-brutal-body">
				{@render children?.()}
			</div>
			{#if footer}
				<footer class="dossier-brutal-footer">
					{@render footer()}
				</footer>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* Thin dossier hairline frame with a hard neo-brutal offset shadow, on dossier cream. */
	:global(.dossier-brutal-backdrop) {
		position: fixed;
		inset: 0;
		z-index: 9990;
		background: rgba(22, 20, 18, 0.55);
	}

	:global(.dossier-brutal-modal) {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 9991;
		width: min(34rem, 92vw);
		max-height: 85vh;
		overflow: auto;
		padding: 1.1rem 1.25rem 1.2rem;
		background: #FAF6F0;
		color: #141312;
		border: 1px solid #D5C6AC;
		border-radius: 10px;
		box-shadow: 6px 6px 0 #161412;
		font-family: 'Inter', system-ui, sans-serif;
	}

	:global(.dossier-brutal-modal:focus-visible) {
		outline: 2px solid #C9A86A;
		outline-offset: 3px;
	}

	.dossier-brutal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding-bottom: 0.6rem;
		border-bottom: 1px solid #E2D7C9;
	}

	:global(.dossier-brutal-title) {
		margin: 0;
		font-family: 'Georgia', 'Times New Roman', serif;
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		color: #141312;
	}

	:global(.dossier-brutal-close) {
		all: unset;
		cursor: pointer;
		width: 1.9rem;
		height: 1.9rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid #141312;
		border-radius: 6px;
		background: #FFFCF9;
		box-shadow: 2px 2px 0 #141312;
		font-size: 1rem;
		line-height: 1;
	}

	:global(.dossier-brutal-close:hover) {
		background: #67140F;
		color: #FAF4EC;
	}

	:global(.dossier-brutal-close:focus-visible) {
		outline: 2px solid #C9A86A;
		outline-offset: 2px;
	}

	:global(.dossier-brutal-description) {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
		color: #6B6150;
	}

	.dossier-brutal-body {
		margin-top: 0.8rem;
		font-size: 0.92rem;
		line-height: 1.5;
	}

	.dossier-brutal-footer {
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid #E2D7C9;
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.dossier-brutal-modal) {
			transition: none;
		}
	}
</style>
