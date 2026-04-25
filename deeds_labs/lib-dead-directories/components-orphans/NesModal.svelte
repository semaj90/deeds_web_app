<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	let {
		children,
		header
	}: {
		children?: Snippet,
		header?: Snippet
	} = $props();

	let showModal = $state(false);

	export function open() {
		showModal = true;
	}

	export function close() {
		showModal = false;
	}

	function handleOverlayClick() {
		close();
	}

	function stopPropagation(e: MouseEvent) {
		e.stopPropagation();
	}
</script>

{#if showModal}
	<div
		class="modal-overlay"
		onclick={handleOverlayClick}
		onkeydown={(e) => e.key === 'Escape' && close()}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		transition:fade
	>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="modal-container"
		onclick={stopPropagation}
		onkeydown={(e) => e.stopPropagation()}
		role="document"
		tabindex="-1"
	>
			<div class="modal-header">
				{#if header}
					{@render header()}
				{:else}
					Modal Title
				{/if}
				<button class="close-button" onclick={close} aria-label="Close modal">X</button>
			</div>
			<div class="modal-content">
				{#if children}
					{@render children()}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
	top: 0;
		left: 0;
	width: 100%;
		height: 100%;
	background: rgba(0, 0, 0, 0.7);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
	}

	.modal-container {
		background: #212121;
	border: 4px solid #fff;
		box-shadow: 0 0 0 4px #888, 0 0 0 8px #212121;
		color: #fff;
		font-family: 'Press Start 2P', cursive;
		padding: 1rem;
		max-width: 80%;
	width: 600px;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 4px solid #fff;
		padding-bottom: 1rem;
		margin-bottom: 1rem;
		font-size: 1.5rem;
	}

	.close-button {
		background: none;
	border: none;
		color: #fff;
		font-family: 'Press Start 2P', cursive;
		cursor: pointer;
	}

	.modal-content {
		max-height: 70vh;
		overflow-y: auto;
	}
</style>
